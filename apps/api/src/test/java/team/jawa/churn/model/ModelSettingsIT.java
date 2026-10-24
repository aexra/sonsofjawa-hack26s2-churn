package team.jawa.churn.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import team.jawa.churn.IntegrationTest;
import team.jawa.churn.recalc.RecalcEvents;
import team.jawa.churn.recalc.RecalcScheduler;
import team.jawa.churn.recalc.RecalcSupport;

class ModelSettingsIT extends IntegrationTest {

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    DataSource dataSource;

    @Autowired
    RecalcScheduler scheduler;

    @BeforeEach
    @AfterEach
    void reset() {
        await().atMost(Duration.ofSeconds(10)).until(() -> !scheduler.isRunning());
        RecalcSupport.reset(jdbc);
        jdbc.update("update model_settings set value = default_value");
    }

    private Client login(String login, String password) throws Exception {
        Client client = client();
        assertThat(client.post(
                                "/api/v1/auth/login",
                                "{\"login\":\"" + login + "\",\"password\":\"" + password + "\"}",
                                false)
                        .statusCode())
                .isEqualTo(200);
        assertThat(client.get("/api/v1/auth/me").statusCode()).isEqualTo(200);
        return client;
    }

    private Client admin() throws Exception {
        return login("admin", "admin12345");
    }

    private HttpResponse<String> patch(Client client, String body) throws Exception {
        return client.exchange("PATCH", "/api/v1/model/settings", body, Map.of(), true);
    }

    private long version() {
        return jdbc.queryForObject("select max(version) from model_revisions", Long.class);
    }

    @Test
    void theSettingsAreGroupedInDisplayOrderWithWeightShares() throws Exception {
        HttpResponse<String> response = login("analyst", "analyst12345").get("/api/v1/model/settings");

        assertThat(response.statusCode()).isEqualTo(200);
        String body = response.body();
        assertThat(body.indexOf("\"key\":\"weights\"")).isLessThan(body.indexOf("\"key\":\"levels\""));
        assertThat(body.indexOf("\"key\":\"levels\"")).isLessThan(body.indexOf("\"key\":\"horizon\""));
        assertThat(body.indexOf("\"key\":\"horizon\"")).isLessThan(body.indexOf("\"key\":\"quality\""));
        assertThat(body)
                .contains("\"key\":\"weight_prolong_wait\"")
                .contains("\"share\":0.3")
                .contains("\"modelVersion\":" + version())
                .contains("\"mode\":\"real\"")
                .contains("\"reasonTemplate\":")
                .contains("\"key\":\"payment_failures\"");
        assertThat(body.indexOf("weight_renewal_unsecured")).isLessThan(body.indexOf("weight_insufficient_funds"));
    }

    @Test
    void anonymousReadsAreRejectedAndAnalystsCannotChange() throws Exception {
        assertThat(client().get("/api/v1/model/settings").statusCode()).isEqualTo(401);
        assertThat(client().get("/api/v1/model/revisions").statusCode()).isEqualTo(401);

        HttpResponse<String> response =
                patch(login("analyst", "analyst12345"), "{\"values\":{\"weight_prolong_wait\":40}}");

        assertThat(response.statusCode()).isEqualTo(403);
        assertThat(jdbc.queryForObject(
                        "select value from model_settings where key = 'weight_prolong_wait'", Integer.class))
                .isEqualTo(30);
    }

    @Test
    void aWeightChangeCreatesARevisionWithAuthorAndDiffAndRecalculates() throws Exception {
        RecalcSupport.freezeClock(jdbc);
        RecalcSupport.loadReferenceData(jdbc);
        await().atMost(Duration.ofSeconds(10)).until(() -> !scheduler.isRunning());
        long before = version();
        Client admin = admin();
        try (RecalcEvents events = new RecalcEvents(dataSource)) {
            HttpResponse<String> response = patch(admin, "{\"values\":{\"weight_prolong_wait\":40}}");

            assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
            assertThat(response.body())
                    .contains("\"modelVersion\":" + (before + 1))
                    .contains("\"updatedBy\":\"admin\"")
                    .containsPattern("\"recalc\":\\{\"state\":\"(scheduled|coalesced)\"")
                    .containsPattern("\"key\":\"weight_prolong_wait\",\"value\":40")
                    .contains("\"share\":0.3636");
            await().atMost(Duration.ofSeconds(20))
                    .until(() -> jdbc.queryForObject(
                                    "select count(*) from scores where is_current and model_version = ?",
                                    Integer.class,
                                    before + 1)
                            == 10);
            assertThat(events.collect(700).stream()
                            .anyMatch(event -> event.contains("\"type\":\"model.updated\"")
                                    && event.contains("\"modelVersion\":" + (before + 1))
                                    && event.contains("\"source\":\"settings\"")))
                    .isTrue();
        }
        assertThat(jdbc.queryForList(
                        "select risk_score::text from scores where is_current and status = 'scored' order by account_id",
                        String.class))
                .containsExactly("22.71", "21.21", "80.43", "17.44", "51.17", "59.09");
        assertThat(jdbc.queryForObject("select sum(expected_loss) from scores where is_current", Long.class))
                .isEqualTo(662652L);

        HttpResponse<String> revisions = admin.get("/api/v1/model/revisions?limit=1");
        assertThat(revisions.body())
                .contains("\"version\":" + (before + 1))
                .contains("\"changedBy\":\"admin\"")
                .contains("\"source\":\"settings\"")
                .contains("\"key\":\"weight_prolong_wait\"")
                .contains("\"to\":40");
    }

    @Test
    void revisionsAreListedNewestFirstWithinTheLimit() throws Exception {
        Client admin = admin();
        patch(admin, "{\"values\":{\"weight_prolong_wait\":41}}");
        patch(admin, "{\"values\":{\"weight_prolong_wait\":42}}");

        String body = admin.get("/api/v1/model/revisions?limit=2").body();

        assertThat(body.split("\"version\"").length - 1).isEqualTo(2);
        assertThat(body.indexOf("\"to\":42")).isLessThan(body.indexOf("\"to\":41"));
        assertThat(admin.get("/api/v1/model/revisions?limit=500").statusCode()).isEqualTo(400);
    }

    @Test
    void anEmptyChangeKeepsTheVersion() throws Exception {
        long before = version();

        HttpResponse<String> response = patch(admin(), "{}");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(version()).isEqualTo(before);
        assertThat(response.body()).contains("\"modelVersion\":" + before);
    }

    @Test
    void unknownKeysAreABadRequest() throws Exception {
        long before = version();

        HttpResponse<String> response = patch(admin(), "{\"values\":{\"weight_nope\":1,\"weight_prolong_wait\":40}}");

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).contains("\"code\":\"invalid_field\"").contains("weight_nope");
        assertThat(version()).isEqualTo(before);
    }

    @Test
    void invalidValuesAreRejectedWithFieldErrorsAndNothingIsSaved() throws Exception {
        long before = version();
        Client admin = admin();

        HttpResponse<String> range = patch(admin, "{\"values\":{\"weight_prolong_wait\":500}}");
        HttpResponse<String> levels = patch(admin, "{\"values\":{\"level_medium\":60}}");
        HttpResponse<String> whole = patch(admin, "{\"values\":{\"min_transactions\":1.5}}");
        HttpResponse<String> lookback =
                patch(admin, "{\"values\":{\"payment_overdue_hours\":720,\"payment_lookback_days\":2}}");
        HttpResponse<String> zeroWeights = patch(
                admin,
                "{\"values\":{\"weight_renewal_unsecured\":0,\"weight_insufficient_funds\":0,\"weight_prolong_wait\":0,"
                        + "\"weight_suspended_share\":0,\"weight_termination_history\":0,\"weight_payment_failures\":0}}");

        assertThat(range.statusCode()).isEqualTo(422);
        assertThat(range.body())
                .contains("\"code\":\"validation_failed\"")
                .contains("\"field\":\"values.weight_prolong_wait\"")
                .contains("\"code\":\"out_of_range\"");
        assertThat(levels.statusCode()).isEqualTo(422);
        assertThat(levels.body()).contains("\"field\":\"values.level_medium\"").contains("must_be_below_high");
        assertThat(whole.statusCode()).isEqualTo(422);
        assertThat(whole.body()).contains("\"code\":\"not_integer\"");
        assertThat(lookback.statusCode()).isEqualTo(422);
        assertThat(lookback.body()).contains("must_be_below_lookback");
        assertThat(zeroWeights.statusCode()).isEqualTo(422);
        assertThat(zeroWeights.body()).contains("weights_sum_not_positive");
        assertThat(version()).isEqualTo(before);
    }

    @Test
    void relatedThresholdsCanBeChangedTogether() throws Exception {
        long before = version();

        HttpResponse<String> response = patch(admin(), "{\"values\":{\"level_medium\":60,\"level_high\":80}}");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(version()).isEqualTo(before + 1);
    }

    @Test
    void theClockCanBeFrozenShiftedAndReleased() throws Exception {
        Client admin = admin();

        HttpResponse<String> frozen =
                patch(admin, "{\"clock\":{\"mode\":\"frozen\",\"asOf\":\"2026-10-19T15:00:00Z\"}}");
        assertThat(frozen.statusCode()).as(frozen.body()).isEqualTo(200);
        assertThat(frozen.body())
                .contains("\"mode\":\"frozen\"")
                .contains("\"asOf\":\"2026-10-19T15:00:00Z\"")
                .contains("\"updatedBy\":\"admin\"");
        assertThat(jdbc.queryForObject("select model_now() = '2026-10-19T15:00:00Z'::timestamptz", Boolean.class))
                .isTrue();

        HttpResponse<String> shifted =
                patch(admin, "{\"clock\":{\"mode\":\"shifted\",\"asOf\":\"2026-10-19T15:00:00Z\"}}");
        assertThat(shifted.statusCode()).isEqualTo(200);
        assertThat(shifted.body()).contains("\"mode\":\"shifted\"").contains("\"frozenAt\":null");
        Instant modelNow = jdbc.queryForObject("select model_now()", java.sql.Timestamp.class)
                .toInstant();
        assertThat(Duration.between(Instant.parse("2026-10-19T15:00:00Z"), modelNow)
                        .abs())
                .isLessThan(Duration.ofSeconds(30));

        HttpResponse<String> real = patch(admin, "{\"clock\":{\"mode\":\"real\"}}");
        assertThat(real.statusCode()).isEqualTo(200);
        assertThat(real.body()).contains("\"mode\":\"real\"").contains("\"shiftSeconds\":0");

        assertThat(jdbc.queryForList("select source from model_revisions order by version desc limit 3", String.class))
                .containsExactly("clock", "clock", "clock");
    }

    @Test
    void aFrozenOrShiftedClockNeedsAMoment() throws Exception {
        long before = version();

        HttpResponse<String> response = patch(admin(), "{\"clock\":{\"mode\":\"frozen\"}}");

        assertThat(response.statusCode()).isEqualTo(422);
        assertThat(response.body()).contains("\"field\":\"clock.asOf\"").contains("\"code\":\"required\"");
        assertThat(version()).isEqualTo(before);
    }

    @Test
    void valuesAndClockCanChangeInOneRequestAndAFailureRollsBothBack() throws Exception {
        Client admin = admin();
        long before = version();

        HttpResponse<String> failed =
                patch(admin, "{\"values\":{\"weight_prolong_wait\":40},\"clock\":{\"mode\":\"shifted\"}}");

        assertThat(failed.statusCode()).isEqualTo(422);
        assertThat(version()).isEqualTo(before);
        assertThat(jdbc.queryForObject(
                        "select value from model_settings where key = 'weight_prolong_wait'", Integer.class))
                .isEqualTo(30);

        HttpResponse<String> ok = patch(
                admin,
                "{\"values\":{\"weight_prolong_wait\":40},\"clock\":{\"mode\":\"frozen\",\"asOf\":\"2026-10-19T15:00:00Z\"}}");

        assertThat(ok.statusCode()).isEqualTo(200);
        assertThat(version()).isGreaterThan(before);
        assertThat(jdbc.queryForObject(
                        "select value from model_settings where key = 'weight_prolong_wait'", Integer.class))
                .isEqualTo(40);
    }
}

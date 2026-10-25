package team.jawa.churn.analytics;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.net.http.HttpResponse;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import team.jawa.churn.IntegrationTest;
import team.jawa.churn.recalc.RecalcService;
import team.jawa.churn.recalc.RecalcSupport;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class AnalyticsIT extends IntegrationTest {

    private static final String TODAY = "2026-10-19";

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    DataSource dataSource;

    @Autowired
    RecalcService recalc;

    @Autowired
    SummaryCache cache;

    @Autowired
    JsonMapper json;

    @BeforeEach
    @AfterEach
    void reset() {
        RecalcSupport.reset(jdbc);
    }

    private void loadAndRecalculate() throws Exception {
        RecalcSupport.freezeClock(jdbc);
        RecalcSupport.loadReferenceData(jdbc);
        assertThat(recalc.run("manual").result()).isEqualTo(RecalcService.Result.OK);
    }

    private Client analyst() throws Exception {
        Client client = client();
        assertThat(client.post("/api/v1/auth/login", "{\"login\":\"analyst\",\"password\":\"analyst12345\"}", false)
                        .statusCode())
                .isEqualTo(200);
        return client;
    }

    private JsonNode read(Client client, String path) throws Exception {
        HttpResponse<String> response = client.get(path);
        assertThat(response.statusCode()).isEqualTo(200);
        return json.readTree(response.body());
    }

    @Test
    void theSummaryMatchesTheReferenceDataset() throws Exception {
        loadAndRecalculate();

        JsonNode summary = read(analyst(), "/api/v1/analytics/summary");

        assertThat(OffsetDateTime.parse(summary.get("asOf").asString()).toInstant())
                .isEqualTo(Instant.parse(RecalcSupport.AS_OF));
        assertThat(summary.get("horizonDays").asInt()).isEqualTo(30);
        assertThat(summary.get("currency").asString()).isEqualTo("EUR");
        assertThat(summary.get("modelVersion").asLong())
                .isEqualTo(jdbc.queryForObject("select max(version) from model_revisions", Long.class));
        JsonNode accounts = summary.get("accounts");
        assertThat(accounts.get("total").asInt()).isEqualTo(10);
        assertThat(accounts.get("scored").asInt()).isEqualTo(6);
        assertThat(accounts.get("high").asInt()).isEqualTo(3);
        assertThat(accounts.get("medium").asInt()).isEqualTo(1);
        assertThat(accounts.get("low").asInt()).isEqualTo(2);
        assertThat(accounts.get("noScore").asInt()).isEqualTo(4);
        assertThat(accounts.get("pending").asInt()).isZero();
        JsonNode money = summary.get("money");
        assertThat(money.get("expectedLoss").asLong()).isEqualTo(15091L);
        assertThat(money.get("revenueHorizon").asLong()).isEqualTo(77489L);
        assertThat(money.get("revenueAtRisk").asLong()).isEqualTo(4904L);
        assertThat(money.get("securedAmount").asLong())
                .isEqualTo(jdbc.queryForObject("select sum(secured_amount) from scores", Long.class));
        assertThat(summary.get("avgRiskScore").decimalValue()).isEqualByComparingTo("45.91");
        assertThat(summary.get("servicesAtRisk").asInt()).isEqualTo(12);
        assertThat(summary.get("calculatedAt").isString()).isTrue();
        assertThat(summary.get("lastRecalc").get("status").asString()).isEqualTo("ok");
        assertThat(summary.get("lastRecalc").get("accountsProcessed").asInt()).isEqualTo(10);
    }

    @Test
    void theHistogramHasTenBucketsAndTheReasonsCountTheTopFeature() throws Exception {
        loadAndRecalculate();

        JsonNode summary = read(analyst(), "/api/v1/analytics/summary");

        List<Integer> counts = new ArrayList<>();
        int from = 0;
        for (JsonNode bucket : summary.get("scoreHistogram")) {
            assertThat(bucket.get("from").asInt()).isEqualTo(from);
            assertThat(bucket.get("to").asInt()).isEqualTo(from + 10);
            counts.add(bucket.get("count").asInt());
            from += 10;
        }
        assertThat(counts).containsExactly(0, 2, 1, 0, 0, 0, 2, 0, 1, 0);
        JsonNode reasons = summary.get("topReasons");
        assertThat(reasons).hasSize(3);
        assertThat(reasons.get(0).get("key").asString()).isEqualTo("prolong_wait");
        assertThat(reasons.get(0).get("title").asString())
                .isEqualTo(jdbc.queryForObject(
                        "select title from model_features where key = 'prolong_wait'", String.class));
        assertThat(reasons.get(0).get("customers").asInt()).isEqualTo(3);
        assertThat(reasons.get(0).get("contributionSum").decimalValue()).isEqualByComparingTo("199.97");
        assertThat(reasons.get(1).get("key").asString()).isEqualTo("renewal_unsecured");
        assertThat(reasons.get(1).get("customers").asInt()).isEqualTo(2);
        assertThat(reasons.get(1).get("contributionSum").decimalValue()).isEqualByComparingTo("26.27");
    }

    @Test
    void accountsWithoutScoresAreCountedAsPending() throws Exception {
        RecalcSupport.freezeClock(jdbc);
        RecalcSupport.loadReferenceData(jdbc);

        JsonNode summary = read(analyst(), "/api/v1/analytics/summary");

        assertThat(summary.get("accounts").get("total").asInt()).isEqualTo(10);
        assertThat(summary.get("accounts").get("pending").asInt()).isEqualTo(10);
        assertThat(summary.get("accounts").get("scored").asInt()).isZero();
        assertThat(summary.get("money").get("expectedLoss").asLong()).isZero();
        assertThat(summary.get("avgRiskScore").isNull()).isTrue();
        assertThat(summary.get("lastRecalc").isNull()).isTrue();
    }

    @Test
    void theCacheIsReusedUntilARecalculationFinishes() throws Exception {
        loadAndRecalculate();
        Summary first = cache.get();

        assertThat(cache.get()).isSameAs(first);

        jdbc.update("update services set status = 'deleted' where \"ownerId\" = 5");
        assertThat(recalc.run("manual").result()).isEqualTo(RecalcService.Result.OK);

        Summary second = cache.get();
        assertThat(second).isNotSameAs(first);
        assertThat(second.money().expectedLoss()).isLessThan(first.money().expectedLoss());
        assertThat(second.lastRecalc().id()).isGreaterThan(first.lastRecalc().id());
        assertThat(cache.get()).isSameAs(second);
    }

    @Test
    void theCacheRefreshesWhenAnAlreadyVisibleRunFinishes() throws Exception {
        loadAndRecalculate();
        jdbc.update("update services set status = 'deleted' where \"ownerId\" = 5");
        long runId = jdbc.queryForObject(
                "INSERT INTO recalc_runs (trigger, started_at, as_of, status)"
                        + " VALUES ('manual', now(), public.model_now(), 'running') RETURNING id",
                Long.class);
        Summary running = cache.get();
        assertThat(running.lastRecalc().id()).isEqualTo(runId);
        assertThat(running.lastRecalc().status()).isEqualTo("running");

        try (Connection connection = dataSource.getConnection();
                Statement statement = connection.createStatement();
                PreparedStatement call =
                        connection.prepareStatement("SELECT * FROM public.recalculate_risk('manual', ?)")) {
            connection.setAutoCommit(false);
            statement.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
            call.setLong(1, runId);
            call.executeQuery();
            connection.commit();
        }

        Summary finished = cache.get();
        assertThat(finished).isNotSameAs(running);
        assertThat(finished.lastRecalc().id()).isEqualTo(runId);
        assertThat(finished.lastRecalc().status()).isEqualTo("ok");
        assertThat(finished.money().expectedLoss()).isLessThan(running.money().expectedLoss());
    }

    @Test
    void theCacheSeesAccountsThatAwaitACalculation() throws Exception {
        loadAndRecalculate();
        assertThat(cache.get().accounts().pending()).isZero();

        jdbc.update("insert into accounts select (jsonb_populate_record(null::accounts,"
                + " to_jsonb(a) || '{\"id\": 999, \"email\": \"new@example.test\"}'::jsonb)).*"
                + " from accounts a where a.id = 1");

        assertThat(cache.get().accounts().total()).isEqualTo(11);
        assertThat(cache.get().accounts().pending()).isEqualTo(1);
    }

    @Test
    void theChartCoversEveryDayFromThePastToTheHorizon() throws Exception {
        loadAndRecalculate();

        JsonNode chart = read(analyst(), "/api/v1/analytics/churn-chart");

        assertThat(chart.get("horizonDays").asInt()).isEqualTo(30);
        JsonNode points = chart.get("points");
        assertThat(points).hasSize(121);
        LocalDate day = LocalDate.parse(TODAY).minusDays(90);
        for (int i = 0; i < points.size(); i++) {
            JsonNode point = points.get(i);
            assertThat(LocalDate.parse(point.get("date").asString())).isEqualTo(day.plusDays(i));
            assertThat(point.get("kind").asString()).isEqualTo(i < 90 ? "fact" : i == 90 ? "today" : "forecast");
        }
    }

    @Test
    void theChartSeparatesObservedFromEstimatedDeletions() throws Exception {
        loadAndRecalculate();

        JsonNode points = read(analyst(), "/api/v1/analytics/churn-chart").get("points");

        int observed = 0;
        int estimated = 0;
        for (JsonNode point : points) {
            if (point.get("kind").asString().equals("forecast")) {
                assertThat(point.get("deletions").isNull()).isTrue();
                continue;
            }
            observed += point.get("deletions").asInt();
            estimated += point.get("deletionsEstimated").asInt();
            if (point.get("date").asString().equals("2026-09-19")) {
                assertThat(point.get("deletionsEstimated").asInt()).isEqualTo(1);
            }
        }
        assertThat(observed).isZero();
        assertThat(estimated).isEqualTo(1);
    }

    @Test
    void theChartForecastMatchesTheForecastView() throws Exception {
        loadAndRecalculate();

        JsonNode points = read(analyst(), "/api/v1/analytics/churn-chart").get("points");

        BigDecimal nonRenewals = BigDecimal.ZERO;
        long loss = 0;
        int forecastDays = 0;
        for (JsonNode point : points) {
            if (point.get("kind").asString().equals("fact")) {
                assertThat(point.get("expectedNonRenewals").isNull()).isTrue();
                assertThat(point.get("expectedLossAmount").isNull()).isTrue();
                continue;
            }
            nonRenewals = nonRenewals.add(point.get("expectedNonRenewals").decimalValue());
            loss += point.get("expectedLossAmount").asLong();
            forecastDays++;
        }
        assertThat(forecastDays).isEqualTo(31);
        assertThat(nonRenewals).isEqualByComparingTo("1.3756");
        assertThat(nonRenewals)
                .isEqualByComparingTo(
                        jdbc.queryForObject("select sum(risk_weight) from churn_forecast_vw", BigDecimal.class));
        assertThat(jdbc.queryForObject("select count(*) from churn_forecast_vw", Integer.class))
                .isEqualTo(4);
        long expectedLoss = jdbc.queryForObject(
                "select round(sum(risk_weight * price * 30 / term_days(payment_term))) from churn_forecast_vw",
                Long.class);
        assertThat(loss).isBetween(expectedLoss - 11, expectedLoss + 11);
    }

    @Test
    void theChartShowsTheLastSnapshotOfTheDayAsServicesAtRisk() throws Exception {
        loadAndRecalculate();

        JsonNode points = read(analyst(), "/api/v1/analytics/churn-chart").get("points");

        for (JsonNode point : points) {
            if (point.get("kind").asString().equals("today")) {
                assertThat(point.get("servicesAtRisk").asInt()).isEqualTo(12);
            } else {
                assertThat(point.get("servicesAtRisk").isNull()).isTrue();
            }
        }
    }

    @Test
    void theChartWindowFollowsTheParameters() throws Exception {
        loadAndRecalculate();

        JsonNode points = read(analyst(), "/api/v1/analytics/churn-chart?pastDays=30&futureDays=5")
                .get("points");

        assertThat(points).hasSize(36);
        assertThat(points.get(0).get("date").asString()).isEqualTo("2026-09-19");
        assertThat(points.get(0).get("deletionsEstimated").asInt()).isEqualTo(1);
        assertThat(points.get(35).get("date").asString()).isEqualTo("2026-10-24");
        assertThat(points.get(35).get("kind").asString()).isEqualTo("forecast");
    }

    @Test
    void theChartRejectsWindowsOutsideTheContract() throws Exception {
        Client analyst = analyst();

        assertThat(analyst.get("/api/v1/analytics/churn-chart?pastDays=0").statusCode())
                .isEqualTo(400);
        assertThat(analyst.get("/api/v1/analytics/churn-chart?futureDays=366").statusCode())
                .isEqualTo(400);
    }

    @Test
    void anonymousCallersAreRejected() throws Exception {
        assertThat(client().get("/api/v1/analytics/summary").statusCode()).isEqualTo(401);
        assertThat(client().get("/api/v1/analytics/churn-chart").statusCode()).isEqualTo(401);
    }
}

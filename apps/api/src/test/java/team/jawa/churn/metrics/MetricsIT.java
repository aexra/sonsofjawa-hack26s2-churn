package team.jawa.churn.metrics;

import static org.assertj.core.api.Assertions.assertThat;

import io.micrometer.core.instrument.MeterRegistry;
import java.util.Base64;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import team.jawa.churn.IntegrationTest;
import team.jawa.churn.analytics.Summary;
import team.jawa.churn.analytics.SummaryCache;
import team.jawa.churn.recalc.RecalcService;
import team.jawa.churn.recalc.RecalcSupport;
import tools.jackson.databind.json.JsonMapper;

class MetricsIT extends IntegrationTest {

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    RecalcService recalc;

    @Autowired
    SummaryCache summaries;

    @Autowired
    MeterRegistry meters;

    @Autowired
    JsonMapper json;

    @BeforeEach
    @AfterEach
    void reset() {
        RecalcSupport.reset(jdbc);
    }

    @Test
    void metricsMatchTheReferenceSummaryAndRefreshAfterRecalculation() throws Exception {
        RecalcSupport.freezeClock(jdbc);
        RecalcSupport.loadReferenceData(jdbc);
        double before =
                meters.counter("churn_recalc_accounts", "trigger", "manual").count();
        recalc.run("manual");
        Client admin = login("admin", "admin12345");
        String body = scrape(admin);
        assertThat(body).contains("churn_expected_loss_euros 6819.05");
        assertSummary(body, summaries.get());
        assertThat(meters.counter("churn_recalc_accounts", "trigger", "manual").count())
                .isEqualTo(before + 10);
        assertThat(meters.get("churn_recalc_duration")
                        .tags("trigger", "manual", "result", "ok")
                        .timer()
                        .count())
                .isPositive();
        double lastSuccess =
                meters.get("churn_last_recalc_timestamp_seconds").gauge().value();
        assertThat(lastSuccess).isPositive();
        recalc.run("manual");
        assertThat(meters.get("churn_recalc_duration")
                        .tags("trigger", "manual", "result", "skipped")
                        .timer()
                        .count())
                .isPositive();
        assertThat(meters.get("churn_last_recalc_timestamp_seconds").gauge().value())
                .isEqualTo(lastSuccess);
        jdbc.update("update accounts set balance = balance + 100000 where id = 5");
        recalc.run("manual");
        assertSummary(scrape(admin), summaries.get());
        assertThat(summaries.get().money().expectedLoss()).isLessThan(681905L);
    }

    @Test
    void aFailedRunDoesNotReplaceTheLastSuccessfulTimestampOrCountAccounts() throws Exception {
        RecalcSupport.freezeClock(jdbc);
        RecalcSupport.loadReferenceData(jdbc);
        recalc.run("manual");
        double success =
                meters.get("churn_last_recalc_timestamp_seconds").gauge().value();
        double accounts =
                meters.counter("churn_recalc_accounts", "trigger", "manual").count();
        jdbc.update("update accounts set balance = balance + 1 where id = 5");
        jdbc.update("delete from model_revisions");
        try {
            assertThat(recalc.run("manual").result()).isEqualTo(RecalcService.Result.FAILED);
            assertThat(meters.get("churn_recalc_duration")
                            .tags("trigger", "manual", "result", "failed")
                            .timer()
                            .count())
                    .isPositive();
            assertThat(meters.get("churn_last_recalc_timestamp_seconds").gauge().value())
                    .isEqualTo(success);
            assertThat(meters.counter("churn_recalc_accounts", "trigger", "manual")
                            .count())
                    .isEqualTo(accounts);
        } finally {
            jdbc.update("insert into model_revisions (changed_by, source, changes) values ('test', 'migration',"
                    + " '[]'::jsonb)");
        }
    }

    @Test
    void unscoredAccountsAndAnEmptyDatabaseHaveDefinedMetrics() throws Exception {
        Client admin = login("admin", "admin12345");
        String empty = scrape(admin);
        assertThat(empty).contains("churn_last_recalc_timestamp_seconds 0.0", "churn_risk_score_average NaN");
        RecalcSupport.freezeClock(jdbc);
        RecalcSupport.loadReferenceData(jdbc);
        String pending = scrape(admin);
        assertThat(pending).contains("churn_accounts{level=\"pending\"} 10.0", "churn_delta_pending_accounts 10.0");
    }

    @Test
    void onlyAdministratorsAndMetricsKeysCanScrape() throws Exception {
        assertThat(client().get("/metrics").statusCode()).isEqualTo(401);
        assertThat(login("analyst", "analyst12345").get("/metrics").statusCode())
                .isEqualTo(403);
        Client admin = login("admin", "admin12345");
        assertThat(admin.get("/metrics").statusCode()).isEqualTo(200);
        for (String scope : new String[] {"metrics", "read", "ingest"}) {
            var issued = admin.exchange(
                    "POST",
                    "/api/v1/admin/api-keys",
                    "{\"name\":\"scrape-" + scope + "\",\"scopes\":[\"" + scope + "\"]}",
                    Map.of(),
                    true);
            assertThat(issued.statusCode()).isEqualTo(201);
            String key = json.readTree(issued.body()).get("secret").asString();
            for (String authorization : new String[] {
                "Bearer " + key,
                "Basic "
                        + Base64.getEncoder()
                                .encodeToString(("bot:" + key).getBytes(java.nio.charset.StandardCharsets.UTF_8))
            }) {
                assertThat(client().exchange("GET", "/metrics", null, Map.of("Authorization", authorization), false)
                                .statusCode())
                        .isEqualTo(scope.equals("metrics") ? 200 : 403);
            }
        }
    }

    private Client login(String username, String password) throws Exception {
        Client client = client();
        assertThat(client.post(
                                "/api/v1/auth/login",
                                "{\"login\":\"" + username + "\",\"password\":\"" + password + "\"}",
                                false)
                        .statusCode())
                .isEqualTo(200);
        return client;
    }

    private String scrape(Client client) throws Exception {
        var response = client.get("/metrics");
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("content-type").orElse("")).contains("text/plain");
        return response.body();
    }

    private void assertSummary(String body, Summary summary) {
        assertThat(body)
                .contains(
                        "churn_accounts{level=\"high\"} "
                                + (double) summary.accounts().high(),
                        "churn_accounts{level=\"medium\"} "
                                + (double) summary.accounts().medium(),
                        "churn_accounts{level=\"low\"} "
                                + (double) summary.accounts().low(),
                        "churn_accounts{level=\"no_score\"} "
                                + (double) summary.accounts().noScore(),
                        "churn_accounts{level=\"pending\"} "
                                + (double) summary.accounts().pending(),
                        "churn_expected_loss_euros " + summary.money().expectedLoss() / 100.0,
                        "churn_revenue_horizon_euros " + summary.money().revenueHorizon() / 100.0,
                        "churn_revenue_at_risk_euros " + summary.money().revenueAtRisk() / 100.0,
                        "churn_risk_score_average " + summary.avgRiskScore().doubleValue(),
                        "churn_services_at_risk " + (double) summary.servicesAtRisk(),
                        "churn_model_version " + (double) summary.modelVersion(),
                        "churn_horizon_days " + (double) summary.horizonDays());
    }
}

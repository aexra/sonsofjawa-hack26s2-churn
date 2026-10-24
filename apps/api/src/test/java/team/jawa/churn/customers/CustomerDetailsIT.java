package team.jawa.churn.customers;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.math.BigDecimal;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import team.jawa.churn.IntegrationTest;
import team.jawa.churn.recalc.RecalcScheduler;
import team.jawa.churn.recalc.RecalcService;
import team.jawa.churn.recalc.RecalcSupport;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class CustomerDetailsIT extends IntegrationTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    RecalcService recalc;

    @Autowired
    RecalcScheduler scheduler;

    private Client client;

    @BeforeEach
    void load() throws Exception {
        await().atMost(Duration.ofSeconds(10)).until(() -> !scheduler.isRunning());
        RecalcSupport.reset(jdbc);
        jdbc.update("update model_settings set value = default_value");
        RecalcSupport.freezeClock(jdbc);
        RecalcSupport.loadReferenceData(jdbc);
        assertThat(recalc.run("manual").result()).isEqualTo(RecalcService.Result.OK);
        client = client();
        assertThat(client.post("/api/v1/auth/login", "{\"login\":\"analyst\",\"password\":\"analyst12345\"}", false)
                        .statusCode())
                .isEqualTo(200);
    }

    @AfterEach
    void clean() {
        RecalcSupport.reset(jdbc);
        jdbc.update("update model_settings set value = default_value");
    }

    @Test
    void customerFiveMatchesTheFrozenReference() throws Exception {
        JsonNode body = json(client.get("/api/v1/customers/5"));
        JsonNode account = body.get("account");
        JsonNode score = body.get("score");

        assertThat(account.get("id").longValue()).isEqualTo(5L);
        assertThat(account.get("email").asString()).isEqualTo("user-0005@example.test");
        assertThat(account.get("balance").longValue()).isEqualTo(28657L);
        assertThat(account.get("totalReplenished").longValue()).isEqualTo(293608L);
        assertThat(score.get("status").asString()).isEqualTo("scored");
        assertThat(score.get("riskScore").decimalValue()).isEqualByComparingTo("78.47");
        assertThat(score.get("riskLevel").asString()).isEqualTo("high");
        assertThat(score.get("loyalty").decimalValue()).isEqualByComparingTo("21.53");
        assertThat(score.get("probability").decimalValue()).isEqualByComparingTo("0.7847");
        assertThat(score.get("revenueHorizon").longValue()).isEqualTo(469136L);
        assertThat(score.get("securedAmount").longValue()).isEqualTo(0L);
        assertThat(score.get("uncoveredAmount").longValue()).isEqualTo(469136L);
        assertThat(score.get("expectedLoss").longValue()).isEqualTo(368131L);
        assertThat(score.get("horizonDays").intValue()).isEqualTo(30);
        assertThat(score.get("servicesLive").intValue()).isEqualTo(3);
        assertThat(score.get("servicesAtRisk").intValue()).isEqualTo(3);
        assertThat(score.get("asOf").asString()).isEqualTo("2026-10-19T15:00:00Z");
        assertThat(score.get("modelVersion").isNull()).isFalse();
        assertThat(score.get("reasons").get(0).get("key").asString()).isEqualTo("prolong_wait");
        assertThat(score.get("reasons").get(0).get("text").asString())
                .isEqualTo("3 из 3 действующих услуг ожидают оплаты");
        assertThat(score.get("anomalies").get(0).asString()).isEqualTo("overdue_prolong_wait");

        List<String> featureKeys = new ArrayList<>();
        BigDecimal contribution = BigDecimal.ZERO;
        for (JsonNode feature : score.get("features")) {
            featureKeys.add(feature.get("key").asString());
            contribution = contribution.add(feature.get("contribution").decimalValue());
        }
        assertThat(featureKeys)
                .containsExactly(
                        "renewal_unsecured",
                        "insufficient_funds",
                        "prolong_wait",
                        "suspended_share",
                        "termination_history",
                        "payment_failures");
        assertThat(contribution).isEqualByComparingTo("78.47");
        assertThat(score.get("features").get(3).get("contribution").decimalValue())
                .isEqualByComparingTo("0");

        int atRisk = 0;
        List<Long> revenues = new ArrayList<>();
        for (JsonNode service : body.get("services")) {
            boolean live = service.get("status").asString().equals("active")
                    || service.get("status").asString().equals("suspended")
                    || service.get("status").asString().equals("prolong_wait");
            assertThat(service.get("isLive").asBoolean()).isEqualTo(live);
            assertThat(service.get("daysLeft").isNull()).isFalse();
            if (service.get("atRisk").asBoolean()) {
                atRisk++;
            }
            if (live) {
                revenues.add(service.get("revenueHorizon").longValue());
            }
        }
        assertThat(atRisk).isEqualTo(score.get("servicesAtRisk").intValue());
        assertThat(revenues).containsExactlyElementsOf(jdbc.queryForList("""
                        select round(price * (select value from model_settings where key = 'horizon_days')
                            / public.term_days("paymentTerm"))::bigint
                        from services
                        where "ownerId" = 5 and status in ('active', 'suspended', 'prolong_wait')
                        order by id
                        """, Long.class));

        JsonNode transactions = body.get("transactions");
        assertThat(transactions.get("items").size()).isLessThanOrEqualTo(50);
        assertThat(transactions.get("total").intValue()).isEqualTo(jdbc.queryForObject("""
                        select count(*)::int from transactions t
                        join services s on s.id = t."serviceId" where s."ownerId" = 5
                        """, Integer.class));
        assertThat(transactions.get("notPerformed").intValue()).isEqualTo(jdbc.queryForObject("""
                        select count(*)::int from transactions t
                        join services s on s.id = t."serviceId"
                        where s."ownerId" = 5 and t.status = 'not_performed'
                        """, Integer.class));
        List<Long> shown = new ArrayList<>();
        String previous = null;
        for (JsonNode item : transactions.get("items")) {
            shown.add(item.get("id").longValue());
            String createdAt = item.get("createdAt").asString();
            if (previous != null) {
                assertThat(createdAt).isLessThanOrEqualTo(previous);
            }
            previous = createdAt;
        }
        assertThat(shown).containsExactlyElementsOf(jdbc.queryForList("""
                        select t.id from transactions t
                        join services s on s.id = t."serviceId"
                        where s."ownerId" = 5
                        order by t."createdAt" desc, t.id desc
                        limit 50
                        """, Long.class));
    }

    @Test
    void customerTwoHasNoLiveServicesAndStillListsThem() throws Exception {
        JsonNode body = json(client.get("/api/v1/customers/2"));
        JsonNode score = body.get("score");

        assertThat(score.get("status").asString()).isEqualTo("no_score");
        assertThat(score.get("noScoreReason").asString()).isEqualTo("no_live_services");
        assertThat(score.get("riskScore").isNull()).isTrue();
        assertThat(score.get("reasons")).isEmpty();
        assertThat(score.get("features")).isEmpty();
        assertThat(body.get("services").size()).isPositive();
        for (JsonNode service : body.get("services")) {
            assertThat(service.get("isLive").asBoolean()).isFalse();
            assertThat(service.get("atRisk").asBoolean()).isFalse();
        }
    }

    @Test
    void anUnknownCustomerIsNotFound() throws Exception {
        HttpResponse<String> details = client.get("/api/v1/customers/999");
        HttpResponse<String> history = client.get("/api/v1/customers/999/history");

        assertThat(details.statusCode()).isEqualTo(404);
        assertThat(details.headers().firstValue("Content-Type").orElseThrow()).startsWith("application/problem+json");
        assertThat(details.body()).contains("\"code\":\"not_found\"");
        assertThat(history.statusCode()).isEqualTo(404);
        assertThat(history.body()).contains("\"code\":\"not_found\"");
    }

    @Test
    void aCustomerWithoutAScoreIsPending() throws Exception {
        jdbc.update("delete from scores where account_id = 1");

        JsonNode body = json(client.get("/api/v1/customers/1"));
        JsonNode score = body.get("score");

        assertThat(score.get("status").asString()).isEqualTo("pending");
        assertThat(score.get("riskScore").isNull()).isTrue();
        assertThat(score.get("reasons")).isEmpty();
        assertThat(score.get("features")).isEmpty();
        assertThat(score.get("anomalies")).isEmpty();
        assertThat(body.get("services").size()).isPositive();
        assertThat(body.get("account").get("email").asString()).isEqualTo("user-0001@example.test");
        assertThat(json(client.get("/api/v1/customers/1/history"))).isEmpty();
    }

    @Test
    void historyAfterAWeightChangeHasTwoModelVersions() throws Exception {
        jdbc.update("update model_settings set value = 40 where key = 'weight_prolong_wait'");
        assertThat(recalc.run("manual").result()).isEqualTo(RecalcService.Result.OK);

        JsonNode history = json(client.get("/api/v1/customers/5/history"));
        JsonNode unscored = json(client.get("/api/v1/customers/2/history"));

        assertThat(history).hasSize(2);
        assertThat(history.get(0).get("modelVersion").longValue())
                .isNotEqualTo(history.get(1).get("modelVersion").longValue());
        assertThat(history.get(0).get("calculatedAt").asString())
                .isLessThan(history.get(1).get("calculatedAt").asString());
        assertThat(history.get(0).get("riskScore").decimalValue()).isEqualByComparingTo("78.47");
        assertThat(history.get(1).get("riskScore").decimalValue()).isEqualByComparingTo("80.43");
        assertThat(history.get(1).get("status").asString()).isEqualTo("scored");
        assertThat(unscored).hasSize(2);
        assertThat(unscored.get(0).get("status").asString()).isEqualTo("no_score");
        assertThat(unscored.get(1).get("status").asString()).isEqualTo("no_score");
        assertThat(unscored.get(0).get("modelVersion").longValue())
                .isNotEqualTo(unscored.get(1).get("modelVersion").longValue());
        assertThat(json(client.get("/api/v1/customers/5/history?limit=1"))).hasSize(1);
        assertThat(json(client.get("/api/v1/customers/5/history?from=2099-01-01T00:00:00Z")))
                .isEmpty();
        assertThat(client.get("/api/v1/customers/5/history?limit=5001").statusCode())
                .isEqualTo(400);
    }

    private static JsonNode json(HttpResponse<String> response) {
        assertThat(response.statusCode()).isEqualTo(200);
        return JSON.readTree(response.body());
    }
}

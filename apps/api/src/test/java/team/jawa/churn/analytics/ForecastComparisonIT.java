package team.jawa.churn.analytics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import team.jawa.churn.IntegrationTest;
import team.jawa.churn.recalc.RecalcService;
import team.jawa.churn.recalc.RecalcSupport;
import tools.jackson.databind.json.JsonMapper;

class ForecastComparisonIT extends IntegrationTest {
    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    RecalcService recalc;

    @Autowired
    JsonMapper json;

    @MockitoBean
    MlClient ml;

    @BeforeEach
    @AfterEach
    void reset() {
        RecalcSupport.reset(jdbc);
    }

    private Client analyst() throws Exception {
        RecalcSupport.freezeClock(jdbc);
        RecalcSupport.loadReferenceData(jdbc);
        recalc.run("manual");
        Client client = client();
        assertThat(client.post("/api/v1/auth/login", "{\"login\":\"analyst\",\"password\":\"analyst12345\"}", false)
                        .statusCode())
                .isEqualTo(200);
        return client;
    }

    @Test
    void requiresAuthenticationAndValidRange() throws Exception {
        assertThat(client().get("/api/v1/analytics/model-comparison").statusCode())
                .isEqualTo(401);
        assertThat(analyst()
                        .get("/api/v1/analytics/model-comparison?pastDays=0")
                        .statusCode())
                .isEqualTo(400);
    }

    @Test
    void returnsExpertWhenMlUnavailable() throws Exception {
        when(ml.enabled()).thenReturn(true);
        when(ml.post(eq("/predict"), any())).thenThrow(new IllegalStateException("unavailable"));
        var response = analyst().get("/api/v1/analytics/model-comparison?includeMl=true");
        assertThat(response.statusCode()).isEqualTo(200);
        var body = json.readTree(response.body());
        assertThat(body.path("mlState").asText()).isEqualTo("unavailable");
        assertThat(body.path("ml").isNull()).isTrue();
        assertThat(body.path("expert").path("points").size()).isEqualTo(121);
    }

    @Test
    void forecastsShareSnapshotPaymentsAndFaceValueMoney() throws Exception {
        when(ml.enabled()).thenReturn(true);
        List<Map<String, Object>> received = new ArrayList<>();
        when(ml.post(eq("/predict"), any())).thenAnswer(call -> {
            Map<?, ?> request = call.getArgument(1);
            List<?> observations = (List<?>) request.get("observations");
            List<Map<String, Object>> predictions = new ArrayList<>();
            for (Object observation : observations) {
                Map<?, ?> source = (Map<?, ?>) observation;
                Map<String, Object> row = new LinkedHashMap<>();
                source.forEach((key, value) -> row.put(key.toString(), value));
                received.add(row);
                Map<String, Object> predicted = new LinkedHashMap<>(row);
                predicted.put("probability_nonrenewal", 0.8);
                predictions.add(predicted);
            }
            return json.valueToTree(Map.of(
                    "predictions",
                    predictions,
                    "model_id",
                    "test-model",
                    "model_provenance",
                    "synthetic",
                    "training",
                    Map.of("state", "ready")));
        });
        var client = analyst();
        var response = client.get("/api/v1/analytics/model-comparison?includeMl=true");
        assertThat(response.statusCode()).isEqualTo(200);
        var body = json.readTree(response.body());
        assertThat(body.path("mlState").asText()).isEqualTo("ready");
        assertThat(body.path("provenance").asText()).isEqualTo("synthetic");
        assertThat(body.path("amountBasis").asText()).isEqualTo("first_payment_face_value");
        assertThat(received).isNotEmpty();
        assertThat(body.path("payments").asInt()).isEqualTo(received.size());
        assertThat(body.path("expert").path("asOf")).isEqualTo(body.path("ml").path("asOf"));
        BigDecimal predictedCount = BigDecimal.ZERO;
        long predictedMoney = 0;
        var expertPoints = body.path("expert").path("points");
        var mlPoints = body.path("ml").path("points");
        var historyPoints = json.readTree(
                        client.get("/api/v1/analytics/churn-chart").body())
                .path("points");
        BigDecimal overdueCount = BigDecimal.ZERO;
        for (int i = 0; i < mlPoints.size(); i++) {
            var point = mlPoints.get(i);
            assertThat(point.path("date")).isEqualTo(expertPoints.get(i).path("date"));
            assertThat(point.path("deletions")).isEqualTo(expertPoints.get(i).path("deletions"));
            assertThat(point.path("overdueNonRenewals"))
                    .isEqualTo(expertPoints.get(i).path("overdueNonRenewals"));
            assertThat(point.path("overdueLossAmount"))
                    .isEqualTo(expertPoints.get(i).path("overdueLossAmount"));
            assertThat(point.path("overdueNonRenewals"))
                    .isEqualTo(historyPoints.get(i).path("overdueNonRenewals"));
            assertThat(point.path("overdueLossAmount"))
                    .isEqualTo(historyPoints.get(i).path("overdueLossAmount"));
            long duePayments = received.stream()
                    .filter(row -> java.time.OffsetDateTime.parse((String) row.get("due_at"))
                            .withOffsetSameInstant(java.time.ZoneOffset.UTC)
                            .toLocalDate()
                            .toString()
                            .equals(point.path("date").asText()))
                    .count();
            if (!point.path("overdueNonRenewals").isNull()) {
                overdueCount = overdueCount.add(point.path("overdueNonRenewals").decimalValue());
            }
            if (!point.path("expectedNonRenewals").isNull()) {
                assertThat(point.path("expectedNonRenewals").decimalValue())
                        .isEqualByComparingTo(BigDecimal.valueOf(duePayments).multiply(new BigDecimal("0.8")));
                predictedCount =
                        predictedCount.add(point.path("expectedNonRenewals").decimalValue());
                predictedMoney += point.path("expectedLossAmount").asLong();
            }
        }
        assertThat(overdueCount).isGreaterThan(BigDecimal.ZERO);
        assertThat(predictedCount)
                .isEqualByComparingTo(BigDecimal.valueOf(received.size()).multiply(new BigDecimal("0.8")));
        long faceValue = received.stream()
                .mapToLong(row -> ((Number) row.get("amount")).longValue())
                .sum();
        assertThat(Math.abs(predictedMoney - faceValue * 0.8)).isLessThanOrEqualTo(received.size());
        for (var row : received) {
            assertThat(java.time.OffsetDateTime.parse((String) row.get("due_at")))
                    .isAfter(java.time.OffsetDateTime.parse((String) row.get("as_of")));
            assertThat(row.get("provenance")).isEqualTo("unverified");
            assertThat(((Map<?, ?>) row.get("features"))).hasSize(6);
        }
    }

    @Test
    void includesPaymentAtWindowEndBeforeItsGraceDeadline() throws Exception {
        var client = analyst();
        jdbc.update("insert into accounts (id, email) values (101, 'boundary@example.test')");
        jdbc.update("""
                insert into services
                    (id, name, "ownerId", "paymentTerm", "autoProlong", "createdAt", "expiresAt", status, price)
                values (101, 'boundary', 101, 'month', false, model_now() - interval '1 year',
                    model_now() + interval '1 day', 'active', 1000)
                """);
        recalc.run("manual");
        var response = client.get("/api/v1/analytics/model-comparison?futureDays=1");
        assertThat(response.statusCode()).isEqualTo(200);
        var body = json.readTree(response.body());
        int expectedPayments = jdbc.queryForObject("""
                select count(*) from risk_payment_scores_vw
                where payment_index = 0 and price > 0 and due_at > model_now()
                    and (due_at at time zone 'UTC')::date <= (model_now() at time zone 'UTC')::date + 1
                """, Integer.class);
        assertThat(expectedPayments).isPositive();
        assertThat(body.path("payments").asInt()).isEqualTo(expectedPayments);
        var points = body.path("expert").path("points");
        var last = points.get(points.size() - 1);
        assertThat(last.path("date").asText()).isEqualTo("2026-10-20");
        assertThat(last.path("expectedNonRenewals").decimalValue()).isPositive();
    }

    @Test
    void rejectsIncompletePredictionInsteadOfShowingZeroes() throws Exception {
        when(ml.enabled()).thenReturn(true);
        when(ml.post(eq("/predict"), any())).thenReturn(json.readTree("{\"predictions\":[]}"));
        var body = json.readTree(analyst()
                .get("/api/v1/analytics/model-comparison?includeMl=true")
                .body());
        assertThat(body.path("mlState").asText()).isEqualTo("unavailable");
        assertThat(body.path("ml").isNull()).isTrue();
    }
}

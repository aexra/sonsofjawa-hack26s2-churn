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
        var response = analyst().get("/api/v1/analytics/model-comparison?includeMl=true");
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
        for (int i = 0; i < mlPoints.size(); i++) {
            var point = mlPoints.get(i);
            assertThat(point.path("date")).isEqualTo(expertPoints.get(i).path("date"));
            assertThat(point.path("deletions")).isEqualTo(expertPoints.get(i).path("deletions"));
            if (!point.path("expectedNonRenewals").isNull()) {
                predictedCount =
                        predictedCount.add(point.path("expectedNonRenewals").decimalValue());
                predictedMoney += point.path("expectedLossAmount").asLong();
            }
        }
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

package team.jawa.churn.analytics;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;

@Service
public class ForecastComparison {
    public record Point(
            LocalDate date,
            String kind,
            Integer deletions,
            Integer deletionsEstimated,
            Integer servicesAtRisk,
            BigDecimal expectedNonRenewals,
            Long expectedLossAmount,
            BigDecimal overdueNonRenewals,
            Long overdueLossAmount) {}

    public record Chart(OffsetDateTime asOf, int horizonDays, List<Point> points) {}

    public record Result(
            Chart expert,
            Chart ml,
            String mlState,
            String modelId,
            String provenance,
            JsonNode training,
            int payments,
            String amountBasis) {}

    private record Snapshot(ChurnChartService.Chart history, List<Map<String, Object>> observations) {}

    private final JdbcClient jdbc;
    private final ChurnChartService charts;
    private final MlClient ml;
    private final TransactionTemplate transaction;
    private static final String[] FEATURES = {
        "renewal_unsecured",
        "insufficient_funds",
        "prolong_wait",
        "suspended_share",
        "termination_history",
        "payment_failures"
    };

    public ForecastComparison(
            JdbcClient jdbc, ChurnChartService charts, MlClient ml, PlatformTransactionManager transactions) {
        this.jdbc = jdbc;
        this.charts = charts;
        this.ml = ml;
        transaction = new TransactionTemplate(transactions);
        transaction.setReadOnly(true);
        transaction.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
    }

    public Result calculate(int pastDays, Integer futureDays, boolean includeMl) {
        Snapshot snapshot = transaction.execute(status -> snapshot(pastDays, futureDays));
        Chart expert = aggregate(snapshot.history(), snapshot.observations(), false);
        if (!includeMl) return result(expert, null, "not_requested", null, snapshot);
        if (!ml.enabled()) return result(expert, null, "unavailable", null, snapshot);
        try {
            JsonNode prediction = ml.post("/predict", Map.of("observations", snapshot.observations()));
            List<Map<String, Object>> rows = new ArrayList<>();
            JsonNode predicted = prediction.path("predictions");
            if (!predicted.isArray()
                    || predicted.size() != snapshot.observations().size()) {
                throw new IllegalStateException("incomplete ML forecast");
            }
            for (int i = 0; i < predicted.size(); i++) {
                JsonNode row = predicted.get(i);
                var source = snapshot.observations().get(i);
                double probability = row.path("probability_nonrenewal").asDouble(Double.NaN);
                if (!Double.isFinite(probability)
                        || probability < 0
                        || probability > 1
                        || row.path("service_id").asLong() != ((Number) source.get("service_id")).longValue()
                        || row.path("account_id").asLong() != ((Number) source.get("account_id")).longValue()
                        || !OffsetDateTime.parse(row.path("due_at").asText())
                                .toInstant()
                                .equals(OffsetDateTime.parse((String) source.get("due_at"))
                                        .toInstant())) {
                    throw new IllegalStateException("invalid ML forecast");
                }
                var item = new HashMap<>(source);
                item.put("probability", BigDecimal.valueOf(probability));
                rows.add(item);
            }
            Chart forecast = aggregate(snapshot.history(), rows, true);
            return result(expert, forecast, "ready", prediction, snapshot);
        } catch (RuntimeException error) {
            return result(expert, null, "unavailable", null, snapshot);
        }
    }

    private Result result(Chart expert, Chart forecast, String state, JsonNode prediction, Snapshot snapshot) {
        return new Result(
                expert,
                forecast,
                state,
                prediction == null ? null : prediction.path("model_id").asText(),
                prediction == null ? null : prediction.path("model_provenance").asText(),
                prediction == null ? null : prediction.path("training"),
                snapshot.observations().size(),
                "first_payment_face_value");
    }

    private Snapshot snapshot(int pastDays, Integer futureDays) {
        var history = charts.chart(pastDays, futureDays);
        LocalDate last = history.points().getLast().date();
        var rows = jdbc.sql("""
                SELECT r.account_id, r.service_id, r.as_of, r.due_at,
                       r.due_at + r.grace * interval '24 hours' AS deadline,
                       r.price, r.feature_values, r.risk_score,
                       (SELECT max(version)::text FROM public.model_revisions) AS policy
                FROM public.risk_payment_scores_vw r
                WHERE r.payment_index = 0 AND r.price > 0 AND r.due_at > :asOf
                  AND (r.due_at AT TIME ZONE 'UTC')::date <= :last
                ORDER BY r.account_id, r.service_id, r.due_at
                """)
                .param("asOf", history.asOf())
                .param("last", last)
                .query((rs, index) -> {
                    var values = (BigDecimal[]) rs.getArray("feature_values").getArray();
                    Map<String, BigDecimal> features = new LinkedHashMap<>();
                    for (int i = 0; i < FEATURES.length; i++) features.put(FEATURES[i], values[i]);
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("account_id", rs.getLong("account_id"));
                    row.put("service_id", rs.getLong("service_id"));
                    row.put("as_of", history.asOf().toString());
                    row.put(
                            "due_at",
                            rs.getObject("due_at", OffsetDateTime.class).toString());
                    row.put(
                            "deadline",
                            rs.getObject("deadline", OffsetDateTime.class).toString());
                    row.put("model_version", rs.getString("policy"));
                    row.put("amount", rs.getLong("price"));
                    row.put("heuristic_score", rs.getBigDecimal("risk_score"));
                    row.put("features", features);
                    row.put("provenance", "unverified");
                    row.put("target", "service_nonrenewal_v2");
                    return row;
                })
                .list();
        return new Snapshot(history, rows);
    }

    static Chart aggregate(ChurnChartService.Chart history, List<Map<String, Object>> rows, boolean learned) {
        Map<LocalDate, BigDecimal> counts = new HashMap<>();
        Map<LocalDate, BigDecimal> money = new HashMap<>();
        for (var row : rows) {
            LocalDate day = OffsetDateTime.parse((String) row.get("due_at"))
                    .withOffsetSameInstant(ZoneOffset.UTC)
                    .toLocalDate();
            BigDecimal weight = learned
                    ? (BigDecimal) row.get("probability")
                    : ((BigDecimal) row.get("heuristic_score")).movePointLeft(2);
            counts.merge(day, weight, BigDecimal::add);
            money.merge(
                    day,
                    weight.multiply(BigDecimal.valueOf(((Number) row.get("amount")).longValue())),
                    BigDecimal::add);
        }
        return new Chart(
                history.asOf(),
                history.horizonDays(),
                history.points().stream()
                        .map(point -> {
                            boolean future = point.kind() != ChurnChartService.Kind.FACT;
                            return new Point(
                                    point.date(),
                                    point.kind().name().toLowerCase(java.util.Locale.ROOT),
                                    point.deletions(),
                                    point.deletionsEstimated(),
                                    point.servicesAtRisk(),
                                    future ? counts.getOrDefault(point.date(), BigDecimal.ZERO) : null,
                                    future
                                            ? money.getOrDefault(point.date(), BigDecimal.ZERO)
                                                    .setScale(0, RoundingMode.HALF_UP)
                                                    .longValueExact()
                                            : null,
                                    point.overdueNonRenewals(),
                                    point.overdueLossAmount());
                        })
                        .toList());
    }
}

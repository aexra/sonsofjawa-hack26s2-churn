package team.jawa.churn.analytics;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

@Service
public class ChurnChartService {

    public enum Kind {
        FACT,
        TODAY,
        FORECAST
    }

    public record Point(
            LocalDate date,
            Kind kind,
            Integer deletions,
            Integer deletionsEstimated,
            Integer servicesAtRisk,
            BigDecimal expectedNonRenewals,
            Long expectedLossAmount) {}

    public record Chart(OffsetDateTime asOf, int horizonDays, List<Point> points) {}

    private record Deletions(int observed, int estimated) {}

    private record Forecast(BigDecimal nonRenewals, long lossAmount) {}

    private final JdbcClient jdbc;

    ChurnChartService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Chart chart(int pastDays, Integer futureDays) {
        OffsetDateTime asOf = jdbc.sql("SELECT public.model_now()")
                .query(OffsetDateTime.class)
                .single();
        int horizonDays = jdbc.sql("SELECT value::int FROM public.model_settings WHERE key = 'horizon_days'")
                .query(Integer.class)
                .single();
        int ahead = futureDays == null ? horizonDays : futureDays;
        LocalDate today = asOf.withOffsetSameInstant(ZoneOffset.UTC).toLocalDate();
        LocalDate first = today.minusDays(pastDays);
        LocalDate last = today.plusDays(ahead);

        Map<LocalDate, Deletions> deletions = deletions(first, today);
        Map<LocalDate, Integer> atRisk = servicesAtRisk(first, today);
        Map<LocalDate, Forecast> forecast = forecast(today, last, horizonDays);

        List<Point> points = new ArrayList<>(pastDays + ahead + 1);
        for (LocalDate day = first; !day.isAfter(last); day = day.plusDays(1)) {
            points.add(point(day, today, deletions, atRisk, forecast));
        }
        return new Chart(asOf, horizonDays, points);
    }

    private static Point point(
            LocalDate day,
            LocalDate today,
            Map<LocalDate, Deletions> deletions,
            Map<LocalDate, Integer> atRisk,
            Map<LocalDate, Forecast> forecast) {
        if (day.isAfter(today)) {
            Forecast expected = forecast.getOrDefault(day, new Forecast(BigDecimal.ZERO, 0));
            return new Point(day, Kind.FORECAST, null, null, null, expected.nonRenewals(), expected.lossAmount());
        }
        Deletions removed = deletions.getOrDefault(day, new Deletions(0, 0));
        if (day.isBefore(today)) {
            return new Point(day, Kind.FACT, removed.observed(), removed.estimated(), atRisk.get(day), null, null);
        }
        Forecast expected = forecast.getOrDefault(day, new Forecast(BigDecimal.ZERO, 0));
        return new Point(
                day,
                Kind.TODAY,
                removed.observed(),
                removed.estimated(),
                atRisk.get(day),
                expected.nonRenewals(),
                expected.lossAmount());
    }

    private Map<LocalDate, Deletions> deletions(LocalDate first, LocalDate today) {
        Map<LocalDate, Deletions> result = new HashMap<>();
        jdbc.sql("""
                        SELECT (deleted_at AT TIME ZONE 'UTC')::date AS day,
                               count(*) FILTER (WHERE NOT estimated)::int AS observed,
                               count(*) FILTER (WHERE estimated)::int AS estimated
                        FROM public.churn_history_vw
                        WHERE (deleted_at AT TIME ZONE 'UTC')::date BETWEEN :first AND :today
                        GROUP BY 1
                        """)
                .param("first", first)
                .param("today", today)
                .query((rs, row) -> {
                    result.put(
                            rs.getObject("day", LocalDate.class),
                            new Deletions(rs.getInt("observed"), rs.getInt("estimated")));
                    return null;
                })
                .list();
        return result;
    }

    private Map<LocalDate, Integer> servicesAtRisk(LocalDate first, LocalDate today) {
        Map<LocalDate, Integer> result = new HashMap<>();
        jdbc.sql("""
                        SELECT DISTINCT ON ((as_of AT TIME ZONE 'UTC')::date)
                               (as_of AT TIME ZONE 'UTC')::date AS day, services_at_risk
                        FROM public.analytics_snapshots
                        WHERE (as_of AT TIME ZONE 'UTC')::date BETWEEN :first AND :today
                        ORDER BY (as_of AT TIME ZONE 'UTC')::date, as_of DESC, id DESC
                        """)
                .param("first", first)
                .param("today", today)
                .query((rs, row) -> {
                    result.put(rs.getObject("day", LocalDate.class), rs.getInt("services_at_risk"));
                    return null;
                })
                .list();
        return result;
    }

    private Map<LocalDate, Forecast> forecast(LocalDate today, LocalDate last, int horizonDays) {
        Map<LocalDate, Forecast> result = new HashMap<>();
        jdbc.sql("""
                        SELECT (expected_at AT TIME ZONE 'UTC')::date AS day,
                               sum(risk_weight) AS non_renewals,
                               round(sum(risk_weight * price * :horizon / public.term_days(payment_term)))::bigint AS loss
                        FROM public.churn_forecast_vw
                        WHERE (expected_at AT TIME ZONE 'UTC')::date BETWEEN :today AND :last
                        GROUP BY 1
                        """)
                .param("horizon", horizonDays)
                .param("today", today)
                .param("last", last)
                .query((rs, row) -> {
                    result.put(
                            rs.getObject("day", LocalDate.class),
                            new Forecast(rs.getBigDecimal("non_renewals"), rs.getLong("loss")));
                    return null;
                })
                .list();
        return result;
    }
}

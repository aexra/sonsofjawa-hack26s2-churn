package team.jawa.churn.analytics;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
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

    private record Deletions(LocalDate day, int observed, int estimated) {}

    private record AtRisk(LocalDate day, int services) {}

    private record Forecast(LocalDate day, BigDecimal nonRenewals, long lossAmount) {}

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

        Map<LocalDate, Deletions> deletions = byDay(deletions(first, today), Deletions::day);
        Map<LocalDate, AtRisk> atRisk = byDay(servicesAtRisk(first, today), AtRisk::day);
        Map<LocalDate, Forecast> forecast = byDay(forecast(today, last, horizonDays), Forecast::day);

        List<Point> points = new ArrayList<>(pastDays + ahead + 1);
        for (LocalDate day = first; !day.isAfter(last); day = day.plusDays(1)) {
            Deletions removed = deletions.getOrDefault(day, new Deletions(day, 0, 0));
            Forecast expected = forecast.getOrDefault(day, new Forecast(day, BigDecimal.ZERO, 0));
            Integer services = atRisk.containsKey(day) ? atRisk.get(day).services() : null;
            points.add(
                    switch (Integer.signum(day.compareTo(today))) {
                        case -1 ->
                            new Point(day, Kind.FACT, removed.observed(), removed.estimated(), services, null, null);
                        case 0 ->
                            new Point(
                                    day,
                                    Kind.TODAY,
                                    removed.observed(),
                                    removed.estimated(),
                                    services,
                                    expected.nonRenewals(),
                                    expected.lossAmount());
                        default ->
                            new Point(
                                    day,
                                    Kind.FORECAST,
                                    null,
                                    null,
                                    null,
                                    expected.nonRenewals(),
                                    expected.lossAmount());
                    });
        }
        return new Chart(asOf, horizonDays, points);
    }

    private static <T> Map<LocalDate, T> byDay(List<T> rows, Function<T, LocalDate> day) {
        return rows.stream().collect(Collectors.toMap(day, Function.identity()));
    }

    private List<Deletions> deletions(LocalDate first, LocalDate today) {
        return jdbc.sql("""
                        SELECT (deleted_at AT TIME ZONE 'UTC')::date AS day,
                               count(*) FILTER (WHERE NOT estimated)::int AS observed,
                               count(*) FILTER (WHERE estimated)::int AS estimated
                        FROM public.churn_history_vw
                        WHERE (deleted_at AT TIME ZONE 'UTC')::date BETWEEN :first AND :today
                        GROUP BY 1
                        """)
                .param("first", first)
                .param("today", today)
                .query((rs, row) -> new Deletions(
                        rs.getObject("day", LocalDate.class), rs.getInt("observed"), rs.getInt("estimated")))
                .list();
    }

    private List<AtRisk> servicesAtRisk(LocalDate first, LocalDate today) {
        return jdbc.sql("""
                        SELECT DISTINCT ON ((as_of AT TIME ZONE 'UTC')::date)
                               (as_of AT TIME ZONE 'UTC')::date AS day, services_at_risk
                        FROM public.analytics_snapshots
                        WHERE (as_of AT TIME ZONE 'UTC')::date BETWEEN :first AND :today
                        ORDER BY (as_of AT TIME ZONE 'UTC')::date, as_of DESC, id DESC
                        """)
                .param("first", first)
                .param("today", today)
                .query((rs, row) -> new AtRisk(rs.getObject("day", LocalDate.class), rs.getInt("services_at_risk")))
                .list();
    }

    private List<Forecast> forecast(LocalDate today, LocalDate last, int horizonDays) {
        return jdbc.sql("""
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
                .query((rs, row) -> new Forecast(
                        rs.getObject("day", LocalDate.class), rs.getBigDecimal("non_renewals"), rs.getLong("loss")))
                .list();
    }
}

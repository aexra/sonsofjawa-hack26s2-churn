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
            Long expectedLossAmount,
            BigDecimal overdueNonRenewals,
            Long overdueLossAmount) {}

    public record Chart(OffsetDateTime asOf, int horizonDays, List<Point> points) {}

    private record Deletions(LocalDate day, int observed, int estimated) {}

    private record AtRisk(LocalDate day, int services) {}

    private record DayWeight(LocalDate day, BigDecimal nonRenewals, long lossAmount) {}

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
        Map<LocalDate, DayWeight> forecast = byDay(forecast(today, last, horizonDays), DayWeight::day);
        Map<LocalDate, DayWeight> overdue = byDay(overdue(first, today, horizonDays), DayWeight::day);

        List<Point> points = new ArrayList<>(pastDays + ahead + 1);
        for (LocalDate day = first; !day.isAfter(last); day = day.plusDays(1)) {
            Deletions removed = deletions.getOrDefault(day, new Deletions(day, 0, 0));
            DayWeight expected = forecast.getOrDefault(day, new DayWeight(day, BigDecimal.ZERO, 0));
            DayWeight missed = overdue.getOrDefault(day, new DayWeight(day, BigDecimal.ZERO, 0));
            Integer services = atRisk.containsKey(day) ? atRisk.get(day).services() : null;
            points.add(
                    switch (Integer.signum(day.compareTo(today))) {
                        case -1 ->
                            new Point(
                                    day,
                                    Kind.FACT,
                                    removed.observed(),
                                    removed.estimated(),
                                    services,
                                    null,
                                    null,
                                    missed.nonRenewals(),
                                    missed.lossAmount());
                        case 0 ->
                            new Point(
                                    day,
                                    Kind.TODAY,
                                    removed.observed(),
                                    removed.estimated(),
                                    services,
                                    expected.nonRenewals(),
                                    expected.lossAmount(),
                                    missed.nonRenewals(),
                                    missed.lossAmount());
                        default ->
                            new Point(
                                    day,
                                    Kind.FORECAST,
                                    null,
                                    null,
                                    null,
                                    expected.nonRenewals(),
                                    expected.lossAmount(),
                                    null,
                                    null);
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

    private List<DayWeight> forecast(LocalDate today, LocalDate last, int horizonDays) {
        return weights("""
                SELECT greatest((expected_at AT TIME ZONE 'UTC')::date, :from) AS day,
                       sum(risk_weight) AS non_renewals,
                       round(sum(risk_weight * price * :horizon / public.term_days(payment_term)))::bigint AS loss
                FROM public.churn_forecast_vw
                WHERE greatest((expected_at AT TIME ZONE 'UTC')::date, :from) BETWEEN :from AND :to
                GROUP BY 1
                """, today, last, horizonDays);
    }

    private List<DayWeight> overdue(LocalDate first, LocalDate today, int horizonDays) {
        return weights("""
                SELECT (deadline AT TIME ZONE 'UTC')::date AS day,
                       sum(risk_weight) AS non_renewals,
                       round(sum(risk_weight * price * :horizon / public.term_days(payment_term)))::bigint AS loss
                FROM public.churn_overdue_vw
                WHERE (deadline AT TIME ZONE 'UTC')::date BETWEEN :from AND :to
                GROUP BY 1
                """, first, today, horizonDays);
    }

    private List<DayWeight> weights(String sql, LocalDate from, LocalDate to, int horizonDays) {
        return jdbc.sql(sql)
                .param("horizon", horizonDays)
                .param("from", from)
                .param("to", to)
                .query((rs, row) -> new DayWeight(
                        rs.getObject("day", LocalDate.class), rs.getBigDecimal("non_renewals"), rs.getLong("loss")))
                .list();
    }
}

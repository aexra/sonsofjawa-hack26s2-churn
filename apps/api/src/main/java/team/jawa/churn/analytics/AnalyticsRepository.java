package team.jawa.churn.analytics;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import team.jawa.churn.recalc.RecalcService;

@Repository
class AnalyticsRepository {

    private static final int BUCKETS = 10;
    private static final int BUCKET_WIDTH = 10;

    record Fingerprint(long recalcRun, long modelVersion, long delta, OffsetDateTime clockUpdatedAt) {}

    private final JdbcClient jdbc;
    private final RecalcService recalc;

    AnalyticsRepository(JdbcClient jdbc, RecalcService recalc) {
        this.jdbc = jdbc;
        this.recalc = recalc;
    }

    Fingerprint fingerprint() {
        return jdbc.sql("SELECT"
                        + " (SELECT coalesce(max(id), 0) FROM public.recalc_runs) AS recalc_run,"
                        + " (SELECT coalesce(max(version), 0) FROM public.model_revisions) AS model_version,"
                        + " (SELECT coalesce(max(id), 0) FROM public.delta) AS delta,"
                        + " (SELECT updated_at FROM public.model_clock) AS clock_updated_at")
                .query((rs, row) -> new Fingerprint(
                        rs.getLong("recalc_run"),
                        rs.getLong("model_version"),
                        rs.getLong("delta"),
                        rs.getObject("clock_updated_at", OffsetDateTime.class)))
                .single();
    }

    Summary summary() {
        return jdbc.sql("""
                        SELECT
                            public.model_now() AS as_of,
                            max(v.calculated_at) AS calculated_at,
                            (SELECT coalesce(max(version), 0) FROM public.model_revisions) AS model_version,
                            (SELECT value::int FROM public.model_settings WHERE key = 'horizon_days') AS horizon_days,
                            count(*)::int AS total,
                            count(*) FILTER (WHERE v.score_status = 'scored')::int AS scored,
                            count(*) FILTER (WHERE v.risk_level = 'high')::int AS high,
                            count(*) FILTER (WHERE v.risk_level = 'medium')::int AS medium,
                            count(*) FILTER (WHERE v.risk_level = 'low')::int AS low,
                            count(*) FILTER (WHERE v.score_status = 'no_score')::int AS no_score,
                            count(*) FILTER (WHERE v.score_status = 'pending')::int AS pending,
                            coalesce(sum(v.expected_loss), 0)::bigint AS expected_loss,
                            coalesce(sum(v.revenue_horizon), 0)::bigint AS revenue_horizon,
                            coalesce(sum(v.revenue_horizon) FILTER (WHERE v.risk_level = 'high'), 0)::bigint AS revenue_at_risk,
                            coalesce(sum(v.secured_amount), 0)::bigint AS secured_amount,
                            round(avg(v.risk_score), 2) AS avg_risk_score,
                            coalesce(sum(v.services_at_risk), 0)::int AS services_at_risk
                        FROM public.customer_scores_vw v
                        """)
                .query((rs, row) -> new Summary(
                        rs.getObject("as_of", OffsetDateTime.class),
                        rs.getObject("calculated_at", OffsetDateTime.class),
                        rs.getLong("model_version"),
                        rs.getInt("horizon_days"),
                        new Summary.Accounts(
                                rs.getInt("total"),
                                rs.getInt("scored"),
                                rs.getInt("high"),
                                rs.getInt("medium"),
                                rs.getInt("low"),
                                rs.getInt("no_score"),
                                rs.getInt("pending")),
                        new Summary.Money(
                                rs.getLong("expected_loss"),
                                rs.getLong("revenue_horizon"),
                                rs.getLong("revenue_at_risk"),
                                rs.getLong("secured_amount")),
                        rs.getBigDecimal("avg_risk_score"),
                        rs.getInt("services_at_risk"),
                        histogram(),
                        topReasons(),
                        recalc.lastRun().orElse(null)))
                .single();
    }

    private List<Summary.Bucket> histogram() {
        int[] counts = new int[BUCKETS];
        jdbc.sql("""
                        SELECT least(width_bucket(risk_score, 0, 100, 10), 10) AS bucket, count(*)::int AS customers
                        FROM public.customer_scores_vw
                        WHERE risk_score IS NOT NULL
                        GROUP BY 1
                        """)
                .query((rs, row) -> {
                    counts[rs.getInt("bucket") - 1] = rs.getInt("customers");
                    return null;
                })
                .list();
        List<Summary.Bucket> buckets = new ArrayList<>(BUCKETS);
        for (int i = 0; i < BUCKETS; i++) {
            buckets.add(new Summary.Bucket(i * BUCKET_WIDTH, (i + 1) * BUCKET_WIDTH, counts[i]));
        }
        return buckets;
    }

    private List<Summary.Reason> topReasons() {
        return jdbc.sql("""
                        SELECT v.top_reason_key AS key, f.title,
                               count(*)::int AS customers,
                               round(sum((v.reasons -> 0 ->> 'contribution')::numeric), 2) AS contribution_sum
                        FROM public.customer_scores_vw v
                        JOIN public.model_features f ON f.key = v.top_reason_key
                        GROUP BY v.top_reason_key, f.title
                        ORDER BY customers DESC, contribution_sum DESC, v.top_reason_key
                        """)
                .query((rs, row) -> new Summary.Reason(
                        rs.getString("key"),
                        rs.getString("title"),
                        rs.getInt("customers"),
                        rs.getBigDecimal("contribution_sum")))
                .list();
    }
}

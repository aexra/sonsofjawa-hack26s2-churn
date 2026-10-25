package team.jawa.churn.customers;

import java.math.BigDecimal;
import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class CustomerDetailsRepository {

    record CustomerRow(
            long id,
            String email,
            long balance,
            long withdrawBalance,
            long totalReplenished,
            long bonusBalance,
            String bonusState,
            String status,
            String noScoreReason,
            BigDecimal riskScore,
            String riskLevel,
            Long revenueHorizon,
            Long securedAmount,
            Long expectedLoss,
            Integer servicesTotal,
            Integer servicesLive,
            Integer servicesAtRisk,
            OffsetDateTime nextExpiryAt,
            OffsetDateTime calculatedAt,
            OffsetDateTime asOf,
            OffsetDateTime validUntil,
            Long modelVersion,
            String reasonsJson,
            List<String> anomalies,
            int horizonDays) {}

    record ServiceRow(
            long id,
            String name,
            long ownerId,
            String paymentTerm,
            boolean autoProlong,
            OffsetDateTime createdAt,
            OffsetDateTime expiresAt,
            String status,
            long price,
            boolean live,
            BigDecimal daysLeft,
            long revenueHorizon,
            boolean atRisk) {}

    record TransactionRow(
            long id,
            int amount,
            String status,
            OffsetDateTime performedAt,
            OffsetDateTime createdAt,
            String type,
            long serviceId) {}

    record Transactions(List<TransactionRow> items, int total, int notPerformed) {}

    record FeatureRow(String key, String title, BigDecimal value, BigDecimal weight, BigDecimal contribution) {}

    record HistoryRow(
            OffsetDateTime calculatedAt,
            OffsetDateTime asOf,
            String status,
            BigDecimal riskScore,
            String riskLevel,
            Long expectedLoss,
            long modelVersion) {}

    private static final int TRANSACTION_LIMIT = 50;

    private final JdbcClient jdbc;

    CustomerDetailsRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    Optional<CustomerRow> find(long id) {
        return jdbc.sql("""
                        SELECT
                            a.id,
                            a.email,
                            a.balance,
                            a."withdrawBalance" AS withdraw_balance,
                            a."totalReplenished" AS total_replenished,
                            a."bonusBalance" AS bonus_balance,
                            a."bonusState" AS bonus_state,
                            coalesce(s.status, 'pending') AS status,
                            s.no_score_reason,
                            s.risk_score,
                            s.risk_level,
                            s.revenue_horizon,
                            s.secured_amount,
                            s.expected_loss,
                            s.services_total,
                            s.services_live,
                            s.services_at_risk,
                            s.next_expiry_at,
                            s.calculated_at,
                            s.as_of,
                            s.valid_until,
                            s.model_version,
                            s.reasons::text AS reasons,
                            s.anomalies,
                            (SELECT value::int FROM public.model_settings WHERE key = 'horizon_days') AS horizon_days
                        FROM public.accounts a
                        LEFT JOIN public.scores s ON s.account_id = a.id AND s.is_current
                        WHERE a.id = :id
                        """)
                .param("id", id)
                .query(CustomerDetailsRepository::customer)
                .optional();
    }

    List<ServiceRow> services(long id) {
        return jdbc.sql("""
                        SELECT
                            s.id,
                            s.name,
                            s."ownerId" AS owner_id,
                            s."paymentTerm" AS payment_term,
                            s."autoProlong" AS auto_prolong,
                            s."createdAt" AS created_at,
                            s."expiresAt" AS expires_at,
                            s.status,
                            s.price,
                            s.status IN ('active', 'suspended', 'prolong_wait') AS is_live,
                            CASE
                                WHEN sc.as_of IS NULL THEN NULL
                                ELSE round((extract(epoch FROM s."expiresAt" - sc.as_of) / 86400.0)::numeric, 4)
                            END AS days_left,
                            CASE
                                WHEN s.status IN ('active', 'suspended', 'prolong_wait')
                                THEN round(s.price * h.horizon_days / public.term_days(s."paymentTerm"))::bigint
                                ELSE 0
                            END AS revenue_horizon,
                            CASE
                                WHEN sc.status IS DISTINCT FROM 'scored' THEN false
                                WHEN s.status NOT IN ('active', 'suspended', 'prolong_wait') THEN false
                                WHEN NOT (
                                    s.status = 'prolong_wait'
                                    OR (
                                        h.horizon_days > 0
                                        AND greatest(
                                            extract(epoch FROM s."expiresAt" - sc.as_of) / 86400.0, 0
                                        ) < h.horizon_days
                                    )
                                ) THEN false
                                WHEN s.status = 'prolong_wait'
                                     OR NOT s."autoProlong"
                                     OR coalesce((sc.features ->> 'insufficient_funds')::numeric, 0) > 0
                                THEN true
                                ELSE false
                            END AS at_risk
                        FROM public.services s
                        LEFT JOIN public.scores sc ON sc.account_id = s."ownerId" AND sc.is_current
                        CROSS JOIN (
                            SELECT value AS horizon_days
                            FROM public.model_settings
                            WHERE key = 'horizon_days'
                        ) h
                        WHERE s."ownerId" = :id
                        ORDER BY s.id
                        """)
                .param("id", id)
                .query(CustomerDetailsRepository::service)
                .list();
    }

    Transactions transactions(long id) {
        Counts counts = jdbc.sql("""
                        SELECT count(*)::int AS total,
                               count(*) FILTER (WHERE t.status = 'not_performed')::int AS not_performed
                        FROM public.transactions t
                        JOIN public.services s ON s.id = t."serviceId"
                        WHERE s."ownerId" = :id
                        """)
                .param("id", id)
                .query((rs, row) -> new Counts(rs.getInt("total"), rs.getInt("not_performed")))
                .single();
        List<TransactionRow> items = jdbc.sql("""
                        SELECT t.id, t.amount, t.status, t."performedAt" AS performed_at,
                               t."createdAt" AS created_at, t.type, t."serviceId" AS service_id
                        FROM public.transactions t
                        JOIN public.services s ON s.id = t."serviceId"
                        WHERE s."ownerId" = :id
                        ORDER BY t."createdAt" DESC, t.id DESC
                        LIMIT :limit
                        """)
                .param("id", id)
                .param("limit", TRANSACTION_LIMIT)
                .query(CustomerDetailsRepository::transaction)
                .list();
        return new Transactions(items, counts.total(), counts.notPerformed());
    }

    List<FeatureRow> features(long id) {
        return jdbc.sql("""
                        SELECT
                            f.key,
                            f.title,
                            coalesce((sc.features ->> f.key)::numeric, 0) AS value,
                            coalesce(reason.weight, s.value) AS weight,
                            coalesce(reason.contribution, 0) AS contribution
                        FROM public.model_features f
                        JOIN public.model_settings s ON s.key = f.weight_key
                        JOIN public.scores sc
                            ON sc.account_id = :id AND sc.is_current AND sc.status = 'scored'
                        LEFT JOIN LATERAL (
                            SELECT (r ->> 'weight')::numeric AS weight,
                                   (r ->> 'contribution')::numeric AS contribution
                            FROM jsonb_array_elements(sc.reasons) r
                            WHERE r ->> 'key' = f.key
                        ) reason ON true
                        ORDER BY f.sort_order
                        """)
                .param("id", id)
                .query((rs, row) -> new FeatureRow(
                        rs.getString("key"),
                        rs.getString("title"),
                        rs.getBigDecimal("value"),
                        rs.getBigDecimal("weight"),
                        rs.getBigDecimal("contribution")))
                .list();
    }

    boolean accountExists(long id) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM public.accounts WHERE id = :id)")
                .param("id", id)
                .query(Boolean.class)
                .single();
    }

    List<HistoryRow> history(long id, OffsetDateTime from, OffsetDateTime to, int limit) {
        return jdbc.sql("""
                        SELECT calculated_at, as_of, status, risk_score, risk_level, expected_loss, model_version
                        FROM public.scores
                        WHERE account_id = :id
                          AND (CAST(:from AS timestamptz) IS NULL OR calculated_at >= CAST(:from AS timestamptz))
                          AND (CAST(:to AS timestamptz) IS NULL OR calculated_at <= CAST(:to AS timestamptz))
                        ORDER BY calculated_at ASC, id ASC
                        LIMIT :limit
                        """)
                .param("id", id)
                .param("from", from, Types.TIMESTAMP_WITH_TIMEZONE)
                .param("to", to, Types.TIMESTAMP_WITH_TIMEZONE)
                .param("limit", limit)
                .query(CustomerDetailsRepository::history)
                .list();
    }

    private record Counts(int total, int notPerformed) {}

    private static CustomerRow customer(ResultSet rs, int row) throws SQLException {
        return new CustomerRow(
                rs.getLong("id"),
                rs.getString("email"),
                rs.getLong("balance"),
                rs.getLong("withdraw_balance"),
                rs.getLong("total_replenished"),
                rs.getLong("bonus_balance"),
                rs.getString("bonus_state"),
                rs.getString("status"),
                rs.getString("no_score_reason"),
                rs.getBigDecimal("risk_score"),
                rs.getString("risk_level"),
                longOrNull(rs, "revenue_horizon"),
                longOrNull(rs, "secured_amount"),
                longOrNull(rs, "expected_loss"),
                integer(rs, "services_total"),
                integer(rs, "services_live"),
                integer(rs, "services_at_risk"),
                rs.getObject("next_expiry_at", OffsetDateTime.class),
                rs.getObject("calculated_at", OffsetDateTime.class),
                rs.getObject("as_of", OffsetDateTime.class),
                rs.getObject("valid_until", OffsetDateTime.class),
                longOrNull(rs, "model_version"),
                rs.getString("reasons"),
                strings(rs, "anomalies"),
                rs.getInt("horizon_days"));
    }

    private static ServiceRow service(ResultSet rs, int row) throws SQLException {
        return new ServiceRow(
                rs.getLong("id"),
                rs.getString("name"),
                rs.getLong("owner_id"),
                rs.getString("payment_term"),
                rs.getBoolean("auto_prolong"),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("expires_at", OffsetDateTime.class),
                rs.getString("status"),
                rs.getLong("price"),
                rs.getBoolean("is_live"),
                rs.getBigDecimal("days_left"),
                rs.getLong("revenue_horizon"),
                rs.getBoolean("at_risk"));
    }

    private static TransactionRow transaction(ResultSet rs, int row) throws SQLException {
        return new TransactionRow(
                rs.getLong("id"),
                rs.getInt("amount"),
                rs.getString("status"),
                rs.getObject("performed_at", OffsetDateTime.class),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getString("type"),
                rs.getLong("service_id"));
    }

    private static HistoryRow history(ResultSet rs, int row) throws SQLException {
        return new HistoryRow(
                rs.getObject("calculated_at", OffsetDateTime.class),
                rs.getObject("as_of", OffsetDateTime.class),
                rs.getString("status"),
                rs.getBigDecimal("risk_score"),
                rs.getString("risk_level"),
                longOrNull(rs, "expected_loss"),
                rs.getLong("model_version"));
    }

    private static Integer integer(ResultSet rs, String column) throws SQLException {
        int value = rs.getInt(column);
        return rs.wasNull() ? null : value;
    }

    private static Long longOrNull(ResultSet rs, String column) throws SQLException {
        long value = rs.getLong(column);
        return rs.wasNull() ? null : value;
    }

    private static List<String> strings(ResultSet rs, String column) throws SQLException {
        Array array = rs.getArray(column);
        if (array == null) {
            return List.of();
        }
        try {
            return List.of((String[]) array.getArray());
        } finally {
            array.free();
        }
    }
}

package team.jawa.churn.customers;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;

public enum CustomerColumn {
    ID("id", "id", "id", Kind.LONG),
    EMAIL("email", "email", "lower(email)", Kind.STRING),
    BALANCE("balance", "balance", "balance", Kind.LONG),
    WITHDRAW_BALANCE("withdrawBalance", "withdraw_balance", "withdraw_balance", Kind.LONG),
    TOTAL_REPLENISHED("totalReplenished", "total_replenished", "total_replenished", Kind.LONG),
    BONUS_BALANCE("bonusBalance", "bonus_balance", "bonus_balance", Kind.LONG),
    BONUS_STATE("bonusState", "bonus_state", null, Kind.STRING),
    SCORE_STATUS("scoreStatus", "score_status", null, Kind.STRING),
    NO_SCORE_REASON("noScoreReason", "no_score_reason", null, Kind.STRING),
    RISK_SCORE("riskScore", "risk_score", "risk_score", Kind.DECIMAL),
    RISK_LEVEL(
            "riskLevel",
            "risk_level",
            "CASE risk_level WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 END",
            Kind.STRING),
    LOYALTY("loyalty", "100 - risk_score", "100 - risk_score", Kind.DECIMAL),
    EXPECTED_LOSS("expectedLoss", "expected_loss", "expected_loss", Kind.LONG),
    REVENUE_HORIZON("revenueHorizon", "revenue_horizon", "revenue_horizon", Kind.LONG),
    SECURED_AMOUNT("securedAmount", "secured_amount", "secured_amount", Kind.LONG),
    SERVICES_TOTAL("servicesTotal", "services_total", "services_total", Kind.LONG),
    SERVICES_LIVE("servicesLive", "services_live", "services_live", Kind.LONG),
    SERVICES_AT_RISK("servicesAtRisk", "services_at_risk", "services_at_risk", Kind.LONG),
    NEXT_EXPIRY_AT("nextExpiryAt", "next_expiry_at", "next_expiry_at", Kind.TIMESTAMP),
    TOP_REASON("topReason", "reasons::text", null, Kind.TOP_REASON),
    REASONS("reasons", "reasons::text", null, Kind.REASONS),
    ANOMALIES("anomalies", "anomalies", null, Kind.STRING_ARRAY),
    CALCULATED_AT("calculatedAt", "calculated_at", "calculated_at", Kind.TIMESTAMP),
    AS_OF("asOf", "as_of", null, Kind.TIMESTAMP),
    MODEL_VERSION("modelVersion", "model_version", null, Kind.LONG);

    public enum Kind {
        STRING,
        LONG,
        DECIMAL,
        TIMESTAMP,
        STRING_ARRAY,
        TOP_REASON,
        REASONS
    }

    public static final List<CustomerColumn> DEFAULTS =
            List.of(ID, EMAIL, BALANCE, TOTAL_REPLENISHED, RISK_SCORE, RISK_LEVEL, TOP_REASON, EXPECTED_LOSS);

    private final String apiName;
    private final String selectExpression;
    private final String sortExpression;
    private final Kind kind;

    CustomerColumn(String apiName, String selectExpression, String sortExpression, Kind kind) {
        this.apiName = apiName;
        this.selectExpression = selectExpression;
        this.sortExpression = sortExpression;
        this.kind = kind;
    }

    public String apiName() {
        return apiName;
    }

    public String selectExpression() {
        return selectExpression;
    }

    public Optional<String> sortExpression() {
        return Optional.ofNullable(sortExpression);
    }

    public Kind kind() {
        return kind;
    }

    public static Optional<CustomerColumn> byApiName(String name) {
        return Arrays.stream(values())
                .filter(column -> column.apiName.equals(name))
                .findFirst();
    }
}

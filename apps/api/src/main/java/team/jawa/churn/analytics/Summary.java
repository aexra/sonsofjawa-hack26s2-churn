package team.jawa.churn.analytics;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import team.jawa.churn.recalc.RecalcService;

public record Summary(
        OffsetDateTime asOf,
        OffsetDateTime calculatedAt,
        long modelVersion,
        int horizonDays,
        Accounts accounts,
        Money money,
        BigDecimal avgRiskScore,
        int servicesAtRisk,
        List<Bucket> scoreHistogram,
        List<Reason> topReasons,
        RecalcService.Run lastRecalc) {

    public record Accounts(int total, int scored, int high, int medium, int low, int noScore, int pending) {}

    public record Money(long expectedLoss, long revenueHorizon, long revenueAtRisk, long securedAmount) {}

    public record Bucket(int from, int to, int count) {}

    public record Reason(String key, String title, int customers, BigDecimal contributionSum) {}
}

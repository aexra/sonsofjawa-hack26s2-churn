package team.jawa.churn.web;

import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RestController;
import team.jawa.churn.analytics.ChurnChartService;
import team.jawa.churn.analytics.Summary;
import team.jawa.churn.analytics.SummaryCache;
import team.jawa.churn.api.generated.api.AnalyticsApi;
import team.jawa.churn.api.generated.model.AnalyticsSummary;
import team.jawa.churn.api.generated.model.AnalyticsSummaryAccounts;
import team.jawa.churn.api.generated.model.AnalyticsSummaryMoney;
import team.jawa.churn.api.generated.model.AnalyticsSummaryScoreHistogramInner;
import team.jawa.churn.api.generated.model.AnalyticsSummaryTopReasonsInner;
import team.jawa.churn.api.generated.model.ChurnChart;
import team.jawa.churn.api.generated.model.ChurnChartPoint;

@RestController
class AnalyticsController implements AnalyticsApi {

    private final SummaryCache summaries;
    private final ChurnChartService charts;

    AnalyticsController(SummaryCache summaries, ChurnChartService charts) {
        this.summaries = summaries;
        this.charts = charts;
    }

    @Override
    public ResponseEntity<AnalyticsSummary> getAnalyticsSummary() {
        return ResponseEntity.ok(toSummary(summaries.get()));
    }

    @Override
    public ResponseEntity<ChurnChart> getChurnChart(Integer pastDays, Integer futureDays) {
        ChurnChartService.Chart chart = charts.chart(pastDays, futureDays);
        List<ChurnChartPoint> points =
                chart.points().stream().map(AnalyticsController::toPoint).toList();
        return ResponseEntity.ok(new ChurnChart(chart.asOf(), chart.horizonDays(), points));
    }

    private static AnalyticsSummary toSummary(Summary summary) {
        Summary.Accounts accounts = summary.accounts();
        Summary.Money money = summary.money();
        return new AnalyticsSummary(
                        summary.asOf(),
                        summary.modelVersion(),
                        summary.horizonDays(),
                        AnalyticsSummary.CurrencyEnum.EUR,
                        new AnalyticsSummaryAccounts(
                                accounts.total(),
                                accounts.scored(),
                                accounts.high(),
                                accounts.medium(),
                                accounts.low(),
                                accounts.noScore(),
                                accounts.pending()),
                        new AnalyticsSummaryMoney(
                                money.expectedLoss(),
                                money.revenueHorizon(),
                                money.revenueAtRisk(),
                                money.securedAmount()),
                        summary.servicesAtRisk(),
                        summary.scoreHistogram().stream()
                                .map(bucket -> new AnalyticsSummaryScoreHistogramInner(
                                        bucket.from(), bucket.to(), bucket.count()))
                                .toList(),
                        summary.topReasons().stream()
                                .map(reason -> new AnalyticsSummaryTopReasonsInner(
                                        reason.key(), reason.title(), reason.customers(), reason.contributionSum()))
                                .toList())
                .calculatedAt(summary.calculatedAt())
                .avgRiskScore(summary.avgRiskScore())
                .lastRecalc(summary.lastRecalc() == null ? null : RecalcController.toRun(summary.lastRecalc()));
    }

    private static ChurnChartPoint toPoint(ChurnChartService.Point point) {
        return new ChurnChartPoint(
                        point.date(),
                        ChurnChartPoint.KindEnum.valueOf(point.kind().name()))
                .deletions(point.deletions())
                .deletionsEstimated(point.deletionsEstimated())
                .servicesAtRisk(point.servicesAtRisk())
                .expectedNonRenewals(point.expectedNonRenewals())
                .expectedLossAmount(point.expectedLossAmount())
                .overdueNonRenewals(point.overdueNonRenewals())
                .overdueLossAmount(point.overdueLossAmount());
    }
}

package team.jawa.churn.metrics;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.binder.MeterBinder;
import java.util.function.ToDoubleFunction;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import team.jawa.churn.analytics.Summary;
import team.jawa.churn.analytics.SummaryCache;
import team.jawa.churn.recalc.RecalcService;

@Component
public class ChurnMetricsBinder implements MeterBinder {

    private final ObjectProvider<SummaryCache> summaries;
    private final ObjectProvider<RecalcService> recalc;
    private final ObjectProvider<JdbcClient> jdbc;

    ChurnMetricsBinder(
            ObjectProvider<SummaryCache> summaries,
            ObjectProvider<RecalcService> recalc,
            ObjectProvider<JdbcClient> jdbc) {
        this.summaries = summaries;
        this.recalc = recalc;
        this.jdbc = jdbc;
    }

    @Override
    public void bindTo(MeterRegistry registry) {
        account(registry, "high", s -> s.accounts().high());
        account(registry, "medium", s -> s.accounts().medium());
        account(registry, "low", s -> s.accounts().low());
        account(registry, "no_score", s -> s.accounts().noScore());
        account(registry, "pending", s -> s.accounts().pending());
        summary(registry, "churn_expected_loss_euros", s -> s.money().expectedLoss() / 100.0);
        summary(registry, "churn_revenue_horizon_euros", s -> s.money().revenueHorizon() / 100.0);
        summary(registry, "churn_revenue_at_risk_euros", s -> s.money().revenueAtRisk() / 100.0);
        summary(
                registry,
                "churn_risk_score_average",
                s -> s.avgRiskScore() == null ? Double.NaN : s.avgRiskScore().doubleValue());
        summary(registry, "churn_services_at_risk", Summary::servicesAtRisk);
        summary(registry, "churn_model_version", Summary::modelVersion);
        summary(registry, "churn_horizon_days", Summary::horizonDays);
        Gauge.builder("churn_delta_pending_accounts", recalc, r -> r.getObject().pendingAccounts())
                .register(registry);
        Gauge.builder(
                        "churn_last_recalc_timestamp_seconds",
                        jdbc,
                        j -> j.getObject()
                                .sql("SELECT coalesce(extract(epoch FROM max(finished_at)), 0)::double precision"
                                        + " FROM public.recalc_runs WHERE status = 'ok'")
                                .query(Double.class)
                                .single())
                .register(registry);
    }

    private void account(MeterRegistry registry, String level, ToDoubleFunction<Summary> value) {
        Gauge.builder(
                        "churn_accounts",
                        summaries,
                        s -> value.applyAsDouble(s.getObject().get()))
                .tag("level", level)
                .register(registry);
    }

    private void summary(MeterRegistry registry, String name, ToDoubleFunction<Summary> value) {
        Gauge.builder(name, summaries, s -> value.applyAsDouble(s.getObject().get()))
                .register(registry);
    }
}

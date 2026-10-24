package team.jawa.churn.metrics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import io.micrometer.prometheusmetrics.PrometheusConfig;
import io.micrometer.prometheusmetrics.PrometheusMeterRegistry;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import team.jawa.churn.analytics.Summary;
import team.jawa.churn.analytics.SummaryCache;
import team.jawa.churn.recalc.RecalcService;

class ChurnMetricsBinderTest {
    @Test
    void prometheusExportsEurosLevelsAndFreshSummaryValues() {
        SummaryCache summaries = mock(SummaryCache.class);
        RecalcService recalc = mock(RecalcService.class);
        JdbcClient jdbc = mock(JdbcClient.class, RETURNS_DEEP_STUBS);
        StaticListableBeanFactory beans = new StaticListableBeanFactory();
        beans.addBean("summaries", summaries);
        beans.addBean("recalc", recalc);
        beans.addBean("jdbc", jdbc);
        when(summaries.get()).thenReturn(summary(681905, 3));
        when(recalc.pendingAccounts()).thenReturn(7L);
        when(jdbc.sql("SELECT coalesce(extract(epoch FROM max(finished_at)), 0)::double precision FROM"
                                + " public.recalc_runs WHERE status = 'ok'")
                        .query(Double.class)
                        .single())
                .thenReturn(123.0);
        PrometheusMeterRegistry registry = new PrometheusMeterRegistry(PrometheusConfig.DEFAULT);
        try {
            new ChurnMetricsBinder(
                            beans.getBeanProvider(SummaryCache.class),
                            beans.getBeanProvider(RecalcService.class),
                            beans.getBeanProvider(JdbcClient.class))
                    .bindTo(registry);
            assertThat(registry.scrape())
                    .contains(
                            "churn_accounts{level=\"high\"} 3.0",
                            "churn_accounts{level=\"medium\"} 0.0",
                            "churn_accounts{level=\"low\"} 3.0",
                            "churn_accounts{level=\"no_score\"} 4.0",
                            "churn_accounts{level=\"pending\"} 0.0",
                            "churn_expected_loss_euros 6819.05",
                            "churn_revenue_horizon_euros 11592.51",
                            "churn_revenue_at_risk_euros 10866.5",
                            "churn_risk_score_average 42.88",
                            "churn_services_at_risk 11.0",
                            "churn_model_version 2.0",
                            "churn_horizon_days 30.0",
                            "churn_delta_pending_accounts 7.0",
                            "churn_last_recalc_timestamp_seconds 123.0");
            when(summaries.get()).thenReturn(summary(100, 1));
            assertThat(registry.scrape())
                    .contains("churn_expected_loss_euros 1.0", "churn_accounts{level=\"high\"} 1.0");
        } finally {
            registry.close();
        }
    }

    private Summary summary(long loss, int high) {
        return new Summary(
                null,
                null,
                2,
                30,
                new Summary.Accounts(10, 6, high, 0, 3, 4, 0),
                new Summary.Money(loss, 1159251, 1086650, 0),
                new BigDecimal("42.88"),
                11,
                List.of(),
                List.of(),
                null);
    }
}

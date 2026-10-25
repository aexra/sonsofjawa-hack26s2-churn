package team.jawa.churn.recalc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import io.micrometer.prometheusmetrics.PrometheusConfig;
import io.micrometer.prometheusmetrics.PrometheusMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import team.jawa.churn.events.EventBus;

class RecalcMetricsTest {
    @Test
    void skippedAndUnexpectedlyFailedAttemptsExportTimersWithoutCountingAccounts() {
        JdbcClient jdbc = mock(JdbcClient.class, RETURNS_DEEP_STUBS);
        PrometheusMeterRegistry registry = new PrometheusMeterRegistry(PrometheusConfig.DEFAULT);
        try {
            RecalcService service =
                    new RecalcService(jdbc, mock(PlatformTransactionManager.class), mock(EventBus.class), registry);
            when(jdbc.sql(anyString()).query(Boolean.class).single()).thenReturn(false);
            assertThat(service.run("timer").result()).isEqualTo(RecalcService.Result.SKIPPED);
            when(jdbc.sql(anyString()).query(Boolean.class).single())
                    .thenThrow(new IllegalStateException("database unavailable"));
            assertThatThrownBy(() -> service.run("timer")).isInstanceOf(IllegalStateException.class);
            assertThat(registry.scrape())
                    .contains(
                            "churn_recalc_duration_seconds_count{result=\"skipped\",trigger=\"timer\"} 1",
                            "churn_recalc_duration_seconds_count{result=\"failed\",trigger=\"timer\"} 1",
                            "churn_recalc_accounts_total{trigger=\"timer\"} 0.0");
        } finally {
            registry.close();
        }
    }
}

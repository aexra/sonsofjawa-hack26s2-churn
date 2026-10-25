package team.jawa.churn.events;

import static org.assertj.core.api.Assertions.assertThat;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

class EventSubscribersMetricsTest {
    @Test
    void theGaugeTracksTheSubscriberRegistryAndShutdown() {
        SimpleMeterRegistry meters = new SimpleMeterRegistry();
        try {
            EventSubscribers subscribers = new EventSubscribers(meters);
            try {
                assertThat(meters.get("churn_sse_clients").gauge().value()).isZero();
                subscribers.subscribe();
                subscribers.subscribe();
                assertThat(meters.get("churn_sse_clients").gauge().value()).isEqualTo(2);
            } finally {
                subscribers.stop();
            }
            assertThat(meters.get("churn_sse_clients").gauge().value()).isZero();
        } finally {
            meters.close();
        }
    }
}

package team.jawa.churn.assistant;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.time.Duration;
import org.springframework.stereotype.Component;

@Component
class AssistantMetrics {

    private final MeterRegistry registry;
    private final Timer duration;

    AssistantMetrics(MeterRegistry registry) {
        this.registry = registry;
        this.duration = Timer.builder("assistant_duration")
                .description("assistant answer duration")
                .register(registry);
    }

    void request(Outcome outcome) {
        Counter.builder("assistant_requests")
                .description("assistant requests by outcome")
                .tag("outcome", outcome.tag())
                .register(registry)
                .increment();
    }

    void finished(Outcome outcome, Duration elapsed) {
        request(outcome);
        duration.record(elapsed);
    }

    void step(String tool) {
        Counter.builder("assistant_steps")
                .description("assistant tool calls")
                .tag("tool", tool)
                .register(registry)
                .increment();
    }
}

package team.jawa.churn.assistant;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("assistant")
public record AssistantProperties(
        String modelUrl,
        String model,
        String modelKey,
        String mcpUrl,
        int maxSteps,
        int maxMessages,
        Duration timeout,
        Duration delegationTtl) {

    public boolean enabled() {
        return modelKey != null && !modelKey.isBlank();
    }
}

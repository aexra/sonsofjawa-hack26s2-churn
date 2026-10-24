package team.jawa.churn.recalc;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("recalc")
public record RecalcProperties(
        boolean enabled,
        Duration interval,
        Duration scoresRetention,
        Duration deltaRetention,
        String maintenanceCron) {}

package team.jawa.churn.auth;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("auth")
public record AuthProperties(
        boolean localEnabled,
        String jwtSecret,
        Duration accessTtl,
        Duration refreshTtl,
        boolean cookieSecure,
        String bootstrapAdminLogin,
        String bootstrapAdminPassword,
        String bootstrapUserLogin,
        String bootstrapUserPassword) {}

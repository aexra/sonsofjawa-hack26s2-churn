package team.jawa.churn.auth;

import java.nio.charset.StandardCharsets;
import org.springframework.stereotype.Component;

@Component
class AuthConfigValidator {

    static final int MIN_SECRET_BYTES = 32;

    AuthConfigValidator(AuthProperties auth, OidcProperties oidc) {
        if (!auth.localEnabled() && !oidc.enabled()) {
            throw new IllegalStateException(
                    "No login method configured: set AUTH_LOCAL_ENABLED=true or OIDC_ISSUER_URI");
        }
        if (oidc.enabled() && (isBlank(oidc.clientId()) || isBlank(oidc.clientSecret()))) {
            throw new IllegalStateException("OIDC_CLIENT_ID and OIDC_CLIENT_SECRET are required with OIDC_ISSUER_URI");
        }
        String secret = auth.jwtSecret();
        if (secret != null && !secret.isBlank() && secret.getBytes(StandardCharsets.UTF_8).length < MIN_SECRET_BYTES) {
            throw new IllegalStateException("AUTH_JWT_SECRET must be at least " + MIN_SECRET_BYTES + " bytes");
        }
        if (auth.accessTtl().isZero() || auth.accessTtl().isNegative()) {
            throw new IllegalStateException("AUTH_ACCESS_TTL must be positive");
        }
        if (auth.refreshTtl().isZero() || auth.refreshTtl().isNegative()) {
            throw new IllegalStateException("AUTH_REFRESH_TTL must be positive");
        }
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}

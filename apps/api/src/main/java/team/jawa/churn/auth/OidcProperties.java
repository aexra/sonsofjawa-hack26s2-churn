package team.jawa.churn.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("oidc")
public record OidcProperties(String issuerUri, String displayName) {

    public boolean enabled() {
        return issuerUri != null && !issuerUri.isBlank();
    }
}

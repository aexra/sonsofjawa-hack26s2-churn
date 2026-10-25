package team.jawa.churn.auth;

import java.util.Arrays;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("oidc")
public record OidcProperties(
        String issuerUri,
        String displayName,
        String clientId,
        String clientSecret,
        String scopes,
        String rolesClaim,
        String adminRole,
        String userRole,
        String publicUrl) {

    public boolean enabled() {
        return issuerUri != null && !issuerUri.isBlank();
    }

    public List<String> scopeList() {
        return Arrays.stream(scopes.split("[\\s,]+"))
                .filter(scope -> !scope.isBlank())
                .toList();
    }

    public String callbackUrl() {
        return publicUrl.replaceAll("/+$", "") + "/api/v1/auth/oidc/callback";
    }

    public String webUrl(String path) {
        return publicUrl.replaceAll("/+$", "") + path;
    }
}

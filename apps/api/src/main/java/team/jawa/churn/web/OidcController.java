package team.jawa.churn.web;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import team.jawa.churn.auth.OidcClientRegistrations;
import team.jawa.churn.auth.OidcProperties;

@RestController
class OidcController {

    private final ObjectProvider<OidcClientRegistrations> registrations;
    private final OidcProperties properties;

    OidcController(ObjectProvider<OidcClientRegistrations> registrations, OidcProperties properties) {
        this.registrations = registrations;
        this.properties = properties;
    }

    @GetMapping("/api/v1/auth/oidc/login")
    ResponseEntity<Void> login() {
        OidcClientRegistrations oidc = registrations.getIfAvailable();
        if (oidc == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "sso is not configured");
        }
        String target = oidc.available().isPresent()
                ? "/api/v1/auth/oidc/authorize/" + OidcClientRegistrations.REGISTRATION_ID
                : properties.webUrl("/login?error=provider");
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.LOCATION, target)
                .build();
    }
}

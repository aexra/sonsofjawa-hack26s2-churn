package team.jawa.churn.auth;

import javax.crypto.SecretKey;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;

@Configuration
@ConditionalOnExpression("!'${oidc.issuer-uri:}'.isBlank()")
public class OidcConfig {

    private static final Logger log = LoggerFactory.getLogger(OidcConfig.class);

    @Bean
    OidcClientRegistrations oidcClientRegistrations(OidcProperties properties) {
        return new OidcClientRegistrations(properties);
    }

    @Bean
    SignedCookieAuthorizationRequestRepository oidcAuthorizationRequests(SecretKey jwtSigningKey, AuthProperties auth) {
        return new SignedCookieAuthorizationRequestRepository(jwtSigningKey, auth.cookieSecure());
    }

    @Bean
    OidcLoginHandlers oidcLoginHandlers(
            OidcProperties properties, OidcUserProvisioner provisioner, AuthService auth, CookieService cookies) {
        return new OidcLoginHandlers(properties, provisioner, auth, cookies);
    }

    @EventListener(ApplicationReadyEvent.class)
    void checkProvider(ApplicationReadyEvent event) {
        OidcClientRegistrations registrations = event.getApplicationContext().getBean(OidcClientRegistrations.class);
        Thread.startVirtualThread(() -> {
            if (registrations.available().isPresent()) {
                log.info("OIDC provider is reachable");
            }
        });
    }
}

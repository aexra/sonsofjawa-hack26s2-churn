package team.jawa.churn.auth;

import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.ClientRegistrations;

public class OidcClientRegistrations implements ClientRegistrationRepository {

    public static final String REGISTRATION_ID = "oidc";

    private static final Logger log = LoggerFactory.getLogger(OidcClientRegistrations.class);

    private final OidcProperties properties;
    private volatile ClientRegistration registration;

    public OidcClientRegistrations(OidcProperties properties) {
        this.properties = properties;
    }

    @Override
    public ClientRegistration findByRegistrationId(String registrationId) {
        return REGISTRATION_ID.equals(registrationId) ? available().orElse(null) : null;
    }

    public Optional<ClientRegistration> available() {
        ClientRegistration current = registration;
        if (current != null) {
            return Optional.of(current);
        }
        synchronized (this) {
            if (registration == null) {
                try {
                    registration = ClientRegistrations.fromIssuerLocation(properties.issuerUri())
                            .registrationId(REGISTRATION_ID)
                            .clientId(properties.clientId())
                            .clientSecret(properties.clientSecret())
                            .scope(properties.scopeList())
                            .redirectUri(properties.callbackUrl())
                            .build();
                } catch (RuntimeException e) {
                    log.warn(
                            "OIDC provider is unavailable: issuer={} reason={}",
                            properties.issuerUri(),
                            e.getMessage());
                    return Optional.empty();
                }
            }
            return Optional.of(registration);
        }
    }
}

package team.jawa.churn.auth;

import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.ClientRegistrations;

public class OidcClientRegistrations implements ClientRegistrationRepository {

    public static final String REGISTRATION_ID = "oidc";

    private static final Logger log = LoggerFactory.getLogger(OidcClientRegistrations.class);
    private static final long DISCOVERY_TIMEOUT_SECONDS = 5;

    private final OidcProperties properties;
    private final ExecutorService discovery = Executors.newCachedThreadPool(runnable -> {
        Thread thread = new Thread(runnable, "oidc-discovery");
        thread.setDaemon(true);
        return thread;
    });
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
        CompletableFuture<ClientRegistration> attempt = CompletableFuture.supplyAsync(this::discover, discovery);
        try {
            registration = attempt.get(DISCOVERY_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            return Optional.of(registration);
        } catch (TimeoutException e) {
            attempt.cancel(true);
            log.warn(
                    "OIDC provider did not answer in {}s: issuer={}",
                    DISCOVERY_TIMEOUT_SECONDS,
                    properties.issuerUri());
        } catch (ExecutionException e) {
            log.warn(
                    "OIDC provider is unavailable: issuer={} reason={}",
                    properties.issuerUri(),
                    e.getCause().getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return Optional.empty();
    }

    private ClientRegistration discover() {
        return ClientRegistrations.fromIssuerLocation(properties.issuerUri())
                .registrationId(REGISTRATION_ID)
                .clientId(properties.clientId())
                .clientSecret(properties.clientSecret())
                .scope(properties.scopeList())
                .redirectUri(properties.callbackUrl())
                .build();
    }
}

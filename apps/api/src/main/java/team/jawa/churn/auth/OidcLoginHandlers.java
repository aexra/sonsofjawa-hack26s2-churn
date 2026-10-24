package team.jawa.churn.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;

public class OidcLoginHandlers {

    private static final Logger log = LoggerFactory.getLogger(OidcLoginHandlers.class);

    private final OidcProperties properties;
    private final OidcUserProvisioner provisioner;
    private final AuthService auth;
    private final CookieService cookies;

    public OidcLoginHandlers(
            OidcProperties properties, OidcUserProvisioner provisioner, AuthService auth, CookieService cookies) {
        this.properties = properties;
        this.provisioner = provisioner;
        this.auth = auth;
        this.cookies = cookies;
    }

    public AuthenticationSuccessHandler success() {
        return this::onSuccess;
    }

    public AuthenticationFailureHandler failure() {
        return this::onFailure;
    }

    private void onSuccess(HttpServletRequest request, HttpServletResponse response, Authentication authentication)
            throws IOException {
        if (!(authentication.getPrincipal() instanceof OidcUser principal)) {
            response.sendRedirect(properties.webUrl("/login?error=provider"));
            return;
        }
        Optional<UserAccount> user = provisioner.provision(principal);
        if (user.isEmpty()) {
            log.warn(
                    "sso login rejected: subject={} reason=no matching role or disabled account",
                    principal.getSubject());
            response.sendRedirect(properties.webUrl("/login?error=forbidden"));
            return;
        }
        AuthService.Session session = auth.openSession(user.get());
        HttpHeaders headers = cookies.sessionHeaders(session.accessToken(), session.refreshToken());
        headers.forEach((name, values) -> values.forEach(value -> response.addHeader(name, value)));
        log.info("sso login: login={} role={}", user.get().login(), user.get().role());
        response.sendRedirect(properties.webUrl("/"));
    }

    private void onFailure(HttpServletRequest request, HttpServletResponse response, AuthenticationException exception)
            throws IOException {
        log.warn("sso login failed: {}", exception.getMessage());
        response.sendRedirect(properties.webUrl("/login?error=provider"));
    }
}

package team.jawa.churn.web;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.RestController;
import team.jawa.churn.api.generated.api.AuthApi;
import team.jawa.churn.api.generated.model.ApiKeyScope;
import team.jawa.churn.api.generated.model.AuthProvider;
import team.jawa.churn.api.generated.model.AuthProviders;
import team.jawa.churn.api.generated.model.AuthProvidersLocal;
import team.jawa.churn.api.generated.model.AuthProvidersOidc;
import team.jawa.churn.api.generated.model.CurrentUser;
import team.jawa.churn.api.generated.model.LoginRequest;
import team.jawa.churn.api.generated.model.Role;
import team.jawa.churn.assistant.AssistantProperties;
import team.jawa.churn.auth.ApiKeyPrincipal;
import team.jawa.churn.auth.AuthProperties;
import team.jawa.churn.auth.AuthService;
import team.jawa.churn.auth.AuthenticatedUser;
import team.jawa.churn.auth.CookieService;
import team.jawa.churn.auth.OidcProperties;
import team.jawa.churn.auth.UserAccount;
import team.jawa.churn.auth.UserRepository;

@RestController
class AuthController implements AuthApi {

    private final AuthProperties auth;
    private final OidcProperties oidc;
    private final AssistantProperties assistant;
    private final AuthService service;
    private final CookieService cookies;
    private final UserRepository users;
    private final HttpServletRequest request;

    AuthController(
            AuthProperties auth,
            OidcProperties oidc,
            AssistantProperties assistant,
            AuthService service,
            CookieService cookies,
            UserRepository users,
            HttpServletRequest request) {
        this.auth = auth;
        this.oidc = oidc;
        this.assistant = assistant;
        this.service = service;
        this.cookies = cookies;
        this.users = users;
        this.request = request;
    }

    @Override
    public ResponseEntity<AuthProviders> getAuthProviders() {
        AuthProvidersOidc oidcProvider = new AuthProvidersOidc(oidc.enabled());
        if (oidc.enabled()) {
            oidcProvider.displayName(oidc.displayName()).loginUrl("/api/v1/auth/oidc/login");
        }
        return ResponseEntity.ok(new AuthProviders(new AuthProvidersLocal(auth.localEnabled()), oidcProvider));
    }

    @Override
    public ResponseEntity<CurrentUser> login(LoginRequest loginRequest) {
        AuthService.Session session =
                service.login(loginRequest.getLogin(), loginRequest.getPassword(), request.getRemoteAddr());
        return session(session);
    }

    @Override
    public ResponseEntity<CurrentUser> refresh() {
        String token = cookies.refreshToken(request)
                .orElseThrow(
                        () -> new ApiException(HttpStatus.UNAUTHORIZED, "refresh_invalid", "refresh token is missing"));
        return session(service.refresh(token));
    }

    @Override
    public ResponseEntity<Void> logout() {
        service.logout(cookies.refreshToken(request));
        HttpHeaders headers = cookies.clearHeaders();
        return ResponseEntity.noContent().headers(headers).build();
    }

    @Override
    public ResponseEntity<CurrentUser> getCurrentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof ApiKeyPrincipal key) {
            return ResponseEntity.ok(new CurrentUser(key.name(), AuthProvider.API_KEY)
                    .scopes(key.scopes().stream().map(ApiKeyScope::fromValue).toList())
                    .assistantEnabled(false));
        }
        if (authentication == null || !(authentication.getPrincipal() instanceof AuthenticatedUser principal)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "unauthenticated", "authentication required");
        }
        UserAccount user = users.findById(principal.id())
                .orElseThrow(
                        () -> new ApiException(HttpStatus.UNAUTHORIZED, "unauthenticated", "authentication required"));
        return ResponseEntity.ok(toCurrentUser(user).assistantEnabled(assistant.enabled()));
    }

    private ResponseEntity<CurrentUser> session(AuthService.Session session) {
        HttpHeaders headers = cookies.sessionHeaders(session.accessToken(), session.refreshToken());
        return ResponseEntity.ok()
                .headers(headers)
                .body(toCurrentUser(session.user()).assistantEnabled(assistant.enabled()));
    }

    private static CurrentUser toCurrentUser(UserAccount user) {
        return new CurrentUser(user.login(), AuthProvider.fromValue(user.authProvider()))
                .id(user.id())
                .email(user.email())
                .displayName(user.displayName())
                .role(Role.fromValue(user.role()))
                .scopes(List.of());
    }
}

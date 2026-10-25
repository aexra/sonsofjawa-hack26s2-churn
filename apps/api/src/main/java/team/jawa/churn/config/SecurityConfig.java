package team.jawa.churn.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestCustomizers;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizedClientRepository;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.session.NullAuthenticatedSessionStrategy;
import org.springframework.security.web.authentication.www.BasicAuthenticationFilter;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.AndRequestMatcher;
import org.springframework.security.web.util.matcher.OrRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.web.filter.OncePerRequestFilter;
import team.jawa.churn.auth.ApiKeyAuthenticationFilter;
import team.jawa.churn.auth.ApiKeyService;
import team.jawa.churn.auth.AuthProperties;
import team.jawa.churn.auth.CookieService;
import team.jawa.churn.auth.DelegatedTokenAuthenticationFilter;
import team.jawa.churn.auth.JwtCookieAuthenticationFilter;
import team.jawa.churn.auth.JwtService;
import team.jawa.churn.auth.OidcClientRegistrations;
import team.jawa.churn.auth.OidcLoginHandlers;
import team.jawa.churn.auth.SignedCookieAuthorizationRequestRepository;
import team.jawa.churn.web.ProblemWriter;

@Configuration
class SecurityConfig {

    private static final String OIDC_AUTHORIZE_PATH = "/api/v1/auth/oidc/authorize";
    private static final String DOCS_LOGIN_REDIRECT = "/login?next=%2Fapi%2Fv1%2Fdocs";

    @Bean
    PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }

    @Bean
    SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            AuthProperties auth,
            JwtService jwt,
            CookieService cookies,
            ApiKeyService apiKeys,
            ProblemWriter problems,
            ObjectProvider<OidcClientRegistrations> oidcRegistrations,
            ObjectProvider<SignedCookieAuthorizationRequestRepository> oidcRequests,
            ObjectProvider<OidcLoginHandlers> oidcHandlers)
            throws Exception {
        CookieCsrfTokenRepository csrfRepository = CookieCsrfTokenRepository.withHttpOnlyFalse();
        csrfRepository.setCookieCustomizer(cookie -> cookie.sameSite("Strict").secure(auth.cookieSecure()));
        RequestMatcher hasAuthorizationHeader = request -> request.getHeader("Authorization") != null;
        PathPatternRequestMatcher.Builder paths = PathPatternRequestMatcher.withDefaults();
        RequestMatcher docsPage = new OrRequestMatcher(
                paths.matcher(HttpMethod.GET, "/api/v1/docs"),
                paths.matcher(HttpMethod.GET, "/api/v1/docs/"),
                paths.matcher(HttpMethod.GET, "/api/v1/swagger-ui/index.html"));
        RequestMatcher acceptsHtml = request -> {
            String accept = request.getHeader("Accept");
            return accept != null && accept.contains(MediaType.TEXT_HTML_VALUE);
        };
        RequestMatcher browserOpensDocs = new AndRequestMatcher(docsPage, acceptsHtml);

        http.csrf(csrf -> csrf.csrfTokenRepository(csrfRepository)
                        .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler())
                        .sessionAuthenticationStrategy(new NullAuthenticatedSessionStrategy())
                        .ignoringRequestMatchers(
                                hasAuthorizationHeader,
                                paths.matcher(HttpMethod.POST, "/api/v1/auth/login"),
                                paths.matcher(HttpMethod.POST, "/api/v1/auth/refresh")))
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .securityContext(
                        context -> context.securityContextRepository(new RequestAttributeSecurityContextRepository())
                                .requireExplicitSave(true))
                .addFilterBefore(new ApiKeyAuthenticationFilter(apiKeys, problems), BasicAuthenticationFilter.class)
                .addFilterBefore(new DelegatedTokenAuthenticationFilter(jwt, problems), BasicAuthenticationFilter.class)
                .addFilterBefore(new JwtCookieAuthenticationFilter(jwt, cookies), BasicAuthenticationFilter.class)
                .addFilterAfter(new CsrfCookieFilter(), BasicAuthenticationFilter.class)
                .authorizeHttpRequests(a -> a.requestMatchers(
                                "/health",
                                "/api/v1/auth/providers",
                                "/api/v1/auth/login",
                                "/api/v1/auth/refresh",
                                "/api/v1/auth/oidc/**")
                        .permitAll()
                        .requestMatchers("/api/v1/auth/logout", "/api/v1/auth/me")
                        .authenticated()
                        .requestMatchers(
                                HttpMethod.GET,
                                "/api/v1/customers/**",
                                "/api/v1/analytics/**",
                                "/api/v1/model/**",
                                "/api/v1/recalc/status",
                                "/api/v1/events",
                                "/api/v1/docs/**",
                                "/api/v1/swagger-ui/**",
                                "/v3/api-docs/swagger-config",
                                "/api/v1/openapi.yaml")
                        .hasAnyAuthority("ROLE_USER", "SCOPE_read")
                        .requestMatchers(HttpMethod.POST, "/api/v1/assistant/messages")
                        .hasAuthority("ROLE_USER")
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/model/settings")
                        .hasRole("ADMIN")
                        .requestMatchers("/api/v1/source/**", "/api/v1/recalc")
                        .hasAnyAuthority("ROLE_ADMIN", "SCOPE_ingest")
                        .requestMatchers("/metrics")
                        .hasAnyAuthority("ROLE_ADMIN", "SCOPE_metrics")
                        .requestMatchers("/api/v1/admin/**")
                        .hasRole("ADMIN")
                        .anyRequest()
                        .denyAll())
                .exceptionHandling(e -> e.authenticationEntryPoint((request, response, exception) -> {
                            if (browserOpensDocs.matches(request)) {
                                response.setStatus(HttpStatus.FOUND.value());
                                response.setHeader(HttpHeaders.LOCATION, DOCS_LOGIN_REDIRECT);
                            } else {
                                problems.write(
                                        response,
                                        HttpStatus.UNAUTHORIZED,
                                        "unauthenticated",
                                        "authentication required");
                            }
                        })
                        .accessDeniedHandler((request, response, exception) -> {
                            if (exception instanceof CsrfException) {
                                problems.write(response, HttpStatus.FORBIDDEN, "csrf_invalid", "invalid csrf token");
                            } else {
                                problems.write(response, HttpStatus.FORBIDDEN, "forbidden", "access denied");
                            }
                        }));
        OidcClientRegistrations registrations = oidcRegistrations.getIfAvailable();
        if (registrations != null) {
            enableOidc(http, registrations, oidcRequests.getObject(), oidcHandlers.getObject());
        }
        return http.build();
    }

    private static void enableOidc(
            HttpSecurity http,
            OidcClientRegistrations registrations,
            SignedCookieAuthorizationRequestRepository requests,
            OidcLoginHandlers handlers)
            throws Exception {
        DefaultOAuth2AuthorizationRequestResolver resolver =
                new DefaultOAuth2AuthorizationRequestResolver(registrations, OIDC_AUTHORIZE_PATH);
        resolver.setAuthorizationRequestCustomizer(OAuth2AuthorizationRequestCustomizers.withPkce());
        http.oauth2Login(login -> login.clientRegistrationRepository(registrations)
                .loginPage("/api/v1/auth/oidc/login")
                .authorizedClientRepository(new DiscardingAuthorizedClientRepository())
                .authorizationEndpoint(endpoint -> endpoint.baseUri(OIDC_AUTHORIZE_PATH)
                        .authorizationRequestRepository(requests)
                        .authorizationRequestResolver(resolver))
                .redirectionEndpoint(endpoint -> endpoint.baseUri("/api/v1/auth/oidc/callback"))
                .successHandler(handlers.success())
                .failureHandler(handlers.failure()));
    }

    private static final class DiscardingAuthorizedClientRepository implements OAuth2AuthorizedClientRepository {

        @Override
        public <T extends OAuth2AuthorizedClient> T loadAuthorizedClient(
                String clientRegistrationId, Authentication principal, HttpServletRequest request) {
            return null;
        }

        @Override
        public void saveAuthorizedClient(
                OAuth2AuthorizedClient authorizedClient,
                Authentication principal,
                HttpServletRequest request,
                HttpServletResponse response) {}

        @Override
        public void removeAuthorizedClient(
                String clientRegistrationId,
                Authentication principal,
                HttpServletRequest request,
                HttpServletResponse response) {}
    }

    private static final class CsrfCookieFilter extends OncePerRequestFilter {

        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                throws ServletException, IOException {
            CsrfToken token = (CsrfToken) request.getAttribute(CsrfToken.class.getName());
            if (token != null) {
                token.getToken();
            }
            chain.doFilter(request, response);
        }
    }
}

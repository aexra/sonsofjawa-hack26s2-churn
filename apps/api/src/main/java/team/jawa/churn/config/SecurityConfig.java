package team.jawa.churn.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.www.BasicAuthenticationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.web.filter.OncePerRequestFilter;
import team.jawa.churn.auth.AuthProperties;
import team.jawa.churn.auth.CookieService;
import team.jawa.churn.auth.JwtCookieAuthenticationFilter;
import team.jawa.churn.auth.JwtService;
import team.jawa.churn.web.ProblemWriter;

@Configuration
class SecurityConfig {

    @Bean
    PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }

    @Bean
    SecurityFilterChain securityFilterChain(
            HttpSecurity http, AuthProperties auth, JwtService jwt, CookieService cookies, ProblemWriter problems)
            throws Exception {
        CookieCsrfTokenRepository csrfRepository = CookieCsrfTokenRepository.withHttpOnlyFalse();
        csrfRepository.setCookieCustomizer(cookie -> cookie.sameSite("Strict").secure(auth.cookieSecure()));
        RequestMatcher hasAuthorizationHeader = request -> request.getHeader("Authorization") != null;
        PathPatternRequestMatcher.Builder paths = PathPatternRequestMatcher.withDefaults();

        return http.csrf(csrf -> csrf.csrfTokenRepository(csrfRepository)
                        .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler())
                        .ignoringRequestMatchers(
                                hasAuthorizationHeader,
                                paths.matcher(HttpMethod.POST, "/api/v1/auth/login"),
                                paths.matcher(HttpMethod.POST, "/api/v1/auth/refresh")))
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
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
                        .hasRole("USER")
                        .requestMatchers(HttpMethod.PATCH, "/api/v1/model/settings")
                        .hasRole("ADMIN")
                        .requestMatchers("/api/v1/source/**", "/api/v1/recalc", "/api/v1/admin/**", "/metrics")
                        .hasRole("ADMIN")
                        .anyRequest()
                        .denyAll())
                .exceptionHandling(e -> e.authenticationEntryPoint((request, response, exception) -> problems.write(
                                response, HttpStatus.UNAUTHORIZED, "unauthenticated", "authentication required"))
                        .accessDeniedHandler((request, response, exception) -> {
                            if (exception instanceof CsrfException) {
                                problems.write(response, HttpStatus.FORBIDDEN, "csrf_invalid", "invalid csrf token");
                            } else {
                                problems.write(response, HttpStatus.FORBIDDEN, "forbidden", "access denied");
                            }
                        }))
                .build();
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

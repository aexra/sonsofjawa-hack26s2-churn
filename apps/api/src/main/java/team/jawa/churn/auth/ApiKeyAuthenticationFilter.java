package team.jawa.churn.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import team.jawa.churn.web.ProblemWriter;

public class ApiKeyAuthenticationFilter extends OncePerRequestFilter {

    private static final String BEARER = "Bearer ";
    private static final String BASIC = "Basic ";

    private final ApiKeyService keys;
    private final ProblemWriter problems;

    public ApiKeyAuthenticationFilter(ApiKeyService keys, ProblemWriter problems) {
        this.keys = keys;
        this.problems = problems;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header == null) {
            chain.doFilter(request, response);
            return;
        }
        Optional<ApiKeyPrincipal> principal = presentedKey(header).flatMap(keys::authenticate);
        if (principal.isEmpty()) {
            problems.write(response, HttpStatus.UNAUTHORIZED, "unauthenticated", "authentication required");
            return;
        }
        List<SimpleGrantedAuthority> authorities = principal.get().scopes().stream()
                .map(scope -> new SimpleGrantedAuthority("SCOPE_" + scope))
                .toList();
        SecurityContextHolder.getContext()
                .setAuthentication(
                        UsernamePasswordAuthenticationToken.authenticated(principal.get(), null, authorities));
        chain.doFilter(request, response);
    }

    private static Optional<String> presentedKey(String header) {
        if (header.regionMatches(true, 0, BEARER, 0, BEARER.length())) {
            return Optional.of(header.substring(BEARER.length()).trim());
        }
        if (header.regionMatches(true, 0, BASIC, 0, BASIC.length())) {
            try {
                String decoded = new String(
                        Base64.getDecoder()
                                .decode(header.substring(BASIC.length()).trim()),
                        StandardCharsets.UTF_8);
                int separator = decoded.indexOf(':');
                return separator < 0 ? Optional.empty() : Optional.of(decoded.substring(separator + 1));
            } catch (IllegalArgumentException e) {
                return Optional.empty();
            }
        }
        return Optional.empty();
    }
}

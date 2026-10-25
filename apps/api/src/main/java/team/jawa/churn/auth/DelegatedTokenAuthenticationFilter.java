package team.jawa.churn.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.Optional;
import org.slf4j.MDC;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.filter.OncePerRequestFilter;
import team.jawa.churn.web.ProblemWriter;

public class DelegatedTokenAuthenticationFilter extends OncePerRequestFilter {

    public static final String MDC_KEY = "via";

    private static final String BEARER = "Bearer ";
    private static final String BOT_KEY_PREFIX = "ck_";

    private static final SecurityContextRepository CONTEXTS = new RequestAttributeSecurityContextRepository();

    private final JwtService jwt;
    private final ProblemWriter problems;

    public DelegatedTokenAuthenticationFilter(JwtService jwt, ProblemWriter problems) {
        this.jwt = jwt;
        this.problems = problems;
    }

    static Optional<String> presentedToken(String header) {
        if (!header.regionMatches(true, 0, BEARER, 0, BEARER.length())) {
            return Optional.empty();
        }
        String token = header.substring(BEARER.length()).trim();
        return token.startsWith(BOT_KEY_PREFIX) ? Optional.empty() : Optional.of(token);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        Optional<String> token = header == null ? Optional.empty() : presentedToken(header);
        if (token.isEmpty()) {
            chain.doFilter(request, response);
            return;
        }
        Optional<AuthenticatedUser> user =
                HttpMethod.GET.matches(request.getMethod()) ? token.flatMap(jwt::parseDelegated) : Optional.empty();
        if (user.isEmpty()) {
            problems.write(response, HttpStatus.UNAUTHORIZED, "unauthenticated", "authentication required");
            return;
        }
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                user.get(), null, List.of(new SimpleGrantedAuthority("SCOPE_read"))));
        SecurityContextHolder.setContext(context);
        CONTEXTS.saveContext(context, request, response);
        MDC.put(MDC_KEY, "assistant");
        try {
            chain.doFilter(request, response);
        } finally {
            MDC.remove(MDC_KEY);
        }
    }
}

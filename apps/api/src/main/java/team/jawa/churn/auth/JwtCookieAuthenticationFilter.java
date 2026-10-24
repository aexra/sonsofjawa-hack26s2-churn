package team.jawa.churn.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.filter.OncePerRequestFilter;

public class JwtCookieAuthenticationFilter extends OncePerRequestFilter {

    private static final SecurityContextRepository CONTEXTS = new RequestAttributeSecurityContextRepository();

    private final JwtService jwt;
    private final CookieService cookies;

    public JwtCookieAuthenticationFilter(JwtService jwt, CookieService cookies) {
        this.jwt = jwt;
        this.cookies = cookies;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (SecurityContextHolder.getContext().getAuthentication() == null) {
            cookies.accessToken(request).flatMap(jwt::parse).ifPresent(user -> {
                List<GrantedAuthority> authorities = user.admin()
                        ? List.of(new SimpleGrantedAuthority("ROLE_USER"), new SimpleGrantedAuthority("ROLE_ADMIN"))
                        : List.of(new SimpleGrantedAuthority("ROLE_USER"));
                SecurityContext context = SecurityContextHolder.createEmptyContext();
                context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(user, null, authorities));
                SecurityContextHolder.setContext(context);
                CONTEXTS.saveContext(context, request, response);
            });
        }
        chain.doFilter(request, response);
    }
}

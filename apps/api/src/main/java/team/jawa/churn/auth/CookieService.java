package team.jawa.churn.auth;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.util.Optional;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Service;

@Service
public class CookieService {

    public static final String ACCESS_COOKIE = "churn_at";
    public static final String REFRESH_COOKIE = "churn_rt";

    private static final String ACCESS_PATH = "/";
    private static final String REFRESH_PATH = "/api/v1/auth";

    private final AuthProperties properties;

    CookieService(AuthProperties properties) {
        this.properties = properties;
    }

    public HttpHeaders sessionHeaders(String accessToken, String refreshToken) {
        HttpHeaders headers = new HttpHeaders();
        headers.add(
                HttpHeaders.SET_COOKIE,
                cookie(ACCESS_COOKIE, accessToken, ACCESS_PATH, properties.accessTtl())
                        .toString());
        headers.add(
                HttpHeaders.SET_COOKIE,
                cookie(REFRESH_COOKIE, refreshToken, REFRESH_PATH, properties.refreshTtl())
                        .toString());
        return headers;
    }

    public HttpHeaders clearHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.add(
                HttpHeaders.SET_COOKIE,
                cookie(ACCESS_COOKIE, "", ACCESS_PATH, Duration.ZERO).toString());
        headers.add(
                HttpHeaders.SET_COOKIE,
                cookie(REFRESH_COOKIE, "", REFRESH_PATH, Duration.ZERO).toString());
        return headers;
    }

    public Optional<String> accessToken(HttpServletRequest request) {
        return read(request, ACCESS_COOKIE);
    }

    public Optional<String> refreshToken(HttpServletRequest request) {
        return read(request, REFRESH_COOKIE);
    }

    private Optional<String> read(HttpServletRequest request, String name) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return Optional.empty();
        }
        for (Cookie cookie : cookies) {
            if (name.equals(cookie.getName()) && !cookie.getValue().isEmpty()) {
                return Optional.of(cookie.getValue());
            }
        }
        return Optional.empty();
    }

    private ResponseCookie cookie(String name, String value, String path, Duration maxAge) {
        return ResponseCookie.from(name, value)
                .httpOnly(true)
                .secure(properties.cookieSecure())
                .sameSite("Strict")
                .path(path)
                .maxAge(maxAge)
                .build();
    }
}

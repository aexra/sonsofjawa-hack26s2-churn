package team.jawa.churn.auth;

import java.util.Locale;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import team.jawa.churn.web.ApiException;

@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    public record Session(UserAccount user, String accessToken, String refreshToken) {}

    private final AuthProperties properties;
    private final UserRepository users;
    private final RefreshTokenService refreshTokens;
    private final JwtService jwt;
    private final PasswordEncoder encoder;
    private final String absentUserHash;

    AuthService(
            AuthProperties properties,
            UserRepository users,
            RefreshTokenService refreshTokens,
            JwtService jwt,
            PasswordEncoder encoder) {
        this.properties = properties;
        this.users = users;
        this.refreshTokens = refreshTokens;
        this.jwt = jwt;
        this.encoder = encoder;
        this.absentUserHash = encoder.encode("absent-user");
    }

    public Session login(String login, String password, String remoteAddress) {
        if (!properties.localEnabled()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "local_auth_disabled", "local authentication is disabled");
        }
        String normalized = login.strip().toLowerCase(Locale.ROOT);
        String logged = normalized.replaceAll("[\\r\\n]", "_");
        Optional<UserAccount> found = users.findByLogin(normalized).filter(user -> "local".equals(user.authProvider()));
        boolean passwordMatches =
                encoder.matches(password, found.map(UserAccount::passwordHash).orElse(absentUserHash));
        if (found.isEmpty() || !passwordMatches) {
            log.warn("login failed: login={} ip={}", logged, remoteAddress);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "invalid_credentials", "invalid login or password");
        }
        UserAccount user = found.get();
        if (!user.enabled()) {
            log.warn("login rejected for disabled account: login={} ip={}", logged, remoteAddress);
            throw new ApiException(HttpStatus.FORBIDDEN, "account_disabled", "account is disabled");
        }
        users.touchLastLogin(user.id());
        return new Session(user, jwt.issue(user), refreshTokens.issue(user.id()));
    }

    public Session refresh(String refreshToken) {
        RefreshTokenService.Rotation rotation = refreshTokens
                .rotate(refreshToken)
                .orElseThrow(
                        () -> new ApiException(HttpStatus.UNAUTHORIZED, "refresh_invalid", "refresh token is invalid"));
        UserAccount user = users.findById(rotation.userId())
                .filter(UserAccount::enabled)
                .orElseThrow(
                        () -> new ApiException(HttpStatus.UNAUTHORIZED, "refresh_invalid", "refresh token is invalid"));
        return new Session(user, jwt.issue(user), rotation.token());
    }

    public void logout(Optional<String> refreshToken) {
        refreshToken.ifPresent(refreshTokens::revokeFamilyOf);
    }
}

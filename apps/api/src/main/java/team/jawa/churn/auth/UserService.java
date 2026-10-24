package team.jawa.churn.auth;

import java.util.List;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import team.jawa.churn.web.ApiException;

@Service
public class UserService {

    private static final Logger log = LoggerFactory.getLogger(UserService.class);

    public record Patch(String role, Boolean enabled, String displayName, String email, String password) {}

    private final UserRepository users;
    private final RefreshTokenService refreshTokens;
    private final PasswordEncoder encoder;

    UserService(UserRepository users, RefreshTokenService refreshTokens, PasswordEncoder encoder) {
        this.users = users;
        this.refreshTokens = refreshTokens;
        this.encoder = encoder;
    }

    public List<UserAccount> list() {
        return users.findAll();
    }

    @Transactional
    public UserAccount create(
            String login, String password, String role, String email, String displayName, String actor) {
        String normalized = login.strip().toLowerCase(Locale.ROOT);
        if (users.findByLogin(normalized).isPresent()) {
            throw loginTaken();
        }
        long id;
        try {
            id = users.insertLocal(normalized, displayName, email, role, encoder.encode(password));
        } catch (DuplicateKeyException e) {
            throw loginTaken();
        }
        log.info("user created: login={} role={} by={}", normalized, role, actor);
        return users.findById(id).orElseThrow();
    }

    @Transactional
    public UserAccount update(long id, Patch patch, long actorId) {
        users.lockAdministration();
        UserAccount user = find(id);
        boolean oidc = "oidc".equals(user.authProvider());
        if (oidc && patch.password() != null) {
            throw unmanaged("password is managed by the identity provider");
        }
        if (oidc && patch.role() != null && !patch.role().equals(user.role())) {
            throw unmanaged("role is managed by the identity provider");
        }
        String role = patch.role() != null ? patch.role() : user.role();
        boolean enabled = patch.enabled() != null ? patch.enabled() : user.enabled();
        boolean losesAdministration =
                "admin".equals(user.role()) && user.enabled() && (!"admin".equals(role) || !enabled);
        if (losesAdministration && users.countOtherActiveAdmins(id) == 0) {
            throw lastAdmin();
        }
        if (id == actorId && user.enabled() && !enabled) {
            throw new ApiException(HttpStatus.CONFLICT, "conflict", "you cannot disable yourself");
        }
        String passwordHash = patch.password() != null ? encoder.encode(patch.password()) : user.passwordHash();
        users.update(
                id,
                role,
                enabled,
                patch.displayName() != null ? patch.displayName() : user.displayName(),
                patch.email() != null ? patch.email() : user.email(),
                passwordHash);
        if ((user.enabled() && !enabled) || patch.password() != null) {
            refreshTokens.revokeAllOf(id);
        }
        log.info(
                "user updated: login={} role={} enabled={} passwordChanged={} by={}",
                user.login(),
                role,
                enabled,
                patch.password() != null,
                actorId);
        return users.findById(id).orElseThrow();
    }

    @Transactional
    public void delete(long id, long actorId) {
        users.lockAdministration();
        UserAccount user = find(id);
        if ("admin".equals(user.role()) && user.enabled() && users.countOtherActiveAdmins(id) == 0) {
            throw lastAdmin();
        }
        if (id == actorId) {
            throw new ApiException(HttpStatus.CONFLICT, "conflict", "you cannot delete yourself");
        }
        users.delete(id);
        log.info("user deleted: login={} by={}", user.login(), actorId);
    }

    private UserAccount find(long id) {
        return users.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "user not found"));
    }

    private static ApiException loginTaken() {
        return new ApiException(HttpStatus.CONFLICT, "conflict", "login is already taken");
    }

    private static ApiException lastAdmin() {
        return new ApiException(
                HttpStatus.CONFLICT, "last_admin", "the last active administrator cannot be removed or demoted");
    }

    private static ApiException unmanaged(String detail) {
        return new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "validation_failed", detail);
    }
}

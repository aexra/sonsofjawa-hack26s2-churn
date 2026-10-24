package team.jawa.churn.auth;

import java.util.Locale;
import java.util.Optional;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OidcUserProvisioner {

    private static final int MAX_LOGIN = 64;
    private static final int MIN_LOGIN = 3;

    private final UserRepository users;
    private final OidcProperties properties;

    OidcUserProvisioner(UserRepository users, OidcProperties properties) {
        this.users = users;
        this.properties = properties;
    }

    @Transactional
    public Optional<UserAccount> provision(OidcUser principal) {
        Optional<String> role = OidcRoleMapper.resolve(
                principal.getClaims(), properties.rolesClaim(), properties.adminRole(), properties.userRole());
        if (role.isEmpty()) {
            return Optional.empty();
        }
        String subject = principal.getSubject();
        String displayName = principal.getFullName();
        String email = principal.getEmail();
        Optional<UserAccount> existing = users.findByOidcSubject(subject);
        if (existing.isPresent()) {
            UserAccount user = existing.get();
            if (!user.enabled()) {
                return Optional.empty();
            }
            users.updateOidc(user.id(), role.get(), displayName, email);
            return users.findById(user.id());
        }
        try {
            long id = users.insertOidc(freeLogin(principal), displayName, email, role.get(), subject);
            return users.findById(id);
        } catch (DuplicateKeyException e) {
            return users.findByOidcSubject(subject).filter(UserAccount::enabled);
        }
    }

    private String freeLogin(OidcUser principal) {
        String base = sanitize(principal);
        String candidate = base;
        if (users.findByLogin(candidate).isPresent()) {
            candidate = fit(base, "-sso");
            for (int n = 2; users.findByLogin(candidate).isPresent(); n++) {
                candidate = fit(base, "-sso" + n);
            }
        }
        return candidate;
    }

    private static String fit(String base, String suffix) {
        int room = MAX_LOGIN - suffix.length();
        return (base.length() > room ? base.substring(0, room) : base) + suffix;
    }

    private static String sanitize(OidcUser principal) {
        String source = principal.getPreferredUsername();
        if (source == null || source.isBlank()) {
            String email = principal.getEmail();
            source = email != null && email.contains("@")
                    ? email.substring(0, email.indexOf('@'))
                    : principal.getSubject();
        }
        String login = source.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9._-]", "_");
        if (login.length() > MAX_LOGIN) {
            login = login.substring(0, MAX_LOGIN);
        }
        return login.length() < MIN_LOGIN ? login + "-sso" : login;
    }
}

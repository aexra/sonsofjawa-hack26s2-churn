package team.jawa.churn.auth;

import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
class BootstrapAdminRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(BootstrapAdminRunner.class);
    private static final int MIN_PASSWORD_LENGTH = 8;

    private final AuthProperties auth;
    private final OidcProperties oidc;
    private final UserRepository users;
    private final PasswordEncoder encoder;

    BootstrapAdminRunner(AuthProperties auth, OidcProperties oidc, UserRepository users, PasswordEncoder encoder) {
        this.auth = auth;
        this.oidc = oidc;
        this.users = users;
        this.encoder = encoder;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!auth.localEnabled()) {
            return;
        }
        if (!users.existsAdmin()) {
            createAdmin();
        }
        createDemoUser();
    }

    private void createAdmin() {
        String password = auth.bootstrapAdminPassword();
        if (isBlank(password)) {
            if (!oidc.enabled()) {
                throw new IllegalStateException("No administrator can log in: set AUTH_BOOTSTRAP_ADMIN_PASSWORD");
            }
            return;
        }
        create(auth.bootstrapAdminLogin(), password, "admin", "AUTH_BOOTSTRAP_ADMIN_PASSWORD");
    }

    private void createDemoUser() {
        String password = auth.bootstrapUserPassword();
        if (isBlank(password)) {
            return;
        }
        create(auth.bootstrapUserLogin(), password, "user", "AUTH_BOOTSTRAP_USER_PASSWORD");
    }

    private void create(String rawLogin, String password, String role, String variable) {
        if (password.length() < MIN_PASSWORD_LENGTH) {
            throw new IllegalStateException(variable + " must be at least " + MIN_PASSWORD_LENGTH + " characters");
        }
        String login = rawLogin.strip().toLowerCase(Locale.ROOT);
        if (users.findByLogin(login).isPresent()) {
            return;
        }
        users.insertLocal(login, login, null, role, encoder.encode(password));
        log.info("bootstrap user created: login={} role={}", login, role);
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}

package team.jawa.churn.auth;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.NoOpPasswordEncoder;

@SuppressWarnings("deprecation")
class BootstrapAdminRunnerTest {

    private final UserRepository users = mock(UserRepository.class);

    private BootstrapAdminRunner runner(String adminPassword, String issuer) {
        AuthProperties auth = new AuthProperties(
                true, "", Duration.ofMinutes(15), Duration.ofDays(30), false, "Admin", adminPassword, "analyst", "");
        return new BootstrapAdminRunner(
                auth, new OidcProperties(issuer, "sso"), users, NoOpPasswordEncoder.getInstance());
    }

    @Test
    void failsWhenNobodyCanLogIn() {
        when(users.existsAdmin()).thenReturn(false);

        assertThatThrownBy(() -> runner("", "").run(null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("No administrator can log in: set AUTH_BOOTSTRAP_ADMIN_PASSWORD");
    }

    @Test
    void skipsAdminWhenOidcIsConfigured() {
        when(users.existsAdmin()).thenReturn(false);

        runner("", "https://idp.example/realms/r").run(null);

        verify(users, never()).insertLocal(any(), any(), any(), any());
    }

    @Test
    void rejectsShortPassword() {
        when(users.existsAdmin()).thenReturn(false);

        assertThatThrownBy(() -> runner("short", "").run(null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("AUTH_BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters");
    }

    @Test
    void createsAdminWithLowercaseLogin() {
        when(users.existsAdmin()).thenReturn(false);
        when(users.findByLogin("admin")).thenReturn(Optional.empty());

        runner("admin12345", "").run(null);

        verify(users).insertLocal("admin", "admin", "admin", "admin12345");
    }

    @Test
    void leavesExistingAdminAlone() {
        when(users.existsAdmin()).thenReturn(true);

        runner("admin12345", "").run(null);

        verify(users, never()).insertLocal(any(), any(), any(), any());
    }
}

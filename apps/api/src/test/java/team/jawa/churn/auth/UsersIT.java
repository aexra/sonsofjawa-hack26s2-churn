package team.jawa.churn.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import team.jawa.churn.IntegrationTest;

class UsersIT extends IntegrationTest {

    private static final Pattern ID = Pattern.compile("\"id\":(\\d+)");

    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    @AfterEach
    void resetUsers() {
        jdbc.update("delete from users where login not in ('admin', 'analyst')");
        jdbc.update("update users set enabled = true, role = 'admin' where login = 'admin'");
        jdbc.update("update users set enabled = true, role = 'user' where login = 'analyst'");
    }

    private Client login(String login, String password) throws Exception {
        Client client = client();
        HttpResponse<String> response = client.post(
                "/api/v1/auth/login", "{\"login\":\"" + login + "\",\"password\":\"" + password + "\"}", false);
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(client.get("/api/v1/auth/me").statusCode()).isEqualTo(200);
        return client;
    }

    private HttpResponse<String> send(Client client, String method, String path, String body) throws Exception {
        return client.exchange(method, path, body, Map.of(), true);
    }

    private long create(Client admin, String login, String role) throws Exception {
        HttpResponse<String> response = send(
                admin,
                "POST",
                "/api/v1/admin/users",
                "{\"login\":\"" + login + "\",\"password\":\"password-" + login + "\",\"role\":\"" + role + "\"}");
        assertThat(response.statusCode()).as(response.body()).isEqualTo(201);
        Matcher id = ID.matcher(response.body());
        assertThat(id.find()).isTrue();
        return Long.parseLong(id.group(1));
    }

    private long idOf(String login) {
        return jdbc.queryForObject("select id from users where login = ?", Long.class, login);
    }

    @Test
    void createdUserCanLogInButCannotChangeTheModel() throws Exception {
        Client admin = login("admin", "admin12345");

        create(admin, "analyst2", "user");

        Client analyst2 = login("analyst2", "password-analyst2");
        assertThat(send(analyst2, "PATCH", "/api/v1/model/settings", "{}").statusCode())
                .isEqualTo(403);
        assertThat(analyst2.get("/api/v1/admin/users").statusCode()).isEqualTo(403);
    }

    @Test
    void listShowsUsersWithoutPasswordHashes() throws Exception {
        Client admin = login("admin", "admin12345");

        HttpResponse<String> response = admin.get("/api/v1/admin/users");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body())
                .contains("\"login\":\"admin\"")
                .contains("\"login\":\"analyst\"")
                .contains("\"authProvider\":\"local\"")
                .doesNotContain("password")
                .doesNotContain("$2");
    }

    @Test
    void duplicateAndInvalidCreationsAreRejected() throws Exception {
        Client admin = login("admin", "admin12345");
        create(admin, "taken", "user");

        assertThat(send(
                                admin,
                                "POST",
                                "/api/v1/admin/users",
                                "{\"login\":\"taken\",\"password\":\"password-1\",\"role\":\"user\"}")
                        .statusCode())
                .isEqualTo(409);
        assertThat(send(
                                admin,
                                "POST",
                                "/api/v1/admin/users",
                                "{\"login\":\"TAKEN\",\"password\":\"password-1\",\"role\":\"user\"}")
                        .statusCode())
                .isEqualTo(422);
        for (String body : new String[] {
            "{\"login\":\"ab\",\"password\":\"password-1\",\"role\":\"user\"}",
            "{\"login\":\"bad login\",\"password\":\"password-1\",\"role\":\"user\"}",
            "{\"login\":\"shortpass\",\"password\":\"1234567\",\"role\":\"user\"}"
        }) {
            HttpResponse<String> response = send(admin, "POST", "/api/v1/admin/users", body);
            assertThat(response.statusCode()).as(body).isEqualTo(422);
            assertThat(response.body()).contains("validation_failed");
        }
    }

    @Test
    void onlyAdministratorsManageUsers() throws Exception {
        assertThat(client().get("/api/v1/admin/users").statusCode()).isEqualTo(401);
        Client analyst = login("analyst", "analyst12345");

        assertThat(analyst.get("/api/v1/admin/users").statusCode()).isEqualTo(403);
        assertThat(send(analyst, "DELETE", "/api/v1/admin/users/" + idOf("admin"), null)
                        .statusCode())
                .isEqualTo(403);
    }

    @Test
    void roleCanBeChangedBetweenUserAndAdmin() throws Exception {
        Client admin = login("admin", "admin12345");
        long id = create(admin, "promoted", "user");

        HttpResponse<String> promote = send(
                admin, "PATCH", "/api/v1/admin/users/" + id, "{\"role\":\"admin\",\"displayName\":\"promoted one\"}");

        assertThat(promote.statusCode()).isEqualTo(200);
        assertThat(promote.body()).contains("\"role\":\"admin\"").contains("\"displayName\":\"promoted one\"");
        Client promoted = login("promoted", "password-promoted");
        assertThat(promoted.get("/api/v1/admin/users").statusCode()).isEqualTo(200);
        assertThat(send(admin, "PATCH", "/api/v1/admin/users/" + id, "{\"role\":\"user\"}")
                        .statusCode())
                .isEqualTo(200);
    }

    @Test
    void lastActiveAdministratorIsProtected() throws Exception {
        Client admin = login("admin", "admin12345");
        long adminId = idOf("admin");

        for (String body : new String[] {"{\"role\":\"user\"}", "{\"enabled\":false}"}) {
            HttpResponse<String> response = send(admin, "PATCH", "/api/v1/admin/users/" + adminId, body);
            assertThat(response.statusCode()).as(body).isEqualTo(409);
            assertThat(response.body()).contains("\"code\":\"last_admin\"");
        }
        HttpResponse<String> delete = send(admin, "DELETE", "/api/v1/admin/users/" + adminId, null);
        assertThat(delete.statusCode()).isEqualTo(409);
        assertThat(delete.body()).contains("\"code\":\"last_admin\"");
    }

    @Test
    void disabledAdministratorsDoNotCountAsActive() throws Exception {
        Client admin = login("admin", "admin12345");
        long other = create(admin, "second-admin", "admin");
        assertThat(send(admin, "PATCH", "/api/v1/admin/users/" + other, "{\"enabled\":false}")
                        .statusCode())
                .isEqualTo(200);

        HttpResponse<String> response =
                send(admin, "PATCH", "/api/v1/admin/users/" + idOf("admin"), "{\"role\":\"user\"}");

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(response.body()).contains("\"code\":\"last_admin\"");
    }

    @Test
    void nobodyCanDisableOrDeleteThemselves() throws Exception {
        Client admin = login("admin", "admin12345");
        create(admin, "second-admin", "admin");
        long adminId = idOf("admin");

        HttpResponse<String> disable = send(admin, "PATCH", "/api/v1/admin/users/" + adminId, "{\"enabled\":false}");
        HttpResponse<String> delete = send(admin, "DELETE", "/api/v1/admin/users/" + adminId, null);

        assertThat(disable.statusCode()).isEqualTo(409);
        assertThat(disable.body()).contains("\"code\":\"conflict\"");
        assertThat(delete.statusCode()).isEqualTo(409);
        assertThat(delete.body()).contains("\"code\":\"conflict\"");
    }

    @Test
    void anAdministratorMayDemoteThemselvesWhenAnotherOneRemains() throws Exception {
        Client admin = login("admin", "admin12345");
        create(admin, "second-admin", "admin");

        HttpResponse<String> response =
                send(admin, "PATCH", "/api/v1/admin/users/" + idOf("admin"), "{\"role\":\"user\"}");

        assertThat(response.statusCode()).isEqualTo(200);
    }

    @Test
    void disablingRejectsLoginAndRevokesRefreshTokens() throws Exception {
        Client admin = login("admin", "admin12345");
        long id = create(admin, "leaver", "user");
        Client leaver = login("leaver", "password-leaver");

        assertThat(send(admin, "PATCH", "/api/v1/admin/users/" + id, "{\"enabled\":false}")
                        .statusCode())
                .isEqualTo(200);

        HttpResponse<String> relogin =
                client().post("/api/v1/auth/login", "{\"login\":\"leaver\",\"password\":\"password-leaver\"}", false);
        assertThat(relogin.statusCode()).isEqualTo(403);
        assertThat(relogin.body()).contains("account_disabled");
        HttpResponse<String> refresh = leaver.post("/api/v1/auth/refresh", "{}", false);
        assertThat(refresh.statusCode()).isEqualTo(401);
        assertThat(refresh.body()).contains("refresh_invalid");
        assertThat(jdbc.queryForObject(
                        "select count(*) from refresh_tokens where user_id = ? and revoked_at is null",
                        Integer.class,
                        id))
                .isZero();
        assertThat(send(admin, "PATCH", "/api/v1/admin/users/" + id, "{\"enabled\":true}")
                        .statusCode())
                .isEqualTo(200);
        login("leaver", "password-leaver");
    }

    @Test
    void passwordResetReplacesCredentialsAndRevokesRefreshTokens() throws Exception {
        Client admin = login("admin", "admin12345");
        long id = create(admin, "resetter", "user");
        Client session = login("resetter", "password-resetter");

        assertThat(send(admin, "PATCH", "/api/v1/admin/users/" + id, "{\"password\":\"brand-new-pass\"}")
                        .statusCode())
                .isEqualTo(200);

        assertThat(client().post(
                                "/api/v1/auth/login",
                                "{\"login\":\"resetter\",\"password\":\"password-resetter\"}",
                                false)
                        .statusCode())
                .isEqualTo(401);
        login("resetter", "brand-new-pass");
        assertThat(session.post("/api/v1/auth/refresh", "{}", false).statusCode())
                .isEqualTo(401);
        assertThat(send(admin, "PATCH", "/api/v1/admin/users/" + id, "{\"password\":\"short\"}")
                        .statusCode())
                .isEqualTo(422);
    }

    @Test
    void identityProviderUsersKeepTheirRoleAndHaveNoPassword() throws Exception {
        Client admin = login("admin", "admin12345");
        jdbc.update(
                "insert into users (login, role, auth_provider, oidc_subject) values ('sso-user', 'user', 'oidc', 'subject-1')");
        long id = idOf("sso-user");

        HttpResponse<String> role = send(admin, "PATCH", "/api/v1/admin/users/" + id, "{\"role\":\"admin\"}");
        HttpResponse<String> password =
                send(admin, "PATCH", "/api/v1/admin/users/" + id, "{\"password\":\"password-1\"}");
        HttpResponse<String> disable = send(admin, "PATCH", "/api/v1/admin/users/" + id, "{\"enabled\":false}");

        assertThat(role.statusCode()).isEqualTo(422);
        assertThat(role.body()).contains("identity provider");
        assertThat(password.statusCode()).isEqualTo(422);
        assertThat(disable.statusCode()).isEqualTo(200);
    }

    @Test
    void deletedUserCannotLogInAndUnknownIdsAreNotFound() throws Exception {
        Client admin = login("admin", "admin12345");
        long id = create(admin, "short-lived", "user");

        assertThat(send(admin, "DELETE", "/api/v1/admin/users/" + id, null).statusCode())
                .isEqualTo(204);

        assertThat(client().post(
                                "/api/v1/auth/login",
                                "{\"login\":\"short-lived\",\"password\":\"password-short-lived\"}",
                                false)
                        .statusCode())
                .isEqualTo(401);
        assertThat(send(admin, "DELETE", "/api/v1/admin/users/" + id, null).statusCode())
                .isEqualTo(404);
        assertThat(send(admin, "PATCH", "/api/v1/admin/users/999999", "{\"enabled\":false}")
                        .statusCode())
                .isEqualTo(404);
    }
}

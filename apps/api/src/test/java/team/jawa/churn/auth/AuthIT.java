package team.jawa.churn.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import team.jawa.churn.IntegrationTest;

class AuthIT extends IntegrationTest {

    private static final String ADMIN_LOGIN = "{\"login\":\"admin\",\"password\":\"admin12345\"}";
    private static final String ANALYST_LOGIN = "{\"login\":\"analyst\",\"password\":\"analyst12345\"}";

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    BootstrapAdminRunner bootstrap;

    private Client loggedIn(String body) throws Exception {
        Client client = client();
        HttpResponse<String> response = client.post("/api/v1/auth/login", body, false);
        assertThat(response.statusCode()).isEqualTo(200);
        return client;
    }

    @Test
    void protectedPathWithoutCookieIsUnauthenticated() throws Exception {
        HttpResponse<String> response = client().get("/api/v1/customers");

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(response.headers().firstValue("Content-Type").orElseThrow()).startsWith("application/problem+json");
        assertThat(response.body()).contains("\"code\":\"unauthenticated\"");
    }

    @Test
    void loginSetsCookiesAndMeReturnsAdmin() throws Exception {
        Client client = client();

        HttpResponse<String> login = client.post("/api/v1/auth/login", ADMIN_LOGIN, false);

        assertThat(login.statusCode()).isEqualTo(200);
        assertThat(login.headers().allValues("Set-Cookie"))
                .anySatisfy(
                        c -> assertThat(c).startsWith("churn_at=").contains("HttpOnly", "SameSite=Strict", "Path=/"))
                .anySatisfy(c -> assertThat(c)
                        .startsWith("churn_rt=")
                        .contains("HttpOnly", "SameSite=Strict", "Path=/api/v1/auth"));
        HttpResponse<String> me = client.get("/api/v1/auth/me");
        assertThat(me.statusCode()).isEqualTo(200);
        assertThat(me.body()).contains("\"role\":\"admin\"").contains("\"login\":\"admin\"");
    }

    @Test
    void wrongPasswordIsRejected() throws Exception {
        HttpResponse<String> response =
                client().post("/api/v1/auth/login", "{\"login\":\"admin\",\"password\":\"wrong-password\"}", false);

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(response.body()).contains("\"code\":\"invalid_credentials\"");
    }

    @Test
    void unknownLoginIsRejectedTheSameWay() throws Exception {
        HttpResponse<String> response =
                client().post("/api/v1/auth/login", "{\"login\":\"nobody\",\"password\":\"whatever123\"}", false);

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(response.body()).contains("\"code\":\"invalid_credentials\"");
    }

    @Test
    void disabledAccountIsRejected() throws Exception {
        jdbc.update("update public.users set enabled = false where login = 'analyst'");
        try {
            HttpResponse<String> response = client().post("/api/v1/auth/login", ANALYST_LOGIN, false);

            assertThat(response.statusCode()).isEqualTo(403);
            assertThat(response.body()).contains("\"code\":\"account_disabled\"");
        } finally {
            jdbc.update("update public.users set enabled = true where login = 'analyst'");
        }
    }

    @Test
    void logoutRequiresCsrfTokenAndRevokesRefresh() throws Exception {
        Client client = loggedIn(ADMIN_LOGIN);
        String refresh = client.cookie("churn_rt").orElseThrow();

        HttpResponse<String> withoutToken = client.post("/api/v1/auth/logout", "", false);
        assertThat(withoutToken.statusCode()).isEqualTo(403);
        assertThat(withoutToken.body()).contains("\"code\":\"csrf_invalid\"");

        HttpResponse<String> withToken = client.post("/api/v1/auth/logout", "", true);
        assertThat(withToken.statusCode()).isEqualTo(204);

        Client replay = client();
        replay.setCookie("churn_rt", refresh, "/api/v1/auth");
        HttpResponse<String> refreshed = replay.post("/api/v1/auth/refresh", "", false);
        assertThat(refreshed.statusCode()).isEqualTo(401);
        assertThat(refreshed.body()).contains("\"code\":\"refresh_invalid\"");
    }

    @Test
    void refreshRotatesTokenAndReuseRevokesFamily() throws Exception {
        Client client = loggedIn(ADMIN_LOGIN);
        String first = client.cookie("churn_rt").orElseThrow();

        HttpResponse<String> rotated = client.post("/api/v1/auth/refresh", "", false);
        assertThat(rotated.statusCode()).isEqualTo(200);
        String second = client.cookie("churn_rt").orElseThrow();
        assertThat(second).isNotEqualTo(first);

        Client thief = client();
        thief.setCookie("churn_rt", first, "/api/v1/auth");
        HttpResponse<String> reused = thief.post("/api/v1/auth/refresh", "", false);
        assertThat(reused.statusCode()).isEqualTo(401);

        Client legitimate = client();
        legitimate.setCookie("churn_rt", second, "/api/v1/auth");
        HttpResponse<String> afterRevocation = legitimate.post("/api/v1/auth/refresh", "", false);
        assertThat(afterRevocation.statusCode()).isEqualTo(401);
    }

    @Test
    void refreshWithoutCookieIsRejected() throws Exception {
        HttpResponse<String> response = client().post("/api/v1/auth/refresh", "", false);

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(response.body()).contains("\"code\":\"refresh_invalid\"");
    }

    @Test
    void providersArePublic() throws Exception {
        HttpResponse<String> response = client().get("/api/v1/auth/providers");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).contains("\"local\":{\"enabled\":true}").contains("\"oidc\":{\"enabled\":false");
    }

    @Test
    void userRoleCannotReachAdminPaths() throws Exception {
        Client client = loggedIn(ANALYST_LOGIN);

        HttpResponse<String> metrics = client.get("/metrics");

        assertThat(metrics.statusCode()).isEqualTo(403);
        assertThat(metrics.body()).contains("\"code\":\"forbidden\"");
    }

    @Test
    void adminCanReadMetrics() throws Exception {
        Client client = loggedIn(ADMIN_LOGIN);

        assertThat(client.get("/metrics").statusCode()).isEqualTo(200);
    }

    @Test
    void swaggerRequiresLogin() throws Exception {
        assertThat(client().get("/api/v1/docs").statusCode()).isEqualTo(401);
        assertThat(client().get("/api/v1/openapi.yaml").statusCode()).isEqualTo(401);
        assertThat(client().get("/v3/api-docs").statusCode()).isEqualTo(401);
    }

    @Test
    void browserOpeningSwaggerWithoutLoginIsSentToLogin() throws Exception {
        HttpResponse<String> response = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NEVER)
                .build()
                .send(
                        HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/v1/docs"))
                                .header("Accept", "text/html,application/xhtml+xml,*/*;q=0.8")
                                .GET()
                                .build(),
                        HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(302);
        assertThat(response.headers().firstValue("Location")).contains("/login?next=%2Fapi%2Fv1%2Fdocs");
        assertThat(response.body()).isEmpty();
    }

    @Test
    void swaggerIsServedAfterLogin() throws Exception {
        Client client = loggedIn(ANALYST_LOGIN);

        HttpResponse<String> docs = client.get("/api/v1/docs");

        assertThat(docs.statusCode()).isEqualTo(200);
        assertThat(docs.body()).contains("swagger-ui");
    }

    @Test
    void swaggerConfigIsServedAfterLoginButGeneratedSpecIsNot() throws Exception {
        Client client = loggedIn(ANALYST_LOGIN);

        assertThat(client.get("/v3/api-docs/swagger-config").statusCode()).isEqualTo(200);
        assertThat(client.get("/v3/api-docs").statusCode()).isEqualTo(403);
    }

    @Test
    void csrfIsNotCheckedForRequestsWithAuthorizationHeader() throws Exception {
        HttpResponse<String> response =
                client().postWithHeader("/api/v1/auth/logout", "", "Authorization", "Bearer ck_unknown");

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(response.body()).contains("\"code\":\"unauthenticated\"");
    }

    @Test
    void servedSpecificationMatchesRepositoryFile() throws Exception {
        Client client = loggedIn(ANALYST_LOGIN);

        HttpResponse<String> response = client.get("/api/v1/openapi.yaml");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).isEqualTo(Files.readString(Path.of("../../openapi.yaml")));
    }

    @Test
    void bootstrapDoesNotTouchExistingUsers() throws Exception {
        Integer before = jdbc.queryForObject("select count(*) from public.users", Integer.class);
        String hash = jdbc.queryForObject("select password_hash from public.users where login = 'admin'", String.class);

        bootstrap.run(null);

        assertThat(jdbc.queryForObject("select count(*) from public.users", Integer.class))
                .isEqualTo(before);
        assertThat(jdbc.queryForObject("select password_hash from public.users where login = 'admin'", String.class))
                .isEqualTo(hash);
    }
}

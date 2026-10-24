package team.jawa.churn.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import team.jawa.churn.IntegrationTest;

class ApiKeysIT extends IntegrationTest {

    private static final Pattern SECRET = Pattern.compile("\"secret\":\"(ck_[a-z0-9]{8}_[0-9A-Za-z]{32})\"");
    private static final Pattern ID = Pattern.compile("\"key\":\\{\"id\":(\\d+)");

    @Autowired
    JdbcTemplate jdbc;

    private Client login(String login, String password) throws Exception {
        Client client = client();
        HttpResponse<String> response = client.post(
                "/api/v1/auth/login", "{\"login\":\"" + login + "\",\"password\":\"" + password + "\"}", false);
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(client.get("/api/v1/auth/me").statusCode()).isEqualTo(200);
        return client;
    }

    private record Issued(long id, String secret) {}

    private Issued issue(String name, String scopes) throws Exception {
        HttpResponse<String> response = login("admin", "admin12345")
                .exchange(
                        "POST",
                        "/api/v1/admin/api-keys",
                        "{\"name\":\"" + name + "\",\"scopes\":" + scopes + "}",
                        Map.of(),
                        true);
        assertThat(response.statusCode()).isEqualTo(201);
        Matcher secret = SECRET.matcher(response.body());
        Matcher id = ID.matcher(response.body());
        assertThat(secret.find()).isTrue();
        assertThat(id.find()).isTrue();
        return new Issued(Long.parseLong(id.group(1)), secret.group(1));
    }

    private int status(String method, String path, String authorization) throws Exception {
        return client().exchange(method, path, null, Map.of("Authorization", authorization), false)
                .statusCode();
    }

    private static String bearer(String key) {
        return "Bearer " + key;
    }

    private static String basic(String key) {
        return "Basic " + Base64.getEncoder().encodeToString(("bot:" + key).getBytes());
    }

    private static void assertAllowed(int status) {
        assertThat(status).isNotIn(401, 403);
    }

    @Test
    void csrfTokenStaysValidAcrossSeveralUnsafeRequests() throws Exception {
        Client admin = login("admin", "admin12345");

        for (int i = 0; i < 3; i++) {
            assertThat(admin.get("/api/v1/auth/me").statusCode()).isEqualTo(200);
            assertThat(admin.exchange(
                                    "POST",
                                    "/api/v1/admin/api-keys",
                                    "{\"name\":\"repeat-" + i + "\",\"scopes\":[\"read\"]}",
                                    Map.of(),
                                    true)
                            .statusCode())
                    .isEqualTo(201);
        }
    }

    @Test
    void issuedKeyHasDocumentedFormatAndIsStoredHashed() throws Exception {
        Issued issued = issue("format-check", "[\"read\"]");

        String prefix = issued.secret().substring(3, 11);
        String storedHash =
                jdbc.queryForObject("select secret_hash from api_keys where id = ?", String.class, issued.id());
        assertThat(jdbc.queryForObject("select prefix from api_keys where id = ?", String.class, issued.id()))
                .isEqualTo(prefix);
        assertThat(storedHash).hasSize(64).doesNotContain(issued.secret().substring(12));
    }

    @Test
    void listNeverReturnsSecretsAndShowsStatus() throws Exception {
        Issued issued = issue("listed", "[\"read\",\"metrics\"]");

        HttpResponse<String> list = login("admin", "admin12345").get("/api/v1/admin/api-keys");

        assertThat(list.statusCode()).isEqualTo(200);
        assertThat(list.body())
                .contains("\"name\":\"listed\"")
                .contains("\"prefix\":\"" + issued.secret().substring(3, 11) + "\"");
        assertThat(list.body()).doesNotContain(issued.secret().substring(12)).doesNotContain("secret");
        assertThat(list.body()).contains("\"createdBy\":\"admin\"");
    }

    @Test
    void readScopeOpensReadEndpointsOnly() throws Exception {
        String key = issue("reader", "[\"read\"]").secret();

        assertAllowed(status("GET", "/api/v1/customers", bearer(key)));
        assertAllowed(status("GET", "/api/v1/analytics/summary", bearer(key)));
        assertAllowed(status("GET", "/api/v1/recalc/status", basic(key)));
        assertThat(status("POST", "/api/v1/recalc", bearer(key))).isEqualTo(403);
        assertThat(status("POST", "/api/v1/source/services", bearer(key))).isEqualTo(403);
        assertThat(status("PATCH", "/api/v1/model/settings", bearer(key))).isEqualTo(403);
        assertThat(status("GET", "/api/v1/admin/api-keys", bearer(key))).isEqualTo(403);
        assertThat(status("GET", "/metrics", bearer(key))).isEqualTo(403);
    }

    @Test
    void ingestScopeLoadsDataAndRecalculatesButCannotChangeTheModel() throws Exception {
        String key = issue("loader", "[\"ingest\"]").secret();

        assertAllowed(status("POST", "/api/v1/source/services", bearer(key)));
        assertAllowed(status("POST", "/api/v1/recalc", basic(key)));
        assertThat(status("PATCH", "/api/v1/model/settings", bearer(key))).isEqualTo(403);
        assertThat(status("GET", "/api/v1/customers", bearer(key))).isEqualTo(403);
        assertThat(status("GET", "/metrics", bearer(key))).isEqualTo(403);
    }

    @Test
    void metricsScopeOpensMetricsWithBearerAndBasic() throws Exception {
        String key = issue("prometheus", "[\"metrics\"]").secret();

        HttpResponse<String> bearerResponse =
                client().exchange("GET", "/metrics", null, Map.of("Authorization", bearer(key)), false);
        HttpResponse<String> basicResponse =
                client().exchange("GET", "/metrics", null, Map.of("Authorization", basic(key)), false);

        assertThat(bearerResponse.statusCode()).isEqualTo(200);
        assertThat(bearerResponse.body()).contains("jvm_");
        assertThat(basicResponse.statusCode()).isEqualTo(200);
        assertThat(status("GET", "/api/v1/customers", bearer(key))).isEqualTo(403);
    }

    @Test
    void unknownMalformedRevokedAndExpiredKeysAreUnauthenticated() throws Exception {
        Issued revoked = issue("to-revoke", "[\"read\"]");
        Issued expired = issue("to-expire", "[\"read\"]");
        jdbc.update("update api_keys set expires_at = now() - interval '1 minute' where id = ?", expired.id());
        assertThat(login("admin", "admin12345")
                        .exchange("DELETE", "/api/v1/admin/api-keys/" + revoked.id(), null, Map.of(), true)
                        .statusCode())
                .isEqualTo(204);
        String wrongSecret = revoked.secret().substring(0, 12) + "x".repeat(32);

        for (String presented : List.of(
                bearer(revoked.secret()),
                bearer(expired.secret()),
                bearer(wrongSecret),
                bearer("ck_zzzzzzzz_" + "A".repeat(32)),
                bearer("not-a-key"),
                "Basic !!!",
                "Digest abc")) {
            HttpResponse<String> response =
                    client().exchange("GET", "/api/v1/customers", null, Map.of("Authorization", presented), false);
            assertThat(response.statusCode()).as(presented).isEqualTo(401);
            assertThat(response.body()).contains("\"code\":\"unauthenticated\"");
            assertThat(response.headers().firstValue("WWW-Authenticate")).isEmpty();
        }
    }

    @Test
    void keyAuthenticationDoesNotNeedCsrf() throws Exception {
        String key = issue("no-csrf", "[\"ingest\"]").secret();

        HttpResponse<String> response =
                client().exchange("POST", "/api/v1/recalc", "{}", Map.of("Authorization", bearer(key)), false);

        assertThat(response.body()).doesNotContain("csrf_invalid");
        assertAllowed(response.statusCode());
    }

    @Test
    void meDescribesTheKey() throws Exception {
        String key = issue("me-check", "[\"read\",\"metrics\"]").secret();

        HttpResponse<String> response =
                client().exchange("GET", "/api/v1/auth/me", null, Map.of("Authorization", bearer(key)), false);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body())
                .contains("\"login\":\"me-check\"")
                .contains("\"authProvider\":\"api_key\"")
                .contains("\"read\"")
                .contains("\"metrics\"")
                .contains("\"role\":null");
    }

    @Test
    void lastUsedIsUpdatedAtMostOncePerMinute() throws Exception {
        Issued issued = issue("usage", "[\"read\"]");
        assertThat(jdbc.queryForObject(
                        "select last_used_at from api_keys where id = ?", OffsetDateTime.class, issued.id()))
                .isNull();

        status("GET", "/api/v1/customers", bearer(issued.secret()));
        OffsetDateTime first = jdbc.queryForObject(
                "select last_used_at from api_keys where id = ?", OffsetDateTime.class, issued.id());
        status("GET", "/api/v1/customers", bearer(issued.secret()));
        OffsetDateTime second = jdbc.queryForObject(
                "select last_used_at from api_keys where id = ?", OffsetDateTime.class, issued.id());

        assertThat(first).isNotNull();
        assertThat(second).isEqualTo(first);
    }

    @Test
    void revokeIsIdempotentAndUnknownIdIsNotFound() throws Exception {
        Issued issued = issue("revocable", "[\"read\"]");
        Client admin = login("admin", "admin12345");

        assertThat(admin.exchange("DELETE", "/api/v1/admin/api-keys/" + issued.id(), null, Map.of(), true)
                        .statusCode())
                .isEqualTo(204);
        assertThat(admin.exchange("DELETE", "/api/v1/admin/api-keys/" + issued.id(), null, Map.of(), true)
                        .statusCode())
                .isEqualTo(204);
        assertThat(admin.exchange("DELETE", "/api/v1/admin/api-keys/999999", null, Map.of(), true)
                        .statusCode())
                .isEqualTo(404);
    }

    @Test
    void onlyAdministratorsManageKeys() throws Exception {
        assertThat(client().get("/api/v1/admin/api-keys").statusCode()).isEqualTo(401);
        Client analyst = login("analyst", "analyst12345");

        assertThat(analyst.get("/api/v1/admin/api-keys").statusCode()).isEqualTo(403);
        assertThat(analyst.exchange(
                                "POST",
                                "/api/v1/admin/api-keys",
                                "{\"name\":\"x\",\"scopes\":[\"read\"]}",
                                Map.of(),
                                true)
                        .statusCode())
                .isEqualTo(403);
    }

    @Test
    void invalidIssueRequestsAreUnprocessable() throws Exception {
        Client admin = login("admin", "admin12345");
        String past = OffsetDateTime.now().minusDays(1).toString();

        for (String body : List.of(
                "{\"name\":\"\",\"scopes\":[\"read\"]}",
                "{\"name\":\"x\",\"scopes\":[]}",
                "{\"name\":\"x\",\"scopes\":[\"read\"],\"expiresAt\":\"" + past + "\"}")) {
            HttpResponse<String> response = admin.exchange("POST", "/api/v1/admin/api-keys", body, Map.of(), true);
            assertThat(response.statusCode()).as(body + response.body()).isEqualTo(422);
            assertThat(response.body()).contains("\"code\":\"validation_failed\"");
        }
    }
}

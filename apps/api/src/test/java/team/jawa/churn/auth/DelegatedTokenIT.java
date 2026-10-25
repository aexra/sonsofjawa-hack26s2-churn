package team.jawa.churn.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import team.jawa.churn.IntegrationTest;

class DelegatedTokenIT extends IntegrationTest {

    @Autowired
    JwtService jwt;

    @Autowired
    JwtEncoder encoder;

    @Autowired
    JdbcTemplate jdbc;

    private AuthenticatedUser user(String login) {
        Map<String, Object> row = jdbc.queryForMap("select id, role, auth_provider from users where login = ?", login);
        return new AuthenticatedUser(
                ((Number) row.get("id")).longValue(), (String) row.get("role"), (String) row.get("auth_provider"));
    }

    private HttpResponse<String> call(String method, String path, String token) throws Exception {
        return client().exchange(method, path, null, Map.of("Authorization", "Bearer " + token), false);
    }

    @Test
    void delegatedTokenReadsDataAsTheUser() throws Exception {
        String token = jwt.issueDelegated(user("analyst"), Duration.ofMinutes(2));

        assertThat(call("GET", "/api/v1/customers", token).statusCode()).isEqualTo(200);
        assertThat(call("GET", "/api/v1/analytics/summary", token).statusCode()).isEqualTo(200);
        HttpResponse<String> me = call("GET", "/api/v1/auth/me", token);
        assertThat(me.statusCode()).isEqualTo(200);
        assertThat(me.body()).contains("\"login\":\"analyst\"");
    }

    @Test
    void delegatedTokenOfAdminStaysReadOnly() throws Exception {
        String token = jwt.issueDelegated(user("admin"), Duration.ofMinutes(2));

        assertThat(call("GET", "/api/v1/admin/users", token).statusCode()).isEqualTo(403);
        assertThat(call("GET", "/metrics", token).statusCode()).isEqualTo(403);
        assertThat(call("POST", "/api/v1/recalc", token).statusCode()).isEqualTo(401);
        assertThat(call("PATCH", "/api/v1/model/settings", token).statusCode()).isEqualTo(401);
        assertThat(call("DELETE", "/api/v1/admin/users/1", token).statusCode()).isEqualTo(401);
    }

    @Test
    void expiredDelegatedTokenIsRejected() throws Exception {
        AuthenticatedUser analyst = user("analyst");
        Instant past = Instant.now().minus(Duration.ofMinutes(10));
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .subject(Long.toString(analyst.id()))
                .audience(List.of("mcp"))
                .issuedAt(past)
                .expiresAt(past.plus(Duration.ofMinutes(2)))
                .claim("role", analyst.role())
                .claim("prov", analyst.provider())
                .build();
        String token = encoder.encode(JwtEncoderParameters.from(
                        JwsHeader.with(MacAlgorithm.HS256).build(), claims))
                .getTokenValue();

        assertThat(call("GET", "/api/v1/customers", token).statusCode()).isEqualTo(401);
    }

    @Test
    void sessionTokenIsNotAcceptedInAuthorizationHeader() throws Exception {
        Client analyst = client();
        assertThat(analyst.post("/api/v1/auth/login", "{\"login\":\"analyst\",\"password\":\"analyst12345\"}", false)
                        .statusCode())
                .isEqualTo(200);
        String session = analyst.cookie("churn_at").orElseThrow();

        assertThat(call("GET", "/api/v1/customers", session).statusCode()).isEqualTo(401);
    }

    @Test
    void delegatedTokenIsNotAcceptedAsSessionCookie() throws Exception {
        String token = jwt.issueDelegated(user("analyst"), Duration.ofMinutes(2));
        Client browser = client();
        browser.setCookie("churn_at", token, "/");

        assertThat(browser.get("/api/v1/customers").statusCode()).isEqualTo(401);
    }

    @Test
    void foreignOrBrokenBearerTokenIsRejected() throws Exception {
        assertThat(call("GET", "/api/v1/customers", "not-a-token").statusCode()).isEqualTo(401);
    }
}

package team.jawa.churn.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.CookieManager;
import java.net.HttpCookie;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import no.nav.security.mock.oauth2.MockOAuth2Server;
import no.nav.security.mock.oauth2.token.DefaultOAuth2TokenCallback;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import team.jawa.churn.IntegrationTest;

class OidcIT extends IntegrationTest {

    private static final String PUBLIC_URL = "http://localhost:18080";
    private static final String CLIENT_ID = "churn-analyzer";

    static final MockOAuth2Server PROVIDER = new MockOAuth2Server();

    static {
        PROVIDER.start();
    }

    @DynamicPropertySource
    static void provider(DynamicPropertyRegistry registry) {
        registry.add("oidc.issuer-uri", () -> PROVIDER.issuerUrl("default").toString());
        registry.add("oidc.client-id", () -> CLIENT_ID);
        registry.add("oidc.client-secret", () -> "provider-secret");
        registry.add("oidc.public-url", () -> PUBLIC_URL);
    }

    @Autowired
    JdbcTemplate jdbc;

    @AfterEach
    void cleanUp() {
        jdbc.update("delete from users where auth_provider = 'oidc' or login like '%-sso%'");
    }

    private final class Browser {

        private final CookieManager cookies = new CookieManager();
        private final HttpClient http = HttpClient.newBuilder()
                .cookieHandler(cookies)
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();

        HttpResponse<String> get(String url) throws IOException, InterruptedException {
            URI uri = URI.create(url.startsWith("/") ? "http://localhost:" + port + url : url);
            if (uri.getPort() == 18080) {
                uri = URI.create(uri.toString().replace("localhost:18080", "localhost:" + port));
            }
            return http.send(HttpRequest.newBuilder(uri).GET().build(), HttpResponse.BodyHandlers.ofString());
        }

        String location(HttpResponse<String> response) {
            assertThat(response.statusCode()).as(response.body()).isEqualTo(302);
            return response.headers().firstValue("Location").orElseThrow();
        }

        java.util.Optional<String> cookie(String name) {
            return cookies.getCookieStore().getCookies().stream()
                    .filter(c -> c.getName().equals(name))
                    .map(HttpCookie::getValue)
                    .findFirst();
        }

        String signIn(String subject, Map<String, Object> claims) throws Exception {
            PROVIDER.enqueueCallback(
                    new DefaultOAuth2TokenCallback("default", subject, "JWT", List.of(CLIENT_ID), claims, 3600));
            String authorize = location(get("/api/v1/auth/oidc/login"));
            String providerUrl = location(get(authorize));
            String callback = location(get(providerUrl));
            return location(get(callback));
        }
    }

    private static Map<String, Object> claims(String username, Object roles) {
        return Map.of(
                "preferred_username",
                username,
                "email",
                username + "@example.test",
                "name",
                "name of " + username,
                "roles",
                roles);
    }

    @Test
    void administratorRoleSignsInWithTheSameSessionCookies() throws Exception {
        Browser browser = new Browser();

        String landing = browser.signIn(UUID.randomUUID().toString(), claims("Churn-Admin", List.of("admin")));

        assertThat(landing).isEqualTo(PUBLIC_URL + "/");
        HttpResponse<String> me = browser.get("/api/v1/auth/me");
        assertThat(me.statusCode()).isEqualTo(200);
        assertThat(me.body())
                .contains("\"login\":\"churn-admin\"")
                .contains("\"role\":\"admin\"")
                .contains("\"authProvider\":\"oidc\"")
                .contains("\"email\":\"Churn-Admin@example.test\"");
        assertThat(browser.get("/api/v1/admin/users").statusCode()).isEqualTo(200);
        assertThat(browser.cookie(OidcLoginCookies.REQUEST)).isEmpty();
    }

    @Test
    void userRoleSignsInWithoutAdministration() throws Exception {
        Browser browser = new Browser();

        browser.signIn(UUID.randomUUID().toString(), claims("churn-user", List.of("user")));

        assertThat(browser.get("/api/v1/auth/me").body()).contains("\"role\":\"user\"");
        assertThat(browser.get("/api/v1/admin/users").statusCode()).isEqualTo(403);
    }

    @Test
    void administratorWinsWhenBothRolesArePresent() throws Exception {
        Browser browser = new Browser();

        browser.signIn(UUID.randomUUID().toString(), claims("both-roles", List.of("user", "admin")));

        assertThat(browser.get("/api/v1/auth/me").body()).contains("\"role\":\"admin\"");
    }

    @Test
    void withoutAnyKnownRoleTheLoginIsRejected() throws Exception {
        Browser browser = new Browser();

        String landing = browser.signIn(UUID.randomUUID().toString(), claims("churn-nobody", List.of("viewer")));

        assertThat(landing).isEqualTo(PUBLIC_URL + "/login?error=forbidden");
        assertThat(browser.cookie("churn_at")).isEmpty();
        assertThat(jdbc.queryForObject("select count(*) from users where login = 'churn-nobody'", Integer.class))
                .isZero();
    }

    @Test
    void repeatedLoginUpdatesTheRoleOfTheSameUser() throws Exception {
        String subject = UUID.randomUUID().toString();
        new Browser().signIn(subject, claims("promoted", List.of("user")));
        long id = jdbc.queryForObject("select id from users where oidc_subject = ?", Long.class, subject);

        Browser again = new Browser();
        again.signIn(subject, claims("promoted", List.of("admin")));

        assertThat(jdbc.queryForObject("select count(*) from users where oidc_subject = ?", Integer.class, subject))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject("select role from users where id = ?", String.class, id))
                .isEqualTo("admin");
        assertThat(again.get("/api/v1/auth/me").body()).contains("\"role\":\"admin\"");
    }

    @Test
    void aDisabledUserCannotSignInThroughTheProvider() throws Exception {
        String subject = UUID.randomUUID().toString();
        new Browser().signIn(subject, claims("leaver", List.of("user")));
        jdbc.update("update users set enabled = false where oidc_subject = ?", subject);

        Browser again = new Browser();
        String landing = again.signIn(subject, claims("leaver", List.of("user")));

        assertThat(landing).isEqualTo(PUBLIC_URL + "/login?error=forbidden");
        assertThat(again.cookie("churn_at")).isEmpty();
    }

    @Test
    void aLoginTakenByALocalUserGetsASuffix() throws Exception {
        Browser browser = new Browser();

        browser.signIn(UUID.randomUUID().toString(), claims("analyst", List.of("user")));

        assertThat(browser.get("/api/v1/auth/me").body()).contains("\"login\":\"analyst-sso\"");
        Browser second = new Browser();
        second.signIn(UUID.randomUUID().toString(), claims("analyst", List.of("user")));
        assertThat(second.get("/api/v1/auth/me").body()).contains("\"login\":\"analyst-sso2\"");
    }

    @Test
    void theAuthorizationRequestUsesPkceStateAndNonce() throws Exception {
        Browser browser = new Browser();

        String authorize = browser.location(browser.get("/api/v1/auth/oidc/login"));
        String providerUrl = browser.location(browser.get(authorize));

        assertThat(providerUrl)
                .contains("response_type=code")
                .contains("client_id=" + CLIENT_ID)
                .contains("code_challenge_method=S256")
                .contains("code_challenge=")
                .contains("state=")
                .contains("nonce=")
                .contains("redirect_uri=" + PUBLIC_URL + "/api/v1/auth/oidc/callback");
    }

    @Test
    void theRequestCookieIsShortLivedHttpOnlyAndLax() throws Exception {
        Browser browser = new Browser();
        browser.location(browser.get("/api/v1/auth/oidc/login"));

        HttpResponse<String> authorize = browser.get("/api/v1/auth/oidc/authorize/oidc");

        assertThat(authorize.headers().allValues("Set-Cookie"))
                .anySatisfy(cookie -> assertThat(cookie)
                        .startsWith("churn_oidc=")
                        .contains("HttpOnly", "SameSite=Lax", "Path=/api/v1/auth/oidc", "Max-Age=300"));
    }

    @Test
    void aCallbackWithoutTheRequestCookieIsAProviderError() throws Exception {
        Browser browser = new Browser();

        HttpResponse<String> response = browser.get("/api/v1/auth/oidc/callback?code=abc&state=xyz");

        assertThat(browser.location(response)).isEqualTo(PUBLIC_URL + "/login?error=provider");
    }

    @Test
    void aTamperedRequestCookieIsRejected() throws Exception {
        Browser browser = new Browser();
        String authorize = browser.location(browser.get("/api/v1/auth/oidc/login"));
        String providerUrl = browser.location(browser.get(authorize));
        String callback = browser.location(browser.get(providerUrl));
        String valid = browser.cookie(OidcLoginCookies.REQUEST).orElseThrow();
        browser.cookies.getCookieStore().removeAll();
        HttpCookie forged = new HttpCookie(OidcLoginCookies.REQUEST, valid.substring(0, valid.length() - 4) + "AAAA");
        forged.setPath("/api/v1/auth/oidc");
        browser.cookies.getCookieStore().add(URI.create("http://localhost:" + port), forged);

        HttpResponse<String> response = browser.get(callback);

        assertThat(browser.location(response)).isEqualTo(PUBLIC_URL + "/login?error=provider");
        assertThat(browser.cookie("churn_at")).isEmpty();
    }

    @Test
    void aProviderErrorOnTheCallbackIsAProviderError() throws Exception {
        Browser browser = new Browser();
        String authorize = browser.location(browser.get("/api/v1/auth/oidc/login"));
        browser.location(browser.get(authorize));

        HttpResponse<String> response = browser.get("/api/v1/auth/oidc/callback?error=access_denied&state=xyz");

        assertThat(browser.location(response)).isEqualTo(PUBLIC_URL + "/login?error=provider");
    }

    @Test
    void anExpiredRequestCookieIsRejected() throws Exception {
        Browser browser = new Browser();
        String authorize = browser.location(browser.get("/api/v1/auth/oidc/login"));
        String providerUrl = browser.location(browser.get(authorize));
        String callback = browser.location(browser.get(providerUrl));
        String[] parts = browser.cookie(OidcLoginCookies.REQUEST).orElseThrow().split("\\.");
        parts[0] = Long.toString(java.time.Instant.now().getEpochSecond() - 3600);
        browser.cookies.getCookieStore().removeAll();
        HttpCookie stale = new HttpCookie(OidcLoginCookies.REQUEST, String.join(".", parts));
        stale.setPath("/api/v1/auth/oidc");
        browser.cookies.getCookieStore().add(URI.create("http://localhost:" + port), stale);

        HttpResponse<String> response = browser.get(callback);

        assertThat(browser.location(response)).isEqualTo(PUBLIC_URL + "/login?error=provider");
        assertThat(browser.cookie("churn_at")).isEmpty();
    }

    @Test
    void aLaterLoginKeepsTheNameAndEmailWhenTheProviderOmitsThem() throws Exception {
        String subject = UUID.randomUUID().toString();
        new Browser().signIn(subject, claims("keeper", List.of("user")));

        new Browser().signIn(subject, Map.of("preferred_username", "keeper", "roles", List.of("user")));

        assertThat(jdbc.queryForObject("select email from users where oidc_subject = ?", String.class, subject))
                .isEqualTo("keeper@example.test");
        assertThat(jdbc.queryForObject("select display_name from users where oidc_subject = ?", String.class, subject))
                .isEqualTo("name of keeper");
    }

    @Test
    void providersEndpointAdvertisesSso() throws Exception {
        HttpResponse<String> response = client().get("/api/v1/auth/providers");

        assertThat(response.body())
                .contains("\"oidc\":{\"enabled\":true")
                .contains("\"displayName\":\"keycloak\"")
                .contains("\"loginUrl\":\"/api/v1/auth/oidc/login\"");
    }
}

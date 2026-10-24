package team.jawa.churn.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;
import team.jawa.churn.IntegrationTest;

@TestPropertySource(
        properties = {
            "oidc.issuer-uri=http://127.0.0.1:1/realms/none",
            "oidc.client-id=churn-analyzer",
            "oidc.client-secret=secret",
            "oidc.public-url=http://localhost:18080"
        })
class OidcUnavailableIT extends IntegrationTest {

    @Test
    void anUnreachableProviderSendsTheBrowserBackWithAProviderError() throws Exception {
        HttpResponse<String> response = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NEVER)
                .build()
                .send(
                        HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/v1/auth/oidc/login"))
                                .GET()
                                .build(),
                        HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(302);
        assertThat(response.headers().firstValue("Location")).contains("http://localhost:18080/login?error=provider");
    }

    @Test
    void localLoginKeepsWorkingWhileTheProviderIsDown() throws Exception {
        HttpResponse<String> response =
                client().post("/api/v1/auth/login", "{\"login\":\"admin\",\"password\":\"admin12345\"}", false);

        assertThat(response.statusCode()).isEqualTo(200);
    }
}

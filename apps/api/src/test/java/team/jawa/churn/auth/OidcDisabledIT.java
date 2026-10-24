package team.jawa.churn.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import team.jawa.churn.IntegrationTest;

class OidcDisabledIT extends IntegrationTest {

    @Test
    void ssoEndpointsAreAbsentWithoutAnIssuer() throws Exception {
        HttpResponse<String> response = client().get("/api/v1/auth/oidc/login");

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).contains("\"code\":\"not_found\"");
    }

    @Test
    void providersReportSsoAsDisabled() throws Exception {
        HttpResponse<String> response = client().get("/api/v1/auth/providers");

        assertThat(response.body()).contains("\"oidc\":{\"enabled\":false");
    }
}

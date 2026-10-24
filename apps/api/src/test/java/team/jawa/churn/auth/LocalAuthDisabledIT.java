package team.jawa.churn.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;
import team.jawa.churn.IntegrationTest;

@TestPropertySource(properties = {"auth.local-enabled=false", "oidc.issuer-uri=https://idp.example/realms/test"})
class LocalAuthDisabledIT extends IntegrationTest {

    @Test
    void loginIsForbiddenWhenLocalAuthIsDisabled() throws Exception {
        HttpResponse<String> response =
                client().post("/api/v1/auth/login", "{\"login\":\"admin\",\"password\":\"admin12345\"}", false);

        assertThat(response.statusCode()).isEqualTo(403);
        assertThat(response.body()).contains("\"code\":\"local_auth_disabled\"");
    }

    @Test
    void providersReflectTheConfiguration() throws Exception {
        HttpResponse<String> response = client().get("/api/v1/auth/providers");

        assertThat(response.body()).contains("\"local\":{\"enabled\":false}").contains("\"oidc\":{\"enabled\":true");
    }
}

package team.jawa.churn.assistant;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;
import team.jawa.churn.IntegrationTest;

@TestPropertySource(properties = "assistant.model-key=test-model-key")
class AssistantEnabledIT extends IntegrationTest {

    @Test
    void currentUserSeesAssistantWhenModelKeyIsSet() throws Exception {
        Client analyst = client();
        assertThat(analyst.post("/api/v1/auth/login", "{\"login\":\"analyst\",\"password\":\"analyst12345\"}", false)
                        .body())
                .contains("\"assistantEnabled\":true");

        assertThat(analyst.get("/api/v1/auth/me").body()).contains("\"assistantEnabled\":true");
    }
}

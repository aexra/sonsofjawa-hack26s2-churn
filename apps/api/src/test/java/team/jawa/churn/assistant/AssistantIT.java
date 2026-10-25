package team.jawa.churn.assistant;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.Map;
import org.junit.jupiter.api.Test;
import team.jawa.churn.IntegrationTest;

class AssistantIT extends IntegrationTest {

    private static final String QUESTION =
            "{\"messages\":[{\"role\":\"user\",\"content\":\"кто в самом высоком риске?\"}],"
                    + "\"page\":{\"route\":\"/customers/42\",\"customerId\":42}}";

    private Client analyst() throws Exception {
        Client client = client();
        assertThat(client.post("/api/v1/auth/login", "{\"login\":\"analyst\",\"password\":\"analyst12345\"}", false)
                        .statusCode())
                .isEqualTo(200);
        assertThat(client.get("/api/v1/auth/me").statusCode()).isEqualTo(200);
        return client;
    }

    private static HttpResponse<String> ask(Client client, String body) throws Exception {
        return client.exchange("POST", "/api/v1/assistant/messages", body, Map.of("Accept", "text/event-stream"), true);
    }

    @Test
    void withoutModelKeyAssistantIsDisabled() throws Exception {
        Client analyst = analyst();

        HttpResponse<String> response = ask(analyst, QUESTION);

        assertThat(response.statusCode()).isEqualTo(503);
        assertThat(response.body()).contains("\"code\":\"assistant_disabled\"");
        assertThat(analyst.get("/api/v1/auth/me").body()).contains("\"assistantEnabled\":false");
    }

    @Test
    void requestNeedsSessionAndCsrf() throws Exception {
        Client anonymous = client();
        anonymous.get("/api/v1/auth/providers");
        assertThat(ask(anonymous, QUESTION).statusCode()).isEqualTo(401);
        assertThat(analyst()
                        .exchange("POST", "/api/v1/assistant/messages", QUESTION, Map.of(), false)
                        .statusCode())
                .isEqualTo(403);
    }

    @Test
    void lastMessageMustComeFromUser() throws Exception {
        HttpResponse<String> response =
                ask(analyst(), "{\"messages\":[{\"role\":\"assistant\",\"content\":\"привет\"}]}");

        assertThat(response.statusCode()).isEqualTo(422);
        assertThat(response.body()).contains("\"code\":\"validation_failed\"");
    }

    @Test
    void malformedMcpKeyIsRejected() throws Exception {
        HttpResponse<String> response =
                ask(analyst(), "{\"messages\":[{\"role\":\"user\",\"content\":\"привет\"}],\"mcpKey\":\"not-a-key\"}");

        assertThat(response.statusCode()).isEqualTo(422);
    }
}

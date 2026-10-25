package team.jawa.churn.assistant;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import team.jawa.churn.IntegrationTest;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@ExtendWith(OutputCaptureExtension.class)
class AssistantLoopIT extends IntegrationTest {

    private static final String MODEL_KEY = "model-secret-0123456789";
    private static final String MCP_KEY = "ck_abcd1234_0123456789abcdefghijABCDEFGHIJ01";
    private static final String QUESTION = "кто в самом высоком риске прямо сейчас?";
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final ModelStub MODEL = start(ModelStub::new);
    private static final McpStub MCP = start(McpStub::new);

    @Autowired
    AssistantRateLimiter limiter;

    @DynamicPropertySource
    static void assistant(DynamicPropertyRegistry registry) {
        registry.add("assistant.model-key", () -> MODEL_KEY);
        registry.add("assistant.model-url", MODEL::url);
        registry.add("assistant.model", () -> "test/model");
        registry.add("assistant.mcp-url", MCP::url);
        registry.add("assistant.max-steps", () -> "2");
        registry.add("assistant.timeout", () -> "3s");
    }

    @BeforeEach
    void reset() {
        MODEL.reset();
        MCP.reset();
        limiter.reset();
    }

    private interface Factory<T> {
        T create() throws IOException;
    }

    private static <T> T start(Factory<T> factory) {
        try {
            return factory.create();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private Client analyst() throws Exception {
        Client client = client();
        assertThat(client.post("/api/v1/auth/login", "{\"login\":\"analyst\",\"password\":\"analyst12345\"}", false)
                        .statusCode())
                .isEqualTo(200);
        assertThat(client.get("/api/v1/auth/me").statusCode()).isEqualTo(200);
        return client;
    }

    private static String question(String mcpKey) {
        String key = mcpKey == null ? "" : ",\"mcpKey\":\"" + mcpKey + "\"";
        return "{\"messages\":[{\"role\":\"user\",\"content\":\"" + QUESTION + "\"}],"
                + "\"page\":{\"route\":\"/customers/42\",\"customerId\":42}" + key + "}";
    }

    private static HttpResponse<String> ask(Client client, String body) throws Exception {
        return client.exchange("POST", "/api/v1/assistant/messages", body, Map.of("Accept", "text/event-stream"), true);
    }

    @Test
    void callsToolThroughMcpAndStreamsTheAnswer(CapturedOutput output) throws Exception {
        MCP.result("get_customers", "{\"items\":[{\"id\":7,\"riskScore\":91.5},{\"id\":3,\"riskScore\":80}]}");
        MODEL.thenToolCalls("get_customers", "{\"size\":2}");
        MODEL.thenText("Выше всех риск у ", "#7.");

        HttpResponse<String> response = ask(analyst(), question(null));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Content-Type"))
                .hasValueSatisfying(type -> assertThat(type).startsWith("text/event-stream"));
        String body = response.body();
        assertThat(body)
                .contains("event:step")
                .contains("\"tool\":\"get_customers\",\"status\":\"started\"")
                .contains("\"status\":\"done\",\"summary\":\"2 строки\"")
                .contains("event:text")
                .contains("\"delta\":\"#7.\"")
                .contains("event:done")
                .contains("\"steps\":1");
        assertThat(body.indexOf("\"status\":\"started\"")).isLessThan(body.indexOf("\"delta\""));

        List<McpStub.Call> calls = MCP.calls();
        assertThat(calls).hasSize(1);
        assertThat(calls.getFirst().arguments().path("size").asInt()).isEqualTo(2);
        String authorization = calls.getFirst().authorization();
        assertThat(authorization).startsWith("Bearer ey");
        String token = authorization.substring("Bearer ".length());

        List<ModelStub.Received> requests = MODEL.received();
        assertThat(requests).hasSize(2);
        assertThat(requests.getFirst().authorization()).isEqualTo("Bearer " + MODEL_KEY);
        JsonNode first = JSON.readTree(requests.getFirst().body());
        assertThat(first.path("model").asString()).isEqualTo("test/model");
        assertThat(first.path("stream").asBoolean()).isTrue();
        assertThat(first.path("tools").get(0).path("function").path("name").asString())
                .isEqualTo("get_customers");
        assertThat(first.path("messages").get(0).path("role").asString()).isEqualTo("system");
        assertThat(first.path("messages").get(0).path("content").asString())
                .contains("#42")
                .doesNotContain("{{");
        JsonNode second = JSON.readTree(requests.get(1).body());
        JsonNode messages = second.path("messages");
        JsonNode call = messages.get(messages.size() - 2);
        assertThat(call.path("tool_calls")
                        .get(0)
                        .path("function")
                        .path("arguments")
                        .asString())
                .isEqualTo("{\"size\":2}");
        JsonNode tool = messages.get(messages.size() - 1);
        assertThat(tool.path("role").asString()).isEqualTo("tool");
        assertThat(tool.path("tool_call_id").asString()).isEqualTo("call_get_customers_0");
        assertThat(tool.path("content").asString()).contains("\"id\":7");

        assertThat(body).doesNotContain(token).doesNotContain(MODEL_KEY);
        assertThat(output.getAll())
                .contains("assistant request finished")
                .doesNotContain(token)
                .doesNotContain(MODEL_KEY)
                .doesNotContain(QUESTION);
    }

    @Test
    void stopsWhenTheModelWantsTooManySteps() throws Exception {
        MODEL.thenToolCalls("get_customers", "{}");
        MODEL.thenToolCalls("get_customer", "{\"id\":7}", "get_customer", "{\"id\":3}");

        String body = ask(analyst(), question(null)).body();

        assertThat(body).contains("event:error").contains("\"code\":\"assistant_step_limit\"");
        assertThat(body).doesNotContain("event:done");
        assertThat(MCP.calls()).hasSize(1);
    }

    @Test
    void reportsTimeoutWhenTheModelIsTooSlow() throws Exception {
        MODEL.then(new ModelStub.Response(200, List.of(), 6000));

        long started = System.nanoTime();
        String body = ask(analyst(), question(null)).body();

        assertThat(body).contains("event:error").contains("\"code\":\"assistant_timeout\"");
        assertThat((System.nanoTime() - started) / 1_000_000).isLessThan(5500);
    }

    @Test
    void reportsUnavailableModelAndTheRestOfApiKeepsWorking() throws Exception {
        MODEL.then(new ModelStub.Response(502, List.of(), 0));
        Client analyst = analyst();

        String body = ask(analyst, question(null)).body();

        assertThat(body).contains("event:error").contains("\"code\":\"assistant_unavailable\"");
        assertThat(analyst.get("/api/v1/customers").statusCode()).isEqualTo(200);
    }

    @Test
    void mcpKeyFromRequestReplacesDelegatedToken(CapturedOutput output) throws Exception {
        MODEL.thenToolCalls("get_customers", "{}");
        MODEL.thenText("готово");

        String body = ask(analyst(), question(MCP_KEY)).body();

        assertThat(body).contains("event:done");
        assertThat(MCP.calls()).extracting(McpStub.Call::authorization).containsOnly("Bearer " + MCP_KEY);
        assertThat(MCP.authorizations()).allMatch(header -> header.equals("Bearer " + MCP_KEY));
        assertThat(body).doesNotContain(MCP_KEY);
        assertThat(output.getAll()).doesNotContain(MCP_KEY);
    }

    @Test
    void rejectedMcpKeyIsReported() throws Exception {
        MCP.callStatus(401);
        MODEL.thenToolCalls("get_customers", "{}");
        assertThat(ask(analyst(), question(MCP_KEY)).body()).contains("\"code\":\"assistant_key_invalid\"");

        MCP.callStatus(403);
        MODEL.thenToolCalls("get_customers", "{}");
        assertThat(ask(analyst(), question(MCP_KEY)).body()).contains("\"code\":\"assistant_key_forbidden\"");
    }

    @Test
    void unknownToolIsReportedToTheModelAsFailedStep() throws Exception {
        MODEL.thenToolCalls("drop_everything", "{}");
        MODEL.thenText("такого инструмента нет");

        String body = ask(analyst(), question(null)).body();

        assertThat(body)
                .contains("\"tool\":\"drop_everything\",\"status\":\"failed\"")
                .contains("event:done");
        assertThat(MCP.calls()).isEmpty();
    }

    @Test
    void limitsRequestsPerUser() throws Exception {
        Client analyst = analyst();
        for (int i = 0; i < AssistantRateLimiter.LIMIT; i++) {
            assertThat(ask(analyst, question(null)).statusCode()).isEqualTo(200);
        }

        HttpResponse<String> rejected = ask(analyst, question(null));

        assertThat(rejected.statusCode()).isEqualTo(429);
        assertThat(rejected.body()).contains("\"code\":\"rate_limited\"");
    }

    @Test
    void exposesMetrics() throws Exception {
        MODEL.thenToolCalls("get_customers", "{}");
        MODEL.thenText("ок");
        ask(analyst(), question(null));
        Client admin = client();
        admin.post("/api/v1/auth/login", "{\"login\":\"admin\",\"password\":\"admin12345\"}", false);

        String metrics = admin.get("/metrics").body();

        assertThat(metrics)
                .contains("assistant_requests_total{outcome=\"answered\"")
                .contains("assistant_steps_total{tool=\"get_customers\"")
                .contains("assistant_duration_seconds_count");
    }
}

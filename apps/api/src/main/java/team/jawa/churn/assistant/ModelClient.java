package team.jawa.churn.assistant;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

@Component
class ModelClient {

    static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(30);

    private static final Logger log = LoggerFactory.getLogger(ModelClient.class);
    private static final String DATA = "data:";
    private static final String END = "[DONE]";

    record ToolCall(String id, String name, String arguments) {}

    record Reply(String text, String reasoning, List<ToolCall> toolCalls) {}

    private final HttpClient http = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(10))
            .build();
    private final AssistantProperties properties;
    private final AssistantExecutors executors;
    private final JsonMapper json;

    ModelClient(AssistantProperties properties, AssistantExecutors executors, JsonMapper json) {
        this.properties = properties;
        this.executors = executors;
        this.json = json;
    }

    Reply complete(ArrayNode messages, ArrayNode tools, AssistantRun run, Consumer<String> onText) {
        Duration timeout = run.remaining();
        if (timeout.compareTo(REQUEST_TIMEOUT) > 0) {
            timeout = REQUEST_TIMEOUT;
        }
        if (timeout.isNegative() || timeout.isZero()) {
            throw new AssistantFailure(Outcome.TIMEOUT);
        }
        HttpRequest request = HttpRequest.newBuilder(
                        URI.create(stripSlash(properties.modelUrl()) + "/chat/completions"))
                .timeout(timeout)
                .header("Authorization", "Bearer " + properties.modelKey())
                .header("Content-Type", "application/json")
                .header("Accept", "text/event-stream")
                .POST(HttpRequest.BodyPublishers.ofString(body(messages, tools)))
                .build();
        CompletableFuture<HttpResponse<InputStream>> pending =
                http.sendAsync(request, HttpResponse.BodyHandlers.ofInputStream());
        AtomicBoolean expired = new AtomicBoolean();
        AtomicReference<InputStream> stream = new AtomicReference<>();
        Runnable abort = () -> {
            pending.cancel(true);
            closeQuietly(stream.get());
        };
        ScheduledFuture<?> timer = executors.after(timeout, () -> {
            expired.set(true);
            abort.run();
        });
        run.onAbort(abort);
        try {
            HttpResponse<InputStream> response = pending.get();
            stream.set(response.body());
            if (response.statusCode() / 100 != 2) {
                closeQuietly(response.body());
                log.warn("assistant model returned status {}", response.statusCode());
                throw new AssistantFailure(Outcome.UNAVAILABLE);
            }
            return read(response.body(), onText);
        } catch (InterruptedException e) {
            throw failure(run, expired);
        } catch (ExecutionException | CancellationException | IOException | JacksonException e) {
            AssistantFailure failure = failure(run, expired);
            if (failure.outcome() == Outcome.UNAVAILABLE) {
                log.warn("assistant model request failed: {}", e.getClass().getSimpleName());
            }
            throw failure;
        } finally {
            timer.cancel(false);
            run.onAbort(null);
            closeQuietly(stream.get());
        }
    }

    private String body(ArrayNode messages, ArrayNode tools) {
        ObjectNode body = json.createObjectNode();
        body.put("model", properties.model());
        body.put("stream", true);
        body.set("messages", messages);
        if (!tools.isEmpty()) {
            body.set("tools", tools);
        }
        return json.writeValueAsString(body);
    }

    private Reply read(InputStream body, Consumer<String> onText) throws IOException {
        StringBuilder text = new StringBuilder();
        StringBuilder reasoning = new StringBuilder();
        List<CallBuilder> calls = new ArrayList<>();
        BufferedReader reader = new BufferedReader(new InputStreamReader(body, StandardCharsets.UTF_8));
        String line;
        while ((line = reader.readLine()) != null) {
            if (!line.startsWith(DATA)) {
                continue;
            }
            String data = line.substring(DATA.length()).strip();
            if (data.isEmpty()) {
                continue;
            }
            if (END.equals(data)) {
                break;
            }
            JsonNode chunk = json.readTree(data);
            if (chunk.hasNonNull("error")) {
                log.warn("assistant model stream reported an error");
                throw new AssistantFailure(Outcome.UNAVAILABLE);
            }
            JsonNode delta = chunk.path("choices").path(0).path("delta");
            String content = string(delta.path("content"));
            if (content != null && !content.isEmpty()) {
                text.append(content);
                onText.accept(content);
            }
            String thinking = string(delta.path("reasoning_content"));
            if (thinking != null) {
                reasoning.append(thinking);
            }
            for (JsonNode call : delta.path("tool_calls")) {
                merge(calls, call);
            }
        }
        List<ToolCall> toolCalls = new ArrayList<>();
        for (int i = 0; i < calls.size(); i++) {
            CallBuilder call = calls.get(i);
            if (!call.name.isEmpty()) {
                String id = call.id.isEmpty() ? "call_" + i : call.id.toString();
                toolCalls.add(new ToolCall(id, call.name.toString(), call.arguments.toString()));
            }
        }
        return new Reply(text.toString(), reasoning.toString(), toolCalls);
    }

    private static void merge(List<CallBuilder> calls, JsonNode delta) {
        String id = string(delta.path("id"));
        int index;
        if (delta.path("index").isIntegralNumber()) {
            index = delta.path("index").asInt();
        } else if (id != null && !id.isEmpty()) {
            index = calls.size();
        } else {
            index = Math.max(calls.size() - 1, 0);
        }
        if (index < 0 || index > 64) {
            return;
        }
        while (calls.size() <= index) {
            calls.add(new CallBuilder());
        }
        CallBuilder call = calls.get(index);
        if (id != null && call.id.isEmpty()) {
            call.id.append(id);
        }
        JsonNode function = delta.path("function");
        String name = string(function.path("name"));
        if (name != null && call.name.isEmpty()) {
            call.name.append(name);
        }
        String arguments = string(function.path("arguments"));
        if (arguments != null) {
            call.arguments.append(arguments);
        }
    }

    private static String string(JsonNode node) {
        return node.isString() ? node.stringValue() : null;
    }

    private static AssistantFailure failure(AssistantRun run, AtomicBoolean expired) {
        Outcome stopped = run.stopped();
        if (stopped != null) {
            return new AssistantFailure(stopped);
        }
        return new AssistantFailure(expired.get() ? Outcome.TIMEOUT : Outcome.UNAVAILABLE);
    }

    private static String stripSlash(String url) {
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }

    private static void closeQuietly(InputStream stream) {
        if (stream == null) {
            return;
        }
        try {
            stream.close();
        } catch (IOException e) {
            log.debug("assistant model stream already closed");
        }
    }

    private static final class CallBuilder {
        private final StringBuilder id = new StringBuilder();
        private final StringBuilder name = new StringBuilder();
        private final StringBuilder arguments = new StringBuilder();
    }
}

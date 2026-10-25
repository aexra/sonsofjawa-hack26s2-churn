package team.jawa.churn.assistant;

import io.modelcontextprotocol.spec.McpSchema;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ScheduledFuture;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import team.jawa.churn.api.generated.model.AssistantMessage;
import team.jawa.churn.api.generated.model.AssistantPage;
import team.jawa.churn.auth.AuthenticatedUser;
import team.jawa.churn.auth.DelegatedTokenAuthenticationFilter;
import team.jawa.churn.auth.JwtService;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

@Service
public class AssistantService {

    static final int RESULT_LIMIT_BYTES = 16 * 1024;

    private static final Logger log = LoggerFactory.getLogger(AssistantService.class);
    private static final String TRUNCATED = "\n[truncated]";
    private static final List<String> ROW_KEYS = List.of("items", "points");
    private static final TypeReference<Map<String, Object>> ARGUMENTS = new TypeReference<>() {};

    private final AssistantProperties properties;
    private final AssistantExecutors executors;
    private final AssistantRateLimiter limiter;
    private final AssistantMetrics metrics;
    private final AssistantInstructions instructions;
    private final ModelClient model;
    private final McpGateway mcp;
    private final JwtService jwt;
    private final JsonMapper json;

    AssistantService(
            AssistantProperties properties,
            AssistantExecutors executors,
            AssistantRateLimiter limiter,
            AssistantMetrics metrics,
            AssistantInstructions instructions,
            ModelClient model,
            McpGateway mcp,
            JwtService jwt,
            JsonMapper json) {
        this.properties = properties;
        this.executors = executors;
        this.limiter = limiter;
        this.metrics = metrics;
        this.instructions = instructions;
        this.model = model;
        this.mcp = mcp;
        this.jwt = jwt;
        this.json = json;
    }

    public boolean allow(AuthenticatedUser user) {
        if (limiter.tryAcquire(user.id())) {
            return true;
        }
        metrics.request(Outcome.RATE_LIMITED);
        log.info("assistant request rejected userId={} outcome={}", user.id(), Outcome.RATE_LIMITED.tag());
        return false;
    }

    public SseEmitter start(
            AuthenticatedUser user, List<AssistantMessage> messages, AssistantPage page, String mcpKey) {
        SseEmitter emitter = new SseEmitter(properties.timeout().plusSeconds(10).toMillis());
        AssistantRun run = new AssistantRun(properties.timeout());
        emitter.onCompletion(() -> run.stop(Outcome.CANCELLED));
        emitter.onTimeout(() -> run.stop(Outcome.CANCELLED));
        emitter.onError(error -> run.stop(Outcome.CANCELLED));
        Map<String, String> context = MDC.getCopyOfContextMap();
        executors.submit(() -> {
            if (context != null) {
                MDC.setContextMap(context);
            }
            MDC.put(DelegatedTokenAuthenticationFilter.MDC_KEY, "assistant");
            try {
                execute(user, messages, page, mcpKey, new AssistantStream(emitter, run), run);
            } finally {
                MDC.clear();
            }
        });
        return emitter;
    }

    private void execute(
            AuthenticatedUser user,
            List<AssistantMessage> messages,
            AssistantPage page,
            String mcpKey,
            AssistantStream stream,
            AssistantRun run) {
        Instant started = Instant.now();
        run.attach(Thread.currentThread());
        ScheduledFuture<?> watchdog = executors.after(properties.timeout(), () -> run.stop(Outcome.TIMEOUT));
        boolean manualKey = mcpKey != null && !mcpKey.isBlank();
        Outcome outcome;
        try {
            String authorization =
                    "Bearer " + (manualKey ? mcpKey : jwt.issueDelegated(user, properties.delegationTtl()));
            try (McpGateway.Session session = mcp.open(authorization, manualKey)) {
                converse(messages, page, session, stream, run);
            }
            outcome = Outcome.ANSWERED;
        } catch (AssistantFailure e) {
            outcome = e.outcome();
        } catch (RuntimeException e) {
            log.warn("assistant request failed: {}", e.getClass().getSimpleName());
            outcome = Outcome.UNAVAILABLE;
        } finally {
            watchdog.cancel(false);
        }
        outcome = run.finish(outcome);
        Thread.interrupted();
        if (outcome == Outcome.ANSWERED) {
            stream.done(run.steps());
        } else if (outcome.code() != null) {
            stream.error(outcome.code());
        }
        stream.complete();
        Duration elapsed = Duration.between(started, Instant.now());
        metrics.finished(outcome, elapsed);
        log.info(
                "assistant request finished userId={} mcp={} outcome={} steps={} durationMs={}",
                user.id(),
                manualKey ? "key" : "delegated",
                outcome.tag(),
                run.steps(),
                elapsed.toMillis());
    }

    private void converse(
            List<AssistantMessage> messages,
            AssistantPage page,
            McpGateway.Session session,
            AssistantStream stream,
            AssistantRun run) {
        ArrayNode conversation = json.createArrayNode();
        conversation.add(message("system", instructions.render(page)));
        for (AssistantMessage message : messages) {
            conversation.add(message(message.getRole().getValue(), message.getContent()));
        }
        run.check();
        List<McpSchema.Tool> tools = session.tools();
        Set<String> names = new HashSet<>();
        ArrayNode specs = json.createArrayNode();
        for (McpSchema.Tool tool : tools) {
            names.add(tool.name());
            ObjectNode function = json.createObjectNode();
            function.put("name", tool.name());
            if (tool.description() != null) {
                function.put("description", tool.description());
            }
            function.set(
                    "parameters",
                    tool.inputSchema() == null ? json.createObjectNode() : json.valueToTree(tool.inputSchema()));
            ObjectNode spec = json.createObjectNode();
            spec.put("type", "function");
            spec.set("function", function);
            specs.add(spec);
        }
        while (true) {
            run.check();
            ModelClient.Reply reply = model.complete(conversation, specs, run, stream::text);
            if (reply.toolCalls().isEmpty()) {
                return;
            }
            if (run.steps() + reply.toolCalls().size() > properties.maxSteps()) {
                throw new AssistantFailure(Outcome.STEP_LIMIT);
            }
            conversation.add(assistantMessage(reply));
            for (ModelClient.ToolCall call : reply.toolCalls()) {
                run.check();
                run.step();
                stream.step(call.id(), call.name(), "started", null);
                ToolResult result = invoke(session, call, names);
                metrics.step(names.contains(call.name()) ? call.name() : "unknown");
                stream.step(call.id(), call.name(), result.failed() ? "failed" : "done", result.summary());
                ObjectNode answer = json.createObjectNode();
                answer.put("role", "tool");
                answer.put("tool_call_id", call.id());
                answer.put("content", result.content());
                conversation.add(answer);
            }
        }
    }

    private record ToolResult(String content, String summary, boolean failed) {

        static ToolResult failure(String content) {
            return new ToolResult("error: " + content, "ошибка", true);
        }
    }

    private ToolResult invoke(McpGateway.Session session, ModelClient.ToolCall call, Set<String> names) {
        if (!names.contains(call.name())) {
            return ToolResult.failure("unknown tool " + call.name());
        }
        Map<String, Object> arguments;
        try {
            arguments = call.arguments().isBlank() ? Map.of() : json.readValue(call.arguments(), ARGUMENTS);
        } catch (JacksonException e) {
            return ToolResult.failure("arguments are not a json object");
        }
        if (arguments == null) {
            arguments = Map.of();
        }
        McpSchema.CallToolResult result;
        try {
            result = session.call(call.name(), arguments);
        } catch (McpGateway.ToolFailure e) {
            return ToolResult.failure(String.valueOf(e.getMessage()));
        }
        String content = truncate(content(result));
        if (Boolean.TRUE.equals(result.isError())) {
            return ToolResult.failure(content);
        }
        return new ToolResult(content, summary(result.structuredContent()), false);
    }

    private String content(McpSchema.CallToolResult result) {
        StringBuilder text = new StringBuilder();
        for (McpSchema.Content item : result.content()) {
            if (item instanceof McpSchema.TextContent part) {
                if (!text.isEmpty()) {
                    text.append('\n');
                }
                text.append(part.text());
            }
        }
        if (text.isEmpty() && result.structuredContent() != null) {
            return json.writeValueAsString(result.structuredContent());
        }
        return text.toString();
    }

    static String summary(Object structured) {
        if (structured instanceof Map<?, ?> map) {
            for (String key : ROW_KEYS) {
                if (map.get(key) instanceof List<?> list) {
                    return rows(list.size());
                }
            }
        }
        return "готово";
    }

    static String rows(int count) {
        int tens = count % 100;
        int ones = count % 10;
        String word;
        if (tens >= 11 && tens <= 14) {
            word = "строк";
        } else if (ones == 1) {
            word = "строка";
        } else if (ones >= 2 && ones <= 4) {
            word = "строки";
        } else {
            word = "строк";
        }
        return count + " " + word;
    }

    static String truncate(String text) {
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        if (bytes.length <= RESULT_LIMIT_BYTES) {
            return text;
        }
        int budget = RESULT_LIMIT_BYTES - TRUNCATED.getBytes(StandardCharsets.UTF_8).length;
        try {
            String head = StandardCharsets.UTF_8
                    .newDecoder()
                    .onMalformedInput(CodingErrorAction.IGNORE)
                    .onUnmappableCharacter(CodingErrorAction.IGNORE)
                    .decode(ByteBuffer.wrap(bytes, 0, budget))
                    .toString();
            return head + TRUNCATED;
        } catch (java.nio.charset.CharacterCodingException e) {
            return TRUNCATED.strip();
        }
    }

    private ObjectNode message(String role, String content) {
        ObjectNode message = json.createObjectNode();
        message.put("role", role);
        message.put("content", content);
        return message;
    }

    private ObjectNode assistantMessage(ModelClient.Reply reply) {
        ObjectNode message = json.createObjectNode();
        message.put("role", "assistant");
        message.put("content", reply.text());
        if (!reply.reasoning().isEmpty()) {
            message.put("reasoning_content", reply.reasoning());
        }
        ArrayNode calls = message.putArray("tool_calls");
        for (ModelClient.ToolCall call : reply.toolCalls()) {
            ObjectNode function = json.createObjectNode();
            function.put("name", call.name());
            function.put("arguments", call.arguments().isBlank() ? "{}" : call.arguments());
            ObjectNode item = calls.addObject();
            item.put("id", call.id());
            item.put("type", "function");
            item.set("function", function);
        }
        return message;
    }
}

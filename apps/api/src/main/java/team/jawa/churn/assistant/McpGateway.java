package team.jawa.churn.assistant;

import io.modelcontextprotocol.client.McpClient;
import io.modelcontextprotocol.client.McpSyncClient;
import io.modelcontextprotocol.client.transport.HttpClientStreamableHttpTransport;
import io.modelcontextprotocol.client.transport.McpHttpClientTransportAuthorizationException;
import io.modelcontextprotocol.spec.McpError;
import io.modelcontextprotocol.spec.McpSchema;
import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
class McpGateway {

    static final Duration TOOLS_TTL = Duration.ofSeconds(60);

    private static final Logger log = LoggerFactory.getLogger(McpGateway.class);
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(30);
    private static final int MAX_PAGES = 10;

    private final String base;
    private final String endpoint;
    private volatile Cached cached;

    private record Cached(List<McpSchema.Tool> tools, Instant until) {}

    static final class ToolFailure extends RuntimeException {
        ToolFailure(String message) {
            super(message, null, false, false);
        }
    }

    McpGateway(AssistantProperties properties) {
        URI uri = URI.create(properties.mcpUrl());
        this.base = uri.getScheme() + "://" + uri.getRawAuthority();
        this.endpoint = uri.getRawPath() == null || uri.getRawPath().isEmpty() ? "/mcp" : uri.getRawPath();
    }

    Session open(String authorization, boolean manualKey) {
        return new Session(authorization, manualKey);
    }

    final class Session implements AutoCloseable {

        private final String authorization;
        private final boolean manualKey;
        private McpSyncClient client;

        private Session(String authorization, boolean manualKey) {
            this.authorization = authorization;
            this.manualKey = manualKey;
        }

        List<McpSchema.Tool> tools() {
            Cached current = cached;
            if (current != null && Instant.now().isBefore(current.until())) {
                return current.tools();
            }
            List<McpSchema.Tool> tools = guarded(() -> {
                List<McpSchema.Tool> all = new ArrayList<>();
                String cursor = null;
                for (int page = 0; page < MAX_PAGES; page++) {
                    McpSchema.ListToolsResult result =
                            cursor == null ? client().listTools() : client().listTools(cursor);
                    all.addAll(result.tools());
                    cursor = result.nextCursor();
                    if (cursor == null || cursor.isEmpty()) {
                        break;
                    }
                }
                return List.copyOf(all);
            });
            cached = new Cached(tools, Instant.now().plus(TOOLS_TTL));
            return tools;
        }

        McpSchema.CallToolResult call(String name, Map<String, Object> arguments) {
            return guarded(() -> client().callTool(new McpSchema.CallToolRequest(name, arguments, null)));
        }

        private McpSyncClient client() {
            if (client == null) {
                HttpClientStreamableHttpTransport transport = HttpClientStreamableHttpTransport.builder(base)
                        .endpoint(endpoint)
                        .connectTimeout(Duration.ofSeconds(5))
                        .addHttpRequestCustomizer((builder, method, uri, body, context) ->
                                builder.setHeader("Authorization", authorization))
                        .build();
                client = McpClient.sync(transport)
                        .clientInfo(new McpSchema.Implementation("churn-api", "1"))
                        .requestTimeout(REQUEST_TIMEOUT)
                        .initializationTimeout(REQUEST_TIMEOUT)
                        .build();
                client.initialize();
            }
            return client;
        }

        private <T> T guarded(Supplier<T> action) {
            try {
                return action.get();
            } catch (RuntimeException e) {
                throw translate(e);
            }
        }

        private RuntimeException translate(RuntimeException error) {
            for (Throwable cause = error; cause != null; cause = cause.getCause()) {
                if (cause instanceof McpHttpClientTransportAuthorizationException denied) {
                    int status = denied.getResponseInfo().statusCode();
                    if (manualKey) {
                        return new AssistantFailure(status == 403 ? Outcome.KEY_FORBIDDEN : Outcome.KEY_INVALID);
                    }
                    if (status == 403) {
                        return new ToolFailure("access denied");
                    }
                    log.warn("mcp rejected the delegated token with status {}", status);
                    return new AssistantFailure(Outcome.UNAVAILABLE);
                }
                if (cause instanceof McpError mcpError) {
                    return new ToolFailure(mcpError.getMessage());
                }
            }
            log.warn("mcp request failed: {}", error.getClass().getSimpleName());
            return new AssistantFailure(Outcome.UNAVAILABLE);
        }

        @Override
        public void close() {
            if (client != null) {
                try {
                    client.close();
                } catch (RuntimeException e) {
                    log.debug("mcp client already closed");
                }
            }
        }
    }
}

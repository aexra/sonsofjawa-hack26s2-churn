package team.jawa.churn.assistant;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

final class McpStub {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    record Call(String authorization, String tool, JsonNode arguments) {}

    private final HttpServer server;
    private final List<String> authorizations = new CopyOnWriteArrayList<>();
    private final List<Call> calls = new CopyOnWriteArrayList<>();
    private final Map<String, String> results = new ConcurrentHashMap<>();
    private volatile int callStatus = 200;

    McpStub() throws IOException {
        server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.setExecutor(Executors.newCachedThreadPool());
        server.createContext("/mcp", this::handle);
        server.start();
    }

    String url() {
        return "http://localhost:" + server.getAddress().getPort() + "/mcp";
    }

    void reset() {
        authorizations.clear();
        calls.clear();
        results.clear();
        callStatus = 200;
    }

    void result(String tool, String structuredJson) {
        results.put(tool, structuredJson);
    }

    void callStatus(int status) {
        callStatus = status;
    }

    List<String> authorizations() {
        return List.copyOf(authorizations);
    }

    List<Call> calls() {
        return List.copyOf(calls);
    }

    private void handle(HttpExchange exchange) throws IOException {
        String authorization = exchange.getRequestHeaders().getFirst("Authorization");
        authorizations.add(String.valueOf(authorization));
        if (!"POST".equals(exchange.getRequestMethod())) {
            exchange.getRequestBody().readAllBytes();
            exchange.sendResponseHeaders(405, -1);
            exchange.close();
            return;
        }
        JsonNode request = JSON.readTree(exchange.getRequestBody().readAllBytes());
        if (!request.has("id")) {
            exchange.sendResponseHeaders(202, -1);
            exchange.close();
            return;
        }
        String method = request.path("method").asString();
        ObjectNode result = JSON.createObjectNode();
        switch (method) {
            case "initialize" -> {
                result.put(
                        "protocolVersion",
                        request.path("params").path("protocolVersion").asString());
                result.putObject("capabilities").putObject("tools");
                result.putObject("serverInfo").put("name", "stub").put("version", "1");
            }
            case "tools/list" -> {
                ArrayNode tools = result.putArray("tools");
                tools.add(tool("get_customers", "customers ranked by churn risk"));
                tools.add(tool("get_customer", "one customer card"));
            }
            case "tools/call" -> {
                String name = request.path("params").path("name").asString();
                calls.add(new Call(authorization, name, request.path("params").path("arguments")));
                if (callStatus != 200) {
                    exchange.sendResponseHeaders(callStatus, -1);
                    exchange.close();
                    return;
                }
                String structured = results.getOrDefault(name, "{\"ok\":true}");
                result.putArray("content").addObject().put("type", "text").put("text", structured);
                result.set("structuredContent", JSON.readTree(structured));
                result.put("isError", false);
            }
            default -> {}
        }
        ObjectNode response = JSON.createObjectNode();
        response.put("jsonrpc", "2.0");
        response.set("id", request.get("id"));
        response.set("result", result);
        byte[] body = JSON.writeValueAsBytes(response);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(200, body.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(body);
        }
    }

    private static ObjectNode tool(String name, String description) {
        ObjectNode tool = JSON.createObjectNode();
        tool.put("name", name);
        tool.put("description", description);
        ObjectNode schema = tool.putObject("inputSchema");
        schema.put("type", "object");
        schema.putObject("properties");
        return tool;
    }
}

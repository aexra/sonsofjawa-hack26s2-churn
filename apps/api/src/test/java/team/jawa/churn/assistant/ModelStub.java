package team.jawa.churn.assistant;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

final class ModelStub {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    record Response(int status, List<String> chunks, long delayMillis) {}

    record Received(String authorization, String body) {}

    private final HttpServer server;
    private final Deque<Response> script = new ConcurrentLinkedDeque<>();
    private final List<Received> received = new CopyOnWriteArrayList<>();

    ModelStub() throws IOException {
        server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.setExecutor(Executors.newCachedThreadPool());
        server.createContext("/v1/chat/completions", this::handle);
        server.start();
    }

    String url() {
        return "http://localhost:" + server.getAddress().getPort() + "/v1";
    }

    void reset() {
        script.clear();
        received.clear();
    }

    List<Received> received() {
        return List.copyOf(received);
    }

    void then(Response response) {
        script.addLast(response);
    }

    void thenText(String... parts) {
        List<String> chunks = new ArrayList<>();
        for (String part : parts) {
            chunks.add(chunk(delta -> delta.put("content", part)));
        }
        then(new Response(200, chunks, 0));
    }

    void thenToolCalls(String... nameAndArguments) {
        List<String> chunks = new ArrayList<>();
        for (int i = 0; i < nameAndArguments.length; i += 2) {
            int index = i / 2;
            String name = nameAndArguments[i];
            String arguments = nameAndArguments[i + 1];
            int half = arguments.length() / 2;
            chunks.add(chunk(delta -> {
                ObjectNode call = delta.putArray("tool_calls").addObject();
                call.put("index", index);
                call.put("id", "call_" + name + "_" + index);
                call.put("type", "function");
                ObjectNode function = call.putObject("function");
                function.put("name", name);
                function.put("arguments", arguments.substring(0, half));
            }));
            chunks.add(chunk(delta -> {
                ObjectNode call = delta.putArray("tool_calls").addObject();
                call.put("index", index);
                call.putObject("function").put("arguments", arguments.substring(half));
            }));
        }
        then(new Response(200, chunks, 0));
    }

    private static String chunk(java.util.function.Consumer<ObjectNode> fill) {
        ObjectNode chunk = JSON.createObjectNode();
        ArrayNode choices = chunk.putArray("choices");
        ObjectNode choice = choices.addObject();
        choice.put("index", 0);
        fill.accept(choice.putObject("delta"));
        return JSON.writeValueAsString(chunk);
    }

    private void handle(HttpExchange exchange) throws IOException {
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        received.add(new Received(exchange.getRequestHeaders().getFirst("Authorization"), body));
        Response response = script.pollFirst();
        if (response == null) {
            response = new Response(200, List.of(chunk(delta -> delta.put("content", "ок"))), 0);
        }
        if (response.delayMillis() > 0) {
            try {
                Thread.sleep(response.delayMillis());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        if (response.status() != 200) {
            exchange.sendResponseHeaders(response.status(), -1);
            exchange.close();
            return;
        }
        exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
        exchange.sendResponseHeaders(200, 0);
        try (OutputStream out = exchange.getResponseBody()) {
            for (String chunk : response.chunks()) {
                out.write(("data: " + chunk + "\n\n").getBytes(StandardCharsets.UTF_8));
                out.flush();
            }
            out.write("data: [DONE]\n\n".getBytes(StandardCharsets.UTF_8));
        } catch (IOException e) {
            exchange.close();
        }
    }
}

package team.jawa.churn.events;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.Statement;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.awaitility.core.ConditionTimeoutException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import team.jawa.churn.IntegrationTest;
import team.jawa.churn.recalc.RecalcService;
import team.jawa.churn.recalc.RecalcSupport;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class LiveEventsIT extends IntegrationTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Pattern SECRET = Pattern.compile("\"secret\":\"(ck_[a-z0-9]{8}_[0-9A-Za-z]{32})\"");
    private static final Duration STREAM = Duration.ofSeconds(10);

    @Autowired
    DataSource dataSource;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    RecalcService recalc;

    @Autowired
    PgNotifyBridge bridge;

    @BeforeEach
    @AfterEach
    void reset() {
        RecalcSupport.reset(jdbc);
    }

    @Test
    void anUnauthenticatedStreamIsRejected() throws Exception {
        HttpResponse<String> response = client().get("/api/v1/events");

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(response.body()).contains("\"code\":\"unauthenticated\"");
    }

    @Test
    void aReadKeyCanListenAndAnIngestKeyCannot() throws Exception {
        String read = issue("events-read", "[\"read\"]");
        String ingest = issue("events-ingest", "[\"ingest\"]");

        HttpResponse<String> denied =
                client().exchange("GET", "/api/v1/events", null, Map.of("Authorization", "Bearer " + ingest), false);
        try (Stream stream = open(null, "Bearer " + read)) {
            assertThat(denied.statusCode()).isEqualTo(403);
            assertThat(stream.status()).isEqualTo(200);
            assertThat(stream.contentType()).contains("text/event-stream");
            stream.until(line -> line.equals("retry:3000") || line.equals("retry: 3000"), STREAM);
        }
    }

    @Test
    void aSubscriberReceivesRecalcCompletedAfterARun() throws Exception {
        RecalcSupport.freezeClock(jdbc);
        RecalcSupport.loadReferenceData(jdbc);
        await().atMost(STREAM).until(bridge::listening);
        Client analyst = login("analyst", "analyst12345");

        try (Stream stream = open(analyst.cookie("churn_at").orElseThrow(), null)) {
            assertThat(stream.status()).isEqualTo(200);
            stream.until(line -> line.startsWith("retry:"), STREAM);

            assertThat(recalc.run("manual")).isEqualTo(new RecalcService.Outcome(RecalcService.Result.OK, 10));

            String data = stream.eventData("recalc.completed", STREAM);
            JsonNode event = JSON.readTree(data);
            assertThat(event.get("type").asString()).isEqualTo("recalc.completed");
            assertThat(event.get("runId").asLong()).isPositive();
            assertThat(event.get("trigger").asString()).isEqualTo("manual");
            assertThat(event.get("accountsProcessed").asInt()).isEqualTo(10);
            assertThat(event.get("modelVersion").asLong()).isPositive();
            assertThat(event.get("asOf").asString()).isNotBlank();
            assertThat(event.get("finishedAt").asString()).isNotBlank();
        }
    }

    @Test
    void aNotificationFromAnotherConnectionReachesTheSubscriber() throws Exception {
        await().atMost(STREAM).until(bridge::listening);
        Client analyst = login("analyst", "analyst12345");
        long version = 880_000L + (System.nanoTime() % 1000);

        try (Stream stream = open(analyst.cookie("churn_at").orElseThrow(), null);
                Connection other = dataSource.getConnection();
                Statement statement = other.createStatement()) {
            stream.until(line -> line.startsWith("retry:"), STREAM);
            statement.execute("select pg_notify('churn_events', '" + "{\"type\":\"model.updated\",\"modelVersion\":"
                    + version + ",\"source\":\"settings\"}')");

            String data = stream.eventData("model.updated", STREAM);
            JsonNode event = JSON.readTree(data);
            assertThat(event.get("modelVersion").asLong()).isEqualTo(version);
            assertThat(event.get("source").asString()).isEqualTo("settings");
        }
    }

    @Test
    void theStreamSendsAHeartbeat() throws Exception {
        Client analyst = login("analyst", "analyst12345");

        try (Stream stream = open(analyst.cookie("churn_at").orElseThrow(), null)) {
            stream.until(EventSubscribers.PING::equals, EventSubscribers.HEARTBEAT.plusSeconds(15));
        }
    }

    private Client login(String login, String password) throws Exception {
        Client client = client();
        assertThat(client.post(
                                "/api/v1/auth/login",
                                "{\"login\":\"" + login + "\",\"password\":\"" + password + "\"}",
                                false)
                        .statusCode())
                .isEqualTo(200);
        assertThat(client.get("/api/v1/auth/me").statusCode()).isEqualTo(200);
        return client;
    }

    private String issue(String name, String scopes) throws Exception {
        HttpResponse<String> response = login("admin", "admin12345")
                .exchange(
                        "POST",
                        "/api/v1/admin/api-keys",
                        "{\"name\":\"" + name + "\",\"scopes\":" + scopes + "}",
                        Map.of(),
                        true);
        assertThat(response.statusCode()).isEqualTo(201);
        Matcher secret = SECRET.matcher(response.body());
        assertThat(secret.find()).isTrue();
        return secret.group(1);
    }

    private Stream open(String accessCookie, String authorization) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/v1/events"))
                .header("Accept", "text/event-stream");
        if (accessCookie != null) {
            request.header("Cookie", "churn_at=" + accessCookie);
        }
        if (authorization != null) {
            request.header("Authorization", authorization);
        }
        HttpResponse<InputStream> response =
                HttpClient.newHttpClient().send(request.GET().build(), HttpResponse.BodyHandlers.ofInputStream());
        return new Stream(response);
    }

    private static final class Stream implements AutoCloseable {

        private final HttpResponse<InputStream> response;
        private final BlockingQueue<String> lines = new LinkedBlockingQueue<>();
        private final Thread reader;
        private final List<String> seen = new ArrayList<>();

        private Stream(HttpResponse<InputStream> response) {
            this.response = response;
            this.reader = new Thread(this::read, "sse-test");
            this.reader.setDaemon(true);
            this.reader.start();
        }

        private int status() {
            return response.statusCode();
        }

        private String contentType() {
            return response.headers().firstValue("content-type").orElse("");
        }

        private void until(Predicate<String> match, Duration timeout) {
            try {
                await().atMost(timeout).until(() -> {
                    drain();
                    return seen.stream().anyMatch(match);
                });
            } catch (ConditionTimeoutException e) {
                throw new AssertionError(diagnostic(), e);
            }
        }

        private String eventData(String event, Duration timeout) {
            try {
                await().atMost(timeout).until(() -> {
                    drain();
                    return data(event) != null;
                });
            } catch (ConditionTimeoutException e) {
                throw new AssertionError(diagnostic(), e);
            }
            return data(event);
        }

        private String diagnostic() {
            return "status=" + status() + " type=" + contentType() + " lines=" + seen;
        }

        private void drain() {
            lines.drainTo(seen);
        }

        private String data(String event) {
            for (int index = 0; index < seen.size(); index++) {
                String line = seen.get(index);
                if (!line.equals("event: " + event) && !line.equals("event:" + event)) {
                    continue;
                }
                for (int next = index + 1; next < seen.size(); next++) {
                    String candidate = seen.get(next);
                    if (candidate.startsWith("data:")) {
                        String value = candidate.substring("data:".length());
                        return value.startsWith(" ") ? value.substring(1) : value;
                    }
                }
            }
            return null;
        }

        private void read() {
            try (BufferedReader body =
                    new BufferedReader(new InputStreamReader(response.body(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = body.readLine()) != null) {
                    lines.add(line);
                }
            } catch (IOException e) {
                lines.add("");
            }
        }

        @Override
        public void close() throws IOException, InterruptedException {
            response.body().close();
            reader.join(Duration.ofSeconds(2).toMillis());
        }
    }
}

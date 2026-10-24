package team.jawa.churn.ingest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import team.jawa.churn.IntegrationTest;
import team.jawa.churn.recalc.RecalcScheduler;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

class SourceSnapshotIT extends IntegrationTest {

    private static final Pattern SECRET = Pattern.compile("\"secret\":\"(ck_[a-z0-9]{8}_[0-9A-Za-z]{32})\"");
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Path TEMPLATE = Path.of("../../ops/seeds/tmplt/data.json");
    private static final String APPLICATION_JSON = "application/json";
    private static final String BOUNDARY = "snapboundary";

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    RecalcScheduler scheduler;

    @Autowired
    DataSource dataSource;

    private String bot;

    @BeforeEach
    void setUp() throws Exception {
        awaitIdle();
        IngestSupport.reset(jdbc);
        IngestSupport.freezeClock(jdbc);
        bot = issueKey("snap-" + System.nanoTime());
    }

    @AfterEach
    void tearDown() {
        awaitIdle();
        IngestSupport.reset(jdbc);
    }

    @Test
    void aJsonSnapshotLoadsTheTemplateAndScoresEveryAccount() throws Exception {
        byte[] body = Files.readAllBytes(TEMPLATE);

        HttpResponse<String> response;
        List<String> events;
        try (IngestSupport.Events listener = new IngestSupport.Events(dataSource)) {
            response = put(APPLICATION_JSON, body);
            awaitScores(10);
            events = listener.collect(500).stream()
                    .filter(payload -> payload.contains("ingest.completed"))
                    .toList();
        }

        assertThat(response.statusCode()).isEqualTo(200);
        JsonNode result = tree(response);
        assertThat(result.get("mode").asString()).isEqualTo("snapshot");
        assertThat(result.get("entity").asString()).isEqualTo("snapshot");
        assertThat(result.get("format").asString()).isEqualTo("json");
        assertThat(result.get("rowsReceived").asInt()).isEqualTo(140);
        assertThat(result.get("rowsApplied").asInt()).isEqualTo(140);
        assertThat(result.get("applied").get("accounts").asInt()).isEqualTo(10);
        assertThat(result.get("applied").get("services").asInt()).isEqualTo(30);
        assertThat(result.get("applied").get("transactions").asInt()).isEqualTo(100);
        assertThat(result.get("recalc").get("state").asString()).isIn("scheduled", "coalesced");
        assertThat(count("accounts")).isEqualTo(10);
        assertThat(count("services")).isEqualTo(30);
        assertThat(count("transactions")).isEqualTo(100);
        assertThat(jdbc.queryForList(
                        "select risk_score::text from scores where is_current and status = 'scored' order by account_id",
                        String.class))
                .containsExactly("24.98", "23.33", "78.47", "19.18", "56.29", "55.00");
        assertThat(jdbc.queryForObject(
                        "select count(*) from scores where is_current and status = 'no_score'", Integer.class))
                .isEqualTo(4);
        assertThat(jdbc.queryForObject("select sum(expected_loss) from scores where is_current", Long.class))
                .isEqualTo(681905L);
        assertThat(jdbc.queryForObject("select trigger from recalc_runs", String.class))
                .isEqualTo("snapshot");
        Map<String, Object> entry =
                jdbc.queryForMap("select mode, entity, format, status, rows_received, rows_applied from ingest_log");
        assertThat(entry)
                .containsEntry("mode", "snapshot")
                .containsEntry("entity", "snapshot")
                .containsEntry("format", "json")
                .containsEntry("status", "ok")
                .containsEntry("rows_received", 140)
                .containsEntry("rows_applied", 140);
        assertThat(events).hasSize(1);
        JsonNode event = JSON.readTree(events.get(0));
        assertThat(event.get("entity").asString()).isEqualTo("snapshot");
        assertThat(event.get("mode").asString()).isEqualTo("snapshot");
        assertThat(event.get("rowsApplied").asInt()).isEqualTo(140);
        assertThat(event.get("source").asString()).isEqualTo("api");
    }

    @Test
    void replacingTheSnapshotWithoutAnAccountRemovesItAndKeepsScoreHistory() throws Exception {
        byte[] template = Files.readAllBytes(TEMPLATE);
        assertThat(put(APPLICATION_JSON, template).statusCode()).isEqualTo(200);
        awaitScores(10);

        HttpResponse<String> response = put(APPLICATION_JSON, withoutAccount(template, 10));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(tree(response).get("applied").get("accounts").asInt()).isEqualTo(9);
        assertThat(tree(response).get("applied").get("services").asInt()).isEqualTo(27);
        assertThat(tree(response).get("applied").get("transactions").asInt()).isEqualTo(90);
        await().atMost(Duration.ofSeconds(20))
                .until(() -> jdbc.queryForObject(
                                "select count(*) from scores where account_id = 10 and is_current and status = 'removed'",
                                Integer.class)
                        == 1);
        awaitIdle();
        assertThat(jdbc.queryForObject("select count(*) from customer_scores_vw where id = 10", Integer.class))
                .isZero();
        assertThat(jdbc.queryForObject("select count(*) from customer_scores_vw", Integer.class))
                .isEqualTo(9);
        assertThat(jdbc.queryForObject("select count(*) from accounts where id = 10", Integer.class))
                .isZero();
        assertThat(jdbc.queryForObject(
                        "select count(*) from scores where account_id = 10 and is_current = false", Integer.class))
                .isGreaterThanOrEqualTo(1);
        assertThat(jdbc.queryForObject(
                        "select status from scores where account_id = 10 and is_current = false order by id limit 1",
                        String.class))
                .isNotEqualTo("removed");
    }

    @Test
    void aMultipartSnapshotReplacesAllThreeTables() throws Exception {
        IngestSupport.loadReference(jdbc);
        byte[] body = multipart(
                "id,email,balance,withdrawBalance,totalReplenished,bonusBalance,bonusState\n"
                        + "1,solo@example.test,100,0,100,0,locked\n",
                "id,name,ownerId,paymentTerm,autoProlong,createdAt,expiresAt,status,price\n"
                        + "1,solo-svc,1,month,false,2026-10-01T10:00:00.000Z,2026-11-01T10:00:00.000Z,active,100\n",
                "id,amount,status,performedAt,createdAt,type,serviceId\n"
                        + "1,10,performed,2026-10-02T10:00:00.000Z,2026-10-01T10:00:00.000Z,order,1\n");

        HttpResponse<String> response = put("multipart/form-data; boundary=" + BOUNDARY, body);

        assertThat(response.statusCode()).isEqualTo(200);
        JsonNode result = tree(response);
        assertThat(result.get("mode").asString()).isEqualTo("snapshot");
        assertThat(result.get("format").asString()).isEqualTo("csv");
        assertThat(result.get("entity").asString()).isEqualTo("snapshot");
        assertThat(result.get("applied").get("accounts").asInt()).isEqualTo(1);
        assertThat(result.get("applied").get("services").asInt()).isEqualTo(1);
        assertThat(result.get("applied").get("transactions").asInt()).isEqualTo(1);
        assertThat(count("accounts")).isEqualTo(1);
        assertThat(count("services")).isEqualTo(1);
        assertThat(count("transactions")).isEqualTo(1);
        assertThat(jdbc.queryForObject("select email from accounts where id = 1", String.class))
                .isEqualTo("solo@example.test");
        assertThat(jdbc.queryForObject("select count(*) from accounts where id = 2", Integer.class))
                .isZero();
    }

    @Test
    void anErrorInOneEntityLeavesTheStoredSnapshotUntouched() throws Exception {
        IngestSupport.loadReference(jdbc);
        int accounts = count("accounts");
        int services = count("services");
        int transactions = count("transactions");
        int history = count("service_status_history");
        String badStatus = "{\"accounts\":[{\"id\":1,\"email\":\"a@example.test\"}],"
                + "\"services\":[{\"id\":1,\"name\":\"svc\",\"ownerId\":1,\"paymentTerm\":\"month\","
                + "\"autoProlong\":false,\"createdAt\":\"2026-10-01T10:00:00Z\",\"expiresAt\":\"2026-11-01T10:00:00Z\","
                + "\"status\":\"gone\",\"price\":10}],\"transactions\":[]}";
        String outside = "{\"accounts\":[{\"id\":100,\"email\":\"new@example.test\"}],"
                + "\"services\":[{\"id\":100,\"name\":\"svc-100\",\"ownerId\":1,\"paymentTerm\":\"month\","
                + "\"autoProlong\":false,\"createdAt\":\"2026-10-01T10:00:00Z\",\"expiresAt\":\"2026-11-01T10:00:00Z\","
                + "\"status\":\"active\",\"price\":10}],\"transactions\":[]}";

        HttpResponse<String> status = put(APPLICATION_JSON, badStatus.getBytes(StandardCharsets.UTF_8));
        HttpResponse<String> reference = put(APPLICATION_JSON, outside.getBytes(StandardCharsets.UTF_8));

        assertThat(status.statusCode()).isEqualTo(422);
        JsonNode statusError = tree(status).get("errors").get(0);
        assertThat(statusError.get("entity").asString()).isEqualTo("services");
        assertThat(statusError.get("field").asString()).isEqualTo("status");
        assertThat(statusError.get("code").asString()).isEqualTo("invalid_value");
        assertThat(reference.statusCode()).isEqualTo(422);
        JsonNode referenceError = tree(reference).get("errors").get(0);
        assertThat(referenceError.get("entity").asString()).isEqualTo("services");
        assertThat(referenceError.get("field").asString()).isEqualTo("ownerId");
        assertThat(referenceError.get("code").asString()).isEqualTo("unknown_reference");
        assertThat(count("accounts")).isEqualTo(accounts);
        assertThat(count("services")).isEqualTo(services);
        assertThat(count("transactions")).isEqualTo(transactions);
        assertThat(count("service_status_history")).isEqualTo(history);
        assertThat(jdbc.queryForObject("select email from accounts where id = 1", String.class))
                .isEqualTo("user-0001@example.test");
        assertThat(jdbc.queryForObject("select count(*) from accounts where id = 100", Integer.class))
                .isZero();
        assertThat(count("recalc_runs")).isZero();
        List<Map<String, Object>> logged =
                jdbc.queryForList("select mode, entity, status, format, rows_applied from ingest_log order by id");
        assertThat(logged).hasSize(2);
        assertThat(logged)
                .allSatisfy(entry -> assertThat(entry)
                        .containsEntry("mode", "snapshot")
                        .containsEntry("entity", "snapshot")
                        .containsEntry("status", "rejected")
                        .containsEntry("format", "json")
                        .containsEntry("rows_applied", 0));
    }

    @Test
    void loadingTheSameSnapshotAgainDoesNotRecordAStatusTransition() throws Exception {
        byte[] body = Files.readAllBytes(TEMPLATE);
        assertThat(put(APPLICATION_JSON, body).statusCode()).isEqualTo(200);
        awaitScores(10);
        int history = count("service_status_history");

        assertThat(put(APPLICATION_JSON, body).statusCode()).isEqualTo(200);

        assertThat(history).isEqualTo(30);
        assertThat(count("service_status_history")).isEqualTo(history);
        assertThat(jdbc.queryForObject(
                        "select count(*) from service_status_history where from_status is not null", Integer.class))
                .isZero();
        assertThat(count("accounts")).isEqualTo(10);
        assertThat(count("services")).isEqualTo(30);
        assertThat(count("transactions")).isEqualTo(100);
    }

    @Test
    void onlyAnAdministratorOrAnIngestKeyMayReplaceTheSnapshot() throws Exception {
        String readOnly = issueKey("reader-" + System.nanoTime(), "[\"read\"]");
        Client analyst = login("analyst", "analyst12345");
        Client admin = login("admin", "admin12345");
        String snapshot =
                "{\"accounts\":[{\"id\":1,\"email\":\"web@example.test\"}],\"services\":[],\"transactions\":[]}";

        assertThat(IngestSupport.send(
                                port, "PUT", "/api/v1/source/snapshot", null, APPLICATION_JSON, snapshot.getBytes())
                        .statusCode())
                .isIn(401, 403);
        assertThat(IngestSupport.send(
                                port, "PUT", "/api/v1/source/snapshot", readOnly, APPLICATION_JSON, snapshot.getBytes())
                        .statusCode())
                .isEqualTo(403);
        assertThat(analyst.exchange("PUT", "/api/v1/source/snapshot", snapshot, Map.of(), true)
                        .statusCode())
                .isEqualTo(403);
        assertThat(admin.exchange("PUT", "/api/v1/source/snapshot", snapshot, Map.of(), false)
                        .statusCode())
                .isEqualTo(403);
        HttpResponse<String> web = admin.exchange("PUT", "/api/v1/source/snapshot", snapshot, Map.of(), true);

        assertThat(web.statusCode()).isEqualTo(200);
        assertThat(tree(web).get("applied").get("accounts").asInt()).isEqualTo(1);
        assertThat(tree(web).get("applied").get("services").asInt()).isEqualTo(0);
        Map<String, Object> entry =
                jdbc.queryForMap("select actor, channel, mode, entity from ingest_log where status = 'ok'");
        assertThat(entry)
                .containsEntry("actor", "admin")
                .containsEntry("channel", "web")
                .containsEntry("mode", "snapshot")
                .containsEntry("entity", "snapshot");
    }

    @Test
    void aPlainTextSnapshotIsRefused() throws Exception {
        HttpResponse<String> response = put("text/plain", "{}".getBytes(StandardCharsets.UTF_8));

        assertThat(response.statusCode()).isEqualTo(415);
        assertThat(tree(response).get("code").asString()).isEqualTo("unsupported_media_type");
        assertThat(count("ingest_log")).isZero();
        assertThat(count("accounts")).isZero();
    }

    private void awaitIdle() {
        await().atMost(Duration.ofSeconds(15)).until(() -> !scheduler.isRunning());
    }

    private void awaitScores(int accounts) {
        await().atMost(Duration.ofSeconds(20))
                .until(() ->
                        jdbc.queryForObject("select count(*) from scores where is_current", Integer.class) == accounts);
        awaitIdle();
    }

    private int count(String table) {
        return jdbc.queryForObject("select count(*) from " + table, Integer.class);
    }

    private HttpResponse<String> put(String contentType, byte[] body) throws Exception {
        return IngestSupport.send(port, "PUT", "/api/v1/source/snapshot", bot, contentType, body);
    }

    private static JsonNode tree(HttpResponse<String> response) {
        return JSON.readTree(response.body());
    }

    private static byte[] withoutAccount(byte[] source, int accountId) {
        ObjectNode root = (ObjectNode) JSON.readTree(source);
        removeAccounts((ArrayNode) root.get("accounts"), accountId);
        Set<Integer> services = removeServices((ArrayNode) root.get("services"), accountId);
        removeTransactions((ArrayNode) root.get("transactions"), services);
        return JSON.writeValueAsString(root).getBytes(StandardCharsets.UTF_8);
    }

    private static void removeAccounts(ArrayNode accounts, int accountId) {
        for (int index = accounts.size() - 1; index >= 0; index--) {
            if (accounts.get(index).get("id").asInt() == accountId) {
                accounts.remove(index);
            }
        }
    }

    private static Set<Integer> removeServices(ArrayNode services, int accountId) {
        Set<Integer> removed = new HashSet<>();
        for (int index = services.size() - 1; index >= 0; index--) {
            if (services.get(index).get("ownerId").asInt() == accountId) {
                removed.add(services.get(index).get("id").asInt());
                services.remove(index);
            }
        }
        return removed;
    }

    private static void removeTransactions(ArrayNode transactions, Set<Integer> services) {
        for (int index = transactions.size() - 1; index >= 0; index--) {
            if (services.contains(transactions.get(index).get("serviceId").asInt())) {
                transactions.remove(index);
            }
        }
    }

    private static byte[] multipart(String accounts, String services, String transactions) {
        String body = part("accounts", accounts) + part("services", services) + part("transactions", transactions)
                + "--" + BOUNDARY + "--\r\n";
        return body.getBytes(StandardCharsets.UTF_8);
    }

    private static String part(String name, String csv) {
        return "--" + BOUNDARY + "\r\n"
                + "Content-Disposition: form-data; name=\"" + name + "\"; filename=\"" + name + ".csv\"\r\n"
                + "Content-Type: text/csv\r\n\r\n"
                + csv + "\r\n";
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

    private String issueKey(String name) throws Exception {
        return issueKey(name, "[\"ingest\"]");
    }

    private String issueKey(String name, String scopes) throws Exception {
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
        return "Bearer " + secret.group(1);
    }
}

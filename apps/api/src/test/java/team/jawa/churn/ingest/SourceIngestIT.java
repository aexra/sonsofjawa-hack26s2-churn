package team.jawa.churn.ingest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.math.BigDecimal;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
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

class SourceIngestIT extends IntegrationTest {

    private static final Pattern SECRET = Pattern.compile("\"secret\":\"(ck_[a-z0-9]{8}_[0-9A-Za-z]{32})\"");
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String CSV = "text/csv";
    private static final String APPLICATION_JSON = "application/json";
    private static final String SERVICE_26_CSV =
            "id,name,ownerId,paymentTerm,autoProlong,createdAt,expiresAt,status,price\n"
                    + "26,service-0026,6,week,false,2026-10-19T14:30:00.000Z,2026-10-26T14:30:00.000Z,prolong_wait,547\n";

    @Autowired
    io.micrometer.core.instrument.MeterRegistry meters;

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
        bot = issueKey("bot-" + System.nanoTime(), "[\"ingest\"]");
    }

    @AfterEach
    void tearDown() {
        awaitIdle();
        IngestSupport.reset(jdbc);
    }

    private void awaitIdle() {
        await().atMost(Duration.ofSeconds(15)).until(() -> !scheduler.isRunning());
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

    private HttpResponse<String> post(String path, String contentType, String body) throws Exception {
        return post(path, contentType, body.getBytes(StandardCharsets.UTF_8));
    }

    private HttpResponse<String> post(String path, String contentType, byte[] body) throws Exception {
        return IngestSupport.send(port, "POST", path, bot, contentType, body);
    }

    private HttpResponse<String> get(String path) throws Exception {
        return IngestSupport.send(port, "GET", path, bot, null, null);
    }

    private static JsonNode tree(HttpResponse<String> response) {
        return JSON.readTree(response.body());
    }

    private void recalculate() {
        scheduler.requestNow("manual");
        await().atMost(Duration.ofSeconds(20))
                .until(() -> jdbc.queryForObject("select count(*) from scores where is_current", Integer.class) > 0);
        awaitIdle();
    }

    private int count(String table) {
        return jdbc.queryForObject("select count(*) from " + table, Integer.class);
    }

    @Test
    void aCsvUploadUpdatesTheServiceAndTheOwnerGetsANewScore() throws Exception {
        IngestSupport.loadReference(jdbc);
        recalculate();
        BigDecimal before = jdbc.queryForObject(
                "select risk_score from scores where account_id = 6 and is_current", BigDecimal.class);

        double count = meters.counter("churn_ingest_rows", "entity", "services", "mode", "upsert", "result", "ok")
                .count();
        HttpResponse<String> response = post("/api/v1/source/services", CSV, SERVICE_26_CSV);
        assertThat(meters.counter("churn_ingest_rows", "entity", "services", "mode", "upsert", "result", "ok")
                        .count())
                .isEqualTo(count + 1);

        assertThat(response.statusCode()).isEqualTo(200);
        JsonNode body = tree(response);
        assertThat(body.get("mode").asString()).isEqualTo("upsert");
        assertThat(body.get("entity").asString()).isEqualTo("services");
        assertThat(body.get("format").asString()).isEqualTo("csv");
        assertThat(body.get("rowsReceived").asInt()).isEqualTo(1);
        assertThat(body.get("rowsApplied").asInt()).isEqualTo(1);
        assertThat(body.get("applied").get("services").asInt()).isEqualTo(1);
        assertThat(body.get("recalc").get("state").asString()).isIn("scheduled", "coalesced");
        assertThat(jdbc.queryForObject("select status from services where id = 26", String.class))
                .isEqualTo("prolong_wait");
        await().atMost(Duration.ofSeconds(5))
                .until(() -> jdbc.queryForObject(
                                "select count(*) from recalc_runs where trigger = 'ingest' and status = 'ok'",
                                Integer.class)
                        > 0);
        awaitIdle();
        BigDecimal after = jdbc.queryForObject(
                "select risk_score from scores where account_id = 6 and is_current", BigDecimal.class);
        assertThat(after).isGreaterThan(before);
        assertThat(jdbc.queryForObject("select status from ingest_log", String.class))
                .isEqualTo("ok");
    }

    @Test
    void anErrorInTheThirdRowRejectsTheWholeRequestAndChangesNothing() throws Exception {
        IngestSupport.loadReference(jdbc);
        String rows = "[" + service(26, "service-0026", 6, "active", 100) + ","
                + service(27, "service-0027", 7, "active", 100) + ","
                + service(28, "service-0028", 8, "gone", 100) + "]";

        double count = meters.counter("churn_ingest_rows", "entity", "services", "mode", "upsert", "result", "rejected")
                .count();
        HttpResponse<String> response = post("/api/v1/source/services", APPLICATION_JSON, rows);
        assertThat(meters.counter("churn_ingest_rows", "entity", "services", "mode", "upsert", "result", "rejected")
                        .count())
                .isEqualTo(count + 3);

        assertThat(response.statusCode()).isEqualTo(422);
        JsonNode body = tree(response);
        assertThat(body.get("code").asString()).isEqualTo("validation_failed");
        assertThat(body.get("errors").get(0).get("row").asInt()).isEqualTo(3);
        assertThat(body.get("errors").get(0).get("entity").asString()).isEqualTo("services");
        assertThat(body.get("errors").get(0).get("field").asString()).isEqualTo("status");
        assertThat(jdbc.queryForObject("select price from services where id = 26", Long.class))
                .isEqualTo(547L);
        Map<String, Object> entry =
                jdbc.queryForMap("select status, rows_received, rows_applied, format, entity from ingest_log");
        assertThat(entry)
                .containsEntry("status", "rejected")
                .containsEntry("rows_received", 3)
                .containsEntry("rows_applied", 0)
                .containsEntry("format", "json")
                .containsEntry("entity", "services");
        assertThat(count("recalc_runs")).isZero();
    }

    private static String service(long id, String name, long ownerId, String status, long price) {
        return "{\"id\":" + id + ",\"name\":\"" + name + "\",\"ownerId\":" + ownerId
                + ",\"paymentTerm\":\"month\",\"autoProlong\":true,\"createdAt\":\"2026-10-01T10:00:00Z\","
                + "\"expiresAt\":\"2026-11-01T10:00:00Z\",\"status\":\"" + status + "\",\"price\":" + price + "}";
    }

    @Test
    void readingReturnsTheSourceRowsForTheEditor() throws Exception {
        IngestSupport.loadReference(jdbc);

        JsonNode one = tree(get("/api/v1/source/services?ids=26"));
        JsonNode owned = tree(get("/api/v1/source/services?ownerId=6&size=2"));
        JsonNode accounts = tree(get("/api/v1/source/accounts?ids=1,2,3"));
        JsonNode transactions = tree(get("/api/v1/source/transactions?serviceId=1"));

        assertThat(one.get("totalItems").asInt()).isEqualTo(1);
        JsonNode item = one.get("items").get(0);
        assertThat(item.get("id").asInt()).isEqualTo(26);
        assertThat(item.get("name").asString()).isEqualTo("service-0026");
        assertThat(item.get("ownerId").asInt()).isEqualTo(6);
        assertThat(item.get("paymentTerm").asString()).isEqualTo("week");
        assertThat(item.get("autoProlong").asBoolean()).isFalse();
        assertThat(item.get("status").asString()).isEqualTo("active");
        assertThat(item.get("price").asInt()).isEqualTo(547);
        assertThat(owned.get("totalItems").asInt()).isEqualTo(3);
        assertThat(owned.get("items")).hasSize(2);
        assertThat(owned.get("totalPages").asInt()).isEqualTo(2);
        assertThat(accounts.get("items"))
                .extracting(node -> node.get("id").asInt())
                .containsExactly(1, 2, 3);
        assertThat(accounts.get("items").get(0).get("bonusState").asString()).isIn("locked", "unlocked");
        assertThat(transactions.get("items")).isNotEmpty();
        assertThat(transactions.get("items").get(0).get("serviceId").asInt()).isEqualTo(1);
    }

    @Test
    void anUpsertChangesOnlyTheGivenColumnsAndInsertsRowsWithoutId() throws Exception {
        IngestSupport.loadReference(jdbc);
        Long balance = jdbc.queryForObject("select balance from accounts where id = 1", Long.class);

        HttpResponse<String> response = post(
                "/api/v1/source/accounts",
                APPLICATION_JSON,
                "[{\"id\":1,\"email\":\"changed@example.test\"},{\"email\":\"fresh@example.test\"},"
                        + "{\"id\":50,\"email\":\"fifty@example.test\",\"balance\":777,\"bonusState\":\"unlocked\"}]");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForObject("select email from accounts where id = 1", String.class))
                .isEqualTo("changed@example.test");
        assertThat(jdbc.queryForObject("select balance from accounts where id = 1", Long.class))
                .isEqualTo(balance);
        assertThat(jdbc.queryForObject("select id from accounts where email = 'fresh@example.test'", Long.class))
                .isEqualTo(51L);
        Map<String, Object> fifty =
                jdbc.queryForMap("select balance, \"bonusState\", \"withdrawBalance\" from accounts where id = 50");
        assertThat(fifty)
                .containsEntry("balance", 777L)
                .containsEntry("bonusState", "unlocked")
                .containsEntry("withdrawBalance", 0L);
        assertThat(count("accounts")).isEqualTo(12);
    }

    @Test
    void aRequestLargerThanOneBatchIsAppliedAndTheSequenceFollowsTheLargestId() throws Exception {
        StringBuilder rows = new StringBuilder("id,email,balance\n");
        for (int i = 0; i < 2500; i++) {
            rows.append(1000 + i)
                    .append(",bulk-")
                    .append(i)
                    .append("@example.test,")
                    .append(i)
                    .append('\n');
        }

        HttpResponse<String> response = post("/api/v1/source/accounts", CSV, rows.toString());
        HttpResponse<String> next =
                post("/api/v1/source/accounts", APPLICATION_JSON, "[{\"email\":\"after-bulk@example.test\"}]");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(tree(response).get("rowsApplied").asInt()).isEqualTo(2500);
        assertThat(count("accounts")).isEqualTo(2501);
        assertThat(jdbc.queryForObject("select balance from accounts where id = 3499", Long.class))
                .isEqualTo(2499L);
        assertThat(next.statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForObject("select id from accounts where email = 'after-bulk@example.test'", Long.class))
                .isEqualTo(3500L);
    }

    @Test
    void anInsertedServiceGetsTheModelClockAsCreationTime() throws Exception {
        IngestSupport.loadReference(jdbc);

        HttpResponse<String> response = post(
                "/api/v1/source/services",
                APPLICATION_JSON,
                "[{\"name\":\"fresh-service\",\"ownerId\":1,\"paymentTerm\":\"month\",\"expiresAt\":\"2026-12-01T00:00:00Z\","
                        + "\"status\":\"active\",\"price\":900}]");

        assertThat(response.statusCode()).isEqualTo(200);
        Map<String, Object> row = jdbc.queryForMap(
                "select id, \"autoProlong\", \"createdAt\" = ?::timestamptz as at_model_now from services where name ="
                        + " 'fresh-service'",
                IngestSupport.AS_OF);
        assertThat(row)
                .containsEntry("id", 31L)
                .containsEntry("autoProlong", false)
                .containsEntry("at_model_now", true);
    }

    @Test
    void transactionsAreUpsertedFromCsv() throws Exception {
        IngestSupport.loadReference(jdbc);

        HttpResponse<String> response = post(
                "/api/v1/source/transactions",
                CSV,
                "id,amount,status,performedAt,createdAt,type,serviceId\n"
                        + "900,250,performed,2026-10-19T14:00:05.000Z,2026-10-19T14:00:00.000Z,prolong,26\n"
                        + "901,0,not_performed,,2026-10-19T14:10:00.000Z,order,26\n");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForObject("select status from transactions where id = 900", String.class))
                .isEqualTo("performed");
        assertThat(jdbc.queryForObject(
                        "select \"performedAt\" is null from transactions where id = 901", Boolean.class))
                .isTrue();
        assertThat(tree(response).get("applied").get("transactions").asInt()).isEqualTo(2);
    }

    @Test
    void everyValidationRuleRejectsTheRequestAndWritesNothing() throws Exception {
        IngestSupport.loadReference(jdbc);
        int accounts = count("accounts");
        int services = count("services");
        int transactions = count("transactions");
        List<String[]> cases = List.of(
                new String[] {"services", "[" + service(30, "bad name", 1, "active", 5) + "]", "name", "invalid_format"
                },
                new String[] {
                    "services",
                    "[" + service(30, "ok-name", 1, "active", 5).replace("\"price\":5", "\"price\":\"5\"") + "]",
                    "price",
                    "invalid_type"
                },
                new String[] {"services", "[" + service(30, "ok-name", 1, "gone", 5) + "]", "status", "invalid_value"},
                new String[] {"services", "[" + service(30, "ok-name", 1, "active", -5) + "]", "price", "out_of_range"},
                new String[] {
                    "services", "[" + service(30, "ok-name", 9999, "active", 5) + "]", "ownerId", "unknown_reference"
                },
                new String[] {
                    "services",
                    "[" + service(30, "ok-name", 1, "active", 5).replace("2026-11-01T10:00:00Z", "2026-09-01T10:00:00Z")
                            + "]",
                    "expiresAt",
                    "before_created_at"
                },
                new String[] {
                    "transactions", "[{\"amount\":1001,\"type\":\"order\",\"serviceId\":1}]", "amount", "out_of_range"
                },
                new String[] {
                    "transactions", "[{\"amount\":5,\"type\":\"refund\",\"serviceId\":1}]", "type", "invalid_value"
                },
                new String[] {
                    "transactions",
                    "[{\"amount\":5,\"type\":\"order\",\"serviceId\":9999}]",
                    "serviceId",
                    "unknown_reference"
                },
                new String[] {
                    "transactions",
                    "[{\"amount\":5,\"type\":\"order\",\"serviceId\":1,\"status\":\"not_performed\",\"performedAt\":\"2026-10-19T14:00:00Z\"}]",
                    "performedAt",
                    "performed_at_mismatch"
                },
                new String[] {"accounts", "[{\"email\":\"x@example.test\",\"balance\":-1}]", "balance", "out_of_range"},
                new String[] {
                    "accounts",
                    "[{\"email\":\"x@example.test\",\"bonusState\":\"maybe\"}]",
                    "bonusState",
                    "invalid_value"
                },
                new String[] {"accounts", "[{\"balance\":1}]", "email", "required"},
                new String[] {
                    "accounts", "[{\"email\":\"x@example.test\",\"colour\":\"red\"}]", "colour", "unknown_field"
                });

        for (String[] rule : cases) {
            HttpResponse<String> response = post("/api/v1/source/" + rule[0], APPLICATION_JSON, rule[1]);

            assertThat(response.statusCode()).as(rule[3] + " " + rule[1]).isEqualTo(422);
            JsonNode first = tree(response).get("errors").get(0);
            assertThat(first.get("field").asString()).as(rule[3]).isEqualTo(rule[2]);
            assertThat(first.get("code").asString()).as(rule[3]).isEqualTo(rule[3]);
            assertThat(first.get("row").asInt()).isEqualTo(1);
        }

        assertThat(count("accounts")).isEqualTo(accounts);
        assertThat(count("services")).isEqualTo(services);
        assertThat(count("transactions")).isEqualTo(transactions);
        assertThat(count("ingest_log")).isEqualTo(cases.size());
        assertThat(jdbc.queryForObject("select count(*) from ingest_log where status = 'rejected'", Integer.class))
                .isEqualTo(cases.size());
    }

    @Test
    void aDatabaseConstraintLeftToTheLastLineOfDefenceBecomesA422() throws Exception {
        IngestSupport.loadReference(jdbc);

        HttpResponse<String> response =
                post("/api/v1/source/accounts", APPLICATION_JSON, "[{\"id\":99,\"email\":\"user-0001@example.test\"}]");

        assertThat(response.statusCode()).isEqualTo(422);
        assertThat(tree(response).get("errors").get(0).get("code").asString()).isEqualTo("constraint_violation");
        assertThat(count("accounts")).isEqualTo(10);
        assertThat(jdbc.queryForObject("select status from ingest_log", String.class))
                .isEqualTo("rejected");
    }

    @Test
    void aCsvWithAByteOrderMarkAndQuotedCellsIsApplied() throws Exception {
        String csv = "﻿id,email,balance\r\n"
                + "60,\"quoted,comma@example.test\",100\r\n"
                + "61,\"say \"\"hi\"\"@example.test\",200\r\n";

        HttpResponse<String> response = post("/api/v1/source/accounts", CSV + "; charset=utf-8", csv);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForObject("select email from accounts where id = 60", String.class))
                .isEqualTo("quoted,comma@example.test");
        assertThat(jdbc.queryForObject("select email from accounts where id = 61", String.class))
                .isEqualTo("say \"hi\"@example.test");
        assertThat(jdbc.queryForObject("select balance from accounts where id = 61", Long.class))
                .isEqualTo(200L);
    }

    @Test
    void csvStructureProblemsAreReported() throws Exception {
        HttpResponse<String> unknown = post("/api/v1/source/accounts", CSV, "id,email,colour\n1,a@example.test,red\n");
        HttpResponse<String> missing = post("/api/v1/source/accounts", CSV, "id,balance\n1,5\n");
        HttpResponse<String> ragged = post("/api/v1/source/accounts", CSV, "id,email\n1,a@example.test\n2\n");
        HttpResponse<String> empty = post("/api/v1/source/accounts", CSV, "");
        HttpResponse<String> headerOnly = post("/api/v1/source/accounts", CSV, "id,email\n");
        HttpResponse<String> unterminated = post("/api/v1/source/accounts", CSV, "id,email\n1,\"open\n");
        HttpResponse<String> notUtf8 =
                post("/api/v1/source/accounts", CSV, new byte[] {'i', 'd', ',', 'e', '\n', (byte) 0xC3, (byte) 0x28});

        assertThat(unknown.statusCode()).isEqualTo(422);
        assertThat(tree(unknown).get("errors").get(0).get("code").asString()).isEqualTo("unknown_column");
        assertThat(missing.statusCode()).isEqualTo(422);
        assertThat(tree(missing).get("errors").get(0).get("code").asString()).isEqualTo("missing_column");
        assertThat(ragged.statusCode()).isEqualTo(422);
        assertThat(tree(ragged).get("errors").get(0).get("row").asInt()).isEqualTo(2);
        assertThat(tree(ragged).get("errors").get(0).get("code").asString()).isEqualTo("invalid_row");
        assertThat(empty.statusCode()).isEqualTo(422);
        assertThat(tree(empty).get("errors").get(0).get("code").asString()).isEqualTo("empty_input");
        assertThat(headerOnly.statusCode()).isEqualTo(422);
        assertThat(unterminated.statusCode()).isEqualTo(400);
        assertThat(notUtf8.statusCode()).isEqualTo(400);
        assertThat(count("accounts")).isZero();
    }

    @Test
    void malformedJsonIsABadRequest() throws Exception {
        for (String body : List.of("{", "{\"id\":1}", "[1,2]", "[null]", "")) {
            HttpResponse<String> response = post("/api/v1/source/accounts", APPLICATION_JSON, body);

            assertThat(response.statusCode()).as(body).isEqualTo(400);
        }
        assertThat(count("accounts")).isZero();
    }

    @Test
    void anUnsupportedContentTypeIsRefused() throws Exception {
        HttpResponse<String> plain = post("/api/v1/source/accounts", "text/plain", "id,email\n");
        HttpResponse<String> none = post("/api/v1/source/accounts", null, "[]");

        assertThat(plain.statusCode()).isEqualTo(415);
        assertThat(tree(plain).get("code").asString()).isEqualTo("unsupported_media_type");
        assertThat(none.statusCode()).isEqualTo(415);
    }

    @Test
    void unknownEntitiesAndBadQueriesAreRefused() throws Exception {
        assertThat(post("/api/v1/source/widgets", APPLICATION_JSON, "[]").statusCode())
                .isEqualTo(404);
        assertThat(get("/api/v1/source/widgets").statusCode()).isEqualTo(404);
        assertThat(get("/api/v1/source/accounts?size=501").statusCode()).isEqualTo(400);
        assertThat(get("/api/v1/source/accounts?size=0").statusCode()).isEqualTo(400);
        assertThat(get("/api/v1/source/accounts?page=-1").statusCode()).isEqualTo(400);
        assertThat(get("/api/v1/source/accounts?ownerId=1").statusCode()).isEqualTo(400);
        assertThat(get("/api/v1/source/services?serviceId=1").statusCode()).isEqualTo(400);
        assertThat(tree(get("/api/v1/source/accounts?size=501")).get("code").asString())
                .isEqualTo("invalid_filter");
    }

    @Test
    void onlyAnAdministratorOrAKeyWithTheIngestScopeMayUseTheSource() throws Exception {
        String readOnly = issueKey("reader-" + System.nanoTime(), "[\"read\"]");
        Client analyst = login("analyst", "analyst12345");

        assertThat(IngestSupport.send(port, "GET", "/api/v1/source/accounts", null, null, null)
                        .statusCode())
                .isEqualTo(401);
        assertThat(IngestSupport.send(port, "POST", "/api/v1/source/accounts", null, APPLICATION_JSON, "[]".getBytes())
                        .statusCode())
                .isIn(401, 403);
        assertThat(IngestSupport.send(port, "GET", "/api/v1/source/accounts", readOnly, null, null)
                        .statusCode())
                .isEqualTo(403);
        assertThat(IngestSupport.send(
                                port, "POST", "/api/v1/source/accounts", readOnly, APPLICATION_JSON, "[]".getBytes())
                        .statusCode())
                .isEqualTo(403);
        assertThat(analyst.get("/api/v1/source/accounts").statusCode()).isEqualTo(403);
        assertThat(analyst.get("/api/v1/source/ingest-log").statusCode()).isEqualTo(403);
        assertThat(analyst.exchange("POST", "/api/v1/source/accounts", "[]", Map.of(), true)
                        .statusCode())
                .isEqualTo(403);
    }

    @Test
    void anAdministratorUploadsFromTheWebAndTheJournalNamesTheActor() throws Exception {
        Client admin = login("admin", "admin12345");

        HttpResponse<String> web = admin.exchange(
                "POST", "/api/v1/source/accounts", "[{\"id\":70,\"email\":\"web@example.test\"}]", Map.of(), true);
        HttpResponse<String> withoutCsrf = admin.exchange(
                "POST", "/api/v1/source/accounts", "[{\"id\":71,\"email\":\"nocsrf@example.test\"}]", Map.of(), false);
        post("/api/v1/source/accounts", APPLICATION_JSON, "[{\"id\":72,\"email\":\"bot@example.test\"}]");
        post("/api/v1/source/accounts", APPLICATION_JSON, "[{\"id\":73}]");
        JsonNode log = tree(admin.get("/api/v1/source/ingest-log"));

        assertThat(web.statusCode()).isEqualTo(200);
        assertThat(withoutCsrf.statusCode()).isEqualTo(403);
        assertThat(log.get("totalItems").asInt()).isEqualTo(3);
        JsonNode newest = log.get("items").get(0);
        JsonNode middle = log.get("items").get(1);
        JsonNode oldest = log.get("items").get(2);
        assertThat(newest.get("status").asString()).isEqualTo("rejected");
        assertThat(newest.get("channel").asString()).isEqualTo("api");
        assertThat(newest.get("errors").get(0).get("field").asString()).isEqualTo("email");
        assertThat(middle.get("status").asString()).isEqualTo("ok");
        assertThat(middle.get("channel").asString()).isEqualTo("api");
        assertThat(middle.get("actor").asString()).startsWith("bot-");
        assertThat(oldest.get("actor").asString()).isEqualTo("admin");
        assertThat(oldest.get("channel").asString()).isEqualTo("web");
        assertThat(oldest.get("entity").asString()).isEqualTo("accounts");
        assertThat(oldest.get("format").asString()).isEqualTo("json");
        assertThat(oldest.get("rowsApplied").asInt()).isEqualTo(1);
        assertThat(oldest.get("receivedAt").asString()).isNotBlank();
        assertThat(tree(admin.get("/api/v1/source/ingest-log?size=1&page=1")).get("items"))
                .hasSize(1);
    }

    @Test
    void anUploadPublishesAnEventAndAFailedOneDoesNot() throws Exception {
        try (IngestSupport.Events events = new IngestSupport.Events(dataSource)) {
            post("/api/v1/source/accounts", APPLICATION_JSON, "[{\"id\":80,\"email\":\"event@example.test\"}]");
            post("/api/v1/source/accounts", APPLICATION_JSON, "[{\"id\":81}]");
            awaitIdle();

            List<String> received = events.collect(500).stream()
                    .filter(payload -> payload.contains("ingest.completed"))
                    .toList();

            assertThat(received).hasSize(1);
            JsonNode event = JSON.readTree(received.get(0));
            assertThat(event.get("entity").asString()).isEqualTo("accounts");
            assertThat(event.get("mode").asString()).isEqualTo("upsert");
            assertThat(event.get("rowsApplied").asInt()).isEqualTo(1);
            assertThat(event.get("source")).isNull();
        }
    }

    @Test
    void aSuccessfulUploadStartsARecalculationWithTheIngestTrigger() throws Exception {
        post("/api/v1/source/accounts", APPLICATION_JSON, "[{\"id\":90,\"email\":\"fresh@example.test\"}]");
        post("/api/v1/source/services", APPLICATION_JSON, "[" + service(500, "svc-500", 90, "active", 5) + "]");

        await().atMost(Duration.ofSeconds(10))
                .until(() -> jdbc.queryForObject(
                                "select count(*) from scores where account_id = 90 and is_current", Integer.class)
                        == 1);
        assertThat(jdbc.queryForObject("select trigger from recalc_runs order by id limit 1", String.class))
                .isEqualTo("ingest");
    }
}

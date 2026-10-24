package team.jawa.churn.ingest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import team.jawa.churn.IntegrationTest;
import team.jawa.churn.recalc.RecalcScheduler;

@TestPropertySource(properties = {"ingest.max-rows=3", "ingest.max-bytes=1KB"})
class SourceIngestLimitsIT extends IntegrationTest {

    private static final Pattern SECRET = Pattern.compile("\"secret\":\"(ck_[a-z0-9]{8}_[0-9A-Za-z]{32})\"");

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    RecalcScheduler scheduler;

    private String bot;

    @BeforeEach
    void setUp() throws Exception {
        awaitIdle();
        IngestSupport.reset(jdbc);
        Client admin = client();
        assertThat(admin.post("/api/v1/auth/login", "{\"login\":\"admin\",\"password\":\"admin12345\"}", false)
                        .statusCode())
                .isEqualTo(200);
        assertThat(admin.get("/api/v1/auth/me").statusCode()).isEqualTo(200);
        HttpResponse<String> issued = admin.exchange(
                "POST",
                "/api/v1/admin/api-keys",
                "{\"name\":\"limits-" + System.nanoTime() + "\",\"scopes\":[\"ingest\"]}",
                Map.of(),
                true);
        Matcher secret = SECRET.matcher(issued.body());
        assertThat(secret.find()).isTrue();
        bot = "Bearer " + secret.group(1);
    }

    @AfterEach
    void tearDown() {
        awaitIdle();
        IngestSupport.reset(jdbc);
    }

    private void awaitIdle() {
        await().atMost(Duration.ofSeconds(15)).until(() -> !scheduler.isRunning());
    }

    @Test
    void moreRowsThanTheLimitAreRefusedWithPayloadTooLarge() throws Exception {
        HttpResponse<String> response = IngestSupport.send(
                port,
                "POST",
                "/api/v1/source/accounts",
                bot,
                "application/json",
                "[{\"email\":\"a@x.test\"},{\"email\":\"b@x.test\"},{\"email\":\"c@x.test\"},{\"email\":\"d@x.test\"}]"
                        .getBytes(StandardCharsets.UTF_8));

        assertThat(response.statusCode()).isEqualTo(413);
        assertThat(response.body()).contains("\"code\":\"payload_too_large\"");
        assertThat(jdbc.queryForObject("select count(*) from accounts", Integer.class))
                .isZero();
        assertThat(jdbc.queryForObject("select status from ingest_log", String.class))
                .isEqualTo("rejected");
    }

    @Test
    void theRowLimitItselfIsAccepted() throws Exception {
        HttpResponse<String> response = IngestSupport.send(
                port,
                "POST",
                "/api/v1/source/accounts",
                bot,
                "application/json",
                "[{\"email\":\"a@x.test\"},{\"email\":\"b@x.test\"},{\"email\":\"c@x.test\"}]"
                        .getBytes(StandardCharsets.UTF_8));

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(jdbc.queryForObject("select count(*) from accounts", Integer.class))
                .isEqualTo(3);
    }

    @Test
    void aBodyLargerThanTheByteLimitIsRefusedWithPayloadTooLarge() throws Exception {
        byte[] body = ("[{\"email\":\"" + "x".repeat(3000) + "@x.test\"}]").getBytes(StandardCharsets.UTF_8);

        HttpResponse<String> response =
                IngestSupport.send(port, "POST", "/api/v1/source/accounts", bot, "application/json", body);

        assertThat(response.statusCode()).isEqualTo(413);
        assertThat(response.body()).contains("\"code\":\"payload_too_large\"");
        assertThat(jdbc.queryForObject("select count(*) from accounts", Integer.class))
                .isZero();
    }

    @Test
    void aChunkedBodyWithoutALengthIsLimitedToo() throws Exception {
        byte[] body = ("[{\"email\":\"" + "y".repeat(3000) + "@x.test\"}]").getBytes(StandardCharsets.UTF_8);
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/v1/source/accounts"))
                .header("Authorization", bot)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofInputStream(() -> new ByteArrayInputStream(body)))
                .build();

        HttpResponse<String> response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(413);
        assertThat(jdbc.queryForObject("select count(*) from accounts", Integer.class))
                .isZero();
    }
}

package team.jawa.churn.recalc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import team.jawa.churn.IntegrationTest;

class RecalcApiIT extends IntegrationTest {

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    RecalcScheduler scheduler;

    @BeforeEach
    @AfterEach
    void reset() {
        await().atMost(Duration.ofSeconds(10)).until(() -> !scheduler.isRunning());
        RecalcSupport.reset(jdbc);
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

    private HttpResponse<String> post(Client client, String path) throws Exception {
        return client.exchange("POST", path, null, Map.of(), true);
    }

    @Test
    void anAdministratorStartsARunAndGetsAnAcceptedState() throws Exception {
        RecalcSupport.freezeClock(jdbc);
        RecalcSupport.loadReferenceData(jdbc);

        HttpResponse<String> response = post(login("admin", "admin12345"), "/api/v1/recalc");

        assertThat(response.statusCode()).isEqualTo(202);
        assertThat(response.body()).containsPattern("\"state\":\"(scheduled|coalesced)\"");
        await().atMost(Duration.ofSeconds(20))
                .until(() -> jdbc.queryForObject("select count(*) from scores where is_current", Integer.class) == 10);
        assertThat(jdbc.queryForObject("select trigger from recalc_runs", String.class))
                .isEqualTo("manual");
    }

    @Test
    void scopeAllQueuesEveryAccountFirst() throws Exception {
        RecalcSupport.freezeClock(jdbc);
        RecalcSupport.loadReferenceData(jdbc);
        post(login("admin", "admin12345"), "/api/v1/recalc");
        await().atMost(Duration.ofSeconds(20))
                .until(() -> jdbc.queryForObject("select count(*) from recalc_runs", Integer.class) == 1);
        await().atMost(Duration.ofSeconds(10)).until(() -> !scheduler.isRunning());

        HttpResponse<String> response = post(login("admin", "admin12345"), "/api/v1/recalc?scope=all");

        assertThat(response.statusCode()).isEqualTo(202);
        await().atMost(Duration.ofSeconds(20))
                .until(() -> jdbc.queryForObject("select count(*) from recalc_runs", Integer.class) == 2);
        assertThat(jdbc.queryForObject("select max(accounts_processed) from recalc_runs", Integer.class))
                .isEqualTo(10);
    }

    @Test
    void anAnalystCannotStartARunButCanReadTheStatus() throws Exception {
        Client analyst = login("analyst", "analyst12345");

        assertThat(post(analyst, "/api/v1/recalc").statusCode()).isEqualTo(403);
        HttpResponse<String> status = analyst.get("/api/v1/recalc/status");

        assertThat(status.statusCode()).isEqualTo(200);
        assertThat(status.body())
                .contains("\"running\":false")
                .contains("\"pendingAccounts\":0")
                .contains("\"recentRuns\":[]");
    }

    @Test
    void anonymousCallersAreRejected() throws Exception {
        assertThat(client().get("/api/v1/recalc/status").statusCode()).isEqualTo(401);
        HttpResponse<String> post = client().post("/api/v1/recalc", "{}", false);
        assertThat(post.statusCode()).isEqualTo(403);
        assertThat(post.body()).contains("\"code\":\"csrf_invalid\"");
    }

    @Test
    void anUnknownScopeIsABadRequest() throws Exception {
        HttpResponse<String> response = post(login("admin", "admin12345"), "/api/v1/recalc?scope=everything");

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).contains("\"code\":\"invalid_filter\"");
    }

    @Test
    void theStatusShowsPendingAccountsAndTheLastRun() throws Exception {
        RecalcSupport.freezeClock(jdbc);
        RecalcSupport.loadReferenceData(jdbc);
        Client admin = login("admin", "admin12345");

        assertThat(admin.get("/api/v1/recalc/status").body()).contains("\"pendingAccounts\":10");

        post(admin, "/api/v1/recalc");
        await().atMost(Duration.ofSeconds(20))
                .until(() -> jdbc.queryForObject("select count(*) from recalc_runs", Integer.class) == 1);

        String status = admin.get("/api/v1/recalc/status").body();
        assertThat(status)
                .contains("\"pendingAccounts\":0")
                .contains("\"lastRun\":{")
                .contains("\"trigger\":\"manual\"")
                .contains("\"status\":\"ok\"")
                .contains("\"accountsProcessed\":10");
    }
}

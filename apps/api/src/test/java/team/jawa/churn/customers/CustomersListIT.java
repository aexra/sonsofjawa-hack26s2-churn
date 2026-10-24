package team.jawa.churn.customers;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import team.jawa.churn.IntegrationTest;
import team.jawa.churn.recalc.RecalcScheduler;
import team.jawa.churn.recalc.RecalcService;
import team.jawa.churn.recalc.RecalcSupport;

class CustomersListIT extends IntegrationTest {

    private static final Pattern ID = Pattern.compile("\"id\":(\\d+)");

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    RecalcService recalc;

    @Autowired
    RecalcScheduler scheduler;

    private Client client;

    @BeforeEach
    void load() throws Exception {
        await().atMost(Duration.ofSeconds(10)).until(() -> !scheduler.isRunning());
        RecalcSupport.reset(jdbc);
        RecalcSupport.freezeClock(jdbc);
        RecalcSupport.loadReferenceData(jdbc);
        assertThat(recalc.run("manual").result()).isEqualTo(RecalcService.Result.OK);
        client = client();
        assertThat(client.post("/api/v1/auth/login", "{\"login\":\"analyst\",\"password\":\"analyst12345\"}", false)
                        .statusCode())
                .isEqualTo(200);
        assertThat(client.get("/api/v1/auth/me").statusCode()).isEqualTo(200);
    }

    @AfterEach
    void clean() {
        RecalcSupport.reset(jdbc);
    }

    private HttpResponse<String> get(String query) throws Exception {
        return client.get("/api/v1/customers" + query);
    }

    private static List<Long> ids(String body) {
        List<Long> ids = new ArrayList<>();
        Matcher matcher = ID.matcher(body);
        while (matcher.find()) {
            ids.add(Long.parseLong(matcher.group(1)));
        }
        return ids;
    }

    private List<Long> expected(String order) {
        return jdbc.queryForList("select id from accounts order by " + order + ", id", Long.class);
    }

    @Test
    void everyRequiredSortWorksInBothDirections() throws Exception {
        for (Map.Entry<String, String> sort : Map.of(
                        "id", "id",
                        "email", "lower(email)",
                        "balance", "balance",
                        "totalReplenished", "\"totalReplenished\"")
                .entrySet()) {
            List<Long> ascending = ids(
                    get("?size=500&fields=id&sort=" + sort.getKey() + ",asc").body());
            List<Long> descending = ids(
                    get("?size=500&fields=id&sort=" + sort.getKey() + ",desc").body());

            assertThat(ascending).as(sort.getKey()).isEqualTo(expected(sort.getValue() + " asc"));
            assertThat(descending).as(sort.getKey()).isEqualTo(expected(sort.getValue() + " desc"));
            assertThat(descending).as(sort.getKey()).isNotEqualTo(ascending);
        }
    }

    @Test
    void riskScoreSortsHighestFirstAndAccountsWithoutScoreComeLast() throws Exception {
        List<Long> descending = ids(get("?fields=id&sort=riskScore,desc").body());
        List<Long> ascending = ids(get("?fields=id&sort=riskScore,asc").body());

        assertThat(descending).containsExactly(5L, 9L, 10L, 1L, 4L, 6L, 2L, 3L, 7L, 8L);
        assertThat(ascending).containsExactly(6L, 4L, 1L, 10L, 9L, 5L, 2L, 3L, 7L, 8L);
    }

    @Test
    void theDefaultOrderIsRiskScoreDescending() throws Exception {
        HttpResponse<String> response = get("?fields=id");

        assertThat(ids(response.body())).startsWith(5L, 9L, 10L);
        assertThat(response.body()).contains("\"sort\":[\"riskScore,desc\",\"id,asc\"]");
    }

    @Test
    void expectedLossAndRiskLevelSorts() throws Exception {
        assertThat(ids(get("?fields=id&level=high&sort=expectedLoss,desc").body()))
                .containsExactly(5L, 9L, 10L);
        assertThat(ids(get("?fields=id&level=high&sort=expectedLoss,asc").body()))
                .containsExactly(10L, 9L, 5L);
        assertThat(ids(get("?fields=id&sort=riskLevel,desc&size=6").body())).startsWith(5L, 9L, 10L);
    }

    @Test
    void theRequestedFieldsAppearInTheRequestedOrder() throws Exception {
        HttpResponse<String> response = get("?fields=email,id&size=1&sort=id,asc");

        assertThat(response.body())
                .contains("\"items\":[{\"email\":\"user-0001@example.test\",\"id\":1}]")
                .contains("\"fields\":[\"email\",\"id\"]");
    }

    @Test
    void theDefaultFieldSetMatchesTheContract() throws Exception {
        HttpResponse<String> response = get("?size=1&sort=id,asc");

        assertThat(response.body())
                .contains("\"fields\":[\"id\",\"email\",\"balance\",\"totalReplenished\",\"riskScore\","
                        + "\"riskLevel\",\"topReason\",\"expectedLoss\"]");
        assertThat(response.body().indexOf("\"email\""))
                .isLessThan(response.body().indexOf("\"balance\""));
    }

    @Test
    void paginationReportsTheTotals() throws Exception {
        HttpResponse<String> response = get("?fields=id&size=4&page=1&sort=id,asc");

        assertThat(ids(response.body())).containsExactly(5L, 6L, 7L, 8L);
        assertThat(response.body())
                .contains("\"page\":1")
                .contains("\"size\":4")
                .contains("\"totalItems\":10")
                .contains("\"totalPages\":3");
        assertThat(ids(get("?fields=id&size=4&page=9").body())).isEmpty();
    }

    @Test
    void filtersNarrowTheList() throws Exception {
        assertThat(ids(get("?fields=id&sort=id,asc&level=high").body())).containsExactly(5L, 9L, 10L);
        assertThat(ids(get("?fields=id&sort=id,asc&level=medium,low").body())).containsExactly(1L, 4L, 6L);
        assertThat(ids(get("?fields=id&sort=id,asc&status=no_score").body())).containsExactly(2L, 3L, 7L, 8L);
        assertThat(ids(get("?fields=id&sort=id,asc&status=scored&minScore=50").body()))
                .containsExactly(5L, 9L, 10L);
        assertThat(ids(get("?fields=id&sort=id,asc&maxScore=24").body())).containsExactly(4L, 6L);
        assertThat(ids(get("?fields=id&sort=id,asc&minLoss=100000").body())).containsExactly(5L, 9L);
        assertThat(ids(get("?fields=id&sort=id,asc&hasAnomalies=true").body())).containsExactly(5L, 9L, 10L);
        assertThat(ids(get("?fields=id&sort=id,asc&hasAnomalies=false&status=scored")
                        .body()))
                .containsExactly(1L, 4L, 6L);
    }

    @Test
    void theSearchMatchesEmailSubstringsAndExactIds() throws Exception {
        assertThat(ids(get("?fields=id&sort=id,asc&q=USER-0005").body())).containsExactly(5L);
        assertThat(ids(get("?fields=id&sort=id,asc&q=0001").body())).containsExactly(1L);
        assertThat(ids(get("?fields=id&sort=id,asc&q=10").body())).containsExactly(10L);
        assertThat(ids(get("?fields=id&sort=id,asc&q=%25").body())).isEmpty();
        assertThat(ids(get("?fields=id&sort=id,asc&q=nobody").body())).isEmpty();
    }

    @Test
    void aSearchInjectionAttemptIsJustText() throws Exception {
        HttpResponse<String> response = get("?fields=id&q=%27%3B%20drop%20table%20accounts%3B--");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(ids(response.body())).isEmpty();
        assertThat(jdbc.queryForObject("select count(*) from accounts", Integer.class))
                .isEqualTo(10);
    }

    @Test
    void invalidSortsAreRejected() throws Exception {
        for (String sort : List.of("id;drop", "unknown,asc", "bonusState,asc", "reasons,desc", "id,up", "id")) {
            HttpResponse<String> response = get("?sort=" + java.net.URLEncoder.encode(sort, "UTF-8"));
            assertThat(response.statusCode()).as(sort).isEqualTo(400);
            assertThat(response.body()).as(sort).contains("\"code\":\"invalid_sort\"");
        }
    }

    @Test
    void unknownFieldsAndFiltersAreRejected() throws Exception {
        HttpResponse<String> field = get("?fields=id,password");
        HttpResponse<String> injection = get("?fields=" + java.net.URLEncoder.encode("id;drop", "UTF-8"));
        HttpResponse<String> level = get("?level=critical");
        HttpResponse<String> status = get("?status=weird");
        HttpResponse<String> score = get("?minScore=150");
        HttpResponse<String> range = get("?minScore=60&maxScore=40");

        assertThat(field.statusCode()).isEqualTo(400);
        assertThat(field.body()).contains("\"code\":\"invalid_field\"");
        assertThat(injection.statusCode()).isEqualTo(400);
        assertThat(injection.body()).contains("\"code\":\"invalid_field\"");
        assertThat(level.statusCode()).isEqualTo(400);
        assertThat(level.body()).contains("\"code\":\"invalid_filter\"");
        assertThat(status.body()).contains("\"code\":\"invalid_filter\"");
        assertThat(score.statusCode()).isEqualTo(400);
        assertThat(score.body()).contains("\"code\":\"invalid_filter\"");
        assertThat(range.statusCode()).isEqualTo(400);
        assertThat(range.body()).contains("\"code\":\"invalid_filter\"");
        assertThat(get("?size=501").statusCode()).isEqualTo(400);
        assertThat(get("?page=-1").statusCode()).isEqualTo(400);
    }

    @Test
    void anonymousCallersAreRejected() throws Exception {
        assertThat(client().get("/api/v1/customers").statusCode()).isEqualTo(401);
        assertThat(client().get("/api/v1/customers/export").statusCode()).isEqualTo(401);
    }

    @Test
    void reasonsAreRenderedFromTheCatalogForTheReferenceAccounts() throws Exception {
        String first = get("?fields=id,topReason&sort=id,asc&size=1").body();
        String fifth =
                get("?fields=id,topReason&q=5&level=high&sort=id,asc&size=1").body();
        String ninth = get("?fields=id,reasons&level=high&sort=expectedLoss,desc&size=2")
                .body();

        assertThat(first)
                .contains("\"key\":\"renewal_unsecured\"")
                .contains("\"title\":\"продление не обеспечено\"")
                .contains("услуга service-0001 не продлится автоматически: срок истекает через 1 ч");
        assertThat(fifth).contains("\"key\":\"prolong_wait\"").contains("3 из 3 действующих услуг ожидают оплаты");
        String normalized = ninth.replace(' ', ' ').replace(' ', ' ');
        assertThat(normalized)
                .contains("услуга service-0009 не продлится автоматически: срок истёк")
                .contains("средств хватает на 15% продлений за 30 дн.: доступно 915,06 €, нужно 6 164,50 €")
                .contains("3 из 3 действующих услуг выключены клиентом (100% выручки)");
        assertThat(normalized).containsPattern("\"contribution\":\\d+(\\.\\d+)?");
    }

    @Test
    void accountsWithoutAScoreShowNullsAndAReason() throws Exception {
        String body =
                get("?fields=id,riskScore,riskLevel,scoreStatus,noScoreReason,topReason,anomalies&q=2&status=no_score"
                                + "&sort=id,asc&size=1")
                        .body();

        assertThat(body)
                .contains("\"id\":2")
                .contains("\"riskScore\":null")
                .contains("\"riskLevel\":null")
                .contains("\"scoreStatus\":\"no_score\"")
                .contains("\"noScoreReason\":\"no_live_services\"")
                .contains("\"topReason\":null")
                .contains("\"anomalies\":[]");
    }

    @Test
    void anAccountThatIsNotCalculatedYetIsPending() throws Exception {
        jdbc.update("insert into accounts (id, email) values (500, 'fresh@example.test')");

        String body = get("?fields=id,scoreStatus,riskScore&q=fresh&size=1").body();

        assertThat(body)
                .contains("\"id\":500")
                .contains("\"scoreStatus\":\"pending\"")
                .contains("\"riskScore\":null");
    }

    @Test
    void theCsvExportKeepsTheFieldOrderAndEscapesValues() throws Exception {
        jdbc.update("update accounts set email = '=cmd,\"x\"@example.test' where id = 3");

        HttpResponse<String> response =
                client.get("/api/v1/customers/export?fields=email,id,riskScore,topReason,anomalies&sort=id,asc&q=0003");
        HttpResponse<String> all = client.get("/api/v1/customers/export?fields=id,riskScore,expectedLoss&sort=id,asc");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Content-Type").orElseThrow())
                .startsWith("text/csv")
                .contains("charset=UTF-8");
        assertThat(response.headers().firstValue("Content-Disposition").orElseThrow())
                .contains("attachment")
                .contains("customers.csv");
        assertThat(all.body().lines().toList()).hasSize(11).first().isEqualTo("id,riskScore,expectedLoss");
        assertThat(all.body().lines().skip(5).findFirst().orElseThrow()).isEqualTo("5,78.47,368131");
        assertThat(all.body().lines().skip(2).findFirst().orElseThrow()).isEqualTo("2,,");
        assertThat(response.body())
                .isEqualTo("email,id,riskScore,topReason,anomalies\r\n\"'=cmd,\"\"x\"\"@example.test\",3,,,\r\n");
    }

    @Test
    void theCsvExportAppliesTheSameFilters() throws Exception {
        HttpResponse<String> response =
                client.get("/api/v1/customers/export?fields=id,topReason&level=high&sort=expectedLoss,desc");

        assertThat(response.body().lines().toList()).hasSize(4);
        assertThat(response.body().lines().skip(1).findFirst().orElseThrow())
                .startsWith("5,3 из 3 действующих услуг ожидают оплаты");
    }
}

package team.jawa.churn;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class ApplicationIT extends IntegrationTest {

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void healthIsUp() throws Exception {
        HttpResponse<String> response = client().get("/health");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).isEqualTo("{\"status\":\"UP\"}");
        assertThat(response.headers().firstValue("X-Request-Id")).isPresent();
    }

    @Test
    void migrationsCreateSourceAndAuthSchema() {
        assertThat(jdbc.queryForObject("select count(*) from public.accounts", Integer.class))
                .isZero();
        assertThat(jdbc.queryForObject("select count(*) from public.users", Integer.class))
                .isPositive();
    }
}

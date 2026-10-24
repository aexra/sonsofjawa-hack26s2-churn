package team.jawa.churn.recalc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.time.Duration;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.TestPropertySource;
import team.jawa.churn.IntegrationTest;

@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@TestPropertySource(properties = {"recalc.enabled=true", "recalc.interval=300ms"})
class RecalcTimerIT extends IntegrationTest {

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

    @Test
    void theTimerPicksUpDataLoadedDirectlyIntoTheSourceTables() throws Exception {
        RecalcSupport.freezeClock(jdbc);

        RecalcSupport.loadReferenceData(jdbc);

        await().atMost(Duration.ofSeconds(20))
                .until(() -> jdbc.queryForObject("select count(*) from scores where is_current", Integer.class) == 10);
        assertThat(jdbc.queryForObject("select trigger from recalc_runs order by id limit 1", String.class))
                .isEqualTo("timer");

        jdbc.update("update services set price = price + 1 where id = 26");

        await().atMost(Duration.ofSeconds(20))
                .until(() -> jdbc.queryForObject("select count(*) from recalc_runs", Integer.class) >= 2);
        assertThat(jdbc.queryForObject(
                        "select count(*) from scores where account_id = 6 and not is_current", Integer.class))
                .isEqualTo(1);
    }
}

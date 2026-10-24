package team.jawa.churn.recalc;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.Statement;
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import team.jawa.churn.IntegrationTest;

class RecalcServiceIT extends IntegrationTest {

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    DataSource dataSource;

    @Autowired
    RecalcService service;

    @Autowired
    MaintenanceJob maintenance;

    @BeforeEach
    @AfterEach
    void reset() {
        RecalcSupport.reset(jdbc);
    }

    private void loadFrozenReferenceData() throws Exception {
        RecalcSupport.freezeClock(jdbc);
        RecalcSupport.loadReferenceData(jdbc);
    }

    private List<String> scoresOfScoredAccounts() {
        return jdbc.queryForList(
                "select risk_score::text from scores where is_current and status = 'scored' order by account_id",
                String.class);
    }

    @Test
    void theReferenceDataIsScoredAndSummarized() throws Exception {
        loadFrozenReferenceData();

        RecalcService.Outcome outcome = service.run("manual");

        assertThat(outcome).isEqualTo(new RecalcService.Outcome(RecalcService.Result.OK, 10));
        assertThat(scoresOfScoredAccounts()).containsExactly("24.98", "23.33", "78.47", "19.18", "56.29", "55.00");
        assertThat(jdbc.queryForObject("select sum(expected_loss) from scores where is_current", Long.class))
                .isEqualTo(681905L);
        assertThat(jdbc.queryForObject("select count(*) from scores where is_current", Integer.class))
                .isEqualTo(10);
        assertThat(jdbc.queryForObject("select count(*) from delta where proc_date is null", Integer.class))
                .isZero();
        assertThat(jdbc.queryForMap("select trigger, status, accounts_processed from recalc_runs"))
                .containsEntry("trigger", "manual")
                .containsEntry("status", "ok")
                .containsEntry("accounts_processed", 10);
        assertThat(jdbc.queryForObject("select expected_loss from analytics_snapshots", Long.class))
                .isEqualTo(681905L);
    }

    @Test
    void anotherRunWithNothingToDoIsSkippedAndLeavesNoTrace() throws Exception {
        loadFrozenReferenceData();
        service.run("manual");

        RecalcService.Outcome outcome = service.run("timer");

        assertThat(outcome.result()).isEqualTo(RecalcService.Result.SKIPPED);
        assertThat(jdbc.queryForObject("select count(*) from recalc_runs", Integer.class))
                .isEqualTo(1);
    }

    @Test
    void onlyChangedAccountsAreRecalculated() throws Exception {
        loadFrozenReferenceData();
        service.run("manual");

        jdbc.update("update accounts set balance = balance + 100 where id = 6");
        RecalcService.Outcome outcome = service.run("ingest");

        assertThat(outcome).isEqualTo(new RecalcService.Outcome(RecalcService.Result.OK, 1));
        assertThat(jdbc.queryForObject(
                        "select count(*) from scores where account_id = 6 and not is_current", Integer.class))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from scores where is_current", Integer.class))
                .isEqualTo(10);
    }

    @Test
    void aDeltaRowInsertedDuringTheRunStaysPending() throws Exception {
        loadFrozenReferenceData();
        try (Connection run = dataSource.getConnection();
                Statement statement = run.createStatement()) {
            run.setAutoCommit(false);
            statement.execute("set transaction isolation level repeatable read");
            statement.execute("select 1");

            jdbc.update("update accounts set balance = balance + 1 where id = 1");
            statement.execute("select * from recalculate_risk('manual')");
            run.commit();
        }

        assertThat(jdbc.queryForObject(
                        "select count(*) from delta where proc_date is null and reason = 'accounts'", Integer.class))
                .isPositive();
        assertThat(jdbc.queryForObject(
                        "select count(*) from delta where proc_date is null and account_id = 1", Integer.class))
                .isPositive();
        RecalcService.Outcome next = service.run("timer");
        assertThat(next).isEqualTo(new RecalcService.Outcome(RecalcService.Result.OK, 1));
    }

    @Test
    void onlyOneInstanceHoldsTheRecalculationLock() throws Exception {
        loadFrozenReferenceData();
        try (Connection other = dataSource.getConnection();
                Statement statement = other.createStatement()) {
            other.setAutoCommit(false);
            statement.execute("select pg_advisory_xact_lock(hashtext('churn.recalc'))");

            RecalcService.Outcome blocked = service.run("manual");

            assertThat(blocked.result()).isEqualTo(RecalcService.Result.BUSY);
            assertThat(service.runningElsewhere()).isTrue();
            assertThat(jdbc.queryForObject("select count(*) from scores", Integer.class))
                    .isZero();
            other.rollback();
        }

        assertThat(service.runningElsewhere()).isFalse();
        assertThat(service.run("manual").result()).isEqualTo(RecalcService.Result.OK);
    }

    @Test
    void expiredScoresAreQueuedByTimeAndRecalculated() throws Exception {
        loadFrozenReferenceData();
        service.run("manual");
        jdbc.update("update scores set valid_until = model_now() - interval '1 minute' where account_id = 5");

        RecalcService.Outcome outcome = service.run("timer");

        assertThat(outcome).isEqualTo(new RecalcService.Outcome(RecalcService.Result.OK, 1));
        assertThat(jdbc.queryForObject(
                        "select count(*) from delta where reason = 'time' and account_id = 5", Integer.class))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject(
                        "select valid_until > model_now() from scores where account_id = 5 and is_current",
                        Boolean.class))
                .isTrue();
    }

    @Test
    void aFailedRunIsRecordedAndDoesNotLeaveARunningRow() throws Exception {
        loadFrozenReferenceData();
        jdbc.update("delete from model_revisions");

        RecalcService.Outcome outcome = service.run("manual");

        try {
            assertThat(outcome.result()).isEqualTo(RecalcService.Result.FAILED);
            assertThat(jdbc.queryForMap("select trigger, status, error from recalc_runs"))
                    .containsEntry("trigger", "manual")
                    .containsEntry("status", "failed");
            assertThat(jdbc.queryForObject("select error from recalc_runs", String.class))
                    .contains("risk model requires a revision");
            assertThat(jdbc.queryForObject("select count(*) from recalc_runs where status = 'running'", Integer.class))
                    .isZero();
            assertThat(jdbc.queryForObject("select count(*) from delta where proc_date is null", Integer.class))
                    .isPositive();
        } finally {
            jdbc.update(
                    "insert into model_revisions (changed_by, source, changes) values ('test', 'migration', '[]'::jsonb)");
        }
        jdbc.update("delete from recalc_runs");
        assertThat(service.run("manual").result()).isEqualTo(RecalcService.Result.OK);
    }

    @Test
    void maintenanceRemovesOldDeltaAndScoreHistoryOnly() throws Exception {
        loadFrozenReferenceData();
        service.run("manual");
        jdbc.update(
                "update scores set is_current = false, calculated_at = now() - interval '91 days' where account_id = 1");
        jdbc.update("update delta set proc_date = now() - interval '8 days' where account_id in (1, 2, 3)");
        jdbc.update("update delta set proc_date = now() - interval '6 days' where account_id = 4");

        int expired = jdbc.queryForObject(
                "select count(*) from delta where proc_date < now() - interval '7 days'", Integer.class);

        MaintenanceJob.Purged purged = maintenance.purge();

        assertThat(expired).isGreaterThanOrEqualTo(3);
        assertThat(purged.delta()).isEqualTo(expired);
        assertThat(purged.scores()).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from delta where account_id = 4", Integer.class))
                .isPositive();
        assertThat(jdbc.queryForObject("select count(*) from scores where is_current", Integer.class))
                .isEqualTo(9);
    }
}

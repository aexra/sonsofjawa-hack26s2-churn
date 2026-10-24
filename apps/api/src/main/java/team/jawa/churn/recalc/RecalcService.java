package team.jawa.churn.recalc;

import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import team.jawa.churn.events.EventBus;

@Service
public class RecalcService {

    public enum Result {
        OK,
        IDLE,
        BUSY,
        SKIPPED,
        FAILED
    }

    public record Outcome(Result result, int accountsProcessed) {}

    public record Run(
            long id,
            String trigger,
            OffsetDateTime startedAt,
            OffsetDateTime finishedAt,
            OffsetDateTime asOf,
            Long modelVersion,
            int accountsProcessed,
            String status,
            String error) {}

    private static final Logger log = LoggerFactory.getLogger(RecalcService.class);
    private static final String SERIALIZATION_FAILURE = "40001";
    private static final int MAX_ERROR_LENGTH = 500;
    private static final String RUN_COLUMNS =
            "id, trigger, started_at, finished_at, as_of, model_version, accounts_processed, status, error";

    private final JdbcClient jdbc;
    private final TransactionTemplate transaction;
    private final EventBus events;

    RecalcService(JdbcClient jdbc, PlatformTransactionManager transactions, EventBus events) {
        this.jdbc = jdbc;
        this.events = events;
        this.transaction = new TransactionTemplate(transactions);
        this.transaction.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
    }

    public Outcome run(String trigger) {
        if (!hasWork() || runningElsewhere()) {
            return new Outcome(Result.SKIPPED, 0);
        }
        long runId = openRun(trigger);
        events.publish("recalc.started", Map.of("runId", runId, "trigger", trigger));
        try {
            Step step = transaction.execute(status -> jdbc.sql("SELECT status, accounts_processed, model_version"
                            + " FROM public.recalculate_risk(:trigger, :runId)")
                    .param("trigger", trigger)
                    .param("runId", runId)
                    .query((rs, row) -> new Step(
                            rs.getString("status"), rs.getInt("accounts_processed"), rs.getLong("model_version")))
                    .single());
            if (!"ok".equals(step.status())) {
                discard(runId);
            }
            return finish(trigger, step);
        } catch (RuntimeException e) {
            return fail(trigger, runId, e);
        }
    }

    public long enqueueAll() {
        return jdbc.sql("SELECT public.delta_enqueue_all('manual')")
                .query(Long.class)
                .single();
    }

    public long pendingAccounts() {
        return jdbc.sql("SELECT count(DISTINCT account_id) FROM public.delta WHERE proc_date IS NULL")
                .query(Long.class)
                .single();
    }

    public boolean runningElsewhere() {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND granted"
                        + " AND objsubid = 1 AND classid = ((hashtext('churn.recalc')::bigint >> 32) & 4294967295)::oid"
                        + " AND objid = (hashtext('churn.recalc')::bigint & 4294967295)::oid)")
                .query(Boolean.class)
                .single();
    }

    public Optional<Run> lastRun() {
        return jdbc.sql("SELECT " + RUN_COLUMNS + " FROM public.recalc_runs ORDER BY id DESC LIMIT 1")
                .query(RecalcService::mapRun)
                .optional();
    }

    public List<Run> recentRuns(int limit) {
        return jdbc.sql("SELECT " + RUN_COLUMNS + " FROM public.recalc_runs ORDER BY id DESC LIMIT :limit")
                .param("limit", limit)
                .query(RecalcService::mapRun)
                .list();
    }

    private record Step(String status, int accounts, long modelVersion) {}

    private boolean hasWork() {
        return jdbc.sql(
                        "SELECT EXISTS (SELECT 1 FROM public.delta WHERE proc_date IS NULL)"
                                + " OR EXISTS (SELECT 1 FROM public.scores WHERE is_current AND valid_until <= public.model_now())")
                .query(Boolean.class)
                .single();
    }

    private Outcome finish(String trigger, Step step) {
        return switch (step.status()) {
            case "ok" -> {
                log.info(
                        "recalculation finished: trigger={} accounts={} modelVersion={}",
                        trigger,
                        step.accounts(),
                        step.modelVersion());
                yield new Outcome(Result.OK, step.accounts());
            }
            case "idle" -> new Outcome(Result.IDLE, 0);
            default -> {
                log.debug("recalculation is running in another instance: trigger={}", trigger);
                yield new Outcome(Result.BUSY, 0);
            }
        };
    }

    private long openRun(String trigger) {
        return jdbc.sql("INSERT INTO public.recalc_runs (trigger, started_at, status)"
                        + " VALUES (:trigger, now(), 'running') RETURNING id")
                .param("trigger", trigger)
                .query(Long.class)
                .single();
    }

    private void discard(long runId) {
        jdbc.sql("DELETE FROM public.recalc_runs WHERE id = :id AND status = 'running'")
                .param("id", runId)
                .update();
    }

    private Outcome fail(String trigger, long runId, RuntimeException failure) {
        boolean concurrent = isSerializationFailure(failure);
        String error = concurrent ? "concurrent" : truncate(rootMessage(failure));
        if (concurrent) {
            log.info("recalculation conflicted with a concurrent change: trigger={}", trigger);
        } else {
            log.error("recalculation failed: trigger={}", trigger, failure);
        }
        try {
            jdbc.sql("UPDATE public.recalc_runs"
                            + " SET finished_at = now(), as_of = public.model_now(),"
                            + " model_version = (SELECT max(version) FROM public.model_revisions),"
                            + " status = 'failed', error = :error WHERE id = :id")
                    .param("error", error)
                    .param("id", runId)
                    .update();
        } catch (RuntimeException e) {
            log.warn("failed run was not recorded: {}", e.getMessage());
        }
        events.publish("recalc.failed", Map.of("runId", runId, "trigger", trigger, "error", error));
        return new Outcome(Result.FAILED, 0);
    }

    static boolean isSerializationFailure(Throwable failure) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sql && SERIALIZATION_FAILURE.equals(sql.getSQLState())) {
                return true;
            }
        }
        return false;
    }

    private static String rootMessage(Throwable failure) {
        Throwable root = failure;
        while (root.getCause() != null) {
            root = root.getCause();
        }
        return root.getMessage() == null ? root.getClass().getSimpleName() : root.getMessage();
    }

    private static String truncate(String text) {
        String line = text.lines().findFirst().orElse(text).replaceFirst("^ERROR:\\s*", "");
        return line.length() > MAX_ERROR_LENGTH ? line.substring(0, MAX_ERROR_LENGTH) : line;
    }

    private static Run mapRun(java.sql.ResultSet rs, int row) throws SQLException {
        long version = rs.getLong("model_version");
        return new Run(
                rs.getLong("id"),
                rs.getString("trigger"),
                rs.getObject("started_at", OffsetDateTime.class),
                rs.getObject("finished_at", OffsetDateTime.class),
                rs.getObject("as_of", OffsetDateTime.class),
                rs.wasNull() ? null : version,
                rs.getInt("accounts_processed"),
                rs.getString("status"),
                rs.getString("error"));
    }
}

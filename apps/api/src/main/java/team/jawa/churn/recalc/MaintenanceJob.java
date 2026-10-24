package team.jawa.churn.recalc;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@EnableScheduling
public class MaintenanceJob {

    public record Purged(int delta, int scores) {}

    private static final Logger log = LoggerFactory.getLogger(MaintenanceJob.class);

    private final JdbcClient jdbc;
    private final RecalcProperties properties;

    MaintenanceJob(JdbcClient jdbc, RecalcProperties properties) {
        this.jdbc = jdbc;
        this.properties = properties;
    }

    @Scheduled(cron = "${recalc.maintenance-cron}")
    void scheduled() {
        try {
            Purged purged = purge();
            log.info("maintenance finished: deltaRows={} scoreRows={}", purged.delta(), purged.scores());
        } catch (RuntimeException e) {
            log.error("maintenance failed", e);
        }
    }

    public Purged purge() {
        int delta = jdbc.sql("DELETE FROM public.delta WHERE proc_date IS NOT NULL"
                        + " AND proc_date < now() - make_interval(secs => :seconds)")
                .param("seconds", (double) properties.deltaRetention().toSeconds())
                .update();
        int scores = jdbc.sql("DELETE FROM public.scores WHERE NOT is_current"
                        + " AND calculated_at < now() - make_interval(secs => :seconds)")
                .param("seconds", (double) properties.scoresRetention().toSeconds())
                .update();
        return new Purged(delta, scores);
    }
}

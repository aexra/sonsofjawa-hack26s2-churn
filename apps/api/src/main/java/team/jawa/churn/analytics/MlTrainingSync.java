package team.jawa.churn.analytics;

import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

@Component
public class MlTrainingSync {
    private static final Logger log = LoggerFactory.getLogger(MlTrainingSync.class);
    private final JdbcClient jdbc;
    private final MlClient ml;
    private final JsonMapper json;

    public MlTrainingSync(JdbcClient jdbc, MlClient ml, JsonMapper json) {
        this.jdbc = jdbc;
        this.ml = ml;
        this.json = json;
    }

    @Scheduled(fixedDelayString = "${ML_SYNC_INTERVAL:60000}", initialDelayString = "${ML_SYNC_INITIAL_DELAY:10000}")
    public void sync() {
        if (!ml.enabled()) return;
        try {
            var body = jdbc.sql("""
                    SELECT public.model_now()::text AS as_of,
                           (SELECT max(version)::text FROM public.model_revisions) AS policy,
                           public.export_risk_dataset()::text AS dataset
                    """)
                    .query((rs, index) -> Map.of(
                            "asOf", rs.getString("as_of").replace(' ', 'T'),
                            "policyVersion", rs.getString("policy"),
                            "dataset", json.readTree(rs.getString("dataset"))))
                    .single();
            ml.post("/training-data", body);
        } catch (RuntimeException error) {
            log.warn("ML training data sync failed; retry on next interval");
        }
    }
}

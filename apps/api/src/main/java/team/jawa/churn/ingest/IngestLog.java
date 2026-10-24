package team.jawa.churn.ingest;

import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

@Repository
class IngestLog {

    private final JdbcClient jdbc;
    private final JsonMapper json;

    IngestLog(JdbcClient jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    long insert(
            Actor actor,
            SourceEntity entity,
            IngestFormat format,
            int rowsReceived,
            int rowsApplied,
            List<? extends Map<String, ?>> errors) {
        return insert(actor, "upsert", entity.path(), format, rowsReceived, rowsApplied, errors);
    }

    long insert(
            Actor actor,
            String mode,
            String entity,
            IngestFormat format,
            int rowsReceived,
            int rowsApplied,
            List<? extends Map<String, ?>> errors) {
        return jdbc.sql("INSERT INTO public.ingest_log"
                        + " (actor, channel, mode, entity, format, rows_received, rows_applied, status, errors)"
                        + " VALUES (:actor, :channel, :mode, :entity, :format, :received, :applied, :status,"
                        + " CAST(:errors AS jsonb)) RETURNING id")
                .param("actor", actor.name())
                .param("channel", actor.channel())
                .param("mode", mode)
                .param("entity", entity)
                .param("format", format.value())
                .param("received", rowsReceived)
                .param("applied", rowsApplied)
                .param("status", errors.isEmpty() ? "ok" : "rejected")
                .param("errors", json.writeValueAsString(errors))
                .query(Long.class)
                .single();
    }
}

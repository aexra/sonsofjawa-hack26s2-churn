package team.jawa.churn.events;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

@Component
class PgEventBus implements EventBus {

    private static final Logger log = LoggerFactory.getLogger(PgEventBus.class);
    private static final String CHANNEL = "churn_events";

    private final JdbcClient jdbc;
    private final JsonMapper json;

    PgEventBus(JdbcClient jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Override
    public void publish(String type, Map<String, Object> data) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("type", type);
        event.put("at", Instant.now().toString());
        event.putAll(data);
        try {
            jdbc.sql("SELECT pg_notify(:channel, :payload)")
                    .param("channel", CHANNEL)
                    .param("payload", json.writeValueAsString(event))
                    .query()
                    .singleRow();
        } catch (RuntimeException e) {
            log.warn("event was not published: type={} reason={}", type, e.getMessage());
        }
    }
}

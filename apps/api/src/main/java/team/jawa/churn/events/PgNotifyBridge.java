package team.jawa.churn.events;

import com.zaxxer.hikari.HikariDataSource;
import jakarta.annotation.PreDestroy;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Duration;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;
import javax.sql.DataSource;
import org.postgresql.PGConnection;
import org.postgresql.PGNotification;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Component
class PgNotifyBridge {

    private static final Logger log = LoggerFactory.getLogger(PgNotifyBridge.class);
    private static final String CHANNEL = "churn_events";
    private static final Duration RECONNECT_PAUSE = Duration.ofSeconds(1);
    private static final int POLL_MILLIS = 5_000;

    private final DataSource dataSource;
    private final JsonMapper json;
    private final EventSubscribers subscribers;
    private final AtomicReference<Connection> current = new AtomicReference<>();
    private final ExecutorService listener =
            Executors.newSingleThreadExecutor(runnable -> daemon(runnable, "event-listener"));

    private volatile boolean running = true;
    private volatile boolean listening;

    PgNotifyBridge(DataSource dataSource, JsonMapper json, EventSubscribers subscribers) {
        this.dataSource = dataSource;
        this.json = json;
        this.subscribers = subscribers;
        listener.submit(this::listen);
    }

    boolean listening() {
        return listening;
    }

    @PreDestroy
    void stop() {
        running = false;
        close(current.getAndSet(null));
        listener.shutdownNow();
    }

    private void listen() {
        while (running && !Thread.currentThread().isInterrupted()) {
            try (Connection connection = open()) {
                if (!current.compareAndSet(null, connection)) {
                    continue;
                }
                try {
                    connection.setAutoCommit(true);
                    try (Statement statement = connection.createStatement()) {
                        statement.execute("LISTEN " + CHANNEL);
                    }
                    listening = true;
                    PGConnection pg = connection.unwrap(PGConnection.class);
                    while (running && !Thread.currentThread().isInterrupted()) {
                        PGNotification[] batch = pg.getNotifications(POLL_MILLIS);
                        if (batch == null) {
                            continue;
                        }
                        for (PGNotification notification : batch) {
                            dispatch(notification.getParameter());
                        }
                    }
                } finally {
                    listening = false;
                    current.compareAndSet(connection, null);
                }
            } catch (SQLException e) {
                listening = false;
                if (!running || Thread.currentThread().isInterrupted()) {
                    return;
                }
                log.warn("event listener disconnected: {}", e.getMessage());
                pause();
            }
        }
    }

    private void dispatch(String payload) {
        if (payload == null || payload.isBlank()) {
            return;
        }
        try {
            JsonNode tree = json.readTree(payload);
            if (tree == null || !tree.isObject()) {
                return;
            }
            JsonNode typeNode = tree.get("type");
            if (typeNode == null || !typeNode.isString()) {
                return;
            }
            String type = typeNode.asString();
            if (type.isBlank() || type.indexOf('\n') >= 0 || type.indexOf('\r') >= 0) {
                return;
            }
            String body =
                    payload.indexOf('\n') >= 0 || payload.indexOf('\r') >= 0 ? json.writeValueAsString(tree) : payload;
            subscribers.broadcast(type, body);
        } catch (RuntimeException e) {
            log.warn("event payload was ignored: {}", e.getMessage());
        }
    }

    private Connection open() throws SQLException {
        try {
            HikariDataSource hikari = dataSource.unwrap(HikariDataSource.class);
            return DriverManager.getConnection(hikari.getJdbcUrl(), hikari.getUsername(), hikari.getPassword());
        } catch (RuntimeException e) {
            return dataSource.getConnection();
        }
    }

    private void pause() {
        if (!running) {
            return;
        }
        try {
            Thread.sleep(RECONNECT_PAUSE.toMillis());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private void close(Connection connection) {
        if (connection == null) {
            return;
        }
        try {
            connection.close();
        } catch (SQLException e) {
            log.debug("event listener close failed: {}", e.getMessage());
        }
    }

    private static Thread daemon(Runnable runnable, String name) {
        Thread thread = new Thread(runnable, name);
        thread.setDaemon(true);
        return thread;
    }
}

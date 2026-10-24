package team.jawa.churn.ingest;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;
import org.postgresql.PGConnection;
import org.postgresql.PGNotification;
import org.springframework.jdbc.core.JdbcTemplate;

final class IngestSupport {

    static final String AS_OF = "2026-10-19T15:00:00Z";

    private static final HttpClient HTTP = HttpClient.newHttpClient();

    private IngestSupport() {}

    static void reset(JdbcTemplate jdbc) {
        jdbc.execute("truncate transactions, services, accounts");
        jdbc.update("delete from delta");
        jdbc.update("delete from service_status_history");
        jdbc.update("delete from analytics_snapshots");
        jdbc.update("delete from scores");
        jdbc.update("delete from recalc_runs");
        jdbc.update("delete from ingest_log");
        jdbc.update("update model_clock set mode = 'real', frozen_at = null, shift = interval '0'");
    }

    static void freezeClock(JdbcTemplate jdbc) {
        jdbc.update("update model_clock set mode = 'frozen', frozen_at = ?::timestamptz", AS_OF);
    }

    static void loadReference(JdbcTemplate jdbc) throws IOException {
        String fixture = Files.readString(Path.of("src/test/ml/fixtures/organizer.json"));
        for (String table : List.of("accounts", "services", "transactions")) {
            jdbc.update(
                    "insert into " + table + " select * from jsonb_populate_recordset(null::" + table
                            + ", (?::jsonb) -> '" + table + "')",
                    fixture);
        }
    }

    static HttpResponse<String> send(
            int port, String method, String path, String authorization, String contentType, byte[] body)
            throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        if (authorization != null) {
            builder.header("Authorization", authorization);
        }
        if (contentType != null) {
            builder.header("Content-Type", contentType);
        }
        builder.method(
                method,
                body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofByteArray(body));
        return HTTP.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    static final class Events implements AutoCloseable {

        private final Connection connection;

        Events(DataSource dataSource) throws SQLException {
            connection = dataSource.getConnection();
            try (Statement statement = connection.createStatement()) {
                statement.execute("UNLISTEN *");
                connection.unwrap(PGConnection.class).getNotifications(1);
                statement.execute("LISTEN churn_events");
            }
        }

        List<String> collect(int quietMillis) throws SQLException {
            List<String> received = new ArrayList<>();
            PGConnection pg = connection.unwrap(PGConnection.class);
            PGNotification[] batch;
            while ((batch = pg.getNotifications(quietMillis)) != null && batch.length > 0) {
                for (PGNotification notification : batch) {
                    received.add(notification.getParameter());
                }
            }
            return received;
        }

        @Override
        public void close() throws SQLException {
            try (Statement statement = connection.createStatement()) {
                statement.execute("UNLISTEN *");
            } finally {
                connection.close();
            }
        }
    }
}

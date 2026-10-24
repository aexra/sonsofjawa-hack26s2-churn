package team.jawa.churn.recalc;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;
import org.postgresql.PGConnection;
import org.postgresql.PGNotification;

public final class RecalcEvents implements AutoCloseable {

    private final Connection connection;
    private final List<String> received = new ArrayList<>();

    public RecalcEvents(DataSource dataSource) throws SQLException {
        connection = dataSource.getConnection();
        try (Statement statement = connection.createStatement()) {
            statement.execute("UNLISTEN *");
            connection.unwrap(PGConnection.class).getNotifications(1);
            statement.execute("LISTEN churn_events");
        }
    }

    public List<String> collect(long quietMillis) throws SQLException {
        PGConnection pg = connection.unwrap(PGConnection.class);
        PGNotification[] batch;
        while ((batch = pg.getNotifications((int) quietMillis)) != null && batch.length > 0) {
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

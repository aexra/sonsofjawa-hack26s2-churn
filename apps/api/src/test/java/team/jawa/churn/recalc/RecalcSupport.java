package team.jawa.churn.recalc;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;

final class RecalcSupport {

    static final String AS_OF = "2026-10-19T15:00:00Z";

    private RecalcSupport() {}

    static void reset(JdbcTemplate jdbc) {
        jdbc.execute("truncate transactions, services, accounts");
        jdbc.update("delete from delta");
        jdbc.update("delete from service_status_history");
        jdbc.update("delete from service_status_history");
        jdbc.update("delete from analytics_snapshots");
        jdbc.update("delete from scores");
        jdbc.update("delete from recalc_runs");
        jdbc.update("update model_clock set mode = 'real', frozen_at = null, shift = interval '0'");
    }

    static void freezeClock(JdbcTemplate jdbc) {
        jdbc.update("update model_clock set mode = 'frozen', frozen_at = ?::timestamptz", AS_OF);
    }

    static void loadReferenceData(JdbcTemplate jdbc) throws IOException {
        String fixture = Files.readString(Path.of("src/test/ml/fixtures/organizer.json"));
        for (String table : List.of("accounts", "services", "transactions")) {
            jdbc.update(
                    "insert into " + table + " select * from jsonb_populate_recordset(null::" + table
                            + ", (?::jsonb) -> '" + table + "')",
                    fixture);
        }
    }
}

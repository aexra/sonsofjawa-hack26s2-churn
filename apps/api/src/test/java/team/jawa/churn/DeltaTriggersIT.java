package team.jawa.churn;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

@Transactional
class DeltaTriggersIT extends IntegrationTest {

    private static final String FROZEN_AT = "2026-10-19T15:00:00Z";

    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void emptyDelta() {
        jdbc.update("delete from delta");
    }

    private void insertAccounts(long... ids) {
        for (long id : ids) {
            jdbc.update("insert into accounts (id, email) values (?, ?)", id, "a" + id + "@example.test");
        }
    }

    private void insertService(long id, long ownerId, String status) {
        jdbc.update(
                "insert into services (id, name, \"ownerId\", \"paymentTerm\", \"createdAt\", \"expiresAt\", status, price)"
                        + " values (?, ?, ?, 'month', now() - interval '10 days', now() + interval '20 days', ?, 1000)",
                id,
                "service-" + id,
                ownerId,
                status);
    }

    private List<Long> queued(String reason) {
        return jdbc.queryForList(
                "select distinct account_id from delta where reason = ? order by account_id", Long.class, reason);
    }

    private Integer revisions(String source) {
        return jdbc.queryForObject("select count(*) from model_revisions where source = ?", Integer.class, source);
    }

    @Test
    void batchInsertIntoAccountsQueuesEachAccountOnce() {
        jdbc.update("insert into accounts (id, email) values (1, 'a1@example.test'), (2, 'a2@example.test'),"
                + " (3, 'a3@example.test')");

        assertThat(queued("accounts")).containsExactly(1L, 2L, 3L);
        assertThat(jdbc.queryForObject("select count(*) from delta", Integer.class))
                .isEqualTo(3);
    }

    @Test
    void servicesAndTransactionsQueueTheirOwner() {
        insertAccounts(1, 2);
        jdbc.update("delete from delta");

        insertService(10, 1, "active");
        insertService(20, 2, "active");
        assertThat(queued("services")).containsExactly(1L, 2L);

        jdbc.update("delete from delta");
        jdbc.update("insert into transactions (id, amount, type, \"serviceId\") values (1, 100, 'order', 10)");
        assertThat(queued("transactions")).containsExactly(1L);
    }

    @Test
    void changingServiceOwnerQueuesOldAndNewOwner() {
        insertAccounts(1, 2);
        insertService(10, 1, "active");
        jdbc.update("delete from delta");

        jdbc.update("update services set \"ownerId\" = 2 where id = 10");

        assertThat(queued("services")).containsExactly(1L, 2L);
    }

    @Test
    void upsertQueuesExistingAndNewAccounts() {
        insertAccounts(1);
        jdbc.update("delete from delta");

        jdbc.update("insert into accounts (id, email) values (1, 'a1@example.test'), (2, 'a2@example.test')"
                + " on conflict (id) do update set balance = excluded.balance + 1");

        assertThat(queued("accounts")).containsExactly(1L, 2L);
    }

    @Test
    void truncateQueuesPreviouslyScoredAndNewAccounts() {
        insertAccounts(1, 2);
        jdbc.update("insert into scores (account_id, calculated_at, as_of, model_version, status, no_score_reason)"
                + " values (1, now(), now(), 1, 'no_score', 'no_services'),"
                + " (2, now(), now(), 1, 'no_score', 'no_services')");
        jdbc.update("delete from delta");

        jdbc.update("truncate transactions, services, accounts");
        insertAccounts(3);

        assertThat(queued("snapshot")).containsExactly(1L, 2L);
        assertThat(queued("accounts")).containsExactly(3L);
    }

    @Test
    void settingsUpdateWithoutChangeCreatesNoRevision() {
        insertAccounts(1);
        jdbc.update("delete from delta");
        Integer before = revisions("settings");

        jdbc.update("update model_settings set value = value");

        assertThat(revisions("settings")).isEqualTo(before);
        assertThat(queued("model")).isEmpty();
    }

    @Test
    void settingsChangeCreatesRevisionWithDiffAndQueuesEveryAccount() {
        insertAccounts(1, 2);
        jdbc.update("delete from delta");
        Integer before = revisions("settings");
        Map<String, Object> setting = jdbc.queryForMap(
                "select key, value, min_value, max_value from model_settings where max_value > min_value limit 1");
        String key = (String) setting.get("key");

        jdbc.update(
                "update model_settings set value = case when value = min_value then max_value else min_value end,"
                        + " updated_by = 'tester' where key = ?",
                key);

        assertThat(revisions("settings")).isEqualTo(before + 1);
        String changes = jdbc.queryForObject(
                "select changes::text from model_revisions where source = 'settings' order by version desc limit 1",
                String.class);
        assertThat(changes).contains("\"key\": \"" + key + "\"");
        assertThat(jdbc.queryForObject(
                        "select changed_by from model_revisions order by version desc limit 1", String.class))
                .isEqualTo("tester");
        assertThat(queued("model")).containsExactly(1L, 2L);
    }

    @Test
    void clockChangeCreatesRevisionAndModelNowFollowsMode() {
        Integer before = revisions("clock");

        jdbc.update("update model_clock set mode = 'frozen', frozen_at = ?::timestamptz", FROZEN_AT);

        assertThat(revisions("clock")).isEqualTo(before + 1);
        assertThat(jdbc.queryForObject("select model_now() = ?::timestamptz", Boolean.class, FROZEN_AT))
                .isTrue();

        jdbc.update("update model_clock set mode = 'shifted', frozen_at = null, shift = interval '1 day'");

        assertThat(revisions("clock")).isEqualTo(before + 2);
        assertThat(jdbc.queryForObject("select model_now() = now() - interval '1 day'", Boolean.class))
                .isTrue();

        jdbc.update("update model_clock set mode = 'real', shift = interval '0'");

        assertThat(jdbc.queryForObject("select model_now() = now()", Boolean.class))
                .isTrue();
    }

    @Test
    void statusHistoryRecordsOnlyRealChanges() {
        jdbc.update("update model_clock set mode = 'frozen', frozen_at = ?::timestamptz", FROZEN_AT);
        insertAccounts(1);

        insertService(10, 1, "active");
        assertThat(jdbc.queryForMap("select from_status, to_status from service_status_history"))
                .containsEntry("from_status", null)
                .containsEntry("to_status", "active");
        assertThat(jdbc.queryForObject(
                        "select changed_at = ?::timestamptz from service_status_history", Boolean.class, FROZEN_AT))
                .isTrue();

        jdbc.update("update services set price = price + 1 where id = 10");
        assertThat(jdbc.queryForObject("select count(*) from service_status_history", Integer.class))
                .isEqualTo(1);

        jdbc.update("update services set status = 'deleted' where id = 10");
        assertThat(jdbc.queryForObject("select count(*) from service_status_history", Integer.class))
                .isEqualTo(2);
        assertThat(jdbc.queryForMap(
                        "select from_status, to_status from service_status_history order by id desc limit 1"))
                .containsEntry("from_status", "active")
                .containsEntry("to_status", "deleted");
    }
}

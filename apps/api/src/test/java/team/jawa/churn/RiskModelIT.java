package team.jawa.churn;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

@Transactional
class RiskModelIT extends IntegrationTest {

    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void freezeClock() {
        jdbc.update("update model_clock set mode='frozen', frozen_at='2026-10-19T15:00:00Z'");
    }

    @Test
    void flywayAppliesRiskMigrationsAndSemanticMetadata() {
        assertThat(jdbc.queryForObject(
                        "select count(*) from flyway_schema_history where success and script in"
                                + " ('V2__risk_core.sql', 'V3__risk_settings_validation.sql', 'R__risk_model.sql')",
                        Integer.class))
                .isEqualTo(3);
        assertThat(jdbc.queryForObject("select probability_calibrated from model_metadata_vw", Boolean.class))
                .isFalse();
        assertThat(jdbc.queryForObject("select money_estimate_kind from model_metadata_vw", String.class))
                .isEqualTo("heuristic_risk_weighted_revenue");
    }

    @Test
    void organizerFixtureProducesCorrectedGoldenScoresAndMoney() throws Exception {
        loadFixture();

        assertThat(jdbc.queryForList(
                        "select risk_score::text from scores_delta_vw where status='scored' order by account_id",
                        String.class))
                .containsExactly("24.98", "23.33", "78.47", "19.18", "56.29", "55.00");
        assertThat(jdbc.queryForObject("select sum(expected_loss) from scores_delta_vw", Long.class))
                .isEqualTo(681905L);
        assertThat(jdbc.queryForObject("select count(*) from scores_delta_vw where status='no_score'", Integer.class))
                .isEqualTo(4);
    }

    @Test
    void coefficientUpdateCreatesRevisionAndChangesScores() throws Exception {
        loadFixture();
        long version = jdbc.queryForObject("select max(version) from model_revisions", Long.class);

        jdbc.update("update model_settings set value=40 where key='weight_prolong_wait'");

        assertThat(jdbc.queryForObject("select max(version) from model_revisions", Long.class))
                .isGreaterThan(version);
        assertThat(jdbc.queryForObject("select sum(expected_loss) from scores_delta_vw", Long.class))
                .isEqualTo(662652L);
        assertThat(jdbc.queryForObject(
                        "select count(distinct account_id) from delta where proc_date is null", Integer.class))
                .isEqualTo(10);
    }

    @Test
    void calculatedScoresPersistWithVersionAndAppearInCustomerView() throws Exception {
        loadFixture();
        String columns = "account_id, calculated_at, as_of, model_version, status, no_score_reason, "
                + "risk_score, risk_level, revenue_horizon, secured_amount, expected_loss, "
                + "services_total, services_live, services_at_risk, next_expiry_at, "
                + "reasons, features, anomalies, valid_until, is_current";

        jdbc.update("insert into scores (" + columns + ") select " + columns + " from scores_delta_vw");

        assertThat(jdbc.queryForObject("select count(*) from customer_scores_vw", Integer.class))
                .isEqualTo(10);
        assertThat(jdbc.queryForObject("select sum(expected_loss) from customer_scores_vw", Long.class))
                .isEqualTo(681905L);
        assertThat(jdbc.queryForObject(
                        "select count(*) from customer_scores_vw where model_version is null or score_status='pending'",
                        Integer.class))
                .isZero();
    }

    private void loadFixture() throws Exception {
        String fixture = Files.readString(Path.of("src/test/ml/fixtures/organizer.json"));
        for (String table : List.of("accounts", "services", "transactions")) {
            jdbc.update(
                    "insert into " + table + " select * from jsonb_populate_recordset(null::" + table
                            + ", (?::jsonb) -> '" + table + "')",
                    fixture);
        }
    }
}

import re
import unittest

from postgres_fixture import MIGRATIONS, PostgresFixture

LOWERCASE_START = re.compile(r'^[^A-ZА-ЯЁ]')


class ReferenceDatasetTest(PostgresFixture):
    def test_reasons_follow_contribution_order_and_anomalies_are_reported(self):
        self.fixture()
        rows = {row['account_id']: row for row in self.scores()}
        keys = {
            account: [r['key'] for r in row['reasons'] if r['contribution'] > 0]
            for account, row in rows.items() if row['reasons']
        }
        self.assertEqual(keys[1], ['renewal_unsecured'])
        self.assertEqual(keys[4], ['suspended_share', 'renewal_unsecured'])
        self.assertEqual(keys[5], ['prolong_wait'])
        self.assertEqual(keys[6], ['renewal_unsecured'])
        self.assertEqual(keys[9], ['prolong_wait', 'suspended_share'])
        self.assertEqual(keys[10], ['prolong_wait'])
        for account, row in rows.items():
            contributions = [r['contribution'] for r in row['reasons'] if r['contribution'] > 0]
            self.assertEqual(contributions, sorted(contributions, reverse=True), account)
        self.assertEqual(
            {account: row['anomalies'] for account, row in rows.items() if row['anomalies']},
            {5: ['overdue_prolong_wait'], 9: ['expired_but_live'], 10: ['overdue_prolong_wait']},
        )

    def test_accounts_without_live_services_have_a_reason_instead_of_a_score(self):
        self.fixture()
        rows = {row['account_id']: row for row in self.scores()}
        for account in (2, 3, 7, 8):
            self.assertEqual(rows[account]['status'], 'no_score', account)
            self.assertEqual(rows[account]['no_score_reason'], 'no_live_services', account)
            self.assertIsNone(rows[account]['risk_score'], account)

    def test_persisted_summary_matches_the_reference_totals(self):
        self.fixture()
        self.persist_scores()
        summary = self.rows('SELECT * FROM analytics_snapshots')[0]
        self.assertEqual(
            (summary['accounts_high'], summary['accounts_medium'],
             summary['accounts_low'], summary['accounts_no_score']),
            (3, 1, 2, 4),
        )
        self.assertEqual(summary['expected_loss'], 15091)
        self.assertEqual(summary['revenue_horizon'], 77489)
        self.assertEqual(summary['revenue_at_risk'], 4904)
        self.assertEqual(summary['services_at_risk'], 12)
        self.assertEqual(float(summary['avg_risk_score']), 45.91)

    def test_forecast_and_history_on_the_reference_dataset(self):
        self.fixture()
        self.persist_scores()
        forecast = self.rows(
            'SELECT count(*) AS n, round(sum(risk_weight), 4) AS total FROM churn_forecast_vw')[0]
        self.assertEqual(forecast['n'], 4)
        self.assertEqual(float(forecast['total']), 1.3756)
        self.assertEqual(len(self.rows('SELECT * FROM churn_history_vw')), 6)
        recent = self.rows(
            "SELECT * FROM churn_history_vw "
            "WHERE deleted_at >= model_now() - interval '90 days' ORDER BY service_id")
        self.assertEqual([row['service_id'] for row in recent], [18])
        self.assertTrue(recent[0]['estimated'])
        self.assertTrue(recent[0]['deleted_at'].startswith('2026-09-19'))

    def test_applying_the_model_file_again_creates_a_revision_and_queues_everyone(self):
        self.fixture()
        self.persist_scores()
        self.assertEqual(self.sql('SELECT count(*) FROM delta WHERE proc_date IS NULL;'), '0')
        revisions = int(self.sql('SELECT count(*) FROM model_revisions;'))

        self.sql('BEGIN;' + (MIGRATIONS / 'R__risk_model.sql').read_text() + 'COMMIT;')

        self.assertEqual(int(self.sql('SELECT count(*) FROM model_revisions;')), revisions + 1)
        self.assertEqual(self.sql("SELECT source FROM model_revisions ORDER BY version DESC LIMIT 1;"), 'migration')
        self.assertEqual(self.sql('SELECT count(DISTINCT account_id) FROM delta WHERE proc_date IS NULL;'), '10')


class TextConventionTest(PostgresFixture):
    def test_user_facing_model_texts_start_with_a_lowercase_letter(self):
        texts = self.rows(
            "SELECT 'model_features.title' AS source, title AS text FROM model_features "
            "UNION ALL SELECT 'model_features.description', description FROM model_features "
            "UNION ALL SELECT 'model_features.reason_template', reason_template FROM model_features "
            "UNION ALL SELECT 'model_settings.title', title FROM model_settings "
            "UNION ALL SELECT 'model_settings.description', description FROM model_settings"
        )
        self.assertGreater(len(texts), 30)
        offenders = [t for t in texts if t['text'] and not LOWERCASE_START.match(t['text'])]
        self.assertEqual(offenders, [])


if __name__ == '__main__':
    unittest.main()

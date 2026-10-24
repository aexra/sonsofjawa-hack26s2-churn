import json
import subprocess
import time
import unittest
import uuid
from pathlib import Path


HERE = Path(__file__).resolve().parent
MIGRATIONS = HERE.parents[1] / 'main/resources/db/migration'
IMAGE = 'postgres:18-alpine@sha256:898c60cb390d1085bc97bdd6a1ae968757421df394b071848b52b1c09c89d6a5'
AS_OF = '2026-10-19T15:00:00Z'


def command(args, sql=None, timeout=60):
    return subprocess.run(
        args, input=sql, text=True, capture_output=True, check=True, timeout=timeout
    ).stdout.strip()


class RiskModelTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.container = 'churn-ml-test-' + uuid.uuid4().hex
        cls.addClassCleanup(cls.cleanup)
        command([
            'docker', 'run', '--detach', '--name', cls.container,
            '--network', 'none', '--label', 'churn.component=ml-test',
            '--tmpfs', '/var/lib/postgresql:rw',
            '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', IMAGE,
        ])
        for _ in range(60):
            ready = subprocess.run(
                ['docker', 'exec', cls.container, 'pg_isready', '-U', 'postgres'],
                capture_output=True, timeout=10,
            )
            if ready.returncode == 0:
                break
            time.sleep(0.2)
        else:
            raise RuntimeError('PostgreSQL readiness timeout')
        cls.schema = '\n'.join(
            (MIGRATIONS / name).read_text()
            for name in ['V1__source_schema.sql', 'V2__risk_core.sql', 'R__risk_model.sql']
        )

    @classmethod
    def cleanup(cls):
        command(['docker', 'rm', '--force', cls.container])

    @classmethod
    def sql(cls, statement):
        return command([
            'docker', 'exec', '-i', cls.container, 'psql', '-X', '-qAt',
            '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres',
        ], statement)

    def setUp(self):
        self.sql('DROP SCHEMA public CASCADE; CREATE SCHEMA public; BEGIN;'
                 + self.schema + 'COMMIT;')
        self.sql(f"UPDATE model_clock SET mode='frozen', frozen_at='{AS_OF}';")

    def rows(self, statement):
        result = self.sql(
            'SELECT coalesce(jsonb_agg(to_jsonb(t)), \'[]\'::jsonb) FROM ('
            + statement + ') t;'
        )
        return json.loads(result)

    def fixture(self):
        data = json.loads((HERE / 'fixtures/organizer.json').read_text())
        for table in ['accounts', 'services', 'transactions']:
            payload = json.dumps(data[table]).replace("'", "''")
            self.sql(f"INSERT INTO {table} SELECT * FROM "
                     f"jsonb_populate_recordset(NULL::{table}, '{payload}'::jsonb);")

    def scores(self):
        return self.rows('SELECT * FROM scores_delta_vw ORDER BY account_id')

    def test_organizer_golden(self):
        self.fixture()
        rows = self.scores()
        expected = [27, None, None, 24.95, 77.96, 23.17, None, None, 57.55, 57.54]
        self.assertEqual([r['risk_score'] for r in rows], expected)
        self.assertEqual(sum(r['expected_loss'] or 0 for r in rows), 719520)
        self.assertEqual([r['risk_level'] for r in rows],
                         ['medium', None, None, 'low', 'high', 'low', None, None, 'high', 'high'])
        self.assertEqual(sum(r['services_at_risk'] for r in rows), 11)

    def test_relative_weight_sensitivity(self):
        self.fixture()
        self.sql("UPDATE model_settings SET value=40 WHERE key='weight_prolong_wait';")
        rows = self.scores()
        self.assertEqual([r['risk_score'] for r in rows],
                         [24.55, None, None, 22.68, 79.96, 21.06, None, None, 52.32, 61.40])
        self.assertEqual(sum(r['expected_loss'] or 0 for r in rows), 696843)

    def test_repeatable_migration_preserves_settings(self):
        self.fixture()
        self.sql("UPDATE model_settings SET value=40 WHERE key='weight_prolong_wait';")
        before = self.rows('SELECT max(version) AS version FROM model_revisions')[0]['version']
        self.sql('BEGIN;' + (MIGRATIONS / 'R__risk_model.sql').read_text() + 'COMMIT;')
        self.assertEqual(self.sql("SELECT value FROM model_settings WHERE key='weight_prolong_wait';"), '40')
        self.assertGreater(self.rows('SELECT max(version) AS version FROM model_revisions')[0]['version'], before)
        self.assertEqual(len(self.scores()), 10)

    def test_no_services_and_removed_account(self):
        self.sql("INSERT INTO accounts(id, email) VALUES (101, 'empty@example.test');")
        row = self.scores()[0]
        self.assertEqual((row['status'], row['no_score_reason'], row['risk_score']),
                         ('no_score', 'no_services', None))
        self.sql('DELETE FROM accounts WHERE id=101;')
        row = self.scores()[0]
        self.assertEqual((row['status'], row['no_score_reason'], row['risk_score']),
                         ('removed', None, None))

    def test_scores_and_features_are_bounded(self):
        self.fixture()
        for row in self.scores():
            if row['status'] != 'scored':
                self.assertIsNone(row['risk_score'])
                self.assertEqual(row['reasons'], [])
                continue
            self.assertGreaterEqual(row['risk_score'], 0)
            self.assertLessEqual(row['risk_score'], 100)
            self.assertLessEqual(row['expected_loss'], row['revenue_horizon'])
            self.assertLessEqual(row['secured_amount'], row['revenue_horizon'])
            for value in row['features'].values():
                self.assertGreaterEqual(value, 0)
                self.assertLessEqual(value, 1)
            contributions = [r['contribution'] for r in row['reasons']]
            self.assertEqual(contributions, sorted(contributions, reverse=True))
            self.assertAlmostEqual(sum(contributions), row['risk_score'], delta=0.04)


if __name__ == '__main__':
    unittest.main(verbosity=2)

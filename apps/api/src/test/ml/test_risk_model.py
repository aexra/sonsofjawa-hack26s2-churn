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
                ['docker', 'exec', cls.container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'],
                capture_output=True, timeout=10,
            )
            if ready.returncode == 0:
                break
            time.sleep(0.2)
        else:
            raise RuntimeError('PostgreSQL readiness timeout')
        cls.schema = '\n'.join(
            (MIGRATIONS / name).read_text()
            for name in ['V1__source_schema.sql', 'V2__risk_core.sql',
                         'V3__risk_settings_validation.sql', 'R__risk_model.sql']
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

    def account(self, balance=0, bonus=0, bonus_state='locked', withdraw=0):
        self.sql(f'''INSERT INTO accounts
            (id, email, balance, "bonusBalance", "bonusState", "withdrawBalance")
            VALUES (101, 'scenario@example.test', {balance}, {bonus}, '{bonus_state}', {withdraw});''')

    def service(self, service_id=101, status='active', auto=True, days=1, price=1000, term='month'):
        self.sql(f'''INSERT INTO services
            (id, name, "ownerId", "paymentTerm", "autoProlong", "createdAt", "expiresAt", status, price)
            VALUES ({service_id}, 'scenario-{service_id}', 101, '{term}', {str(auto).lower()},
            '{AS_OF}'::timestamptz - interval '365 days',
            '{AS_OF}'::timestamptz + {days} * interval '1 day', '{status}', {price});''')

    def transaction(self, transaction_id, hours=48, status='not_performed', kind='prolong', service_id=101):
        performed = 'NULL' if status == 'not_performed' else f"'{AS_OF}'::timestamptz - {hours} * interval '1 hour'"
        self.sql(f'''INSERT INTO transactions
            (id, amount, status, "createdAt", "performedAt", type, "serviceId")
            VALUES ({transaction_id}, 100, '{status}',
            '{AS_OF}'::timestamptz - {hours} * interval '1 hour', {performed}, '{kind}', {service_id});''')

    def score(self):
        return next(row for row in self.scores() if row['account_id'] == 101)

    def persist_scores(self):
        columns = ('account_id, calculated_at, as_of, model_version, status, no_score_reason, '
                   'risk_score, risk_level, revenue_horizon, secured_amount, expected_loss, '
                   'services_total, services_live, services_at_risk, next_expiry_at, '
                   'reasons, features, anomalies, valid_until, is_current')
        self.sql(f'INSERT INTO scores ({columns}) SELECT {columns} FROM scores_delta_vw;')

    def test_organizer_golden(self):
        self.fixture()
        rows = self.scores()
        expected = [24.98, None, None, 23.33, 78.47, 19.18, None, None, 56.29, 55]
        self.assertEqual([r['risk_score'] for r in rows], expected)
        self.assertEqual([r['revenue_horizon'] for r in rows],
                         [68904, None, None, 1281, 469136, 2416, None, None, 616532, 982])
        self.assertEqual([r['secured_amount'] for r in rows],
                         [145, None, None, 1009, 0, 27, None, None, 91506, 0])
        self.assertEqual([r['expected_loss'] for r in rows],
                         [17176, None, None, 63, 368131, 458, None, None, 295537, 540])
        self.assertEqual(sum(r['expected_loss'] or 0 for r in rows), 681905)
        self.assertEqual([r['risk_level'] for r in rows],
                         ['low', None, None, 'low', 'high', 'low', None, None, 'high', 'high'])
        self.assertEqual(sum(r['services_at_risk'] for r in rows), 11)

    def test_relative_weight_sensitivity(self):
        self.fixture()
        self.sql("UPDATE model_settings SET value=40 WHERE key='weight_prolong_wait';")
        rows = self.scores()
        self.assertEqual([r['risk_score'] for r in rows],
                         [22.71, None, None, 21.21, 80.43, 17.44, None, None, 51.17, 59.09])
        self.assertEqual(sum(r['expected_loss'] or 0 for r in rows), 662652)

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

    def test_referral_balance_does_not_change_risk_or_secured_funds(self):
        self.account(balance=500)
        self.service()
        before = self.score()
        self.sql('UPDATE accounts SET "withdrawBalance"=50000 WHERE id=101;')
        after = self.score()
        for key in ['risk_score', 'features', 'secured_amount', 'expected_loss', 'anomalies']:
            self.assertEqual(before[key], after[key])
        self.assertEqual(after['secured_amount'], 500)

    def test_only_unlocked_bonus_covers_renewals(self):
        self.account(balance=100, bonus=2000)
        self.service()
        locked = self.score()
        self.assertEqual(locked['secured_amount'], 100)
        self.assertEqual(locked['features']['insufficient_funds'], 0.9)
        self.sql("UPDATE accounts SET \"bonusState\"='unlocked' WHERE id=101;")
        unlocked = self.score()
        self.assertEqual(unlocked['features']['insufficient_funds'], 0)
        self.assertEqual(unlocked['secured_amount'], unlocked['revenue_horizon'])
        self.assertEqual(unlocked['expected_loss'], 0)

    def test_blocked_services_do_not_raise_or_dilute_deletion_signal(self):
        self.account()
        self.service()
        self.service(service_id=102, status='deleted')
        before = self.score()
        self.assertEqual(before['features']['termination_history'], 0.5)
        self.service(service_id=103, status='blocked')
        after = self.score()
        self.assertEqual(after['features']['termination_history'], 0.5)
        self.assertEqual(after['risk_score'], before['risk_score'])

    def test_recent_orders_old_and_future_payments_are_excluded(self):
        self.account()
        self.service()
        self.transaction(101, status='performed')
        self.transaction(102, status='performed')
        before = self.score()
        self.transaction(103, hours=1)
        self.transaction(104, kind='order')
        self.transaction(105, hours=31 * 24)
        self.transaction(106, hours=-1)
        after = self.score()
        self.assertEqual(after['features']['payment_failures'], 0)
        self.assertEqual(before['risk_score'], after['risk_score'])

    def test_overdue_renewal_ratio_uses_only_live_services(self):
        self.account()
        self.service()
        self.service(service_id=102, status='deleted')
        self.transaction(101)
        self.transaction(102, status='performed')
        self.transaction(103, service_id=102)
        row = self.score()
        self.assertEqual(row['features']['payment_failures'], 0.5)
        reason = next(r for r in row['reasons'] if r['key'] == 'payment_failures')
        self.assertEqual(reason['params']['count'], 1)
        self.assertEqual(reason['params']['total'], 2)

    def test_payment_threshold_crossing_expires_score(self):
        self.account()
        self.service(days=10)
        self.transaction(101, hours=23)
        self.transaction(102, status='performed')
        row = self.score()
        self.assertEqual(row['features']['payment_failures'], 0)
        self.assertEqual(row['valid_until'], '2026-10-19T16:00:00+00:00')
        self.sql("UPDATE model_clock SET frozen_at=frozen_at + interval '1 hour';")
        self.assertEqual(self.score()['features']['payment_failures'], 0.5)

    def test_payment_window_boundary_expires_score(self):
        self.account()
        self.service(days=10)
        self.transaction(101, hours=30 * 24 - 1)
        self.transaction(102, status='performed')
        row = self.score()
        self.assertEqual(row['features']['payment_failures'], 0.5)
        self.assertEqual(row['valid_until'], '2026-10-19T16:00:00+00:00')
        self.sql("UPDATE model_clock SET frozen_at=frozen_at + interval '1 hour';")
        self.assertEqual(self.score()['features']['payment_failures'], 0)

    def test_horizon_excludes_payment_at_right_boundary(self):
        self.account()
        self.service(days=30)
        row = self.score()
        self.assertEqual(row['features']['insufficient_funds'], 0)
        self.assertEqual(row['risk_score'], 0)
        self.sql("UPDATE model_clock SET frozen_at=frozen_at + interval '1 second';")
        self.assertEqual(self.score()['features']['insufficient_funds'], 1)

    def test_suspended_revenue_and_payment_wait_semantics(self):
        self.account(balance=2000)
        self.service(status='suspended')
        suspended = self.score()
        self.assertGreater(suspended['revenue_horizon'], 0)
        self.assertEqual(suspended['features']['suspended_share'], 1)
        self.assertEqual(suspended['expected_loss'], 0)
        self.sql("UPDATE services SET status='prolong_wait' WHERE id=101;")
        waiting = self.score()
        self.assertEqual(waiting['secured_amount'], 0)
        self.assertEqual(waiting['features']['prolong_wait'], 1)
        self.assertGreater(waiting['expected_loss'], 0)

    def test_model_metadata_never_claims_calibrated_probability(self):
        metadata = self.rows('SELECT * FROM model_metadata_vw')[0]
        self.assertFalse(metadata['probability_calibrated'])
        self.assertEqual(metadata['score_kind'], 'heuristic_score')
        self.assertEqual(metadata['money_estimate_kind'], 'heuristic_risk_weighted_revenue')
        self.assertEqual(metadata['currency'], 'EUR')

    def test_invalid_setting_combinations_are_rejected(self):
        statements = [
            "UPDATE model_settings SET value=0 WHERE group_key='weights';",
            "UPDATE model_settings SET value=60 WHERE key='level_medium';",
            "UPDATE model_settings SET value=720 WHERE key='payment_overdue_hours';",
            "UPDATE model_settings SET value=2.5 WHERE key='min_transactions';",
            "UPDATE model_settings SET value=-1 WHERE key='weight_prolong_wait';",
        ]
        for statement in statements:
            with self.subTest(statement=statement):
                with self.assertRaises(subprocess.CalledProcessError):
                    self.sql(statement)

    def test_forecast_exposes_risk_weight_instead_of_probability(self):
        self.account()
        self.service(auto=False)
        self.persist_scores()
        forecast = self.rows('SELECT * FROM churn_forecast_vw')
        self.assertEqual(len(forecast), 1)
        self.assertIn('risk_weight', forecast[0])
        self.assertNotIn('probability', forecast[0])

    def test_more_available_funds_never_raise_risk_or_money_exposure(self):
        self.account()
        self.service()
        scores = []
        losses = []
        for balance in [0, 100, 500, 1000, 10000]:
            self.sql(f'UPDATE accounts SET balance={balance} WHERE id=101;')
            row = self.score()
            scores.append(row['risk_score'])
            losses.append(row['expected_loss'])
        self.assertEqual(scores, sorted(scores, reverse=True))
        self.assertEqual(losses, sorted(losses, reverse=True))
        self.assertEqual((scores[-1], losses[-1]), (0, 0))

    def test_minimum_payment_count_and_settlement(self):
        self.account()
        self.service()
        self.transaction(101)
        self.assertEqual(self.score()['features']['payment_failures'], 0)
        self.transaction(102)
        self.assertEqual(self.score()['features']['payment_failures'], 1)
        self.sql(f'''UPDATE transactions SET status='performed', "performedAt"='{AS_OF}';''')
        self.assertEqual(self.score()['features']['payment_failures'], 0)

    def test_free_services_do_not_produce_money_exposure(self):
        self.account()
        self.service(status='suspended', auto=False, price=0)
        row = self.score()
        self.assertEqual(row['status'], 'scored')
        self.assertEqual((row['revenue_horizon'], row['secured_amount'], row['expected_loss']), (0, 0, 0))
        self.assertEqual(row['features']['insufficient_funds'], 0)

    def test_hourly_renewal_count_has_no_extra_boundary_payment(self):
        self.account(balance=72000)
        self.service(days=0, price=100, term='hour')
        row = self.score()
        self.assertEqual(row['features']['insufficient_funds'], 0)
        self.assertEqual(row['revenue_horizon'], 72000)
        self.assertEqual(row['expected_loss'], 0)

    def test_valid_setting_updates_are_revisioned_once_per_statement(self):
        self.account()
        self.service()
        before = int(self.sql('SELECT count(*) FROM model_revisions;'))
        self.sql("""UPDATE model_settings SET value=CASE key
            WHEN 'level_medium' THEN 60 WHEN 'level_high' THEN 80 END
            WHERE key IN ('level_medium', 'level_high');""")
        self.assertEqual(int(self.sql('SELECT count(*) FROM model_revisions;')), before + 1)
        self.assertGreater(self.score()['model_version'], 0)


if __name__ == '__main__':
    unittest.main(verbosity=2)

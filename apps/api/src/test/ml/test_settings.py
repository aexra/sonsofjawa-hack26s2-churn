import json
import subprocess
import unittest

from postgres_fixture import MIGRATIONS, PostgresFixture


class SettingsTest(PostgresFixture):
    def update_settings(self, values, actor='analyst'):
        payload = json.dumps(values).replace("'", "''")
        actor = actor.replace("'", "''")
        return int(self.sql(f"SELECT set_risk_settings('{payload}'::jsonb, '{actor}');"))

    def test_related_thresholds_change_atomically_in_one_revision(self):
        before = int(self.sql('SELECT max(version) FROM model_revisions;'))
        version = self.update_settings({'level_medium': 60, 'level_high': 80})
        self.assertEqual(version, before + 1)
        rows = self.rows("SELECT key,value,updated_by FROM model_settings WHERE key IN ('level_medium','level_high') ORDER BY key")
        self.assertEqual(rows, [
            {'key': 'level_high', 'value': 80, 'updated_by': 'analyst'},
            {'key': 'level_medium', 'value': 60, 'updated_by': 'analyst'},
        ])

    def test_unchanged_values_do_not_create_revisions(self):
        version = int(self.sql('SELECT max(version) FROM model_revisions;'))
        self.assertEqual(self.update_settings({}), version)
        self.assertEqual(self.update_settings({'weight_prolong_wait': 30}), version)

    def test_unknown_keys_and_invalid_json_types_are_rejected(self):
        for values in [None, [], 3, {'unknown': 1}, {'horizon_days': '30'}, {'horizon_days': None}, {'horizon_days': True}]:
            with self.subTest(values=values):
                with self.assertRaises(subprocess.CalledProcessError):
                    self.update_settings(values)

    def test_invalid_update_preserves_values_and_revision(self):
        before = self.rows('SELECT key,value FROM model_settings ORDER BY key')
        version = int(self.sql('SELECT max(version) FROM model_revisions;'))
        for values in [
            {'level_medium': 80},
            {'level_high': 101, 'horizon_days': 60},
            {'min_transactions': 1.5},
            {'payment_overdue_hours': 720},
        ]:
            with self.subTest(values=values):
                with self.assertRaises(subprocess.CalledProcessError):
                    self.update_settings(values)
                self.assertEqual(self.rows('SELECT key,value FROM model_settings ORDER BY key'), before)
                self.assertEqual(int(self.sql('SELECT max(version) FROM model_revisions;')), version)

    def test_weight_change_enqueues_all_accounts_and_records_author(self):
        self.fixture()
        self.sql('UPDATE delta SET proc_date=now();')
        version = self.update_settings({'weight_prolong_wait': 40})
        self.assertEqual(int(self.sql('SELECT count(DISTINCT account_id) FROM delta WHERE proc_date IS NULL;')), 10)
        revision = self.rows(f'SELECT changed_by,source,changes FROM model_revisions WHERE version={version}')[0]
        self.assertEqual(revision['changed_by'], 'analyst')
        self.assertEqual(revision['source'], 'settings')
        self.assertEqual(revision['changes'], [{'key': 'weight_prolong_wait', 'from': 30, 'to': 40}])

    def test_actor_is_data_and_blank_actor_is_rejected(self):
        actor = "analyst'; SELECT 1;"
        self.update_settings({'horizon_days': 60}, actor=actor)
        self.assertEqual(self.sql("SELECT updated_by FROM model_settings WHERE key='horizon_days';"), actor)
        with self.assertRaises(subprocess.CalledProcessError):
            self.update_settings({'horizon_days': 90}, actor='  ')

    def test_repeatable_migration_preserves_user_settings(self):
        self.update_settings({'horizon_days': 60, 'level_high': 80})
        self.sql('BEGIN;' + (MIGRATIONS / 'R__risk_model.sql').read_text() + 'COMMIT;')
        self.assertEqual(self.sql("SELECT value FROM model_settings WHERE key='horizon_days';"), '60')
        self.assertEqual(self.sql("SELECT value FROM model_settings WHERE key='level_high';"), '80')


if __name__ == '__main__':
    unittest.main(verbosity=2)

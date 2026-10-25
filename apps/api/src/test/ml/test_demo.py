import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from generate_demo import HERE, generate_demo, write_demo
from postgres_fixture import PostgresFixture


class DemoGeneratorTest(unittest.TestCase):
    def test_seeded_generation_is_deterministic(self):
        self.assertEqual(generate_demo(), generate_demo())
        self.assertNotEqual(generate_demo(seed=42), generate_demo(seed=43))

    def test_original_fixture_is_preserved_exactly(self):
        original = json.loads((HERE / 'fixtures/organizer.json').read_text())
        generated = generate_demo()
        for key in original:
            self.assertEqual(generated[key][:len(original[key])], original[key])
        self.assertEqual(generate_demo(accounts=10), original)
        self.assertEqual(len(generated['accounts']), 80)
        self.assertEqual(set(generated), {'accounts','services','transactions'})

    def test_checked_in_demo_fixture_matches_generator(self):
        fixture = json.loads((HERE / 'fixtures/demo.json').read_text())
        self.assertEqual(fixture, generate_demo())

    def test_ids_and_foreign_keys_are_valid(self):
        data = generate_demo()
        for rows in data.values():
            self.assertEqual(len({r['id'] for r in rows}), len(rows))
        accounts = {r['id'] for r in data['accounts']}
        services = {r['id'] for r in data['services']}
        self.assertTrue(all(r['ownerId'] in accounts for r in data['services']))
        self.assertTrue(all(r['serviceId'] in services for r in data['transactions']))

    def test_invalid_counts_seeds_and_naive_times_are_rejected(self):
        for kwargs in [{'accounts':9}, {'accounts':80.5}, {'seed':None}, {'as_of':'2026-10-19T15:00:00'}]:
            with self.subTest(kwargs=kwargs):
                with self.assertRaises(ValueError):
                    generate_demo(**kwargs)

    def test_equivalent_timezone_inputs_have_identical_results(self):
        self.assertEqual(generate_demo(as_of='2026-10-19T15:00:00Z'),
                         generate_demo(as_of='2026-10-19T18:00:00+03:00'))

    def test_output_is_confined_and_existing_files_are_not_overwritten(self):
        with tempfile.TemporaryDirectory(dir=HERE) as directory:
            path = Path(directory) / 'demo.json'
            data = generate_demo()
            write_demo(data, path)
            self.assertEqual(json.loads(path.read_text()), data)
            with self.assertRaises(FileExistsError):
                write_demo({}, path)
            self.assertEqual(json.loads(path.read_text()), data)
        with self.assertRaises(ValueError):
            write_demo({}, HERE.parent / 'demo-outside-ml.json')

    def test_cli_outputs_the_same_dataset(self):
        result = subprocess.run([sys.executable, str(HERE / 'generate_demo.py')],
                                text=True, capture_output=True, check=True, timeout=10)
        self.assertEqual(json.loads(result.stdout), generate_demo())


class DemoModelTest(PostgresFixture):
    def test_generated_data_loads_and_covers_all_model_states(self):
        self.fixture(generate_demo())
        self.persist_scores()
        rows = self.rows('SELECT * FROM scores WHERE is_current')
        self.assertEqual(len(rows), 80)
        self.assertEqual({r['risk_level'] for r in rows if r['status']=='scored'}, {'low','medium','high'})
        self.assertEqual({r['no_score_reason'] for r in rows if r['status']=='no_score'}, {'no_services','no_live_services'})
        history = self.rows("SELECT * FROM churn_history_vw WHERE deleted_at>=model_now()-interval '90 days'")
        self.assertGreaterEqual(len(history), 10)
        self.assertTrue(all(r['estimated'] for r in history))

    def test_balance_change_updates_demo_risk_without_changing_other_clients(self):
        self.fixture(generate_demo())
        self.persist_scores()
        before=float(self.sql('SELECT risk_score FROM scores WHERE account_id=12 AND is_current;'))
        self.assertGreater(before,0)
        others = self.rows('SELECT id FROM scores WHERE account_id<>12 AND is_current ORDER BY id')
        self.sql('UPDATE accounts SET balance=1000000 WHERE id=12;')
        self.persist_scores()
        self.assertEqual(self.sql('SELECT risk_level FROM scores WHERE account_id=12 AND is_current;'), 'low')
        self.assertEqual(self.rows('SELECT id FROM scores WHERE account_id<>12 AND is_current ORDER BY id'), others)

    def test_demo_coefficients_change_real_results(self):
        self.fixture(generate_demo())
        self.persist_scores()
        before = self.sql('SELECT sum(expected_loss) FROM scores WHERE is_current;')
        self.sql("SELECT set_risk_settings('{\"weight_renewal_unsecured\":40}', 'analyst');")
        self.persist_scores()
        self.assertNotEqual(self.sql('SELECT sum(expected_loss) FROM scores WHERE is_current;'), before)
        self.assertEqual(self.sql('SELECT count(DISTINCT model_version) FROM scores WHERE is_current;'), '1')


if __name__ == '__main__':
    unittest.main(verbosity=2)

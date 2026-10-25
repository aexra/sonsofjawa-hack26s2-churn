import contextlib
import io
import json
import re
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

import generate_demo as demo

SEEDS = demo.HERE.parent / 'seeds'
TERMS = {'hour', 'week', 'month', 'quarter_year', 'half_year', 'year'}
STATUSES = {'active', 'blocked', 'deleted', 'suspended', 'prolong_wait'}
TOLERANCE = 3.0


def parse(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


class GenerateDemoTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data, cls.labels = demo.generate(seed=42, accounts=300)
        cls.reference = json.loads((SEEDS / 'tmplt' / 'data.json').read_text())

    def test_same_seed_gives_same_bytes(self):
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            for target in (first, second):
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(0, demo.main(['--seed', '42', '--out', target]))
            for name in ('data.json', '002_seed.sql'):
                self.assertEqual((Path(first) / name).read_bytes(), (Path(second) / name).read_bytes())

    def test_different_seed_changes_data(self):
        other, _ = demo.generate(seed=7, accounts=300)
        self.assertNotEqual(demo.render_json(self.data), demo.render_json(other))

    def test_committed_files_are_current(self):
        self.assertEqual(demo.render_json(self.data), (SEEDS / 'demo' / 'data.json').read_text())
        self.assertEqual(demo.render_sql(self.data), (SEEDS / 'demo' / '002_seed.sql').read_text())

    def test_reference_rows_are_kept_verbatim(self):
        for name, _ in demo.TABLES:
            count = len(self.reference[name])
            self.assertEqual(self.reference[name], demo.ordered(self.data)[name][:count])

    def test_sql_format_matches_organizers(self):
        organizer = (SEEDS / 'tmplt' / '002_seed.sql').read_text().split('\n', 2)[2]
        self.assertEqual(organizer, demo.render_sql(demo.reference_data(SEEDS / 'tmplt' / 'data.json')))

    def test_generated_ids_follow_reference(self):
        generated = [row for row in self.data['accounts'] if self.labels[row['id']] != 'reference']
        self.assertEqual(list(range(11, 311)), [row['id'] for row in generated])
        for name in ('services', 'transactions'):
            ids = [row['id'] for row in self.data[name]]
            self.assertEqual(list(range(1, len(ids) + 1)), ids)

    def test_accounts_satisfy_schema(self):
        emails = [row['email'] for row in self.data['accounts']]
        self.assertEqual(len(emails), len(set(emails)))
        for row in self.data['accounts']:
            for column in ('balance', 'withdrawBalance', 'totalReplenished', 'bonusBalance'):
                self.assertGreaterEqual(row[column], 0, row)
            self.assertIn(row['bonusState'], {'locked', 'unlocked'})

    def test_services_satisfy_schema(self):
        owners = {row['id'] for row in self.data['accounts']}
        for row in self.data['services']:
            self.assertIsNotNone(re.fullmatch(r'[A-Za-z0-9-]+', row['name']), row)
            self.assertIn(row['ownerId'], owners)
            self.assertIn(row['paymentTerm'], TERMS)
            self.assertIn(row['status'], STATUSES)
            self.assertGreaterEqual(row['price'], 0)
            self.assertIsInstance(row['autoProlong'], bool)
            self.assertGreaterEqual(parse(row['expiresAt']), parse(row['createdAt']), row)

    def test_transactions_satisfy_schema(self):
        services = {row['id'] for row in self.data['services']}
        for row in self.data['transactions']:
            self.assertIn(row['serviceId'], services)
            self.assertIn(row['type'], {'prolong', 'order'})
            self.assertGreaterEqual(row['amount'], 0)
            self.assertLessEqual(row['amount'], 1000)
            if row['status'] == 'not_performed':
                self.assertIsNone(row['performedAt'], row)
            else:
                self.assertEqual('performed', row['status'])
                self.assertGreaterEqual(parse(row['performedAt']), parse(row['createdAt']), row)

    def test_generated_timestamps_do_not_pass_reference_date(self):
        for row in self.data['transactions'][len(self.reference['transactions']):]:
            self.assertLessEqual(parse(row['createdAt']), demo.AS_OF, row)
            if row['performedAt'] is not None:
                self.assertLessEqual(parse(row['performedAt']), demo.AS_OF, row)

    def test_scenario_shares_match_the_plan(self):
        generated = [name for name in self.labels.values() if name != 'reference']
        self.assertEqual(300, len(generated))
        for name, share in demo.SHARES:
            actual = 100 * generated.count(name) / len(generated)
            self.assertAlmostEqual(share, actual, delta=TOLERANCE, msg=name)

    def test_shares_hold_for_other_sizes(self):
        _, labels = demo.generate(seed=1, accounts=100)
        generated = [name for name in labels.values() if name != 'reference']
        self.assertEqual(100, len(generated))
        for name, share in demo.SHARES:
            actual = 100 * generated.count(name) / len(generated)
            self.assertAlmostEqual(share, actual, delta=TOLERANCE, msg=name)

    def test_hour_services_are_rare(self):
        hours = sum(1 for row in self.data['services'] if row['paymentTerm'] == 'hour')
        self.assertLessEqual(100 * hours / len(self.data['services']), 3.0)

    def test_month_and_quarter_dominate(self):
        terms = [row['paymentTerm'] for row in self.data['services']]
        popular = terms.count('month') + terms.count('quarter_year')
        self.assertGreater(popular / len(terms), 0.5)

    def test_failed_transactions_share(self):
        rows = self.data['transactions']
        failed = sum(1 for row in rows if row['status'] == 'not_performed')
        self.assertGreaterEqual(failed / len(rows), 0.05)
        self.assertLessEqual(failed / len(rows), 0.15)

    def test_scenario_service_statuses(self):
        by_owner = {}
        for row in self.data['services']:
            by_owner.setdefault(row['ownerId'], []).append(row['status'])
        for account_id, name in self.labels.items():
            statuses = by_owner.get(account_id, [])
            if name == 'empty':
                self.assertEqual([], statuses)
            elif name == 'dead':
                self.assertTrue(statuses)
                self.assertTrue(set(statuses) <= {'deleted', 'blocked'})
            elif name != 'reference':
                self.assertTrue(set(statuses) & set(demo.LIVE), account_id)

    def test_history_window_has_deletions(self):
        window = [
            row for row in self.data['services']
            if row['status'] == 'deleted' and 5 <= (demo.AS_OF - parse(row['expiresAt'])).days <= 95
        ]
        self.assertGreaterEqual(len(window), 10)


if __name__ == '__main__':
    unittest.main()

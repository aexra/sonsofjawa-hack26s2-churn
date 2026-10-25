import math
import subprocess
import unittest

from postgres_fixture import AS_OF, MIGRATIONS, PostgresFixture


class RiskModelTest(PostgresFixture):
    def test_organizer_golden(self):
        self.fixture()
        rows = self.scores()
        expected = [15.61, None, None, 26.99, 66.67, 10.66, None, None, 88.88, 66.64]
        self.assertEqual([r['risk_score'] for r in rows], expected)
        self.assertEqual([r['revenue_horizon'] for r in rows],
                         [68400, None, None, 1997, 1696, 2188, None, None, 1705, 1503])
        self.assertEqual([r['secured_amount'] for r in rows],
                         [68400, None, None, 1997, 1696, 2188, None, None, 1705, 1503])
        self.assertEqual([r['expected_loss'] for r in rows],
                         [10671, None, None, 539, 1131, 233, None, None, 1515, 1002])
        self.assertEqual(sum(r['expected_loss'] or 0 for r in rows), 15091)
        self.assertEqual([r['risk_level'] for r in rows],
                         ['low', None, None, 'medium', 'high', 'low', None, None, 'high', 'high'])
        self.assertEqual(sum(r['services_at_risk'] for r in rows), 12)

    def test_relative_weight_sensitivity(self):
        self.fixture()
        self.sql("UPDATE model_settings SET value=40 WHERE key='weight_prolong_wait';")
        rows = self.scores()
        self.assertEqual([r['risk_score'] for r in rows],
                         [12.77, None, None, 22.08, 72.73, 8.72, None, None, 90.9, 72.7])
        self.assertEqual(sum(r['expected_loss'] or 0 for r in rows), 13240)

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
        self.assertAlmostEqual(locked['features']['insufficient_funds'], 0.9*(math.exp(-0.1)-math.exp(-3))/(1-math.exp(-3)), places=4)
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
        self.assertAlmostEqual(row['features']['payment_failures'], 1-math.exp(-1), places=4)
        self.assertEqual(self.rows('SELECT transactions_observed FROM risk_payment_inputs_vw')[0]['transactions_observed'], 2)

    def test_payment_threshold_crossing_expires_score(self):
        self.account()
        self.service(days=10)
        self.transaction(101, hours=23)
        self.transaction(102, status='performed')
        row = self.score()
        self.assertEqual(row['features']['payment_failures'], 0)
        self.assertEqual(row['valid_until'], '2026-10-19T16:00:00+00:00')
        self.sql("UPDATE model_clock SET frozen_at=frozen_at + interval '1 hour';")
        self.assertEqual(self.score()['features']['payment_failures'], 0)
        self.sql("UPDATE model_clock SET frozen_at=frozen_at + interval '1 hour';")
        self.assertGreater(self.score()['features']['payment_failures'], 0)

    def test_payment_window_boundary_expires_score(self):
        self.account()
        self.service(days=10)
        self.transaction(101, hours=30 * 24 - 1)
        self.transaction(102, status='performed')
        row = self.score()
        self.assertAlmostEqual(row['features']['payment_failures'], 1, places=4)
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
        self.assertEqual(self.score()['revenue_horizon'], 1000)

    def test_suspended_revenue_and_payment_wait_semantics(self):
        self.account(balance=2000)
        self.service(status='suspended')
        suspended = self.score()
        self.assertGreater(suspended['revenue_horizon'], 0)
        self.assertEqual(suspended['features']['suspended_share'], 1)
        self.assertGreater(suspended['expected_loss'], 0)
        self.assertEqual(suspended['secured_amount'],1000)
        self.sql("UPDATE services SET status='prolong_wait', \"expiresAt\"=model_now()-interval '5 days' WHERE id=101;")
        waiting = self.score()
        self.assertEqual(waiting['secured_amount'], 1000)
        self.assertAlmostEqual(waiting['features']['prolong_wait'], 1-math.exp(-1), places=4)
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
        first=self.score()['features']['payment_failures']
        self.assertAlmostEqual(first,1-math.exp(-1),places=4)
        self.transaction(102)
        self.assertEqual(self.score()['features']['payment_failures'], first)
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

    def test_available_funds_sum_does_not_overflow_bigint(self):
        self.account(balance=9000000000000000000, bonus=9000000000000000000,
                     bonus_state='unlocked')
        self.service()
        row = self.score()
        self.assertEqual(row['features']['insufficient_funds'], 0)
        self.assertEqual(row['secured_amount'], row['revenue_horizon'])
        self.assertEqual(row['expected_loss'], 0)

    def test_forecast_excludes_right_horizon_boundary(self):
        self.account()
        self.service(auto=False)
        self.service(service_id=102, auto=False, days=30)
        self.persist_scores()
        forecast = self.rows('SELECT service_id FROM churn_forecast_vw ORDER BY service_id')
        self.assertEqual(forecast, [{'service_id': 101}])

    def test_next_hourly_payment_sets_score_expiry(self):
        self.account(balance=48000)
        self.service(days=10.01, term='hour', price=100)
        row = self.score()
        self.assertEqual(row['features']['insufficient_funds'], 0)
        self.assertEqual(row['valid_until'], '2026-10-19T15:14:24.001+00:00')
        self.sql("UPDATE model_clock SET frozen_at=frozen_at + interval '14 minutes 25 seconds';")
        row = self.score()
        self.assertEqual(row['revenue_horizon'],48100)
        self.assertEqual(row['secured_amount'],48000)

    def test_payment_exactly_on_horizon_boundary_expires_in_one_millisecond(self):
        self.account()
        self.service(days=30)
        self.assertEqual(self.score()['valid_until'], '2026-10-19T15:00:00.001+00:00')
        self.sql("UPDATE model_clock SET frozen_at=frozen_at + interval '1 millisecond';")
        row = self.score()
        self.assertEqual(row['revenue_horizon'],1000)
        self.assertLess(row['risk_score'],0.01)

    def test_payment_wait_is_overdue_at_grace_boundary(self):
        self.account()
        self.service(status='prolong_wait', days=-5)
        self.assertIn('overdue_prolong_wait', self.score()['anomalies'])

    def test_renewal_boundaries_for_all_payment_terms(self):
        cases=[('hour','2026-02-01T01:00:00+00:00'),('week','2026-02-08T00:00:00+00:00'),
               ('month','2026-03-01T00:00:00+00:00'),('quarter_year','2026-05-01T00:00:00+00:00'),
               ('half_year','2026-08-01T00:00:00+00:00'),('year','2027-02-01T00:00:00+00:00')]
        for term,following in cases:
            with self.subTest(term=term):
                rows=self.rows(f"SELECT * FROM risk_due_dates('2026-02-01','{term}','2026-02-02',365)")
                self.assertEqual(len(rows),1)
                rows=self.rows(f"SELECT * FROM risk_due_dates('2026-02-01','{term}','2026-02-01',365)")
                if term=='year':
                    self.assertEqual(len(rows),1)
                else:
                    self.assertEqual(rows[1]['due_at'],following)


if __name__ == '__main__':
    unittest.main(verbosity=2)

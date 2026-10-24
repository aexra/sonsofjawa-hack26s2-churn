import unittest

from postgres_fixture import AS_OF, PostgresFixture


class ProjectionTest(PostgresFixture):
    def prepare_forecast(self):
        self.account()
        self.service(auto=False)
        self.persist_scores()

    def test_fresh_forecast_carries_score_provenance(self):
        self.prepare_forecast()
        row = self.rows('SELECT * FROM churn_forecast_vw')[0]
        score = self.rows('SELECT * FROM customer_scores_vw')[0]
        self.assertFalse(score['is_stale'])
        self.assertEqual(row['model_version'], score['model_version'])
        self.assertEqual(row['calculated_as_of'], score['as_of'])
        self.assertGreater(row['risk_weight'], 0)

    def test_source_update_withholds_forecast_until_recalculated(self):
        self.prepare_forecast()
        self.sql('UPDATE accounts SET balance=100 WHERE id=101;')
        self.assertTrue(self.rows('SELECT is_stale FROM customer_scores_vw')[0]['is_stale'])
        self.assertEqual(self.rows('SELECT * FROM churn_forecast_vw'), [])
        self.persist_scores()
        self.assertFalse(self.rows('SELECT is_stale FROM customer_scores_vw')[0]['is_stale'])
        self.assertEqual(len(self.rows('SELECT * FROM churn_forecast_vw')), 1)

    def test_new_model_version_withholds_old_forecast(self):
        self.prepare_forecast()
        self.sql("SELECT set_risk_settings('{\"weight_prolong_wait\":40}', 'analyst');")
        self.assertEqual(self.rows('SELECT * FROM churn_forecast_vw'), [])
        self.persist_scores()
        forecast = self.rows('SELECT * FROM churn_forecast_vw')[0]
        self.assertEqual(forecast['model_version'], self.rows('SELECT model_version FROM model_metadata_vw')[0]['model_version'])

    def test_expired_score_is_not_used_for_forecast(self):
        self.prepare_forecast()
        self.sql("UPDATE scores SET valid_until=model_now() WHERE is_current;")
        self.assertEqual(self.rows('SELECT * FROM churn_forecast_vw'), [])
        self.assertTrue(self.rows('SELECT is_stale FROM customer_scores_vw')[0]['is_stale'])
        self.persist_scores()
        self.assertEqual(len(self.rows('SELECT * FROM churn_forecast_vw')), 1)

    def test_pending_account_does_not_hide_other_customers(self):
        self.fixture()
        self.persist_scores()
        before = self.rows('SELECT * FROM churn_forecast_vw WHERE account_id<>6 ORDER BY service_id')
        self.sql('UPDATE accounts SET balance=balance+1 WHERE id=6;')
        self.assertEqual(self.rows('SELECT * FROM churn_forecast_vw WHERE account_id<>6 ORDER BY service_id'), before)
        self.assertEqual(self.rows('SELECT * FROM churn_forecast_vw WHERE account_id=6'), [])

    def test_initial_and_unscored_customers_have_distinct_freshness(self):
        self.account()
        before = self.rows('SELECT score_status,is_stale FROM customer_scores_vw')[0]
        self.assertEqual(before, {'score_status':'pending', 'is_stale':True})
        self.persist_scores()
        after = self.rows('SELECT score_status,is_stale FROM customer_scores_vw')[0]
        self.assertEqual(after, {'score_status':'no_score', 'is_stale':False})

    def test_observed_deletion_survives_service_reactivation_and_removal(self):
        self.account()
        self.service()
        self.sql("UPDATE services SET status='deleted' WHERE id=101;")
        self.sql("UPDATE services SET status='active' WHERE id=101;")
        history = self.rows('SELECT service_id,account_id,estimated FROM churn_history_vw')
        self.assertEqual(history, [{'service_id':101,'account_id':101,'estimated':False}])
        self.sql('DELETE FROM services WHERE id=101;')
        self.assertEqual(self.rows('SELECT service_id,account_id,estimated FROM churn_history_vw'), history)

    def test_multiple_observed_deletions_are_preserved(self):
        self.account()
        self.service()
        for status in ['deleted', 'active', 'deleted']:
            self.sql(f"UPDATE services SET status='{status}' WHERE id=101;")
        history = self.rows('SELECT estimated FROM churn_history_vw')
        self.assertEqual(history, [{'estimated':False}, {'estimated':False}])

    def test_initial_deleted_snapshot_is_explicitly_estimated(self):
        self.account()
        self.service(status='deleted', days=-10)
        row = self.rows('SELECT * FROM churn_history_vw')[0]
        self.assertTrue(row['estimated'])
        self.assertEqual(row['deleted_at'], '2026-10-14T15:00:00+00:00')

    def test_future_estimated_deletion_is_not_historical_fact(self):
        self.account()
        self.service(status='deleted', days=10)
        self.assertEqual(self.rows('SELECT * FROM churn_history_vw'), [])

    def test_future_transaction_schedules_its_maturity_without_leaking_value(self):
        self.account(balance=10000)
        self.service(days=10)
        self.sql("SELECT set_risk_settings('{\"payment_overdue_hours\":1}', 'analyst');")
        self.transaction(101, status='performed')
        self.transaction(102, hours=-0.25)
        before = self.score()
        self.assertEqual(before['features']['payment_failures'], 0)
        self.assertEqual(before['valid_until'], '2026-10-19T16:15:00+00:00')
        self.sql("UPDATE model_clock SET frozen_at=frozen_at+interval '75 minutes';")
        self.assertEqual(self.score()['features']['payment_failures'], 0.5)

    def test_future_payment_is_not_counted_as_completed_evidence(self):
        self.account()
        self.service(days=10)
        self.transaction(101)
        self.transaction(102)
        self.transaction(103, status='performed')
        self.sql(f'''UPDATE transactions SET "performedAt"='{AS_OF}'::timestamptz+interval '1 hour' WHERE id=103;''')
        before = self.score()
        self.assertEqual(before['features']['payment_failures'], 1)
        self.assertEqual(before['valid_until'], '2026-10-19T16:00:00+00:00')
        self.sql("UPDATE model_clock SET frozen_at=frozen_at+interval '1 hour';")
        self.assertEqual(self.score()['features']['payment_failures'], 0.6667)


if __name__ == '__main__':
    unittest.main(verbosity=2)

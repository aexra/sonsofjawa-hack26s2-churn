import json
import subprocess
import sys
import unittest
from pathlib import Path

from postgres_fixture import MIGRATIONS, PostgresFixture


class RenewalModelTest(PostgresFixture):
    def test_financial_signals_use_maximum_instead_of_double_counting(self):
        def score(values):
            return float(self.sql(f'SELECT sum(v) FROM unnest(risk_group_contributions(ARRAY{values}::numeric[],ARRAY[25,25,30,10,5,5]::numeric[])) v;'))
        self.assertAlmostEqual(score('[1,0,0,0,0,0]'),score('[1,1,0,0,0,1]'))
        self.assertAlmostEqual(score('[1,1,1,1,1,1]'),100)
        self.assertGreater(score('[1,0,0,1,0,0]'),score('[1,0,0,0,0,0]'))

    def test_earlier_payments_consume_funds_once_with_deterministic_ties(self):
        self.account(balance=1500)
        self.service(service_id=102,days=2,price=1000)
        self.service(service_id=101,days=1,price=1000)
        rows=self.rows('SELECT service_id,allocated FROM risk_payment_inputs_vw ORDER BY due_at,service_id')
        self.assertEqual(rows,[{'service_id':101,'allocated':1000},{'service_id':102,'allocated':500}])
        self.sql('UPDATE services SET "expiresAt"=model_now()+interval \'1 day\';')
        self.assertEqual(self.rows('SELECT service_id,allocated FROM risk_payment_inputs_vw ORDER BY due_at,service_id'),rows)

    def test_month_end_calendar_schedule_and_timezone_are_stable(self):
        rows=self.rows("SELECT due_at FROM risk_due_dates('2026-01-31T12:00:00Z','month','2026-01-31',90)")
        self.assertEqual([r['due_at'] for r in rows],['2026-01-31T12:00:00+00:00','2026-02-28T12:00:00+00:00','2026-03-31T12:00:00+00:00','2026-04-30T12:00:00+00:00'])
        self.assertEqual(self.sql("SELECT count(*) FROM risk_due_dates('2026-01-31','month','2026-02-01',90);"),'1')

    def test_smooth_urgency_grows_as_unfunded_due_approaches(self):
        self.account()
        self.service(days=20)
        scores=[]
        for day in (20,10,1,0):
            self.sql(f'UPDATE services SET "expiresAt"=model_now()+{day}*interval \'1 day\';')
            scores.append(self.score()['risk_score'])
        self.assertEqual(scores,sorted(scores))
        self.assertEqual(len(set(scores)),4)

    def test_funded_manual_renewal_still_has_behavioral_exposure(self):
        self.account(balance=10000)
        self.service(auto=False)
        row=self.score()
        self.assertEqual(row['secured_amount'],row['revenue_horizon'])
        self.assertGreater(row['expected_loss'],0)

    def test_duplicate_payment_attempts_cannot_amplify_signal(self):
        self.account(balance=10000)
        self.service()
        self.transaction(101)
        self.transaction(102,status='performed')
        before=self.score()
        self.transaction(103)
        after=self.score()
        self.assertEqual(before['risk_score'],after['risk_score'])
        self.assertEqual(before['features'],after['features'])

    def test_snapshot_capture_is_transactional_and_does_not_label_unknown_data_real(self):
        self.account()
        self.service()
        self.sql("BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT * FROM recalculate_risk('manual'); ROLLBACK;")
        self.assertEqual(self.sql('SELECT count(*) FROM risk_observations;'),'0')
        self.persist_scores()
        observation=self.rows('SELECT * FROM risk_observations')[0]
        self.assertEqual(observation['provenance'],'unverified')
        self.assertLess(observation['as_of'],observation['due_at'])
        before=self.rows('SELECT * FROM risk_observations')
        self.sql('UPDATE accounts SET balance=1000 WHERE id=101;')
        self.persist_scores()
        self.assertEqual(self.rows('SELECT * FROM risk_observations'),before)
        self.assertEqual(self.sql('SELECT count(*) FROM risk_payment_assessments;'),'2')

    def test_expiry_extension_records_observed_renewal_without_touching_features(self):
        self.account()
        self.service()
        self.persist_scores()
        before=self.rows('SELECT * FROM risk_observations')
        self.sql("UPDATE model_clock SET frozen_at=frozen_at+interval '1 hour'; UPDATE services SET \"expiresAt\"=\"expiresAt\"+interval '1 month';")
        row=self.rows('SELECT * FROM risk_outcomes')[0]
        self.assertEqual(row['outcome'],'renewed')
        self.assertEqual(self.rows('SELECT * FROM risk_observations'),before)

    def test_time_passing_without_new_observation_does_not_invent_nonrenewal(self):
        self.account()
        self.service()
        self.persist_scores()
        self.sql("UPDATE model_clock SET frozen_at=frozen_at+interval '7 days';")
        self.persist_scores()
        self.assertEqual(self.sql('SELECT count(*) FROM risk_outcomes;'),'0')
        self.sql("UPDATE services SET status='prolong_wait';")
        self.assertEqual(self.sql('SELECT outcome FROM risk_outcomes;'),'not_renewed')

    def test_blocked_outcome_is_distinct_from_nonrenewal(self):
        self.account()
        self.service()
        self.persist_scores()
        self.sql("UPDATE model_clock SET frozen_at=frozen_at+interval '1 hour'; UPDATE services SET status='blocked';")
        self.assertEqual(self.sql('SELECT outcome FROM risk_outcomes;'),'blocked')

    def test_quality_is_separate_from_score_and_not_a_claim_of_accuracy(self):
        self.account()
        self.service()
        self.persist_scores()
        row=self.rows('SELECT * FROM risk_data_quality_vw')[0]
        self.assertEqual(row['data_sufficiency'],'limited_history')
        self.assertFalse(row['predictive_accuracy_validated'])
        self.transaction(101)
        self.transaction(102,status='performed')
        self.persist_scores()
        self.assertEqual(self.sql('SELECT data_sufficiency FROM risk_data_quality_vw;'),'observed_history')

    def test_repeatable_migration_keeps_training_history(self):
        self.account()
        self.service()
        self.persist_scores()
        before=self.rows('SELECT * FROM risk_observations')
        self.sql('BEGIN;'+(MIGRATIONS/'R__risk_model.sql').read_text()+'COMMIT;')
        self.assertEqual(self.rows('SELECT * FROM risk_observations'),before)

    def test_export_contains_no_contact_or_raw_transaction_data(self):
        self.account()
        self.service()
        self.persist_scores()
        payload=json.loads(self.sql('SELECT export_risk_dataset();'))
        self.assertEqual(set(payload),{'observations','outcomes'})
        body=json.dumps(payload)
        self.assertNotIn('email',body)
        self.assertNotIn('balance',body)
        self.assertEqual(len(payload['observations']),1)

    def test_database_export_matches_training_contract(self):
        self.account()
        self.service()
        self.persist_scores()
        self.sql("UPDATE model_clock SET frozen_at=frozen_at+interval '1 hour'; UPDATE services SET \"expiresAt\"=\"expiresAt\"+interval '1 month';")
        payload=self.sql('SELECT export_risk_dataset();')
        code="import json,sys; sys.path.insert(0,sys.argv[1]); from riskml.contracts import validate,validate_outcome; p=json.load(sys.stdin); [validate(r) for r in p['observations']]; [validate_outcome(r) for r in p['outcomes']]"
        result=subprocess.run([sys.executable,'-I','-c',code,str(Path(__file__).resolve().parents[5]/'ml')],
                              input=payload,text=True,capture_output=True,timeout=10)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_late_expiry_extension_is_not_backdated_into_success(self):
        self.account()
        self.service()
        self.persist_scores()
        self.sql("UPDATE model_clock SET frozen_at=frozen_at+interval '7 days'; UPDATE services SET \"expiresAt\"=\"expiresAt\"+interval '1 month';")
        self.assertEqual(self.sql('SELECT count(*) FROM risk_outcomes;'),'0')

    def test_failed_source_transaction_rolls_back_outcomes(self):
        self.account()
        self.service()
        self.persist_scores()
        self.sql("BEGIN; UPDATE model_clock SET frozen_at=frozen_at+interval '1 hour'; UPDATE services SET \"expiresAt\"=\"expiresAt\"+interval '1 month'; ROLLBACK;")
        self.assertEqual(self.sql('SELECT count(*) FROM risk_outcomes;'),'0')


if __name__=='__main__':
    unittest.main()

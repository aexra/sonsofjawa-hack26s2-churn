import json
import subprocess
import time
import unittest

from postgres_fixture import PostgresFixture


class PersistenceTest(PostgresFixture):
    def recalculate(self, trigger='manual', rollback=False):
        end = 'ROLLBACK;' if rollback else 'COMMIT;'
        result = self.sql("BEGIN ISOLATION LEVEL REPEATABLE READ; "
                          f"SELECT row_to_json(r) FROM recalculate_risk('{trigger}') r; " + end)
        return json.loads(result)

    def test_full_recalculation_persists_golden_scores_and_summary(self):
        self.fixture()
        run = self.recalculate()
        self.assertEqual((run['status'], run['accounts_processed']), ('ok', 10))
        self.assertEqual(self.sql('SELECT count(*) FROM scores WHERE is_current;'), '10')
        self.assertEqual(self.sql('SELECT count(*) FROM delta WHERE proc_date IS NULL;'), '0')
        summary = self.rows('SELECT * FROM analytics_snapshots')[0]
        self.assertEqual(summary['recalc_run_id'], run['run_id'])
        self.assertEqual(summary['expected_loss'], 681905)
        self.assertEqual([summary[k] for k in ['accounts_high','accounts_medium','accounts_low','accounts_no_score']], [3,0,3,4])
        self.assertEqual(summary['services_at_risk'], 11)
        self.assertEqual(self.sql('SELECT status FROM recalc_runs;'), 'ok')

    def test_no_work_does_not_create_history_or_runs(self):
        run = self.recalculate()
        self.assertEqual((run['status'], run['accounts_processed'], run['run_id']), ('idle', 0, None))
        self.assertEqual(self.sql('SELECT count(*) FROM recalc_runs;'), '0')
        self.assertEqual(self.sql('SELECT count(*) FROM analytics_snapshots;'), '0')

    def test_changed_account_only_is_replaced(self):
        self.fixture()
        self.recalculate()
        before = self.rows('SELECT id FROM scores WHERE is_current AND account_id<>6 ORDER BY id')
        self.sql('UPDATE accounts SET balance=balance+100 WHERE id=6;')
        self.assertEqual(self.recalculate()['accounts_processed'], 1)
        self.assertEqual(self.rows('SELECT id FROM scores WHERE is_current AND account_id<>6 ORDER BY id'), before)
        self.assertEqual(self.sql('SELECT count(*) FROM scores;'), '11')
        self.assertEqual(self.sql('SELECT count(*) FROM scores WHERE is_current;'), '10')

    def test_model_revision_recalculates_all_and_keeps_old_scores(self):
        self.fixture()
        self.recalculate()
        old_version = self.sql('SELECT max(model_version) FROM scores;')
        self.sql("SELECT set_risk_settings('{\"weight_prolong_wait\":40}', 'analyst');")
        run = self.recalculate('model')
        self.assertEqual(run['accounts_processed'], 10)
        self.assertGreater(run['model_version'], int(old_version))
        self.assertEqual(self.sql('SELECT sum(expected_loss) FROM scores WHERE is_current;'), '662652')
        self.assertEqual(self.sql('SELECT count(*) FROM scores WHERE NOT is_current;'), '10')
        self.assertEqual(self.sql('SELECT risk_score FROM scores WHERE account_id=1 AND NOT is_current;'), '24.98')

    def test_removed_account_does_not_remain_in_summary(self):
        self.account()
        self.recalculate()
        self.sql('DELETE FROM accounts WHERE id=101;')
        run = self.recalculate()
        self.assertEqual(run['accounts_processed'], 1)
        self.assertEqual(self.sql('SELECT status FROM scores WHERE is_current;'), 'removed')
        self.assertEqual(self.sql('SELECT count(*) FROM customer_scores_vw;'), '0')
        self.assertEqual(self.sql('SELECT accounts_no_score FROM analytics_snapshots ORDER BY id DESC LIMIT 1;'), '0')

    def test_account_id_change_invalidates_both_identities(self):
        self.account()
        self.recalculate()
        self.sql('UPDATE accounts SET id=102 WHERE id=101;')
        self.assertEqual(self.recalculate()['accounts_processed'], 2)
        rows = self.rows('SELECT account_id,status FROM scores WHERE is_current ORDER BY account_id')
        self.assertEqual(rows, [{'account_id':101,'status':'removed'}, {'account_id':102,'status':'no_score'}])

    def test_expired_scores_are_enqueued_without_source_changes(self):
        self.account()
        self.service()
        self.recalculate()
        self.sql("UPDATE scores SET valid_until=model_now()-interval '1 second' WHERE is_current;")
        run = self.recalculate('timer')
        self.assertEqual(run['accounts_processed'], 1)
        self.assertEqual(self.sql("SELECT count(*) FROM delta WHERE reason='time';"), '1')

    def test_rollback_preserves_pending_delta_and_discards_results(self):
        self.fixture()
        self.recalculate(rollback=True)
        self.assertEqual(self.sql('SELECT count(*) FROM scores;'), '0')
        self.assertEqual(self.sql('SELECT count(*) FROM recalc_runs;'), '0')
        self.assertEqual(self.sql('SELECT count(*) FROM analytics_snapshots;'), '0')
        self.assertEqual(self.sql('SELECT count(DISTINCT account_id) FROM delta WHERE proc_date IS NULL;'), '10')

    def test_unsafe_isolation_and_unknown_trigger_are_rejected(self):
        with self.assertRaises(subprocess.CalledProcessError):
            self.sql("SELECT * FROM recalculate_risk('manual');")
        with self.assertRaises(subprocess.CalledProcessError):
            self.recalculate('unknown')
        self.assertEqual(self.sql('SELECT count(*) FROM recalc_runs;'), '0')

    def test_empty_feature_catalog_cannot_consume_pending_work(self):
        self.account()
        self.service()
        self.sql('DELETE FROM model_features;')
        with self.assertRaises(subprocess.CalledProcessError):
            self.recalculate()
        self.assertEqual(self.sql('SELECT count(*) FROM scores;'), '0')
        self.assertEqual(self.sql('SELECT count(DISTINCT account_id) FROM delta WHERE proc_date IS NULL;'), '1')

    def test_incomplete_feature_definition_cannot_consume_pending_work(self):
        self.account()
        self.service()
        self.sql("""INSERT INTO model_settings
            (key,group_key,value,default_value,min_value,max_value,unit,title,description,sort_order)
            VALUES ('weight_extra','weights',5,5,0,100,'points','extra','extra',900);
            INSERT INTO model_features (key,weight_key,title,description,reason_template,sort_order)
            VALUES ('extra','weight_extra','extra','extra','extra',900);""")
        with self.assertRaises(subprocess.CalledProcessError):
            self.recalculate()
        self.assertEqual(self.sql('SELECT count(*) FROM scores;'), '0')
        self.assertEqual(self.sql('SELECT count(DISTINCT account_id) FROM delta WHERE proc_date IS NULL;'), '1')

    def start_sql(self, statement):
        process = subprocess.Popen([
            'docker','exec','-i',self.container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1',
            '-U','postgres','-d','postgres',
        ], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        process.stdin.write(statement)
        process.stdin.close()
        process.stdin = None
        self.addCleanup(self.finish_sql, process)
        return process

    def finish_sql(self, process):
        if process.poll() is None:
            process.terminate()
        process.communicate(timeout=10)

    def wait_for_lock(self, name):
        for _ in range(30):
            count = self.sql(f"SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND granted AND objid=(hashtext('{name}')::bigint & 4294967295)::oid;")
            if int(count) > 0:
                return
            time.sleep(0.05)
        self.fail('Expected test transaction lock was not acquired')

    def test_parallel_recalculation_returns_busy(self):
        holder = self.start_sql("BEGIN; SELECT pg_advisory_xact_lock(hashtext('churn.recalc')); SELECT pg_sleep(3); COMMIT;")
        self.wait_for_lock('churn.recalc')
        run = self.recalculate()
        self.assertEqual(run['status'], 'busy')
        self.assertIsNone(run['run_id'])
        self.assertEqual(self.sql('SELECT count(*) FROM recalc_runs;'), '0')
        holder.communicate(timeout=10)
        self.assertEqual(holder.returncode, 0)

    def test_concurrent_source_update_remains_pending(self):
        self.fixture()
        self.sql("""CREATE FUNCTION slow_score() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN PERFORM pg_advisory_xact_lock(hashtext('churn.test.score'));
            PERFORM pg_sleep(0.2); RETURN NEW; END $$;
            CREATE TRIGGER slow_score BEFORE INSERT ON scores FOR EACH ROW EXECUTE FUNCTION slow_score();""")
        process = self.start_sql("BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT row_to_json(r) FROM recalculate_risk('manual') r; COMMIT;")
        self.wait_for_lock('churn.test.score')
        self.assertIsNone(process.poll())
        self.sql('UPDATE accounts SET balance=balance+1 WHERE id=6;')
        output, errors = process.communicate(timeout=15)
        self.assertEqual(process.returncode, 0, errors)
        self.assertEqual(json.loads(output)['accounts_processed'], 10)
        pending = self.rows('SELECT DISTINCT account_id FROM delta WHERE proc_date IS NULL')
        self.assertEqual(pending, [{'account_id':6}])
        self.assertEqual(self.recalculate()['accounts_processed'], 1)


if __name__ == '__main__':
    unittest.main(verbosity=2)

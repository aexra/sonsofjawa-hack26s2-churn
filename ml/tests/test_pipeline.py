import copy
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from riskml.contracts import FEATURES, TARGET, validate
from riskml.dataset import ROOT, import_records, labeled, load_records, temporal_split
from riskml.evaluation import compare


def observation(service=1, day=1, origin='real'):
    time = datetime(2025, 1, 1, tzinfo=timezone.utc)+timedelta(days=day)
    return {'account_id': service, 'service_id': service, 'as_of': time.isoformat(),
            'due_at': (time+timedelta(days=2)).isoformat(),
            'deadline': (time+timedelta(days=7)).isoformat(), 'amount': 1000,
            'features': dict.fromkeys(FEATURES, 0.5), 'heuristic_score': 50,
            'model_version': 2, 'provenance': origin, 'target': TARGET}


def outcome(row, value='not_renewed'):
    time = row['deadline'] if value=='not_renewed' else row['due_at']
    return {k: row[k] for k in ('account_id','service_id','due_at','provenance','target')} | {
        'outcome': value, 'event_at': time, 'observed_at': time}


class DatasetTest(unittest.TestCase):
    def test_censoring_and_synthetic_data_are_not_negative_labels(self):
        a, b = observation(), observation(2, origin='synthetic')
        rows, excluded = labeled({'observations':[a,b],'outcomes':[outcome(b)]}, '2025-03-01T00:00:00Z')
        self.assertEqual(rows, [])
        self.assertEqual((excluded['censored'],excluded['unverified']), (1,1))

    def test_renewal_needs_observed_evidence_and_mature_horizon(self):
        a=observation()
        data={'observations':[a],'outcomes':[outcome(a,'renewed')]}
        self.assertEqual(labeled(data,'2025-01-05T00:00:00Z')[0], [])
        self.assertEqual(labeled(data,'2025-02-01T00:00:00Z')[0][0]['label'],0)

    def test_conflicting_and_blocked_outcomes_are_excluded(self):
        a=observation()
        for states, key in [(['renewed','not_renewed'],'conflicting'), (['blocked'],'blocked')]:
            rows, excluded=labeled({'observations':[a],'outcomes':[outcome(a,s) for s in states]},'2025-02-01T00:00:00Z')
            self.assertEqual(rows,[])
            self.assertEqual(excluded[key],1)

    def test_duplicate_snapshots_do_not_multiply_one_outcome(self):
        a=observation()
        b=dict(a,as_of='2025-01-03T00:00:00Z')
        rows, excluded=labeled({'observations':[a,b],'outcomes':[outcome(a)]},'2025-02-01T00:00:00Z')
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['as_of'],a['as_of'])
        self.assertEqual(excluded['duplicate_episode'],1)

    def test_future_knowledge_is_not_used(self):
        a=observation()
        event=outcome(a)|{'observed_at':'2025-04-01T00:00:00Z'}
        self.assertEqual(labeled({'observations':[a],'outcomes':[event]},'2025-03-01T00:00:00Z')[0],[])

    def test_missed_outcome_before_deadline_is_not_training_evidence(self):
        a=observation()
        event=outcome(a)|{'event_at':a['due_at'],'observed_at':a['due_at']}
        self.assertEqual(labeled({'observations':[a],'outcomes':[event]},'2025-03-01T00:00:00Z')[0],[])

    def test_invalid_inputs_fail_closed(self):
        for patch in [{'heuristic_score':float('nan')},{'amount':True},{'as_of':'2025-01-02'},
                      {'features':dict.fromkeys(FEATURES,2)}, {'target':'other'}, {'account_id':True}]:
            with self.subTest(patch=patch),self.assertRaises(ValueError):
                validate(observation()|patch)

    def test_store_is_idempotent_and_transactional(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            path=Path(directory)/'data.sqlite'
            data={'observations':[observation()],'outcomes':[]}
            self.assertEqual(import_records(path,data),1)
            self.assertEqual(import_records(path,data),0)
            self.assertEqual(load_records(path),data)
            with self.assertRaises(ValueError):
                import_records(path,{'observations':[observation(2),observation(3)|{'amount':-1}]})
            self.assertEqual(load_records(path),data)
        with self.assertRaises(ValueError):
            import_records(ROOT.parent/'forbidden.sqlite',data)

    def test_temporal_split_purges_unavailable_labels(self):
        records=[observation(1,20),observation(2,29),observation(3,40),observation(4,75)]
        rows,_=labeled({'observations':records,'outcomes':[outcome(r) for r in records]},'2025-05-01T00:00:00Z')
        split=temporal_split(rows,'2025-02-01T00:00:00Z','2025-03-01T00:00:00Z','2025-05-01T00:00:00Z')
        self.assertEqual([r['service_id'] for r in split['train']],[1])
        self.assertEqual([r['service_id'] for r in split['calibration']],[3])
        self.assertEqual([r['service_id'] for r in split['test']],[4])


class EvaluationTest(unittest.TestCase):
    def fixture(self):
        rows=[]
        events=[]
        for period in (0,90,180):
            for i in range(60):
                row=observation(period+i+1,period+i//3)
                value=int(i%4 in (0,1))
                row['features']=dict.fromkeys(FEATURES,0.8 if value else 0.2)
                row['heuristic_score']=80 if value else 20
                rows.append(row)
                events.append(outcome(row,'not_renewed' if value else 'renewed'))
        return {'observations':rows,'outcomes':events}

    def test_no_real_data_produces_no_invented_metrics(self):
        report=compare({'observations':[],'outcomes':[]},'2025-03-01T00:00:00Z','2025-06-01T00:00:00Z','2025-09-01T00:00:00Z')
        self.assertEqual(report['status'],'insufficient_observed_outcomes')
        self.assertNotIn('results',report)
        self.assertFalse(report['promotion_allowed'])

    def test_comparison_executes_three_candidates_and_separate_calibration(self):
        report=compare(self.fixture(),'2025-03-01T00:00:00Z','2025-06-01T00:00:00Z','2025-09-01T00:00:00Z')
        self.assertEqual(report['status'],'evaluated')
        self.assertEqual(set(report['results']),{'heuristic','logistic','boosting','prevalence_baseline'})
        self.assertNotIn('brier',report['results']['heuristic']['raw'])
        for name,candidate in report['results'].items():
            if name=='prevalence_baseline':
                continue
            self.assertLess(candidate['sigmoid_calibrated']['brier'],0.25)
            self.assertEqual(candidate['sigmoid_calibrated']['n'],60)
            self.assertTrue(candidate['sigmoid_calibrated']['calibration_bins'])
        json.dumps(report,allow_nan=False)

    def test_mixed_policy_versions_require_explicit_selection(self):
        data=self.fixture()
        extra=observation(999,15)|{'model_version':3}
        data['observations'].append(extra)
        data['outcomes'].append(outcome(extra))
        report=compare(data,'2025-03-01T00:00:00Z','2025-06-01T00:00:00Z','2025-09-01T00:00:00Z')
        self.assertNotIn('results',report)
        report=compare(data,'2025-03-01T00:00:00Z','2025-06-01T00:00:00Z','2025-09-01T00:00:00Z',model_version=2)
        self.assertEqual(report['status'],'evaluated')

    def test_test_labels_cannot_affect_predictions(self):
        data=self.fixture()
        first=compare(data,'2025-03-01T00:00:00Z','2025-06-01T00:00:00Z','2025-09-01T00:00:00Z')
        changed=copy.deepcopy(data)
        changed['outcomes']=[outcome(row,'renewed' if event['outcome']=='not_renewed' else 'not_renewed') if row['service_id']>180 else event
                             for row,event in zip(changed['observations'],changed['outcomes'])]
        second=compare(changed,'2025-03-01T00:00:00Z','2025-06-01T00:00:00Z','2025-09-01T00:00:00Z')
        for name in ('heuristic','logistic','boosting'):
            self.assertEqual(first['results'][name]['test_predictions'],second['results'][name]['test_predictions'])

    def test_later_conflicting_observations_do_not_change_past_training_data(self):
        data = self.fixture()
        first = compare(data, '2025-03-01T00:00:00Z', '2025-06-01T00:00:00Z', '2025-09-01T00:00:00Z')
        data['outcomes'].append(dict(data['outcomes'][0], outcome='blocked',
                                     event_at='2025-07-01T00:00:00Z', observed_at='2025-07-01T00:00:00Z'))
        second = compare(data, '2025-03-01T00:00:00Z', '2025-06-01T00:00:00Z', '2025-09-01T00:00:00Z')
        for name in ('heuristic', 'logistic', 'boosting'):
            self.assertEqual(first['results'][name]['test_predictions'], second['results'][name]['test_predictions'])


if __name__=='__main__':
    unittest.main()

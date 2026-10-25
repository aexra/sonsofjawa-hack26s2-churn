import copy
import json
import os
import subprocess
import sys
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path

from riskml.artifacts import load_model, read_json, save_model, write_json
from riskml.contracts import FEATURES
from riskml.dataset import ROOT, labeled
from riskml.demo import BOUNDARIES, generate
from riskml.inference import predict_batch
from riskml.model import LogisticModel, sigmoid
from riskml.training import train


class LogisticTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.payload, cls.requests = generate(episodes_per_period=180)
        cls.model, cls.report = train(cls.payload, *BOUNDARIES, provenance='synthetic')

    def test_training_separates_periods_and_records_provenance(self):
        self.assertIsNotNone(self.model)
        self.assertEqual(self.report['status'], 'trained')
        self.assertEqual(self.report['usage'], 'demonstration_only')
        self.assertFalse(self.report['promotion_allowed'])
        self.assertEqual(self.report['constant_features'], ['prolong_wait'])
        self.assertEqual(self.model.coefficients[2], 0)
        self.assertEqual(self.model.available_from, BOUNDARIES[2])
        self.assertTrue(all(counts['episodes'] == 180 for counts in self.report['split_counts'].values()))
        self.assertTrue(self.report['results']['logistic_calibrated']['calibration_bins'])

    def test_no_data_or_synthetic_data_cannot_train_real_model(self):
        for payload in ({'observations': [], 'outcomes': []}, self.payload):
            model, report = train(payload, *BOUNDARIES)
            self.assertIsNone(model)
            self.assertEqual(report['status'], 'insufficient_observed_outcomes')
            self.assertNotIn('results', report)

    def test_demo_labels_are_observations_not_thresholded_heuristic_scores(self):
        rows, _ = labeled(self.payload, BOUNDARIES[2], provenance='synthetic')
        self.assertTrue(any(row['label'] == 1 and row['heuristic_score'] < 25 for row in rows))
        self.assertTrue(any(row['label'] == 0 and row['heuristic_score'] > 25 for row in rows))

    def test_training_is_reproducible(self):
        model, report = train(self.payload, *BOUNDARIES, provenance='synthetic')
        self.assertEqual(model.to_dict(), self.model.to_dict())
        self.assertEqual(report['results'], self.report['results'])

    def test_test_labels_do_not_change_coefficients_or_probabilities(self):
        payload = copy.deepcopy(self.payload)
        for event, row in zip(payload['outcomes'], payload['observations']):
            if row['as_of'] >= BOUNDARIES[1]:
                event['outcome'] = 'renewed' if event['outcome'] == 'not_renewed' else 'not_renewed'
                event['event_at'] = row['due_at'] if event['outcome'] == 'renewed' else row['deadline']
                event['observed_at'] = event['event_at']
        model, report = train(payload, *BOUNDARIES, provenance='synthetic')
        self.assertEqual(model.coefficients, self.model.coefficients)
        self.assertEqual(model.intercept, self.model.intercept)
        self.assertEqual(report['test_predictions'], self.report['test_predictions'])
        self.assertNotEqual(report['results'], self.report['results'])

    def test_future_test_features_do_not_fit_scaler_or_classifier(self):
        payload = copy.deepcopy(self.payload)
        for row in payload['observations']:
            if row['as_of'] >= BOUNDARIES[1]:
                row['features'] = dict.fromkeys(FEATURES, 1.0)
        model, report = train(payload, *BOUNDARIES, provenance='synthetic')
        self.assertEqual(model.coefficients, self.model.coefficients)
        self.assertEqual(model.intercept, self.model.intercept)
        self.assertEqual(model.feature_ranges, self.model.feature_ranges)
        self.assertFalse(report['quality_checks']['all_features_observed_in_training'])

    def test_later_outcome_updates_cannot_rewrite_training_history(self):
        payload = copy.deepcopy(self.payload)
        event = dict(payload['outcomes'][0], outcome='blocked',
                     event_at='2025-07-01T00:00:00Z', observed_at='2025-07-01T00:00:00Z')
        payload['outcomes'].append(event)
        model, report = train(payload, *BOUNDARIES, provenance='synthetic')
        self.assertEqual(model.coefficients, self.model.coefficients)
        self.assertEqual(model.intercept, self.model.intercept)
        self.assertEqual(report['test_predictions'], self.report['test_predictions'])
        self.assertEqual(report['excluded_by_cutoff']['train']['blocked'], 0)
        self.assertEqual(report['excluded_by_cutoff']['test']['blocked'], 1)

    def test_mixed_feature_versions_are_rejected(self):
        payload = copy.deepcopy(self.payload)
        payload['observations'][0]['model_version'] = 'another-policy'
        model, report = train(payload, *BOUNDARIES, provenance='synthetic')
        self.assertIsNone(model)
        self.assertEqual(report['status'], 'incompatible_policy_versions')
        model, report = train(payload, *BOUNDARIES, provenance='synthetic', model_version='demo-policy-v2')
        self.assertIsNotNone(model)

    def test_incomplete_or_single_class_period_cannot_produce_model(self):
        payload = copy.deepcopy(self.payload)
        for event, row in zip(payload['outcomes'], payload['observations']):
            if row['as_of'] >= BOUNDARIES[1]:
                event.update(outcome='renewed', event_at=row['due_at'], observed_at=row['due_at'])
        model, report = train(payload, *BOUNDARIES, provenance='synthetic')
        self.assertIsNone(model)
        self.assertIn('test:', report['reason'])

    def test_safe_json_round_trip_preserves_predictions_and_explanations(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            path = Path(directory) / 'model.json'
            save_model(path, self.model)
            restored = load_model(path)
            self.assertEqual(restored.to_dict(), self.model.to_dict())
            features = self.requests['observations'][0]['features']
            result = restored.predict(features)
            self.assertEqual(result, self.model.predict(features))
            self.assertAlmostEqual(result['log_odds'], result['intercept'] + sum(
                item['log_odds_contribution'] for item in result['contributions']))
            self.assertAlmostEqual(result['probability'], sigmoid(result['log_odds']))
            with self.assertRaises(FileExistsError):
                save_model(path, self.model)

    def test_unknown_schema_reordered_features_and_tampered_models_are_rejected(self):
        for patch in ({'schema_version': 2}, {'feature_order': list(reversed(FEATURES))},
                      {'intercept': self.model.intercept + 1}, {'algorithm': 'pickle'},
                      {'usage': 'production'}, {'provenance': 'real'}):
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                LogisticModel.from_dict(self.model.to_dict() | patch)

    def test_numerical_limits_missing_features_and_unknown_features_are_rejected(self):
        self.assertEqual(sigmoid(1e6), 1)
        self.assertEqual(sigmoid(-1e6), 0)
        features = self.requests['observations'][0]['features']
        for value in (float('nan'), float('inf'), -0.1, 1.1, True):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.model.predict(features | {FEATURES[0]: value})
        for value in ({}, features | {'unknown': 0}, None):
            with self.assertRaises(ValueError):
                self.model.predict(value)

    def test_duplicate_json_keys_and_nonfinite_numbers_are_rejected(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            for index, body in enumerate(('{"a":1,"a":2}', '{"a":NaN}', '{"a":Infinity}')):
                path = Path(directory) / f'input-{index}.json'
                path.write_text(body)
                with self.assertRaises(ValueError):
                    read_json(path)

    def test_batch_preserves_payment_identity_and_aggregates_cents(self):
        rows = copy.deepcopy(self.requests['observations'][:2])
        rows[1]['account_id'] = rows[0]['account_id']
        output = predict_batch(self.model, rows)
        self.assertEqual(len(output['accounts']), 1)
        account = output['accounts'][0]
        self.assertEqual(account['payments'], 2)
        self.assertEqual(account['scheduled_amount'], sum(row['amount'] for row in rows))
        self.assertEqual(account['estimated_nonrenewal_amount'], output['estimated_nonrenewal_amount'])
        expected = sum(row['amount'] * prediction['probability_nonrenewal']
                       for row, prediction in zip(rows, output['predictions'])) / account['scheduled_amount']
        self.assertAlmostEqual(account['payment_amount_weighted_probability'], expected)
        self.assertEqual(output['usage'], 'demonstration_only')
        self.assertTrue(all(0 <= row['estimated_nonrenewal_amount'] <= row['amount'] for row in output['predictions']))

    def test_money_rounding_and_large_integer_amounts_remain_exact(self):
        model = replace(self.model, coefficients=(0.0,) * 6, intercept=0.0)
        row = self.requests['observations'][0] | {'amount': 2**63 - 1}
        output = predict_batch(model, [row])
        self.assertEqual(output['estimated_nonrenewal_amount'], 2**62)
        self.assertEqual(output['accounts'][0]['scheduled_amount'], 2**63 - 1)

    def test_duplicate_episodes_are_not_counted_twice(self):
        row = self.requests['observations'][0]
        for duplicate in (row, row | {'as_of': '2025-09-29T00:00:00Z'}):
            with self.assertRaisesRegex(ValueError, 'duplicate'):
                predict_batch(self.model, [row, duplicate])

    def test_demo_model_cannot_be_used_on_real_or_unknown_inputs(self):
        for provenance in ('real', 'unverified'):
            with self.assertRaisesRegex(ValueError, 'demonstration'):
                predict_batch(self.model, [self.requests['observations'][0] | {'provenance': provenance}])

    def test_prediction_before_evaluation_or_with_other_feature_policy_is_rejected(self):
        for patch in ({'as_of': '2025-08-01T00:00:00Z'}, {'model_version': 'other'}):
            with self.assertRaises(ValueError):
                predict_batch(self.model, [self.requests['observations'][0] | patch])

    def test_empty_prediction_batch_and_out_of_training_range(self):
        self.assertEqual(predict_batch(self.model, [])['estimated_nonrenewal_amount'], 0)
        result = self.model.predict(dict.fromkeys(FEATURES, 1.0))
        self.assertIn('prolong_wait', result['outside_training_range'])

    def test_outputs_and_symlink_destinations_cannot_escape_ml(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            link = Path(directory) / 'outside'
            link.symlink_to(ROOT.parent, target_is_directory=True)
            with self.assertRaises(ValueError):
                save_model(link / 'model.json', self.model)

    def test_inference_runs_without_sklearn_or_numpy(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            path = Path(directory) / 'model.json'
            save_model(path, self.model)
            code = "import sys,json; sys.path.insert(0,sys.argv[1]); from riskml.artifacts import load_model; from riskml.inference import predict_batch; result=predict_batch(load_model(sys.argv[2]),json.load(sys.stdin)); assert 'sklearn' not in sys.modules; assert 'numpy' not in sys.modules; print(len(result['predictions']))"
            result = subprocess.run([sys.executable, '-I', '-S', '-B', '-c', code, str(ROOT), str(path)],
                                    input=json.dumps(self.requests['observations']), text=True, capture_output=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(int(result.stdout), 20)


class CommandTest(unittest.TestCase):
    def command(self, *args):
        environment = dict(os.environ, PYTHONDONTWRITEBYTECODE='1', PYTHONPATH=str(ROOT))
        return subprocess.run([sys.executable, '-B', '-m', 'riskml', *map(str, args)], cwd=ROOT,
                              env=environment, text=True, capture_output=True, timeout=60)

    def test_demo_training_reload_and_prediction_end_to_end(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            destination = Path(directory) / 'run'
            result = self.command('demo', '--out-dir', destination)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)['usage'], 'demonstration_only')
            output = Path(directory) / 'prediction.json'
            result = self.command('predict', '--model', destination/'model.json',
                                  '--input', destination/'requests.json', '--out', output)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(read_json(output), read_json(destination/'predictions.json'))
            repeat = self.command('demo', '--out-dir', destination)
            self.assertEqual(repeat.returncode, 2)
            self.assertIn('already exists', repeat.stderr)

    def test_training_on_empty_real_data_reports_blocker_without_model(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            payload = Path(directory) / 'empty.json'
            write_json(payload, {'observations': [], 'outcomes': []})
            destination = Path(directory) / 'run'
            result = self.command('train', '--input', payload, '--out-dir', destination,
                                  '--train-end', BOUNDARIES[0], '--calibration-end', BOUNDARIES[1], '--test-end', BOUNDARIES[2])
            self.assertEqual(result.returncode, 2, result.stderr)
            self.assertEqual(json.loads(result.stdout)['status'], 'insufficient_observed_outcomes')
            self.assertFalse((destination/'model.json').exists())
            self.assertTrue((destination/'report.json').exists())

    def test_import_store_train_and_predict_end_to_end(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            directory = Path(directory)
            payload, requests = generate(episodes_per_period=90)
            write_json(directory/'dataset.json', payload)
            write_json(directory/'requests.json', requests)
            imported = self.command('import', '--input', directory/'dataset.json', '--store', directory/'training.sqlite')
            self.assertEqual(imported.returncode, 0, imported.stderr)
            trained = self.command('train', '--store', directory/'training.sqlite', '--out-dir', directory/'run',
                                   '--provenance', 'synthetic', '--train-end', BOUNDARIES[0],
                                   '--calibration-end', BOUNDARIES[1], '--test-end', BOUNDARIES[2])
            self.assertEqual(trained.returncode, 0, trained.stderr)
            self.assertEqual(json.loads(trained.stdout)['status'], 'trained')
            predicted = self.command('predict', '--model', directory/'run/model.json',
                                     '--input', directory/'requests.json', '--out', directory/'out.json')
            self.assertEqual(predicted.returncode, 0, predicted.stderr)
            self.assertEqual(len(read_json(directory/'out.json')['predictions']), 20)

    def test_cli_does_not_deserialize_pickle_as_a_model(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            path = Path(directory) / 'unsafe.json'
            path.write_bytes(b'\x80\x04not-json')
            result = self.command('predict', '--model', path, '--input', path, '--out', Path(directory)/'out.json')
            self.assertEqual(result.returncode, 2)
            self.assertFalse((Path(directory)/'out.json').exists())


if __name__ == '__main__':
    unittest.main()

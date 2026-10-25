import copy
import json
import tempfile
import threading
import unittest
from dataclasses import replace
from datetime import timedelta
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from riskml.contracts import FEATURES, instant
from riskml.inference import predict_batch
from riskml.runtime import ModelRuntime, demo_dataset
from riskml.server import handler_for
from riskml.training import train


class RuntimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.as_of = '2026-10-25T12:00:00Z'
        cls.payload, cls.boundaries = demo_dataset(cls.as_of, '2')
        cls.model, cls.report = train(cls.payload, *cls.boundaries, provenance='synthetic')
        assert cls.model is not None

    def setUp(self):
        root = Path(__file__).resolve().parents[1] / 'reports'
        root.mkdir(exist_ok=True)
        self.directory = tempfile.TemporaryDirectory(dir=root)
        self.runtime = ModelRuntime(self.directory.name, demo=True)
        self.body = {'asOf': self.as_of, 'policyVersion': '2',
                     'dataset': {'observations': [], 'outcomes': []}}

    def tearDown(self):
        self.runtime.close()
        self.directory.cleanup()

    def ready(self):
        self.runtime.submit(self.body)
        empty = {'status': 'insufficient_observed_outcomes'}
        with patch('riskml.runtime.train', side_effect=[(None, empty), (self.model, copy.deepcopy(self.report))]):
            self.runtime.run_once()
        self.assertEqual(self.runtime.status()['lastResult'], 'promoted')

    def observation(self):
        due = instant(self.as_of) + timedelta(days=5)
        return {'account_id': 1, 'service_id': 1, 'as_of': self.as_of, 'due_at': due.isoformat(),
                'deadline': (due + timedelta(days=5)).isoformat(), 'amount': 1500,
                'features': dict.fromkeys(FEATURES, 0.1), 'model_version': '2',
                'heuristic_score': 20, 'target': 'service_nonrenewal_v2', 'provenance': 'unverified'}

    def test_synthetic_training_is_dated_before_prediction(self):
        self.runtime.submit(self.body)
        self.runtime.run_once()
        self.assertEqual(self.runtime.status()['state'], 'ready')
        self.assertLessEqual(instant(self.runtime.model.available_from), instant(self.as_of))
        result = self.runtime.predict([self.observation()])
        self.assertEqual(result['usage'], 'demonstration_only')
        self.assertEqual(result['predictions'][0]['input_provenance'], 'unverified')
        self.assertGreater(result['predictions'][0]['probability_nonrenewal'], 0)

    def test_demo_inference_requires_explicit_opt_in_and_compatible_policy(self):
        with self.assertRaises(ValueError):
            predict_batch(self.model, [self.observation()])
        self.ready()
        row = self.observation()
        row['model_version'] = '3'
        with self.assertRaises(ValueError):
            self.runtime.predict([row])

    def test_same_dataset_is_not_retrained(self):
        self.ready()
        with patch('riskml.runtime.train') as training:
            self.runtime.submit(self.body)
            self.runtime.run_once()
        training.assert_not_called()

    def test_failed_retraining_preserves_active_model(self):
        self.ready()
        identifier = self.runtime.model.model_id
        self.body['asOf'] = '2026-10-26T12:00:00Z'
        self.runtime.submit(self.body)
        with patch('riskml.runtime.train', side_effect=ValueError('invalid dataset')):
            self.runtime.run_once()
        self.assertEqual(self.runtime.status()['lastResult'], 'training_failed')
        self.assertEqual(self.runtime.model.model_id, identifier)
        self.assertEqual(len(self.runtime.predict([self.observation()])['predictions']), 1)

    def test_model_restores_after_restart_and_demo_can_be_disabled(self):
        self.ready()
        restored = ModelRuntime(self.directory.name, demo=True)
        self.assertEqual(restored.model.model_id, self.runtime.model.model_id)
        real = ModelRuntime(self.directory.name, demo=False)
        self.assertIsNone(real.model)
        with patch('riskml.runtime.demo_dataset') as generator:
            real.run_once()
        generator.assert_not_called()
        self.assertEqual(real.status()['state'], 'waiting_for_data')

    def test_rejected_candidate_does_not_replace_active_model(self):
        self.ready()
        identifier = self.runtime.model.model_id
        self.body['asOf'] = '2026-10-26T12:00:00Z'
        self.runtime.submit(self.body)
        candidate = replace(self.model, provenance='real')
        report = copy.deepcopy(self.report)
        report['review_checks_passed'] = False
        with patch('riskml.runtime.train', return_value=(candidate, report)):
            self.runtime.run_once()
        self.assertEqual(self.runtime.model.model_id, identifier)

    def test_background_worker_runs_without_predict_request(self):
        completed = threading.Event()
        self.runtime.interval = 1
        with patch.object(self.runtime, 'run_once', side_effect=completed.set):
            self.runtime.start()
            self.assertTrue(completed.wait(3))
            completed.clear()
            self.assertTrue(completed.wait(3))
            self.runtime.close()
        self.assertFalse(self.runtime.thread.is_alive())

    def test_training_is_not_concurrent(self):
        self.runtime.submit(self.body)
        self.runtime.training_lock.acquire()
        try:
            with patch('riskml.runtime.train') as training:
                self.runtime.run_once()
            training.assert_not_called()
        finally:
            self.runtime.training_lock.release()

    def test_http_contract_and_invalid_payload(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), handler_for(self.runtime))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f'http://127.0.0.1:{server.server_port}'
        try:
            with urlopen(base + '/health', timeout=5) as response:
                self.assertEqual(json.load(response)['state'], 'waiting_for_data')
            request = Request(base + '/training-data', json.dumps(self.body).encode())
            with urlopen(request, timeout=5) as response:
                self.assertEqual(response.status, 202)
            with self.assertRaises(HTTPError) as error:
                urlopen(Request(base + '/predict', b'{"observations":[]}'), timeout=5)
            self.assertEqual(error.exception.code, 409)
            error.exception.close()
            self.ready()
            body = json.dumps({'observations': [self.observation()]}).encode()
            with urlopen(Request(base + '/predict', body), timeout=5) as response:
                self.assertEqual(json.load(response)['model_id'], self.model.model_id)
            with self.assertRaises(HTTPError) as error:
                urlopen(Request(base + '/predict', b'{"observations":[],"observations":[]}'), timeout=5)
            self.assertEqual(error.exception.code, 422)
            error.exception.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)


if __name__ == '__main__':
    unittest.main()

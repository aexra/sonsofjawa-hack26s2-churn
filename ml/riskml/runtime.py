import hashlib
import os
import threading
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from .artifacts import load_model, read_json, save_model, write_json
from .contracts import instant
from .dataset import canonical, local_path, prepare_periods
from .demo import BOUNDARIES, generate
from .evaluation import metrics
from .inference import predict_batch
from .training import train


def atomic_json(path, value):
    temporary = path.with_name(f'.{path.name}.{uuid4().hex}.tmp')
    try:
        write_json(temporary, value)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def windows(as_of):
    end = instant(as_of).replace(hour=0, minute=0, second=0, microsecond=0)
    return tuple((end - timedelta(days=days)).isoformat() for days in (60, 30, 0))


def demo_dataset(as_of, policy):
    end = instant(windows(as_of)[2])
    payload, _ = generate(seed=42 + end.toordinal())
    shift = end - instant(BOUNDARIES[2])
    for kind, fields in (('observations', ('as_of', 'due_at', 'deadline')),
                         ('outcomes', ('event_at', 'observed_at', 'due_at'))):
        for row in payload[kind]:
            for field in fields:
                row[field] = (instant(row[field]) + shift).isoformat()
            if kind == 'observations':
                row['model_version'] = policy
    boundaries = tuple((instant(value) + shift).isoformat() for value in BOUNDARIES)
    return payload, boundaries


class ModelRuntime:
    def __init__(self, directory, *, demo=False, interval=3600):
        if interval < 1:
            raise ValueError('training interval must be positive')
        self.directory = local_path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.demo = demo
        self.interval = interval
        self.lock = threading.RLock()
        self.training_lock = threading.Lock()
        self.wake = threading.Event()
        self.stop = threading.Event()
        self.model = None
        self.last_digest = None
        self.state = {'state': 'waiting_for_data', 'lastRunAt': None, 'nextRunAt': None,
                      'lastResult': None, 'automaticRetraining': True}
        pointer = self.directory / 'active.json'
        if pointer.exists():
            active = read_json(pointer)
            name = active['modelId']
            if not isinstance(name, str) or len(name) != 64 or any(c not in '0123456789abcdef' for c in name):
                raise ValueError('invalid active model identifier')
            model = load_model(self.directory / 'models' / name / 'model.json')
            if model.model_id != name:
                raise ValueError('active model identifier mismatch')
            if model.provenance == 'real' or self.demo:
                self.model = model
                self.state.update(state='ready', lastResult='restored')
        self.thread = None

    def submit(self, body):
        if not isinstance(body, dict) or not isinstance(body.get('dataset'), dict):
            raise ValueError('dataset object is required')
        instant(body['asOf'])
        policy = str(body['policyVersion'])
        if not policy or len(policy) > 100:
            raise ValueError('invalid feature policy')
        for key in ('observations', 'outcomes'):
            if not isinstance(body['dataset'].get(key), list):
                raise ValueError(f'{key} must be an array')
        with self.lock:
            atomic_json(self.directory / 'dataset.json', body)
            if self.model is None or self.model.policy_version != policy:
                self.wake.set()
        return self.status()

    def status(self):
        with self.lock:
            model = self.model
            return dict(self.state, modelId=model.model_id if model else None,
                        provenance=model.provenance if model else None,
                        policyVersion=model.policy_version if model else None,
                        availableFrom=model.available_from if model else None,
                        demonstrationEnabled=self.demo, intervalSeconds=self.interval)

    def predict(self, observations):
        with self.lock:
            model = self.model
        if model is None:
            raise LookupError('model is not ready')
        result = predict_batch(model, observations, demonstration=self.demo)
        return dict(result, training=self.status())

    def run_once(self):
        if not self.training_lock.acquire(blocking=False):
            return
        try:
            source = self.directory / 'dataset.json'
            if not source.exists():
                return
            with self.lock:
                body = read_json(source)
            policy = str(body['policyVersion'])
            boundaries = windows(body['asOf'])
            digest = hashlib.sha256(canonical([body['dataset'], policy, boundaries, self.demo]).encode()).hexdigest()
            if digest == self.last_digest:
                return
            with self.lock:
                self.state.update(state='training', lastRunAt=datetime.now(timezone.utc).isoformat())
            payload = body['dataset']
            model, report = train(payload, *boundaries, model_version=policy, provenance='real')
            if model is None and self.demo:
                payload, boundaries = demo_dataset(body['asOf'], policy)
                model, report = train(payload, *boundaries, model_version=policy, provenance='synthetic')
            promoted = False
            if model is not None:
                with self.lock:
                    incumbent = self.model
                approved = report['review_checks_passed']
                if model.provenance == 'synthetic':
                    approved = self.demo and (incumbent is None or incumbent.provenance == 'synthetic')
                elif incumbent and incumbent.provenance == 'real' and incumbent.policy_version == policy:
                    if instant(boundaries[1]) < instant(incumbent.available_from):
                        approved = False
                        report['promotion_reason'] = 'waiting_for_fresh_holdout'
                    else:
                        parts, _, _ = prepare_periods(payload, *boundaries, provenance='real')
                        rows = [r for r in parts['test'] if str(r['model_version']) == policy]
                        previous = metrics([r['label'] for r in rows],
                                           [incumbent.predict(r['features'])['probability'] for r in rows],
                                           [r['amount'] for r in rows], True)
                        report['incumbent_results'] = previous
                        candidate = report['results']['logistic_calibrated']
                        approved = approved and candidate['brier'] <= previous['brier'] and candidate['log_loss'] <= previous['log_loss']
                report['automatic_promotion'] = approved
                report['automatic_promotion_scope'] = 'demonstration' if model.provenance == 'synthetic' else 'validated_real_outcomes'
                destination = self.directory / 'models' / model.model_id
                if not destination.exists():
                    destination.mkdir(parents=True)
                    save_model(destination / 'model.json', model)
                    write_json(destination / 'report.json', report)
                if approved:
                    atomic_json(self.directory / 'active.json', {'modelId': model.model_id})
                    with self.lock:
                        self.model = model
                    promoted = True
            self.last_digest = digest
            with self.lock:
                self.state.update(state='ready' if self.model else 'waiting_for_data',
                                  lastResult='promoted' if promoted else report.get('promotion_reason', 'candidate_rejected' if model else report['status']))
        except Exception:
            with self.lock:
                self.state.update(state='ready' if self.model else 'error', lastResult='training_failed')
        finally:
            with self.lock:
                self.state['nextRunAt'] = (datetime.now(timezone.utc) + timedelta(seconds=self.interval)).isoformat()
            self.training_lock.release()

    def start(self):
        def work():
            while not self.stop.is_set():
                self.wake.clear()
                self.run_once()
                self.wake.wait(self.interval)
        self.thread = threading.Thread(target=work, name='ml-retraining', daemon=True)
        self.thread.start()

    def close(self):
        self.stop.set()
        self.wake.set()
        if self.thread:
            self.thread.join(timeout=10)

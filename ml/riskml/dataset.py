import hashlib
import json
import sqlite3
from contextlib import closing
from pathlib import Path

from .contracts import TARGET, instant, validate, validate_outcome


ROOT = Path(__file__).resolve().parents[1]


def local_path(value):
    path = Path(value).resolve()
    if not path.is_relative_to(ROOT):
        raise ValueError('output must stay inside ml/')
    return path


def canonical(row):
    return json.dumps(row, sort_keys=True, separators=(',', ':'), allow_nan=False)


def import_records(path, payload):
    observations = [validate(r) for r in payload.get('observations', [])]
    outcomes = [validate_outcome(r) for r in payload.get('outcomes', [])]
    destination = local_path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(destination)) as db, db:
        db.execute('CREATE TABLE IF NOT EXISTS observations (digest TEXT PRIMARY KEY, body TEXT NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS outcomes (digest TEXT PRIMARY KEY, body TEXT NOT NULL)')
        before = db.total_changes
        for table, rows in (('observations', observations), ('outcomes', outcomes)):
            for row in rows:
                body = canonical(row)
                digest = hashlib.sha256(body.encode()).hexdigest()
                db.execute(f'INSERT OR IGNORE INTO {table} VALUES (?, ?)', (digest, body))
        return db.total_changes - before


def load_records(path):
    with closing(sqlite3.connect(local_path(path).as_uri() + '?mode=ro', uri=True)) as db:
        return {table: [json.loads(r[0]) for r in db.execute(f'SELECT body FROM {table} ORDER BY digest')]
                for table in ('observations', 'outcomes')}


def episode(row):
    return row['account_id'], row['service_id'], instant(row['due_at'])


def labeled(payload, observed_until, provenance='real'):
    if provenance not in ('real', 'synthetic'):
        raise ValueError('training provenance must be real or synthetic')
    cutoff = instant(observed_until)
    outcomes = {}
    for raw in payload.get('outcomes', []):
        row = validate_outcome(raw)
        if instant(row['observed_at']) <= cutoff:
            outcomes.setdefault(episode(row), []).append(row)
    result = []
    rejected = {'unverified': 0, 'censored': 0, 'conflicting': 0, 'blocked': 0, 'duplicate_episode': 0}
    seen = set()
    observations = sorted((validate(r) for r in payload.get('observations', [])),
                          key=lambda r: (instant(r['as_of']), str(r['model_version'])))
    for row in observations:
        if row['provenance'] != provenance:
            rejected['unverified'] += 1
            continue
        end = instant(row['deadline'])
        candidates = [o for o in outcomes.get(episode(row), []) if o['provenance'] == provenance]
        if end > cutoff or not candidates:
            rejected['censored'] += 1
            continue
        states = {o['outcome'] for o in candidates}
        if 'blocked' in states:
            rejected['blocked'] += 1
            continue
        valid = [o for o in candidates
                 if (o['outcome'] == 'renewed' and instant(row['as_of']) < instant(o['event_at']) <= end)
                 or (o['outcome'] == 'not_renewed' and instant(o['event_at']) >= end
                     and instant(o['observed_at']) >= end)]
        states = {o['outcome'] for o in valid}
        if len(states) > 1:
            rejected['conflicting'] += 1
            continue
        if not valid:
            rejected['censored'] += 1
            continue
        key = episode(row)
        if key in seen:
            rejected['duplicate_episode'] += 1
            continue
        seen.add(key)
        available = max(end, min(instant(o['observed_at']) for o in valid))
        result.append(dict(row, label=int(valid[0]['outcome'] == 'not_renewed'),
                           label_available_at=available.isoformat()))
    return result, rejected


def temporal_split(rows, train_end, calibration_end, test_end):
    train, calibration, end = map(instant, (train_end, calibration_end, test_end))
    if not train < calibration < end:
        raise ValueError('split boundaries must increase')
    parts = {'train': [], 'calibration': [], 'test': []}
    for row in rows:
        start, available = instant(row['as_of']), instant(row['label_available_at'])
        if start < train and available <= train:
            parts['train'].append(row)
        elif train <= start < calibration and available <= calibration:
            parts['calibration'].append(row)
        elif calibration <= start < end and available <= end:
            parts['test'].append(row)
    return parts


def prepare_periods(payload, train_end, calibration_end, test_end, provenance='real'):
    temporal_split([], train_end, calibration_end, test_end)
    parts, excluded, available = {}, {}, {}
    for name, cutoff in zip(('train', 'calibration', 'test'), (train_end, calibration_end, test_end)):
        rows, rejected = labeled(payload, cutoff, provenance=provenance)
        parts[name] = temporal_split(rows, train_end, calibration_end, test_end)[name]
        excluded[name] = rejected
        available[name] = len(rows)
    return parts, excluded, available

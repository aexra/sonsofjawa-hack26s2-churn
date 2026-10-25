from datetime import datetime, timezone
from math import isfinite


FEATURES = ('renewal_unsecured', 'insufficient_funds', 'prolong_wait',
            'suspended_share', 'termination_history', 'payment_failures')
TARGET = 'service_nonrenewal_v2'


def instant(value):
    if not isinstance(value, str):
        raise ValueError('timestamp must be an ISO string')
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.tzinfo is None:
        raise ValueError('timestamps must include timezone')
    return result.astimezone(timezone.utc)


def finite(value, minimum, maximum):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError('numeric value required')
    if not isfinite(value) or not minimum <= value <= maximum:
        raise ValueError('numeric value outside allowed range')
    return value


def validate_features(features):
    if not isinstance(features, dict) or set(features) != set(FEATURES):
        raise ValueError('feature schema mismatch')
    for value in features.values():
        finite(value, 0, 1)
    return features


def validate(row):
    if row['target'] != TARGET:
        raise ValueError('incompatible prediction target')
    if row['provenance'] not in ('real', 'synthetic', 'unverified'):
        raise ValueError('unknown provenance')
    for name in ('account_id', 'service_id'):
        if type(row[name]) is not int or row[name] <= 0:
            raise ValueError('positive integer identifiers required')
    as_of, due, deadline = (instant(row[k]) for k in ('as_of', 'due_at', 'deadline'))
    if not as_of < due <= deadline:
        raise ValueError('forecast must precede renewal and deadline')
    validate_features(row['features'])
    finite(row['heuristic_score'], 0, 100)
    if type(row['amount']) is not int or not 0 < row['amount'] <= 2**63 - 1:
        raise ValueError('amount must be positive integer eurocents')
    if not isinstance(row['model_version'], (str, int)) or isinstance(row['model_version'], bool):
        raise ValueError('model version required')
    return row


def validate_outcome(row):
    for name in ('account_id', 'service_id'):
        if type(row[name]) is not int or row[name] <= 0:
            raise ValueError('positive integer identifiers required')
    if row['target'] != TARGET:
        raise ValueError('incompatible outcome target')
    if row['outcome'] not in ('renewed', 'not_renewed', 'blocked'):
        raise ValueError('outcome must be observed, never inferred from missing records')
    if row['provenance'] not in ('real', 'synthetic', 'unverified'):
        raise ValueError('unknown provenance')
    if instant(row['event_at']) > instant(row['observed_at']):
        raise ValueError('event cannot be observed before it happened')
    instant(row['due_at'])
    return row

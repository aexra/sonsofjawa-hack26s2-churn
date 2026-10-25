import math
import random
from datetime import datetime, timedelta, timezone

from .contracts import FEATURES, TARGET
from .model import sigmoid


BOUNDARIES = ('2025-03-01T00:00:00Z', '2025-06-01T00:00:00Z', '2025-09-01T00:00:00Z')


def generate(seed=42, episodes_per_period=600):
    if type(seed) is not int or type(episodes_per_period) is not int or episodes_per_period < 60:
        raise ValueError('demo needs an integer seed and at least 60 episodes per period')
    rng = random.Random(seed)
    start = datetime(2025, 1, 1, tzinfo=timezone.utc)
    observations, outcomes, predictions = [], [], []
    for period in range(4):
        for index in range(episodes_per_period if period < 3 else 20):
            as_of = start + timedelta(days=period * 90 + index % 20)
            due_days = rng.randint(1, 29)
            due = as_of + timedelta(days=due_days)
            urgency = (math.exp(-due_days/10) - math.exp(-3)) / (1-math.exp(-3))
            values = (float(rng.random() < 0.4) * urgency,
                      rng.random() * urgency if rng.random() < 0.5 else 0.0,
                      0.0, float(rng.random() < 0.12), rng.betavariate(1, 5),
                      rng.random() if rng.random() < 0.25 else 0.0)
            probability = sigmoid(-2.0 + 1.5*values[0] + 2.2*values[1] + 1.3*values[3]
                                  + 1.6*values[4] + 1.8*values[5])
            weighted = max(25*values[0], 25*values[1], 30*values[2], 5*values[5])
            score = 100 * (weighted + 10*values[3] + 5*values[4]) / 45
            row = {'account_id': index + 1, 'service_id': index + 1, 'as_of': as_of.isoformat(),
                   'due_at': due.isoformat(), 'deadline': (due+timedelta(days=5)).isoformat(),
                   'amount': rng.randint(500, 10000), 'features': dict(zip(FEATURES, values)),
                   'heuristic_score': score, 'model_version': 'demo-policy-v2',
                   'provenance': 'synthetic', 'target': TARGET}
            if period == 3:
                predictions.append(row)
                continue
            observations.append(row)
            value = 'not_renewed' if rng.random() < probability else 'renewed'
            event_at = row['deadline'] if value == 'not_renewed' else row['due_at']
            outcomes.append({key: row[key] for key in ('account_id', 'service_id', 'due_at', 'provenance', 'target')} | {
                'outcome': value, 'event_at': event_at, 'observed_at': event_at})
    return {'observations': observations, 'outcomes': outcomes}, {'observations': predictions}

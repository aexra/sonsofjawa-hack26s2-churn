import hashlib
import math
from dataclasses import dataclass

from .contracts import FEATURES, TARGET, finite, instant, validate_features
from .dataset import canonical


def sigmoid(value):
    if value >= 0:
        return 1 / (1 + math.exp(-value))
    exponential = math.exp(value)
    return exponential / (1 + exponential)


@dataclass(frozen=True)
class LogisticModel:
    coefficients: tuple
    intercept: float
    policy_version: str
    provenance: str
    available_from: str
    dataset_sha256: str
    feature_ranges: tuple

    def __post_init__(self):
        if len(self.coefficients) != len(FEATURES) or len(self.feature_ranges) != len(FEATURES):
            raise ValueError('model needs six coefficients and feature ranges')
        for value in (*self.coefficients, self.intercept):
            finite(value, -1e6, 1e6)
        for bounds in self.feature_ranges:
            if len(bounds) != 2 or finite(bounds[0], 0, 1) > finite(bounds[1], 0, 1):
                raise ValueError('invalid training feature range')
        if self.provenance not in ('real', 'synthetic'):
            raise ValueError('invalid model provenance')
        if not isinstance(self.policy_version, str) or not self.policy_version:
            raise ValueError('model policy version required')
        instant(self.available_from)
        if len(self.dataset_sha256) != 64 or any(c not in '0123456789abcdef' for c in self.dataset_sha256):
            raise ValueError('invalid dataset digest')

    @property
    def model_id(self):
        return hashlib.sha256(canonical(self.body()).encode()).hexdigest()

    def body(self):
        return {'schema_version': 1, 'algorithm': 'logistic_regression', 'target': TARGET,
                'feature_order': list(FEATURES), 'coefficients': list(self.coefficients),
                'intercept': self.intercept, 'policy_version': self.policy_version,
                'provenance': self.provenance, 'available_from': self.available_from,
                'dataset_sha256': self.dataset_sha256,
                'feature_ranges': [list(bounds) for bounds in self.feature_ranges],
                'calibration': 'sigmoid_folded_into_coefficients',
                'usage': 'demonstration_only' if self.provenance == 'synthetic' else 'candidate',
                'probability_quality': 'requires_review_of_held_out_evaluation'}

    def to_dict(self):
        return dict(self.body(), model_id=self.model_id)

    @classmethod
    def from_dict(cls, data):
        if not isinstance(data, dict):
            raise ValueError('model must be a JSON object')
        expected = {'schema_version', 'algorithm', 'target', 'feature_order', 'coefficients',
                    'intercept', 'policy_version', 'provenance', 'available_from',
                    'dataset_sha256', 'feature_ranges', 'calibration', 'usage',
                    'probability_quality', 'model_id'}
        if set(data) != expected or type(data['schema_version']) is not int or data['schema_version'] != 1:
            raise ValueError('unsupported model schema')
        if data['feature_order'] != list(FEATURES) or data['target'] != TARGET:
            raise ValueError('incompatible model feature schema or target')
        model = cls(tuple(data['coefficients']), data['intercept'], data['policy_version'],
                    data['provenance'], data['available_from'], data['dataset_sha256'],
                    tuple(tuple(bounds) for bounds in data['feature_ranges']))
        if model.to_dict() != data:
            raise ValueError('model metadata or digest mismatch')
        return model

    def predict(self, features):
        validate_features(features)
        terms = [{'feature': name, 'value': features[name], 'coefficient': weight,
                  'log_odds_contribution': weight * features[name]}
                 for name, weight in zip(FEATURES, self.coefficients)]
        log_odds = self.intercept + math.fsum(term['log_odds_contribution'] for term in terms)
        outside = [name for name, bounds in zip(FEATURES, self.feature_ranges)
                   if not bounds[0] <= features[name] <= bounds[1]]
        return {'probability': sigmoid(log_odds), 'log_odds': log_odds,
                'intercept': self.intercept, 'contributions': terms,
                'outside_training_range': outside}

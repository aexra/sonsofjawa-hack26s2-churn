import hashlib
import platform
import warnings
from collections import Counter

from .contracts import FEATURES, TARGET
from .dataset import canonical, prepare_periods
from .evaluation import metrics
from .model import LogisticModel


def train(payload, train_end, calibration_end, test_end, model_version=None,
          provenance='real', min_rows=30, min_class=5):
    import numpy as np
    import sklearn
    from sklearn.exceptions import ConvergenceWarning
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    from threadpoolctl import threadpool_limits

    if type(min_rows) is not int or min_rows < 30 or type(min_class) is not int or min_class < 5:
        raise ValueError('need at least 30 episodes and 5 of each class in every period')
    if model_version is not None:
        payload = dict(payload, observations=[row for row in payload.get('observations', [])
                                              if str(row['model_version']) == str(model_version)])
    parts, exclusions, available = prepare_periods(payload, train_end, calibration_end, test_end, provenance=provenance)
    digest = hashlib.sha256(canonical(payload).encode()).hexdigest()
    versions = sorted({str(row['model_version']) for group in parts.values() for row in group})
    counts = {name: {'episodes': len(group), 'renewed': sum(row['label'] == 0 for row in group),
                     'not_renewed': sum(row['label'] == 1 for row in group)}
              for name, group in parts.items()}
    report = {'algorithm': 'logistic_regression', 'target': TARGET,
              'status': 'insufficient_observed_outcomes', 'provenance': provenance,
              'usage': 'demonstration_only' if provenance == 'synthetic' else 'candidate',
              'dataset_sha256': digest, 'excluded': exclusions['test'], 'excluded_by_cutoff': exclusions,
              'labeled_episodes_by_cutoff': available, 'split_counts': counts,
              'split_boundaries': {'train_end': train_end, 'calibration_end': calibration_end,
                                   'test_end': test_end}, 'policy_versions': versions,
              'minimum_data': {'episodes_per_period': min_rows, 'each_class_per_period': min_class},
              'runtime': {'python': platform.python_version(), 'sklearn': sklearn.__version__},
              'promotion_allowed': False,
              'evaluation_scope': 'future first renewals; customers may repeat across periods',
              'monetary_target': 'face value of unrenewed first payments, not causal revenue loss'}
    for name, group in parts.items():
        labels = Counter(row['label'] for row in group)
        if len(group) < min_rows or min(labels.get(0, 0), labels.get(1, 0)) < min_class:
            report['reason'] = f'{name}: need {min_rows} episodes and {min_class} of each outcome'
            return None, report
    if len(versions) != 1:
        report.update(status='incompatible_policy_versions', reason='select one feature policy version')
        return None, report
    x_train, x_cal, x_test = (np.asarray([[row['features'][name] for name in FEATURES]
                                        for row in parts[part]], dtype=float)
                            for part in ('train', 'calibration', 'test'))
    y_train, y_cal, y_test = (np.asarray([row['label'] for row in parts[part]])
                            for part in ('train', 'calibration', 'test'))
    estimator = make_pipeline(StandardScaler(), LogisticRegression(C=1, max_iter=2000, random_state=42))
    calibrator = LogisticRegression(C=1, max_iter=2000, random_state=42)
    with threadpool_limits(limits=1), warnings.catch_warnings():
        warnings.simplefilter('error', ConvergenceWarning)
        estimator.fit(x_train, y_train)
        calibrator.fit(estimator.decision_function(x_cal).reshape(-1, 1), y_cal)
    scaler, classifier = estimator.steps[0][1], estimator.steps[1][1]
    slope = float(calibrator.coef_[0, 0])
    raw_coefficients = classifier.coef_[0] / scaler.scale_
    coefficients = slope * raw_coefficients
    intercept = slope * (float(classifier.intercept_[0]) - float(np.dot(raw_coefficients, scaler.mean_)))
    intercept += float(calibrator.intercept_[0])
    model = LogisticModel(tuple(float(value) for value in coefficients), float(intercept), versions[0],
                          provenance, test_end, digest,
                          tuple((float(column.min()), float(column.max())) for column in x_train.T))
    predictions = np.asarray([model.predict(row['features'])['probability'] for row in parts['test']])
    reference = calibrator.predict_proba(estimator.decision_function(x_test).reshape(-1, 1))[:, 1]
    if not np.allclose(predictions, reference, rtol=1e-12, atol=1e-12):
        raise ValueError('exported model predictions differ from training pipeline')
    amounts = [row['amount'] for row in parts['test']]
    baseline = metrics(y_test, np.full(len(y_test), float(y_train.mean())), amounts, True)
    heuristic = metrics(y_test, [row['heuristic_score']/100 for row in parts['test']], amounts, False)
    calibrated = metrics(y_test, predictions, amounts, True)
    quality = {'brier_better_than_constant': calibrated['brier'] < baseline['brier'],
               'log_loss_better_than_constant': calibrated['log_loss'] < baseline['log_loss'],
               'average_precision_not_below_heuristic': calibrated['average_precision'] >= heuristic['average_precision'],
               'calibration_preserves_ranking': slope > 0,
               'all_features_observed_in_training': not any(model.predict(row['features'])['outside_training_range']
                                                           for row in parts['test'])}
    report.update(status='trained', model_id=model.model_id,
                  parameters={'C': 1, 'max_iter': 2000, 'class_weight': None,
                              'standardization': 'fit_on_train_only',
                              'calibration': 'sigmoid_on_separate_period', 'calibration_slope': slope},
                  constant_features=[name for name, values in zip(FEATURES, model.feature_ranges) if values[0] == values[1]],
                  results={'logistic_raw': metrics(y_test, estimator.predict_proba(x_test)[:, 1], amounts, True),
                           'logistic_calibrated': calibrated, 'heuristic': heuristic,
                           'prevalence_baseline': baseline},
                  quality_checks=quality, review_checks_passed=all(quality.values()),
                  test_predictions=[float(value) for value in predictions],
                  reason='candidate saved; production use requires review of real held-out evidence')
    return model, report

import hashlib
import platform
from collections import Counter

from .contracts import FEATURES, TARGET
from .dataset import canonical, labeled, temporal_split


def metrics(labels, scores, amounts, probabilities):
    import numpy as np
    from sklearn.metrics import average_precision_score, brier_score_loss, log_loss, roc_auc_score

    y, p, money = np.asarray(labels), np.asarray(scores), np.asarray(amounts, dtype=float)
    k = min(50, len(y))
    order = np.argsort(-p, kind='stable')[:k]
    baseline = float(y.mean())
    result = {'n': len(y), 'positives': int(y.sum()), 'average_precision': float(average_precision_score(y, p)),
              'roc_auc': float(roc_auc_score(y, p)), 'top_k': k,
              'precision_at_k': float(y[order].mean()),
              'recall_at_k': float(y[order].sum()/y.sum()),
              'lift_at_k': float(y[order].mean()/baseline),
              'observed_nonrenewal_amount': int(sum(int(a)*int(v) for a, v in zip(amounts, labels)))}
    if probabilities:
        predicted = float(np.dot(p, money))
        actual = float(np.dot(y, money))
        result.update(brier=float(brier_score_loss(y, p)), log_loss=float(log_loss(y, p, labels=[0, 1])),
                      predicted_nonrenewal_amount=predicted, aggregate_amount_error=predicted-actual,
                      amount_mae=float(np.mean(np.abs((p-y)*money))))
        bins = []
        for i in range(10):
            mask = (p >= i/10) & ((p < (i+1)/10) if i < 9 else (p <= 1))
            if mask.any():
                bins.append({'lower': i/10, 'upper': (i+1)/10, 'count': int(mask.sum()),
                             'mean_probability': float(p[mask].mean()), 'event_rate': float(y[mask].mean())})
        result['calibration_bins'] = bins
    else:
        result['heuristic_weighted_amount'] = float(np.dot(p, money))
        result['probability_metrics'] = 'not_applicable_to_uncalibrated_heuristic'
    return result


def compare(payload, train_end, calibration_end, test_end, min_rows=30, min_class=5, model_version=None):
    import numpy as np
    import sklearn
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    from threadpoolctl import threadpool_limits

    if model_version is not None:
        payload = dict(payload, observations=[r for r in payload.get('observations', [])
                                              if str(r['model_version']) == str(model_version)])
    rows, excluded = labeled(payload, test_end)
    parts = temporal_split(rows, train_end, calibration_end, test_end)
    report = {'target': TARGET, 'status': 'insufficient_observed_outcomes',
              'excluded': excluded, 'embargoed_or_outside_windows': len(rows)-sum(map(len, parts.values())),
              'split_counts': {k: len(v) for k, v in parts.items()},
              'split_boundaries': {'train_end': train_end, 'calibration_end': calibration_end, 'test_end': test_end},
              'dataset_sha256': hashlib.sha256(canonical(payload).encode()).hexdigest(),
              'runtime': {'python': platform.python_version(), 'sklearn': sklearn.__version__},
              'feature_order': list(FEATURES), 'policy_versions': sorted({str(r['model_version']) for r in rows}),
              'promotion_allowed': False}
    for name, group in parts.items():
        counts = Counter(r['label'] for r in group)
        if len(group) < min_rows or min(counts.get(0, 0), counts.get(1, 0)) < min_class:
            report['reason'] = f'{name}: need at least {min_rows} episodes and {min_class} of each outcome'
            return report
    if len({str(r['model_version']) for r in rows}) != 1:
        report['reason'] = 'compare one model version at a time to avoid changing feature definitions'
        return report
    def array(group):
        return np.asarray([[r['features'][f] for f in FEATURES] for r in group], dtype=float)
    x_train, x_cal, x_test = (array(parts[k]) for k in ('train', 'calibration', 'test'))
    y_train, y_cal, y_test = (np.asarray([r['label'] for r in parts[k]]) for k in ('train', 'calibration', 'test'))
    amounts = [r['amount'] for r in parts['test']]
    results = {'prevalence_baseline': {'raw': metrics(y_test, np.full(len(y_test), y_train.mean()), amounts, True)}}
    with threadpool_limits(limits=1):
        for name, estimator in (
            ('logistic', make_pipeline(StandardScaler(), LogisticRegression(C=1, max_iter=2000, random_state=42))),
            ('boosting', HistGradientBoostingClassifier(max_iter=100, max_leaf_nodes=7, min_samples_leaf=10,
                                                       l2_regularization=1, early_stopping=False, random_state=42)),
            ('heuristic', None),
        ):
            if estimator is None:
                raw_cal = np.asarray([r['heuristic_score']/100 for r in parts['calibration']])
                raw_test = np.asarray([r['heuristic_score']/100 for r in parts['test']])
            else:
                estimator.fit(x_train, y_train)
                raw_cal, raw_test = estimator.predict_proba(x_cal)[:, 1], estimator.predict_proba(x_test)[:, 1]
            results[name] = {'raw': metrics(y_test, raw_test, amounts, estimator is not None)}
            transform = lambda p: np.log(np.clip(p, 1e-6, 1-1e-6)/(1-np.clip(p, 1e-6, 1-1e-6))).reshape(-1, 1)
            calibrator = LogisticRegression(C=1, max_iter=2000, random_state=42)
            calibrator.fit(transform(raw_cal), y_cal)
            calibrated = calibrator.predict_proba(transform(raw_test))[:, 1]
            results[name]['sigmoid_calibrated'] = metrics(y_test, calibrated, amounts, True)
            results[name]['test_predictions'] = [float(v) for v in calibrated]
    report.update(status='evaluated', results=results,
                  probability_calibrated='fitted_on_separate_period_quality_must_be_reviewed',
                  evaluation_scope='future renewals of observed customers; repeated customers may occur across periods',
                  monetary_target='face value of unrenewed first payments, not causal revenue loss',
                  reason='no automatic promotion; compare ranking, calibration bins and money errors on held-out period')
    return report

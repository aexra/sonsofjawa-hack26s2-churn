from decimal import Decimal, ROUND_HALF_UP

from .contracts import TARGET, instant, validate
from .dataset import episode


def predict_batch(model, observations, *, demonstration=False):
    if not isinstance(observations, list):
        raise ValueError('observations must be a JSON array')
    seen = set()
    predictions = []
    accounts = {}
    for raw in observations:
        row = validate(raw)
        key = episode(row)
        if key in seen:
            raise ValueError('duplicate renewal episode; supply one current snapshot per payment')
        seen.add(key)
        if str(row['model_version']) != model.policy_version:
            raise ValueError('prediction feature policy differs from model')
        if instant(row['as_of']) < instant(model.available_from):
            raise ValueError('prediction predates completed model evaluation')
        if model.provenance == 'synthetic' and row['provenance'] != 'synthetic' and not demonstration:
            raise ValueError('demonstration model cannot predict real or unverified records')
        result = model.predict(row['features'])
        probability = result['probability']
        weighted_amount = int((Decimal(row['amount']) * Decimal(str(probability))).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
        predictions.append({key: row[key] for key in ('account_id', 'service_id', 'as_of', 'due_at', 'deadline', 'amount')} | {
            'probability_nonrenewal': probability, 'probability_score': probability * 100,
            'estimated_nonrenewal_amount': weighted_amount, 'amount_unit': 'eurocent',
            'heuristic_score': row['heuristic_score'], 'explanation': result,
            'input_provenance': row['provenance']})
        account = accounts.setdefault(row['account_id'], {'account_id': row['account_id'], 'payments': 0,
                                     'scheduled_amount': 0, 'estimated_nonrenewal_amount': 0,
                                     'weighted_probability_sum': Decimal(0)})
        account['payments'] += 1
        account['scheduled_amount'] += row['amount']
        account['estimated_nonrenewal_amount'] += weighted_amount
        account['weighted_probability_sum'] += Decimal(row['amount']) * Decimal(str(probability))
    for account in accounts.values():
        account['payment_amount_weighted_probability'] = float(account.pop('weighted_probability_sum') / account['scheduled_amount'])
    return {'model_id': model.model_id, 'target': TARGET, 'model_provenance': model.provenance,
            'usage': 'demonstration_only' if model.provenance == 'synthetic' else 'candidate',
            'probability_quality': 'requires_review_of_held_out_evaluation',
            'monetary_target': 'face value of unrenewed first payments, not causal revenue loss',
            'account_probability_semantics': 'amount-weighted payment probabilities, not account churn probability',
            'predictions': predictions, 'accounts': [accounts[key] for key in sorted(accounts)],
            'estimated_nonrenewal_amount': sum(row['estimated_nonrenewal_amount'] for row in predictions),
            'amount_unit': 'eurocent'}

import argparse
import json
import math
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
AS_OF = datetime(2026, 10, 19, 15, 0, tzinfo=timezone.utc)
HORIZON_DAYS = 30
LIVE = ('active', 'suspended', 'prolong_wait')

NOMINAL_DAYS = {'hour': 1 / 24, 'week': 7, 'month': 30, 'quarter_year': 91, 'half_year': 182, 'year': 365}
MODEL_DAYS = {'hour': 1 / 24, 'week': 7, 'month': 30.4375, 'quarter_year': 91.3125, 'half_year': 182.625, 'year': 365.25}
TERM_WEIGHTS = {'week': 8, 'month': 42, 'quarter_year': 30, 'half_year': 10, 'year': 10}
PRICE_RANGE = {
    'hour': (5, 150),
    'week': (200, 2000),
    'month': (500, 6000),
    'quarter_year': (1500, 18000),
    'half_year': (3000, 30000),
    'year': (5000, 50000),
}
HOUR_SHARE = 0.015
FAILURE_RATE = 0.08

SHARES = (
    ('healthy', 35),
    ('expiring_manual', 15),
    ('wait_poor', 10),
    ('wait_funded', 5),
    ('suspended_paying', 8),
    ('auto_underfunded', 10),
    ('history_mixed', 12),
    ('dead', 3),
    ('empty', 2),
)

ACCOUNT_COLUMNS = ('id', 'email', 'balance', 'withdrawBalance', 'totalReplenished', 'bonusBalance', 'bonusState')
SERVICE_COLUMNS = ('id', 'name', 'ownerId', 'paymentTerm', 'autoProlong', 'createdAt', 'expiresAt', 'status', 'price')
TRANSACTION_COLUMNS = ('id', 'amount', 'status', 'performedAt', 'createdAt', 'type', 'serviceId')
TABLES = (
    ('accounts', ACCOUNT_COLUMNS),
    ('services', SERVICE_COLUMNS),
    ('transactions', TRANSACTION_COLUMNS),
)


def timestamp(value):
    return value.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def spec(status, auto, days):
    return {'status': status, 'auto': auto, 'd': days}


def removed(rng, low, high, status='deleted'):
    return spec(status, rng.random() < 0.5, -rng.uniform(low, high))


def waiting(rng):
    return spec('prolong_wait', False, -rng.uniform(0.05, 5))


def far_days(rng):
    roll = rng.random()
    if roll < 0.6:
        return rng.uniform(31, 85)
    if roll < 0.9:
        return rng.uniform(85, 170)
    return rng.uniform(170, 300)


def healthy(rng):
    specs = []
    for _ in range(rng.randint(1, 4)):
        days = far_days(rng) if rng.random() < 0.7 else rng.uniform(1, 29)
        specs.append(spec('active', True, days))
    return specs, 'funded', False


def expiring_manual(rng):
    specs = [spec('active', False, rng.uniform(1, 14) if rng.random() < 0.7 else rng.uniform(14, 29))]
    for _ in range(rng.randint(0, 2)):
        specs.append(spec('active', rng.random() < 0.6, far_days(rng)))
    if rng.random() < 0.4:
        specs.append(removed(rng, 5, 95))
    return specs, 'poor', rng.random() < 0.5


def wait_poor(rng):
    return [waiting(rng) for _ in range(rng.randint(1, 3))], 'poor', rng.random() < 0.3


def wait_funded(rng):
    specs = [waiting(rng)]
    if rng.random() < 0.5:
        for _ in range(rng.randint(1, 3)):
            specs.append(spec('active', True, far_days(rng)))
    return specs, 'funded', False


def suspended_paying(rng):
    specs = []
    for _ in range(rng.randint(1, 3)):
        if rng.random() < 0.6:
            specs.append(spec('suspended', True, rng.uniform(5, 60)))
        else:
            specs.append(spec('suspended', False, rng.uniform(5, 29)))
    return specs, 'funded', False


def auto_underfunded(rng):
    specs = [spec('active', True, rng.uniform(1, 29)) for _ in range(rng.randint(1, 3))]
    if rng.random() < 0.6:
        specs.append(removed(rng, 5, 95))
    return specs, 'poor', True


def history_mixed(rng):
    specs = [removed(rng, 5, 95) for _ in range(rng.randint(1, 2))]
    for _ in range(rng.randint(1, 3)):
        kind = rng.choices(('healthy', 'manual', 'wait', 'suspended'), (4, 3, 2, 1))[0]
        if kind == 'healthy':
            specs.append(spec('active', True, far_days(rng)))
        elif kind == 'manual':
            specs.append(spec('active', False, rng.uniform(1, 25)))
        elif kind == 'wait':
            specs.append(waiting(rng))
        else:
            specs.append(spec('suspended', True, rng.uniform(5, 60)))
    return specs, 'mid', False


def dead(rng):
    specs = [
        removed(rng, 10, 400, rng.choice(('deleted', 'blocked')))
        for _ in range(rng.randint(1, 3))
    ]
    return specs, 'mid', False


def empty(rng):
    return [], 'mid', False


BUILDERS = {
    'healthy': healthy,
    'expiring_manual': expiring_manual,
    'wait_poor': wait_poor,
    'wait_funded': wait_funded,
    'suspended_paying': suspended_paying,
    'auto_underfunded': auto_underfunded,
    'history_mixed': history_mixed,
    'dead': dead,
    'empty': empty,
}


def allocate(total):
    weight = sum(share for _, share in SHARES)
    exact = [(name, total * share / weight) for name, share in SHARES]
    counts = {name: math.floor(value) for name, value in exact}
    rest = total - sum(counts.values())
    order = sorted(exact, key=lambda item: item[1] - math.floor(item[1]), reverse=True)
    for name, _ in order[:rest]:
        counts[name] += 1
    return counts


def round_minute(value):
    return value.replace(second=0, microsecond=0)


def build_service(rng, item):
    status = item['status']
    days = item['d']
    term = None
    if status in LIVE and rng.random() < HOUR_SHARE:
        term = 'hour'
        if days > 0:
            days = rng.uniform(0.004, 0.04)
    if term is None:
        if days > 0:
            options = [(name, weight) for name, weight in TERM_WEIGHTS.items() if NOMINAL_DAYS[name] >= days]
        else:
            options = list(TERM_WEIGHTS.items())
        term = rng.choices([name for name, _ in options], [weight for _, weight in options])[0]
    expires = round_minute(AS_OF + timedelta(days=days))
    period = timedelta(days=NOMINAL_DAYS[term])
    prolongs = rng.randint(0, 3 if term == 'hour' else 6)
    created = expires - period * (prolongs + 1)
    low, high = PRICE_RANGE[term]
    price = rng.randint(low, high)
    events = [('order', created)]
    for index in range(1, prolongs + 1):
        events.append(('prolong', created + period * index))
    transactions = []
    for kind, moment in events:
        failed = kind == 'prolong' and rng.random() < FAILURE_RATE
        transactions.append(transaction(rng, kind, moment, failed))
    if status == 'prolong_wait':
        attempt = min(expires + timedelta(seconds=rng.randint(1, 300)), AS_OF)
        transactions.append(transaction(rng, 'prolong', attempt, True))
    need = 0
    if status in LIVE:
        remaining = 0 if status == 'prolong_wait' else max(0, (expires - AS_OF).total_seconds() / 86400)
        if remaining <= HORIZON_DAYS:
            need = price * (1 + math.floor((HORIZON_DAYS - remaining) / MODEL_DAYS[term]))
    row = {
        'paymentTerm': term,
        'autoProlong': item['auto'],
        'createdAt': timestamp(created),
        'expiresAt': timestamp(expires),
        'status': status,
        'price': price,
    }
    return row, transactions, need


def transaction(rng, kind, moment, failed):
    performed = None
    if not failed:
        performed = timestamp(min(moment + timedelta(seconds=rng.randint(1, 300)), AS_OF))
    return {
        'amount': rng.randint(0, 1000),
        'status': 'not_performed' if failed else 'performed',
        'performedAt': performed,
        'createdAt': timestamp(moment),
        'type': kind,
    }


def funds(rng, mode, need):
    if mode == 'funded':
        return max(round(need * rng.uniform(1.1, 3)), rng.randint(5000, 80000))
    if mode == 'poor':
        if need == 0:
            return rng.randint(0, 3000)
        return round(need * rng.uniform(0, 0.15))
    if need == 0:
        return rng.randint(0, 150000)
    return round(need * rng.uniform(0.3, 1.2))


def build_account(rng, account_id, mode, need):
    total = funds(rng, mode, need)
    if rng.random() < 0.3:
        state = 'unlocked'
        bonus = round(total * rng.uniform(0, 0.3))
        balance = total - bonus
    else:
        state = 'locked'
        bonus = rng.randint(0, 5000)
        balance = total
    withdraw = round(balance * rng.uniform(0, 0.4))
    replenished = total + rng.randint(5000, 400000)
    roll = rng.random()
    if roll < 0.03:
        withdraw = balance + rng.randint(1, 5000)
    elif roll < 0.06:
        replenished = max(0, balance - rng.randint(1, 5000))
    return {
        'id': account_id,
        'email': f'client-{account_id:04d}@example.test',
        'balance': balance,
        'withdrawBalance': withdraw,
        'totalReplenished': replenished,
        'bonusBalance': bonus,
        'bonusState': state,
    }


def reference_data(path):
    data = json.loads(Path(path).read_text())
    return {name: [dict(row) for row in data[name]] for name, _ in TABLES}


def generate(seed=42, accounts=300, reference=None):
    if reference is None:
        reference = HERE.parent / 'seeds' / 'tmplt' / 'data.json'
    data = reference_data(reference)
    rng = random.Random(seed)
    labels = {row['id']: 'reference' for row in data['accounts']}
    names = []
    for name, count in allocate(accounts).items():
        names.extend([name] * count)
    rng.shuffle(names)
    account_id = max(row['id'] for row in data['accounts'])
    service_id = max(row['id'] for row in data['services'])
    transaction_id = max(row['id'] for row in data['transactions'])
    for name in names:
        account_id += 1
        labels[account_id] = name
        specs, mode, failures = BUILDERS[name](rng)
        built = [build_service(rng, item) for item in specs]
        need = sum(item[2] for item in built)
        data['accounts'].append(build_account(rng, account_id, mode, need))
        live_ids = []
        for index, (row, transactions, _) in enumerate(built, start=1):
            service_id += 1
            data['services'].append({
                'id': service_id,
                'name': f'vps-{account_id:04d}-{index}',
                'ownerId': account_id,
                **row,
            })
            if row['status'] in LIVE:
                live_ids.append(service_id)
            for item in transactions:
                transaction_id += 1
                data['transactions'].append({'id': transaction_id, **item, 'serviceId': service_id})
        if failures and live_ids:
            for _ in range(rng.randint(2, 3)):
                transaction_id += 1
                moment = AS_OF - timedelta(days=rng.uniform(2, 25))
                data['transactions'].append({
                    'id': transaction_id,
                    **transaction(rng, 'prolong', round_minute(moment), True),
                    'serviceId': live_ids[0],
                })
    return data, labels


def ordered(data):
    return {
        name: [{column: row[column] for column in columns} for row in data[name]]
        for name, columns in TABLES
    }


def render_json(data):
    return json.dumps(ordered(data), indent=2) + '\n'


def render_sql(data):
    rows = ordered(data)
    parts = [
        'BEGIN;\n',
        'LOCK TABLE public.accounts, public.services, public.transactions IN EXCLUSIVE MODE;\n',
        "DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.accounts) OR EXISTS (SELECT 1 FROM public.services) "
        "OR EXISTS (SELECT 1 FROM public.transactions) THEN RAISE EXCEPTION "
        "'Seed requires empty accounts, services and transactions tables'; END IF; END $$;\n",
    ]
    for name, columns in TABLES:
        quoted = ', '.join(f'"{column}"' for column in columns)
        tag = f'$fixture_{name}$'
        parts.append(
            f'INSERT INTO public.{name} ({quoted})\n'
            f'SELECT {quoted} FROM jsonb_populate_recordset(NULL::public.{name}, '
            f'{tag}{json.dumps(rows[name], indent=2)}{tag}::jsonb);\n'
        )
        parts.append(
            f"SELECT setval(pg_get_serial_sequence('public.{name}', 'id'), "
            f'(SELECT max(id) FROM public.{name}), true);\n'
        )
    parts.append('COMMIT;\n')
    return '\n'.join(parts)


def summary(data, labels):
    generated = [name for name in labels.values() if name != 'reference']
    lines = [f'accounts: {len(data["accounts"])} ({len(generated)} generated)']
    for name, _ in SHARES:
        count = generated.count(name)
        share = 100 * count / len(generated) if generated else 0
        lines.append(f'  {name}: {count} ({share:.1f}%)')
    hours = sum(1 for row in data['services'] if row['paymentTerm'] == 'hour')
    failed = sum(1 for row in data['transactions'] if row['status'] == 'not_performed')
    lines.append(f'services: {len(data["services"])}, hour: {100 * hours / len(data["services"]):.1f}%')
    lines.append(f'transactions: {len(data["transactions"])}, not_performed: {100 * failed / len(data["transactions"]):.1f}%')
    return '\n'.join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description='generate the extended demo dataset')
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--accounts', type=int, default=300)
    parser.add_argument('--reference', type=Path, default=HERE.parent / 'seeds' / 'tmplt' / 'data.json')
    parser.add_argument('--out', type=Path, default=HERE.parent / 'seeds' / 'demo')
    args = parser.parse_args(argv)
    if args.accounts < 1:
        parser.error('--accounts must be positive')
    data, labels = generate(args.seed, args.accounts, args.reference)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / 'data.json').write_text(render_json(data))
    (args.out / '002_seed.sql').write_text(render_sql(data))
    print(summary(data, labels))
    return 0


if __name__ == '__main__':
    sys.exit(main())

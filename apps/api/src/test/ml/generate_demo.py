import argparse
import json
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path


HERE = Path(__file__).resolve().parent
AS_OF = '2026-10-19T15:00:00Z'


def timestamp(value):
    return value.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def generate_demo(accounts=80, seed=42, as_of=AS_OF):
    data = json.loads((HERE / 'fixtures/organizer.json').read_text())
    if not isinstance(accounts, int) or isinstance(accounts, bool) or accounts < len(data['accounts']):
        raise ValueError('account count must preserve all organizer accounts')
    if not isinstance(seed, int) or isinstance(seed, bool):
        raise ValueError('seed must be an integer')
    if not isinstance(as_of, str):
        raise ValueError('as_of must be an ISO timestamp with a timezone')
    now = datetime.fromisoformat(as_of.replace('Z', '+00:00'))
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError('as_of must include a timezone')
    now = now.astimezone(timezone.utc)
    rng = random.Random(seed)
    account_id = max(row['id'] for row in data['accounts']) + 1
    service_id = max(row['id'] for row in data['services']) + 1
    transaction_id = max(row['id'] for row in data['transactions']) + 1
    modes = ['low', 'medium', 'high', 'no_services', 'no_live_services', 'suspended', 'payment_overdue']
    for index in range(accounts - len(data['accounts'])):
        mode = modes[index % len(modes)]
        price = rng.randint(500, 5000)
        balance = price * 4 if mode in ('low', 'suspended', 'payment_overdue') else 0
        data['accounts'].append({
            'id': account_id,
            'email': f'demo-{account_id:04d}@example.test',
            'balance': balance,
            'withdrawBalance': rng.randint(0, price),
            'totalReplenished': balance + price * 10,
            'bonusBalance': price if mode == 'low' else 0,
            'bonusState': 'unlocked' if mode == 'low' else 'locked',
        })
        if mode != 'no_services':
            status = {'high':'prolong_wait', 'no_live_services':'deleted', 'suspended':'suspended'}.get(mode, 'active')
            expiry = now + timedelta(days=10)
            if mode == 'medium':
                expiry = now + timedelta(hours=12)
            elif mode == 'high':
                expiry = now - timedelta(days=1)
            elif mode == 'no_live_services':
                expiry = now - timedelta(days=10)
            data['services'].append({
                'id': service_id,
                'name': f'demo-{service_id:04d}',
                'ownerId': account_id,
                'paymentTerm': ['month','week','year'][index % 3],
                'autoProlong': mode in ('low','suspended','payment_overdue'),
                'createdAt': timestamp(now - timedelta(days=60)),
                'expiresAt': timestamp(expiry),
                'status': status,
                'price': price,
            })
            if mode == 'payment_overdue':
                for completed in [False, False, True]:
                    created = now - timedelta(hours=48)
                    data['transactions'].append({
                        'id': transaction_id,
                        'amount': min(price, 1000),
                        'status': 'performed' if completed else 'not_performed',
                        'performedAt': timestamp(created + timedelta(hours=1)) if completed else None,
                        'createdAt': timestamp(created),
                        'type': 'prolong',
                        'serviceId': service_id,
                    })
                    transaction_id += 1
            service_id += 1
        account_id += 1
    return data


def write_demo(data, destination):
    path = Path(destination).resolve()
    if not path.is_relative_to(HERE):
        raise ValueError('demo output must stay inside the ML directory')
    with path.open('x', encoding='utf-8') as stream:
        stream.write(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser(description='Extend the organizer fixture with deterministic synthetic ML scenarios')
    parser.add_argument('--accounts', type=int, default=80)
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--as-of', default=AS_OF)
    parser.add_argument('--out', type=Path)
    args = parser.parse_args()
    try:
        data = generate_demo(args.accounts, args.seed, args.as_of)
        if args.out is None:
            print(json.dumps(data, ensure_ascii=False, indent=2))
        else:
            write_demo(data, args.out)
    except (ValueError, OSError) as error:
        parser.error(str(error))


if __name__ == '__main__':
    main()

from __future__ import annotations

import math
import random
from datetime import datetime, timedelta, timezone
from typing import Any

HORIZON_DAYS = 30
LIVE = ("active", "suspended", "prolong_wait")

NOMINAL_DAYS = {
    "hour": 1 / 24,
    "week": 7,
    "month": 30,
    "quarter_year": 91,
    "half_year": 182,
    "year": 365,
}
MODEL_DAYS = {
    "hour": 1 / 24,
    "week": 7,
    "month": 30.4375,
    "quarter_year": 91.3125,
    "half_year": 182.625,
    "year": 365.25,
}
TERM_WEIGHTS = {
    "week": 8,
    "month": 42,
    "quarter_year": 30,
    "half_year": 10,
    "year": 10,
}
PRICE_RANGE = {
    "hour": (5, 150),
    "week": (200, 2000),
    "month": (500, 6000),
    "quarter_year": (1500, 18000),
    "half_year": (3000, 30000),
    "year": (5000, 50000),
}
HOUR_SHARE = 0.015
FAILURE_RATE = 0.08

SCENARIO_WEIGHTS = (
    ("healthy", 35),
    ("expiring_manual", 15),
    ("wait_poor", 10),
    ("wait_funded", 5),
    ("suspended_paying", 8),
    ("auto_underfunded", 10),
    ("history_mixed", 12),
    ("dead", 3),
    ("empty", 2),
)


def ensure_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def round_minute(value: datetime) -> datetime:
    return value.replace(second=0, microsecond=0)


def spec(status: str, auto: bool, days: float) -> dict[str, Any]:
    return {"status": status, "auto": auto, "d": days}


def removed(rng: random.Random, low: float, high: float, status: str = "deleted"):
    return spec(status, rng.random() < 0.5, -rng.uniform(low, high))


def waiting(rng: random.Random):
    return spec("prolong_wait", False, -rng.uniform(0.05, 5))


def far_days(rng: random.Random) -> float:
    roll = rng.random()
    if roll < 0.6:
        return rng.uniform(31, 85)
    if roll < 0.9:
        return rng.uniform(85, 170)
    return rng.uniform(170, 300)


def healthy(rng: random.Random):
    specs = []
    for _ in range(rng.randint(1, 4)):
        days = far_days(rng) if rng.random() < 0.7 else rng.uniform(1, 29)
        specs.append(spec("active", True, days))
    return specs, "funded", False


def expiring_manual(rng: random.Random):
    specs = [
        spec(
            "active",
            False,
            rng.uniform(1, 14) if rng.random() < 0.7 else rng.uniform(14, 29),
        )
    ]
    for _ in range(rng.randint(0, 2)):
        specs.append(spec("active", rng.random() < 0.6, far_days(rng)))
    if rng.random() < 0.4:
        specs.append(removed(rng, 5, 95))
    return specs, "poor", rng.random() < 0.5


def wait_poor(rng: random.Random):
    return [waiting(rng) for _ in range(rng.randint(1, 3))], "poor", rng.random() < 0.3


def wait_funded(rng: random.Random):
    specs = [waiting(rng)]
    if rng.random() < 0.5:
        for _ in range(rng.randint(1, 3)):
            specs.append(spec("active", True, far_days(rng)))
    return specs, "funded", False


def suspended_paying(rng: random.Random):
    specs = []
    for _ in range(rng.randint(1, 3)):
        if rng.random() < 0.6:
            specs.append(spec("suspended", True, rng.uniform(5, 60)))
        else:
            specs.append(spec("suspended", False, rng.uniform(5, 29)))
    return specs, "funded", False


def auto_underfunded(rng: random.Random):
    specs = [
        spec("active", True, rng.uniform(1, 29)) for _ in range(rng.randint(1, 3))
    ]
    if rng.random() < 0.6:
        specs.append(removed(rng, 5, 95))
    return specs, "poor", True


def history_mixed(rng: random.Random):
    specs = [removed(rng, 5, 95) for _ in range(rng.randint(1, 2))]
    for _ in range(rng.randint(1, 3)):
        kind = rng.choices(("healthy", "manual", "wait", "suspended"), (4, 3, 2, 1))[0]
        if kind == "healthy":
            specs.append(spec("active", True, far_days(rng)))
        elif kind == "manual":
            specs.append(spec("active", False, rng.uniform(1, 25)))
        elif kind == "wait":
            specs.append(waiting(rng))
        else:
            specs.append(spec("suspended", True, rng.uniform(5, 60)))
    return specs, "mid", False


def dead(rng: random.Random):
    specs = [
        removed(rng, 10, 400, rng.choice(("deleted", "blocked")))
        for _ in range(rng.randint(1, 3))
    ]
    return specs, "mid", False


def empty(rng: random.Random):
    return [], "mid", False


BUILDERS = {
    "healthy": healthy,
    "expiring_manual": expiring_manual,
    "wait_poor": wait_poor,
    "wait_funded": wait_funded,
    "suspended_paying": suspended_paying,
    "auto_underfunded": auto_underfunded,
    "history_mixed": history_mixed,
    "dead": dead,
    "empty": empty,
}


def pick_scenario(rng: random.Random) -> str:
    names = [name for name, _ in SCENARIO_WEIGHTS]
    weights = [weight for _, weight in SCENARIO_WEIGHTS]
    return rng.choices(names, weights)[0]


def build_transaction(
    rng: random.Random,
    kind: str,
    moment: datetime,
    failed: bool,
    as_of: datetime,
) -> dict[str, Any]:
    as_of = ensure_aware(as_of)
    moment = ensure_aware(moment)
    performed = None
    if not failed:
        performed = min(moment + timedelta(seconds=rng.randint(1, 300)), as_of)
    return {
        "amount": rng.randint(0, 1000),
        "status": "not_performed" if failed else "performed",
        "performedAt": performed,
        "createdAt": moment,
        "type": kind,
    }


def build_service(
    rng: random.Random,
    item: dict[str, Any],
    as_of: datetime,
) -> tuple[dict[str, Any], list[dict[str, Any]], int]:
    as_of = ensure_aware(as_of)
    status = item["status"]
    days = float(item["d"])
    term = None
    if status in LIVE and rng.random() < HOUR_SHARE:
        term = "hour"
        if days > 0:
            days = rng.uniform(0.004, 0.04)
    if term is None:
        if days > 0:
            options = [
                (name, weight)
                for name, weight in TERM_WEIGHTS.items()
                if NOMINAL_DAYS[name] >= days
            ]
            if not options:
                options = list(TERM_WEIGHTS.items())
        else:
            options = list(TERM_WEIGHTS.items())
        term = rng.choices(
            [name for name, _ in options], [weight for _, weight in options]
        )[0]
    expires = round_minute(as_of + timedelta(days=days))
    period = timedelta(days=NOMINAL_DAYS[term])
    prolongs = rng.randint(0, 3 if term == "hour" else 6)
    created = expires - period * (prolongs + 1)
    low, high = PRICE_RANGE[term]
    price = rng.randint(low, high)
    events = [("order", created)]
    for index in range(1, prolongs + 1):
        events.append(("prolong", created + period * index))
    transactions = []
    for kind, moment in events:
        failed = kind == "prolong" and rng.random() < FAILURE_RATE
        transactions.append(build_transaction(rng, kind, moment, failed, as_of))
    if status == "prolong_wait":
        attempt = min(expires + timedelta(seconds=rng.randint(1, 300)), as_of)
        transactions.append(build_transaction(rng, "prolong", attempt, True, as_of))
    need = 0
    if status in LIVE:
        remaining = (
            0
            if status == "prolong_wait"
            else max(0, (expires - as_of).total_seconds() / 86400)
        )
        if remaining <= HORIZON_DAYS:
            need = price * (
                1 + math.floor((HORIZON_DAYS - remaining) / MODEL_DAYS[term])
            )
    row = {
        "paymentTerm": term,
        "autoProlong": bool(item["auto"]),
        "createdAt": created,
        "expiresAt": expires,
        "status": status,
        "price": price,
    }
    return row, transactions, need


def funds(rng: random.Random, mode: str, need: int) -> int:
    if mode == "funded":
        return max(round(need * rng.uniform(1.1, 3)), rng.randint(5000, 80000))
    if mode == "poor":
        if need == 0:
            return rng.randint(0, 3000)
        return round(need * rng.uniform(0, 0.15))
    if need == 0:
        return rng.randint(0, 150000)
    return round(need * rng.uniform(0.3, 1.2))


def build_account_fields(rng: random.Random, mode: str, need: int) -> dict[str, Any]:
    total = funds(rng, mode, need)
    if rng.random() < 0.3:
        state = "unlocked"
        bonus = round(total * rng.uniform(0, 0.3))
        balance = total - bonus
    else:
        state = "locked"
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
        "balance": int(balance),
        "withdrawBalance": int(withdraw),
        "totalReplenished": int(replenished),
        "bonusBalance": int(bonus),
        "bonusState": state,
    }


def build_account_packet(
    rng: random.Random,
    as_of: datetime,
    *,
    email: str,
    name_prefix: str,
    scenario: str | None = None,
) -> dict[str, Any]:
    as_of = ensure_aware(as_of)
    scenario = scenario or pick_scenario(rng)
    specs, mode, extra_failures = BUILDERS[scenario](rng)
    built = [build_service(rng, item, as_of) for item in specs]
    need = sum(item[2] for item in built)
    account = build_account_fields(rng, mode, need)
    account["email"] = email
    services: list[dict[str, Any]] = []
    transactions: list[dict[str, Any]] = []
    live_indexes: list[int] = []
    for index, (row, txs, _) in enumerate(built, start=1):
        service = {
            "name": f"{name_prefix}-{index}",
            **row,
        }
        services.append(service)
        if row["status"] in LIVE:
            live_indexes.append(index - 1)
        for tx in txs:
            transactions.append({**tx, "_service_index": index - 1})
    if extra_failures and live_indexes:
        for _ in range(rng.randint(2, 3)):
            moment = as_of - timedelta(days=rng.uniform(2, 25))
            transactions.append(
                {
                    **build_transaction(
                        rng, "prolong", round_minute(moment), True, as_of
                    ),
                    "_service_index": live_indexes[0],
                }
            )
    return {
        "scenario": scenario,
        "account": account,
        "services": services,
        "transactions": transactions,
    }


def build_standalone_service(
    rng: random.Random,
    as_of: datetime,
    *,
    name: str,
    owner_id: int,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    as_of = ensure_aware(as_of)
    if rng.random() < 0.55:
        item = spec("active", True, far_days(rng) if rng.random() < 0.6 else rng.uniform(1, 29))
    elif rng.random() < 0.5:
        item = spec("active", False, rng.uniform(1, 29))
    else:
        item = spec("suspended", True, rng.uniform(5, 60))
    row, txs, _ = build_service(rng, item, as_of)
    service = {"name": name, "ownerId": owner_id, **row}
    return service, txs


def build_prolong_event(
    rng: random.Random,
    as_of: datetime,
    *,
    service_id: int,
    status: str,
) -> tuple[dict[str, Any], str | None]:
    as_of = ensure_aware(as_of)
    failed = rng.random() < FAILURE_RATE
    new_status = None
    if failed and status in ("active", "suspended") and rng.random() < 0.35:
        new_status = "prolong_wait"
        failed = True
    offset = timedelta(seconds=rng.randint(0, 3600))
    moment = as_of - offset
    tx = {
        **build_transaction(rng, "prolong", moment, failed, as_of),
        "serviceId": service_id,
    }
    return tx, new_status

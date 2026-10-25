from __future__ import annotations

import logging
import random
import time
from typing import Any

from lib.builders import (
    LIVE,
    build_account_packet,
    build_prolong_event,
    build_standalone_service,
    ensure_aware,
)
from lib.db import CONNECTION_ID, cursor

logger = logging.getLogger(__name__)


def _fetch_ids(cur, sql: str, args: tuple = ()) -> list[int]:
    cur.execute(sql, args)
    return [int(row[0]) for row in cur.fetchall()]


def _fetch_live_services(cur) -> list[tuple[int, str]]:
    cur.execute(
        """
        SELECT id, status FROM public.services
        WHERE status = ANY(%s)
        """,
        (list(LIVE),),
    )
    return [(int(row[0]), str(row[1])) for row in cur.fetchall()]


def _model_now(cur):
    cur.execute("SELECT public.model_now()")
    return ensure_aware(cur.fetchone()[0])


def _insert_account(cur, account: dict[str, Any]) -> int:
    cur.execute(
        """
        INSERT INTO public.accounts (
            email, balance, "withdrawBalance", "totalReplenished",
            "bonusBalance", "bonusState"
        ) VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            account["email"],
            account["balance"],
            account["withdrawBalance"],
            account["totalReplenished"],
            account["bonusBalance"],
            account["bonusState"],
        ),
    )
    return int(cur.fetchone()[0])


def _insert_service(cur, service: dict[str, Any]) -> int:
    cur.execute(
        """
        INSERT INTO public.services (
            name, "ownerId", "paymentTerm", "autoProlong",
            "createdAt", "expiresAt", status, price
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            service["name"],
            service["ownerId"],
            service["paymentTerm"],
            service["autoProlong"],
            service["createdAt"],
            service["expiresAt"],
            service["status"],
            service["price"],
        ),
    )
    return int(cur.fetchone()[0])


def _insert_transaction(cur, tx: dict[str, Any]) -> int:
    cur.execute(
        """
        INSERT INTO public.transactions (
            amount, status, "performedAt", "createdAt", type, "serviceId"
        ) VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            tx["amount"],
            tx["status"],
            tx["performedAt"],
            tx["createdAt"],
            tx["type"],
            tx["serviceId"],
        ),
    )
    return int(cur.fetchone()[0])


def _apply_account_packet(
    cur,
    packet: dict[str, Any],
) -> tuple[int, list[int], list[int]]:
    account_id = _insert_account(cur, packet["account"])
    service_ids: list[int] = []
    for service in packet["services"]:
        row = {**service, "ownerId": account_id}
        service_ids.append(_insert_service(cur, row))
    tx_ids: list[int] = []
    for tx in packet["transactions"]:
        idx = tx["_service_index"]
        row = {k: v for k, v in tx.items() if k != "_service_index"}
        row["serviceId"] = service_ids[idx]
        tx_ids.append(_insert_transaction(cur, row))
    return account_id, service_ids, tx_ids


def run_feed(
    counts: dict[str, int],
    *,
    conn_id: str = CONNECTION_ID,
    seed: int | None = None,
) -> dict[str, Any]:
    """
    Incremental demo feed aligned with ops/scripts/generate_demo.py.

    Budget meaning:
    - accounts: new scenario account packets
    - services: standalone services on existing owners
    - transactions: prolong events on live services
    Bundled services/txs inside a new-account packet do not consume
    services/transactions budget.
    """
    rng = random.Random(seed)
    stamp = str(int(time.time())) if seed is None else str(seed)

    new_account_ids: list[int] = []
    new_service_ids: list[int] = []
    new_tx_ids: list[int] = []
    scenarios: list[str] = []
    prolong_status_updates = 0

    with cursor(conn_id) as cur:
        as_of = _model_now(cur)
        existing_accounts = _fetch_ids(cur, "SELECT id FROM public.accounts")

        for i in range(counts["accounts"]):
            packet = build_account_packet(
                rng,
                as_of,
                email=f"feed-{stamp}-{i}@example.test",
                name_prefix=f"vps-feed-{stamp}-{i}",
            )
            account_id, svc_ids, tx_ids = _apply_account_packet(cur, packet)
            new_account_ids.append(account_id)
            new_service_ids.extend(svc_ids)
            new_tx_ids.extend(tx_ids)
            scenarios.append(packet["scenario"])

        owner_pool = existing_accounts + new_account_ids
        for i in range(counts["services"]):
            if not owner_pool:
                raise RuntimeError(
                    "cannot create services: no accounts in database "
                    "(raise accounts_* or seed first)"
                )
            owner_id = rng.choice(owner_pool)
            service, txs = build_standalone_service(
                rng,
                as_of,
                name=f"vps-feed-{stamp}-x{i}",
                owner_id=owner_id,
            )
            service_id = _insert_service(cur, service)
            new_service_ids.append(service_id)
            for tx in txs:
                new_tx_ids.append(
                    _insert_transaction(cur, {**tx, "serviceId": service_id})
                )

        live = _fetch_live_services(cur)
        if counts["transactions"] > 0 and not live:
            raise RuntimeError(
                "cannot create prolong events: no live services "
                "(raise services_* / accounts_* or seed first)"
            )
        for _ in range(counts["transactions"]):
            service_id, status = rng.choice(live)
            tx, new_status = build_prolong_event(
                rng, as_of, service_id=service_id, status=status
            )
            new_tx_ids.append(_insert_transaction(cur, tx))
            if new_status is not None:
                cur.execute(
                    "UPDATE public.services SET status = %s WHERE id = %s",
                    (new_status, service_id),
                )
                prolong_status_updates += 1
                live = [
                    (sid, new_status if sid == service_id else st)
                    for sid, st in live
                ]

    stats = {
        "accounts": len(new_account_ids),
        "services": len(new_service_ids),
        "transactions": len(new_tx_ids),
        "account_ids": new_account_ids,
        "service_ids": new_service_ids,
        "transaction_ids": new_tx_ids[:20],
        "transaction_ids_truncated": len(new_tx_ids) > 20,
        "scenarios": scenarios,
        "prolong_status_updates": prolong_status_updates,
        "seed": seed,
    }
    logger.info(
        "churn feed: accounts=%s services=%s transactions=%s scenarios=%s",
        stats["accounts"],
        stats["services"],
        stats["transactions"],
        scenarios,
    )
    return stats

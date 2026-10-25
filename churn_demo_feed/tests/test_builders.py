"""Unit tests for incremental feed builders (no Postgres / Airflow)."""

from __future__ import annotations

import random
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

_DAG_DIR = Path(__file__).resolve().parents[1]
if str(_DAG_DIR) not in sys.path:
    sys.path.insert(0, str(_DAG_DIR))

from lib.builders import (  # noqa: E402
    NOMINAL_DAYS,
    PRICE_RANGE,
    build_account_packet,
    build_prolong_event,
    build_service,
    build_standalone_service,
    build_transaction,
    spec,
)

AS_OF = datetime(2026, 10, 19, 15, 0, tzinfo=timezone.utc)


class BuildersTest(unittest.TestCase):
    def test_service_dates_and_price_range(self):
        rng = random.Random(42)
        for _ in range(40):
            item = spec("active", True, rng.uniform(1, 29))
            row, txs, _ = build_service(rng, item, AS_OF)
            self.assertGreaterEqual(row["expiresAt"], row["createdAt"])
            low, high = PRICE_RANGE[row["paymentTerm"]]
            self.assertGreaterEqual(row["price"], low)
            self.assertLessEqual(row["price"], high)
            period = timedelta(days=NOMINAL_DAYS[row["paymentTerm"]])
            # created + N periods == expires (within float noise on hour)
            delta = row["expiresAt"] - row["createdAt"]
            periods = delta / period
            self.assertAlmostEqual(periods, round(periods), places=6)
            self.assertGreaterEqual(round(periods), 1)

    def test_transaction_performed_at_rules(self):
        rng = random.Random(7)
        ok = build_transaction(rng, "prolong", AS_OF - timedelta(hours=1), False, AS_OF)
        self.assertEqual(ok["status"], "performed")
        self.assertIsNotNone(ok["performedAt"])
        self.assertGreaterEqual(ok["performedAt"], ok["createdAt"])
        self.assertLessEqual(ok["performedAt"], AS_OF)

        fail = build_transaction(rng, "prolong", AS_OF, True, AS_OF)
        self.assertEqual(fail["status"], "not_performed")
        self.assertIsNone(fail["performedAt"])
        self.assertGreaterEqual(fail["amount"], 0)
        self.assertLessEqual(fail["amount"], 1000)

    def test_expiring_manual_packet(self):
        rng = random.Random(99)
        packet = build_account_packet(
            rng,
            AS_OF,
            email="feed-test@example.test",
            name_prefix="vps-test",
            scenario="expiring_manual",
        )
        self.assertEqual(packet["scenario"], "expiring_manual")
        live = [s for s in packet["services"] if s["status"] == "active" and not s["autoProlong"]]
        self.assertTrue(live)
        primary = live[0]
        days = (primary["expiresAt"] - AS_OF).total_seconds() / 86400
        self.assertGreaterEqual(days, 1)
        self.assertLessEqual(days, 29)

    def test_deterministic_with_seed(self):
        a = build_account_packet(
            random.Random(123),
            AS_OF,
            email="a@example.test",
            name_prefix="vps-a",
            scenario="healthy",
        )
        b = build_account_packet(
            random.Random(123),
            AS_OF,
            email="a@example.test",
            name_prefix="vps-a",
            scenario="healthy",
        )
        self.assertEqual(a["account"], b["account"])
        self.assertEqual(
            [(s["paymentTerm"], s["price"], s["status"], s["expiresAt"]) for s in a["services"]],
            [(s["paymentTerm"], s["price"], s["status"], s["expiresAt"]) for s in b["services"]],
        )

    def test_standalone_and_prolong(self):
        rng = random.Random(5)
        service, txs = build_standalone_service(
            rng, AS_OF, name="vps-x-1", owner_id=1
        )
        self.assertEqual(service["ownerId"], 1)
        self.assertGreaterEqual(service["expiresAt"], service["createdAt"])
        self.assertTrue(txs)
        self.assertEqual(txs[0]["type"], "order")

        tx, new_status = build_prolong_event(
            rng, AS_OF, service_id=10, status="active"
        )
        self.assertEqual(tx["serviceId"], 10)
        self.assertEqual(tx["type"], "prolong")
        if tx["status"] == "not_performed":
            self.assertIsNone(tx["performedAt"])
        else:
            self.assertIsNotNone(tx["performedAt"])
        if new_status is not None:
            self.assertEqual(new_status, "prolong_wait")
            self.assertEqual(tx["status"], "not_performed")


if __name__ == "__main__":
    unittest.main()

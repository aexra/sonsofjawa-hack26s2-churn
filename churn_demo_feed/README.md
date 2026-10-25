# churn_demo_feed

Every-5-minutes incremental feed into the churn Postgres DB.

Semantics follow `ops/scripts/generate_demo.py` (risk scenarios, term-aligned `expiresAt`, term price ranges, lifecycle `order`/`prolong`). This is **not** a copy of the organizers' `tmplt/generate.py` fixture generator.

## Events

| Budget param | Meaning |
|---|---|
| `accounts_*` | New **scenario account packets** (account + coherent services + history txs). Scenarios weighted like `generate_demo.py` (`healthy`, `expiring_manual`, `wait_poor`, …). |
| `services_*` | Standalone new services on **existing** owners (term/expires/price + `order`/`prolong` history). |
| `transactions_*` | **Prolong** events on live services (`active` / `suspended` / `prolong_wait`); failed prolongs sometimes move status to `prolong_wait`. |

Bundled services/transactions inside a new-account packet do **not** consume `services_*` / `transactions_*` budget.

Timestamps use `public.model_now()`. RNG seed = `logical_date` timestamp (reproducible per scheduled slot).

## Schedule

`*/5 * * * *` (every 5 minutes). Manual trigger supported with count overrides.

Defaults sized so a watching overview usually moves each tick (≈1–2 new scored clients, a couple of services, a handful of prolongs) without hourly-scale dumps.

## Defaults

| Entity | From | To |
|---|---|---|
| accounts (scenario packets) | 1 | 2 |
| services (standalone) | 1 | 2 |
| transactions (prolong events) | 8 | 15 |

For each entity: set `*_exact` for a fixed count, or leave it empty and use `*_from` / `*_to` (inclusive random).

## Connection

| Id | Type | Notes |
|---|---|---|
| `churn_postgres` | Postgres | host `postgres`, port `5432`, schema/db `churn`, user/password from churn module `.env` |

## Manual check

Trigger with `accounts_exact=1`, `services_exact=0`, `transactions_exact=5` and confirm a scenario account plus prolong rows.

## Unit tests

```bash
cd churn_demo_feed && python3 -m unittest -v tests.test_builders
```

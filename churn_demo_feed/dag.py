from __future__ import annotations

import logging
import sys
from datetime import datetime
from pathlib import Path

from airflow.sdk import Param, dag, get_current_context, task

_DAG_DIR = Path(__file__).resolve().parent
if str(_DAG_DIR) not in sys.path:
    sys.path.insert(0, str(_DAG_DIR))

from lib.db import CONNECTION_ID
from lib.generate import run_feed
from lib.params import resolve_counts

logger = logging.getLogger(__name__)


@dag(
    dag_id="churn_demo_feed",
    start_date=datetime(2026, 10, 1),
    schedule="*/5 * * * *",
    catchup=False,
    max_active_runs=1,
    tags=["churn", "demo", "postgres"],
    params={
        "accounts_from": Param(
            1,
            type="integer",
            minimum=0,
            description="Min new scenario accounts when accounts_exact is empty",
        ),
        "accounts_to": Param(
            2,
            type="integer",
            minimum=0,
            description="Max new scenario accounts when accounts_exact is empty",
        ),
        "accounts_exact": Param(
            None,
            type=["null", "integer"],
            minimum=0,
            description="Exact new scenario accounts; overrides from/to when set",
        ),
        "services_from": Param(
            1,
            type="integer",
            minimum=0,
            description="Min standalone services on existing owners",
        ),
        "services_to": Param(
            2,
            type="integer",
            minimum=0,
            description="Max standalone services on existing owners",
        ),
        "services_exact": Param(
            None,
            type=["null", "integer"],
            minimum=0,
            description="Exact standalone services; overrides from/to when set",
        ),
        "transactions_from": Param(
            8,
            type="integer",
            minimum=0,
            description="Min prolong events on live services",
        ),
        "transactions_to": Param(
            15,
            type="integer",
            minimum=0,
            description="Max prolong events on live services",
        ),
        "transactions_exact": Param(
            None,
            type=["null", "integer"],
            minimum=0,
            description="Exact prolong events; overrides from/to when set",
        ),
    },
)
def churn_demo_feed():
    @task
    def generate_demo_rows() -> dict:
        context = get_current_context()
        params = dict(context.get("params") or {})
        # CLI `dags trigger --conf` lands in dag_run.conf; merge over defaults.
        dag_run = context.get("dag_run")
        conf = getattr(dag_run, "conf", None) or {}
        if isinstance(conf, dict):
            params.update(conf)
        counts = resolve_counts(params)
        logical = context.get("logical_date") or context.get("data_interval_start")
        seed = int(logical.timestamp()) if logical is not None else None
        logger.info(
            "resolved counts: %s seed=%s (conn=%s)", counts, seed, CONNECTION_ID
        )
        return run_feed(counts, seed=seed)

    generate_demo_rows()


churn_demo_feed()

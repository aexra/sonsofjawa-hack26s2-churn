from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from airflow.providers.postgres.hooks.postgres import PostgresHook

CONNECTION_ID = "churn_postgres"


def get_hook(conn_id: str = CONNECTION_ID) -> PostgresHook:
    return PostgresHook(postgres_conn_id=conn_id)


@contextmanager
def cursor(conn_id: str = CONNECTION_ID) -> Iterator:
    hook = get_hook(conn_id)
    conn = hook.get_conn()
    try:
        with conn.cursor() as cur:
            yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

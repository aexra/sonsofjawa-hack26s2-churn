from __future__ import annotations

import random
from typing import Any, Mapping


def _as_int(value: Any, name: str) -> int:
    if value is None:
        raise ValueError(f"{name} is required")
    try:
        n = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be an integer, got {value!r}") from exc
    if n < 0:
        raise ValueError(f"{name} must be >= 0, got {n}")
    return n


def resolve_count(
    params: Mapping[str, Any],
    *,
    prefix: str,
    default_from: int,
    default_to: int,
) -> int:
    exact_raw = params.get(f"{prefix}_exact")
    if exact_raw is not None and exact_raw != "":
        return _as_int(exact_raw, f"{prefix}_exact")

    lo = _as_int(params.get(f"{prefix}_from", default_from), f"{prefix}_from")
    hi = _as_int(params.get(f"{prefix}_to", default_to), f"{prefix}_to")
    if lo > hi:
        raise ValueError(f"{prefix}_from ({lo}) must be <= {prefix}_to ({hi})")
    return random.randint(lo, hi)


def resolve_counts(params: Mapping[str, Any]) -> dict[str, int]:
    return {
        "accounts": resolve_count(
            params, prefix="accounts", default_from=1, default_to=2
        ),
        "services": resolve_count(
            params, prefix="services", default_from=1, default_to=2
        ),
        "transactions": resolve_count(
            params, prefix="transactions", default_from=8, default_to=15
        ),
    }

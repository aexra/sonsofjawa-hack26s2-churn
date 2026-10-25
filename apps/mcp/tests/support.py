import functools
import inspect
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

from churn_mcp.client import ApiClient
from churn_mcp.server import build_app
from churn_mcp.settings import Settings

API = "http://api.test"
KEY = "Bearer ck_abcd1234_supersecretvalue"
MCP_HEADERS = {
    "Accept": "application/json, text/event-stream",
    "Content-Type": "application/json",
}
SUMMARY = {"highRiskCount": 3, "atRiskAmountEurocent": 123456}


def rpc(method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}


def with_http(test: Callable[..., Awaitable[None]]) -> Callable[..., Awaitable[None]]:
    @functools.wraps(test)
    async def run(*args: Any, **kwargs: Any) -> None:
        settings = Settings(churn_api_url=API)
        app = build_app(settings, ApiClient(settings))
        async with app.router.lifespan_context(app):
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://mcp.test") as http:
                await test(http, *args, **kwargs)

    signature = inspect.signature(test)
    params = list(signature.parameters.values())[1:]
    run.__signature__ = signature.replace(parameters=params)  # type: ignore[attr-defined]
    return run

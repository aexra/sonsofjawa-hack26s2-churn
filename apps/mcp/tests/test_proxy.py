import functools
import inspect
import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any

import httpx
import pytest
import respx

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


async def call_summary(http: httpx.AsyncClient, key: str | None = KEY) -> httpx.Response:
    headers = dict(MCP_HEADERS)
    if key:
        headers["Authorization"] = key
    return await http.post(
        "/mcp", headers=headers, json=rpc("tools/call", {"name": "get_summary", "arguments": {}})
    )


@with_http
async def test_health_is_public(http: httpx.AsyncClient) -> None:
    response = await http.get("/health")
    assert response.status_code == 200


@with_http
async def test_missing_header_is_rejected(http: httpx.AsyncClient) -> None:
    response = await call_summary(http, key=None)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


@with_http
async def test_non_bearer_header_is_rejected(http: httpx.AsyncClient) -> None:
    response = await call_summary(http, key="Basic abc")
    assert response.status_code == 401


@respx.mock
@with_http
async def test_header_reaches_api_unchanged(http: httpx.AsyncClient) -> None:
    route = respx.get(f"{API}/api/v1/analytics/summary").mock(
        return_value=httpx.Response(200, json=SUMMARY)
    )
    response = await call_summary(http)
    assert response.status_code == 200
    assert route.calls.last.request.headers["authorization"] == KEY
    result = response.json()["result"]
    assert result["isError"] is False
    assert result["structuredContent"] == SUMMARY


@respx.mock
@with_http
async def test_tools_list_contains_summary(http: httpx.AsyncClient) -> None:
    response = await http.post(
        "/mcp", headers={**MCP_HEADERS, "Authorization": KEY}, json=rpc("tools/list")
    )
    names = [tool["name"] for tool in response.json()["result"]["tools"]]
    assert "get_summary" in names


@respx.mock
@pytest.mark.parametrize("status", [401, 403])
@with_http
async def test_api_auth_errors_reach_client(http: httpx.AsyncClient, status: int) -> None:
    respx.get(f"{API}/api/v1/analytics/summary").mock(
        return_value=httpx.Response(
            status, json={"code": "unauthorized", "detail": "bad key", "status": status}
        )
    )
    response = await call_summary(http)
    assert response.status_code == status
    if status == 401:
        assert response.headers["www-authenticate"] == "Bearer"
    text = json.dumps(response.json())
    assert "unauthorized" in text


@respx.mock
@with_http
async def test_problem_json_becomes_short_text(http: httpx.AsyncClient) -> None:
    respx.get(f"{API}/api/v1/analytics/summary").mock(
        return_value=httpx.Response(
            500,
            json={"code": "internal_error", "title": "oops", "requestId": "r1"},
            headers={"content-type": "application/problem+json"},
        )
    )
    response = await call_summary(http)
    result = response.json()["result"]
    assert result["isError"] is True
    assert "internal_error" in result["content"][0]["text"]


@respx.mock
@with_http
async def test_key_is_not_leaked(http: httpx.AsyncClient, caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    respx.get(f"{API}/api/v1/analytics/summary").mock(
        return_value=httpx.Response(500, json={"code": "internal_error", "detail": "failure"})
    )
    response = await call_summary(http)
    secret = KEY.split(" ", 1)[1]
    assert secret not in response.text
    assert secret not in caplog.text


@respx.mock
@with_http
async def test_unreachable_api_does_not_leak_key(http: httpx.AsyncClient) -> None:
    respx.get(f"{API}/api/v1/analytics/summary").mock(side_effect=httpx.ConnectError("boom"))
    response = await call_summary(http)
    result = response.json()["result"]
    assert result["isError"] is True
    assert KEY.split(" ", 1)[1] not in response.text

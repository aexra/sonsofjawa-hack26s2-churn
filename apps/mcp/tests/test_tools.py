import asyncio
import json
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx
import yaml

from churn_mcp.client import ApiClient
from churn_mcp.server import build_mcp
from churn_mcp.settings import Settings
from churn_mcp.tools import ARRAY_RESPONSES, DEFAULT_PAGE_SIZE, ENDPOINTS, MAX_PAGE_SIZE
from support import API, KEY, MCP_HEADERS, rpc, with_http

SPEC = yaml.safe_load((Path(__file__).resolve().parents[3] / "openapi.yaml").read_text())


def resolve(node: Any) -> Any:
    if isinstance(node, dict) and "$ref" in node:
        target: Any = SPEC
        for part in node["$ref"].removeprefix("#/").split("/"):
            target = target[part]
        return resolve(target)
    return node


def spec_params(path: str) -> dict[str, Any]:
    item = SPEC["paths"][path]
    found = list(item.get("parameters", [])) + list(item["get"].get("parameters", []))
    return {resolve(param)["name"]: resolve(param) for param in found}


def schema_tools() -> dict[str, Any]:
    settings = Settings(churn_api_url=API)
    mcp = build_mcp(ApiClient(settings), settings)
    return {tool.name: tool for tool in asyncio.run(mcp.list_tools())}


async def call(
    http: httpx.AsyncClient, name: str, arguments: dict[str, Any] | None = None
) -> dict[str, Any]:
    response = await http.post(
        "/mcp",
        headers={**MCP_HEADERS, "Authorization": KEY},
        json=rpc("tools/call", {"name": name, "arguments": arguments or {}}),
    )
    assert response.status_code == 200
    result: dict[str, Any] = response.json()["result"]
    return result


def test_all_tools_registered() -> None:
    assert set(schema_tools()) == set(ENDPOINTS)
    assert len(ENDPOINTS) == 7


@pytest.mark.parametrize("name", sorted(ENDPOINTS))
def test_endpoint_matches_openapi(name: str) -> None:
    endpoint = ENDPOINTS[name]
    assert endpoint.path in SPEC["paths"], endpoint.path
    assert "get" in SPEC["paths"][endpoint.path]
    declared = spec_params(endpoint.path)
    for api_name in endpoint.query.values():
        assert api_name in declared, api_name
    ok = SPEC["paths"][endpoint.path]["get"]["responses"]["200"]["content"]["application/json"]
    top = resolve(ok["schema"]).get("type", "object")
    assert top == ("array" if name in ARRAY_RESPONSES else "object")
    query_declared = {key for key, value in declared.items() if value["in"] == "query"}
    assert set(endpoint.query.values()) == query_declared
    properties = schema_tools()[name].inputSchema["properties"]
    path_names = {key for key, value in declared.items() if value["in"] == "path"}
    assert set(properties) == set(endpoint.query) | path_names


@pytest.mark.parametrize("name", sorted(ENDPOINTS))
def test_parameter_bounds_match_openapi(name: str) -> None:
    endpoint = ENDPOINTS[name]
    declared = spec_params(endpoint.path)
    properties = schema_tools()[name].inputSchema["properties"]
    mapping = {**endpoint.query, "id": "id"}
    for tool_name, api_name in mapping.items():
        if api_name not in declared:
            continue
        schema = resolve(declared[api_name]["schema"])
        tool_schema = properties[tool_name]
        if "anyOf" in tool_schema:
            tool_schema = next(item for item in tool_schema["anyOf"] if item["type"] != "null")
        for bound in ("minimum", "maximum"):
            if bound in schema:
                assert tool_schema.get(bound) == schema[bound], (tool_name, bound)
        if "default" in schema and tool_name not in ("size", "fields", "sort"):
            assert properties[tool_name].get("default") == schema["default"], tool_name


def test_page_size_limits() -> None:
    size = spec_params("/api/v1/customers")["size"]["schema"]
    assert MAX_PAGE_SIZE == size["maximum"]
    assert DEFAULT_PAGE_SIZE <= size["default"]


def test_enums_match_openapi() -> None:
    properties = schema_tools()["get_customers"].inputSchema["properties"]
    fields = SPEC["components"]["schemas"]["CustomerField"]["enum"]
    assert properties["fields"]["anyOf"][0]["items"]["enum"] == fields
    levels = SPEC["components"]["schemas"]["RiskLevel"]["enum"]
    assert properties["level"]["anyOf"][0]["items"]["enum"] == levels
    statuses = SPEC["components"]["schemas"]["ScoreStatus"]["enum"]
    assert properties["status"]["anyOf"][0]["items"]["enum"] == statuses


@pytest.mark.parametrize("name", sorted(ENDPOINTS))
def test_descriptions_mention_money(name: str) -> None:
    tool = schema_tools()[name]
    assert "eurocents" in tool.description


@respx.mock
@with_http
async def test_customers_params_reach_api(http: httpx.AsyncClient) -> None:
    route = respx.get(f"{API}/api/v1/customers").mock(
        return_value=httpx.Response(
            200,
            json={
                "page": 1,
                "size": 10,
                "totalItems": 35,
                "totalPages": 4,
                "items": [{"id": 1, "riskScore": 90.5}],
                "fields": ["id", "riskScore"],
                "sort": ["riskScore,desc", "id,asc"],
            },
        )
    )
    result = await call(
        http,
        "get_customers",
        {
            "page": 1,
            "sort": ["expectedLoss,desc", "riskScore,desc"],
            "level": ["high", "medium"],
            "status": ["scored"],
            "q": "ann",
            "min_score": 40,
            "min_loss": 5000,
            "has_anomalies": True,
            "fields": ["id", "riskScore"],
        },
    )
    assert result["isError"] is False
    params = route.calls.last.request.url.params
    assert params.get_list("sort") == ["expectedLoss,desc", "riskScore,desc"]
    assert params["level"] == "high,medium"
    assert params["status"] == "scored"
    assert params["fields"] == "id,riskScore"
    assert params["page"] == "1"
    assert params["size"] == "10"
    assert params["q"] == "ann"
    assert params["minScore"] == "40.0"
    assert params["minLoss"] == "5000"
    assert params["hasAnomalies"] == "true"
    assert route.calls.last.request.headers["authorization"] == KEY
    assert result["structuredContent"] == {
        "items": [{"id": 1, "riskScore": 90.5}],
        "page": 1,
        "size": 10,
        "totalItems": 35,
        "totalPages": 4,
        "hasNext": True,
    }


@respx.mock
@with_http
async def test_customers_last_page_and_defaults(http: httpx.AsyncClient) -> None:
    route = respx.get(f"{API}/api/v1/customers").mock(
        return_value=httpx.Response(
            200,
            json={
                "page": 0,
                "size": 10,
                "totalItems": 3,
                "totalPages": 1,
                "items": [],
                "fields": [],
                "sort": [],
            },
        )
    )
    result = await call(http, "get_customers")
    params = route.calls.last.request.url.params
    assert params["size"] == "10"
    assert "sort" not in params
    assert "level" not in params
    assert params["fields"].startswith("id,email")
    assert result["structuredContent"]["hasNext"] is False


@respx.mock
@with_http
async def test_size_above_maximum_is_rejected(http: httpx.AsyncClient) -> None:
    route = respx.get(f"{API}/api/v1/customers")
    result = await call(http, "get_customers", {"size": MAX_PAGE_SIZE + 1})
    assert result["isError"] is True
    assert not route.called


@respx.mock
@with_http
async def test_customer_path_id(http: httpx.AsyncClient) -> None:
    route = respx.get(f"{API}/api/v1/customers/42").mock(
        return_value=httpx.Response(200, json={"id": 42})
    )
    result = await call(http, "get_customer", {"id": 42})
    assert route.called
    assert result["structuredContent"] == {"id": 42}


@respx.mock
@with_http
async def test_customer_not_found_is_short_text(http: httpx.AsyncClient) -> None:
    respx.get(f"{API}/api/v1/customers/7").mock(
        return_value=httpx.Response(
            404,
            json={"code": "customer_not_found", "detail": "customer 7 not found", "status": 404},
            headers={"content-type": "application/problem+json"},
        )
    )
    result = await call(http, "get_customer", {"id": 7})
    assert result["isError"] is True
    text = result["content"][0]["text"]
    assert "404" in text
    assert "customer_not_found" in text


@respx.mock
@with_http
async def test_bad_request_is_short_text(http: httpx.AsyncClient) -> None:
    respx.get(f"{API}/api/v1/customers").mock(
        return_value=httpx.Response(
            400, json={"code": "validation_failed", "detail": "bad sort", "status": 400}
        )
    )
    result = await call(http, "get_customers", {"sort": ["nope,desc"]})
    assert result["isError"] is True
    assert "validation_failed" in result["content"][0]["text"]


@respx.mock
@with_http
async def test_history_params(http: httpx.AsyncClient) -> None:
    route = respx.get(f"{API}/api/v1/customers/5/history").mock(
        return_value=httpx.Response(200, json=[{"calculatedAt": "2026-01-01T00:00:00Z"}])
    )
    result = await call(
        http,
        "get_customer_history",
        {"id": 5, "date_from": "2026-01-01T00:00:00Z", "limit": 50},
    )
    params = route.calls.last.request.url.params
    assert params["from"] == "2026-01-01T00:00:00Z"
    assert params["limit"] == "50"
    assert "to" not in params
    assert result["structuredContent"] == {"points": [{"calculatedAt": "2026-01-01T00:00:00Z"}]}


@respx.mock
@with_http
async def test_chart_params(http: httpx.AsyncClient) -> None:
    route = respx.get(f"{API}/api/v1/analytics/churn-chart").mock(
        return_value=httpx.Response(200, json={"facts": []})
    )
    await call(http, "get_churn_chart", {"past_days": 30, "future_days": 14})
    params = route.calls.last.request.url.params
    assert params["pastDays"] == "30"
    assert params["futureDays"] == "14"


@respx.mock
@pytest.mark.parametrize(
    ("name", "path"),
    [
        ("get_model_settings", "/api/v1/model/settings"),
        ("get_recalc_status", "/api/v1/recalc/status"),
        ("get_summary", "/api/v1/analytics/summary"),
    ],
)
@with_http
async def test_plain_tools(http: httpx.AsyncClient, name: str, path: str) -> None:
    route = respx.get(f"{API}{path}").mock(return_value=httpx.Response(200, json={"ok": True}))
    result = await call(http, name)
    assert route.called
    assert json.dumps(result["structuredContent"]) == '{"ok": true}'


@respx.mock
@with_http
async def test_forbidden_scope_has_clear_text(http: httpx.AsyncClient) -> None:
    respx.get(f"{API}/api/v1/model/settings").mock(
        return_value=httpx.Response(
            403, json={"code": "forbidden", "detail": "scope read is not enough", "status": 403}
        )
    )
    response = await http.post(
        "/mcp",
        headers={**MCP_HEADERS, "Authorization": KEY},
        json=rpc("tools/call", {"name": "get_model_settings", "arguments": {}}),
    )
    assert response.status_code == 403
    assert "forbidden" in response.text
    assert "scope read is not enough" in response.text

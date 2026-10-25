from dataclasses import dataclass
from typing import Annotated, Any, Literal

from mcp.server.fastmcp import FastMCP
from pydantic import Field

from churn_mcp.client import ApiClient, ApiError

DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 500

RiskLevel = Literal["high", "medium", "low"]
ScoreStatus = Literal["scored", "no_score", "pending"]
CustomerField = Literal[
    "id",
    "email",
    "balance",
    "withdrawBalance",
    "totalReplenished",
    "bonusBalance",
    "bonusState",
    "scoreStatus",
    "noScoreReason",
    "riskScore",
    "riskLevel",
    "loyalty",
    "expectedLoss",
    "revenueHorizon",
    "securedAmount",
    "servicesTotal",
    "servicesLive",
    "servicesAtRisk",
    "nextExpiryAt",
    "topReason",
    "reasons",
    "anomalies",
    "calculatedAt",
    "asOf",
    "modelVersion",
]
DEFAULT_FIELDS: tuple[CustomerField, ...] = (
    "id",
    "email",
    "balance",
    "riskScore",
    "riskLevel",
    "topReason",
    "expectedLoss",
)


@dataclass(frozen=True)
class Endpoint:
    path: str
    query: dict[str, str]


ARRAY_RESPONSES = frozenset({"get_customer_history"})

ENDPOINTS: dict[str, Endpoint] = {
    "get_customers": Endpoint(
        "/api/v1/customers",
        {
            "page": "page",
            "size": "size",
            "sort": "sort",
            "fields": "fields",
            "level": "level",
            "status": "status",
            "q": "q",
            "min_score": "minScore",
            "max_score": "maxScore",
            "min_loss": "minLoss",
            "has_anomalies": "hasAnomalies",
        },
    ),
    "get_customer": Endpoint("/api/v1/customers/{id}", {}),
    "get_customer_history": Endpoint(
        "/api/v1/customers/{id}/history",
        {"date_from": "from", "date_to": "to", "limit": "limit"},
    ),
    "get_summary": Endpoint("/api/v1/analytics/summary", {}),
    "get_churn_chart": Endpoint(
        "/api/v1/analytics/churn-chart",
        {"past_days": "pastDays", "future_days": "futureDays"},
    ),
    "get_model_settings": Endpoint("/api/v1/model/settings", {}),
    "get_recalc_status": Endpoint("/api/v1/recalc/status", {}),
}


def _query(name: str, values: dict[str, Any]) -> dict[str, Any]:
    mapping = ENDPOINTS[name].query
    params: dict[str, Any] = {}
    for key, value in values.items():
        if value is None:
            continue
        if isinstance(value, bool):
            value = "true" if value else "false"
        elif isinstance(value, list):
            if not value:
                continue
            value = value if key == "sort" else ",".join(str(item) for item in value)
        params[mapping[key]] = value
    return params


async def _get(
    client: ApiClient, name: str, values: dict[str, Any] | None = None, **path: int
) -> Any:
    endpoint = ENDPOINTS[name]
    try:
        return await client.get(endpoint.path.format(**path), _query(name, values or {}) or None)
    except ApiError as exc:
        raise ValueError(str(exc)) from None


def _object(result: Any) -> dict[str, Any]:
    if not isinstance(result, dict):
        raise ValueError("unexpected api response")
    return result


def register(mcp: FastMCP, client: ApiClient) -> None:
    @mcp.tool()
    async def get_customers(
        page: Annotated[int, Field(ge=0, description="zero-based page number")] = 0,
        size: Annotated[
            int, Field(ge=1, le=MAX_PAGE_SIZE, description="items per page")
        ] = DEFAULT_PAGE_SIZE,
        sort: Annotated[
            list[Annotated[str, Field(pattern=r"^[a-zA-Z]+,(asc|desc)$")]] | None,
            Field(
                description=(
                    "sort rules as '<field>,<asc|desc>', for example 'riskScore,desc' "
                    "or 'expectedLoss,desc'; default is 'riskScore,desc'"
                )
            ),
        ] = None,
        fields: Annotated[
            list[CustomerField] | None,
            Field(description=f"fields of each customer; default {', '.join(DEFAULT_FIELDS)}"),
        ] = None,
        level: Annotated[list[RiskLevel] | None, Field(description="risk levels to keep")] = None,
        status: Annotated[
            list[ScoreStatus] | None, Field(description="score statuses to keep")
        ] = None,
        q: Annotated[
            str | None,
            Field(max_length=200, description="case-insensitive email substring or exact id"),
        ] = None,
        min_score: Annotated[float | None, Field(ge=0, le=100)] = None,
        max_score: Annotated[float | None, Field(ge=0, le=100)] = None,
        min_loss: Annotated[
            int | None, Field(ge=0, description="minimal expected loss in eurocents")
        ] = None,
        has_anomalies: Annotated[
            bool | None, Field(description="only customers with anomalies")
        ] = None,
    ) -> dict[str, Any]:
        """Customers ranked by churn risk with filters, sorting and pagination.
        Ordered by risk score, highest first, unless sort is given. Money amounts are integer
        eurocents. The result has hasNext to tell whether another page exists."""
        values = {
            "page": page,
            "size": size,
            "sort": sort,
            "fields": fields or list(DEFAULT_FIELDS),
            "level": level,
            "status": status,
            "q": q,
            "min_score": min_score,
            "max_score": max_score,
            "min_loss": min_loss,
            "has_anomalies": has_anomalies,
        }
        body = _object(await _get(client, "get_customers", values))
        total_pages = int(body.get("totalPages", 0))
        current = int(body.get("page", page))
        return {
            "items": body.get("items", []),
            "page": current,
            "size": body.get("size", size),
            "totalItems": body.get("totalItems", 0),
            "totalPages": total_pages,
            "hasNext": current + 1 < total_pages,
        }

    @mcp.tool()
    async def get_customer(
        id: Annotated[int, Field(description="customer id")],
    ) -> dict[str, Any]:
        """Detailed churn card of one customer: score, level, services, recent transactions
        and the reasons behind the score. Money amounts are integer eurocents."""
        return _object(await _get(client, "get_customer", id=id))

    @mcp.tool()
    async def get_customer_history(
        id: Annotated[int, Field(description="customer id")],
        date_from: Annotated[
            str | None, Field(description="start of the range, ISO 8601 date-time")
        ] = None,
        date_to: Annotated[
            str | None, Field(description="end of the range, ISO 8601 date-time")
        ] = None,
        limit: Annotated[int, Field(ge=1, le=5000, description="maximum points")] = 1000,
    ) -> dict[str, Any]:
        """Risk score history of one customer over time, returned as points.
        Money amounts are integer eurocents."""
        values = {"date_from": date_from, "date_to": date_to, "limit": limit}
        points = await _get(client, "get_customer_history", values, id=id)
        if not isinstance(points, list):
            raise ValueError("unexpected api response")
        return {"points": points}

    @mcp.tool()
    async def get_summary() -> dict[str, Any]:
        """Aggregated churn risk summary: customer counts per risk level and the estimated
        money at risk. Money amounts are integer eurocents."""
        return _object(await _get(client, "get_summary"))

    @mcp.tool()
    async def get_churn_chart(
        past_days: Annotated[int, Field(ge=1, le=365, description="days of facts")] = 90,
        future_days: Annotated[
            int | None,
            Field(ge=1, le=365, description="days of forecast; default is the model horizon"),
        ] = None,
    ) -> dict[str, Any]:
        """Daily churn facts (deletions) and forecast (expected non-renewals).
        Money amounts are integer eurocents."""
        values = {"past_days": past_days, "future_days": future_days}
        return _object(await _get(client, "get_churn_chart", values))

    @mcp.tool()
    async def get_model_settings() -> dict[str, Any]:
        """Current churn model coefficients, risk thresholds, model clock and feature catalog.
        Money amounts are integer eurocents."""
        return _object(await _get(client, "get_model_settings"))

    @mcp.tool()
    async def get_recalc_status() -> dict[str, Any]:
        """Whether a recalculation is running, the pending delta and recent runs.
        Money amounts are integer eurocents."""
        return _object(await _get(client, "get_recalc_status"))

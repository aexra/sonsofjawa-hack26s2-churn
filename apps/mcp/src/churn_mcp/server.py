from typing import Any

import uvicorn
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse

from churn_mcp.auth import AuthMiddleware
from churn_mcp.client import ApiClient, ApiError
from churn_mcp.settings import Settings


def build_mcp(client: ApiClient, settings: Settings) -> FastMCP:
    mcp = FastMCP(
        "churn",
        host="0.0.0.0",
        port=settings.mcp_port,
        stateless_http=True,
        json_response=True,
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    )

    @mcp.tool()
    async def get_summary() -> dict[str, Any]:
        """Aggregated churn risk summary: customer counts per risk level and the estimated
        money at risk. Money amounts are integer eurocents."""
        try:
            result = await client.get("/api/v1/analytics/summary")
        except ApiError as exc:
            raise ValueError(str(exc)) from None
        if not isinstance(result, dict):
            raise ValueError("unexpected api response")
        return result

    return mcp


def build_app(settings: Settings | None = None, client: ApiClient | None = None) -> Starlette:
    settings = settings or Settings()
    client = client or ApiClient(settings)
    app = build_mcp(client, settings).streamable_http_app()

    async def health(_: Request) -> JSONResponse:
        return JSONResponse({"status": "ok"})

    app.add_route("/health", health, methods=["GET"])
    app.add_middleware(AuthMiddleware)
    return app


def main() -> None:
    settings = Settings()
    uvicorn.run(
        build_app(settings),
        host="0.0.0.0",
        port=settings.mcp_port,
        access_log=False,
        log_level="warning",
    )

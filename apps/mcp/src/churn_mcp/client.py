from typing import Any

import httpx

from churn_mcp.auth import authorization, upstream_status
from churn_mcp.settings import Settings


class ApiError(Exception):
    pass


def _describe(response: httpx.Response) -> str:
    code = "error"
    detail = ""
    try:
        body = response.json()
    except ValueError:
        body = None
    if isinstance(body, dict):
        code = str(body.get("code") or body.get("title") or code)
        detail = str(body.get("detail") or "")
    text = f"api returned {response.status_code}, code: {code}"
    return f"{text}, {detail}" if detail else text


class ApiClient:
    def __init__(self, settings: Settings) -> None:
        self._client = httpx.AsyncClient(
            base_url=settings.churn_api_url,
            timeout=settings.mcp_api_timeout,
        )

    async def get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        headers = {"Accept": "application/json"}
        header = authorization.get()
        if header:
            headers["Authorization"] = header
        try:
            response = await self._client.get(path, params=params, headers=headers)
        except httpx.HTTPError as exc:
            raise ApiError(f"api unreachable: {type(exc).__name__}") from None
        if response.status_code in (401, 403):
            holder = upstream_status.get()
            if holder is not None:
                holder.append(response.status_code)
        if response.is_error:
            raise ApiError(_describe(response))
        return response.json()

    async def aclose(self) -> None:
        await self._client.aclose()

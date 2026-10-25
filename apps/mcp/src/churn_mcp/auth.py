from collections.abc import Awaitable, Callable, MutableMapping
from contextvars import ContextVar
from typing import Any

Scope = MutableMapping[str, Any]
Message = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]
App = Callable[[Scope, Receive, Send], Awaitable[None]]

PUBLIC_PATHS = frozenset({"/health"})

authorization: ContextVar[str | None] = ContextVar("authorization", default=None)
upstream_status: ContextVar[list[int] | None] = ContextVar("upstream_status", default=None)


def _bearer(scope: Scope) -> str | None:
    for name, value in scope.get("headers", []):
        if name == b"authorization":
            text = value.decode("latin-1").strip()
            scheme, _, token = text.partition(" ")
            if scheme.lower() == "bearer" and token.strip():
                return str(text)
    return None


async def _reject(send: Send) -> None:
    body = b'{"code":"unauthorized","detail":"missing bearer key"}'
    await send(
        {
            "type": "http.response.start",
            "status": 401,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
                (b"www-authenticate", b"Bearer"),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})


class AuthMiddleware:
    def __init__(self, app: App) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["path"] in PUBLIC_PATHS:
            await self.app(scope, receive, send)
            return
        header = _bearer(scope)
        if header is None:
            await _reject(send)
            return
        status: list[int] = []
        token = authorization.set(header)
        status_token = upstream_status.set(status)

        async def wrapped(message: Message) -> None:
            if message["type"] == "http.response.start" and status:
                message = dict(message)
                message["status"] = status[0]
                headers = [(k, v) for k, v in message["headers"] if k != b"www-authenticate"]
                if status[0] == 401:
                    headers.append((b"www-authenticate", b"Bearer"))
                message["headers"] = headers
            await send(message)

        try:
            await self.app(scope, receive, wrapped)
        finally:
            authorization.reset(token)
            upstream_status.reset(status_token)

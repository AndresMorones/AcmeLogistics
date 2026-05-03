import hmac

import structlog
from fastapi import Header, HTTPException, status

from app.config import settings

log = structlog.get_logger()


# Header-only auth — no `?token=` fallback. Query strings leak into
# Fly/Cloudflare access logs, Referer headers, browser history, and screenshots.
# hmac.compare_digest = constant-time compare to defeat timing side-channels.
def require_api_key(
    x_api_key: str | None = Header(default=None, alias="x-api-key"),
    authorization: str | None = Header(default=None),
) -> None:
    expected = settings.api_bearer_token

    if x_api_key and hmac.compare_digest(x_api_key, expected):
        return

    if authorization:
        scheme, _, value = authorization.partition(" ")
        if scheme.lower() == "bearer" and hmac.compare_digest(value, expected):
            return

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Missing or invalid API key (x-api-key or Authorization: Bearer)",
        headers={"WWW-Authenticate": "Bearer"},
    )


require_bearer = require_api_key

# HR Write-to-Twin owns calls_log + bookings writes; this API is read-only.
# POST /v1/calls/log returns 410 Gone for legacy callers. Auth: header-only Bearer / x-api-key.
import logging
import uuid
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.logging_security import safe_headers, scrub_secrets_processor
from app.routers import (
    calls,
    carriers,
    dashboard,
    events,
    health,
    loads,
    telemetry,
    transcript_timeline,
)
from app.services.twin_client import twin_client


def configure_logging() -> None:
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            # format_exc_info before scrub so the scrubber walks traceback text and redacts
            # leaked Authorization / sk_live_* tokens from local-frame dumps; scrub must be last before renderer.
            structlog.processors.format_exc_info,
            scrub_secrets_processor,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, settings.log_level.upper(), logging.INFO)
        ),
        cache_logger_on_first_use=True,
    )


log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    if not settings.api_bearer_token:
        raise RuntimeError(
            "API_BEARER_TOKEN is not set. Generate with `openssl rand -hex 32` "
            "and set in api/.env (local) or `fly secrets set` (prod)."
        )
    log.info(
        "startup",
        backend="twin",
        hr_base_url=settings.hr_base_url,
        api_key_configured=bool(settings.happyrobot_api_key),
    )
    yield
    await twin_client.aclose()
    log.info("shutdown")


app = FastAPI(
    title="Acme Logistics API",
    version="0.0.2",
    description="Inbound carrier voice-agent backend (HappyRobot integration). Twin-backed.",
    lifespan=lifespan,
)


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            headers=safe_headers(dict(request.headers)),
        )
        try:
            response = await call_next(request)
        finally:
            structlog.contextvars.clear_contextvars()
        response.headers["x-request-id"] = request_id
        return response


app.add_middleware(RequestContextMiddleware)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = request.headers.get("x-request-id") or "unknown"
    log.exception(
        "unhandled_exception",
        request_id=request_id,
        method=request.method,
        path=request.url.path,
        error_type=type(exc).__name__,
    )
    # Generic body only — exc messages can leak tokens from headers/body/env in the traceback.
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "request_id": request_id},
    )


# Order matters: literal-path routers (/v1/calls/{id}/timeline) MUST register
# before calls.router so they win over the /v1/calls/{call_id} param match.
app.include_router(health.router)
app.include_router(loads.router)
app.include_router(transcript_timeline.router)
app.include_router(calls.router)
app.include_router(carriers.router)
app.include_router(dashboard.router)
app.include_router(events.router)
app.include_router(telemetry.router)

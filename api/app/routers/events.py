from __future__ import annotations

import asyncio
import json
import secrets
import time
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.deps import require_api_key
from app.services import event_bus
from app.services.dashboard_aggregations import invalidate_dashboard_cache

log = structlog.get_logger()

router = APIRouter(tags=["events"])


# HR retries failed webhooks (2 retries, 10s base, 2x backoff, 100s max envelope).
# 300s comfortably exceeds that; without dedupe we'd invalidate cache + fan out SSE
# multiple times for the same call_id. Don't shrink below ~120s.
_IDEMPOTENCY_TTL_SECONDS = 300
_IDEMPOTENCY_MAX_ENTRIES = 1000

_seen_call_ids: dict[str, float] = {}


def _purge_expired_call_ids(now: float) -> None:
    cutoff = now - _IDEMPOTENCY_TTL_SECONDS
    expired = [k for k, ts in _seen_call_ids.items() if ts < cutoff]
    for k in expired:
        _seen_call_ids.pop(k, None)
    if len(_seen_call_ids) > _IDEMPOTENCY_MAX_ENTRIES:
        # Bounded-memory invariant under sustained burst inside the TTL window.
        excess = len(_seen_call_ids) - _IDEMPOTENCY_MAX_ENTRIES
        oldest = sorted(_seen_call_ids.items(), key=lambda kv: kv[1])[:excess]
        for k, _ in oldest:
            _seen_call_ids.pop(k, None)


_SESSION_TTL_SECONDS = 60

_session_tokens: dict[str, float] = {}


def _purge_expired_sessions(now: float) -> None:
    expired = [k for k, exp in _session_tokens.items() if exp <= now]
    for k in expired:
        _session_tokens.pop(k, None)


class CallEndedEvent(BaseModel):
    call_id: str
    run_id: str
    time: str


@router.post(
    "/v1/events/call-ended",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_api_key)],
)
async def call_ended(event: CallEndedEvent) -> None:
    """Idempotent on call_id over a 5-min window. HR retries are coalesced so
    invalidate + publish runs exactly once. Publish failures are swallowed
    (don't 500 back to HR) — the 5-min ISR fallback covers any missed SSE."""
    now = time.time()
    _purge_expired_call_ids(now)

    if event.call_id in _seen_call_ids:
        log.info(
            "events.call_ended.duplicate_suppressed",
            call_id=event.call_id,
            run_id=event.run_id,
        )
        return None

    _seen_call_ids[event.call_id] = now

    try:
        invalidate_dashboard_cache()
        await event_bus.publish(
            {"type": "call.ended", "call_id": event.call_id, "time": event.time}
        )
        log.info(
            "events.call_ended.fanned_out",
            call_id=event.call_id,
            run_id=event.run_id,
            subscribers=event_bus.subscriber_count(),
        )
    except Exception as exc:  # noqa: BLE001
        log.warning(
            "events.call_ended.publish_failed",
            call_id=event.call_id,
            error=str(exc),
        )
    return None


@router.post(
    "/v1/events/session",
    dependencies=[Depends(require_api_key)],
)
async def create_session() -> dict[str, Any]:
    now = time.time()
    _purge_expired_sessions(now)

    token = secrets.token_urlsafe(32)
    _session_tokens[token] = now + _SESSION_TTL_SECONDS
    return {"session_token": token, "expires_in": _SESSION_TTL_SECONDS}


_KEEPALIVE_SECONDS = 30


def _consume_session(session: str) -> bool:
    now = time.time()
    _purge_expired_sessions(now)
    expires_at = _session_tokens.pop(session, None)
    if expires_at is None:
        return False
    return expires_at > now


async def _sse_event_stream(request: Request, q: asyncio.Queue):
    try:
        yield ": connected\n\n"
        while True:
            if await request.is_disconnected():
                break
            try:
                event = await asyncio.wait_for(q.get(), timeout=_KEEPALIVE_SECONDS)
            except asyncio.TimeoutError:
                # Fly/CDN/proxy idle-close SSE without periodic bytes; comment frame.
                yield ": keepalive\n\n"
                continue
            payload = json.dumps(event)
            yield f"event: call-ended\ndata: {payload}\n\n"
    except asyncio.CancelledError:
        raise
    finally:
        event_bus.unsubscribe(q)


@router.get("/v1/events/stream")
async def stream(
    request: Request,
    session: str = Query(..., min_length=8),
):
    # One-shot session token in ?session= — EventSource can't set custom headers,
    # so Bearer auth isn't an option. Token is single-use and short-lived.
    if not _consume_session(session):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token",
        )

    q = event_bus.subscribe()
    return StreamingResponse(
        _sse_event_stream(request, q),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


def _reset_state_for_tests() -> None:
    _seen_call_ids.clear()
    _session_tokens.clear()

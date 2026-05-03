"""Tests for the Option C push pipeline endpoints (`/v1/events/...`).

Covered:
  - POST /v1/events/call-ended  — auth, idempotency, cache invalidation
  - POST /v1/events/session     — auth, token shape
  - GET  /v1/events/stream      — session validation (valid / expired / reused)

SSE end-to-end (long-poll generator under TestClient) is intentionally not
tested here — the streaming generator is hard to drive deterministically in
pytest. The session-token gate covers the auth surface, and the event_bus
fan-out is exercised by direct unit tests below.
"""

from __future__ import annotations

import asyncio
import time
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _reset_events_state():
    """Wipe idempotency + session caches between tests."""
    from app.routers.events import _reset_state_for_tests

    _reset_state_for_tests()
    yield
    _reset_state_for_tests()


# ---------------------------------------------------------- POST call-ended

def test_call_ended_requires_auth(client: TestClient) -> None:
    r = client.post(
        "/v1/events/call-ended",
        json={"call_id": "c1", "run_id": "r1", "time": "2026-04-28T12:00:00Z"},
    )
    assert r.status_code == 401


def test_call_ended_invalidates_cache_and_returns_204(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    with patch(
        "app.routers.events.invalidate_dashboard_cache"
    ) as mock_invalidate:
        r = client.post(
            "/v1/events/call-ended",
            headers=auth_headers,
            json={
                "call_id": "call-abc",
                "run_id": "run-xyz",
                "time": "2026-04-28T12:00:00Z",
            },
        )
        assert r.status_code == 204
        assert mock_invalidate.call_count == 1


def test_call_ended_idempotent_within_window(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """Same call_id posted twice → second is suppressed; cache cleared once."""
    with patch(
        "app.routers.events.invalidate_dashboard_cache"
    ) as mock_invalidate:
        body = {
            "call_id": "duplicate-call",
            "run_id": "r1",
            "time": "2026-04-28T12:00:00Z",
        }
        r1 = client.post("/v1/events/call-ended", headers=auth_headers, json=body)
        r2 = client.post("/v1/events/call-ended", headers=auth_headers, json=body)
        assert r1.status_code == 204
        assert r2.status_code == 204
        assert mock_invalidate.call_count == 1


def test_call_ended_publish_failure_still_returns_204(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """A bus publish failure must NOT 500 back to HR (its retries are noisy)."""
    with patch(
        "app.routers.events.event_bus.publish",
        side_effect=RuntimeError("bus down"),
    ):
        r = client.post(
            "/v1/events/call-ended",
            headers=auth_headers,
            json={
                "call_id": "publish-fail",
                "run_id": "r1",
                "time": "2026-04-28T12:00:00Z",
            },
        )
        assert r.status_code == 204


# ---------------------------------------------------------- POST session

def test_session_requires_auth(client: TestClient) -> None:
    r = client.post("/v1/events/session")
    assert r.status_code == 401


def test_session_returns_token_and_ttl(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    r = client.post("/v1/events/session", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert "session_token" in body
    assert isinstance(body["session_token"], str)
    assert len(body["session_token"]) >= 32
    assert body["expires_in"] == 60


# ---------------------------------------------------------- GET stream

def test_stream_rejects_invalid_session(client: TestClient) -> None:
    r = client.get("/v1/events/stream?session=not-a-real-token")
    assert r.status_code == 401


def test_stream_rejects_reused_session(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """Session tokens are one-shot: second use → 401.

    Drives the consumer at the helper level (`_consume_session`) instead of
    opening the actual SSE stream — TestClient's `client.stream()` blocks on
    the long-poll generator's first chunk, which only flushes when proxies
    do. The behavior under test is the one-shot semantics of the token store,
    which the helper exercises directly.
    """
    from app.routers.events import _consume_session, _session_tokens

    sess = client.post("/v1/events/session", headers=auth_headers).json()[
        "session_token"
    ]

    # First use consumes the token (same code path as the stream endpoint).
    assert _consume_session(sess) is True
    assert sess not in _session_tokens

    # Second use of same token via the public endpoint → must be rejected.
    r2 = client.get(f"/v1/events/stream?session={sess}")
    assert r2.status_code == 401


def test_stream_rejects_expired_session(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """Tokens older than TTL are rejected (we manipulate the store directly)."""
    from app.routers.events import _session_tokens

    sess = client.post("/v1/events/session", headers=auth_headers).json()[
        "session_token"
    ]
    # Force expiry: rewrite the entry so it expired 1 second ago.
    _session_tokens[sess] = time.time() - 1

    r = client.get(f"/v1/events/stream?session={sess}")
    assert r.status_code == 401


# ---------------------------------------------------------- event_bus unit

@pytest.mark.asyncio
async def test_event_bus_publish_fans_out_to_subscribers() -> None:
    from app.services import event_bus

    q1 = event_bus.subscribe()
    q2 = event_bus.subscribe()
    try:
        await event_bus.publish({"type": "call.ended", "call_id": "c1"})
        e1 = await asyncio.wait_for(q1.get(), timeout=1.0)
        e2 = await asyncio.wait_for(q2.get(), timeout=1.0)
        assert e1 == {"type": "call.ended", "call_id": "c1"}
        assert e2 == {"type": "call.ended", "call_id": "c1"}
    finally:
        event_bus.unsubscribe(q1)
        event_bus.unsubscribe(q2)


@pytest.mark.asyncio
async def test_event_bus_full_queue_drops_silently() -> None:
    """A full subscriber queue must not raise — the slow consumer is just
    skipped (5-min ISR fallback covers the missed event)."""
    from app.services import event_bus

    q = event_bus.subscribe()
    try:
        # Fill to capacity.
        for i in range(100):
            q.put_nowait({"i": i})
        # Publish must NOT raise even though q is full.
        await event_bus.publish({"type": "overflow"})
    finally:
        event_bus.unsubscribe(q)


def test_call_ended_publishes_to_event_bus(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    """End-to-end: webhook receipt → event lands in a subscriber queue."""
    from app.services import event_bus

    q = event_bus.subscribe()
    try:
        r = client.post(
            "/v1/events/call-ended",
            headers=auth_headers,
            json={
                "call_id": "fanout-test",
                "run_id": "r1",
                "time": "2026-04-28T12:00:00Z",
            },
        )
        assert r.status_code == 204
        # The TestClient runs the handler synchronously on its event loop;
        # by the time we get here the publish has completed.
        event = q.get_nowait()
        assert event["type"] == "call.ended"
        assert event["call_id"] == "fanout-test"
    finally:
        event_bus.unsubscribe(q)


# ---------------------------------------------------------- silence unused-import warnings
_ = MagicMock

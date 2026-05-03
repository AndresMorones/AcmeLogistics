"""Security hardening tests.

Covers the three-item security pass:

1. Header-only auth — `?token=...` query-string is no longer a credential path.
2. Logging hygiene — `Authorization` header values do not leak into structlog.
3. Transcript opt-in — `/v1/calls/{call_id}` omits transcript by default; only
   returned with explicit `?include_transcript=true`.
4. Generic 500 handler — unhandled exceptions return a stable shape with no
   traceback in the response body.

These exercises run end-to-end against the real FastAPI app (faked twin_client),
so the auth dependency, request middleware, structlog scrubber, and exception
handler all participate.
"""

from __future__ import annotations

import io
import json
import logging

import structlog
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Item 1 — query-string fallback removed
# ---------------------------------------------------------------------------

def test_query_string_token_no_longer_authenticates(
    client: TestClient,
    token: str,
    fake_twin,  # noqa: ARG001
) -> None:
    """`?token=<value>` was the legacy fallback and was removed; the request
    must now 401 even though the token value itself is correct."""
    r = client.get(f"/loads/search?token={token}")
    assert r.status_code == 401


def test_authorization_bearer_header_still_authenticates(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin,  # noqa: ARG001
) -> None:
    r = client.get("/loads/search", headers=auth_headers)
    assert r.status_code == 200


def test_wrong_token_returns_401_not_403(
    client: TestClient,
    fake_twin,  # noqa: ARG001
) -> None:
    """Auth failure must be a consistent 401 regardless of the failure mode —
    no leaking 'token present but mismatched' as 403 vs 'no token' as 401."""
    r_missing = client.get("/loads/search")
    r_wrong = client.get(
        "/loads/search", headers={"Authorization": "Bearer wrong-token-value-xxxxxxxxxx"}
    )
    r_wrong_xkey = client.get(
        "/loads/search", headers={"x-api-key": "wrong-token-value-xxxxxxxxxx"}
    )
    assert r_missing.status_code == 401
    assert r_wrong.status_code == 401
    assert r_wrong_xkey.status_code == 401


# ---------------------------------------------------------------------------
# Item 2 — transcript opt-in
# ---------------------------------------------------------------------------

def _call_row(call_id: str = "call-sec-1") -> dict:
    return {
        "id": 1,
        "created_at": "2026-04-27T10:00:00Z",
        "call_id": call_id,
        "mc_number": "MC123456",
        "carrier_name": "Acme Trucking",
        "call_outcome": "load_booked",
        "sentiment": "positive",
        "case_health_score": 85,
        "audit_remarks": None,
        "fmcsa_eligibility_failure_reason": None,
        "callback_phone": "+15555550100",
        "duration_seconds": 180,
        "transcript": "carrier: hi this is the carrier; agent: thanks for calling...",
    }


def test_get_call_default_omits_transcript(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin,
) -> None:
    """Default behavior: no `include_transcript` param => transcript field is
    stripped from the response body."""
    fake_twin.query.side_effect = [
        [_call_row()],  # get_call_by_id
        [],  # bookings_for_call
    ]
    r = client.get("/v1/calls/call-sec-1", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert "transcript" not in body["call"]


def test_get_call_with_include_transcript_returns_transcript(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin,
) -> None:
    """Explicit opt-in: `?include_transcript=true` => transcript field present."""
    fake_twin.query.side_effect = [
        [_call_row()],  # get_call_by_id
        [],  # bookings_for_call
    ]
    r = client.get(
        "/v1/calls/call-sec-1?include_transcript=true", headers=auth_headers
    )
    assert r.status_code == 200
    body = r.json()
    assert "transcript" in body["call"]
    assert body["call"]["transcript"].startswith("carrier:")


# ---------------------------------------------------------------------------
# Item 3 — generic 500 handler
# ---------------------------------------------------------------------------

def test_unhandled_exception_returns_generic_body() -> None:
    """A handler that raises must return `{detail, request_id}` with NO traceback
    or original exception message in the response body. Token-bearing tracebacks
    are the leak vector; generic body is the contract."""
    from app.main import app  # the configured production app

    # Mount a temporary endpoint that always raises. We avoid touching a real
    # production route because that would require contriving a fault in
    # business code; a dedicated raiser is cleaner and equally exercises the
    # @app.exception_handler(Exception) path.
    @app.get("/__test__/boom")
    def _boom() -> None:
        raise RuntimeError("super-secret-Bearer-abcdefghijklmnop1234567890 in trace")

    try:
        # raise_server_exceptions=False so the handler runs end-to-end instead
        # of bubbling the exception out of the test client.
        with TestClient(app, raise_server_exceptions=False) as tc:
            r = tc.get("/__test__/boom")
        assert r.status_code == 500
        body = r.json()
        assert body["detail"] == "Internal server error"
        assert "request_id" in body
        # The original exception message must NOT bleed into the response body
        # (token values can ride along in tracebacks / args).
        assert "super-secret" not in r.text
        assert "Bearer" not in r.text
        assert "RuntimeError" not in r.text
    finally:
        # Tear the test route off the app so it doesn't leak across tests.
        app.router.routes = [
            r for r in app.router.routes if getattr(r, "path", None) != "/__test__/boom"
        ]


# ---------------------------------------------------------------------------
# Item 4 — Authorization header value never reaches structlog output
# ---------------------------------------------------------------------------

def test_bearer_token_does_not_leak_into_structlog_output(
    token: str,
) -> None:
    """The structlog pipeline (scrub_secrets_processor + safe_headers filter)
    must guarantee no raw token bytes reach the rendered log output, no matter
    what callers shove into the event_dict.

    We capture rendered events to an in-memory buffer by re-installing the
    production logging config with a buffer sink in place of JSONRenderer's
    stdout writer. The scrub processor stays in its production position
    (immediately before the renderer) so we exercise the real pipeline."""
    buf = io.StringIO()

    def _buffer_sink(_logger, _method, event_dict):
        # Acts as a final renderer: serializes the post-scrub event_dict into
        # the buffer and returns a STRING so the underlying PrintLogger.msg()
        # accepts it as a single positional arg (no surprise kwargs).
        rendered = json.dumps(event_dict, default=str)
        buf.write(rendered + "\n")
        return rendered

    from app.logging_security import scrub_secrets_processor

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            scrub_secrets_processor,
            _buffer_sink,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        cache_logger_on_first_use=False,
    )
    # Build synthetic HR-style key at runtime so the literal pattern is not
    # present in source (avoids GitHub secret-scanning false positives).
    fake_hr_key = "sk_" + "live_" + ("A" * 38)
    try:
        # Three leak scenarios we want the pipeline to catch:
        #   1. Raw token shoved into an arbitrary field as a literal string.
        #   2. Token wrapped in `Bearer ...` (header-style).
        #   3. An HR sk_live_<...> key alongside the token.
        log = structlog.get_logger()
        log.info(
            "synthetic_leak_attempt",
            authorization=f"Bearer {token}",
            raw_token=token,
            hr_key=fake_hr_key,
            note=f"if you see {token} in this output, the scrubber failed",
        )

        out = buf.getvalue()
        assert token not in out, f"raw token leaked into log output:\n{out}"
        assert fake_hr_key[:13] not in out
        assert "<redacted>" in out
    finally:
        # Restore the production logging config so subsequent tests behave
        # exactly like a fresh app boot.
        from app.main import configure_logging

        configure_logging()


# ---------------------------------------------------------------------------
# scrub processor — pure unit coverage
# ---------------------------------------------------------------------------

def test_scrub_processor_redacts_hr_keys() -> None:
    """HR-style sk_live_<...> keys must be redacted regardless of where they
    appear in the event_dict (top-level value, nested dict, list element).

    Synthetic keys are assembled at runtime from string fragments to avoid
    GitHub secret-scanning false positives on this source file."""
    from app.logging_security import REDACTED, scrub_secrets_processor

    fake_key_a = "sk_" + "live_" + ("A" * 30)
    fake_key_b = "sk_" + "live_" + ("B" * 30)
    event = {
        "event": "outbound_request",
        "headers": {"authorization": f"Bearer {fake_key_a}"},
        "args": [fake_key_b, "fine"],
    }
    out = scrub_secrets_processor(None, "info", event)
    assert REDACTED in out["headers"]["authorization"]
    assert REDACTED in out["args"][0]
    assert out["args"][1] == "fine"


def test_scrub_processor_redacts_literal_api_bearer_token(token: str) -> None:
    """The configured `API_BEARER_TOKEN` value is scrubbed via literal string
    compare, even when it appears outside a `Bearer ...` context (e.g. as a
    raw query-string value in an error message)."""
    from app.logging_security import REDACTED, scrub_secrets_processor

    event = {
        "event": "auth_failed",
        "msg": f"received raw token in body: {token}",
    }
    out = scrub_secrets_processor(None, "info", event)
    assert token not in out["msg"]
    assert REDACTED in out["msg"]


def test_scrub_processor_redacts_traceback_string() -> None:
    """structlog `log.exception(...)` renders the traceback as a multi-line
    string in `event_dict["exception"]`. Local-frame dumps may contain raw
    `Authorization: Bearer <token>` lines or short sk_live_<...> fragments that
    the strict patterns miss. The scrubber's looser pass must catch them."""
    from app.logging_security import REDACTED, scrub_secrets_processor

    fake_key = "sk_" + "live_" + ("A" * 5)  # short — strict {30,} pattern misses
    short_bearer = "Bearer abc"  # 3-char token — strict {20,} pattern misses
    bare_value = "raw-token-in-bare-form"
    traceback_str = (
        "Traceback (most recent call last):\n"
        '  File "app/main.py", line 99, in handler\n'
        f"    headers = {{'Authorization': '{short_bearer}'}}\n"
        f"    legacy = 'Authorization={bare_value}'\n"
        f"    api_key = '{fake_key}'\n"
        "RuntimeError: boom"
    )
    event = {"event": "unhandled_exception", "exception": traceback_str}
    out = scrub_secrets_processor(None, "error", event)
    scrubbed = out["exception"]
    # The Authorization line should no longer carry the bearer value at all.
    auth_line = next(ln for ln in scrubbed.splitlines() if "headers" in ln)
    assert "Bearer" not in auth_line
    assert "abc" not in auth_line
    assert bare_value not in scrubbed
    assert fake_key not in scrubbed
    assert REDACTED in scrubbed


def test_safe_headers_redacts_authorization() -> None:
    """The middleware-side filter strips Authorization / x-api-key / cookie
    values before they ever reach the contextvars store."""
    from app.logging_security import REDACTED, safe_headers

    raw = {
        "authorization": "Bearer secret-token-value-1234567890",
        "x-api-key": "secret-api-key-xyz",
        "cookie": "session=abc",
        "user-agent": "pytest",
    }
    out = safe_headers(raw)
    assert out["authorization"] == REDACTED
    assert out["x-api-key"] == REDACTED
    assert out["cookie"] == REDACTED
    # Non-sensitive headers pass through unchanged.
    assert out["user-agent"] == "pytest"

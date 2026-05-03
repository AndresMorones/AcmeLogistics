"""Read-only `calls_log` accessor.

HR Write-to-Twin is sole writer; FastAPI never mutates. Surfaces alongside
`bookings` joined on call_id — note `apply_rate` is NOT a calls_log column
(lives on bookings.apply_rate). latency/intermediate_response columns were
previously derived from the HR `/runs` REST endpoint (now retired) —
transcript-derived telemetry is canonical going forward.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

import structlog

from app.services.twin_client import twin_client

log = structlog.get_logger()


def _ts_key(r: dict) -> tuple:
    raw = r.get("created_at") or ""
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        return (1, dt.timestamp())
    except (ValueError, TypeError):
        return (0, str(raw))


_CALLS_LOG_COLS = (
    "id, created_at, call_id, "
    "mc_number, carrier_name, callback_phone, fmcsa_eligibility_failure_reason, "
    "lane_origin, lane_dest, "
    "call_outcome, sentiment, case_health_score, audit_remarks, notes, "
    "transcript, "
    "extract_input_tokens, extract_output_tokens, extract_reasoning_tokens, "
    "extract_cached_input_tokens, extract_uncached_input_tokens, "
    "chs_input_tokens, chs_output_tokens, chs_reasoning_tokens, "
    "chs_cached_input_tokens, chs_uncached_input_tokens, "
    "duration_seconds, intermediate_response_count, "
    "p70_latency_ms, p90_latency_ms"
)


async def list_calls(
    *,
    limit: int = 100,
    offset: int = 0,
    since_ts: str | None = None,
) -> list[dict[str, Any]]:
    where = ""
    params: dict[str, Any] = {}
    if since_ts:
        where = "WHERE created_at >= :since_ts"
        params["since_ts"] = since_ts

    # Cloudflare WAF blocks ORDER BY + LIMIT/OFFSET. Pull with
    # WHERE only, sort + slice in Python.
    sql = f"SELECT {_CALLS_LOG_COLS} FROM calls_log {where}"
    rows = await twin_client.query(sql, params if params else None)
    rows.sort(key=_ts_key, reverse=True)
    start = int(offset)
    end = start + int(limit)
    return rows[start:end]


async def get_call_by_id(call_id: str) -> dict[str, Any] | None:
    # WAF false-positive on `WHERE call_id = '<uuid-with-dashes>'` (same
    # hex+dash trigger as bookings_store). Fetch + filter Python-side.
    if not call_id:
        return None
    sql = (
        f"SELECT {_CALLS_LOG_COLS} "
        "FROM calls_log "
        "ORDER BY created_at DESC"
    )
    rows = await twin_client.query(sql)
    target = str(call_id)
    for row in rows:
        if row.get("call_id") == target:
            return row
    return None

"""Transcript timeline router.

Parser is permissive on shape, but a NULL/empty/non-list transcript yields
404 by contract — the dashboard widget hides its panel rather than render
an empty shell.
"""
from __future__ import annotations

import json
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException

from app.deps import require_api_key
from app.models import (
    TranscriptSummary,
    TranscriptTimelineEntry,
    TranscriptTimelineResponse,
    TranscriptToolCall,
)
from app.services.calls_store import get_call_by_id
from app.services.transcript_parser import _iso_to_unix_ms, parse_transcript
from app.services.token_counting import count_role_tokens

router = APIRouter(tags=["calls"])
log = structlog.get_logger()


def _coerce_transcript(raw: Any) -> list[dict] | None:
    # Twin returns transcript as a JSON-encoded string; legacy rows may be
    # already-decoded list. Both shapes appear in production.
    if raw is None:
        return None
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        s = raw.strip()
        if not s:
            return None
        try:
            decoded = json.loads(s)
        except (json.JSONDecodeError, ValueError):
            return None
        return decoded if isinstance(decoded, list) else None
    return None


def _event_unix_ms(event: dict) -> int | None:
    # Three timestamp encodings share one axis: assistant turns carry ISO
    # wall_clock (UUIDv7-derived), user turns carry start/end offsets in ms
    # vs call start, tool_results have none (caller substitutes the parent
    # assistant's clock as proxy in `_compute_turn_ms`).
    wc = event.get("wall_clock")
    if wc:
        return _iso_to_unix_ms(wc)
    return None


def _build_summary(
    timeline: list[dict],
    turn_ms: list[int | None],
    anchor_ms: int | None,
) -> tuple[TranscriptSummary, dict[str, int | None]]:
    if not timeline:
        return TranscriptSummary(), {}

    assistant_turn_count = sum(
        1 for e in timeline
        if e["kind"] == "assistant_message"
        or (e["kind"] == "assistant_tool_call" and e.get("text"))
    )
    user_turn_count = sum(1 for e in timeline if e["kind"] == "user_message")
    tool_call_events = [e for e in timeline if e["kind"] == "assistant_tool_call"]
    tool_result_events = [e for e in timeline if e["kind"] == "tool_result"]
    tool_call_count = sum(len(e.get("tool_calls") or []) for e in tool_call_events)
    tool_result_count = len(tool_result_events)

    duration_by_call_id: dict[str, int | None] = {}

    assistant_ts_by_idx: dict[int, int] = {
        i: ts
        for i, ts in enumerate(turn_ms)
        if ts is not None
        and timeline[i]["kind"] in ("assistant_message", "assistant_tool_call")
    }
    sorted_assistant_idxs = sorted(assistant_ts_by_idx)

    def _next_assistant_after(idx: int) -> int | None:
        for j in sorted_assistant_idxs:
            if j > idx:
                return assistant_ts_by_idx[j]
        return None

    # Tool latency = wall_clock gap from this assistant_tool_call to the
    # NEXT assistant turn; tool_result turns lack their own clock. This is
    # the operator-facing roundtrip (tool exec + LLM follow-up), not pure
    # tool exec time.
    tool_calls_summary: list[TranscriptToolCall] = []
    for assistant_event in tool_call_events:
        a_idx = assistant_event.get("index")
        a_ts = assistant_ts_by_idx.get(a_idx) if isinstance(a_idx, int) else None
        next_ts = _next_assistant_after(a_idx) if isinstance(a_idx, int) else None
        duration_ms: int | None = None
        if a_ts is not None and next_ts is not None:
            duration_ms = max(0, next_ts - a_ts)
        for tc in assistant_event.get("tool_calls") or []:
            tc_id = tc.get("id")
            if tc_id:
                duration_by_call_id[tc_id] = duration_ms
            tool_calls_summary.append(TranscriptToolCall(
                tool_name=tc.get("name"),
                args=tc.get("arguments"),
                result=tc.get("result"),
                started_at=_ms_to_iso(a_ts),
                ended_at=_ms_to_iso(next_ts),
                duration_ms=duration_ms,
            ))

    per_turn_gaps_ms: list[int] = []
    for i in range(1, len(turn_ms)):
        a, b = turn_ms[i - 1], turn_ms[i]
        if a is not None and b is not None:
            per_turn_gaps_ms.append(max(0, b - a))

    assistant_response_latency_ms: list[int] = []
    pending_user_ms: int | None = None
    for i, e in enumerate(timeline):
        ts = turn_ms[i]
        if e["kind"] == "user_message":
            pending_user_ms = ts
        elif e["kind"] in ("assistant_message", "assistant_tool_call") and pending_user_ms is not None:
            if ts is not None:
                assistant_response_latency_ms.append(max(0, ts - pending_user_ms))
            pending_user_ms = None

    time_to_first_assistant_response_ms: int | None = None
    if anchor_ms is not None:
        for i, e in enumerate(timeline):
            if e["kind"] == "assistant_message" and turn_ms[i] is not None:
                time_to_first_assistant_response_ms = max(0, turn_ms[i] - anchor_ms)
                break

    valid_ts = [t for t in turn_ms if t is not None]
    started_ms = valid_ts[0] if valid_ts else None
    ended_ms = valid_ts[-1] if valid_ts else None
    duration_seconds: int | None = None
    if started_ms is not None and ended_ms is not None:
        duration_seconds = max(0, (ended_ms - started_ms) // 1000)

    tokens = count_role_tokens(timeline)
    summary = TranscriptSummary(
        started_at=_ms_to_iso(started_ms),
        ended_at=_ms_to_iso(ended_ms),
        duration_seconds=duration_seconds,
        turn_count=len(timeline),
        assistant_turn_count=assistant_turn_count,
        user_turn_count=user_turn_count,
        tool_call_count=tool_call_count,
        tool_result_count=tool_result_count,
        time_to_first_assistant_response_ms=time_to_first_assistant_response_ms,
        tool_calls=tool_calls_summary,
        per_turn_gaps_ms=per_turn_gaps_ms,
        assistant_response_latency_ms=assistant_response_latency_ms,
        agent_input_tokens=tokens["agent_input"] or None,
        agent_output_tokens=tokens["agent_output"] or None,
        tool_input_tokens=tokens["tool_input"] or None,
        tool_output_tokens=tokens["tool_output"] or None,
    )
    return summary, duration_by_call_id


def _flatten_to_wire(
    parser_events: list[dict],
    turn_ms: list[int | None],
    duration_by_call_id: dict[str, int | None],
) -> list[TranscriptTimelineEntry]:
    # Parser-event shape != render shape: one assistant_tool_call event can
    # split into a preamble bubble + N per-tool cards. Without the preamble
    # split, broker-facing spoken text would be silently swallowed by the
    # tool card.
    out: list[TranscriptTimelineEntry] = []
    for idx, e in enumerate(parser_events):
        kind = e.get("kind")
        ts = _ms_to_iso(turn_ms[idx]) if idx < len(turn_ms) else None
        if kind == "assistant_message":
            out.append(TranscriptTimelineEntry(
                kind="assistant_message",
                timestamp=ts,
                content=e.get("text"),
            ))
        elif kind == "user_message":
            out.append(TranscriptTimelineEntry(
                kind="user_message",
                timestamp=ts,
                content=e.get("text"),
            ))
        elif kind == "assistant_tool_call":
            preamble = e.get("text")
            if preamble:
                out.append(TranscriptTimelineEntry(
                    kind="assistant_message",
                    timestamp=ts,
                    content=preamble,
                ))
            for tc in e.get("tool_calls") or []:
                tc_id = tc.get("id")
                out.append(TranscriptTimelineEntry(
                    kind="assistant_tool_call",
                    timestamp=ts,
                    tool_name=tc.get("name"),
                    args=tc.get("arguments"),
                    duration_ms=duration_by_call_id.get(tc_id) if tc_id else None,
                ))
        elif kind == "tool_result":
            tr = e.get("tool_result") or {}
            tc_id = tr.get("tool_call_id")
            out.append(TranscriptTimelineEntry(
                kind="tool_result",
                timestamp=ts,
                tool_name=tr.get("name"),
                result=tr.get("result"),
                duration_ms=duration_by_call_id.get(tc_id) if tc_id else None,
            ))
    return out


def _compute_turn_ms(timeline: list[dict]) -> tuple[list[int | None], int | None]:
    # Mirrors per-turn timestamp logic in `_build_summary`; extracted so the
    # router attaches the same anchored axis to wire rows. Duplication is
    # intentional — keeps summary metrics + rendered timeline on one clock.
    anchor_ms: int | None = None
    for e in timeline:
        if e["kind"] in ("assistant_message", "assistant_tool_call") and e.get("wall_clock"):
            anchor_ms = _iso_to_unix_ms(e["wall_clock"])
            break
    turn_ms: list[int | None] = []
    last_known_ms: int | None = None
    for e in timeline:
        ts: int | None = None
        wc_ms = _event_unix_ms(e)
        if wc_ms is not None:
            ts = wc_ms
        elif e["kind"] == "user_message" and anchor_ms is not None:
            offset = e.get("offset_ms") or {}
            start = offset.get("start") if isinstance(offset, dict) else None
            if isinstance(start, (int, float)):
                ts = anchor_ms + int(start)
        elif e["kind"] == "tool_result" and last_known_ms is not None:
            ts = last_known_ms
        if ts is not None:
            last_known_ms = ts
        turn_ms.append(ts)
    return turn_ms, anchor_ms


def _ms_to_iso(ms: int | None) -> str | None:
    if ms is None:
        return None
    from datetime import datetime, timezone
    dt = datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


@router.get(
    "/v1/calls/{call_id}/timeline",
    dependencies=[Depends(require_api_key)],
    response_model=TranscriptTimelineResponse,
)
async def get_timeline(call_id: str) -> TranscriptTimelineResponse:
    call = await get_call_by_id(call_id)
    if call is None:
        raise HTTPException(status_code=404, detail="transcript not available for this call")

    transcript = _coerce_transcript(call.get("transcript"))
    if transcript is None:
        raise HTTPException(status_code=404, detail="transcript not available for this call")

    parsed = parse_transcript(transcript)
    timeline = parsed.get("events") or []
    if not timeline:
        raise HTTPException(status_code=404, detail="transcript not available for this call")

    # Two-pass: (1) summary derives duration_by_call_id from parser events;
    # (2) wire flatten splits preambles → larger row count. turn_count is
    # overwritten with wire-row length so dashboard "{N} turns" matches what
    # the user actually sees rendered.
    turn_ms, anchor_ms = _compute_turn_ms(timeline)
    summary, duration_by_call_id = _build_summary(timeline, turn_ms, anchor_ms)
    wire_timeline = _flatten_to_wire(timeline, turn_ms, duration_by_call_id)
    summary.turn_count = len(wire_timeline)
    return TranscriptTimelineResponse(
        call_id=call_id,
        timeline=wire_timeline,
        summary=summary,
    )

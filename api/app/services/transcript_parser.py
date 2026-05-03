from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any


_LANG_PREFIX = "[en] "


# HR turn IDs are UUIDv7 — first 48 bits encode unix-ms wall-clock. Only source
# of per-turn timestamps since HR transcript JSON omits explicit timestamps.
def _decode_uuidv7_wall_clock(turn_id: str | None) -> str | None:
    if not turn_id or not isinstance(turn_id, str):
        return None
    # Position 14 = version nibble; bail if not v7 to avoid decoding random bits as time.
    if len(turn_id) < 15 or turn_id[14] != "7":
        return None
    hex_only = turn_id.replace("-", "")
    if len(hex_only) < 12:
        return None
    try:
        unix_ms = int(hex_only[:12], 16)
    except ValueError:
        return None
    seconds = unix_ms / 1000.0
    dt = datetime.fromtimestamp(seconds, tz=timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def _try_parse_json(raw: Any) -> Any:
    if not isinstance(raw, str):
        return raw
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return raw


def _strip_lang_prefix(content: str | None) -> str | None:
    if content is None:
        return None
    if content.startswith(_LANG_PREFIX):
        return content[len(_LANG_PREFIX):]
    return content


def _iso_to_unix_ms(iso: str) -> int | None:
    try:
        dt = datetime.strptime(iso, "%Y-%m-%dT%H:%M:%S.%fZ")
    except ValueError:
        return None
    return int(dt.replace(tzinfo=timezone.utc).timestamp() * 1000)


# Normalizes HR's mixed assistant/user/tool turn array into a flat event stream;
# stitches tool_results back to the assistant_tool_call event via tool_call_id.
def parse_transcript(turns: list[dict]) -> dict:
    events: list[dict] = []
    tool_call_owner: dict[str, int] = {}
    first_wall_clock: str | None = None
    last_wall_clock: str | None = None
    last_user_end_ms: int | None = None
    tool_call_count = 0

    for turn in turns:
        role = turn.get("role")
        turn_id = turn.get("id")
        content = turn.get("content")
        wall_clock = _decode_uuidv7_wall_clock(turn_id) if role == "assistant" else None

        if wall_clock:
            if first_wall_clock is None:
                first_wall_clock = wall_clock
            last_wall_clock = wall_clock

        if role == "assistant":
            tool_calls_raw = turn.get("tool_calls") or []
            text = _strip_lang_prefix(content)

            if tool_calls_raw:
                parsed_tool_calls: list[dict] = []
                for tc in tool_calls_raw:
                    fn = tc.get("function") or {}
                    tc_id = tc.get("id")
                    parsed_tool_calls.append({
                        "id": tc_id,
                        "name": fn.get("name"),
                        "arguments": _try_parse_json(fn.get("arguments")),
                        "result": None,
                    })
                    if tc_id:
                        tool_call_owner[tc_id] = len(events)
                    tool_call_count += 1

                events.append({
                    "index": len(events),
                    "kind": "assistant_tool_call",
                    "wall_clock": wall_clock,
                    "offset_ms": None,
                    "role": "assistant",
                    "text": text,
                    "raw_content": content,
                    "tool_calls": parsed_tool_calls,
                })
            else:
                events.append({
                    "index": len(events),
                    "kind": "assistant_message",
                    "wall_clock": wall_clock,
                    "offset_ms": None,
                    "role": "assistant",
                    "text": text,
                    "raw_content": content,
                })

        elif role == "user":
            start = turn.get("start")
            end = turn.get("end")
            offset = None
            if isinstance(start, (int, float)) and isinstance(end, (int, float)):
                offset = {"start": int(start), "end": int(end)}
                last_user_end_ms = int(end)
            events.append({
                "index": len(events),
                "kind": "user_message",
                "wall_clock": None,
                "offset_ms": offset,
                "role": "user",
                "text": content,
                "raw_content": content,
            })

        elif role == "tool":
            tool_call_id = turn.get("tool_call_id")
            name = turn.get("name")
            parsed_result = _try_parse_json(content)

            if tool_call_id and tool_call_id in tool_call_owner:
                owner_idx = tool_call_owner[tool_call_id]
                for tc in events[owner_idx].get("tool_calls", []):
                    if tc["id"] == tool_call_id:
                        tc["result"] = parsed_result

            events.append({
                "index": len(events),
                "kind": "tool_result",
                "wall_clock": None,
                "offset_ms": None,
                "role": "tool",
                "text": None,
                "raw_content": content,
                "tool_result": {
                    "tool_call_id": tool_call_id,
                    "name": name,
                    "result": parsed_result,
                },
            })

    duration_ms: int | None = None
    if last_user_end_ms is not None:
        duration_ms = last_user_end_ms
    elif first_wall_clock and last_wall_clock and last_wall_clock != first_wall_clock:
        first_ms = _iso_to_unix_ms(first_wall_clock)
        last_ms = _iso_to_unix_ms(last_wall_clock)
        if first_ms is not None and last_ms is not None:
            duration_ms = last_ms - first_ms

    return {
        "call_started_at": first_wall_clock,
        "duration_ms": duration_ms,
        "turn_count": len(events),
        "tool_call_count": tool_call_count,
        "events": events,
    }

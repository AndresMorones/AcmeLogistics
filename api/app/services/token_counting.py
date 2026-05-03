from __future__ import annotations

from typing import Any

try:
    import tiktoken

    # o200k_base matches gpt-4o / gpt-4.1 family used by the voice agent.
    # Wrong encoding silently undercounts tokens by ~10-15% — TPM dashboard
    # would lie. TOKEN_METHOD is surfaced in /telemetry so we know which path ran.
    _ENCODER = tiktoken.get_encoding("o200k_base")

    def _count(text: str) -> int:
        return len(_ENCODER.encode(text))

    TOKEN_METHOD = "tiktoken_o200k_base"
except Exception:  # noqa: BLE001
    # Fallback when tiktoken wheel missing (slim Docker base): chars/4 is the
    # OpenAI-published rough heuristic. Inaccurate but keeps telemetry alive
    # rather than crashing the whole aggregation.
    _ENCODER = None

    def _count(text: str) -> int:
        return max(0, len(text) // 4)

    TOKEN_METHOD = "char_count_fallback"


def _coerce_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    try:
        import json

        return json.dumps(value, separators=(",", ":"), ensure_ascii=False)
    except (TypeError, ValueError):
        return str(value)


def count_role_tokens(timeline: list[dict]) -> dict[str, int]:
    totals = {
        "agent_input": 0,
        "agent_output": 0,
        "tool_input": 0,
        "tool_output": 0,
    }
    for e in timeline or []:
        kind = e.get("kind")
        if kind == "user_message":
            totals["agent_input"] += _count(_coerce_text(e.get("text")))
        elif kind == "assistant_message":
            totals["agent_output"] += _count(_coerce_text(e.get("text")))
        elif kind == "assistant_tool_call":
            preamble = e.get("text")
            if preamble:
                totals["agent_output"] += _count(_coerce_text(preamble))
            for tc in e.get("tool_calls") or []:
                totals["tool_input"] += _count(_coerce_text(tc.get("arguments")))
        elif kind == "tool_result":
            tr = e.get("tool_result") or {}
            totals["tool_output"] += _count(_coerce_text(tr.get("result")))
    return totals

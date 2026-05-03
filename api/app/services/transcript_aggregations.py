from __future__ import annotations

import bisect
import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog

from app.services.calls_store import list_calls
# Telemetry is transcript-only. The upstream HR /runs latency API was retired;
# we recompute everything from transcript wall-clock here. test_transcript_aggregations.py
# guards the contracts below — change a constant, expect a green/red diff to reason about.
from app.services.dashboard_aggregations import _cached_call, _within_window
from app.services.token_counting import count_role_tokens
from app.services.transcript_parser import _iso_to_unix_ms, parse_transcript

log = structlog.get_logger()


def _parse_dt(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError:
            return None
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    return None


def _latency_percentiles(latencies_ms: list[float]) -> dict[str, float | None]:
    # Linear interpolation between order statistics (numpy-default / "linear"
    # method). Matches what dashboards using numpy.percentile produce — keeps
    # the API parity-checkable against quick notebook validation.
    if not latencies_ms:
        return {"p50": None, "p70": None, "p90": None, "p99": None}
    s = sorted(float(v) for v in latencies_ms)
    if len(s) == 1:
        # Single sample: p99 == p50; surface real value rather than None so the
        # "small N but exists" UI state stays distinct from "no data".
        return {"p50": s[0], "p70": s[0], "p90": s[0], "p99": s[0]}

    def pct(p: float) -> float:
        k = (len(s) - 1) * (p / 100.0)
        lo = int(k)
        hi = min(lo + 1, len(s) - 1)
        return s[lo] + (s[hi] - s[lo]) * (k - lo)

    return {"p50": pct(50), "p70": pct(70), "p90": pct(90), "p99": pct(99)}


def _mean(samples: list[float]) -> float | None:
    if not samples:
        return None
    return sum(samples) / len(samples)


def _stddev(samples: list[float]) -> float | None:
    if len(samples) < 2:
        return None
    m = sum(samples) / len(samples)
    var = sum((x - m) ** 2 for x in samples) / len(samples)
    return var ** 0.5


# HR built-in terminal tools: fire-and-forget, by design never produce a
# tool_result. Counting their missing result as a "timeout" inflates the error
# rate by ~1/call on every happy path.
_TERMINAL_TOOL_NAMES: frozenset[str] = frozenset(
    {"_hangup", "hangup", "finalize_call", "end_call", "transfer_call"}
)


def _is_terminal_tool(name: str | None) -> bool:
    if not name:
        return False
    return name.strip().lower() in _TERMINAL_TOOL_NAMES


def _is_tool_failure(result: Any) -> bool:
    # Multi-shape tolerance: HR tool results arrive as None / "" / "error: ..." /
    # {"status_code": 500} / {"error": "...", "rows": [...]}. The last shape is
    # the trap — Twin returns rows alongside non-fatal warnings; we must NOT
    # flag those as failures or the error rate inflates on every paginated read.
    if result is None:
        return True

    if isinstance(result, str):
        s = result.strip().lower()
        if not s:
            return True
        return s.startswith(("error", "timeout", "{\"error\"", "exception"))

    if not isinstance(result, dict):
        return False

    if not result:
        return True

    status_code = result.get("status_code")
    if isinstance(status_code, (int, float)) and status_code >= 400:
        return True

    err = result.get("error") or result.get("errors")
    # Business-payload override: error key is a warning iff a recognized
    # success field also exists. See _BUSINESS_PAYLOAD_KEYS for the whitelist.
    if err and not _has_business_payload(result):
        if isinstance(err, str) and err.strip():
            return True
        if isinstance(err, dict) and err:
            return True
        if isinstance(err, list) and any(err):
            return True

    return False


# Whitelist of keys that prove a tool actually produced useful data. Curated
# from observed real tool responses (verify_carrier, query_loads, calculate_rate,
# book_load). Add ONLY after seeing a real success payload — false positives
# mask actual failures from the error-rate metric.
_BUSINESS_PAYLOAD_KEYS: frozenset[str] = frozenset(
    {
        "content",
        "carrier",
        "rows",
        "count",
        "data",
        "result",
        "results",
        "success",
        "table",
        "final_floor",
        "urgency_tier",
        "load_id",
        "loadboard_rate",
    }
)


def _has_business_payload(result: dict) -> bool:
    return any(k in result for k in _BUSINESS_PAYLOAD_KEYS)


def _tool_error_count(events: list[dict]) -> tuple[int, int]:
    attempts = 0
    failures = 0
    results_by_id: dict[str, Any] = {}
    for e in events:
        if e.get("kind") == "tool_result":
            tr = e.get("tool_result") or {}
            tcid = tr.get("tool_call_id")
            if tcid:
                results_by_id[tcid] = tr.get("result")
    for e in events:
        if e.get("kind") != "assistant_tool_call":
            continue
        for tc in e.get("tool_calls") or []:
            name = tc.get("name") if isinstance(tc, dict) else None
            if _is_terminal_tool(name):
                continue
            tcid = tc.get("id")
            attempts += 1
            if tcid not in results_by_id:
                failures += 1
                continue
            if _is_tool_failure(results_by_id[tcid]):
                failures += 1
    return failures, attempts


def _coerce_transcript(raw: Any) -> list[dict] | None:
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            decoded = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            return None
        return decoded if isinstance(decoded, list) else None
    return None


def _tool_call_durations_ms(events: list[dict]) -> list[tuple[str | None, float]]:
    # Tool turns carry no timestamp; estimate latency as gap from
    # assistant_tool_call wall-clock to the NEXT assistant turn's wall-clock.
    # That includes tool execution + LLM follow-up generation.
    assistant_ts_by_idx: dict[int, int] = {}
    for i, e in enumerate(events):
        kind = e.get("kind")
        if kind in ("assistant_message", "assistant_tool_call"):
            wc = e.get("wall_clock")
            if wc:
                ms = _iso_to_unix_ms(wc)
                if ms is not None:
                    assistant_ts_by_idx[i] = ms

    sorted_assistant_idxs = sorted(assistant_ts_by_idx)

    # bisect over event indices (not timestamps) — guarantees we pick the next
    # assistant turn in transcript order, not chronological order. They diverge
    # rarely but reliably when HR replays a turn out of sequence.
    def _next_assistant_after(i: int) -> int | None:
        pos = bisect.bisect_right(sorted_assistant_idxs, i)
        if pos >= len(sorted_assistant_idxs):
            return None
        return assistant_ts_by_idx[sorted_assistant_idxs[pos]]

    durations: list[tuple[str | None, float]] = []
    for i, e in enumerate(events):
        if e.get("kind") != "assistant_tool_call":
            continue
        a_ts = assistant_ts_by_idx.get(i)
        if a_ts is None:
            continue
        next_ts = _next_assistant_after(i)
        if next_ts is None:
            continue
        gap = float(max(0, next_ts - a_ts))
        tool_calls = e.get("tool_calls") or [None]
        for tc in tool_calls:
            name = tc.get("name") if isinstance(tc, dict) else None
            durations.append((name, gap))
    return durations


def _bucket_floor(dt: datetime, bucket_minutes: int) -> datetime:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    minute = (dt.minute // bucket_minutes) * bucket_minutes
    return dt.replace(minute=minute, second=0, microsecond=0)


def _fill_continuous(
    buckets: dict[datetime, int], bucket_minutes: int, key: str
) -> list[dict[str, Any]]:
    # Forward-fill 0-rate gaps: telemetry chart needs a point per bucket so
    # silent windows render as flat-zero, not a diagonal-stitch over missing keys.
    if not buckets:
        return []
    start, end = min(buckets), max(buckets)
    step = timedelta(minutes=bucket_minutes)
    out: list[dict[str, Any]] = []
    cur = start
    while cur <= end:
        # Counts per bucket → per-minute rate (RPM/TPM); divisor protects against
        # bucket-size changes accidentally rescaling all historical chart values.
        rate = float(buckets.get(cur, 0)) / float(bucket_minutes)
        out.append({"t": cur.isoformat(), key: rate})
        cur = cur + step
    return out


def _normalize_window(
    from_: datetime | None, to_: datetime | None, default_days: int = 30
) -> tuple[datetime, datetime]:
    now = datetime.now(timezone.utc)
    end = to_ or now
    start = from_ or (end - timedelta(days=default_days))
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    return start, end


async def _aggregate_uncached(
    from_: datetime | None,
    to_: datetime | None,
    max_runs: int,
    bucket_minutes: int,
) -> dict[str, Any]:
    if bucket_minutes <= 0:
        raise ValueError("bucket_minutes must be > 0")

    window_from, window_to = _normalize_window(from_, to_)

    raw_rows = await list_calls(limit=500)
    in_window = [r for r in raw_rows if _within_window(r, window_from, window_to)][:max_runs]

    pooled_durations: list[float] = []
    rpm_buckets: dict[datetime, int] = defaultdict(int)
    tpm_buckets: dict[datetime, int] = defaultdict(int)
    latency_buckets: dict[datetime, list[float]] = defaultdict(list)
    pool_by_tool: dict[str, list[float]] = defaultdict(list)
    bucket_by_tool: dict[str, dict[datetime, list[float]]] = defaultdict(
        lambda: defaultdict(list)
    )
    tool_failures = 0
    tool_attempts = 0
    runs_count = 0

    for row in in_window:
        transcript = _coerce_transcript(row.get("transcript"))
        if transcript is None:
            continue
        try:
            parsed = parse_transcript(transcript)
        except Exception as e:  # noqa: BLE001
            log.warning(
                "transcript_aggregations.parse_failed",
                call_id=row.get("call_id"),
                error=str(e),
            )
            continue

        events = parsed.get("events") or []
        runs_count += 1
        call_durations = _tool_call_durations_ms(events)
        pooled_durations.extend(d for _, d in call_durations)
        f, a = _tool_error_count(events)
        tool_failures += f
        tool_attempts += a

        bucket_dt = _parse_dt(parsed.get("call_started_at")) or _parse_dt(
            row.get("created_at")
        )
        if bucket_dt is None:
            continue
        b = _bucket_floor(bucket_dt, bucket_minutes)
        user_turns = sum(1 for e in events if e.get("kind") == "user_message")
        role_tokens = count_role_tokens(events)
        rpm_buckets[b] += user_turns
        tpm_buckets[b] += sum(role_tokens.values())
        for tool_name, gap in call_durations:
            latency_buckets[b].append(gap)
            # Heal HR drift artifact: some forks emit `book_load_` with
            # trailing underscore. Strip so historical rows roll up under
            # canonical name alongside future-fixed rows.
            tn = (tool_name or "unknown").strip().rstrip("_") or "unknown"
            pool_by_tool[tn].append(gap)
            bucket_by_tool[tn][b].append(gap)

    pcts = _latency_percentiles(pooled_durations)
    sample_count = len(pooled_durations)

    def _series_from_buckets(
        buckets: dict[datetime, list[float]]
    ) -> list[dict[str, Any]]:
        if not buckets:
            return []
        s, e = min(buckets), max(buckets)
        step = timedelta(minutes=bucket_minutes)
        out: list[dict[str, Any]] = []
        cur = s
        while cur <= e:
            samples = buckets.get(cur, [])
            point: dict[str, Any] = {"t": cur.isoformat(), "n": len(samples)}
            if samples:
                p = _latency_percentiles(samples)
                point.update(
                    {
                        "p50_ms": p["p50"],
                        "p70_ms": p["p70"],
                        "p90_ms": p["p90"],
                        "p99_ms": p["p99"],
                    }
                )
            else:
                point.update({"p50_ms": None, "p70_ms": None, "p90_ms": None, "p99_ms": None})
            out.append(point)
            cur = cur + step
        return out

    latency_series = _series_from_buckets(latency_buckets)
    latency_by_tool: dict[str, dict[str, Any]] = {}
    for tool_name, samples in pool_by_tool.items():
        tp = _latency_percentiles(samples)
        latency_by_tool[tool_name] = {
            "sample_count": len(samples),
            "p50_ms": tp["p50"],
            "p70_ms": tp["p70"],
            "p90_ms": tp["p90"],
            "p99_ms": tp["p99"],
            "mean_ms": _mean(samples),
            "stddev_ms": _stddev(samples),
            "series": _series_from_buckets(bucket_by_tool[tool_name]),
        }

    log.info(
        "transcript_aggregations.aggregated",
        runs_count=runs_count,
        sample_count=sample_count,
        window_from=window_from.isoformat(),
        window_to=window_to.isoformat(),
    )

    return {
        "window": {
            "from": window_from.isoformat(),
            "to": window_to.isoformat(),
            "bucket_minutes": bucket_minutes,
        },
        "totals": {
            "runs": runs_count,
            "node_samples": sample_count,
            "tool_attempts": tool_attempts,
            "tool_failures": tool_failures,
            "tool_error_rate_pct": (
                round(100 * tool_failures / tool_attempts, 1)
                if tool_attempts > 0
                else None
            ),
        },
        "rpm_series": _fill_continuous(rpm_buckets, bucket_minutes, "rpm"),
        "tpm_series": _fill_continuous(tpm_buckets, bucket_minutes, "tpm"),
        "latency": {
            "phase": "phase2",
            "source": "transcript",
            "sample_count": sample_count,
            "p50_ms": pcts["p50"],
            "p70_ms": pcts["p70"],
            "p90_ms": pcts["p90"],
            "p99_ms": pcts["p99"],
        },
        "latency_series": latency_series,
        "latency_by_tool": latency_by_tool,
    }


async def aggregate_telemetry_from_transcripts(
    from_: datetime | None = None,
    to_: datetime | None = None,
    max_runs: int = 200,
    bucket_minutes: int = 1,
) -> dict[str, Any]:
    # 30s TTL via shared dashboard cache. Key includes bucket_minutes
    # + max_runs so re-bucketed/expanded queries don't hit a stale narrower entry.
    # `telemetry_v2:` prefix protects against legacy v1-shape entries surviving
    # a hot deploy if an old worker were ever to share the cache.
    from_iso = from_.isoformat() if from_ else "none"
    until_iso = to_.isoformat() if to_ else "none"
    key = f"telemetry_v2:{from_iso}|{until_iso}|{bucket_minutes}|{max_runs}"
    return await _cached_call(
        key, _aggregate_uncached, from_, to_, max_runs, bucket_minutes
    )


__all__ = ["aggregate_telemetry_from_transcripts"]

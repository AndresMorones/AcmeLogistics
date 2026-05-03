from __future__ import annotations

import asyncio
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from statistics import mean
from typing import Any, Awaitable, Callable, Iterable

from cachetools import TTLCache

from app.services.twin_client import twin_client


# 30s TTL is the demo-grade compromise (matches the dashboard ISR window). Short
# enough that a fresh call shows up "live" within a polling cycle; long enough to
# absorb the dashboard's ~20-30 metric fanout per refresh into a single Twin pull
# per metric. Webhook invalidation (invalidate_dashboard_cache) covers writes within the window.
_DASHBOARD_CACHE_TTL_SECONDS = 30
_DASHBOARD_CACHE_MAXSIZE = 512

_dashboard_cache: TTLCache = TTLCache(
    maxsize=_DASHBOARD_CACHE_MAXSIZE, ttl=_DASHBOARD_CACHE_TTL_SECONDS
)
# Single lock around the cache: cheap because TTLCache mutations are O(1) and
# we do all heavy I/O OUTSIDE the lock (see _cached_call). A per-key lock would
# eliminate dogpile but isn't worth the complexity at current QPS.
_cache_lock = asyncio.Lock()


def _waf_safe_dt(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def _window_clause_disabled(*args, **kwargs) -> str:
    """No-op stub. Returns "" because Cloudflare WAF in front of Twin
    blocks WHERE/AND/OR + quoted date literals. Date filtering happens
    in Python via _within_window after pulling all rows.
    Kept as a positional placeholder in SQL composition signatures.
    """
    # Do NOT inline this back into SQL — every WAF probe we ran rejects
    # `WHERE created_at > 'YYYY-...'`. Removing the stub reverts the
    # original 403-on-prod outage.
    return ""


def _filter_key(from_: datetime | None, to_: datetime | None) -> str:
    a = from_.isoformat() if from_ else None
    b = to_.isoformat() if to_ else None
    return f"from={a or 'none'}|to={b or 'none'}"


async def _cached_call(
    key: str,
    fn: Callable[..., Awaitable[Any]],
    *args: Any,
    **kwargs: Any,
) -> Any:
    # Read/write under lock; compute OUTSIDE lock so a slow Twin call can't
    # stall every other dashboard endpoint. Two concurrent misses can race and
    # both compute — accepted: the second write just overwrites with same value.
    async with _cache_lock:
        if key in _dashboard_cache:
            return _dashboard_cache[key]
    result = await fn(*args, **kwargs)
    async with _cache_lock:
        _dashboard_cache[key] = result
    return result


def invalidate_dashboard_cache() -> None:
    _dashboard_cache.clear()


def dashboard_cache_stats() -> dict[str, int]:
    return {
        "currsize": len(_dashboard_cache),
        "maxsize": _dashboard_cache.maxsize,
        "ttl_seconds": int(_dashboard_cache.ttl),
    }


_OUTCOME_ENUMS = ("load_booked", "no_match", "carrier_not_qualified", "call_abandoned")
_AUDIT_KEYWORDS = (
    "fmcsa",
    "inactive",
    "tool",
    "fail",
    "confus",
    "hallucin",
    "declined",
    "unclear",
    "abandoned",
)
_ALERT_AUDIT_REGEX = re.compile(r"tool|fail|confus|hallucin|inactive|fmcsa", re.IGNORECASE)


def _first(*values: Any) -> Any:
    for v in values:
        if v not in (None, ""):
            return v
    return None


def _outcome(r: dict[str, Any]) -> str | None:
    return _first(r.get("call_outcome"), r.get("outcome"), r.get("classification"))


def _sentiment(r: dict[str, Any]) -> str | None:
    return _first(
        r.get("sentiment"),
        r.get("sentiment_classification"),
        r.get("sentiment_end"),
        r.get("real_time_sentiment_classifier"),
    )


def _to_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def _to_int(v: Any) -> int | None:
    f = _to_float(v)
    if f is None:
        return None
    try:
        return int(f)
    except (ValueError, TypeError):
        return None


def _apply_rate(r: dict[str, Any]) -> float | None:
    return _to_float(r.get("apply_rate"))


def _case_health(r: dict[str, Any]) -> int | None:
    return _to_int(r.get("case_health_score"))


def _latency(r: dict[str, Any]) -> float | None:
    return _to_float(r.get("p90_latency_ms"))


def _duration(r: dict[str, Any]) -> int | None:
    v = _first(r.get("duration_seconds"), r.get("duration"))
    return _to_int(v)


def _parse_dt(v: Any) -> datetime | None:
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    if isinstance(v, str):
        s = v.strip().replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(s)
        except ValueError:
            return None
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    return None


def _created_at(r: dict[str, Any]) -> datetime | None:
    return _parse_dt(r.get("created_at"))


def _within_window(
    r: dict[str, Any],
    from_: datetime | None,
    to_: datetime | None,
) -> bool:
    if from_ is None and to_ is None:
        return True
    ca = _created_at(r)
    if ca is None:
        return False
    if from_ is not None and ca < from_:
        return False
    if to_ is not None and ca > to_:
        return False
    return True


def _sorted_by_created(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        rows,
        key=lambda r: _created_at(r) or datetime.min.replace(tzinfo=timezone.utc),
    )


def _percentile(values: list[float], pct: float) -> float | None:
    # Linear-interpolation percentile (numpy default). Match transcript_aggregations
    # so per-call vs. dashboard-pooled stats are directly comparable.
    if not values:
        return None
    s = sorted(values)
    if len(s) == 1:
        return s[0]
    k = (len(s) - 1) * (pct / 100.0)
    lo = int(k)
    hi = min(lo + 1, len(s) - 1)
    frac = k - lo
    return s[lo] + (s[hi] - s[lo]) * frac


def apply_filters(
    rows: list[dict[str, Any]],
    from_: str | None = None,
    to_: str | None = None,
    outcome: str | None = None,
    sentiment: str | None = None,
    q: str | None = None,
) -> list[dict[str, Any]]:
    dt_from = _parse_dt(from_) if from_ else None
    dt_to = _parse_dt(to_) if to_ else None
    q_norm = q.strip().lower() if q else None

    out: list[dict[str, Any]] = []
    for r in rows:
        if dt_from or dt_to:
            ca = _created_at(r)
            if ca is None:
                continue
            if dt_from and ca < dt_from:
                continue
            if dt_to and ca > dt_to:
                continue
        if outcome and _outcome(r) != outcome:
            continue
        if sentiment and _sentiment(r) != sentiment:
            continue
        if q_norm:
            mc = str(r.get("mc_number") or "").lower()
            name = str(r.get("carrier_name") or "").lower()
            if q_norm not in mc and q_norm not in name:
                continue
        out.append(r)
    return out


def outcome_trend(rows: list[dict[str, Any]], days: int = 30) -> dict[str, Any]:
    today = datetime.now(timezone.utc).date()
    labels = [(today - timedelta(days=days - 1 - i)).isoformat() for i in range(days)]
    label_idx = {lbl: i for i, lbl in enumerate(labels)}
    series: dict[str, list[int]] = {k: [0] * days for k in _OUTCOME_ENUMS}

    for r in rows:
        ca = _created_at(r)
        if ca is None:
            continue
        key = ca.date().isoformat()
        idx = label_idx.get(key)
        if idx is None:
            continue
        oc = _outcome(r)
        if oc in series:
            series[oc][idx] += 1

    return {"labels": labels, "series": series}


def chs_distribution(rows: list[dict[str, Any]]) -> dict[str, Any]:
    buckets = ["0-20", "20-40", "40-60", "60-80", "80-100"]
    counts = [0] * 5
    for r in rows:
        v = _case_health(r)
        if v is None:
            continue
        if v < 0:
            v = 0
        if v > 100:
            v = 100
        idx = min(v // 20, 4)
        counts[idx] += 1
    return {"buckets": buckets, "counts": counts}


def apply_rate_histogram(rows: list[dict[str, Any]], bins: int = 10) -> dict[str, Any]:
    vals = [
        v
        for v in (_apply_rate(r) for r in rows if _outcome(r) == "load_booked")
        if v is not None
    ]
    if not vals or bins < 1:
        return {"bin_edges": [], "counts": []}
    lo, hi = min(vals), max(vals)
    if lo == hi:
        return {"bin_edges": [lo, lo + 1.0], "counts": [len(vals)]}
    width = (hi - lo) / bins
    edges = [lo + i * width for i in range(bins + 1)]
    counts = [0] * bins
    for v in vals:
        idx = int((v - lo) / width)
        if idx >= bins:
            idx = bins - 1
        counts[idx] += 1
    return {"bin_edges": edges, "counts": counts}


def fmcsa_decline_breakdown(rows: list[dict[str, Any]]) -> dict[str, Any]:
    counter: Counter = Counter()
    declined = 0
    for r in rows:
        reason = r.get("fmcsa_eligibility_failure_reason")
        if reason:
            counter[str(reason).strip().upper()] += 1
            declined += 1
    # Denominator is ALL filtered calls, not just calls that ran the FMCSA tool.
    # This is intentional — gives "% of total intake that bounced for eligibility",
    # which is what the broker's dashboard cares about. If you want per-tool
    # success rate, see transcript_aggregations.tool_error_rate_pct instead.
    total = len(rows)
    rate = round(declined / total * 100, 2) if total else 0.0
    items = counter.most_common()
    return {
        "reasons": [k for k, _ in items],
        "counts": [v for _, v in items],
        "decline_rate_pct": rate,
    }


def call_volume_heatmap(rows: list[dict[str, Any]]) -> dict[str, Any]:
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    matrix: list[list[int]] = [[0] * 24 for _ in range(7)]
    for r in rows:
        ca = _created_at(r)
        if ca is None:
            continue
        matrix[ca.weekday()][ca.hour] += 1
    return {"matrix": matrix, "days": days, "hours": list(range(24))}


def carrier_rollup(rows: list[dict[str, Any]], top_n: int = 10) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        mc = str(r.get("mc_number") or "").strip()
        if not mc:
            continue
        groups[mc].append(r)

    rollup: list[dict[str, Any]] = []
    for mc, grp in groups.items():
        booked = sum(1 for r in grp if _outcome(r) == "load_booked")
        chs_vals = [v for v in (_case_health(r) for r in grp) if v is not None]
        last_ca = max(
            (_created_at(r) for r in grp if _created_at(r) is not None),
            default=None,
        )
        name = next(
            (r.get("carrier_name") for r in grp if r.get("carrier_name")), None
        )
        rollup.append(
            {
                "mc_number": mc or None,
                "carrier_name": name,
                "call_count": len(grp),
                "booked_count": booked,
                "booking_rate_pct": round(booked / len(grp) * 100, 2) if grp else 0.0,
                "avg_chs": round(mean(chs_vals), 2) if chs_vals else None,
                "last_call_at": last_ca,
            }
        )
    rollup.sort(key=lambda x: (-x["call_count"], -x["booked_count"]))
    return rollup[:top_n]


def agent_version_metrics(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        v = r.get("agent_version") or "unknown"
        groups[str(v)].append(r)

    out: list[dict[str, Any]] = []
    for ver, grp in groups.items():
        booked = sum(1 for r in grp if _outcome(r) == "load_booked")
        chs_vals = [v for v in (_case_health(r) for r in grp) if v is not None]
        out.append(
            {
                "version": ver,
                "call_count": len(grp),
                "booking_rate_pct": round(booked / len(grp) * 100, 2) if grp else 0.0,
                "avg_chs": round(mean(chs_vals), 2) if chs_vals else None,
            }
        )
    out.sort(key=lambda x: -x["call_count"])
    return out


def audit_remarks_clusters(
    rows: list[dict[str, Any]], top_n: int = 5
) -> list[dict[str, Any]]:
    # Substring (not token) match on lowercased text — the agent's audit_remarks
    # field is free-form prose, so "fmcsa" must catch "FMCSA decline" AND
    # "fmcsa-eligibility". A single row can hit multiple keywords (intentional;
    # one issue per cluster column).
    counter: Counter = Counter()
    for r in rows:
        text = r.get("audit_remarks")
        if not text:
            continue
        low = str(text).lower()
        for kw in _AUDIT_KEYWORDS:
            if kw in low:
                counter[kw] += 1
    return [{"tag": k, "count": v} for k, v in counter.most_common(top_n)]


def _avg(vals: Iterable[float]) -> float | None:
    lst = list(vals)
    return mean(lst) if lst else None


def _booking_rate(rows: list[dict[str, Any]]) -> float | None:
    if not rows:
        return None
    booked = sum(1 for r in rows if _outcome(r) == "load_booked")
    return booked / len(rows) * 100.0


def system_alerts(
    rows: list[dict[str, Any]],
    recent_window: int = 20,
    baseline_window: int = 200,
) -> list[dict[str, Any]]:
    # Sliding-window comparison: latest N vs. preceding M (DOES NOT overlap).
    # Slice math relies on negative indexing; if recent_window grows past total
    # row count, `trailing` becomes empty and most alerts fall through as None
    # (intentional — better silent than a panicked false-positive on cold start).
    sorted_rows = _sorted_by_created(rows)
    recent = sorted_rows[-recent_window:]
    trailing = sorted_rows[-(recent_window + baseline_window) : -recent_window]

    if len(recent) < 5:
        names_meta = [
            ("booking_rate_cliff", "page"),
            ("quality_drift", "warn"),
            ("fmcsa_failure_spike", "page"),
            ("duration_outlier_rate", "info"),
            ("audit_keyword_cluster", "warn"),
        ]
        return [
            {
                "name": n,
                "severity": s,
                "value": None,
                "threshold": None,
                "fired": False,
                "detail": "insufficient data",
            }
            for n, s in names_meta
        ]

    alerts: list[dict[str, Any]] = []

    br_recent = _booking_rate(recent)
    br_trailing = _booking_rate(trailing)
    fired_br = False
    detail_br = "ok"
    if br_recent is not None and br_trailing is not None and br_trailing > 0:
        drop = (br_trailing - br_recent) / br_trailing
        # 40% relative drop = "page" severity. Calibrated against demo dataset
        # where normal day-over-day variance sits in the 10-20% band; >40% has
        # never happened without an actual model/prompt regression upstream.
        fired_br = drop > 0.40
        if fired_br:
            detail_br = f"recent={br_recent:.1f}% trailing={br_trailing:.1f}%"
    alerts.append(
        {
            "name": "booking_rate_cliff",
            "severity": "page",
            "value": round(br_recent, 2) if br_recent is not None else None,
            "threshold": 40.0,
            "fired": fired_br,
            "detail": detail_br,
        }
    )

    chs_recent = [v for v in (_case_health(r) for r in recent) if v is not None]
    chs_trailing = [v for v in (_case_health(r) for r in trailing) if v is not None]
    avg_chs_recent = _avg(chs_recent)
    avg_chs_trailing = _avg(chs_trailing)
    fired_qd = False
    detail_qd = "ok"
    if avg_chs_recent is not None and avg_chs_trailing is not None:
        drop = avg_chs_trailing - avg_chs_recent
        fired_qd = drop >= 15
        if fired_qd:
            detail_qd = f"recent={avg_chs_recent:.1f} trailing={avg_chs_trailing:.1f}"
    alerts.append(
        {
            "name": "quality_drift",
            "severity": "warn",
            "value": round(avg_chs_recent, 2) if avg_chs_recent is not None else None,
            "threshold": 15.0,
            "fired": fired_qd,
            "detail": detail_qd,
        }
    )

    fmcsa_fail = sum(
        1 for r in recent if r.get("fmcsa_eligibility_failure_reason")
    )
    pct_fmcsa = fmcsa_fail / len(recent) * 100
    alerts.append(
        {
            "name": "fmcsa_failure_spike",
            "severity": "page",
            "value": round(pct_fmcsa, 2),
            "threshold": 60.0,
            "fired": pct_fmcsa > 60,
            "detail": f"{fmcsa_fail}/{len(recent)} declines",
        }
    )

    out_dur = 0
    for r in recent:
        d = _duration(r)
        if d is None:
            continue
        if d < 15 or d > 480:
            out_dur += 1
    pct_dur = out_dur / len(recent) * 100
    alerts.append(
        {
            "name": "duration_outlier_rate",
            "severity": "info",
            "value": round(pct_dur, 2),
            "threshold": 20.0,
            "fired": pct_dur > 20,
            "detail": f"{out_dur}/{len(recent)} outside 15-480s",
        }
    )

    kw_hits = sum(
        1 for r in recent if r.get("audit_remarks") and _ALERT_AUDIT_REGEX.search(str(r.get("audit_remarks")))
    )
    alerts.append(
        {
            "name": "audit_keyword_cluster",
            "severity": "warn",
            "value": float(kw_hits),
            "threshold": 3.0,
            "fired": kw_hits >= 3,
            "detail": f"{kw_hits} hits in last {len(recent)}",
        }
    )

    return alerts


MetricResult = tuple[float | int | None, int | None]


def _safe_div(num: float | None, den: float | None) -> float | None:
    if num is None or den is None:
        return None
    try:
        d = float(den)
    except (TypeError, ValueError):
        return None
    if d == 0:
        return None
    return float(num) / d


def _safe_count(rows: list[dict[str, Any]] | None) -> int:
    if not rows:
        return 0
    return sum(1 for r in rows if r is not None)


def _scalar(rows: list[dict[str, Any]], key: str) -> Any:
    if not rows:
        return None
    return rows[0].get(key)


async def _total_calls_uncached(
    from_: datetime | None = None,
    to_: datetime | None = None,
) -> MetricResult:
    sql = "SELECT created_at FROM calls_log"
    where = _window_clause_disabled(from_, to_, prefix="WHERE ")
    rows = await twin_client.query(sql + where)
    rows = [r for r in rows if _within_window(r, from_, to_)]
    return len(rows), None


async def total_calls(
    from_: datetime | None = None,
    to_: datetime | None = None,
) -> MetricResult:
    key = f"total_calls:{_filter_key(from_, to_)}"
    return await _cached_call(key, _total_calls_uncached, from_=from_, to_=to_)


async def _total_bookings_uncached(
    from_: datetime | None = None,
    to_: datetime | None = None,
) -> MetricResult:
    sql = "SELECT created_at FROM bookings"
    where = _window_clause_disabled(from_, to_, prefix="WHERE ")
    rows = await twin_client.query(sql + where)
    rows = [r for r in rows if _within_window(r, from_, to_)]
    return len(rows), None


async def total_bookings(
    from_: datetime | None = None,
    to_: datetime | None = None,
) -> MetricResult:
    key = f"total_bookings:{_filter_key(from_, to_)}"
    return await _cached_call(key, _total_bookings_uncached, from_=from_, to_=to_)


async def _calls_without_booking_uncached(
    from_: datetime | None = None,
    to_: datetime | None = None,
) -> MetricResult:
    call_sql = "SELECT call_id, created_at FROM calls_log" + _window_clause_disabled(
        from_, to_, prefix="WHERE "
    )
    booking_sql = "SELECT call_id FROM bookings"

    call_rows = await twin_client.query(call_sql)
    booking_rows = await twin_client.query(booking_sql)

    call_rows = [r for r in call_rows if _within_window(r, from_, to_)]
    booked_ids = {r.get("call_id") for r in booking_rows if r.get("call_id")}
    total = len(call_rows)
    no_booking = sum(
        1 for r in call_rows if r.get("call_id") and r.get("call_id") not in booked_ids
    )
    return no_booking, total


async def calls_without_booking(
    from_: datetime | None = None,
    to_: datetime | None = None,
) -> MetricResult:
    key = f"calls_without_booking:{_filter_key(from_, to_)}"
    return await _cached_call(
        key, _calls_without_booking_uncached, from_=from_, to_=to_
    )


async def bookings_per_booked_call() -> MetricResult:
    rows = await twin_client.query("SELECT call_id FROM bookings")
    if not rows:
        return None, 0
    bookings_int = len(rows)
    distinct_calls = {r.get("call_id") for r in rows if r.get("call_id")}
    basis_int = len(distinct_calls)
    avg = _safe_div(bookings_int, basis_int)
    return (round(avg, 2) if avg is not None else None), basis_int


async def revenue_booked() -> MetricResult:
    rows = await twin_client.query("SELECT apply_rate FROM bookings")
    if not rows:
        return 0.0, 0
    vals: list[float] = []
    for r in rows:
        v = r.get("apply_rate")
        if v is None:
            continue
        try:
            vals.append(float(v))
        except (TypeError, ValueError):
            continue
    return round(sum(vals), 2), len(rows)


async def calls_without_booking_not_exists() -> MetricResult:
    sql = (
        "SELECT COUNT(*) AS n "
        "FROM calls_log c "
        "WHERE NOT EXISTS ("
        "  SELECT 1 FROM bookings b WHERE b.call_id = c.call_id"
        ")"
    )
    rows = await twin_client.query(sql)
    n = _scalar(rows, "n") or 0

    total_rows = await twin_client.query("SELECT COUNT(*) AS n FROM calls_log")
    basis = _scalar(total_rows, "n") or 0
    try:
        return int(n), int(basis)
    except (TypeError, ValueError):
        return 0, 0


async def _outcome_distribution_uncached(
    from_: datetime | None = None,
    to_: datetime | None = None,
) -> dict[str, int]:
    sql = "SELECT call_outcome, created_at FROM calls_log" + _window_clause_disabled(
        from_, to_, prefix="WHERE "
    )
    rows = await twin_client.query(sql)
    rows = [r for r in rows if _within_window(r, from_, to_)]
    out: dict[str, int] = {}
    for r in rows:
        key = r.get("call_outcome") or "unknown"
        out[str(key)] = out.get(str(key), 0) + 1
    return out


async def outcome_distribution(
    from_: datetime | None = None,
    to_: datetime | None = None,
) -> dict[str, int]:
    key = f"outcome_distribution:{_filter_key(from_, to_)}"
    return await _cached_call(
        key, _outcome_distribution_uncached, from_=from_, to_=to_
    )


async def avg_apply_rate() -> float | None:
    sql = "SELECT AVG(apply_rate) AS avg_rate FROM bookings"
    rows = await twin_client.query(sql)
    avg = _scalar(rows, "avg_rate")
    if avg is None:
        return None
    try:
        return round(float(avg), 2)
    except (TypeError, ValueError):
        return None


async def _economics_rate_summary_uncached(
    from_: datetime | None = None,
    to_: datetime | None = None,
) -> dict[str, Any]:
    sql = (
        "SELECT b.apply_rate AS apply_rate, l.loadboard_rate AS loadboard_rate, "
        "b.created_at AS created_at "
        "FROM bookings b JOIN loads l ON l.load_id = b.load_id"
    )
    sql += _window_clause_disabled(from_, to_, column="b.created_at", prefix="WHERE ")
    rows = await twin_client.query(sql)
    rows = [r for r in rows if _within_window(r, from_, to_)]
    if not rows:
        return {
            "avg_loadboard_rate": None,
            "avg_agreed_rate": None,
            "bookings_count": 0,
            "total_revenue": 0.0,
        }

    def _f(v: Any) -> float | None:
        if v is None:
            return None
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    apply_vals = [v for v in (_f(r.get("apply_rate")) for r in rows) if v is not None]
    loadboard_vals = [
        v for v in (_f(r.get("loadboard_rate")) for r in rows) if v is not None
    ]

    return {
        "avg_loadboard_rate": (
            round(sum(loadboard_vals) / len(loadboard_vals), 2)
            if loadboard_vals
            else None
        ),
        "avg_agreed_rate": (
            round(sum(apply_vals) / len(apply_vals), 2) if apply_vals else None
        ),
        "bookings_count": len(rows),
        "total_revenue": round(sum(apply_vals), 2) if apply_vals else 0.0,
    }


async def economics_rate_summary(
    from_: datetime | None = None,
    to_: datetime | None = None,
) -> dict[str, Any]:
    key = f"economics_rate_summary:{_filter_key(from_, to_)}"
    return await _cached_call(
        key, _economics_rate_summary_uncached, from_=from_, to_=to_
    )


async def _sentiment_distribution_uncached(
    from_: datetime | None = None,
    to_: datetime | None = None,
) -> dict[str, int]:
    sql = "SELECT sentiment, created_at FROM calls_log" + _window_clause_disabled(
        from_, to_, prefix="WHERE "
    )
    rows = await twin_client.query(sql)
    rows = [r for r in rows if _within_window(r, from_, to_)]
    out: dict[str, int] = {}
    for r in rows:
        key = r.get("sentiment")
        if not key:
            continue
        out[str(key)] = out.get(str(key), 0) + 1
    return out


async def sentiment_distribution(
    from_: datetime | None = None,
    to_: datetime | None = None,
) -> dict[str, int]:
    key = f"sentiment_distribution:{_filter_key(from_, to_)}"
    return await _cached_call(
        key, _sentiment_distribution_uncached, from_=from_, to_=to_
    )


async def _avg_case_health_uncached(
    from_: datetime | None = None,
    to_: datetime | None = None,
) -> float | None:
    sql = (
        "SELECT case_health_score, created_at "
        "FROM calls_log "
        "WHERE case_health_score IS NOT NULL"
    )
    sql += _window_clause_disabled(from_, to_, prefix="AND ")
    rows = await twin_client.query(sql)
    rows = [r for r in rows if _within_window(r, from_, to_)]
    vals = [v for v in (_to_float(r.get("case_health_score")) for r in rows) if v is not None]
    if not vals:
        return None
    return round(sum(vals) / len(vals), 2)


async def avg_case_health(
    from_: datetime | None = None,
    to_: datetime | None = None,
) -> float | None:
    key = f"avg_case_health:{_filter_key(from_, to_)}"
    return await _cached_call(key, _avg_case_health_uncached, from_=from_, to_=to_)


async def avg_duration_seconds() -> float | None:
    sql = (
        "SELECT AVG(duration_seconds) AS avg_dur "
        "FROM calls_log "
        "WHERE duration_seconds IS NOT NULL"
    )
    rows = await twin_client.query(sql)
    avg = _scalar(rows, "avg_dur")
    if avg is None:
        return None
    try:
        return round(float(avg), 2)
    except (TypeError, ValueError):
        return None


async def fmcsa_decline_count() -> int:
    sql = (
        "SELECT COUNT(*) AS n "
        "FROM calls_log "
        "WHERE fmcsa_eligibility_failure_reason IS NOT NULL"
    )
    rows = await twin_client.query(sql)
    n = _scalar(rows, "n") or 0
    try:
        return int(n)
    except (TypeError, ValueError):
        return 0


async def _operational_summary_uncached(
    from_: datetime | None = None,
    to_: datetime | None = None,
) -> dict[str, float | None]:
    # WAF-safe pattern: pull all rows, filter in Python. Cloudflare WAF blocks
    # both date literals AND aggregate-with-filter combinations, so we cannot
    # push the window down. Acceptable while calls_log < ~10K rows.
    sql = (
        "SELECT duration_seconds, fmcsa_eligibility_failure_reason, call_outcome, created_at "
        "FROM calls_log"
    )
    sql += _window_clause_disabled(from_, to_, prefix="WHERE ")
    rows = await twin_client.query(sql)
    rows = [r for r in rows if _within_window(r, from_, to_)]
    total = len(rows)
    if total == 0:
        return {
            "avg_duration_seconds": None,
            "fmcsa_decline_pct": None,
            "abandon_rate_pct": None,
            "no_match_pct": None,
        }

    durations = [
        v for v in (_to_float(r.get("duration_seconds")) for r in rows) if v is not None
    ]
    fmcsa_fail = sum(
        1 for r in rows if r.get("fmcsa_eligibility_failure_reason") not in (None, "")
    )
    abandoned = sum(
        1 for r in rows if r.get("call_outcome") in ("call_abandoned", "abandoned")
    )
    no_match = sum(1 for r in rows if r.get("call_outcome") == "no_match")

    return {
        "avg_duration_seconds": (
            round(sum(durations) / len(durations), 2) if durations else None
        ),
        "fmcsa_decline_pct": round(fmcsa_fail / total * 100, 2),
        "abandon_rate_pct": round(abandoned / total * 100, 2),
        "no_match_pct": round(no_match / total * 100, 2),
    }


async def operational_summary(
    from_: datetime | None = None,
    to_: datetime | None = None,
) -> dict[str, float | None]:
    key = f"operational_summary:{_filter_key(from_, to_)}"
    return await _cached_call(
        key, _operational_summary_uncached, from_=from_, to_=to_
    )


async def _chs_distribution_sql_uncached(
    from_: datetime | None = None,
    to_: datetime | None = None,
) -> dict[str, int]:
    sql = (
        "SELECT case_health_score, created_at FROM calls_log WHERE case_health_score IS NOT NULL"
    )
    sql += _window_clause_disabled(from_, to_, prefix="AND ")
    rows = await twin_client.query(sql)
    rows = [r for r in rows if _within_window(r, from_, to_)]
    labels = ["0-20", "20-40", "40-60", "60-80", "80-100"]
    counts = [0] * 5
    for r in rows:
        v = r.get("case_health_score")
        if v is None:
            continue
        try:
            score = int(float(v))
        except (TypeError, ValueError):
            continue
        score = max(0, min(score, 100))
        idx = min(score // 20, 4)
        counts[idx] += 1
    return dict(zip(labels, counts))


async def chs_distribution_sql(
    from_: datetime | None = None,
    to_: datetime | None = None,
) -> dict[str, int]:
    key = f"chs_distribution_sql:{_filter_key(from_, to_)}"
    return await _cached_call(
        key, _chs_distribution_sql_uncached, from_=from_, to_=to_
    )


def _safe_pct_change(current: float | None, prior: float | None) -> float | None:
    if current is None or prior is None:
        return None
    try:
        c = float(current)
        p = float(prior)
    except (TypeError, ValueError):
        return None
    if p == 0:
        return None
    return round((c - p) / p * 100, 2)


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


def _date_buckets(start: datetime, end: datetime) -> list[str]:
    days: list[str] = []
    cur = start.date()
    last = end.date()
    while cur <= last:
        days.append(cur.isoformat())
        cur = cur + timedelta(days=1)
    return days


def _empty_sparkline(start: datetime, end: datetime) -> list[dict[str, Any]]:
    return [{"d": d, "v": 0} for d in _date_buckets(start, end)]


def _bucket_dt(value: Any) -> str | None:
    dt = _parse_dt(value)
    if dt is None:
        return None
    return dt.date().isoformat()


async def _calls_window_count(start: datetime, end: datetime) -> int:
    rows = await twin_client.query("SELECT created_at FROM calls_log")
    n = 0
    for r in rows:
        dt = _parse_dt(r.get("created_at"))
        if dt is None:
            continue
        if start <= dt <= end:
            n += 1
    return n


async def calls_prior_period(
    from_: datetime | None, to_: datetime | None
) -> int:
    start, end = _normalize_window(from_, to_)
    span = end - start
    return await _calls_window_count(start - span, end - span)


async def calls_sparkline(
    from_: datetime | None, to_: datetime | None
) -> list[dict[str, Any]]:
    start, end = _normalize_window(from_, to_)
    rows = await twin_client.query("SELECT created_at FROM calls_log")
    counts: dict[str, int] = {d: 0 for d in _date_buckets(start, end)}
    for r in rows:
        dt = _parse_dt(r.get("created_at"))
        if dt is None or dt < start or dt > end:
            continue
        key = dt.date().isoformat()
        if key in counts:
            counts[key] += 1
    return [{"d": d, "v": counts[d]} for d in counts]


async def _bookings_join_rows() -> list[dict[str, Any]]:
    return await twin_client.query(
        "SELECT b.apply_rate AS apply_rate, c.created_at AS created_at "
        "FROM bookings b JOIN calls_log c ON c.call_id = b.call_id"
    )


def _sum_apply_in_window(
    rows: list[dict[str, Any]], start: datetime, end: datetime
) -> float:
    total = 0.0
    for r in rows:
        dt = _parse_dt(r.get("created_at"))
        if dt is None or dt < start or dt > end:
            continue
        v = _to_float(r.get("apply_rate"))
        if v is None:
            continue
        total += v
    return round(total, 2)


async def revenue_prior_period(
    from_: datetime | None, to_: datetime | None
) -> float:
    start, end = _normalize_window(from_, to_)
    span = end - start
    rows = await _bookings_join_rows()
    return _sum_apply_in_window(rows, start - span, end - span)


async def revenue_sparkline(
    from_: datetime | None, to_: datetime | None
) -> list[dict[str, Any]]:
    start, end = _normalize_window(from_, to_)
    rows = await _bookings_join_rows()
    buckets: dict[str, float] = {d: 0.0 for d in _date_buckets(start, end)}
    for r in rows:
        dt = _parse_dt(r.get("created_at"))
        if dt is None or dt < start or dt > end:
            continue
        v = _to_float(r.get("apply_rate"))
        if v is None:
            continue
        key = dt.date().isoformat()
        if key in buckets:
            buckets[key] += v
    return [{"d": d, "v": round(buckets[d], 2)} for d in buckets]


async def duration_prior_period(
    from_: datetime | None, to_: datetime | None
) -> float | None:
    start, end = _normalize_window(from_, to_)
    span = end - start
    rows = await twin_client.query(
        "SELECT created_at, duration_seconds FROM calls_log"
    )
    vals: list[float] = []
    p_start, p_end = start - span, end - span
    for r in rows:
        dt = _parse_dt(r.get("created_at"))
        if dt is None or dt < p_start or dt > p_end:
            continue
        v = _to_float(r.get("duration_seconds"))
        if v is None:
            continue
        vals.append(v)
    return round(sum(vals) / len(vals), 2) if vals else None


async def duration_sparkline(
    from_: datetime | None, to_: datetime | None
) -> list[dict[str, Any]]:
    start, end = _normalize_window(from_, to_)
    rows = await twin_client.query(
        "SELECT created_at, duration_seconds FROM calls_log"
    )
    sums: dict[str, float] = {d: 0.0 for d in _date_buckets(start, end)}
    counts: dict[str, int] = {d: 0 for d in _date_buckets(start, end)}
    for r in rows:
        dt = _parse_dt(r.get("created_at"))
        if dt is None or dt < start or dt > end:
            continue
        v = _to_float(r.get("duration_seconds"))
        if v is None:
            continue
        key = dt.date().isoformat()
        if key in sums:
            sums[key] += v
            counts[key] += 1
    return [
        {"d": d, "v": round(sums[d] / counts[d], 2) if counts[d] else 0.0}
        for d in sums
    ]


async def chs_prior_period(
    from_: datetime | None, to_: datetime | None
) -> float | None:
    start, end = _normalize_window(from_, to_)
    span = end - start
    rows = await twin_client.query(
        "SELECT created_at, case_health_score FROM calls_log"
    )
    vals: list[float] = []
    p_start, p_end = start - span, end - span
    for r in rows:
        dt = _parse_dt(r.get("created_at"))
        if dt is None or dt < p_start or dt > p_end:
            continue
        v = _to_float(r.get("case_health_score"))
        if v is None:
            continue
        vals.append(v)
    return round(sum(vals) / len(vals), 2) if vals else None


async def chs_sparkline(
    from_: datetime | None, to_: datetime | None
) -> list[dict[str, Any]]:
    start, end = _normalize_window(from_, to_)
    rows = await twin_client.query(
        "SELECT created_at, case_health_score FROM calls_log"
    )
    sums: dict[str, float] = {d: 0.0 for d in _date_buckets(start, end)}
    counts: dict[str, int] = {d: 0 for d in _date_buckets(start, end)}
    for r in rows:
        dt = _parse_dt(r.get("created_at"))
        if dt is None or dt < start or dt > end:
            continue
        v = _to_float(r.get("case_health_score"))
        if v is None:
            continue
        key = dt.date().isoformat()
        if key in sums:
            sums[key] += v
            counts[key] += 1
    return [
        {"d": d, "v": round(sums[d] / counts[d], 2) if counts[d] else 0.0}
        for d in sums
    ]


async def effective_delta_series(
    from_: datetime | None, to_: datetime | None
) -> list[dict[str, Any]]:
    start, end = _normalize_window(from_, to_)
    rows = await twin_client.query(
        "SELECT b.apply_rate AS apply_rate, "
        "l.loadboard_rate AS loadboard_rate, "
        "c.created_at AS created_at "
        "FROM bookings b "
        "JOIN loads l ON l.load_id = b.load_id "
        "JOIN calls_log c ON c.call_id = b.call_id"
    )
    sums: dict[str, float] = {d: 0.0 for d in _date_buckets(start, end)}
    counts: dict[str, int] = {d: 0 for d in _date_buckets(start, end)}
    for r in rows:
        dt = _parse_dt(r.get("created_at"))
        if dt is None or dt < start or dt > end:
            continue
        agreed = _to_float(r.get("apply_rate"))
        listed = _to_float(r.get("loadboard_rate"))
        if agreed is None or listed is None:
            continue
        # Sign convention: positive = saved (booked below list), negative =
        # overpaid. Flipping listed/agreed silently inverts every margin chart
        # — UI legend depends on this orientation; do NOT change without a
        # coordinated frontend update.
        delta = listed - agreed
        key = dt.date().isoformat()
        if key in sums:
            sums[key] += delta
            counts[key] += 1
    out: list[dict[str, Any]] = []
    for d in sums:
        n = counts[d]
        out.append(
            {
                "d": d,
                "v": round(sums[d] / n, 2) if n else None,
                "n": n,
            }
        )
    return out

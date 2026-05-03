from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from statistics import mean
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from app.deps import require_api_key
from app.models import (
    AlertResult,
    AvailableLoadRow,
    AvailableLoadsResponse,
    BookingCallSummary,
    BookingLoadSummary,
    CarrierRollupMetrics,
    CarrierRollupRow,
    EconomicsMetrics,
    FunnelMetrics,
    ObservabilityMetrics,
    OperationalMetrics,
    QualityMetrics,
    RecentBookingRow,
    RecentBookingsResponse,
)
from app.services import dashboard_aggregations as agg
from app.services.bookings_store import (
    all_booked_load_ids,
    recent_bookings_window,
)
from app.services.calls_store import get_call_by_id, list_calls
from app.services.load_store import available_loads as available_loads_helper

router = APIRouter(prefix="/v1/dashboard", tags=["dashboard"])


def _first(*values: Any) -> Any:
    for v in values:
        if v not in (None, ""):
            return v
    return None


def _outcome(r: dict[str, Any]) -> str | None:
    return _first(r.get("call_outcome"), r.get("outcome"), r.get("classification"))


_VALID_SENTIMENTS = {"positive", "neutral", "negative"}


def _sentiment(r: dict[str, Any]) -> str | None:
    raw = _first(
        r.get("sentiment"),
        r.get("sentiment_classification"),
        r.get("sentiment_end"),
    )
    if raw is None:
        return None
    val = str(raw).strip().lower()
    return val if val in _VALID_SENTIMENTS else None


def _apply_rate(r: dict[str, Any]) -> float | None:
    # calls_log no longer carries a rate column (one-row-per-call schema); row-mode returns None.
    # SQL-backed economics joins bookings server-side instead — see agg module.
    v = r.get("apply_rate")
    if v is None:
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def _case_health(r: dict[str, Any]) -> int | None:
    v = r.get("case_health_score")
    if v is None or v == "":
        return None
    try:
        return int(float(v))
    except (ValueError, TypeError):
        return None


def _is_booked(r: dict[str, Any]) -> bool:
    return _outcome(r) == "load_booked"


def _funnel_from_rows(rows: list[dict[str, Any]]) -> FunnelMetrics:
    total = len(rows)
    by_outcome: Counter = Counter()
    for r in rows:
        by_outcome[_outcome(r) or "unknown"] += 1
    booked = by_outcome.get("load_booked", 0)
    rate = (booked / total * 100) if total else 0.0
    return FunnelMetrics(
        total_calls=total,
        by_outcome=dict(by_outcome),
        booking_rate_pct=round(rate, 2),
    )


def _effective_delta(
    avg_loadboard: float | None, avg_agreed: float | None
) -> tuple[float | None, float | None]:
    # Sign convention: positive = saved (booked below list), negative = overpaid.
    # Inverting silently corrupts every economics widget — change with extreme care.
    if avg_loadboard is None or avg_agreed is None:
        return None, None
    delta = round(avg_loadboard - avg_agreed, 2)
    if not avg_loadboard:
        return delta, None
    pct = round((avg_loadboard - avg_agreed) / avg_loadboard * 100, 2)
    return delta, pct


def _economics_from_rows(rows: list[dict[str, Any]]) -> EconomicsMetrics:
    apply_vals = [
        v for v in (_apply_rate(r) for r in rows if _is_booked(r)) if v is not None
    ]
    avg_agreed = round(mean(apply_vals), 2) if apply_vals else None
    total_booked_revenue = round(sum(apply_vals), 2) if apply_vals else 0.0
    delta_dollars, delta_pct = _effective_delta(None, avg_agreed)
    return EconomicsMetrics(
        total_calls_with_rate=len(apply_vals),
        avg_loadboard_rate=None,
        avg_agreed_rate=avg_agreed,
        effective_delta_dollars=delta_dollars,
        effective_delta_pct=delta_pct,
        total_revenue_booked=total_booked_revenue,
    )


def _operational_from_rows(rows: list[dict[str, Any]]) -> OperationalMetrics:
    if not rows:
        return OperationalMetrics(
            avg_duration_seconds=None,
            fmcsa_decline_pct=None,
            abandon_rate_pct=None,
            no_match_pct=None,
        )
    durations = [
        v for v in (_to_int_safe(r.get("duration_seconds")) for r in rows) if v is not None
    ]
    avg_dur = round(mean(durations), 2) if durations else None
    total = len(rows)
    fmcsa_fail = sum(1 for r in rows if r.get("fmcsa_eligibility_failure_reason"))
    abandoned = sum(1 for r in rows if _outcome(r) in ("call_abandoned", "abandoned"))
    no_match = sum(1 for r in rows if _outcome(r) == "no_match")
    return OperationalMetrics(
        avg_duration_seconds=avg_dur,
        fmcsa_decline_pct=round(fmcsa_fail / total * 100, 2) if total else None,
        abandon_rate_pct=round(abandoned / total * 100, 2) if total else None,
        no_match_pct=round(no_match / total * 100, 2) if total else None,
    )


def _to_int_safe(v: Any) -> int | None:
    if v is None or v == "":
        return None
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def _quality_from_rows(rows: list[dict[str, Any]]) -> QualityMetrics:
    sentiments = [_sentiment(r) for r in rows]
    sent_dist = dict(Counter(s for s in sentiments if s))
    outcomes = [_outcome(r) for r in rows]
    out_dist = dict(Counter(o for o in outcomes if o))
    chs = [v for v in (_case_health(r) for r in rows) if v is not None]
    avg_chs = round(mean(chs), 2) if chs else None

    bucket_labels = ["0-20", "20-40", "40-60", "60-80", "80-100"]
    bucket_counts = [0] * 5
    for v in chs:
        clamped = max(0, min(int(v), 100))
        idx = min(clamped // 20, 4)
        bucket_counts[idx] += 1
    chs_dist = dict(zip(bucket_labels, bucket_counts))

    remarks = [r["audit_remarks"] for r in rows if r.get("audit_remarks")]
    return QualityMetrics(
        sentiment_distribution=sent_dist,
        outcome_distribution=out_dist,
        chs_distribution=chs_dist,
        avg_case_health_score=avg_chs,
        auditor_remarks_sample=remarks[:5],
    )


@router.get("/funnel", dependencies=[Depends(require_api_key)])
async def funnel(
    from_: Annotated[datetime | None, Query(alias="from")] = None,
    to_: Annotated[datetime | None, Query(alias="to")] = None,
) -> FunnelMetrics:
    total, _ = await agg.total_calls(from_=from_, to_=to_)
    bookings, _ = await agg.total_bookings(from_=from_, to_=to_)
    no_booking, _ = await agg.calls_without_booking(from_=from_, to_=to_)
    by_outcome = await agg.outcome_distribution(from_=from_, to_=to_)
    if not by_outcome:
        # Hidden invariant: synthesize a 2-bucket distribution when the outcome
        # enum is empty so the funnel widget never renders blank during cold starts.
        by_outcome = {
            "load_booked": max(0, (total or 0) - (no_booking or 0)),
            "no_booking": no_booking or 0,
        }
    booking_rate = 0.0
    if total:
        booking_rate = round(((total - (no_booking or 0)) / total) * 100, 2)

    sparkline = await agg.calls_sparkline(from_, to_)
    prior = await agg.calls_prior_period(from_, to_)
    delta = agg._safe_pct_change(total or 0, prior)

    return FunnelMetrics(
        total_calls=total or 0,
        by_outcome=by_outcome,
        booking_rate_pct=booking_rate,
        delta_pct_vs_prior=delta,
        sparkline=sparkline,
    )


@router.get("/economics", dependencies=[Depends(require_api_key)])
async def economics(
    from_: Annotated[datetime | None, Query(alias="from")] = None,
    to_: Annotated[datetime | None, Query(alias="to")] = None,
) -> EconomicsMetrics:
    summary = await agg.economics_rate_summary(from_=from_, to_=to_)
    avg_loadboard = summary["avg_loadboard_rate"]
    avg_agreed = summary["avg_agreed_rate"]
    delta_dollars, delta_pct = _effective_delta(avg_loadboard, avg_agreed)

    sparkline = await agg.revenue_sparkline(from_, to_)
    prior_revenue = await agg.revenue_prior_period(from_, to_)
    revenue_now = summary["total_revenue"] or 0.0
    delta_vs_prior = agg._safe_pct_change(revenue_now, prior_revenue)

    return EconomicsMetrics(
        total_calls_with_rate=summary["bookings_count"] or 0,
        avg_loadboard_rate=avg_loadboard,
        avg_agreed_rate=avg_agreed,
        effective_delta_dollars=delta_dollars,
        effective_delta_pct=delta_pct,
        total_revenue_booked=revenue_now,
        delta_pct_vs_prior=delta_vs_prior,
        sparkline=sparkline,
    )


@router.get("/operational", dependencies=[Depends(require_api_key)])
async def operational(
    from_: Annotated[datetime | None, Query(alias="from")] = None,
    to_: Annotated[datetime | None, Query(alias="to")] = None,
) -> OperationalMetrics:
    summary = await agg.operational_summary(from_=from_, to_=to_)

    sparkline = await agg.duration_sparkline(from_, to_)
    prior_dur = await agg.duration_prior_period(from_, to_)
    delta = agg._safe_pct_change(summary["avg_duration_seconds"], prior_dur)

    return OperationalMetrics(
        avg_duration_seconds=summary["avg_duration_seconds"],
        fmcsa_decline_pct=summary["fmcsa_decline_pct"],
        abandon_rate_pct=summary["abandon_rate_pct"],
        no_match_pct=summary.get("no_match_pct"),
        delta_pct_vs_prior=delta,
        sparkline=sparkline,
    )


@router.get("/quality", dependencies=[Depends(require_api_key)])
async def quality(
    from_: Annotated[datetime | None, Query(alias="from")] = None,
    to_: Annotated[datetime | None, Query(alias="to")] = None,
) -> QualityMetrics:
    sentiment = await agg.sentiment_distribution(from_=from_, to_=to_)
    outcome = await agg.outcome_distribution(from_=from_, to_=to_)
    chs_dist = await agg.chs_distribution_sql(from_=from_, to_=to_)
    avg_chs = await agg.avg_case_health(from_=from_, to_=to_)

    sample_rows = await twin_query_audit_sample(from_=from_, to_=to_)

    sparkline = await agg.chs_sparkline(from_, to_)
    prior_chs = await agg.chs_prior_period(from_, to_)
    delta = agg._safe_pct_change(avg_chs, prior_chs)

    return QualityMetrics(
        sentiment_distribution=sentiment,
        outcome_distribution=outcome,
        chs_distribution=chs_dist,
        avg_case_health_score=avg_chs,
        auditor_remarks_sample=sample_rows,
        delta_pct_vs_prior=delta,
        sparkline=sparkline,
    )


@router.get("/effective-delta", dependencies=[Depends(require_api_key)])
async def effective_delta(
    from_: Annotated[datetime | None, Query(alias="from")] = None,
    to_: Annotated[datetime | None, Query(alias="to")] = None,
) -> dict[str, Any]:
    series = await agg.effective_delta_series(from_, to_)
    return {"series": series}


async def twin_query_audit_sample(
    limit: int = 5,
    from_: datetime | None = None,
    to_: datetime | None = None,
) -> list[str]:
    from app.services.twin_client import twin_client
    sql = (
        "SELECT audit_remarks, created_at FROM calls_log "
        "WHERE audit_remarks IS NOT NULL"
    )
    sql += agg._window_clause_disabled(from_, to_, prefix="AND ")
    rows = await twin_client.query(sql)
    rows.sort(key=lambda r: str(r.get("created_at") or ""), reverse=True)
    return [str(r["audit_remarks"]) for r in rows[:limit] if r.get("audit_remarks")]


async def _resolve_rows(
    rows: list[dict[str, Any]] | None,
    from_: datetime | None = None,
    to_: datetime | None = None,
) -> list[dict[str, Any]]:
    # /observability + /carriers stay row-mode (Python aggregations) on purpose:
    # they compute time-series + clustering not worth re-expressing in SQL at this
    # dataset size. This filter must stay equivalent to agg's window clause or KPIs
    # will diverge from row-mode rollups.
    if rows is not None:
        return rows
    pulled = await list_calls(limit=500)
    if from_ is None and to_ is None:
        return pulled
    return agg.apply_filters(pulled, from_=from_.isoformat() if from_ else None, to_=to_.isoformat() if to_ else None)


@router.get("/observability", dependencies=[Depends(require_api_key)])
async def observability(
    from_: Annotated[datetime | None, Query(alias="from")] = None,
    to_: Annotated[datetime | None, Query(alias="to")] = None,
) -> ObservabilityMetrics:
    rows = await _resolve_rows(None, from_=from_, to_=to_)
    alerts_raw = agg.system_alerts(rows)
    chs = agg.chs_distribution(rows)
    trend = agg.outcome_trend(rows)
    tags = agg.audit_remarks_clusters(rows)

    chs_series = [float(c) for c in chs["counts"]]
    days = len(trend["labels"]) or 1
    booking_series: list[float] = []
    for i in range(days):
        booked = trend["series"]["load_booked"][i]
        total_day = sum(trend["series"][k][i] for k in trend["series"])
        booking_series.append(
            round(booked / total_day * 100, 2) if total_day else 0.0
        )

    return ObservabilityMetrics(
        generated_at=datetime.now(timezone.utc),
        alerts=[AlertResult(**a) for a in alerts_raw],
        case_health_series=chs_series,
        booking_rate_series=booking_series,
        audit_remark_tags=tags,
    )


@router.get("/carriers", dependencies=[Depends(require_api_key)])
async def carriers(
    from_: Annotated[datetime | None, Query(alias="from")] = None,
    to_: Annotated[datetime | None, Query(alias="to")] = None,
) -> CarrierRollupMetrics:
    rows = await _resolve_rows(None, from_=from_, to_=to_)
    top = agg.carrier_rollup(rows, top_n=10)
    unique = len({(r.get("mc_number") or "") for r in rows})

    # Enrich each rollup row with avg_booking_margin = mean((apply - list)/list).
    # bookings is the source of truth for priced bookings; calls_log no longer holds rates.
    margin_by_mc = await _carrier_margin_map(from_=from_, to_=to_)
    enriched = [
        {**row, "avg_booking_margin_pct": margin_by_mc.get(str(row.get("mc_number") or ""))}
        for row in top
    ]

    return CarrierRollupMetrics(
        top_carriers=[CarrierRollupRow(**row) for row in enriched],
        total_unique_carriers=unique,
    )


async def _carrier_margin_map(
    *,
    from_: datetime | None,
    to_: datetime | None,
) -> dict[str, float]:
    # Stored as (list - apply)/list * 100 so positive = margin captured
    # (carrier accepted below list). Empty dict when nothing's available;
    # caller must treat missing keys as null, NOT zero (zero would falsely show
    # "broke even" on carriers with no priced bookings).
    since = from_.isoformat() if from_ else "1970-01-01T00:00:00Z"
    until = to_.isoformat() if to_ else None
    bookings = await recent_bookings_window(since_ts=since, until_ts=until, limit=500)
    if not bookings:
        return {}

    needed_load_ids = {str(b.get("load_id")) for b in bookings if b.get("load_id")}
    if not needed_load_ids:
        return {}

    from app.services.twin_client import twin_client

    sql = "SELECT load_id, loadboard_rate FROM loads"
    load_rows = await twin_client.query(sql)
    list_rate_by_load: dict[str, float] = {}
    for lr in load_rows:
        lid = str(lr.get("load_id") or "")
        if lid not in needed_load_ids:
            continue
        v = lr.get("loadboard_rate")
        if v in (None, ""):
            continue
        try:
            list_rate_by_load[lid] = float(v)
        except (TypeError, ValueError):
            continue

    pct_by_mc: dict[str, list[float]] = defaultdict(list)
    for b in bookings:
        mc = str(b.get("mc_number") or "").strip()
        if not mc:
            continue
        apply_raw = b.get("apply_rate")
        list_rate = list_rate_by_load.get(str(b.get("load_id") or ""))
        if apply_raw in (None, "") or not list_rate:
            continue
        try:
            apply = float(apply_raw)
        except (TypeError, ValueError):
            continue
        pct_by_mc[mc].append((list_rate - apply) / list_rate * 100)

    return {
        mc: round(sum(vals) / len(vals), 2)
        for mc, vals in pct_by_mc.items()
        if vals
    }


def _coerce_int(v: Any) -> int | None:
    if v is None or v == "":
        return None
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def _coerce_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


async def _build_recent_bookings(
    *, since_ts: str, until_ts: str | None = None, limit: int
) -> RecentBookingsResponse:
    # 3 Twin queries replace an N+1 loop. Cloudflare WAF blocks WHERE call_id IN(...),
    # so fetch-all + Python lookup is the cheapest correct shape (loads <1k rows).
    rows = await recent_bookings_window(
        since_ts=since_ts, until_ts=until_ts, limit=limit
    )
    if not rows:
        return RecentBookingsResponse(bookings=[], count=0)

    calls_by_id = await _calls_by_id_for(rows)
    loads_by_id = await _loads_by_id_for(rows)

    out: list[RecentBookingRow] = []
    for b in rows:
        call_summary: BookingCallSummary | None = None
        call = calls_by_id.get(str(b.get("call_id") or ""))
        if call:
            call_summary = BookingCallSummary(
                call_outcome=call.get("call_outcome"),
                sentiment=call.get("sentiment"),
                case_health_score=_coerce_int(call.get("case_health_score")),
                duration_seconds=_coerce_int(call.get("duration_seconds")),
            )

        load_summary: BookingLoadSummary | None = None
        lr = loads_by_id.get(str(b.get("load_id") or ""))
        if lr:
            load_summary = BookingLoadSummary(
                load_id=str(lr.get("load_id") or ""),
                origin_city=lr.get("origin_city"),
                origin_state=lr.get("origin_state"),
                destination_city=lr.get("destination_city"),
                destination_state=lr.get("destination_state"),
                equipment_type=lr.get("equipment_type"),
                loadboard_rate=_coerce_float(lr.get("loadboard_rate")),
                miles=_coerce_int(lr.get("miles")),
                weight=_coerce_float(lr.get("weight")),
                commodity_type=lr.get("commodity_type"),
                num_of_pieces=_coerce_int(lr.get("num_of_pieces")),
                dimensions=lr.get("dimensions"),
                pickup_datetime=lr.get("pickup_datetime"),
                delivery_datetime=lr.get("delivery_datetime"),
                notes=lr.get("notes"),
            )

        out.append(
            RecentBookingRow(
                booking_id=_coerce_int(b.get("id")),
                booked_at=b.get("created_at"),
                mc_number=b.get("mc_number"),
                call_id=b.get("call_id"),
                call=call_summary,
                apply_rate=_coerce_float(b.get("apply_rate")),
                load=load_summary,
            )
        )

    return RecentBookingsResponse(bookings=out, count=len(out))


async def _calls_by_id_for(
    bookings: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    needed = {str(b.get("call_id")) for b in bookings if b.get("call_id")}
    if not needed:
        return {}
    pulled = await list_calls(limit=500)
    return {
        str(r.get("call_id")): r
        for r in pulled
        if r.get("call_id") and str(r.get("call_id")) in needed
    }


async def _loads_by_id_for(
    bookings: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    needed = {str(b.get("load_id")) for b in bookings if b.get("load_id")}
    if not needed:
        return {}
    from app.services.twin_client import twin_client

    sql = (
        "SELECT load_id, origin_city, origin_state, destination_city, "
        "destination_state, equipment_type, loadboard_rate, miles, weight, "
        "commodity_type, num_of_pieces, dimensions, pickup_datetime, "
        "delivery_datetime, notes FROM loads"
    )
    rows = await twin_client.query(sql)
    return {
        str(r.get("load_id")): r
        for r in rows
        if r.get("load_id") and str(r.get("load_id")) in needed
    }


@router.get(
    "/bookings",
    response_model=RecentBookingsResponse,
    dependencies=[Depends(require_api_key)],
)
async def recent_bookings(
    from_: Annotated[
        datetime | None,
        Query(alias="from", description="ISO-8601 lower bound for booking created_at."),
    ] = None,
    to_: Annotated[
        datetime | None,
        Query(alias="to", description="ISO-8601 upper bound for booking created_at."),
    ] = None,
    since: Annotated[
        datetime | None,
        Query(description="Legacy alias for `from`. Defaults to now() - 7d when nothing set."),
    ] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
) -> RecentBookingsResponse:
    # 7d default (was 24h): demo / off-hours windows commonly had zero bookings,
    # leaving the New Bookings table blank. 30s TTL cache keyed on bounds.
    lower = from_ or since or (datetime.now(timezone.utc) - timedelta(days=7))
    lower_iso = lower.isoformat()
    upper_iso = to_.isoformat() if to_ else None
    cache_key = f"recent_bookings:{lower_iso}:{upper_iso or ''}:{int(limit)}"
    return await agg._cached_call(
        cache_key,
        _build_recent_bookings,
        since_ts=lower_iso,
        until_ts=upper_iso,
        limit=int(limit),
    )


async def _build_available_loads(*, limit: int) -> AvailableLoadsResponse:
    # WAF-safe pattern: separate single-table SELECTs, set-difference in Python
    # (Cloudflare WAF blocks JOINs and IN-lists). 30s TTL cache keyed on limit only.
    booked = await all_booked_load_ids()
    rows = await available_loads_helper(booked_load_ids=booked, limit=limit)
    return AvailableLoadsResponse(
        loads=[AvailableLoadRow(**r) for r in rows],
        count=len(rows),
    )


@router.get(
    "/loads/available",
    response_model=AvailableLoadsResponse,
    dependencies=[Depends(require_api_key)],
)
async def available_loads_endpoint(
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
) -> AvailableLoadsResponse:
    cache_key = f"available_loads:{int(limit)}"
    return await agg._cached_call(
        cache_key,
        _build_available_loads,
        limit=int(limit),
    )

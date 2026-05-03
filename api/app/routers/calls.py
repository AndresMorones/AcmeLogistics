from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.deps import require_api_key
from app.services.bookings_store import bookings_for_call
from app.services.calls_store import get_call_by_id
from app.services.dashboard_aggregations import _within_window
from app.services.twin_client import twin_client

router = APIRouter(tags=["calls"])


# Kept mounted so any HR workflow still pointing at the legacy endpoint gets a clear 410 with
# a recovery hint instead of a silent 404. Do not delete until HR-side callers are confirmed gone.
@router.post("/calls", status_code=status.HTTP_410_GONE)
@router.post("/v1/calls/log", status_code=status.HTTP_410_GONE)
def post_call_deprecated() -> None:
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail=(
            "POST /v1/calls/log deprecated; "
            "use HR Write-to-Twin to populate calls_log + bookings."
        ),
    )


_LIST_COLS = (
    "id, created_at, call_id, mc_number, call_outcome, "
    "sentiment, case_health_score, audit_remarks, "
    "fmcsa_eligibility_failure_reason, callback_phone, duration_seconds"
)


@router.get("/v1/calls", dependencies=[Depends(require_api_key)])
async def list_calls_endpoint(
    limit: int = Query(default=100, ge=1, le=500),
    from_: Annotated[datetime | None, Query(alias="from")] = None,
    to_: Annotated[datetime | None, Query(alias="to")] = None,
) -> dict[str, Any]:
    if from_ is None and to_ is None:
        sql = (
            f"SELECT {_LIST_COLS} "
            "FROM calls_log "
            "ORDER BY created_at DESC "
            "LIMIT :limit"
        )
        rows = await twin_client.query(sql, {"limit": int(limit)})
        return {"calls": rows, "count": len(rows)}

    # Cloudflare WAF blocks created_at SQL comparisons; over-fetch (limit*5, capped 500) and
    # window-filter in Python via _within_window so a tight window doesn't starve the result.
    pull_cap = max(int(limit) * 5, 100)
    if pull_cap > 500:
        pull_cap = 500
    sql = (
        f"SELECT {_LIST_COLS} "
        "FROM calls_log "
        "ORDER BY created_at DESC "
        "LIMIT :limit"
    )
    rows = await twin_client.query(sql, {"limit": pull_cap})
    filtered = [r for r in rows if _within_window(r, from_, to_)][: int(limit)]
    return {"calls": filtered, "count": len(filtered)}


@router.get("/v1/calls/{call_id}", dependencies=[Depends(require_api_key)])
async def get_call_endpoint(
    call_id: str,
    include_transcript: bool = Query(
        default=False,
        description=(
            "Set to true to include the full transcript in the response. "
            "Default false — defense-in-depth so a leaked Bearer token cannot "
            "casually exfiltrate every transcript via the standard endpoint."
        ),
    ),
) -> dict[str, Any]:
    call = await get_call_by_id(call_id)
    if call is None:
        raise HTTPException(status_code=404, detail=f"Call {call_id} not found")

    if not include_transcript and isinstance(call, dict) and "transcript" in call:
        call = {k: v for k, v in call.items() if k != "transcript"}

    bookings = await bookings_for_call(call_id)

    enriched: list[dict[str, Any]] = []
    for b in bookings:
        load_info: dict[str, Any] | None = None
        load_id = b.get("load_id")
        # N+1 acceptable: Cloudflare WAF blocks IN-lists, and bookings/call is small (1-3 typical).
        if load_id:
            load_rows = await twin_client.query(
                "SELECT load_id, origin_city, origin_state, destination_city, "
                "destination_state, equipment_type, loadboard_rate, miles, "
                "weight, commodity_type, num_of_pieces, dimensions, "
                "pickup_datetime, delivery_datetime, notes "
                "FROM loads WHERE load_id = :load_id",
                {"load_id": str(load_id)},
            )
            load_info = load_rows[0] if load_rows else None
        enriched.append({**b, "load": load_info})

    return {"call": call, "bookings": enriched}

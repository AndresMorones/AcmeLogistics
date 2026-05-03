"""Telemetry aggregation router.

The HR `/runs` REST drilldown was retired (unreliable for our workflow_id);
latency + token signals are derived solely from `calls_log.transcript` turn
timestamps already persisted by Twin.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query

from app.deps import require_api_key
from app.services.transcript_aggregations import aggregate_telemetry_from_transcripts

log = structlog.get_logger()

router = APIRouter(prefix="/v1/dashboard/telemetry", tags=["telemetry"])


@router.get("", dependencies=[Depends(require_api_key)])
async def telemetry_aggregate(
    from_: datetime | None = Query(None, alias="from"),
    to_: datetime | None = Query(None, alias="to"),
    bucket_minutes: int = Query(1, ge=1, le=60),
    max_runs: int = Query(200, ge=1, le=500),
) -> dict[str, Any]:
    try:
        return await aggregate_telemetry_from_transcripts(
            from_=from_,
            to_=to_,
            max_runs=max_runs,
            bucket_minutes=bucket_minutes,
        )
    except Exception as e:  # noqa: BLE001
        log.warning(
            "telemetry_aggregation_failed",
            error_type=type(e).__name__,
            error_msg=str(e)[:200],
        )
        raise HTTPException(status_code=502, detail="telemetry aggregation failed")

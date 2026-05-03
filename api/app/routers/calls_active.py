from __future__ import annotations

import asyncio
from typing import Any

import httpx
import structlog
from cachetools import TTLCache
from fastapi import APIRouter, Depends

from app.config import settings
from app.deps import require_api_key

log = structlog.get_logger()

# 10s TTL (tighter than the 30s dashboard default): "active" runs churn second-by-second;
# staler data would mislead the live-ops view. Single-slot cache keyed "v" — no per-tenant fanout.
_active_cache: TTLCache = TTLCache(maxsize=1, ttl=10)
_lock = asyncio.Lock()

router = APIRouter(prefix="/v1/calls", tags=["calls-active"])


@router.get("/active", dependencies=[Depends(require_api_key)])
async def active_calls() -> dict[str, Any]:
    async with _lock:
        if "v" in _active_cache:
            return _active_cache["v"]

    if not settings.hr_workflow_id:
        return {"count": 0, "runs": [], "status": "unconfigured"}

    try:
        async with httpx.AsyncClient(
            base_url=settings.hr_base_url,
            headers={"Authorization": f"Bearer {settings.happyrobot_api_key}"},
            timeout=5.0,
        ) as c:
            resp = await c.get(
                f"/workflows/{settings.hr_workflow_id}/runs",
                params={"status": "running", "page_size": 50},
            )
            resp.raise_for_status()
            data = resp.json()
        rows = data.get("data") or data.get("runs") or []
        runs = [
            {
                "run_id": r.get("id"),
                "started_at": r.get("started_at") or r.get("created_at"),
                "duration_seconds": r.get("duration_seconds"),
                "current_node": (r.get("current_node") or {}).get("name"),
                "mc_number": (r.get("inputs") or {}).get("mc_number"),
            }
            for r in rows
        ]
        out: dict[str, Any] = {"count": len(runs), "runs": runs, "status": "ok"}
    except Exception as e:  # noqa: BLE001
        log.warning("active_calls_query_failed", error_type=type(e).__name__)
        out = {
            "count": 0,
            "runs": [],
            "status": "error",
            "error": str(e)[:100],
        }

    async with _lock:
        _active_cache["v"] = out
    return out

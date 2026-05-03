from __future__ import annotations

from datetime import date, datetime
from typing import Any

import httpx
import structlog
from fastapi import HTTPException

from app.config import settings

# HR Twin REST client. Bearer-auth, two endpoints used: GET /twin/tables/{name}
# and POST /twin/sql. Cloudflare WAF in front of Twin rejects parameter binding,
# IN-lists, ORDER BY+LIMIT pairs, and quoted ISO date literals — all SQL is
# interpolated server-side in _sql_literal with WAF-safe shapes.
log = structlog.get_logger()


# Twin's POST /rows expects every value as a string; server coerces to typed columns.
def _stringify_value(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, bool):
        return str(v).lower()
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (dict, list)):
        import json as _json
        return _json.dumps(v)
    return str(v)


# `+00:00` substring trips a Cloudflare WAF rule; Postgres parses this shape
# identically to ISO when the column is timestamptz, so the rewrite is lossless.
def _format_datetime_for_waf(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def _sql_literal(v: Any) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, datetime):
        return f"'{_format_datetime_for_waf(v)}'"
    if isinstance(v, date):
        return f"'{v.isoformat()}'"
    if isinstance(v, str):
        # ISO timestamps from callers get rewritten to WAF-safe form (see above).
        if "T" in v and ("+00:00" in v or v.endswith("Z")):
            try:
                parsed = datetime.fromisoformat(v.replace("Z", "+00:00"))
                return f"'{_format_datetime_for_waf(parsed)}'"
            except ValueError:
                pass
        # Postgres single-quote escape is doubled (''), not backslash.
        escaped = v.replace("'", "''")
        return f"'{escaped}'"
    raise ValueError(f"Unsupported SQL parameter type: {type(v).__name__}")


def _interpolate(sql: str, params: dict[str, Any] | None) -> str:
    if not params:
        return sql
    out = sql
    for k, v in params.items():
        if not k.isidentifier():
            raise ValueError(f"Invalid SQL param name: {k!r}")
        out = out.replace(f":{k}", _sql_literal(v))
    return out


class TwinClient:
    # AsyncClient (was sync httpx) so Twin calls don't block the FastAPI event loop.
    # Module-level singleton at bottom — call aclose() on app shutdown.
    def __init__(self) -> None:
        self._client = httpx.AsyncClient(
            base_url=settings.hr_base_url,
            headers={
                "Authorization": f"Bearer {settings.happyrobot_api_key}",
                "Accept": "application/json",
            },
            timeout=10.0,
        )

    async def get_rows(self, table_name: str, *, limit: int | None = None) -> list[dict]:
        params: dict[str, Any] = {}
        if limit:
            params["limit"] = limit
        try:
            resp = await self._client.get(f"/twin/tables/{table_name}", params=params)
            resp.raise_for_status()
            return resp.json().get("rows", [])
        except httpx.HTTPError as e:
            # Sync-style read path degrades gracefully — caller gets [] not 502.
            log.error("twin.fetch_failed", table=table_name, error=str(e))
            return []

    async def insert_row(self, table_name: str, values: dict[str, Any]) -> dict | None:
        normalized = {k: _stringify_value(v) for k, v in values.items() if v is not None}
        try:
            resp = await self._client.post(
                f"/twin/tables/{table_name}/rows",
                json={"values": normalized},
            )
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError as e:
            log.error(
                "twin.insert_failed",
                table=table_name,
                error=str(e),
                response=getattr(e, "response", None) and e.response.text[:500],
            )
            return None

    # WAF constraints: single-statement only (no `;`), no IN-lists, no
    # ORDER BY+LIMIT pair, no JSONB ops. Failures raise 502/400 (not silent []).
    async def query(
        self,
        sql: str,
        params: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        body_sql = _interpolate(sql, params)
        try:
            resp = await self._client.post("/twin/sql", json={"sql": body_sql})
        except httpx.HTTPError as e:
            log.error("twin.sql_transport_failed", error=str(e))
            raise HTTPException(status_code=502, detail="Twin upstream unavailable") from e

        if resp.status_code == 401:
            log.error("twin.sql_unauthorized")
            raise HTTPException(status_code=401, detail="Twin auth rejected (HAPPYROBOT_API_KEY)")
        if resp.status_code >= 400:
            preview = resp.text[:500]
            log.error("twin.sql_error", status=resp.status_code, body=preview)
            raise HTTPException(
                status_code=400 if resp.status_code < 500 else 502,
                detail=f"Twin SQL error ({resp.status_code}): {preview}",
            )

        try:
            data = resp.json()
        except ValueError as e:
            log.error("twin.sql_bad_json", error=str(e))
            raise HTTPException(status_code=502, detail="Twin returned non-JSON") from e

        rows = data.get("rows") if isinstance(data, dict) else None
        return rows or []

    async def aclose(self) -> None:
        await self._client.aclose()


twin_client = TwinClient()

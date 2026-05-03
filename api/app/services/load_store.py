from datetime import datetime, timezone

import structlog

from app.models import Load
# twin_client is AsyncClient — sync httpx blocked the event loop and starved
# SSE/heartbeats under concurrent dashboard load. Every call site here must be `await`ed.
from app.services.twin_client import twin_client

log = structlog.get_logger()


def _parse_iso(value) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            pass
    return datetime.now(timezone.utc)


def _opt_int(v) -> int | None:
    # Twin returns numerics as JSON strings ("100" not 100); float() first
    # tolerates "100.0" / decimals before int truncation. Empty string is the
    # Twin's "absent" sentinel — treat as None to avoid 0-coercion poisoning.
    if v is None or v == "":
        return None
    try:
        return int(float(v))
    except (ValueError, TypeError):
        return None


def _opt_float(v) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def _opt_str(v) -> str | None:
    if v is None or v == "":
        return None
    return str(v)


def _row_to_load(row: dict) -> Load:
    return Load(
        load_id=str(row.get("load_id", "")),
        origin_city=str(row.get("origin_city", "")),
        origin_state=str(row.get("origin_state", "")),
        destination_city=str(row.get("destination_city", "")),
        destination_state=str(row.get("destination_state", "")),
        pickup_datetime=_parse_iso(row.get("pickup_datetime")),
        delivery_datetime=_parse_iso(row.get("delivery_datetime")),
        equipment_type=str(row.get("equipment_type", "")),
        loadboard_rate=_opt_float(row.get("loadboard_rate")) or 0.0,
        weight=_opt_float(row.get("weight")),
        commodity_type=_opt_str(row.get("commodity_type")),
        num_of_pieces=_opt_int(row.get("num_of_pieces")),
        miles=_opt_int(row.get("miles")),
        dimensions=_opt_str(row.get("dimensions")),
        notes=_opt_str(row.get("notes")),
    )


class LoadStore:
    async def get(self, reference_number: str) -> Load | None:
        ref = reference_number.strip().lower()
        for row in await twin_client.get_rows("loads", limit=500):
            if str(row.get("load_id", "")).lower() == ref:
                return _row_to_load(row)
        return None

    async def search(
        self,
        *,
        origin: str | None = None,
        destination: str | None = None,
        equipment_type: str | None = None,
        max_results: int = 5,
    ) -> list[Load]:
        rows = await twin_client.get_rows("loads", limit=500)
        loads = [_row_to_load(r) for r in rows]
        results: list[Load] = []
        origin_l = origin.strip().lower() if origin else None
        dest_l = destination.strip().lower() if destination else None
        eq_l = equipment_type.strip().lower() if equipment_type else None
        for load in loads:
            if origin_l and origin_l not in load.origin.lower():
                continue
            if dest_l and dest_l not in load.destination.lower():
                continue
            if eq_l and load.equipment_type.lower() != eq_l:
                continue
            results.append(load)
            if len(results) >= max_results:
                break
        return results

    async def all(self) -> list[Load]:
        rows = await twin_client.get_rows("loads", limit=500)
        return [_row_to_load(r) for r in rows]


load_store = LoadStore()


def _row_to_available_dict(row: dict) -> dict:
    return {
        "load_id": str(row.get("load_id") or ""),
        "origin_city": _opt_str(row.get("origin_city")),
        "origin_state": _opt_str(row.get("origin_state")),
        "destination_city": _opt_str(row.get("destination_city")),
        "destination_state": _opt_str(row.get("destination_state")),
        "equipment_type": _opt_str(row.get("equipment_type")),
        "loadboard_rate": _opt_float(row.get("loadboard_rate")),
        "miles": _opt_int(row.get("miles")),
        "weight": _opt_float(row.get("weight")),
        "commodity_type": _opt_str(row.get("commodity_type")),
        "pickup_datetime": _opt_str(row.get("pickup_datetime")),
        "delivery_datetime": _opt_str(row.get("delivery_datetime")),
        "notes": _opt_str(row.get("notes")),
    }


async def available_loads(
    *,
    booked_load_ids: set[str],
    limit: int = 50,
) -> list[dict]:
    sql = (
        "SELECT load_id, origin_city, origin_state, destination_city, "
        "destination_state, equipment_type, loadboard_rate, miles, weight, "
        "commodity_type, num_of_pieces, dimensions, pickup_datetime, "
        "delivery_datetime, notes FROM loads"
    )
    rows = await twin_client.query(sql)

    booked = {str(x) for x in booked_load_ids}
    free = [r for r in rows if str(r.get("load_id") or "") and str(r.get("load_id")) not in booked]

    def _pickup_key(r: dict) -> str:
        v = r.get("pickup_datetime")
        return str(v) if v else "￿"

    free.sort(key=_pickup_key)
    sliced = free[: int(limit)] if limit > 0 else free
    return [_row_to_available_dict(r) for r in sliced]

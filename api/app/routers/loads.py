# HR webhook contract: legacy unprefixed paths (`/loads/...`) are mounted alongside
# `/v1/...` and MUST stay reachable — breaking them breaks live HR voice workflows.
# Route order matters: `/search` is registered BEFORE `/{reference_number}` so the
# literal wins; flipping order silently shadows search with a 404 lookup.
from fastapi import APIRouter, Depends, HTTPException, Query

from app.deps import require_api_key
from app.services.load_store import load_store

router = APIRouter(tags=["loads"])


async def _search_payload(
    origin: str | None,
    destination: str | None,
    equipment_type: str | None,
    max_results: int,
) -> dict:
    matches = await load_store.search(
        origin=origin,
        destination=destination,
        equipment_type=equipment_type,
        max_results=max_results,
    )
    return {
        "matches": [m.to_response_dict() for m in matches],
        "total_in_store": len(await load_store.all()),
        "filters_applied": {
            "origin": origin,
            "destination": destination,
            "equipment_type": equipment_type,
        },
    }


async def _get_payload(reference_number: str) -> dict:
    load = await load_store.get(reference_number)
    if load is None:
        raise HTTPException(
            status_code=404,
            detail=f"Load {reference_number} not found",
        )
    return load.to_response_dict()


@router.get(
    "/loads/search",
    dependencies=[Depends(require_api_key)],
)
@router.get(
    "/v1/loads/search",
    dependencies=[Depends(require_api_key)],
)
async def search_loads(
    origin: str | None = Query(default=None, description='City + state, e.g. "Dallas, TX"'),
    destination: str | None = Query(
        default=None, description='City + state, e.g. "Atlanta, GA". Optional.'
    ),
    equipment_type: str | None = Query(
        default=None, description='e.g. "dry van", "reefer", "flatbed". Optional.'
    ),
    max_results: int = Query(default=5, ge=1, le=20),
) -> dict:
    return await _search_payload(origin, destination, equipment_type, max_results)


@router.get(
    "/loads/{reference_number}",
    dependencies=[Depends(require_api_key)],
)
@router.get(
    "/v1/loads/{reference_number}",
    dependencies=[Depends(require_api_key)],
)
async def get_load(reference_number: str) -> dict:
    return await _get_payload(reference_number)

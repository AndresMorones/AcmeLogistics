"""Loads router tests.

The loads router is unchanged by the Twin-pivot refactor — these tests cover
the existing GET /loads/search and GET /loads/{reference_number} endpoints
against a faked twin_client returning canned `loads` rows.
"""

from typing import Any
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

_FAKE_LOADS: list[dict[str, Any]] = [
    {
        "load_id": "L-T1",
        "origin_city": "Dallas",
        "origin_state": "TX",
        "destination_city": "Houston",
        "destination_state": "TX",
        "pickup_datetime": "2026-04-25T08:00:00Z",
        "delivery_datetime": "2026-04-25T18:00:00Z",
        "equipment_type": "dry van",
        "loadboard_rate": 2500,
        "weight": 42000,
        "commodity_type": "General Merchandise",
        "num_of_pieces": 24,
        "miles": 240,
        "dimensions": "53x8x9 ft",
        "notes": None,
    },
    {
        "load_id": "L-T2",
        "origin_city": "Atlanta",
        "origin_state": "GA",
        "destination_city": "Miami",
        "destination_state": "FL",
        "pickup_datetime": "2026-04-26T08:00:00Z",
        "delivery_datetime": "2026-04-27T12:00:00Z",
        "equipment_type": "reefer",
        "loadboard_rate": 1800,
        "weight": 38000,
        "commodity_type": "Frozen Produce",
        "num_of_pieces": 18,
        "miles": 660,
        "dimensions": "53x8x9 ft",
        "notes": "Frozen produce.",
    },
    {
        "load_id": "L-T3",
        "origin_city": "Los Angeles",
        "origin_state": "CA",
        "destination_city": "Phoenix",
        "destination_state": "AZ",
        "pickup_datetime": "2026-04-25T14:00:00Z",
        "delivery_datetime": "2026-04-26T08:00:00Z",
        "equipment_type": "flatbed",
        "loadboard_rate": 1450,
        "weight": 45000,
        "commodity_type": "Building Materials",
        "num_of_pieces": 6,
        "miles": 372,
        "dimensions": "48x8.5x4 ft",
        "notes": "Construction materials.",
    },
]


def _wire_loads(fake_twin: MagicMock) -> None:
    fake_twin.get_rows.return_value = _FAKE_LOADS


def test_search_no_filter_returns_all(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin: MagicMock,
) -> None:
    _wire_loads(fake_twin)
    r = client.get("/loads/search", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["total_in_store"] == 3
    assert len(body["matches"]) == 3


def test_search_by_origin(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin: MagicMock,
) -> None:
    _wire_loads(fake_twin)
    r = client.get("/loads/search?origin=Dallas", headers=auth_headers)
    matches = r.json()["matches"]
    assert len(matches) == 1
    assert matches[0]["load_id"] == "L-T1"


def test_search_by_destination(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin: MagicMock,
) -> None:
    _wire_loads(fake_twin)
    r = client.get("/loads/search?destination=Miami", headers=auth_headers)
    matches = r.json()["matches"]
    assert len(matches) == 1
    assert matches[0]["load_id"] == "L-T2"


def test_search_by_equipment(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin: MagicMock,
) -> None:
    _wire_loads(fake_twin)
    r = client.get("/loads/search?equipment_type=reefer", headers=auth_headers)
    matches = r.json()["matches"]
    assert len(matches) == 1
    assert matches[0]["load_id"] == "L-T2"


def test_search_max_results_caps(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin: MagicMock,
) -> None:
    _wire_loads(fake_twin)
    r = client.get("/loads/search?max_results=2", headers=auth_headers)
    matches = r.json()["matches"]
    assert len(matches) == 2


def test_get_load_by_reference(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin: MagicMock,
) -> None:
    _wire_loads(fake_twin)
    r = client.get("/loads/L-T1", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["load_id"] == "L-T1"


def test_get_load_not_found(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin: MagicMock,
) -> None:
    _wire_loads(fake_twin)
    r = client.get("/loads/nope-XXX", headers=auth_headers)
    assert r.status_code == 404

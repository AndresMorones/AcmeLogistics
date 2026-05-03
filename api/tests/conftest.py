"""Test fixtures.

The post-pivot architecture reads everything from HR Twin via `twin_client`. We
swap a fake twin_client into both the sync and async paths so tests don't hit
the network.
"""

from collections.abc import Iterator
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.config import settings

TEST_TOKEN = "test-bearer-token-do-not-use-in-prod"


@pytest.fixture(autouse=True)
def setup_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "api_bearer_token", TEST_TOKEN)


@pytest.fixture(autouse=True)
def _clear_dashboard_cache() -> Iterator[None]:
    """Wipe the in-process TTL cache between tests so a cached aggregation
    result from one test doesn't bleed into the next one's mocked twin."""
    from app.services.dashboard_aggregations import invalidate_dashboard_cache

    invalidate_dashboard_cache()
    yield
    invalidate_dashboard_cache()


@pytest.fixture
def fake_twin(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Replace the singleton `twin_client` with a MagicMock spying on every call.

    Tests configure `fake_twin.query.return_value = [...]` for SQL responses or
    `fake_twin.get_rows.return_value = [...]` for table reads.
    """
    fake = MagicMock()
    fake.query = AsyncMock(return_value=[])
    fake.get_rows = AsyncMock(return_value=[])
    fake.insert_row = AsyncMock(return_value=None)
    fake.aclose = AsyncMock()

    # Patch every import path we know about.
    import app.routers.calls as calls_mod
    import app.routers.carriers as carriers_mod
    import app.routers.dashboard as dash_mod
    import app.services.bookings_store as bk_mod
    import app.services.calls_store as cs_mod
    import app.services.dashboard_aggregations as agg_mod
    import app.services.load_store as ld_mod
    import app.services.twin_client as twin_mod

    monkeypatch.setattr(twin_mod, "twin_client", fake)
    monkeypatch.setattr(bk_mod, "twin_client", fake)
    monkeypatch.setattr(cs_mod, "twin_client", fake)
    monkeypatch.setattr(agg_mod, "twin_client", fake)
    monkeypatch.setattr(ld_mod, "twin_client", fake)
    # Routers that import twin_client directly need explicit re-binding.
    monkeypatch.setattr(calls_mod, "twin_client", fake)
    monkeypatch.setattr(carriers_mod, "twin_client", fake)
    # dashboard.py imports `agg` and uses agg.* — already patched on agg_mod.
    # twin_query_audit_sample imports twin_client at call time; patch via import.
    if hasattr(dash_mod, "twin_client"):
        monkeypatch.setattr(dash_mod, "twin_client", fake, raising=False)
    return fake


@pytest.fixture
def client(fake_twin: Any) -> Iterator[TestClient]:  # noqa: ARG001
    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture
def token() -> str:
    return TEST_TOKEN


@pytest.fixture
def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}

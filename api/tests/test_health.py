"""/healthz tests — no auth required."""

from fastapi.testclient import TestClient


def test_healthz_returns_200_and_status_ok(client: TestClient) -> None:
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "service": "robot-api"}


def test_healthz_no_auth_required(client: TestClient) -> None:
    # Even with no auth headers, healthz returns 200.
    r = client.get("/healthz")
    assert r.status_code == 200

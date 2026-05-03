"""Bearer auth tests — header-only.

The `?token=` query-string fallback was removed (query strings leak into access
logs, Referer headers, and browser history). Both `x-api-key` and `Authorization:
Bearer <token>` headers are still honored. The loads router exercises the auth
dependency end-to-end with a faked twin_client so failures here are auth-only.
"""

from unittest.mock import MagicMock

from fastapi.testclient import TestClient


def test_missing_auth_returns_401(client: TestClient, fake_twin: MagicMock) -> None:  # noqa: ARG001
    r = client.get("/loads/search")
    assert r.status_code == 401


def test_wrong_bearer_returns_401(client: TestClient, fake_twin: MagicMock) -> None:  # noqa: ARG001
    r = client.get("/loads/search", headers={"Authorization": "Bearer wrong-token"})
    assert r.status_code == 401


def test_correct_bearer_returns_200(
    client: TestClient,
    auth_headers: dict[str, str],
    fake_twin: MagicMock,  # noqa: ARG001
) -> None:
    r = client.get("/loads/search", headers=auth_headers)
    assert r.status_code == 200


def test_x_api_key_header_returns_200(
    client: TestClient,
    token: str,
    fake_twin: MagicMock,  # noqa: ARG001
) -> None:
    r = client.get("/loads/search", headers={"x-api-key": token})
    assert r.status_code == 200


def test_malformed_authorization_header_returns_401(
    client: TestClient,
    token: str,
    fake_twin: MagicMock,  # noqa: ARG001
) -> None:
    r = client.get("/loads/search", headers={"Authorization": token})
    assert r.status_code == 401

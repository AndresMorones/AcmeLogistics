"""twin_client.query parameter-interpolation safety tests.

Twin REST does not honor :placeholder / $1 / ? binding, so twin_client splices
params into SQL itself. These tests pin the escape behavior — single quotes
get doubled, type whitelist blocks dict/list/etc.
"""

import pytest

from app.services.twin_client import _interpolate, _sql_literal


def test_sql_literal_string_quotes() -> None:
    assert _sql_literal("hello") == "'hello'"


def test_sql_literal_string_escapes_single_quote() -> None:
    # Postgres single-quote escape: '' inside the literal.
    assert _sql_literal("O'Brien") == "'O''Brien'"


def test_sql_literal_int_no_quotes() -> None:
    assert _sql_literal(42) == "42"


def test_sql_literal_float() -> None:
    assert _sql_literal(2500.0) == "2500.0"


def test_sql_literal_none() -> None:
    assert _sql_literal(None) == "NULL"


def test_sql_literal_bool() -> None:
    assert _sql_literal(True) == "TRUE"
    assert _sql_literal(False) == "FALSE"


def test_sql_literal_rejects_dict() -> None:
    with pytest.raises(ValueError):
        _sql_literal({"a": 1})


def test_sql_literal_rejects_list() -> None:
    with pytest.raises(ValueError):
        _sql_literal([1, 2, 3])


def test_interpolate_substitutes() -> None:
    sql = "SELECT * FROM bookings WHERE mc_number = :mc AND apply_rate >= :rate"
    out = _interpolate(sql, {"mc": "999", "rate": 1500})
    assert ":mc" not in out
    assert ":rate" not in out
    assert "'999'" in out
    assert "1500" in out


def test_interpolate_no_params_returns_unchanged() -> None:
    sql = "SELECT 1"
    assert _interpolate(sql, None) == "SELECT 1"
    assert _interpolate(sql, {}) == "SELECT 1"


def test_interpolate_rejects_invalid_identifier() -> None:
    with pytest.raises(ValueError):
        _interpolate("SELECT :bad-name", {"bad-name": "x"})


def test_interpolate_blocks_injection_via_quote() -> None:
    """Single-quote escape neutralizes naive injection attempts."""
    sql = "SELECT * FROM calls_log WHERE call_id = :cid"
    out = _interpolate(sql, {"cid": "x' OR 1=1 --"})
    # The escape doubles the quote so the WHERE clause stays a single literal.
    assert "'x'' OR 1=1 --'" in out

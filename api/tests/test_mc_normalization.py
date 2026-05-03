"""Contract tests for spoken-MC-number normalization.

Carriers say their MC number in many shapes ("MC-123456", "M C one two three
four five six seven", "MC number 250819", or just bare digits). The voice
agent prompt strips the noise and validates the digit-only result before
calling FMCSA. That logic lives in the HappyRobot prompt rather than in our
Python service, so this module ships the contract as a self-contained
helper plus a regression suite. If FMCSA prefix conventions change or the
prompt's normalization drifts, these tests catch it.

Rejection reason codes:
    EMPTY_OR_NON_NUMERIC  - nothing left after stripping, or non-digits remain
    NON_DOMESTIC_PREFIX   - "MX" (Mexican) or "FF" (Mexican border) carrier
    DOT_NOT_MC            - caller gave a USDOT number, not an MC number
    TOO_SHORT             - fewer than 4 digits after normalization
"""

from __future__ import annotations

import re

import pytest

# Tokens we strip from spoken MC numbers before parsing digits. Order is not
# significant because each is removed independently with a regex pass.
_NOISE_WORDS = ("NUMBER", "NO")
_NOISE_CHARS = re.compile(r"[\s\-.,#]")


def normalize_mc(spoken: str) -> tuple[str | None, str | None]:
    """Return ``(digits, rejection_reason)`` for a spoken MC number.

    On success the first element is the digit-only MC string. On failure the
    second element is one of the documented rejection codes. Exactly one of
    the two elements is always ``None``.
    """
    if spoken is None:
        return None, "EMPTY_OR_NON_NUMERIC"

    upper = spoken.strip().upper()
    if not upper:
        return None, "EMPTY_OR_NON_NUMERIC"

    # Detect non-MC federal IDs and non-domestic prefixes BEFORE stripping
    # punctuation, otherwise "DOT 1234567" would silently look like an MC.
    if "DOT" in upper:
        return None, "DOT_NOT_MC"

    compact = _NOISE_CHARS.sub("", upper)
    if compact.startswith(("MX", "FF")):
        return None, "NON_DOMESTIC_PREFIX"

    stripped = compact
    for word in _NOISE_WORDS:
        stripped = stripped.replace(word, "")
    if stripped.startswith("MC"):
        stripped = stripped[2:]

    if not stripped or not stripped.isdigit():
        return None, "EMPTY_OR_NON_NUMERIC"
    if len(stripped) < 4:
        return None, "TOO_SHORT"
    return stripped, None


@pytest.mark.parametrize(
    ("spoken", "expected_digits"),
    [
        ("MC-123456", "123456"),
        ("MC 123456", "123456"),
        ("MC #1234567", "1234567"),
        ("M C 1 2 3 4 5 6 7", "1234567"),
        ("MC number 250819", "250819"),
        ("1234567", "1234567"),
        ("123-4567", "1234567"),
        ("MC.1,234,567", "1234567"),
        ("  mc-9876  ", "9876"),
    ],
)
def test_accepts_valid_mc(spoken: str, expected_digits: str) -> None:
    digits, reason = normalize_mc(spoken)
    assert reason is None, f"expected acceptance, got reason={reason!r}"
    assert digits == expected_digits


@pytest.mark.parametrize(
    ("spoken", "expected_reason"),
    [
        ("MX-987654", "NON_DOMESTIC_PREFIX"),
        ("FF-123456", "NON_DOMESTIC_PREFIX"),
        ("DOT 1234567", "DOT_NOT_MC"),
        ("", "EMPTY_OR_NON_NUMERIC"),
        ("   ", "EMPTY_OR_NON_NUMERIC"),
        ("abc", "EMPTY_OR_NON_NUMERIC"),
        ("MC abc", "EMPTY_OR_NON_NUMERIC"),
        ("MC 12", "TOO_SHORT"),
        ("987", "TOO_SHORT"),
    ],
)
def test_rejects_invalid_mc(spoken: str, expected_reason: str) -> None:
    digits, reason = normalize_mc(spoken)
    assert digits is None, f"expected rejection, got digits={digits!r}"
    assert reason == expected_reason


def test_basic_mc_with_prefix() -> None:
    assert normalize_mc("MC-123456") == ("123456", None)


def test_mc_with_spaces() -> None:
    assert normalize_mc("MC 123456") == ("123456", None)


def test_mc_hash() -> None:
    assert normalize_mc("MC #1234567") == ("1234567", None)


def test_spelled_out() -> None:
    assert normalize_mc("M C 1 2 3 4 5 6 7") == ("1234567", None)


def test_word_number() -> None:
    assert normalize_mc("MC number 250819") == ("250819", None)


def test_no_prefix() -> None:
    assert normalize_mc("1234567") == ("1234567", None)


def test_with_dashes_inside() -> None:
    assert normalize_mc("123-4567") == ("1234567", None)


def test_mexican_carrier_rejected() -> None:
    assert normalize_mc("MX-987654") == (None, "NON_DOMESTIC_PREFIX")


def test_ff_prefix_rejected() -> None:
    assert normalize_mc("FF-123456") == (None, "NON_DOMESTIC_PREFIX")


def test_dot_number_rejected() -> None:
    assert normalize_mc("DOT 1234567") == (None, "DOT_NOT_MC")


def test_empty_input() -> None:
    assert normalize_mc("") == (None, "EMPTY_OR_NON_NUMERIC")


def test_letters_only() -> None:
    assert normalize_mc("abc") == (None, "EMPTY_OR_NON_NUMERIC")


def test_too_short() -> None:
    assert normalize_mc("MC 12") == (None, "TOO_SHORT")


def test_strips_punctuation() -> None:
    assert normalize_mc("MC.1,234,567") == ("1234567", None)

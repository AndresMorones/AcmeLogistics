"""Contract tests for the FMCSA QCMobile eligibility gate.

The carrier verification gate runs inside the HappyRobot voice-agent prompt
(not in our Python service), so this module tests the *shape contract* we
rely on when interpreting FMCSA QCMobile responses. The helper below mirrors
the eight-check rule set the prompt enforces. Anyone forking this repo can
run these tests to catch a drift in the upstream FMCSA payload, in our
prompt logic, or in fixtures shipped with the project.

The eight enforced checks (all must pass for an eligible carrier):

    1. ``content`` is non-null (MC was found in FMCSA's database)
       -> reason: ``MC_NOT_FOUND``
    2. ``carrier.allowedToOperate == "Y"`` -- FMCSA's own *primary*
       determination that the entity is legally allowed to operate. This is
       the gate everything else defers to. (FMCSA computes this from MCS-150
       status, authority status, insurance, and OOS in concert.)
       -> reason: ``NOT_AUTHORIZED``
    3. ``carrier.statusCode != "R"`` (USDOT not Revoked)
       -> reason: ``REVOKED``
    4. ``carrier.oosDate`` is null (not under an Out-of-Service order)
       -> reason: ``OUT_OF_SERVICE``
    5. ``carrier.safetyRating`` is null, "Satisfactory", or "Conditional"
       (only "Unsatisfactory" blocks; per 49 CFR 385.5 an Unsatisfactory-
       rated carrier is prohibited from operating a CMV in interstate
       commerce, and brokers are exposed to negligent-selection liability
       if they tender freight to one)
       -> reason: ``UNSAFE_RATING``
    6. ``carrier.commonAuthorityStatus == "A"`` -- active for-hire common
       authority. Required to dispatch loads against an MC docket. An
       inactive common authority means the carrier cannot legally accept
       brokered loads, even if their USDOT is otherwise active.
       -> reason: ``NO_COMMON_AUTHORITY``
    7. ``carrier.brokerAuthorityStatus != "A"`` (defends against
       double-brokering: a broker re-marketing freight as a carrier)
       -> reason: ``LIKELY_BROKER``
    8. ``carrier.censusTypeId.censusType`` is "C" (Carrier) or null;
       rejects "B" (Broker), "S" (Shipper), and "F" (Freight Forwarder)
       -> reason: ``NOT_A_CARRIER``

Sources confirming this rule set:
    - FMCSA SAFER company-snapshot help
      https://safer.fmcsa.dot.gov/saferapp/help/companysnapshothelp.aspx
    - FMCSA "Why is my operating authority status shown as NOT AUTHORIZED"
      https://www.fmcsa.dot.gov/faq/why-my-operating-authority-status-shown-not-authorized-safety-and-fitness-electronic-records
    - 49 CFR 385.5 (Unsatisfactory rating prohibits operation)
    - QCMobile API element reference
      https://mobile.fmcsa.dot.gov/QCDevsite/docs/apiElements

Why ``statusCode == "I"`` (Inactive USDOT, overdue MCS-150) is **not** a
hard reject when ``allowedToOperate == "Y"``:
    The Inactive USDOT flag means the entity missed the biennial MCS-150
    update -- a paperwork lapse, not necessarily an operational one. FMCSA
    already weighs MCS-150 status when computing ``allowedToOperate``. If
    ``allowedToOperate`` says "Y" while ``statusCode`` says "I", FMCSA's
    primary determination is "yes, allowed to operate" and we defer to it.
    Hard-rejecting on Inactive USDOT alone would turn away carriers that
    are still legally hauling.

Insurance (``bipdInsuranceOnFile >= bipdRequiredAmount``) is intentionally
NOT gated here -- BIPD-on-file lags real coverage status, so the field is
unreliable as a hard reject. Insurance verification is staged as Tier-3
fraud-defense (see ARCHITECTURE.md section 12).
"""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def evaluate_fmcsa_eligibility(response: dict) -> tuple[bool, str | None]:
    """Return ``(eligible, reason)`` for a raw FMCSA QCMobile response.

    ``reason`` is ``None`` when eligible and one of the documented reason
    codes otherwise. Reason codes are evaluated in priority order so the
    first failing check wins.
    """
    content = response.get("content")
    if content is None:
        return False, "MC_NOT_FOUND"

    carrier = content.get("carrier") or {}

    if carrier.get("allowedToOperate") != "Y":
        return False, "NOT_AUTHORIZED"

    if carrier.get("statusCode") == "R":
        return False, "REVOKED"

    if carrier.get("oosDate") is not None:
        return False, "OUT_OF_SERVICE"

    safety_rating = carrier.get("safetyRating")
    if safety_rating is not None and safety_rating not in {"Satisfactory", "Conditional"}:
        return False, "UNSAFE_RATING"

    if carrier.get("commonAuthorityStatus") != "A":
        return False, "NO_COMMON_AUTHORITY"

    if carrier.get("brokerAuthorityStatus") == "A":
        return False, "LIKELY_BROKER"

    census_type = (carrier.get("censusTypeId") or {}).get("censusType")
    if census_type is not None and census_type != "C":
        return False, "NOT_A_CARRIER"

    return True, None


def _load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.fixture
def eligible_response() -> dict:
    return _load_fixture("fmcsa_eligible_mc1234567.json")


@pytest.fixture
def no_common_authority_response() -> dict:
    return _load_fixture("fmcsa_no_common_authority_mc2986.json")


@pytest.fixture
def not_found_response() -> dict:
    return _load_fixture("fmcsa_not_found.json")


def test_eligible_carrier_passes(eligible_response: dict) -> None:
    eligible, reason = evaluate_fmcsa_eligibility(eligible_response)
    assert eligible is True, f"expected eligible carrier, got reason={reason!r}"
    assert reason is None


def test_no_common_authority_carrier_fails(no_common_authority_response: dict) -> None:
    """A carrier with ``allowedToOperate=Y`` but ``commonAuthorityStatus=I``
    is rejected with NO_COMMON_AUTHORITY.

    This represents a defunct carrier whose USDOT is technically still
    registered (paperwork-current enough for FMCSA's primary
    `allowedToOperate` flag) but whose for-hire common authority has lapsed
    -- so they cannot legally accept brokered loads.
    """
    eligible, reason = evaluate_fmcsa_eligibility(no_common_authority_response)
    assert eligible is False
    assert reason == "NO_COMMON_AUTHORITY", f"expected NO_COMMON_AUTHORITY, got {reason!r}"


def test_mc_not_found_fails_with_MC_NOT_FOUND(not_found_response: dict) -> None:
    eligible, reason = evaluate_fmcsa_eligibility(not_found_response)
    assert eligible is False
    assert reason == "MC_NOT_FOUND"


def test_not_authorized_synthetic(eligible_response: dict) -> None:
    payload = copy.deepcopy(eligible_response)
    payload["content"]["carrier"]["allowedToOperate"] = "N"
    assert evaluate_fmcsa_eligibility(payload) == (False, "NOT_AUTHORIZED")


def test_revoked_synthetic(eligible_response: dict) -> None:
    payload = copy.deepcopy(eligible_response)
    payload["content"]["carrier"]["statusCode"] = "R"
    assert evaluate_fmcsa_eligibility(payload) == (False, "REVOKED")


def test_inactive_status_alone_passes(eligible_response: dict) -> None:
    """``statusCode='I'`` (Inactive USDOT) is NOT a hard reject when
    ``allowedToOperate='Y'``. FMCSA's primary determination wins.

    This is the explicit guardrail against the over-strict legacy rule
    set that rejected carriers for being overdue on their MCS-150.
    """
    payload = copy.deepcopy(eligible_response)
    payload["content"]["carrier"]["statusCode"] = "I"
    assert evaluate_fmcsa_eligibility(payload) == (True, None)


def test_out_of_service_synthetic(eligible_response: dict) -> None:
    payload = copy.deepcopy(eligible_response)
    payload["content"]["carrier"]["oosDate"] = "2025-01-15"
    assert evaluate_fmcsa_eligibility(payload) == (False, "OUT_OF_SERVICE")


def test_unsatisfactory_safety_synthetic(eligible_response: dict) -> None:
    payload = copy.deepcopy(eligible_response)
    payload["content"]["carrier"]["safetyRating"] = "Unsatisfactory"
    assert evaluate_fmcsa_eligibility(payload) == (False, "UNSAFE_RATING")


def test_no_common_authority_synthetic(eligible_response: dict) -> None:
    payload = copy.deepcopy(eligible_response)
    payload["content"]["carrier"]["commonAuthorityStatus"] = "I"
    assert evaluate_fmcsa_eligibility(payload) == (False, "NO_COMMON_AUTHORITY")


def test_likely_broker_synthetic(eligible_response: dict) -> None:
    payload = copy.deepcopy(eligible_response)
    payload["content"]["carrier"]["brokerAuthorityStatus"] = "A"
    assert evaluate_fmcsa_eligibility(payload) == (False, "LIKELY_BROKER")


def test_not_a_carrier_synthetic(eligible_response: dict) -> None:
    """``censusType`` other than 'C' (e.g. 'B' broker, 'F' freight forwarder,
    'S' shipper) is a hard reject -- we only dispatch to motor carriers.
    """
    payload = copy.deepcopy(eligible_response)
    payload["content"]["carrier"]["censusTypeId"]["censusType"] = "B"
    assert evaluate_fmcsa_eligibility(payload) == (False, "NOT_A_CARRIER")


def test_conditional_safety_passes(eligible_response: dict) -> None:
    payload = copy.deepcopy(eligible_response)
    payload["content"]["carrier"]["safetyRating"] = "Conditional"
    assert evaluate_fmcsa_eligibility(payload) == (True, None)


def test_null_safety_rating_passes(eligible_response: dict) -> None:
    payload = copy.deepcopy(eligible_response)
    payload["content"]["carrier"]["safetyRating"] = None
    assert evaluate_fmcsa_eligibility(payload) == (True, None)


def test_satisfactory_safety_passes(eligible_response: dict) -> None:
    """The eligible fixture already carries Satisfactory; assert explicitly
    so a future fixture edit cannot silently flip the contract.
    """
    payload = copy.deepcopy(eligible_response)
    payload["content"]["carrier"]["safetyRating"] = "Satisfactory"
    assert evaluate_fmcsa_eligibility(payload) == (True, None)

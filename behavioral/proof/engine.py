#!/usr/bin/env python3
"""Fixture-backed sequential behavioral proof engine (PROVE mode).

One decision at a time over IS1-IS8. Simulation only: a `settled` result is a
fixture outcome, never a claim of live external settlement.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import yaml

AUTHORITY_PASS = {"likely_allow", "deferred_to_invocation"}
AUTHORITY_PENDING = {"requires_approval"}
AUTHORITY_BLOCK = {"denied", "unreachable", "unknown"}
PAYMENT_PASS = {"within_budget", "not_required"}
RECOVERY_PASS = {"reversible", "compensable", "read_only"}
SETTLEMENT_PASS = {"bound", "not_required"}


def load_journey(path: str | Path) -> dict[str, Any]:
    return yaml.safe_load(Path(path).read_text(encoding="utf-8"))


def _present(scenario: dict[str, Any]) -> dict[str, Any]:
    present: dict[str, Any] = {}
    for key in ("context", "preflight", "state"):
        present.update(scenario.get(key) or {})
    return present


def run_scenario(
    journey: dict[str, Any],
    scenario: dict[str, Any],
    *,
    all_mandatory: bool = False,
) -> dict[str, Any]:
    phases = journey["phases"]
    is_consequential = bool(journey.get("journey", {}).get("consequential"))
    present = _present(scenario)
    answers = scenario.get("answers") or {}
    provided_context = set((scenario.get("context") or {}).keys())

    transcript: list[dict[str, Any]] = []
    questions_asked: list[str] = []

    def step(phase: str, decision: str, outcome: str, **extra: Any) -> None:
        transcript.append({"phase": phase, "decision": decision, "outcome": outcome, **extra})

    # IS1 — context selection. Ask only what is not already resolved.
    for field in phases["IS1_context_selection"].get("requires", []):
        if all_mandatory or field not in present:
            questions_asked.append(field)
            if field in answers:
                present[field] = answers[field]
                step("IS1", f"ask:{field}", "answered_from_fixture")
            elif field in present:
                step("IS1", f"ask:{field}", "redundant_already_resolved")
            else:
                step("IS1", f"ask:{field}", "missing")
                return _result(journey, scenario, "blocked", "missing_context", questions_asked, transcript, is_consequential)
        else:
            step("IS1", f"resolve:{field}", "already_resolved")

    # IS2 — preflight checks.
    for check in phases["IS2_preflight"].get("checks", []):
        resolved_by = check.get("resolved_by")
        if resolved_by in present and present[resolved_by] not in (None, "", False):
            step("IS2", check["id"], "pass")
        else:
            step("IS2", check["id"], "blocked", reason=check.get("failure", "missing_precondition"))
            return _result(journey, scenario, "blocked", check.get("failure", "missing_precondition"), questions_asked, transcript, is_consequential)

    gates = scenario.get("gates") or {}

    # IS3 — authority resolution. Never infer permission.
    approval_status = (phases.get("IS3_authority_resolution", {}).get("approval") or {}).get("status")
    authority = gates.get("authority", "not_applicable_read_only" if not is_consequential else "unknown")
    if is_consequential:
        if approval_status != "bound":
            step("IS3", "authority_binding", "blocked", reason="unauthorized_or_unresolved")
            return _result(journey, scenario, "blocked", "unauthorized_or_unresolved", questions_asked, transcript, is_consequential)
        if authority in AUTHORITY_BLOCK:
            reason = "unauthorized" if authority == "denied" else "authority_unknown"
            status = "unknown" if authority in {"unknown", "unreachable"} else "blocked"
            step("IS3", "authority_gate", status, reason=reason, authority=authority)
            return _result(journey, scenario, status, reason, questions_asked, transcript, is_consequential, authority=authority)
        if authority in AUTHORITY_PENDING:
            step("IS3", "authority_gate", "blocked", reason="pending_approval", authority=authority)
            return _result(journey, scenario, "blocked", "pending_approval", questions_asked, transcript, is_consequential, authority=authority)
        if authority not in AUTHORITY_PASS:
            step("IS3", "authority_gate", "blocked", reason="unauthorized_or_unresolved", authority=authority)
            return _result(journey, scenario, "blocked", "unauthorized_or_unresolved", questions_asked, transcript, is_consequential, authority=authority)
        step("IS3", "authority_gate", "pass", authority=authority, grants_authority=False)
    else:
        if authority in AUTHORITY_BLOCK:
            step("IS3", "authority_gate", "blocked", reason="unauthorized")
            return _result(journey, scenario, "blocked", "unauthorized", questions_asked, transcript, is_consequential, authority=authority)
        step("IS3", "read_only_scope", "pass", authority="not_applicable_read_only")

    # IS4 — capability binding.
    capability = gates.get("capability", "unknown")
    if capability in {"missing", "unresolved", "unknown"}:
        status = "unknown" if capability == "unknown" else "blocked"
        reason = "missing_capability"
        step("IS4", "capability_binding", status, reason=reason)
        return _result(journey, scenario, status, reason, questions_asked, transcript, is_consequential)
    step("IS4", "capability_binding", "pass")

    # Payment, recovery, settlement access.
    payment = gates.get("payment", "not_required")
    if is_consequential and payment not in PAYMENT_PASS:
        reason = "unpayable" if payment == "unaffordable" else "payment_unknown"
        status = "unknown" if payment == "unknown" else "blocked"
        step("IS2", "payment_gate", status, reason=reason)
        return _result(journey, scenario, status, reason, questions_asked, transcript, is_consequential)
    step("IS2", "payment_gate", "pass", payment=payment)

    recovery = gates.get("recovery", "read_only")
    if is_consequential and recovery not in RECOVERY_PASS:
        reason = "unrecoverable" if recovery == "unrecoverable" else "recovery_unknown"
        status = "unknown" if recovery == "unknown" else "blocked"
        step("IS2", "recovery_gate", status, reason=reason)
        return _result(journey, scenario, status, reason, questions_asked, transcript, is_consequential)
    step("IS2", "recovery_gate", "pass", recovery=recovery)

    settlement_binding = (phases.get("IS7_settlement_or_decision", {}).get("settlement_binding") or {}).get("status")
    settlement_access = gates.get("settlement_access", "not_required")
    if is_consequential:
        if settlement_binding != "bound" or settlement_access not in SETTLEMENT_PASS or settlement_access == "not_required":
            step("IS2", "settlement_access_gate", "blocked", reason="no_settlement_access")
            return _result(journey, scenario, "blocked", "no_settlement_access", questions_asked, transcript, is_consequential)
        step("IS2", "settlement_access_gate", "pass")

    # Contradiction and cancellation are explicit outcomes, not hidden.
    if scenario.get("contradictory"):
        step("IS6", "evidence_consistency", "conflicted", claims=scenario["contradictory"])
        return _result(journey, scenario, "conflicted", "contradictory_evidence", questions_asked, transcript, is_consequential)
    if scenario.get("cancelled"):
        step("IS5", "commitment", "cancelled", world_effect="none")
        return _result(journey, scenario, "cancelled", "observer_cancelled", questions_asked, transcript, is_consequential)

    # IS5/IS6/IS7 — execution, evidence, settlement.
    execution = scenario.get("execution", "success")
    if execution == "failure":
        step("IS5", "execute", "failed")
        step("IS7", "settlement", "not_attempted", reason="execution_failed")
        return _result(journey, scenario, "execution_failed", scenario.get("failure_reason", "execution_failed"), questions_asked, transcript, is_consequential)
    step("IS5", "execute", "success", simulated=True)

    required = phases["IS6_evidence_inspection"].get("required_evidence", [])
    observed = set(scenario.get("evidence") or [])
    missing = [e for e in required if e not in observed and e not in {"citations"}]
    if missing:
        step("IS6", "evidence", "unknown", missing=missing)
        return _result(journey, scenario, "unknown", "evidence_incomplete", questions_asked, transcript, is_consequential, missing_evidence=missing)
    step("IS6", "evidence", "observed")

    if not is_consequential:
        step("IS7", "settlement", "not_applicable_read_only")
        return _result(journey, scenario, "available", None, questions_asked, transcript, is_consequential)

    settlement = scenario.get("settlement", "settled")
    if settlement == "settled":
        step("IS7", "settlement", "settled")
        return _result(journey, scenario, "settled", None, questions_asked, transcript, is_consequential)
    step("IS7", "settlement", "failed" if settlement == "failed" else "not_attempted")
    return _result(journey, scenario, "executed_unsettled", "settlement_not_reached", questions_asked, transcript, is_consequential)


def _next_affordances(journey: dict[str, Any], final_status: str) -> list[str]:
    candidates = journey["phases"]["IS8_next_affordance_selection"].get("candidates", [])
    available: list[str] = []
    for candidate in candidates:
        gates = candidate.get("gates") or {}
        candidate_ok = all(
            value in {"pass", "not_required", "not_applicable", "not_applicable_read_only", "bound", "read_only", "reversible", "compensable", "within_budget"}
            for value in gates.values()
        )
        if not candidate_ok:
            continue
        if final_status in {"settled", "available", "cancelled"}:
            if final_status == "cancelled" and candidate.get("operation_class") != "navigation":
                continue
            available.append(candidate["id"])
        elif final_status in {"blocked", "unknown", "conflicted", "execution_failed", "executed_unsettled"}:
            if candidate.get("operation_class") == "navigation":
                available.append(candidate["id"])
    return available


def _result(
    journey: dict[str, Any],
    scenario: dict[str, Any],
    status: str,
    reason: str | None,
    questions_asked: list[str],
    transcript: list[dict[str, Any]],
    consequential: bool,
    *,
    authority: str | None = None,
    missing_evidence: list[str] | None = None,
) -> dict[str, Any]:
    result = {
        "journey": journey["journey"]["id"],
        "scenario": scenario["id"],
        "status": status,
        "first_blocker": reason,
        "questions_asked": questions_asked,
        "next_affordances": _next_affordances(journey, status),
        "inferred_authority": False,
        "authority_granted": False,
        "execution_distinct_from_settlement": True,
        "settlement_distinct_from_evidence": True,
        "simulated": True,
        "consequential": consequential,
        "transcript": transcript,
    }
    if authority is not None:
        result["authority"] = authority
    if missing_evidence:
        result["missing_evidence"] = missing_evidence
    return result


def run_file(journey_path: str | Path, scenario: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
    return run_scenario(load_journey(journey_path), scenario, **kwargs)


def dumps(result: dict[str, Any]) -> str:
    return json.dumps(result, indent=2, sort_keys=True)


def clone_journey(journey: dict[str, Any]) -> dict[str, Any]:
    return copy.deepcopy(journey)

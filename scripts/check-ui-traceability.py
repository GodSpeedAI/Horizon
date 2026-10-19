#!/usr/bin/env python3
"""Check Atomic UI traceability, affordance sourcing and accessibility declarations.

Each view element must resolve to a Behavioral IR phase; each action must name a
known behavioral action and project availability from the IR without local policy.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
JOURNEYS = ROOT / "behavioral" / "journeys"
CONTRACT = ROOT / "ui-model" / "atomic-ui-contract.yaml"

FORBIDDEN_DEFAULT = ["enabled_when", "visible_when", "policy", "gate_policy", "approval_override", "is_authorized"]


def walk(node):
    if isinstance(node, dict):
        for key, value in node.items():
            yield key, value
            yield from walk(value)
    elif isinstance(node, list):
        for item in node:
            yield from walk(item)


def behavioral_index() -> tuple[dict[str, dict[str, str]], set[str]]:
    phases: dict[str, set[str]] = {}
    actions: set[str] = set()
    for path in sorted(JOURNEYS.glob("*.yaml")):
        doc = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        journey = doc.get("journey", {}).get("id")
        if not journey:
            continue
        phases[journey] = set((doc.get("phases") or {}).keys())
        is4 = (doc.get("phases") or {}).get("IS4_capability_invocation", {}).get("capability", {})
        if is4.get("semantic_id"):
            actions.add(is4["semantic_id"])
        for candidate in (doc.get("phases") or {}).get("IS8_next_affordance_selection", {}).get("candidates", []):
            actions.add(candidate["id"])
    return {j: {p: "" for p in ps} for j, ps in phases.items()}, actions


def check(path: Path, index: dict[str, dict[str, str]], actions: set[str], forbidden: set[str]) -> list[str]:
    errs: list[str] = []
    try:
        doc = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError) as exc:
        return [f"cannot parse: {exc}"]

    view = doc.get("view") or {}
    sources = doc.get("sources") or {}
    journey = sources.get("journey")
    if journey not in index:
        errs.append(f"view {view.get('id', '?')}: sources.journey '{journey}' is not a Behavioral IR journey")

    regions = {r.get("id") for r in doc.get("regions") or []}
    elements = doc.get("elements") or []
    element_ids = {e.get("id") for e in elements}

    accessibility = doc.get("accessibility") or {}
    focus_order = accessibility.get("focus_order") or []
    if not focus_order:
        errs.append(f"view {view.get('id', '?')}: accessibility.focus_order required")
    for target in focus_order:
        if target not in element_ids:
            errs.append(f"view {view.get('id', '?')}: focus_order target '{target}' is not a declared element")
    if accessibility.get("non_color_status") is not True:
        errs.append(f"view {view.get('id', '?')}: accessibility.non_color_status must be true")

    for element in elements:
        eid = element.get("id", "?")
        if not element.get("traces_to"):
            errs.append(f"element {eid}: untraceable element (traces_to required)")
        else:
            trace = element["traces_to"] or {}
            tj = trace.get("journey")
            tp = trace.get("phase")
            if tj not in index:
                errs.append(f"element {eid}: traces_to.journey '{tj}' is not a Behavioral IR journey")
            elif tp not in index[tj]:
                errs.append(f"element {eid}: traces_to.phase '{tp}' is not declared in {tj}")
            ref = trace.get("ref")
            if ref and ref not in actions:
                errs.append(f"element {eid}: traces_to.ref '{ref}' is not a known behavioral action")
        if element.get("region") and element["region"] not in regions:
            errs.append(f"element {eid}: region '{element['region']}' not declared")
        if not element.get("region"):
            errs.append(f"element {eid}: region required")

        for key, _value in walk(element):
            if key in forbidden:
                errs.append(f"element {eid}: forbidden local policy key '{key}' duplicates Behavioral IR authority")

        if element.get("primitive") == "action":
            semantic = element.get("semantic_action")
            if semantic not in actions:
                errs.append(f"action {eid}: semantic_action '{semantic}' is not in the Behavioral IR")
            availability = element.get("availability") or {}
            if availability.get("source") != "behavioral_ir":
                errs.append(f"action {eid}: availability.source must be behavioral_ir")
            if not availability.get("behavioral_ref"):
                errs.append(f"action {eid}: availability.behavioral_ref required")
            if element.get("consequence") == "consequential":
                if not element.get("commitment"):
                    errs.append(f"action {eid}: consequential action requires commitment classification")
                if not element.get("authority_binding"):
                    errs.append(f"action {eid}: consequential action requires authority_binding")
                if not element.get("evidence_requirement"):
                    errs.append(f"action {eid}: consequential action requires evidence_requirement")
                if not element.get("recovery_relation"):
                    errs.append(f"action {eid}: consequential action requires recovery_relation")

    if re.search(r"\b(dashboard|sidebar)\b", path.name, re.I):
        errs.append(f"view {view.get('id', '?')}: renderer-specific layout name in file name")
    return errs


def main(argv: list[str]) -> int:
    contract = yaml.safe_load(CONTRACT.read_text(encoding="utf-8")) or {}
    forbidden = set(FORBIDDEN_DEFAULT) | set(contract.get("forbidden_policy_keys") or [])
    mappings = contract.get("renderer_mappings") or []
    if len(mappings) < 2:
        print("FAIL atomic-ui-contract: at least two renderer mappings required")
        return 1

    index, actions = behavioral_index()
    paths = [Path(p) for p in argv] or sorted((ROOT / "ui-model" / "views").glob("*.yaml"))
    bad = 0
    for path in paths:
        errs = check(path, index, actions, forbidden)
        print(f"{'FAIL' if errs else 'ok  '} {path}")
        for err in errs:
            print(f"   - {err}")
        bad += bool(errs)
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

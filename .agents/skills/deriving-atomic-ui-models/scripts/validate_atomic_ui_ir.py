#!/usr/bin/env python3
"""Validate Atomic UI view files: traceability, semantic primitives, affordance sourcing, no framework names."""
import re
import sys

import yaml

PRIMITIVES = set("""identity label value status metric message evidence_item artifact_reference action
choice input collection tree table graph timeline progress navigation notification inspector comparison
command workspace viewport""".split())
FRAMEWORK = re.compile(r"(React|OpenTUI|Radix|Tauri|Tailwind|Material|Swift|Compose)", re.I)


def walk(node):
    if isinstance(node, dict):
        for k, v in node.items():
            yield k, v
            yield from walk(v)
    elif isinstance(node, list):
        for i in node:
            yield from walk(i)


def check(path):
    errs = []
    try:
        doc = yaml.safe_load(open(path)) or {}
    except (OSError, yaml.YAMLError) as e:
        return [f"cannot parse: {e}"]
    v = doc.get("view") or {}
    if not v.get("id") or not v.get("purpose"):
        errs.append("view.id and view.purpose required")
    src = doc.get("sources") or {}
    if not src.get("journey") or not src.get("behavioral_phases"):
        errs.append("sources.journey and sources.behavioral_phases required (view must trace to Behavioral IR)")
    for ph in src.get("behavioral_phases") or []:
        if not re.fullmatch(r"IS[1-8]", str(ph)):
            errs.append(f"behavioral phase '{ph}' must be IS1..IS8")
    regions = {r.get("id") for r in doc.get("regions") or []}
    for e in doc.get("elements") or []:
        eid = e.get("id", "?")
        if e.get("primitive") not in PRIMITIVES:
            errs.append(f"element {eid}: unknown primitive '{e.get('primitive')}'")
        if e.get("region") and e["region"] not in regions:
            errs.append(f"element {eid}: region '{e['region']}' not declared")
        if e.get("primitive") == "action":
            if not e.get("semantic_action"):
                errs.append(f"action {eid}: semantic_action required")
            if (e.get("availability") or {}).get("source") != "behavioral_ir":
                errs.append(f"action {eid}: availability.source must be behavioral_ir")
            if not e.get("consequence"):
                errs.append(f"action {eid}: consequence required")
    for k, val in walk(doc):
        if k == "component" or (k == "primitive" and FRAMEWORK.search(str(val))):
            errs.append(f"framework-specific key/value at '{k}: {val}'")
    return errs


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: validate_atomic_ui_ir.py <view.yaml>...")
    bad = 0
    for f in sys.argv[1:]:
        errs = check(f)
        print(f"{'FAIL' if errs else 'ok  '} {f}")
        for e in errs:
            print(f"   - {e}")
        bad += bool(errs)
    sys.exit(1 if bad else 0)

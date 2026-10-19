#!/usr/bin/env python3
"""Validate Behavioral IR journey files: required identity fields, IS1-IS8 phases, proof mode."""
import re
import sys

import yaml

PHASES = ["IS1", "IS2", "IS3", "IS4", "IS5", "IS6", "IS7", "IS8"]
MODES = {"IR_ONLY", "PROTOTYPE", "PROVE"}
WIDGET = re.compile(r"\b(button|dialog|modal|prompt|select|textbox|component)\b", re.I)


def check(path):
    errs = []
    try:
        doc = yaml.safe_load(open(path)) or {}
    except (OSError, yaml.YAMLError) as e:
        return [f"cannot parse: {e}"]
    j = doc.get("journey") or {}
    for k in ("id", "title", "semantic_source", "semantic_authority"):
        if not j.get(k):
            errs.append(f"journey.{k} missing")
    if doc.get("proof_mode") not in MODES:
        errs.append(f"proof_mode must be one of {sorted(MODES)}")
    phases = doc.get("phases") or {}
    found = {re.match(r"(IS\d)", k).group(1): v for k, v in phases.items() if re.match(r"IS\d", k)}
    for p in PHASES:
        if p not in found:
            errs.append(f"phase {p} missing (mark unresolved explicitly, do not omit)")
        elif not found[p]:
            errs.append(f"phase {p} empty")
    for k in doc.get("interaction_kinds", []) or []:
        if WIDGET.search(str(k)):
            errs.append(f"interaction kind '{k}' looks renderer-specific")
    return errs


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: validate_behavioral_ir.py <journey.yaml>...")
    bad = 0
    for f in sys.argv[1:]:
        errs = check(f)
        print(f"{'FAIL' if errs else 'ok  '} {f}")
        for e in errs:
            print(f"   - {e}")
        bad += bool(errs)
    sys.exit(1 if bad else 0)

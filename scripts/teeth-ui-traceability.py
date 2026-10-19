#!/usr/bin/env python3
"""Deliberate negative cases for Atomic UI traceability and affordance sourcing."""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
CHECKER = ROOT / "scripts" / "check-ui-traceability.py"
VIEWS = ROOT / "ui-model" / "views"


def run_checker(*paths: Path) -> tuple[int, str]:
    proc = subprocess.run(
        [sys.executable, str(CHECKER), *[str(p) for p in paths]],
        capture_output=True,
        text=True,
    )
    return proc.returncode, proc.stdout + proc.stderr


def attack_untraceable_metric(doc):
    doc["elements"].append(
        {
            "id": "dashboard_metric",
            "primitive": "metric",
            "binds": {"field": "throughput"},
            "region": "evidence",
        }
    )
    return doc


def attack_unknown_approval(doc):
    doc["elements"].append(
        {
            "id": "approve_payment",
            "primitive": "action",
            "semantic_action": "approve_payment",
            "consequence": "consequential",
            "region": "settlement",
            "traces_to": {"journey": "J02", "phase": "IS8_next_affordance_selection", "ref": "approve_payment"},
            "availability": {"source": "behavioral_ir", "behavioral_ref": "J02.IS8.approve_payment"},
            "commitment": {"world_effect": "payment_released", "settlement_required": True},
            "authority_binding": {"source": "behavioral_ir", "evaluator": "SEA-Forge", "grants_authority": False},
            "evidence_requirement": ["approval"],
            "recovery_relation": "irreversible",
        }
    )
    return doc


def attack_divergent_availability(doc):
    for element in doc["elements"]:
        if element.get("id") == "defer_action":
            element["availability"]["enabled_when"] = "authority == denied"
    return doc


def attack_missing_accessibility(doc):
    doc.pop("accessibility", None)
    return doc


def load(name: str):
    return yaml.safe_load((VIEWS / name).read_text(encoding="utf-8"))


def main() -> int:
    cases = [
        ("untraceable dashboard metric", "evidence_inspector.yaml", attack_untraceable_metric, "untraceable element"),
        ("unknown approval action", "evidence_inspector.yaml", attack_unknown_approval, "not in the Behavioral IR"),
        ("divergent GUI availability", "sequential_prompt.yaml", attack_divergent_availability, "forbidden local policy key"),
        ("missing accessibility", "home_attention.yaml", attack_missing_accessibility, "accessibility.focus_order required"),
    ]

    failed = False
    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        for index, (label, base, mutate, expected) in enumerate(cases):
            doc = mutate(load(base))
            path = tmpdir / f"attack_{index}.yaml"
            path.write_text(yaml.safe_dump(doc, sort_keys=False), encoding="utf-8")
            code, output = run_checker(path)
            ok = code == 1 and expected in output
            print(f"{'PASS' if ok else 'FAIL'} {label}: exit {code}, expected rejection containing '{expected}'")
            if not ok:
                print(output)
            failed = failed or not ok

    code, output = run_checker(*sorted(VIEWS.glob("*.yaml")))
    ok = code == 0
    print(f"{'PASS' if ok else 'FAIL'} real views remain valid: exit {code}")
    if not ok:
        print(output)
    return 1 if failed or not ok else 0


if __name__ == "__main__":
    raise SystemExit(main())

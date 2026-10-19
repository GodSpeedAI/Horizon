#!/usr/bin/env python3
"""Teeth: removing the approval/settlement binding from a consequential journey must block."""

from __future__ import annotations

import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from engine import clone_journey, load_journey, run_scenario  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
JOURNEY = ROOT / "behavioral" / "journeys" / "J02.yaml"
SCENARIOS = Path(__file__).resolve().parent / "scenarios.yaml"


def main() -> int:
    journey = load_journey(JOURNEY)
    scenarios = {s["id"]: s for s in yaml.safe_load(SCENARIOS.read_text(encoding="utf-8"))}
    happy = scenarios["S10_J02_happy_settled"]

    intact = run_scenario(journey, happy)
    broken = clone_journey(journey)
    broken["phases"]["IS3_authority_resolution"]["approval"]["status"] = "unresolved_in_source"
    broken["phases"]["IS7_settlement_or_decision"]["settlement_binding"]["status"] = "unresolved_in_source"
    degraded = run_scenario(broken, happy)

    checks = [
        ("intact fixture settles", intact["status"] == "settled"),
        ("degraded fixture does not settle", degraded["status"] != "settled"),
        ("degraded reason names missing binding", degraded["first_blocker"] in {"unauthorized_or_unresolved", "no_settlement_access"}),
        ("no inferred authority", degraded["inferred_authority"] is False and degraded["authority_granted"] is False),
    ]
    failed = False
    for label, ok in checks:
        print(f"{'PASS' if ok else 'FAIL'} {label} (observed: {degraded['status']}/{degraded['first_blocker']})")
        failed = failed or not ok
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

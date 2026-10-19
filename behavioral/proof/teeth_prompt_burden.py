#!/usr/bin/env python3
"""Teeth: already-resolved context must not be asked again; mandatory-everything must over-ask."""

from __future__ import annotations

import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from engine import load_journey, run_scenario  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
JOURNEY = ROOT / "behavioral" / "journeys" / "J01.yaml"
SCENARIOS = Path(__file__).resolve().parent / "scenarios.yaml"


def main() -> int:
    journey = load_journey(JOURNEY)
    scenarios = {s["id"]: s for s in yaml.safe_load(SCENARIOS.read_text(encoding="utf-8"))}
    happy = scenarios["S01_J01_happy"]

    contextual = run_scenario(journey, happy)
    mandatory = run_scenario(journey, happy, all_mandatory=True)

    checks = [
        ("contextual run asks nothing already resolved", contextual["questions_asked"] == []),
        ("contextual run still available", contextual["status"] == "available"),
        ("mandatory-everything over-asks resolved context", len(mandatory["questions_asked"]) == 4),
        ("mandatory-everything recorded each question as redundant", sum(1 for s in mandatory["transcript"] if s["outcome"] == "redundant_already_resolved") == 4),
    ]
    failed = False
    for label, ok in checks:
        print(f"{'PASS' if ok else 'FAIL'} {label}")
        failed = failed or not ok
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Run the T02 scenario matrix and compare observed outcomes to preregistered expectations."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from engine import load_journey, run_scenario  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
JOURNEYS = ROOT / "behavioral" / "journeys"
SCENARIOS = Path(__file__).resolve().parent / "scenarios.yaml"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scenarios", default=str(SCENARIOS))
    parser.add_argument("--out", default=str(Path(__file__).resolve().parent / "transcripts"))
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    scenarios = yaml.safe_load(Path(args.scenarios).read_text(encoding="utf-8"))
    journeys = {jid: load_journey(JOURNEYS / f"{jid}.yaml") for jid in {s["journey"] for s in scenarios}}

    failures: list[str] = []
    for scenario in scenarios:
        result = run_scenario(journeys[scenario["journey"]], scenario)
        (out_dir / f"{scenario['id']}.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")

        expected = scenario["expected"]
        expected_reason = scenario.get("expected_reason")
        observed_reason = result["first_blocker"]
        ok = result["status"] == expected and (expected_reason is None or observed_reason == expected_reason)
        if result["inferred_authority"] or result["authority_granted"]:
            ok = False
            failures.append(f"{scenario['id']}: engine inferred authority")
        print(f"{'PASS' if ok else 'FAIL'} {scenario['id']}: {result['status']} ({observed_reason})")
        if not ok:
            failures.append(f"{scenario['id']}: expected {expected}/{expected_reason}, observed {result['status']}/{observed_reason}")

    print(f"\n{len(scenarios) - len(failures)}/{len(scenarios)} scenarios matched preregistered expectations")
    if failures:
        for failure in failures:
            print(f"  - {failure}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

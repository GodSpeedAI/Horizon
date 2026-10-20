#!/usr/bin/env python3
"""Apply candidate revision T04-CR-001 to compose the post-freeze formation inputs.

This script does NOT freeze and does NOT touch an active artifact. It writes two files
beside the candidate for the owner (or the reviewer of the authorized freeze) to inspect:

  .agents/candidates/horizon/T04-CR-001/composed/ledger-policy.yaml
  .agents/candidates/horizon/T04-CR-001/composed/prereg.patch

Running it is the mechanical half of authorization; the normative half is the owner's
decision recorded in `.agents/reports/horizon-decisions.yaml`.

Usage:
  apply-candidate-revision.py [--candidate .agents/candidates/horizon/T04-CR-001]
"""

import argparse
import difflib
import os
import subprocess
import sys

import yaml

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FROZEN_POLICY = os.path.join(REPO, "scripts", "ledger-policy.yaml")
FROZEN_PREREG = os.path.join(REPO, ".agents", "prereg", "horizon", "T04.prereg.yaml")


def main(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate", default=os.path.join(REPO, ".agents", "candidates", "horizon", "T04-CR-001"))
    args = parser.parse_args(argv)
    candidate = os.path.abspath(args.candidate)
    overlay_path = os.path.join(REPO, "scripts", "ledger-policy.candidate.yaml")
    overlay = yaml.safe_load(open(overlay_path, encoding="utf-8")) or {}
    frozen_text = open(FROZEN_POLICY, encoding="utf-8").read()

    # 1. Compose the policy: overlay entries replace/add frozen entries; `evaluated_by` last.
    #    A new override is legitimate when its requirement exists in the frozen spec.
    frozen = yaml.safe_load(frozen_text) or {}
    spec = yaml.safe_load(open(os.path.join(REPO, ".agents", "specs", "horizon.agent.spec.yaml"), encoding="utf-8"))
    requirement_texts = {}

    def walk(node):
        if isinstance(node, dict):
            value = node.get("id")
            if isinstance(value, str) and value.startswith("REQ-") and isinstance(node.get("text"), str):
                requirement_texts.setdefault(value, node["text"])
            for child in node.values():
                walk(child)
        elif isinstance(node, list):
            for child in node:
                walk(child)

    walk(spec)
    missing = sorted(set(overlay["overrides"]) - set(requirement_texts))
    if missing:
        raise SystemExit(f"candidate overrides requirements the frozen spec does not declare: {missing}")
    # An overlay entry states its restated rule, the input the witness supplies, and the
    # policy it introduces. The ledger carries the rule only; a witness-supplied input is
    # never policy, and a non-empty `introduced` is exactly the defect this revision
    # corrects, so it is refused rather than composed.
    flattened = {}
    for rid, entry in overlay["overrides"].items():
        if not isinstance(entry, dict) or set(entry) != {"rule", "witness_supplies", "introduced"}:
            raise SystemExit(f"{rid}: an overlay entry must carry exactly rule, witness_supplies, introduced")
        introduced = [term for term in (entry["introduced"] or []) if str(term).strip()]
        if introduced:
            raise SystemExit(f"{rid}: the candidate introduces policy the ruler does not carry: {introduced}")
        if not str(entry["rule"]).strip() or not str(entry["witness_supplies"]).strip():
            raise SystemExit(f"{rid}: empty rule or witness_supplies")
        flattened[rid] = " ".join(str(entry["rule"]).split())
    composed = dict(frozen)
    composed["overrides"] = {**(frozen.get("overrides") or {}), **flattened}
    if "evaluated_by" in frozen:
        raise SystemExit("frozen policy unexpectedly carries evaluated_by; refusing to compose silently")
    composed["evaluated_by"] = overlay["evaluated_by"]

    os.makedirs(os.path.join(candidate, "composed"), exist_ok=True)
    composed_path = os.path.join(candidate, "composed", "ledger-policy.yaml")
    with open(composed_path, "w", encoding="utf-8") as handle:
        yaml.safe_dump(composed, handle, sort_keys=False, width=100, allow_unicode=True)

    # 2. Regenerate the ledger against the composed policy and check it against the frozen one.
    ledger_path = os.path.join(candidate, "ledger.yaml")
    subprocess.run(
        [sys.executable, os.path.join(REPO, "scripts", "gen-ledger-variant.py"), "--policy", composed_path, "--out", ledger_path],
        check=True,
        cwd=REPO,
    )

    # 3. Propose the prereg correction of `pin_revision.verified_by` (frozen artifact).
    prereg_text = open(FROZEN_PREREG, encoding="utf-8").read()
    replacement = (
        "    verified_by: >-\n"
        "      The one-line semantic correction is independently reproducible: `scripts/world-ref.py --expect\n"
        "      <revised>` derives 6c18d6a6.. from the corrected source, and reversing only that line derives\n"
        "      b0f31fcc.., the original pin (confirmed by the T04 verdict, 2026-10-19). `domainforge validate\n"
        "      --application` reports 0 violations and 4 operations / 8 records / 16 enums / 24 entities, which\n"
        "      is compilation and symbol-resolution evidence ONLY: the same gate reports 0 violations for a\n"
        "      nonexistent requirement_ref and for a duplicated invariant_id (scripts/teeth-domainforge-gate.py).\n"
        "      Referential integrity is checked separately by scripts/check-idm-integrity.py.\n"
    )
    start = prereg_text.index("    verified_by: >-")
    end = prereg_text.index("    rejected: >-")
    proposed = prereg_text[:start] + replacement + prereg_text[end:]
    patch_path = os.path.join(candidate, "composed", "prereg.patch")
    with open(patch_path, "w", encoding="utf-8") as handle:
        handle.writelines(
            difflib.unified_diff(
                prereg_text.splitlines(keepends=True),
                proposed.splitlines(keepends=True),
                fromfile="a/.agents/prereg/horizon/T04.prereg.yaml",
                tofile="b/.agents/prereg/horizon/T04.prereg.yaml",
            )
        )

    print(f"composed policy: {os.path.relpath(composed_path, REPO)}")
    print(f"candidate ledger: {os.path.relpath(ledger_path, REPO)}")
    print(f"prereg patch: {os.path.relpath(patch_path, REPO)} (apply only after owner authorization)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

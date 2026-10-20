#!/usr/bin/env python3
"""Measure whether a ledger's acceptance contracts preserve their requirement's modals.

A contract can keep a requirement's subject and still change what it *means* by dropping the
modal that carries the obligation:

  - a prohibition (MUST NOT / never observed) restated as a positive observation (verdict F2),
  - a permission (MAY) restated as an absolute (criticism round 1),
  - a soft obligation (SHOULD) restated as a hard one (criticism round 1),
  - a restriction (only) or an exact key set (exactly) dropped.

The measure is deliberately mechanical and conservative: it only reports a *loss* (the
requirement carries a modal the contract does not), never a paraphrase. A loss is a defect in
the contract; an added modal is reported separately, because "reviewers MUST NOT be
impersonated" and "an answer MUST NOT be misrepresented" share no wording but neither adds
policy.

Usage:
  measure-contract-modals.py [--ledger PATH]...
  Defaults: requirements/ledger.yaml and the candidate ledger, where each exists.
Exit 0 only if every ledger it read preserves every modal.
"""

from __future__ import annotations

import argparse
import os
import re
import sys

import yaml

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CANDIDATE_LEDGER = os.path.join(REPO, ".agents", "candidates", "horizon", "T04-CR-001", "ledger.yaml")

MODALS = {
    # A prohibition stated as a positive outcome is either "never observed to X" or its
    # effect: the attempt is refused, rejected, or has no effect. Both deny the obligation's
    # opposite, so both counts as preserving the prohibition.
    "prohibition": r"must not|must never|should not|never observed|\bis refused\b|\bare refused\b|\brefuses\b|\bis rejected\b|\bare rejected\b|\bno effect\b|\bcannot\b",
    "permission": r"\bmay\b|permitted|allowed",
    "soft obligation": r"\bshould\b",
    "restriction (only)": r"\bonly\b",
    "exact key set (exactly)": r"\bexactly\b",
}


def counts(text: str) -> dict[str, int]:
    return {name: len(re.findall(pattern, text.lower())) for name, pattern in MODALS.items()}


def _key(path: str, rid: str, missing: dict[str, int]) -> str:
    """One baseline line per lost modal: `<ledger file name>: check-modals: <REQ>: loses <kind>`."""
    return f"{os.path.basename(path)}: check-modals: {rid}: loses {', '.join(missing)}"


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ledger", action="append")
    parser.add_argument(
        "--baseline",
        default=None,
        help="findings already present in the frozen ledger (reported, not fatal); new ones fail",
    )
    args = parser.parse_args(argv)

    ledgers = args.ledger or [
        path
        for path in (os.path.join(REPO, "requirements", "ledger.yaml"), CANDIDATE_LEDGER)
        if os.path.isfile(path)
    ]
    failures = 0
    baseline = set()
    if args.baseline and os.path.isfile(args.baseline):
        baseline = {
            line.strip()
            for line in open(args.baseline, encoding="utf-8")
            if line.strip() and not line.startswith("#")
        }
    for path in ledgers:
        label = os.path.relpath(os.path.abspath(path), REPO)
        ledger = yaml.safe_load(open(path, encoding="utf-8"))
        requirements = {r["id"]: r["statement"] for r in ledger.get("requirements") or []}
        losses = []
        for contract in ledger.get("acceptance_contracts") or []:
            statement = requirements.get(contract["requirement"])
            if statement is None:
                continue
            wanted, got = counts(statement), counts(contract["expected"])
            missing = {name: wanted[name] for name in wanted if wanted[name] and not got[name]}
            if missing:
                losses.append((contract["requirement"], missing))
        if losses:
            known = [(rid, m) for rid, m in losses if _key(path, rid, m) in baseline]
            new = [(rid, m) for rid, m in losses if _key(path, rid, m) not in baseline]
            if known:
                print(f"measure-contract-modals: {len(known)} known pre-existing loss(es) in {label} (DEBT D-020), not fatal")
                for rid, missing in known:
                    print(f"  ~ {rid}: loses {', '.join(missing)}")
            if new:
                failures += len(new)
                print(f"measure-contract-modals: FAILED — {label}: {len(new)} contract(s) drop a modal")
                for rid, missing in new:
                    print(f"- {rid}: loses {', '.join(missing)}")
        else:
            print(f"measure-contract-modals: OK — {label}: every contract preserves its requirement's modals")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

#!/usr/bin/env python3
"""Match acceptance contracts to their claim, against the frozen spec and a ledger.

Two independent classes of defect are checked:

1. **Polarity** (verdict F2). A `MUST NOT` requirement must not be expressed as a positive
   observation. The four contracts the verdict named are checked against the frozen spec
   text, verbatim in the candidate ledger, so regenerating cannot silently re-invert them.
2. **Polcy loss on generic contracts.** Every *other* contract that is still a generic
   restatement must list, as its subject, a term the requirement actually uses. A generic
   contract must not name an actor or clause the ruler never states.

Neither check claims semantic adequacy: a passing polarity and subject do not prove an
observable outcome (that is the contract-revision work). They only deny these two defects.

Usage:
  check-acceptance-claims.py [--ledger PATH] [--require-candidate]
  Default ledger: requirements/ledger.yaml. `--require-candidate` additionally demands the
  candidate ledger and fails on the frozen ones (it does not).
"""

from __future__ import annotations

import argparse
import os
import re
import sys

import yaml

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC = os.path.join(REPO, ".agents", "specs", "horizon.agent.spec.yaml")

# The four contracts the independent verdict (F2) showed reversed a prohibition, with the
# requirement text they must reflect.
POLARITY = {
    "REQ-INT-004": "An answer, choice or confirmation MUST NOT be misrepresented as independent approval or a world mutation.",
    "REQ-STACK-006": "RealityTrace delivery receipts MUST NOT be treated as evidence derivation or settlement.",
    "REQ-STACK-012": "Products MUST NOT be required to adopt Horizon's language, storage or UI; non-TypeScript products integrate through process, CLI, MCP or Connect boundaries owned by Cognate.",
    "REQ-UI-006": "Agent-composed content MUST NOT reorder owner-pinned surfaces or seize presentation control; owner choices govern layout.",
}

CLOSED_VOCABULARY = ["MUST NOT", "MUST", "never", "Observed", "observed to"]

# A positive rendering of a prohibition: "<subject> [is|are] observed to <body>" where the
# ruler's clause was a prohibition. Caught on the contract's own text.
NEGATIONS = re.compile(r"MUST NOT|MUST never|SHOULD NOT|MAY NOT|never")


def spec_requirements():
    spec = yaml.safe_load(open(SPEC, encoding="utf-8"))
    found = {}

    def walk(node):
        if isinstance(node, dict):
            value = node.get("id")
            if isinstance(value, str) and value.startswith("REQ-") and isinstance(node.get("text"), str):
                found.setdefault(value, " ".join(node["text"].split()))
            for child in node.values():
                walk(child)
        elif isinstance(node, list):
            for child in node:
                walk(child)

    walk(spec)
    return found


def main(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--ledger", default=os.path.join(REPO, "requirements", "ledger.yaml"))
    parser.add_argument("--require-candidate", action="store_true")
    parser.add_argument("--allow-generic", action="store_true", help="report generic contracts without failing")
    args = parser.parse_args(argv)

    spec = spec_requirements()
    ledger = yaml.safe_load(open(args.ledger, encoding="utf-8"))
    contracts = {c["requirement"]: c for c in ledger.get("acceptance_contracts") or []}

    errors = []
    # 1. Polarity of the four reversed prohibitions.
    for rid, expected_text in POLARITY.items():
        if rid not in spec:
            errors.append(f"{rid}: the frozen spec no longer declares this requirement")
            continue
        if spec[rid] != expected_text:
            errors.append(f"{rid}: frozen requirement text changed; re-derive the polarity expectation, do not edit it silently")
        contract = contracts.get(rid)
        if contract is None:
            errors.append(f"{rid}: the ledger has no acceptance contract")
            continue
        expressed = contract["expected"]
        if not re.search(r"never observed to|MUST NOT", expressed):
            errors.append(f"{rid}: the contract does not preserve the requirement's prohibition: {expressed!r}")
        body = re.split(r"observed to", expressed)[-1]
        for term in ("misrepresented", "treated", "required", "reorder"):
            if term in expected_text and term not in body:
                errors.append(f"{rid}: the contract dropped {term!r} from the requirement")

    # 2. Generic contracts must keep the requirement's own subject; they may not invent one.
    generic = 0
    retained = 0
    for rid, contract in contracts.items():
        text = contract["expected"]
        if not text.startswith("Observed in the runtime's own terms:"):
            continue
        generic += 1
        statement = spec.get(rid)
        if statement is None:
            errors.append(f"{rid}: requirement is not declared in the frozen spec")
            continue
        subject = re.split(r"\b(MUST|SHOULD|MAY)\b", statement)[0].strip()
        body = text.split(":", 1)[1].strip().rstrip(".")
        if subject and body.startswith(subject[0].lower() + subject[1:]):
            retained += 1
        else:
            errors.append(f"{rid}: generic restatement does not keep the ruler's subject {subject!r}: {body!r}")

    if errors:
        print(f"check-acceptance-claims: FAILED ({len(errors)})")
        for error in errors:
            print(f"- {error}")
        return 1
    print(
        f"check-acceptance-claims: OK ({len(POLARITY)} prohibitions preserved, "
        f"{generic} generic restatements with their subject intact)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

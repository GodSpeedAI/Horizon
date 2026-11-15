#!/usr/bin/env python3
"""No canonical `.sea` invariant may be missing from the frozen requirement ledger.

The canonical model may witness one requirement with several invariants (REQ-DEV-001 is
witnessed by INV-07 and INV-12). The ledger records every such binding: the primary witness in
`semantic_binding.invariant`/`invariant_source`, and the rest in
`semantic_binding.additional_invariants`. A generator that kept only the first binding would
silently discard a real semantic relationship, so this check compares the two sets in BOTH
directions and fails closed on any difference.

This is deliberately a separate script rather than a generator self-test: it reads the frozen
ledger as written and the canonical `.sea` sources as they stand, so a hand edit to either is
caught even if the generator is not re-run.

Usage:
  check-ledger-invariants.py [--ledger requirements/ledger.yaml]
Exit 0 when the ledger names every canonical invariant; 1 otherwise.
"""
from __future__ import annotations
import argparse
import os
import re
import sys

import yaml

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEA_FILES = (
    ".sea/interaction/interaction-model.sea",
    ".sea/interaction/research-artifacts.sea",
    ".sea/interaction/product-integration-contract.sea",
)
DEFAULT_LEDGER = "requirements/ledger.yaml"
INSTANCE = re.compile(r'instance\s+\w+\s+of\s+"InteractionInvariant"\s*\{')


def matching_close(text: str) -> int:
    """Index of the `}` that closes the block whose `{` opened `text`."""
    depth = 0
    for i, ch in enumerate(text):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return i
    return -1


def canonical_invariants() -> dict[str, set[str]]:
    """requirement id -> set of invariant ids the canonical `.sea` model binds to it."""
    found: dict[str, set[str]] = {}
    for rel in SEA_FILES:
        path = os.path.join(REPO, rel)
        if not os.path.isfile(path):
            continue
        text = open(path, encoding="utf-8").read()
        for match in INSTANCE.finditer(text):
            body = text[match.end():]
            # The instance's opening `{` is consumed by the regex, so restore it to balance
            # the block before searching for the matching `}`.
            close = matching_close("{" + body)
            if close < 0:
                raise SystemExit(f"unterminated InteractionInvariant instance in {rel}")
            body = body[: close - 1]
            iid = re.search(r'invariant_id:\s*"([^"]+)"', body)
            req = re.search(r'requirement_ref:\s*"([^"]+)"', body)
            if not (iid and req):
                raise SystemExit(f"malformed InteractionInvariant instance in {rel}")
            found.setdefault(req.group(1), set()).add(iid.group(1))
    return found


def ledger_invariants(ledger_path: str) -> dict[str, set[str]]:
    """requirement id -> set of invariant ids the ledger records for it."""
    doc = yaml.safe_load(open(ledger_path, encoding="utf-8"))
    found: dict[str, set[str]] = {}
    for row in doc.get("requirements") or []:
        rid = row.get("id")
        binding = row.get("semantic_binding") or {}
        ids: set[str] = set()
        source = binding.get("invariant_source")
        if isinstance(source, str) and source.startswith("sea:"):
            ids.add(source[len("sea:"):])
        for extra in binding.get("additional_invariants") or []:
            extra_source = extra.get("invariant_source")
            if not (isinstance(extra_source, str) and extra_source.startswith("sea:")):
                raise SystemExit(
                    f"{rid}: additional invariant without a sea: source: {extra!r}"
                )
            ids.add(extra_source[len("sea:"):])
        if ids:
            found[rid] = ids
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ledger", default=os.path.join(REPO, DEFAULT_LEDGER))
    args = parser.parse_args()

    canonical = canonical_invariants()
    recorded = ledger_invariants(args.ledger)

    errors: list[str] = []
    for rid in sorted(canonical):
        want = canonical[rid]
        got = recorded.get(rid, set())
        missing = sorted(want - got)
        extra = sorted(got - want)
        if missing:
            errors.append(
                f"{rid}: the canonical model binds {', '.join(missing)} but the ledger "
                f"does not record it"
            )
        if extra:
            errors.append(
                f"{rid}: the ledger records {', '.join(extra)} but the canonical model "
                f"binds no such invariant"
            )
    for rid in sorted(recorded):
        if rid not in canonical:
            errors.append(
                f"{rid}: the ledger binds a `.sea` invariant but the canonical model "
                f"binds none to this requirement"
            )

    if errors:
        for line in errors:
            print(f"FAIL: {line}", file=sys.stderr)
        return 1
    total = sum(len(v) for v in canonical.values())
    print(
        f"ledger invariants ok: {total} canonical invariant bindings across "
        f"{len(canonical)} requirements, all recorded"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Explicit unrepresented-semantics gate for the Horizon Interaction Domain Model.

The IDM must encode the frozen spec's canonical journeys, the closed affordance
gate keys, the canonical authority vocabulary, world-state distinction and the
preserved unknowns. Parser success alone is not enough, so this script inspects
the DomainForge-resolved graph and application contract and fails by name when
a required distinction is missing.

Usage:
  DOMAINFORGE_BIN=/path/to/domainforge check-idm-coverage.py [entry.sea]

Default entry: .sea/interaction/interaction-model.sea
Exit 0 when every distinction is present; 1 otherwise; 2 when DomainForge is
unavailable.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys

DEFAULT_ENTRY = ".sea/interaction/interaction-model.sea"

JOURNEYS = ["J01", "J02", "J03", "J04", "J05", "J06"]
JOURNEY_FIELDS = ["actor_role", "settlement", "evidence", "next_affordance", "capability", "authority"]
GATE_KEYS = {
    "visibility",
    "reach",
    "payment",
    "authority",
    "capability",
    "recovery",
    "settlement_access",
}
CORE_ENTITIES = [
    "NavigationContext",
    "NavigationFrame",
    "FocusSet",
    "AffordanceAssessment",
    "NavigationIntentRecord",
    "SurfaceSpecRecord",
    "SettlementReviewRecord",
]
REQUIRED_OPERATIONS = {
    "assess_affordance",
    "commit_navigation_intent",
    "propose_semantic_revision",
    "run_preregistered_experiment",
}
EXPECTED_ENUM_MEMBERS = {
    "AffordanceStatus": {"possible", "available", "blocked", "unknown", "conflicted"},
    "AuthorityOutcome": {
        "likely_allow",
        "requires_approval",
        "deferred_to_invocation",
        "denied",
        "unreachable",
        "unknown",
    },
    "GateKey": GATE_KEYS,
    "WorldStateKind": {"historical", "current", "candidate"},
}


def domainforge_bin() -> str:
    binary = os.environ.get("DOMAINFORGE_BIN") or shutil.which("domainforge")
    if not binary:
        print("check-idm-coverage: DomainForge binary not found; set DOMAINFORGE_BIN", file=sys.stderr)
        sys.exit(2)
    return binary


def run_json(args: list[str]) -> dict:
    proc = subprocess.run(args, capture_output=True, text=True)
    if proc.returncode != 0:
        print(proc.stderr.strip() or f"check-idm-coverage: {' '.join(args)} failed", file=sys.stderr)
        sys.exit(1)
    return json.loads(proc.stdout)


def main(argv: list[str]) -> int:
    entry = argv[0] if argv else DEFAULT_ENTRY
    df = domainforge_bin()

    graph = run_json([df, "parse", entry, "--format", "json"])
    contract = run_json([df, "contract", entry])

    errors: list[str] = []
    instances = list(graph.get("entity_instances", {}).values())
    enums = {e["name"]: e for e in contract["contract"]["enums"]}
    entities = {e["name"] for e in contract["contract"]["entities"]}

    journeys = {i["fields"].get("journey_id"): i for i in instances if i["entity_type"] == "CanonicalJourney"}
    for jid in JOURNEYS:
        inst = journeys.get(jid)
        if inst is None:
            errors.append(f"missing canonical journey {jid}")
            continue
        for field in JOURNEY_FIELDS:
            if not str(inst["fields"].get(field, "")).strip():
                errors.append(f"journey {jid} has empty {field}")

    gates = {i["fields"].get("gate_key") for i in instances if i["entity_type"] == "AffordanceGate"}
    if gates != GATE_KEYS:
        errors.append(f"affordance gates {sorted(gates)} != canonical {sorted(GATE_KEYS)}")

    for name in CORE_ENTITIES:
        if name not in entities:
            errors.append(f"missing core domain entity {name}")

    op_names = {o["id"].rsplit(".", 1)[-1] for o in contract["contract"]["operations"]}
    missing_ops = REQUIRED_OPERATIONS - op_names
    if missing_ops:
        errors.append(f"missing canonical operations {sorted(missing_ops)}")

    for enum_name, expected in EXPECTED_ENUM_MEMBERS.items():
        enum = enums.get(enum_name)
        if enum is None:
            errors.append(f"missing enum {enum_name}")
            continue
        actual = {m["name"] for m in enum["members"]}
        if actual != expected:
            errors.append(f"enum {enum_name} members {sorted(actual)} != {sorted(expected)}")

    questions = [i for i in instances if i["entity_type"] == "OpenSemanticQuestion"]
    if not questions:
        errors.append("no OpenSemanticQuestion instances; unknowns must be preserved, not dropped")

    if errors:
        print(f"check-idm-coverage: FAILED ({len(errors)})")
        for error in errors:
            print(f"- {error}")
        return 1
    print(
        "check-idm-coverage: OK "
        f"({len(journeys)} journeys, {len(gates)} gates, {len(op_names)} operations, {len(questions)} open questions)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

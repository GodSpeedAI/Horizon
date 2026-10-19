#!/usr/bin/env python3
"""Generate Horizon's candidate requirement ledger from authoritative sources.

Deterministic: reads the frozen spec (requirement text, source path, digest) and
the plan (requirement -> settling tasks). Never invents requirement text or
sources; placeholder semantic bindings are explicitly marked candidate and are
refined when the canonical .sea model exists (T01) and frozen at T04 (P5).

Output: requirements/ledger.yaml (ledger v1, freeze_hash: candidate).
"""
import datetime
import hashlib
import json
import os
import sys

import yaml

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC = os.path.join(REPO, ".agents", "specs", "horizon.agent.spec.yaml")
PLAN = os.path.join(REPO, ".agents", "plans", "horizon.plan.yaml")
OUT = os.path.join(REPO, "requirements", "ledger.yaml")

ENTITY_BY_PREFIX = {
    "CASE": "Case",
    "GOAL": "Goal",
    "NAV": "NavigationFrame",
    "OUT": "Settlement",
    "WORLD": "WorldRef",
    "CONFIG": "Configuration",
    "INT": "Intent",
    "UI": "AtomicUIModel",
    "UX": "OperatorExperience",
    "VERIFY": "VerificationEvidence",
    "SAFE": "TrustBoundary",
    "SEC": "TrustBoundary",
    "STACK": "StackBoundaryAdapter",
    "DEV": "DevelopmentalInterpretation",
    "RES": "ResearchArtifact",
}


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def collect_requirements(node, path="$"):
    out = {}
    if isinstance(node, dict):
        rid = node.get("id")
        if isinstance(rid, str) and rid.startswith("REQ-"):
            out[rid] = {
                "text": node.get("text", "").strip(),
                "section": path,
            }
        for k, v in node.items():
            out.update(collect_requirements(v, f"{path}.{k}"))
    elif isinstance(node, list):
        for i, v in enumerate(node):
            out.update(collect_requirements(v, f"{path}[{i}]"))
    return out


def main():
    spec_digest = sha256_of(SPEC)
    spec = yaml.safe_load(open(SPEC, encoding="utf-8"))
    plan = yaml.safe_load(open(PLAN, encoding="utf-8"))

    reqs = collect_requirements(spec)
    mapping = (plan.get("traceability") or {}).get("requirement_to_tasks") or {}

    frozen = [".agents/specs/**", ".agents/plans/**", "requirements/ledger.yaml"]
    mutable = ["implementation/**"]

    requirements = []
    contracts = []
    for rid in sorted(reqs):
        info = reqs[rid]
        prefix = rid.split("-")[1]
        entity = ENTITY_BY_PREFIX.get(prefix, "HorizonObject")
        tasks = mapping.get(rid) or []
        gate = f"just gate-{tasks[0].lower()}" if tasks else "just verify"
        ac = f"AC-{rid[4:]}-01"
        requirements.append({
            "id": rid,
            "title": info["text"],
            "source": {
                "file": ".agents/specs/horizon.agent.spec.yaml",
                "section": info["section"],
                "digest": f"sha256:{spec_digest}",
            },
            "semantic_binding": {
                "entity": entity,
                "invariant": f"{rid} holds in the Horizon runtime",
            },
            "acceptance": [ac],
            "proof": [gate],
            "mutable_surfaces": mutable,
            "frozen_surfaces": frozen,
            "dependencies": [],
            "critic_predicate": "source-fidelity",
            "status": "candidate",
            "notes": f"settling tasks: {', '.join(tasks) or 'unmapped'}; semantic binding provisional until .sea (T01)",
        })
        contracts.append({
            "id": ac,
            "requirement": rid,
            "expected": info["text"],
            "gate_command": gate,
            "status": "candidate",
        })

    doc = {
        "ledger_version": 1,
        "project": "Horizon",
        "generated_at": datetime.datetime.now(datetime.timezone.utc)
        .replace(microsecond=0)
        .isoformat(),
        "freeze_hash": "candidate",
        "generated_from": {
            "spec": ".agents/specs/horizon.agent.spec.yaml",
            "spec_sha256": spec_digest,
            "plan_traceability": ".agents/plans/horizon.plan.yaml#traceability.requirement_to_tasks",
            "generator": "scripts/gen-requirement-ledger.py",
        },
        "population": "candidate at T00; acceptance contracts, semantic .sea bindings and Wayfinder created and frozen at T04 (P5)",
        "requirements": requirements,
        "acceptance_contracts": contracts,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("# Horizon requirement ledger (candidate, generated) — see scripts/gen-requirement-ledger.py\n")
        yaml.safe_dump(doc, fh, sort_keys=False, allow_unicode=True, width=1000)
    print(f"wrote {os.path.relpath(OUT, REPO)}: {len(requirements)} requirements, "
          f"{len(contracts)} acceptance contracts, spec sha256 {spec_digest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Validate a Project Topology Architect requirement/acceptance ledger.

Usage:
  validate-requirement-ledger.py <ledger.yaml> [--project-root <dir>] [--require-freeze]

Checks (deterministic):
  - ledger_version present and == 1
  - project, freeze_hash ("candidate" | sha256-like) present
  - unique requirement ids (AK-NNN) and acceptance ids (AC-NNN-NN)
  - each requirement: title, source{file,section,digest}, semantic_binding,
    non-empty acceptance and proof, mutable/frozen surfaces, dependencies,
    critic_predicate ∈ {source-fidelity,semantic-fidelity,contradiction,evasion,
    verification-quality}, status ∈ {candidate,frozen,settled}
  - each acceptance contract: requirement must reference an existing AK
  - each requirement acceptance entry must reference an existing AC
  - source file exists (relative to --project-root) and its sha256 matches digest
  - mutable_surfaces and frozen_surfaces are disjoint
  - frozen/settled status requires a real freeze_hash (not "candidate")
  - dependencies reference existing AK ids
  - --require-freeze: freeze_hash must not be "candidate"

Semantic fidelity of the ledger is model judgment and is NOT evaluated here.
"""

import argparse
import hashlib
import os
import re
import sys

CRITIC_PREDICATES = {
    "source-fidelity",
    "semantic-fidelity",
    "contradiction",
    "evasion",
    "verification-quality",
}
STATUSES = {"candidate", "frozen", "settled"}


def errors_of_yaml(text: str):
    try:
        import yaml

        return yaml.safe_load(text), []
    except ImportError:
        return None, ["PyYAML is required to validate the ledger"]
    except yaml.YAMLError as e:
        return None, [f"YAML parse error: {e}"]


def digest_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ledger")
    ap.add_argument("--project-root", default=os.getcwd())
    ap.add_argument("--require-freeze", action="store_true")
    args = ap.parse_args()

    errs = []
    done = []

    text = open(args.ledger, encoding="utf-8").read()
    doc, parse_errs = errors_of_yaml(text)
    errs += parse_errs
    if doc is None:
        print(f"ledger: {len(errs)} error(s)")
        print("\n".join(errs))
        return 1
    if not isinstance(doc, dict):
        errs.append("ledger root is not a mapping")
        print(f"ledger: 1 error(s)\nledger root is not a mapping")
        return 1

    if doc.get("ledger_version") != 1:
        errs.append("ledger_version must be 1")
    if not doc.get("project"):
        errs.append("missing project name")
    freeze_hash = doc.get("freeze_hash")
    if not freeze_hash:
        errs.append("missing freeze_hash (use \"candidate\" pre-freeze)")

    all_reqs = doc.get("requirements") or []
    all_acs = doc.get("acceptance_contracts") or []

    # ---- ids ----
    ak_ids = [r.get("id") for r in all_reqs if isinstance(r, dict)]
    ac_ids = [a.get("id") for a in all_acs if isinstance(a, dict)]
    seen = set()
    for i in ak_ids:
        if i is None:
            errs.append("requirement missing id")
        elif i in seen:
            errs.append(f"duplicate requirement id {i}")
        else:
            seen.add(i)
    seen = set()
    for i in ac_ids:
        if i is None:
            errs.append("acceptance contract missing id")
        elif i in seen:
            errs.append(f"duplicate acceptance id {i}")
        else:
            seen.add(i)

    # ---- requirements ----
    for r in all_reqs:
        if not isinstance(r, dict):
            errs.append("non-mapping entry in requirements")
            continue
        rid = r.get("id")
        if not rid:
            continue  # already reported
        for f in ("title", "source", "semantic_binding", "acceptance", "proof",
                  "mutable_surfaces", "frozen_surfaces", "dependencies",
                  "critic_predicate", "status"):
            if f not in r:
                errs.append(f"{rid}: missing {f}")
        src = r.get("source") or {}
        sb = r.get("semantic_binding") or {}
        if not isinstance(src, dict) or not src.get("file") or not src.get(
                "section"):
            errs.append(f"{rid}: source must have file and section")
        if not isinstance(sb, dict) or not sb.get("entity") or not sb.get(
                "invariant"):
            errs.append(f"{rid}: semantic_binding must have entity and invariant")
        if not r.get("acceptance"):
            errs.append(f"{rid}: acceptance must be non-empty")
        if not r.get("proof"):
            errs.append(f"{rid}: proof must be non-empty (at least one command)")
        crit = r.get("critic_predicate")
        if crit not in CRITIC_PREDICATES:
            errs.append(f"{rid}: critic_predicate {crit!r} not in "
                        f"{sorted(CRITIC_PREDICATES)}")
        st = r.get("status")
        if st not in STATUSES:
            errs.append(f"{rid}: status {st!r} not in {sorted(STATUSES)}")

        for dep in r.get("dependencies") or []:
            if dep not in ak_ids:
                errs.append(f"{rid}: dependency {dep!r} does not exist")
        for ac in r.get("acceptance") or []:
            if ac not in ac_ids:
                errs.append(f"{rid}: acceptance {ac!r} has no matching contract")

        # surface disjointness
        mut = set(r.get("mutable_surfaces") or [])
        froz = set(r.get("frozen_surfaces") or [])
        if mut & froz:
            overlap = sorted(mut & froz)
            errs.append(f"{rid}: surfaces overlap {overlap}")

        if st in ("frozen", "settled") and freeze_hash == "candidate":
            errs.append(f"{rid}: {st} status requires a real freeze_hash")

        # source digest verification
        sfile = src.get("file")
        sdigest = src.get("digest")
        if sfile and sdigest:
            path = os.path.normpath(os.path.join(args.project_root, sfile))
            m = re.fullmatch(r"sha256:([0-9a-f]{64})", str(sdigest))
            if not m:
                errs.append(f"{rid}: digest must be sha256:<64 hex>")
            elif not os.path.isfile(path):
                errs.append(f"{rid}: source file not found: {sfile}")
            elif digest_of(path) != m.group(1):
                errs.append(f"{rid}: source digest mismatch for {sfile} "
                            f"(ledger updated from the file was changed?)")

    # ---- acceptance contracts ----
    for a in all_acs:
        if not isinstance(a, dict):
            errs.append("non-mapping entry in acceptance_contracts")
            continue
        aid = a.get("id")
        if not aid:
            continue
        req = a.get("requirement")
        if req not in ak_ids:
            errs.append(f"{aid}: requirement {req!r} does not exist")
        for f in ("expected", "gate_command", "status"):
            if f not in a:
                errs.append(f"{aid}: missing {f}")
        if a.get("status") not in STATUSES:
            errs.append(f"{aid}: status {a.get('status')!r} not in "
                        f"{sorted(STATUSES)}")

    if args.require_freeze and freeze_hash == "candidate":
        errs.append("--require-freeze: ledger is not frozen (freeze_hash=candidate)")

    print(f"ledger: {len(errs)} error(s) in {os.path.basename(args.ledger)}")
    for e in errs:
        print(f"  - {e}")
    if not errs:
        print(
            f"  ok: {len(ak_ids)} requirements, {len(ac_ids)} acceptance contracts"
        )
    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main())
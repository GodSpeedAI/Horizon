#!/usr/bin/env python3
"""Fail-closed ruler gate: Horizon may not implement until the bound spec is
approved/frozen and its SHA-256 matches the plan.

Checks:
  1. spec parses and metadata.status == "frozen"
  2. sha256(spec bytes) == plan.source.spec.sha256
  3. plan.source.spec.spec_id / spec_version match the spec metadata

Usage: check-ruler.py [--spec PATH] [--plan PATH]
Exit 0 only when the ruler is trustworthy; otherwise a bounded diagnostic.
"""
import argparse
import hashlib
import sys

import yaml

DEFAULT_SPEC = ".agents/specs/horizon.agent.spec.yaml"
DEFAULT_PLAN = ".agents/plans/horizon.plan.yaml"


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", default=DEFAULT_SPEC)
    ap.add_argument("--plan", default=DEFAULT_PLAN)
    args = ap.parse_args()

    errs = []
    spec = yaml.safe_load(open(args.spec, encoding="utf-8"))
    plan = yaml.safe_load(open(args.plan, encoding="utf-8"))

    md = (spec or {}).get("metadata") or {}
    status = md.get("status")
    version = md.get("version")
    spec_id = md.get("id")

    if status != "frozen":
        errs.append(f"ruler not frozen: metadata.status={status!r} (implementation MUST NOT proceed)")
    if not spec_id:
        errs.append("ruler spec has no metadata.id")

    bound = (((plan or {}).get("source") or {}).get("spec") or {})
    bound_hash = bound.get("sha256")
    actual = sha256_of(args.spec)
    if not bound_hash:
        errs.append("plan does not bind a source.spec.sha256")
    elif actual != bound_hash:
        errs.append(f"spec sha256 mismatch: plan={bound_hash} actual={actual}")
    if bound.get("spec_id") and spec_id and bound["spec_id"] != spec_id:
        errs.append(f"spec id mismatch: plan={bound['spec_id']} spec={spec_id}")
    if bound.get("spec_version") and version and bound["spec_version"] != version:
        errs.append(f"spec version mismatch: plan={bound['spec_version']} spec={version}")

    if errs:
        print(f"RULER GATE: BLOCKED ({len(errs)} problem(s))")
        for e in errs:
            print(f"  - {e}")
        return 1
    print(f"RULER GATE: OK spec {spec_id} {version} frozen, sha256 {actual}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

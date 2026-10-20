#!/usr/bin/env python3
"""Regenerate the requirements ledger from an explicit policy, or make a candidate.

Default behaviour is the production path: generate in place from
`scripts/ledger-policy.yaml`, exactly as `scripts/freeze-formation.sh` does.

Candidate mode (`--policy scripts/ledger-policy.candidate.yaml --out <path>`) generates
against a *different* policy without touching `requirements/ledger.yaml`,
`scripts/ledger-policy.yaml`, or any other frozen pin, so a candidate revision can be
inspected and reviewed before the owner authorizes a new freeze.

Usage:
  gen-ledger-variant.py [--policy PATH] [--out PATH] [--require-witnesses]
"""

import argparse
import importlib.util
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GENERATOR = os.path.join(REPO, "scripts", "gen-requirement-ledger.py")


def load_generator():
    spec = importlib.util.spec_from_file_location("horizon_ledger_generator", GENERATOR)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--policy", default=os.path.join(REPO, "scripts", "ledger-policy.yaml"))
    parser.add_argument("--out", default=os.path.join(REPO, "requirements", "ledger.yaml"))
    parser.add_argument(
        "--require-witnesses",
        action="store_true",
        help="fail unless every policy override names an existing test witness (`evaluated_by`)",
    )
    args = parser.parse_args(argv)

    import yaml

    policy = yaml.safe_load(open(args.policy, encoding="utf-8")) or {}
    if args.require_witnesses:
        overrides = policy.get("overrides") or {}
        witnesses = policy.get("evaluated_by") or {}
        missing = sorted(set(overrides) - set(witnesses))
        if missing:
            raise SystemExit(f"{args.policy}: overrides without a witness: {', '.join(missing)}")
        for rid, refs in witnesses.items():
            for ref in refs:
                path, _, test_name = ref.partition(" :: ")
                full = os.path.join(REPO, path)
                if not os.path.isfile(full):
                    raise SystemExit(f"{rid}: witness file {path} does not exist")
                if test_name and test_name not in open(full, encoding="utf-8").read():
                    raise SystemExit(f"{rid}: witness test {test_name!r} not found in {path}")

    generator = load_generator()
    generator.POLICY = os.path.abspath(args.policy)
    generator.OUT = os.path.abspath(args.out)
    generator.main()
    print(f"gen-ledger-variant: wrote {os.path.relpath(generator.OUT, REPO)} from {os.path.relpath(generator.POLICY, REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

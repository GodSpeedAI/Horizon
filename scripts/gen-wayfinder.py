#!/usr/bin/env python3
"""Generate `.wayfinder/answer-key.md` from the settled requirement ledger.

The Wayfinder is a *projection* of `requirements/ledger.yaml`: one row per
requirement whose obligation is the frozen spec text and whose expected
observable is the ledger's acceptance contract. It is generated, not authored,
so it cannot drift from the ledger it evaluates.

Freeze boundary: the `hashes:` block is emitted empty here. `freeze-hash.py`
fills the frontmatter (freeze_id, frozen_at, hashes) after this script writes
the body, so run this script BEFORE freezing, never after.

Usage:
  gen-wayfinder.py [--root .] [--ledger requirements/ledger.yaml]
"""

import argparse
import hashlib
import os
import re
import sys

import yaml

FRONTMATTER_ORDER = [
    "freeze_id",
    "project",
    "frozen_at",
    "ledger",
    "spec",
    "plan",
    "world_ref",
    "hashes",
]


def digest_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def cell(text):
    """Markdown table cell: collapse newlines, escape the pipe separator."""
    return " ".join(str(text).split()).replace("|", "\\|")


def world_ref_from_config(root, path="config/horizon.toml"):
    """The pinned world_ref is configuration, not a frozen literal of this script.

    T04's prereg revision changed it once; reading it prevents the Wayfinder from
    silently disagreeing with the runtime binding.
    """
    full = os.path.normpath(os.path.join(root, path))
    if not os.path.isfile(full):
        return ""
    m = re.search(r'^world_ref\s*=\s*"([^"]+)"', open(full, encoding="utf-8").read(), re.M)
    return m.group(1) if m else ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--ledger", default="requirements/ledger.yaml")
    ap.add_argument("--freeze-id", default="candidate")
    ap.add_argument("--frozen-at", default="pending-independent-criticism")
    ap.add_argument(
        "--out",
        default=None,
        help="write here instead of .wayfinder/answer-key.md (used by reproduction checks)",
    )
    args = ap.parse_args()

    root = os.path.abspath(args.root)
    ledger_path = os.path.normpath(os.path.join(root, args.ledger))
    ledger = yaml.safe_load(open(ledger_path, encoding="utf-8"))

    reqs = ledger["requirements"]
    contracts = {c["id"]: c["expected"] for c in ledger.get("acceptance_contracts") or []}
    gen = ledger.get("generated_from") or {}

    missing = [r["id"] for r in reqs if not r.get("acceptance")]
    if missing:
        raise SystemExit(f"{len(missing)} requirements have no acceptance contract: {missing[:5]}")
    no_expected = [r["id"] for r in reqs for a in r["acceptance"] if not contracts.get(a)]
    if no_expected:
        raise SystemExit(f"acceptance contracts without an observable: {sorted(set(no_expected))[:5]}")

    header = {
        "freeze_id": args.freeze_id,
        "project": str(ledger.get("project", "horizon")).lower(),
        "frozen_at": args.frozen_at,
        "ledger": args.ledger,
        "spec": gen.get("spec", ".agents/specs/horizon.agent.spec.yaml"),
        "plan": gen.get("plan", ".agents/plans/horizon.plan.yaml"),
        "world_ref": "",
        "hashes": {},
    }

    # world_ref is carried from the existing freeze if one is present.
    header["world_ref"] = world_ref_from_config(root)
    existing = os.path.join(root, ".wayfinder", "answer-key.md")
    if os.path.isfile(existing):
        text = open(existing, encoding="utf-8").read()
        if text.startswith("---\n"):
            end = text.find("\n---", 4)
            if end != -1:
                try:
                    old = yaml.safe_load(text[4:end]) or {}
                except yaml.YAMLError:
                    old = {}
                if args.freeze_id == "candidate" and old.get("freeze_id"):
                    header["freeze_id"] = old["freeze_id"]
                if args.frozen_at.startswith("pending") and old.get("frozen_at"):
                    header["frozen_at"] = old["frozen_at"]
                header["world_ref"] = world_ref_from_config(root) or old.get("world_ref", "")
                if header["freeze_id"] != "candidate":
                    header["hashes"] = old.get("hashes") or {}

    fm = yaml.safe_dump(header, sort_keys=False, default_flow_style=None, width=100)

    out = ["---", fm.rstrip("\n"), "requirements:"]
    out += [f"- {r['id']}" for r in reqs]
    out += [
        "---",
        "",
        "# Horizon Wayfinder — formation evaluation projection",
        "",
        "This is the frozen evaluation projection over `requirements/ledger.yaml`. It states what",
        "must be observed for each requirement and which scoped gate produces the evidence. It does",
        "not replace the spec, the plan, or the canonical `.sea` source.",
        "",
        "- Profile under test: `local_operator` (loopback, OS-session operator, separate agent principals).",
        f"- Canonical world: `{header['world_ref'] or 'unpinned'}`.",
        f"- Generated by `scripts/gen-wayfinder.py` from ledger sha256 `{digest_of(ledger_path)}`.",
        "- Proof levels are stated by the settling task; a green structural gate never proves live settlement.",
        "",
        "## Requirement projection",
        "",
        "| Requirement | Obligation (frozen spec) | Expected observable | Gate |",
        "| --- | --- | --- | --- |",
    ]
    for r in reqs:
        gate = " ".join(f"`{p}`" for p in r["proof"])
        out.append(
            f"| {r['id']} | {cell(r['statement'])} | {cell(contracts[r['acceptance'][0]])} | {gate} |"
        )

    out += [
        "",
        "## Non-claims at this freeze",
        "",
        "- No requirement is settled by the existence of code, a scaffold, or a mock.",
        "- `T04` settles only its declared stack/configuration/boundary requirements with structural evidence.",
        "- SEA-Forge, Gauntlet, RealityTrace, Context Kernel, Product Actualizer and live product",
        "  integrations remain typed seams until their settlement tasks.",
        "- The Python research subsystem is contract-only; no ML, dataset, calibration or promotion",
        "  behavior is claimed.",
        "",
    ]

    dest = args.out or os.path.join(root, ".wayfinder", "answer-key.md")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "w", encoding="utf-8") as fh:
        fh.write("\n".join(out) + "\n")
    print(f"wrote {dest}: {len(reqs)} requirements, {len(contracts)} contracts")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Validate a Wayfinder freeze (frozen evaluation projection) for a substrate.

Usage:
  validate-wayfinder.py <project-root> [--ledger <path>]

Checks (deterministic):
  - `.wayfinder/answer-key.md` exists with YAML frontmatter
  - freeze_id present and not "candidate"; frozen_at present
  - hashes: {artifact_path: sha256:<hex>} — every artifact exists under the
    project root and its content digest matches
  - when --ledger is given, the Wayfinder's requirement list cross-references
    the ledger's AK ids exactly (no missing, no orphans)

Semantic fidelity of the projection is model judgment and is NOT evaluated here.
"""

import argparse
import hashlib
import os
import re
import sys


def errors_of_yaml(text: str):
    import yaml

    try:
        return yaml.safe_load(text), []
    except yaml.YAMLError as e:
        return None, [f"YAML parse error: {e}"]


def digest_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def split_frontmatter(text):
    if not text.startswith("---\n"):
        return None, text
    end = text.find("\n---", 4)
    if end == -1:
        return None, text
    return text[4:end], text[end + 4:]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("project_root")
    ap.add_argument("--ledger")
    args = ap.parse_args()

    root = os.path.abspath(args.project_root)
    wayfinder = os.path.join(root, ".wayfinder", "answer-key.md")
    errs = []

    if not os.path.isfile(wayfinder):
        errs.append("missing .wayfinder/answer-key.md")
        print("wayfinder: 1 error(s)\n  - missing .wayfinder/answer-key.md")
        return 1

    text = open(wayfinder, encoding="utf-8").read()
    fm_text, _ = split_frontmatter(text)
    if fm_text is None:
        errs.append("answer-key.md has no YAML frontmatter freeze header")
        fm = None
    else:
        try:
            fm, yerrs = errors_of_yaml(fm_text)
            errs += yerrs
            if fm is None:
                fm = {}
        except Exception as e:  # noqa: BLE001
            fm = {}
            errs.append(f"frontmatter parse failure: {e}")

    if isinstance(fm, dict):
        freeze_id = fm.get("freeze_id")
        if not freeze_id:
            errs.append("missing freeze_id in freeze header")
        if freeze_id == "candidate":
            errs.append("freeze_id must not be 'candidate'")
        if not fm.get("frozen_at"):
            errs.append("missing frozen_at in freeze header")

        hashes = fm.get("hashes") or {}
        if not isinstance(hashes, dict) or not hashes:
            errs.append("missing hashes (artifact -> sha256:<hex>)")
        for path, digest in (hashes or {}).items():
            full = os.path.normpath(os.path.join(root, path))
            m = re.fullmatch(r"sha256:([0-9a-f]{64})", str(digest))
            if not m:
                errs.append(f"hash entry {path}: must be sha256:<64 hex>")
            elif not os.path.isfile(full):
                errs.append(f"hash entry {path}: artifact does not exist")
            elif digest_of(full) != m.group(1):
                errs.append(f"hash entry {path}: content digest mismatch")

        wf_reqs = set(fm.get("requirements") or [])

        if args.ledger:
            ledger_path = os.path.normpath(os.path.join(root, args.ledger))
            if not os.path.isfile(ledger_path):
                errs.append(f"ledger not found: {args.ledger}")
            else:
                try:
                    import yaml

                    ldoc = yaml.safe_load(open(ledger_path, encoding="utf-8"))
                    lk = set(
                        r.get("id")
                        for r in (ldoc or {}).get("requirements") or []
                    )
                except Exception as e:  # noqa: BLE001
                    errs.append(f"ledger parse failure: {e}")
                    lk = set()
                missing = lk - wf_reqs
                orphans = wf_reqs - lk
                if missing:
                    errs.append(f"ledger AKs missing from Wayfinder: "
                                f"{sorted(missing)}")
                if orphans:
                    errs.append(f"Wayfinder AKs absent from ledger: "
                                f"{sorted(orphans)}")
    else:
        errs.append("freeze header is not a mapping")

    print(f"wayfinder: {len(errs)} error(s)")
    for e in errs:
        print(f"  - {e}")
    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main())
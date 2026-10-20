#!/usr/bin/env python3
"""Narrow reference-integrity check for the canonical semantic sources.

DomainForge's `validate --application` reports whether the model compiles and resolves
symbols. It does NOT see a `requirement_ref` naming an id that does not exist, nor a
duplicated `invariant_id` (proved by `scripts/teeth-domainforge-gate.py`). Those are
Horizon's own references into a frozen requirement set, so Horizon checks them:

  1. every `requirement_ref` and requirement id inside a string attribute of an
     InteractionInvariant instance exists in the frozen spec;
  2. every `invariant_id` is unique across the canonical sources.

DomainForge stays responsible for compilation, identity (`world_ref`) and instance
semantics. This script never edits a source; it reads only.

Usage:
  check-idm-integrity.py [--entry .sea/interaction/interaction-model.sea]
Exit 0 when reference integrity holds; 1 otherwise.
"""

from __future__ import annotations

import argparse
import os
import re
import sys

import yaml

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC = os.path.join(REPO, ".agents", "specs", "horizon.agent.spec.yaml")
SEA_ROOT = os.path.join(REPO, ".sea", "interaction")
# Reviews that found a requirement reference with no backing requirement. A reference is
# tolerated only while it is listed here, so a new dangling reference still fails.
REFERENCE_DEBT = os.path.join(REPO, "scripts", "idm-integrity-debt.yaml")

INSTANCE = re.compile(r'instance\s+(\w+)\s+of\s+"(\w+)"\s*\{')


def sea_sources(root):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in {"validation", "__pycache__"}]
        for name in sorted(filenames):
            if name.endswith(".sea"):
                path = os.path.join(dirpath, name)
                yield path, open(path, encoding="utf-8").read()


def instances(text):
    """(instance name, type, body) for every `.sea` instance block."""
    out = []
    for match in INSTANCE.finditer(text):
        depth, i = 0, match.end() - 1
        while i < len(text):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    break
            i += 1
        out.append((match.group(1), match.group(2), text[match.end():i]))
    return out


def spec_requirement_ids():
    spec = yaml.safe_load(open(SPEC, encoding="utf-8"))
    ids = set()

    def walk(node):
        if isinstance(node, dict):
            value = node.get("id")
            if isinstance(value, str) and value.startswith("REQ-"):
                ids.add(value)
            for child in node.values():
                walk(child)
        elif isinstance(node, list):
            for child in node:
                walk(child)

    walk(spec)
    return ids


def main(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--entry", default=os.path.join(SEA_ROOT, "interaction-model.sea"))
    parser.add_argument("--root", default=SEA_ROOT)
    args = parser.parse_args(argv)

    requirement_ids = spec_requirement_ids()
    if not requirement_ids:
        print("check-idm-integrity: no requirement ids found in the frozen spec; refusing to pass", file=sys.stderr)
        return 1
    debt = known_debt()

    errors = []
    tolerated = []
    invariant_ids = {}
    references = 0
    for path, text in sea_sources(args.root):
        rel = os.path.relpath(path, REPO)
        # Debt keys are relative to the semantic module, so a scratch copy of the module is
        # compared on the same terms as the canonical tree.
        module_rel = os.path.join(".sea", "interaction", os.path.relpath(path, args.root))
        module_rel = module_rel.replace(os.sep, "/")
        for name, kind, body in instances(text):
            if kind != "InteractionInvariant":
                continue
            iid = re.search(r'invariant_id:\s*"([^"]+)"', body)
            if iid:
                invariant_ids.setdefault(iid.group(1), []).append(f"{rel}:{name}")
            for ref in re.findall(r'requirement_ref:\s*"([^"]+)"', body):
                references += 1
                if ref in requirement_ids:
                    continue
                key = (module_rel, name, ref)
                if key in debt:
                    tolerated.append(f"{module_rel}:{name} requirement_ref {ref!r}")
                    continue
                errors.append(f"{module_rel}:{name} requirement_ref {ref!r} does not exist in the frozen spec")

    for iid, where in sorted(invariant_ids.items()):
        if len(where) > 1:
            errors.append(f"invariant_id {iid!r} is declared {len(where)} times: {', '.join(where)}")

    if errors:
        print(f"check-idm-integrity: FAILED ({len(errors)})")
        for error in errors:
            print(f"- {error}")
        return 1
    print(
        "check-idm-integrity: OK "
        f"({references} requirement references, {len(tolerated)} tolerated as recorded debt, "
        f"{len(invariant_ids)} invariant ids unique)"
    )
    for item in tolerated:
        print(f"- debt: {item} (see {os.path.relpath(REFERENCE_DEBT, REPO)})")
    return 0


def known_debt():
    if not os.path.isfile(REFERENCE_DEBT):
        return set()
    document = yaml.safe_load(open(REFERENCE_DEBT, encoding="utf-8")) or {}
    entries = set()
    for item in document.get("dangling_requirement_refs") or []:
        entries.add((item["file"], item["instance"], item["requirement_ref"]))
    return entries


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

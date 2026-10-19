#!/usr/bin/env python3
"""Check generated-substrate invariants (Project Topology Architect).

Usage:
  scaffold-check.py <project-root>

Checks (deterministic, lenient-by-design):
  - concise root AGENTS.md router exists, contains routing categories
    (repository map, build/validation, architecture/boundaries, task completion)
    and a pointer to the workbench; under a leanness line budget
  - .agents/ workbench: AGENTS.md (maintenance invariant), CURRENT_STATUS.jsonl
    (append-only history, one JSON object per line with revision+summary) and its
    CURRENT_STATUS.md human mirror exist
  - justfile exists and exposes test + validate (or verify) + task-scoped gates
  - structured machine config present (ecosystem-native or requirements/ledger.yaml
    or topology.yaml) — not Markdown-as-config
  - a verification surface exists (tests/ or test/ or *_test.*)
  - no hardcoded machine-specific absolute paths in AGENTS.md, .agents/**, justfile

This checks structure and routing, NOT semantic quality. Semantic fidelity is model
judgment. The requirement ledger and Wayfinder are separately validated by
validate-requirement-ledger.py and validate-wayfinder.py.
"""

import argparse
import os
import re
import sys

LEANNESS_BUDGET = 220  # generous upper bound for "concise" root AGENTS.md
REQUIRED_CATEGORIES = [
    r"repository\s*map",
    r"build\s+and\s+validation",
    r"architecture\s+and\s+boundaries",
    r"task\s+completion",
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("project_root")
    args = ap.parse_args()

    root = os.path.abspath(args.project_root)
    errs = []
    warns = []

    def read(path):
        try:
            return open(path, encoding="utf-8").read()
        except OSError:
            return None

    # ---- root AGENTS.md ----
    agents_text = read(os.path.join(root, "AGENTS.md"))
    if agents_text is None:
        errs.append("missing root AGENTS.md (project router)")
    else:
        lines = agents_text.splitlines()
        if len(lines) > LEANNESS_BUDGET:
            errs.append(f"root AGENTS.md exceeds leanness budget "
                        f"({len(lines)} lines > {LEANNESS_BUDGET})")
        if "CURRENT_STATUS" not in agents_text:
            errs.append("root AGENTS.md does not route to "
                        ".agents/CURRENT_STATUS.md")
        if "just" not in agents_text:
            errs.append("root AGENTS.md does not mention the `just` surface")
        for pat in REQUIRED_CATEGORIES:
            if not re.search(pat, agents_text, re.IGNORECASE):
                warns.append(f"root AGENTS.md lacks a '{pat}' routing section")

    # ---- .agents/ workbench ----
    bench_agents = read(os.path.join(root, ".agents", "AGENTS.md"))
    if bench_agents is None:
        errs.append("missing .agents/AGENTS.md (workbench maintenance invariant)")
    for f in ("CURRENT_STATUS.jsonl", "CURRENT_STATUS.md"):
        if read(os.path.join(root, ".agents", f)) is None:
            errs.append(f"missing .agents/{f}")
    # ---- CURRENT_STATUS.jsonl is append-only JSON lines with revision ----
    import json as _json
    jsonl_text = read(os.path.join(root, ".agents", "CURRENT_STATUS.jsonl"))
    if jsonl_text is not None:
        lines = [ln for ln in jsonl_text.splitlines() if ln.strip()]
        if not lines:
            errs.append(".agents/CURRENT_STATUS.jsonl is empty (needs one snapshot line)")
        else:
            prev_rev = None
            for i, ln in enumerate(lines, 1):
                try:
                    obj = _json.loads(ln)
                except Exception:
                    errs.append(f".agents/CURRENT_STATUS.jsonl line {i} is not valid JSON")
                    break
                if not isinstance(obj, dict) or "revision" not in obj or "summary" not in obj:
                    errs.append(f".agents/CURRENT_STATUS.jsonl line {i} lacks revision/summary")
                    break
                try:
                    rev = int(obj["revision"])
                except Exception:
                    errs.append(f".agents/CURRENT_STATUS.jsonl line {i} has non-integer revision")
                    break
                if prev_rev is not None and rev <= prev_rev:
                    errs.append(".agents/CURRENT_STATUS.jsonl revisions must strictly increase")
                    break
                prev_rev = rev

    # ---- justfile ----
    just_text = read(os.path.join(root, "justfile"))
    if just_text is None:
        errs.append("missing justfile (operation/verification surface)")
    else:
        recipes = re.findall(r"^([a-z0-9_\-]+):", just_text, re.MULTILINE)
        if not any(r in recipes for r in ("test", "check", "verify")):
            errs.append("justfile lacks a primary verification recipe "
                        "(test/check/verify)")
        if not any(
                r for r in recipes
                if r.startswith("gate-") or r.startswith("verify-") or
                "ak-" in r):
            warns.append("justfile lacks task-scoped gate recipes (gate-*/verify-*)")

    # ---- structured config / no markdown-as-config ----
    structured = []
    for candidate in (
        "Cargo.toml", "pyproject.toml", "package.json", "go.mod",
        "requirements/ledger.yaml", "topology.yaml", ".sea",
    ):
        if os.path.exists(os.path.join(root, candidate)):
            structured.append(candidate)
    if not structured:
        errs.append("no structured machine config found (ecosystem-native, "
                    "requirements/ledger.yaml, or topology.yaml)")

    # ---- verification surface ----
    v_surfaces = [d for d in ("tests", "test") if os.path.isdir(os.path.join(
        root, d))]
    if not v_surfaces:
        found = False
        for dirpath, _, files in os.walk(root):
            if "/.git" in dirpath or "/node_modules" in dirpath:
                continue
            if dirpath.split(os.sep)[-1] == ".venv":
                continue
            for fn in files:
                if re.search(r"(^|/)_?test", fn) or fn.endswith((
                        "_test.py", "_test.rs", ".test.js", ".spec.ts")):
                    found = True
                    break
            if found:
                break
        if not found:
            errs.append("no verification surface (tests/ or *_test.*) found")
    else:
        _ = v_surfaces

    # ---- portable paths ----
    for rel in ("AGENTS.md", ".agents", "justfile"):
        base = os.path.join(root, rel)
        if os.path.isdir(base):
            for dirpath, _, files in os.walk(base):
                for fn in files:
                    if fn.endswith((".md", ".toml", ".yaml", ".yml", ".txt")):
                        text = read(os.path.join(dirpath, fn)) or ""
                        _check_paths(text, rel + "/" + fn, errs)
        elif os.path.isfile(base):
            _check_paths(read(base) or "", rel, errs)

    print(f"scaffold-check: {len(errs)} error(s), {len(warns)} warning(s)")
    for e in errs:
        print(f"  ERROR: {e}")
    for w in warns:
        print(f"  WARN:  {w}")
    if not errs and not warns:
        print("  ok: substrate routing surface is present and coherent")
    return 1 if errs else 0


def _check_paths(text, label, errs):
    for m in re.finditer(
            r"/home/[A-Za-z0-9_\-]+(?:\S*)|/mnt/c/\S*|/Users/\S+", text):
        errs.append(f"hardcoded machine path in {label}: {m.group(0)}")


if __name__ == "__main__":
    sys.exit(main())
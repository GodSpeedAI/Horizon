#!/usr/bin/env python3
"""Teeth for the DomainForge application gate.

Until 2026-10-19 the gate `domainforge validate --application` was cited as evidence
of "0 violations". A vivisection showed it accepts two classes of defect silently:

  * a `requirement_ref` naming an id that does not exist (exit 0, "0 violations");
  * a duplicated `invariant_id` between two instances (exit 0, "0 violations").

So "0 violations" alone does NOT prove the semantic model is free of dangling or
duplicate identity. It does prove symbol resolution: an instance typed with an
undefined entity fails closed (that case is kept below as a control, so this script
cannot pass by simply breaking on everything).

This script edits a COPY of the entry file. BRANCH=null|dangling|duplicate|control.
It never touches the working tree, so it is safe to run at any time.
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENTRY = ROOT / ".sea" / "interaction" / "interaction-model.sea"
BRANCH = os.environ.get("BRANCH", "")
DF = os.environ.get("DOMAINFORGE_BIN", str(ROOT.parent / "domainforge" / "target" / "release" / "domainforge"))


def mutate(text: str) -> str:
    if BRANCH == "dangling":
        old = 'requirement_ref: "REQ-INT-003",'
        if text.count(old) != 1:
            raise SystemExit(f"anchor not unique ({text.count(old)}): {old}")
        return text.replace(old, 'requirement_ref: "REQ-DOES-NOT-EXIST-999",', 1)
    if BRANCH == "duplicate":
        old = 'invariant_id: "INV-08",'
        if text.count(old) != 1:
            raise SystemExit(f"anchor not unique ({text.count(old)}): {old}")
        return text.replace(old, 'invariant_id: "INV-07",', 1)
    if BRANCH == "control":
        pat = r'(instance inv_intent_idempotent of )"InteractionInvariant"'
        if not re.search(pat, text):
            raise SystemExit("control anchor missing")
        return re.sub(pat, r'\1"TotallyUndefinedType"', text, count=1)
    return text


def main() -> int:
    if not BRANCH:
        # Teeth mode: run all three and report. Every branch must behave as expected.
        results = {}
        for branch in ("null", "dangling", "duplicate", "control"):
            env = dict(os.environ, BRANCH=branch, TREE=str(ROOT))
            proc = subprocess.run([sys.executable, __file__], env=env, capture_output=True, text=True)
            results[branch] = (proc.returncode, proc.stdout.strip())
            print(f"{branch}: exit={proc.returncode} {proc.stdout.strip()[:120]}")
        expected = {"null": 0, "dangling": 0, "duplicate": 0, "control": 1}
        bad = [b for b, want in expected.items() if results[b][0] != want]
        if bad:
            print(f"\ntooth is broken for: {', '.join(bad)}")
            return 1
        print("\ntooth: gate discriminates (control fails, and the two blind spots are proven)")
        return 0

    tree = Path(os.environ["TREE"])
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp) / ".sea" / "interaction"
        # Copy the whole interaction module so relative imports still resolve.
        shutil.copytree(ROOT / ".sea" / "interaction", work)
        target = work / "interaction-model.sea"
        target.write_text(mutate(ENTRY.read_text()))
        proc = subprocess.run(
            [DF, "validate", str(target), "--application", "--format", "human"],
            cwd=tree if tree.exists() else ROOT,
            capture_output=True,
            text=True,
        )
        out = f"{proc.stdout}{proc.stderr}".strip().splitlines()
        print(f"exit={proc.returncode} " + (out[0] if out else ""))
        if BRANCH in ("dangling", "duplicate") and proc.returncode == 0:
            print(f"BLIND SPOT CONFIRMED: {BRANCH} .sea accepted with no violation")
        return proc.returncode


if __name__ == "__main__":
    raise SystemExit(main())

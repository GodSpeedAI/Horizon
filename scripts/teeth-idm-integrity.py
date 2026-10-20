#!/usr/bin/env python3
"""Teeth for Horizon's referential-integrity check (`scripts/check-idm-integrity.py`).

The verdict (`codex-root-20261019-7b4d110`, F4) showed `check-idm-coverage.py` accepts a
nonexistent requirement reference and a duplicate invariant id. This tooth proves the two
replacement checks discriminate: it edits a temporary COPY of the interaction module and
requires the real check to fail on both, while the untouched copy passes.

Usage:
  teeth-idm-integrity.py                 # teeth mode: all three cases, exit 0 only if they behave
  TREE=<dir> BRANCH=null|dangling|duplicate teeth-idm-integrity.py
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / ".sea" / "interaction"
CHECK = ROOT / "scripts" / "check-idm-integrity.py"
BRANCH = os.environ.get("BRANCH", "")
ENTRY = "interaction-model.sea"


def mutate(text: str) -> str:
    if BRANCH == "dangling":
        anchor = 'requirement_ref: "REQ-INT-003",'
        if text.count(anchor) != 1:
            raise SystemExit(f"anchor not unique ({text.count(anchor)}): {anchor}")
        return text.replace(anchor, 'requirement_ref: "REQ-DOES-NOT-EXIST-999",', 1)
    if BRANCH == "duplicate":
        anchor = 'invariant_id: "INV-08",'
        if text.count(anchor) != 1:
            raise SystemExit(f"anchor not unique ({text.count(anchor)}): {anchor}")
        return text.replace(anchor, 'invariant_id: "INV-07",', 1)
    return text


def main() -> int:
    if not BRANCH:
        results = {}
        for branch in ("null", "dangling", "duplicate"):
            env = dict(os.environ, BRANCH=branch)
            proc = subprocess.run([sys.executable, __file__], env=env, capture_output=True, text=True)
            first = (proc.stdout.strip().splitlines() or [""])[0]
            results[branch] = (proc.returncode, first)
            print(f"{branch}: exit={proc.returncode} {first[:110]}")
        expected = {"null": 0, "dangling": 1, "duplicate": 1}
        bad = [b for b, want in expected.items() if results[b][0] != want]
        if bad:
            print(f"\ntooth is broken for: {', '.join(bad)}")
            return 1
        print("\ntooth: referential integrity is enforced (dangling and duplicate both fail)")
        return 0

    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp) / ".sea" / "interaction"
        shutil.copytree(MODULE, work)
        target = work / ENTRY
        target.write_text(mutate(target.read_text(encoding="utf-8")), encoding="utf-8")
        proc = subprocess.run(
            [sys.executable, str(CHECK), "--root", str(work)],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        lines = f"{proc.stdout}{proc.stderr}".strip().splitlines()
        print(f"exit={proc.returncode} " + (lines[1] if len(lines) > 1 else (lines[0] if lines else "")))
        if BRANCH != "null" and proc.returncode == 0:
            print(f"BLIND SPOT CONFIRMED: {BRANCH} accepted")
        return proc.returncode


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Compose a Horizon world_ref from DomainForge-owned semantic identity.

DomainForge alone owns canonical semantic compilation and world_ref identity
(REQ-STACK-001). This script does not hash .sea text itself; it reads the
`semantic_closure_hash` that DomainForge produces from the resolved import
closure, so identity covers imports, not just the entry file.

Usage:
  DOMAINFORGE_BIN=/path/to/domainforge world-ref.py <entry.sea>
  DOMAINFORGE_BIN=/path/to/domainforge world-ref.py --expect <world_ref> <entry.sea>

Exit codes:
  0  computed, or the expected identity matched
  1  argument/parse error, or a pinned identity did not match the closure
  2  DomainForge binary unavailable
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys


def domainforge_bin() -> str:
    binary = os.environ.get("DOMAINFORGE_BIN") or shutil.which("domainforge")
    if not binary:
        print("world-ref: DomainForge binary not found; set DOMAINFORGE_BIN", file=sys.stderr)
        sys.exit(2)
    return binary


def semantic_closure_hash(entry: str) -> str:
    proc = subprocess.run(
        [domainforge_bin(), "envelope", entry, "--emit", "representation"],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        print(proc.stderr.strip() or "world-ref: envelope failed", file=sys.stderr)
        sys.exit(1)
    document = json.loads(proc.stdout)
    closure = document.get("semantic_closure_hash")
    if not closure:
        print("world-ref: envelope carried no semantic_closure_hash", file=sys.stderr)
        sys.exit(1)
    return closure


def main(argv: list[str]) -> int:
    expect = None
    args = list(argv)
    if args[:1] == ["--expect"]:
        if len(args) != 3:
            print(__doc__.strip().splitlines()[0], file=sys.stderr)
            return 1
        expect, args = args[1], args[2:]
    if len(args) != 1:
        print(__doc__.strip().splitlines()[0], file=sys.stderr)
        return 1

    entry = args[0]
    ref = f"world:horizon@{semantic_closure_hash(entry)}"
    if expect is None:
        print(ref)
        return 0

    if ref == expect:
        print(f"world-ref: identity unchanged {ref}")
        return 0
    print(f"world-ref: identity CHANGED\n  expected {expect}\n  actual   {ref}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

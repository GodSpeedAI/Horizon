#!/usr/bin/env python3
"""Deterministic content hashing for frozen formation artifacts.

Usage:
  freeze-hash.py <file...>                print "sha256:<hex>  <path>" per file
  freeze-hash.py --check <digest> <file>  exit 0 if file matches digest else 1/2

The digest format is sha256:<64 hex>, identical to the `digest` fields used in
requirement ledgers and Wayfinder freeze headers.
"""

import argparse
import hashlib
import re
import sys


def digest_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return "sha256:" + h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="+")
    ap.add_argument("--check", metavar="DIGEST")
    args = ap.parse_args()

    if args.check:
        if len(args.paths) != 1:
            print("--check requires exactly one file", file=sys.stderr)
            return 2
        problem = args.check
        if not re.fullmatch(r"sha256:[0-9a-f]{64}", problem):
            print(f"invalid digest format: {problem}", file=sys.stderr)
            return 2
        actual = digest_of(args.paths[0])
        if actual == problem:
            print(f"ok  {args.paths[0]}")
            return 0
        print(f"FAIL {args.paths[0]}\n  expected {problem}\n  actual   {actual}",
              file=sys.stderr)
        return 1

    for path in args.paths:
        print(f"{digest_of(path)}  {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
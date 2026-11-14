#!/usr/bin/env bash
# Headless Playwright parity gate for the FDE read path (WP-19): AT-14 and NT-09.
# usage: scripts/fde-parity.sh [AT-14|NT-09|all]     (default: all)
# Exit 0: every selected test passed and at least one ran. Non-zero: a PARITY_MISMATCH or any other failure,
# a missing Chromium (never a silent skip), or no test matched.
set -uo pipefail
cd "$(dirname "$0")/.."
only="${1:-all}"
export TMPDIR="${TMPDIR:-$HOME/projects/_wt/tmp}"
mkdir -p "$TMPDIR"
case "$only" in
  all)   filter=() ;;
  AT-14|NT-09) filter=(-t "$only") ;;
  *) echo "usage: $0 [AT-14|NT-09|all]" >&2; exit 2 ;;
esac
log="$(mktemp "$TMPDIR/fde-parity.XXXXXX")"
bun test test/fde-parity.test.ts "${filter[@]}" 2>&1 | tee "$log"
status=${PIPESTATUS[0]}
ran=$(grep -Eo '^ *[0-9]+ pass' "$log" | grep -Eo '[0-9]+' | head -1)
rm -f "$log"
if [ "$status" -ne 0 ]; then echo "fde-parity: FAIL ($only)" >&2; exit "$status"; fi
if [ "${ran:-0}" -lt 1 ]; then echo "fde-parity: NOT_RUN: no test matched '$only'" >&2; exit 3; fi
echo "fde-parity: PASS ($only, $ran tests)"

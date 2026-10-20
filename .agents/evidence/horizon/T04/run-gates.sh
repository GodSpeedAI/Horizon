#!/usr/bin/env bash
# Runs the T04 gate suite and writes one log per target beside this script.
# Recording only: it asserts nothing beyond propagating a non-zero exit.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../../.." && pwd)"
cd "$root" || exit 1
rc=0
for t in check boundaries idm-integrity acceptance-claims acceptance-claims-frozen test ledger wayfinder teeth verify gate-t04; do
  if just "$t" >"$here/just-$t.log" 2>&1; then
    echo "$t exit=0"
  else
    status=$?
    rc=1
    echo "$t exit=$status"
  fi
done
exit "$rc"

#!/usr/bin/env bash
# Runs the T04 gate suite and writes one log per target beside this script.
#
# Required targets must exit 0. Expected-red targets read the ACTIVE frozen ledger, whose
# defects only a re-freeze removes; they must exit non-zero, and an unexpected 0 is a
# failure (a diagnostic that cannot fail proves nothing). The recorder exits 0 only when
# every target behaves as declared (verdict r2 answer 1: the old recorder exited 1 by design).
set -u
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../../.." && pwd)"
cd "$root" || exit 1
required="check boundaries idm-integrity acceptance-claims witness-claims contract-modals test ledger wayfinder teeth verify gate-t04"
expected_red=""
rc=0
for t in $required $expected_red; do
  just "$t" >"$here/just-$t.log" 2>&1
  status=$?
  case " $expected_red " in
    *" $t "*)
      if [ "$status" -eq 0 ]; then rc=1; echo "$t exit=0 UNEXPECTED (expected red)"; else echo "$t exit=$status (expected red)"; fi ;;
    *)
      if [ "$status" -ne 0 ]; then rc=1; fi
      echo "$t exit=$status" ;;
  esac
done
echo "recorder exit=$rc"
exit "$rc"

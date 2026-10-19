#!/usr/bin/env bash
# Negative tests ("teeth") for the Horizon formation freeze.
#
# Each case corrupts one artifact in a scratch copy of the repo, runs the verifier, and
# requires a non-zero exit AND a specific reason. A case that "passes" a corrupted tree is
# a defect in the verifier, not in the test, and fails this script.
#
#   bash scripts/teeth-ledger-freeze.sh        # run all cases
#
# Exit 0 only if every falsifier blocks. The working tree is never modified: the repo is
# copied to a temporary directory first.
set -uo pipefail
cd "$(dirname "$0")/.."
REPO="$PWD"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

pass=0
fail=0

case_run() {
  local name="$1" expect="$2" mutate="$3"
  rm -rf "$WORK/r" && mkdir -p "$WORK/r"
  tar -c --exclude=.git --exclude=node_modules --exclude=.tmp . | tar -x -C "$WORK/r"
  ( cd "$WORK/r" && eval "$mutate" ) || { echo "SETUP-FAIL $name"; fail=$((fail + 1)); return; }
  local out rc
  out="$(cd "$WORK/r" && ./scripts/check-ledger-freeze.sh 2>&1)"; rc=$?
  if [ $rc -ne 0 ] && printf '%s' "$out" | grep -qF "$expect"; then
    echo "BLOCKED  $name -> $(printf '%s' "$out" | grep -F "$expect" | head -1)"
    pass=$((pass + 1))
  else
    echo "MISSED   $name (exit=$rc)"; printf '%s\n' "$out" | sed 's/^/         /'
    fail=$((fail + 1))
  fi
}

# baseline: the untouched tree must verify, otherwise the teeth are meaningless
rm -rf "$WORK/r" && mkdir -p "$WORK/r"
tar -c --exclude=.git --exclude=node_modules --exclude=.tmp . | tar -x -C "$WORK/r"
if ( cd "$WORK/r" && ./scripts/check-ledger-freeze.sh >/dev/null 2>&1 ); then
  echo "BASELINE clean tree verifies"
else
  echo "BASELINE FAILED — clean tree does not verify"; exit 1
fi

case_run "frozen ledger edited after freeze" \
  "does not match its freeze_hash" \
  "sed -i '0,/^  statement: /s/^  statement: .*/  statement: TAMPERED/' requirements/ledger.yaml"

case_run "frozen ledger reverted to candidate" \
  "is not frozen" \
  "sed -i 's/^freeze_hash: .*/freeze_hash: candidate/' requirements/ledger.yaml"

case_run "wayfinder body hand-edited" \
  "hand edit" \
  "sed -i 's/^| \\(REQ-CONFIG-001 | \\)[^|]*|/| \\1 altered observable |/' .wayfinder/answer-key.md"

case_run "wayfinder unfrozen" \
  "wayfinder validation failed" \
  "sed -i 's/^freeze_id: .*/freeze_id: candidate/' .wayfinder/answer-key.md"

case_run "hashed input drifted (ledger policy)" \
  "wayfinder validation failed" \
  "printf '\n# drift\n' >> scripts/ledger-policy.yaml"

case_run "ledger row removed after freeze (ledger structure / projection)" \
  "requirement ledger validation failed" \
  "python3 - <<'EOF'
import pathlib, re
p = pathlib.Path('requirements/ledger.yaml')
t = p.read_text()
t = re.sub(r'^- id: REQ-CONFIG-001\n(?:  .*\n|- .*\n)*?(?=^- id: |^acceptance_contracts:)', '', t, count=1, flags=re.M)
p.write_text(t)
EOF
# refresh the freeze so the only remaining signal is ledger/projection disagreement
FREEZE=\$(python3 .agents/skills/project-topology-architect/scripts/freeze-hash.py requirements/ledger.yaml | cut -d' ' -f1)
python3 - \"\$FREEZE\" <<'EOF'
import pathlib, re, sys
p = pathlib.Path('requirements/ledger.yaml')
p.write_text(re.subn(r'^freeze_hash: .*\$', 'freeze_hash: ' + sys.argv[1], p.read_text(), count=1, flags=re.M)[0])
EOF
./scripts/freeze-formation.sh >/dev/null 2>&1 || true"

echo
echo "teeth: ${pass} blocked, ${fail} missed"
[ "$fail" -eq 0 ]

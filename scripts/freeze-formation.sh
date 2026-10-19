#!/usr/bin/env bash
# Freeze requirements/ledger.yaml and .wayfinder/answer-key.md for Horizon.
#
# The ledger's `freeze_hash` is the sha256 of the ledger's content *with the marker
# line set to `freeze_hash: candidate`*. A document cannot contain its own plain
# sha256 (writing it changes it), so the frozen document is unambiguously
# reconstructible and verifiable:
#
#   sed 's/^freeze_hash: .*/freeze_hash: candidate/' requirements/ledger.yaml \
#     | sha256sum        # must equal freeze_hash
#
# `scripts/check-ledger-freeze.sh` performs exactly that check, so the value is not
# decorative: it detects any hand edit to a frozen ledger or Wayfinder projection.
# The digest is a pure function of generated content (no timestamps), so
# regeneration from the same spec/plan/policy reproduces it byte for byte.
set -euo pipefail
cd "$(dirname "$0")/.."

WANT="${1:-frozen@$(date -u +%Y-%m-%d)}"
FH="python3 .agents/skills/project-topology-architect/scripts/freeze-hash.py"
LEDGER=requirements/ledger.yaml

# 1. coverage digest: the document as generated (freeze_hash: candidate)
python3 - "$LEDGER" <<'PY'
import pathlib, re, sys
p = pathlib.Path(sys.argv[1])
t, n = re.subn(r"^freeze_hash: .*$", "freeze_hash: candidate", p.read_text(), count=1, flags=re.M)
if n != 1:
    raise SystemExit("could not locate the freeze_hash: line")
p.write_text(t)
PY
FREEZE="$($FH $LEDGER | cut -d' ' -f1)"

# 2. write the marker
python3 - "$FREEZE" <<'PY'
import pathlib, re, sys
value = sys.argv[1]
p = pathlib.Path("requirements/ledger.yaml")
t, n = re.subn(r"^freeze_hash: .*$", f"freeze_hash: {value}", p.read_text(), count=1, flags=re.M)
if n != 1:
    raise SystemExit("could not locate the freeze_hash: line")
p.write_text(t)
PY
echo "ledger frozen: freeze_hash=${FREEZE}"

# 3. Wayfinder states the frozen ledger digest, then its own freeze header
python3 scripts/gen-wayfinder.py --freeze-id "${WANT}" --frozen-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

SPEC="$($FH .agents/specs/horizon.agent.spec.yaml | cut -d' ' -f1)"
PLAN="$($FH .agents/plans/horizon.plan.yaml | cut -d' ' -f1)"
POLICY="$($FH scripts/ledger-policy.yaml | cut -d' ' -f1)"

FREEZE="$FREEZE" LEDGER_SHA="$($FH $LEDGER | cut -d' ' -f1)" SPEC="$SPEC" PLAN="$PLAN" POLICY="$POLICY" python3 - <<'PY'
import os, pathlib, re
p = pathlib.Path(".wayfinder/answer-key.md")
t = p.read_text()
hashes = (
    "hashes:\n"
    f"  requirements/ledger.yaml: {os.environ['LEDGER_SHA']}\n"
    f"  .agents/specs/horizon.agent.spec.yaml: {os.environ['SPEC']}\n"
    f"  .agents/plans/horizon.plan.yaml: {os.environ['PLAN']}\n"
    f"  scripts/ledger-policy.yaml: {os.environ['POLICY']}\n"
)
# `hashes:` is the last header key, so the block runs to the end of the frontmatter.
t, n = re.subn(r"^hashes:[^\n]*\n(?:[ \t]+[^\n]*\n?)*", hashes, t, count=1, flags=re.M)
if n != 1:
    raise SystemExit("could not locate the hashes block in answer-key.md")
p.write_text(t)
PY

# 4. verify: coverage digest, both validators, and the Wayfinder's hashes block
#    (which embeds the ledger digest and therefore covers the ledger + freeze header)
./scripts/check-ledger-freeze.sh --verbose
python3 .agents/skills/project-topology-architect/scripts/validate-requirement-ledger.py $LEDGER --project-root . --require-freeze
python3 .agents/skills/project-topology-architect/scripts/validate-wayfinder.py . --ledger $LEDGER
echo "frozen: ${WANT}"

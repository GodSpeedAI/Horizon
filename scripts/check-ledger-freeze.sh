#!/usr/bin/env bash
# Verify the Horizon ledger/Wayfinder freeze. Fails closed; prints a line on success
# only with --verbose.
#
# Conventions this enforces (recorded in requirements/ledger.yaml `population`):
#   * The Wayfinder freeze header's `hashes:` block is AUTHORITATIVE. It lists
#     artifacts and their whole-file sha256, exactly as validate-wayfinder.py checks.
#     scripts/freeze-formation.sh fills it after the Wayfinder body is written, and
#     `hashes:` is the last header key, so value formatting cannot disturb it.
#   * The ledger's `freeze_hash` is a FRAGMENT digest: sha256 of the ledger with the
#     marker line normalised to `freeze_hash: candidate`. It is the only way a
#     document that must name its own digest can be verified; it covers the ledger's
#     own content including `population`, which states the convention above.
#
# Checks:
#   1. ledger states a sha256 freeze_hash, and it equals the fragment digest.
#   2. the ledger passes the skill's structural + freeze-required validation.
#   3. the Wayfinder passes the skill's validation (frozen freeze_id, hashes block
#      current, requirement list cross-referenced with the ledger).
#   4. the Wayfinder hashes block lists every required artifact.
#   5. the freeze is not self-contradictory: the header's own artifact list and the
#      ledger's stated convention agree (hashes block present + authoritative claim).
#   6. the projection is faithful: Wayfinder rows are the ledger's ids, in order.
set -euo pipefail
cd "$(dirname "$0")/.."
VERBOSE="${1:-}"

LEDGER=requirements/ledger.yaml
WF=.wayfinder/answer-key.md
FH="python3 .agents/skills/project-topology-architect/scripts/freeze-hash.py"
SKILL=.agents/skills/project-topology-architect/scripts

fail() { echo "FAIL: $*" >&2; exit 1; }

STATED="$(sed -n 's/^freeze_hash: *//p' $LEDGER | head -1)"
case "$STATED" in
  sha256:*) ;;
  *) fail "ledger freeze_hash is not frozen: '${STATED}'" ;;
esac

# 1. fragment digest, computed without writing to the frozen ledger
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
sed 's/^freeze_hash: .*/freeze_hash: candidate/' $LEDGER > "$tmp"
[ "$($FH "$tmp" | cut -d' ' -f1)" = "$STATED" ] \
  || fail "ledger content does not match its freeze_hash (hand edit after freeze?)"
rm -f "$tmp"

# 2./3. skill validators (output only shown on failure)
python3 $SKILL/validate-requirement-ledger.py $LEDGER --project-root . --require-freeze \
  >/dev/null || fail "requirement ledger validation failed"
python3 $SKILL/validate-wayfinder.py . --ledger $LEDGER >/dev/null \
  || fail "wayfinder validation failed"

# 4. the hashes block must cover the artifacts this formation depends on, and match them
for artifact in $LEDGER .agents/specs/horizon.agent.spec.yaml \
                .agents/plans/horizon.plan.yaml scripts/ledger-policy.yaml; do
  line="$(grep -E "^  ${artifact//./\\.}: sha256:[0-9a-f]{64}\$" $WF || true)"
  [ -n "$line" ] || fail "wayfinder hashes block does not cover ${artifact}"
  recorded="${line##*: }"
  actual="$($FH "$artifact" | cut -d' ' -f1)"
  [ "$recorded" = "$actual" ] \
    || fail "stale hash for ${artifact}: recorded ${recorded}, actual ${actual}"
done

# 5. the ledger must state the convention the freeze actually used
python3 - "$LEDGER" <<'PY'
import pathlib, sys, yaml
doc = yaml.safe_load(pathlib.Path(sys.argv[1]).read_text())
pop = (doc.get("population") or "").lower()
if "hashes block is authoritative" not in pop:
    raise SystemExit("ledger does not record that the Wayfinder hashes block is authoritative")
if "freeze_hash" not in pop:
    raise SystemExit("ledger does not record the freeze_hash convention")
PY

# 6. projection fidelity
python3 - "$LEDGER" "$WF" <<'PY'
import pathlib, re, sys, yaml
ledger = yaml.safe_load(pathlib.Path(sys.argv[1]).read_text())
want = [r["id"] for r in ledger["requirements"]]
got = re.findall(r"^\| (REQ-[A-Z]+-[0-9]+) \|", pathlib.Path(sys.argv[2]).read_text(), re.M)
if got != want:
    missing = sorted(set(want) - set(got))
    extra = sorted(set(got) - set(want))
    raise SystemExit(
        f"wayfinder rows do not match ledger: missing={missing} extra={extra} "
        f"order_ok={not missing and not extra}"
    )
PY

# 7. reproducibility: regenerating the projection from the frozen ledger reproduces the
#    committed projection body (everything after the freeze header). The header is written
#    by the freeze step and carries frozen_at/hashes, which are not part of the projection.
body() { awk 'f{print} /^---$/{c++; if(c==2){f=1}}' "$1"; }
tmpwf="$(mktemp)"
trap 'rm -f "$tmpwf"' EXIT
python3 scripts/gen-wayfinder.py --root . --ledger $LEDGER --out "$tmpwf" >/dev/null
diff <(body "$tmpwf") <(body $WF) >/dev/null \
  || fail "committed wayfinder body is not the projection its generator produces (hand edit?)"

[ -z "$VERBOSE" ] || echo "freeze ok: $(sed -n 's/^freeze_id: *//p' $WF | head -1); ${STATED}"

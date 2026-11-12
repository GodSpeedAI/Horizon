#!/usr/bin/env bash
# Freeze the Stage 0A contract set for an independent review.
#
# The copy is read-only (0444) and every file is hash-pinned in MANIFEST.sha256. A verdict on
# those hashes is a verdict on fixed bytes. The live tree is untouched.
set -euo pipefail
ROOT="/home/sprime01/projects/Horizon-gaps"
DEST="$ROOT/.agents/evidence/2026-11-09-stage-0a-defects/$1"

rm -rf "$DEST"
mkdir -p "$DEST/contracts/identity/v1/fixtures" "$DEST/.agents/prereg/horizon"

cp "$ROOT/design_draft.md" "$DEST/design_draft.md"
for file in operations.yaml policy.yaml params.yaml platform-claims.yaml records.json issuer-profile.yaml a3-mechanism.yaml external-interfaces.json; do
  cp "$ROOT/contracts/identity/v1/$file" "$DEST/contracts/identity/v1/$file"
done
cp "$ROOT/contracts/identity/v1/fixtures/record-cases.json" "$DEST/contracts/identity/v1/fixtures/record-cases.json"
for file in T23.prereg.yaml STAGE-0A.prereg.yaml STAGE-0A-DEFECTS.prereg.yaml STAGE-0A-REMEDIATION.prereg.yaml STAGE-0A-REMEDIATION-2.prereg.yaml STAGE-0A-REMEDIATION-3.prereg.yaml STAGE-0A-REMEDIATION-4.prereg.yaml; do
  cp "$ROOT/.agents/prereg/horizon/$file" "$DEST/.agents/prereg/horizon/$file"
done

# Hash every file except the manifest itself, in a stable order.
(
  cd "$DEST"
  find . -type f ! -name MANIFEST.sha256 -printf '%P\n' | LC_ALL=C sort | xargs sha256sum > MANIFEST.sha256
)

# Read-only for everything, including the manifest.
find "$DEST" -type f -exec chmod 0444 {} +
chmod 0555 "$DEST" "$DEST/contracts" "$DEST/contracts/identity" "$DEST/contracts/identity/v1" \
  "$DEST/contracts/identity/v1/fixtures" "$DEST/.agents" "$DEST/.agents/prereg" "$DEST/.agents/prereg/horizon"

echo "frozen: $DEST"
(
  cd "$DEST"
  sha256sum -c MANIFEST.sha256 | tail -3
  echo "files: $(find . -type f | wc -l)"
)

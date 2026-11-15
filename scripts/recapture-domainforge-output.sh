#!/usr/bin/env bash
# Re-capture the DomainForge-owned IDM artifacts required by T01.
# Run after any legitimate .sea edit; the outputs are T01 evidence, not authority.
set -euo pipefail
cd "$(dirname "$0")/.."
DF="${DOMAINFORGE_BIN:-../domainforge/target/release/domainforge}"
DF_ABS="$(cd "$(dirname "$DF")" && pwd)/$(basename "$DF")"
OUT="${1:-.sea/interaction/validation/domainforge-output.txt}"

{
  echo '# DomainForge 0.22.0 — T01 IDM validation output (verbatim)'
  echo '# Re-captured at T04 after the INV-08 requirement_ref correction'
  echo '# (REQ-NAV-001 -> REQ-INT-003); no entity or invariant semantics changed.'
  echo
  echo '## validate --application'
  echo '# T01 gate-01 validate --application (pinned 0.22.0)'
  echo '$ $DOMAINFORGE_BIN --version'
  "$DF_ABS" --version
  echo "\$ $DF_ABS validate .sea/interaction/interaction-model.sea --application --format human"
  "$DF_ABS" validate .sea/interaction/interaction-model.sea --application --format human
  echo "exit=$?"
  echo
  echo '## contract'
  echo '# T01 gate-03 contract identity (DomainForge-owned)'
  echo "\$ $DF_ABS contract .sea/interaction/interaction-model.sea"
  "$DF_ABS" contract .sea/interaction/interaction-model.sea
} > "$OUT"
echo "wrote $OUT"
grep -n 'semantic_closure_hash' "$OUT" | head -3

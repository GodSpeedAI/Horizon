# FDE read-path fixtures (WP-19)

Fixtures for the read-only FDE adapters (`src/adapters/fde-read.ts`) and the parity gate
(`test/fde-parity.test.ts`). Regenerate with the commands below; do not edit generated files.

## Provenance

| Directory | Producer | How it was made | Source commit |
|---|---|---|---|
| `rt/<scenario>/{observed,compare}.json` (+ `reference.json`, `profile.json`, `mapping.json` inputs) | REAL `realitytrace observed ingest / derive / compare` binary | `generate/gen-rt.py <realitytrace> <rt-seed> test/fixtures/fde/rt` | RealityTrace `fde/integration` 4930b7d (binary `target/debug/realitytrace`) |
| `sf/<scenario>/cases/case-0001/*` | REAL SEA-Forge `case_records::append` (unmodified `case_records.rs` + `interaction_events.rs` compiled via `#[path]`), driven over the contract's own valid request fixtures | `generate/sf-seed` : `sf-seed <sea-rs>/contracts/fde test/fixtures/fde/sf` | SEA-Forge `fde/integration` 69357a5d plus uncommitted edits to `case_records.rs` in that worktree (another WP in progress): the file used had sha256 recorded in `generate/PROVENANCE.txt` |
| `pin/*.json` | HAND-WRITTEN, shaped by `PinState::to_json` / `PinRecord` (`world_pin.rs:70-104`) | no producer output was generated: the real `authority_pin` needs the full authority crate and an approved promotion | n/a |

Schemas: `contracts/fde/*.json` are byte copies by digest (`contracts/fde/DIGESTS`), from SEA-Forge `contracts/fde` (case-record-append, frozen-reference) and RealityTrace `contracts` (residual, observed-representation).

## Scenarios

- `rt/confirmed-undeclared-unverified-tail`: `confirmed` + `observed_undeclared` residuals, tail `unverified`.
- `rt/confirmed-undeclared-verified-tail`: same ledger with `--expected-head`/`--expected-record-count`: tail `verified_against_expected_head`.
- `rt/contradicted`: flow observed in the reverse order: `contradicted`.
- `rt/insufficient-silent-source`: a frozen evidence source emitted nothing: `insufficient` / `evidence_source_silent`.
- `sf/evaluated-settled`: freeze, published anchor, settlement `S` by `verifier-1` (I-2 passes).
- `sf/evaluated-frozen-anchor-pending`: freeze only, anchor pending.
- `sf/exploratory-settled-unresolved`: exploratory episode settled `U`.

Not exercised: DomainForge `evaluate` (policy expectations), so no `policy_*` basis fixtures; the RealityTrace and SEA-Forge fixtures use different worlds and episodes (they come from different producers' own fixtures) and are shown as separate sources, not cross-joined.

Needs: `realitytrace` binary from the RealityTrace worktree, cargo (`flock -o ~/projects/_wt/cargo.lock env RUSTC_WRAPPER= CARGO_BUILD_JOBS=1 CARGO_INCREMENTAL=0 cargo build --offline` in `generate/rt-seed` and `generate/sf-seed`, each with its producer's `Cargo.lock` copied in).

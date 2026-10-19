# T04 Evidence — Executable walking skeleton, frozen requirement ledger and Wayfinder

- Claim: the project boots, parses and pins the canonical semantic world, resolves the
  `local_operator` configuration at a trusted boundary, and performs an honest
  source-to-intent-to-projection round-trip through the real Cognate runtime, with the
  requirement ledger and Wayfinder frozen and cross-checked — no competing model or
  authority store.
- Preregistration: `.agents/prereg/horizon/T04.prereg.yaml` (authored before artifacts;
  `recorded_before_artifacts: true`).
- Spec: HORIZON-001 v1.0.0, `sha256:75cfc1ceb9eec6139f7b8e73f8d1107fcc5e2b680e80683824edd7d8de434130`, unchanged from the plan pin.
- **Settlement status: NOT settled.** All mechanical gates pass (table below), but PE-01
  requires independent critic verdicts recorded before freeze and no independent verifier
  has reported. See "Status and open items".

## Gate runs (all re-run after the final freeze)

| Command | Result | Log |
|---|---|---|
| `just check` | exit 0 — `check: ok (local_operator, 127.0.0.1:4319, horizon)` | `just-check.log` |
| `just boundaries` | exit 0 — `boundaries: ok (.)` | `just-boundaries.log` |
| `just test` | exit 0 — 8 Bun pass / 0 fail / 36 expects; 4 pytest pass | `just-test.log` |
| `just ledger` | exit 0 — 98 reqs, 98 contracts, freeze verified | `just-ledger.log` |
| `just wayfinder` | exit 0 — `wayfinder: 0 error(s)` | `just-wayfinder.log` |
| `just teeth` | exit 0 — 5 structural attacks + 6 freeze attacks blocked | `just-teeth.log` |
| `just verify` | exit 0 | `just-verify.log` |
| `just gate-t04` | exit 0 — `gate-t04: ok` | `just-gate-t04.log` |
| `validate-requirement-ledger.py --require-freeze` | exit 0 — 0 errors | `ledger-validation.log` |
| `validate-wayfinder.py` | exit 0 | `wayfinder-validation.log` |
| `bash scripts/teeth-ledger-freeze.sh` | exit 0 — 6 blocked, 0 missed | `teeth-freeze.log` |

## Freeze

- Ledger `freeze_hash` = `sha256:a5bc2d410572bdaf6807ef07183f00708e96d74d3d1d53fc33ee4be175490e24`
  — the **fragment digest** (document with `freeze_hash` normalised to `candidate`), because
  a document cannot contain its own whole-file sha256.
- Wayfinder header `hashes` is authoritative and holds whole-file sha256 of the ledger,
  spec, plan and policy.
- **Idempotence verified:** re-running `scripts/freeze-formation.sh` leaves the ledger
  byte-identical and the Wayfinder differing only in `frozen_at`.

## Requirements ledger and Wayfinder (PE-01)

- 98 requirements, 98 acceptance contracts, 0 unmapped, all `status: candidate`.
- 10 requirements bound to canonical `.sea` invariant instances (INV-01…INV-09, INV-11);
  the rest use the documented per-family fallback, every one of which resolves to a real
  canonical entity (the generator fails otherwise).
- Critic predicates: 85 source-fidelity, 5 evasion, 4 semantic-fidelity, 4 verification-quality.
- Wayfinder: 98 rows, ids and order identical to the ledger, no duplicate expected
  observables, no empty cells, no `just verify` substitutes for a task gate.
- Freeze falsifiers (all six block, `teeth-freeze.log`): ledger edited after freeze;
  ledger reverted to `candidate`; Wayfinder body hand-edited; Wayfinder unfrozen; hashed
  input (policy) drifted; ledger row removed.

## Pin revision (recorded, not silent)

`.sea` INV-08 (`inv_intent_idempotent`) was bound to `REQ-NAV-001` (availability vs
possibility) instead of `REQ-INT-003` (duplicate intents). Correcting `requirement_ref`
changes the DomainForge closure hash, so `world_ref` moved:

- original `world:horizon@sha256:b0f31fcc…d602cd24ca1`
- revised  `world:horizon@sha256:6c18d6a6…412309f0`

Verified by `domainforge validate --application` (0 violations) and `scripts/world-ref.py`.
The pre-re-pin `just test` failure was the semantic adapter correctly rejecting the stale
pin; it is recorded as a fixed prerequisite defect, not erased. Structure and operations
did not change. Full rationale in the prereg `pin_revision` block.

## Positive observations

- `structural walking skeleton > boots the canonical world, real runtime, projection and
  HTTP health` passes against the real Cognate 0.6.1 runtime over the durable SQLite store.
- `local_operator` config: loopback-only bind, refuses `shared_remote` without an identity
  provider, operator/agent principals kept distinct, fresh 0600 secret per launch
  (secret is git-ignored).
- Research subsystem is its own uv project with a lock file, typed process contract and
  pytest coverage invoked by `just test`; no ML logic claimed.
- Topology record `docs/topology.md`; donor attribution `docs/donors.md`
  (Product Actualizer `c9df8d2`, Apache-2.0, donor-not-runtime-authority).

## Teeth (preregistered negative expectations)

Each blocked with a bounded diagnostic and no green fallback — see per-case logs.

| NE | Attack | Result | Log |
|---|---|---|---|
| NE-01 | Remove required Cognate dependency | `STRUCTURAL: missing required Cognate dependency …` | `teeth-missing-cognate.log` |
| NE-02 | In-memory store under `local_operator` | `RUNTIME: … durable SQLite store is required` | `teeth-in-memory-runtime.log` |
| NE-03 | `product-model/` as competing store | `BOUNDARY: competing canonical model/authority store …` | `teeth-product-model.log` |
| NE-04 | Second `.sea` authority | `BOUNDARY: duplicate semantic authority …` | `teeth-duplicate-sea.log` |
| NE-05 | False `world_ref` | `SEMANTIC: world identity mismatch …` | `teeth-false-world.log` |

The five per-case logs are verbatim extracts of the single `just-teeth.log` run; the
`scripts/teeth.ts` harness has no per-case selector.

## Failed runs retained (not erased)

1. `just test` failing before the re-pin — the adapter rejected the stale `b0f31fcc…`
   world hash. Classified as a prerequisite/pin defect, not an implementation defect.
2. `check-ledger-freeze.sh` failing on a clean tree after a reproducibility check was
   added: the generator inherited the existing freeze header, so comparison included
   header noise. Fixed by comparing only the projection body.
3. Freeze appearing non-deterministic until ordering was understood:
   `freeze-formation.sh` must regenerate the ledger *before* the Wayfinder. Running the
   ledger generator alone after a freeze invalidates the freeze and requires re-freezing
   (fail-closed, as intended).
4. Two false-alarm teeth attempts used the wrong `sed` indentation for the `statement:`
   field and therefore proved nothing; they were discarded. The six recorded falsifiers
   are the corrected versions.

## Limits

- Structural E2E proves wiring and provenance, not business behavior or live settlement.
- SEA-Forge, Gauntlet, RealityTrace, Context Kernel and Product Actualizer integrations
  remain typed seams, not live integrations.
- Gates `t05`–`t22` fail closed; they are not implemented at T04.
- The independent/adversarial criticism required by PE-01 is **not recorded**.
- 72 of 98 acceptance contracts use the generic `Observed in the runtime's own terms:`
  restatement. Three conjunctions a single observable could not settle (REQ-RES-001,
  REQ-SEC-004, REQ-STACK-011) were replaced with facet-by-facet contracts; the remaining
  generic ones were checked for vagueness and duplicates but not individually falsified.
- `scaffold.log` is **reconstructed** (the original `cognate create` output was not
  retained); it records the current, re-observable scaffold state and says so.
- `domain/` is a directory symlink to `.sea/interaction`; its portability on other
  checkouts is unverified.

## Status and open items

Mechanically complete and honest; **not** settled as T04. Outstanding:

1. Independent verifier must confirm against this prereg (no self-attestation).
2. PE-01's "independent criticism verdicts recorded before the freeze" cannot be
   satisfied retroactively — the freeze has already happened. Either the owner accepts
   post-freeze criticism as meeting PE-01 with a recorded rationale, or PE-01 is restated
   in the prereg and formation is re-frozen.


- `structural walking skeleton > boots the canonical world, real runtime, projection and
  HTTP health` passes against the real Cognate 0.6.1 runtime over the durable SQLite store.
- `local_operator` config: loopback-only bind, refuses `shared_remote` without an identity
  provider, operator/agent principals kept distinct, fresh 0600 secret per launch
  (secret is git-ignored).
- Research subsystem is its own uv project with a lock file, typed process contract and
  pytest coverage invoked by `just test`; no ML logic claimed.
- Topology record `docs/topology.md`; donor attribution `docs/donors.md`
  (Product Actualizer `c9df8d2`, Apache-2.0, donor-not-runtime-authority).

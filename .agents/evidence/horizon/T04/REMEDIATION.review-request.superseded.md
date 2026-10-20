# T04 remediation — request for fresh independent verification

> **SUPERSEDED (2026-10-19).** Superseded by `../REVIEW-REQUEST-INDEX.md` → `../REVIEW_REQUEST.md`.
> Retained, not deleted. Its substantive material (claims C1–C12, the gate list, the limits, the
> fail conditions) is included in the current request. Do not treat this file as current.

You are the independent verifier of the **remediation**, not of the original build. The
original build was reviewed and **failed**: `.agents/evidence/horizon/T04/verdicts/codex-root-20261019-7b4d110.md`
(reviewed commit `7b4d110`). That verdict is evidence, not a specification. Do not edit it,
and do not assume the builder's response to it is correct.

Your job is the same as the first reviewer's: try to falsify the claims below. A confirmed
defect is the most valuable output; "could not falsify" is an acceptable verdict.

## Ground rules

- **Do not modify or "repair"** the active frozen artifacts: `.agents/specs/horizon.agent.spec.yaml`,
  `.agents/prereg/horizon/T04.prereg.yaml`, `requirements/ledger.yaml`, `.wayfinder/answer-key.md`,
  `.sea/**`, `scripts/ledger-policy.yaml`.
- The candidate revision under review (`.agents/candidates/horizon/T04-CR-001/`) is a
  *proposal*. Review it, but do not apply it to the active tree.
- Run everything in temporary copies or leave the repository clean. If you mutate a tracked
  file, restore it and show the hash before and after.
- Network is unavailable in this environment. Do not treat a missing download as a pass.
- Write your verdict to `T04/verdicts/<reviewer-id>.md` with the header used by the first
  verdict (`reviewer`, `date`, `commit`, `independent_of_builder`, `verdict`). Do not
  overwrite another reviewer's file.

## What changed since `7b4d110` (claims to falsify)

Each claim names its proof. Your job is to attack the proof, not to accept it.

| # | Claim | Where to attack |
| --- | --- | --- |
| C1 | The structural E2E now discriminates a real Cognate runtime over SQLite from a memory-only fake. It writes, closes, reopens and reads through the SQLite store; it asserts durable events, a committed `NavigationIntentRecord`, projection checkpoint and intent provenance. With the fake installed it fails. | `test/app.test.ts`; `scripts/teeth.ts` (`isolated-tree-real-runtime`, `fake-runtime-substitution`); `scripts/t04-attacks/fake-runtime/`. Try a *different* fake that emulates the store better, or a value that still passes with a non-SQLite file. |
| C2 | Configuration is exercised through application construction, with no store override; `HORIZON_STORE=:memory:` is rejected on the E2E path. | `test/app.test.ts` (`configured in-memory storage is rejected by construction`), `test/support/config.ts`. Check for a hidden override. |
| C3 | The promised frame→typed intent→run→checkpoint path exists: a typed `CommitNavigationIntent` is built from the issued frame, committed through Cognate, recorded in the durable log, and used to start the observation run. | `src/domain/intent.ts`, `src/capabilities/navigation-intent.ts`, `src/app.ts`, `test/app.test.ts`. Check that the typed intent is not a thin alias for a JSON cast, and that the checkpoint is observed rather than fabricated. |
| C4 | The generator preserves normative polarity and subject; a self-test fails generation if it does not; the candidate ledger repairs all four inverted contracts and restores subjects on the generic ones. | `scripts/gen-requirement-ledger.py` (`restate`, `self_test`), `scripts/check-acceptance-claims.py`, candidate `ledger.yaml`. Try requirement phrasings that invert or lose meaning. |
| C5 | The three underdetermined contracts restate their requirement verbatim; what the witness supplies is recorded separately and is never restated as policy; the composer refuses an entry that declares introduced policy. | `scripts/ledger-policy.candidate.yaml` (`witness_supplies`, `introduced`), `scripts/apply-candidate-revision.py`, `test/acceptance.test.ts`, candidate `REVIEW.md`, `.agents/evidence/horizon/T04/criticism-round1.md`. The first draft of these three added a materiality predicate, a prescribed construction path and an unratified "frame vocabulary"; check whether revision 2 really removed them, and whether `evaluateDeviation` now follows the spec's own algorithm (`derive_navigation_frame`, INV-01) or merely swapped inventions. |
| C6 | Referential integrity and invariant-id uniqueness are checked, the two DomainForge blind spots are demonstrated, and an undefined type is still rejected. | `scripts/check-idm-integrity.py`, `scripts/teeth-idm-integrity.py`, `scripts/teeth-domainforge-gate.py`, `scripts/idm-integrity-debt.yaml`. Try a dangling reference the debt list does not cover. |
| C7 | Research is optional at startup and degraded observably; research-dependent operations fail closed; unrelated read-only startup and operations continue. | `src/app.ts`, `src/adapters/research.ts`, `test/app.test.ts`. Try a research command that hangs, emits malformed JSON, or exits 0 with a wrong contract. |
| C8 | `just verify` is T04's complete gate and includes the adversarial teeth; `gate-t04` additionally checks the candidate contracts; `acceptance-claims-frozen` is honestly red. | `justfile`. Look for a target that returns green with a required check skipped. |
| C9 | Folded contracts are proven: `AC-CONFIG-001-01` (spoofed observer refused, effective observer is the OS session, attempt auditable) and `AC-CONFIG-003-01` (partial availability). | `test/app.test.ts`. Check that the audit record proves what the contract asks, not merely that something was written. |
| C10 | The frozen-artifact findings are handled honestly: candidate prepared, active pins unchanged, prereg patch exact, no claim of pre-freeze criticism. | `.agents/candidates/horizon/T04-CR-001/`, and `git diff 7b4d110 -- requirements/ .wayfinder/ .agents/specs/ .agents/prereg/ .sea/` must be empty. |
| C11 | The `cognate create` capture is labelled as *new* evidence and does not claim to be the historical run. | `.agents/evidence/horizon/T04/cognate-create-repro/REPRO.md`. |
| C12 | The envelope-coverage limit of the Wayfinder `hashes:` block is stated, not hidden. | `.agents/evidence/horizon/T04/REMEDIATION.md` ("Envelope coverage"). |

## Commands that must be run

```
export DOMAINFORGE_BIN=../domainforge/target/release/domainforge
just check
just boundaries
just idm-integrity
just acceptance-claims
just acceptance-claims-frozen      # expected RED on the active ledger; confirm it is red for the right reason
just witness-claims               # no NEW policy in any contract; 9 inherited findings are DEBT D-020
just contract-modals              # no changed contract drops a modal; contract-modals-frozen is RED by design
just test
just ledger
just wayfinder
just teeth
just verify
just gate-t04
bash .agents/evidence/horizon/T04/run-gates.sh
```

`just witness-claims` and `just contract-modals` take a baseline from
`scripts/witness-claims-baseline.txt` so that inherited defects do not fail a gate while a new
one does. Judge that baseline yourself: if a baselined entry is really a defect in code this
revision authored, the claim that "no new policy was introduced" is false.

Also re-run your own NE-01 … NE-05 against **both** `7b4d110` and the current tree, and say
explicitly which commit/tree each command tested. The builder's re-run of the five NEs on
`7b4d110` is `.agents/evidence/horizon/T04/ne-rerun-7b4d110.md`; do not rely on it.

## Known limits we state, so you can decide whether they matter

- `REQ-CMP-001` is a dangling requirement reference in the canonical `.sea`
  (`scripts/idm-integrity-debt.yaml`, DEBT D-016). Correcting it changes `world_ref`; it is
  recorded, not fixed.
- The remaining generic contracts are not individually re-authored (DEBT D-012).
- NE-01's E2E condition still passes when only manifest metadata is removed while modules
  stay installed; `check-boundaries.ts` is the enforcing route. The tooth records this.
- `scripts/teeth.ts` copies `node_modules` into a temporary tree (DEBT D-017): slow, and
  dependent on an installed tree.
- The original `cognate create` output is still lost; only the new capture exists.

## What would make this fail

- A memory-only or non-SQLite substitute that still passes the E2E.
- Any acceptance contract that reverses its requirement's prohibition after regeneration.
- A witness that proves its contract only by re-asserting a value it just set.
- A "verified" claim that the cited command cannot see (the original `0 violations` defect).
- Any edit to an active frozen artifact.

## What is explicitly NOT claimed

T04 is not settled. The remediation claims only that the mutable defects are fixed, the
witnesses exist, and the frozen defects have a concrete candidate revision awaiting owner
authorization. Settlement needs your verdict **and** the owner's decision on T04-CR-001.


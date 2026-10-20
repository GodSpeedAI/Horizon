# T07 — deterministic navigation and observer-relative affordance controller

**Settled 2026-10-20.** P2 — builder proof with adversarial teeth. Not P3: no independent replay
was performed, and nothing here implies one.

Prereg: `.agents/prereg/horizon/T07.prereg.yaml`, recorded before implementation
(sha256 `96e36c736937a7813bf80598c053362f9c2e8cdab371a9e96cef9398168bf2b1`). Shape check ran before
any code existed: 12 positive + 11 negative structural members.

## What is now true

- `src/domain/navigation.ts` — `horizon.navigation/2`: the closed gate vocabulary, the pure
  assessor, case derivation, context selection, immutable revisioned frames and the stale-revision
  guard.
- `src/adapters/navigation.ts` — derives a case and read-only inspection moves from a real T06
  projection read. It records no consequential authority because T07 has no SEA-Forge channel.
- `test/navigation-controller.test.ts` — PE-01…PE-12.
- `test/navigation-negative.test.ts` — NE-01…NE-11.
- `test/navigation-source.test.ts` — the controller over a durable Cognate store seeded by the T06
  fixture, including the focus-missing material deviation.
- `scripts/check-t07-prereg-coverage.ts`, `scripts/teeth-t07-mutation.ts` and `just gate-t07`.

The frame is additive: T04/T05's `horizon.navigation-frame/1` is untouched (DEC-T07-04).

## Positive evidence

| ID | Verdict | Evidence |
| --- | --- | --- |
| PE-01 | pass | A declared but unassessed operation stays in `possible_operation_refs` and is absent from choices; available, blocked, unknown and conflicted are produced and kept distinct. |
| PE-02 | pass | Every choice has exactly the seven canonical gate keys; an extra and a missing key are both refused. |
| PE-03 | pass | A blocked move is not spendable, keeps its first blocker and exposes `prereq:select-focus`. |
| PE-04 | pass | Optional-only frame reports `owner_choice`; inspect, defer, reframe and disagree are available and no choice is primary. |
| PE-05 | pass | Resolved context is reported as resolved; only the unresolved checkpoint is asked for. |
| PE-06 | pass | likely_allow and deferred pass; requires_approval is blocked with an approval prerequisite; denied is blocked; unreachable and unknown are unknown; `grants_authority` is the literal false. |
| PE-07 | pass | A consequential choice carries reversibility, payment with provenance, expected evidence and escalation approval ref; omitting payment is refused. |
| PE-08 | pass | A case carries fact refs, direction and `ontology: null`; an `entities` field is refused. |
| PE-09 | pass | A material deviation yields exactly one primary from the available set; an optional-only case yields none. |
| PE-10 | pass | Settlement reachable is true while should-settle-now stays false without judgment; an authorized judgment makes it true; an unauthorized one does not. |
| PE-11 | pass | Known and explicitly-unknown checkpoints, observer, tenant, world, focus, mode and allowed choices are all present; each choice carries status and basis refs. |
| PE-12 | pass | Frame and nested arrays are frozen; mutation throws; revision advances only through revise; stale and blocked choices are refused. |

## Negative evidence

| ID | Verdict | Evidence |
| --- | --- | --- |
| NE-01 | pass | A denied high-value candidate placed first with a `rank: 0` hint is not spendable and cannot be primary. |
| NE-02 | pass | Optional-only case cannot produce a primary or `should_settle_now`. |
| NE-03 | pass | fail, unknown and conflicted gates without reasons are refused. |
| NE-04 | pass | Unknown authority is `unknown`, not available, and the frame has no affordance. |
| NE-05 | pass | requires_approval is blocked pending approval; deferred_to_invocation passes as known and still grants nothing. |
| NE-06 | pass | Extra and missing canonical gate keys are refused. |
| NE-07 | pass | Case derivation without `world_ref` or `direction` is refused. |
| NE-08 | pass | Missing or unauthorized judgment leaves should-settle-now false with a reason. |
| NE-09 | pass | A payload claiming `enabled: true, status: available` does not change a blocked choice or make it selectable. |
| NE-10 | pass | Frozen frame and frozen choice mutation throw; only revise produces revision 2. |
| NE-11 | pass | A stale revision is refused with `NavigationError.code === "stale_frame"`; after revise the previous revision is refused again. |

## Teeth

`teeth-t07-mutation`: 11/11 mutants caught by the named test **by assertion** (not by compile
error). Each mutant breaks one property: status collapse, forced primary, unknown authority as
available, reasonless blocked gate, requires_approval as pass, non-canonical gate key, missing case
world anchor, settlement without judgment, blocked choice selectable, unfrozen frame, stale
revision accepted.

`check-t07-prereg-coverage`: 23 expectations linked to named tests (linkage only; strength is the
mutation run above).

## Gate runs

| Command | Result |
| --- | --- |
| `just check-t07` | exit 0 — shape 12+11, coverage 23 linked |
| `just teeth-t07` | exit 0 — 11 mutants caught |
| `bun test` | 70 pass / 0 fail (10 files, 612 `expect()`) |
| `just check` | exit 0 |
| `just gate-t07` | exit 0 |
| `just verify` | exit 0 |

Logs: `gate-t07.log`, `just-verify.log`, `navigation-tests.log`.

## Limits

- P2, builder with adversarial teeth. No independent replay was performed.
- Authority is a typed input, not a live SEA-Forge evaluation. The controller proves gate semantics
  only; live authorization remains a later task.
- The source adapter reads the T06 fixture-backed projection. `integration_level` stays `fixture`;
  no product system produced the events.
- Payment amounts and units remain unresolved in the source (OQ-IDM-02). Estimates carry provenance
  and never change a gate.
- The frame is not yet consumed by the Clack renderer (T08) or the GUI (T09). T07 exposes the
  selector; it does not claim renderer parity.
- Mutation teeth cover the eleven enumerated violations only, not arbitrary defects.

## Artifact hashes (SHA-256)

```
96e36c736937a7813bf80598c053362f9c2e8cdab371a9e96cef9398168bf2b1  .agents/prereg/horizon/T07.prereg.yaml
67ca54e50b86cf8c82ac05e22d53ba6eac75ffae94ad75916b2229763b5183ca  src/domain/navigation.ts
36cdd7cf44e04ccee78a99b93fb4e14bcaf2c1d14601a12201b3583528b47ace  src/adapters/navigation.ts
33c3980867576d51cf7a24af0a874f4eca8dcd95e06821285e8189bd16673448  test/navigation-controller.test.ts
307c14ec454844efb8f78e3aa94892d65843556e6e261c147a755d80af28aa7e  test/navigation-negative.test.ts
6308cdb29381e56748f52e07ac242f79425fcebf0a109a0ca401f879e00c3463  test/navigation-source.test.ts
5740c8d93814997f812200ea1e302cd02f2f33417045fe67ab1761412a6a3e23  scripts/check-t07-prereg-coverage.ts
2a6ccde77517b17bdd8fa664b440a498aad5c93564d5ac819c69eb5a5df3045f  scripts/teeth-t07-mutation.ts
```

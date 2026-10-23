# SPEC-CR-002: payment vector and capacity (IS2, OQ-IDM-02); settlement of committed navigation intents (IS7)

Revision 6, 2026-10-23.

- Revision 1 was rejected in `REVIEW-codex-r1.md` (2 blockers, 6 major, 1 minor).
- Revision 2 was rejected in `REVIEW-codex-r2.md` (7 major).
- Revision 3 was ACCEPT_WITH_CHANGES in `REVIEW-codex-r3.md` (5 major, to fix before apply).
- Revision 4 was ACCEPT_WITH_CHANGES in `REVIEW-codex-r4.md` (2 major).
- Revision 5 was ACCEPT_WITH_CHANGES in `REVIEW-codex-r5.md` (1 major).
- The tables at the end map every finding to its answer.

Revision 3 deliberately made IS7 smaller. It supports only what an existing RealityTrace surface can
establish, and every other combination is `blocked`.

**Version and sources**
- Target: HORIZON-001 1.0.1 → **1.1.0**.
- Frozen source pin: sha256 `14a42936fe3a17c3726ee57fbc9278fd6f6e92276f67519fd9bf0f605f3324a4`.
- Theory: CognitiveOS Manifesto v17 (canonical by DEC-OWNER-2026-10-21-01), sha256 `b45f4a1e…e2e`:
  - §5: the expectation is formed before the outcome is observable; error is three-valued; `undefined`
    is resolved by modality.
  - §7: `payable` means affordable in every currency.
  - §8: payment is a vector of non-fungible currencies.
  - invariant 21.
- RealityTrace surfaces used, all existing:
  - `question declare` and `threshold declare`, which return a committed ledger position
    (`sxr-cli/src/commands.rs:484, :545`);
  - the `command` verifier, whose exit code is the result (`sxr-verify/src/verifier.rs`);
  - `settlement register`, which refuses unless the threshold is strictly earlier than every piece of
    evidence (`commands.rs:1371`, AC-SETTLEMENT-001).

## Why

- **IS2:** the payment model is unspecified (OQ-IDM-02). The frame algorithm calls
  `evaluateHardGates(candidates, capacity, …)` (spec line 1304), but no capacity is defined.
- **IS7:** nothing decides whether a committed intent achieved its purpose, so J02 can only ever
  answer `unsettled`.

## 1. Payment entries (REQ-NAV-008)

`AffordanceAssessment.payment_estimate` becomes `list-of PaymentEntry {currency, unit, amount, basis,
source_ref}`.

- **currency** comes from Horizon's currency set, a Horizon design choice adopting v17 §8's minimum
  list: `steering_attention`, `orchestration`, `compute`, `verification`, `recovery`,
  `structural_maintenance`, `representational_formation`, `risk_irreversibility`, `opportunity`.
  Extending the set requires a spec version.
- **unit** is declared per entry. Nothing converts between units.
- **amount** is a non-negative number or `unknown`.
- **basis** is `declared_bound` (frozen in the operation's binding) or `predicted` (REQ-RES-004).
  `predicted` is advisory and never a gate input.
- **Coverage:** a binding declares a `declared_bound` entry for every currency, exactly one per
  `(currency, unit)`. Otherwise the binding is invalid and the gate is `unknown`.

## 2. Capacity and the payment gate (REQ-NAV-009)

**Capacity** is the observer's available stock per `(currency, unit)`. It is held in one Horizon-owned
durable aggregate, the capacity ledger. Each `(currency, unit)` has:

- an `allowance`, from operator-owned configuration or the case's authority envelope: a non-negative
  number or `unbounded`;
- an optional `period`, `none` or `day` (UTC). The period's consumption resets at each boundary;
- `reserved`: the sum of the declared bounds of committed intents not yet terminal;
- `consumed`: the sum of the declared bounds of terminal intents in the current period. Consumption is
  the declared bound, which is conservative: an observed spend never lowers it in this version.

Available capacity is `allowance − reserved − consumed`, or `unbounded`.

**The gate** has exactly two inputs: the binding's declared bounds and the available capacity.

| Declared bound | Available for (currency, unit) | Entry result |
|---|---|---|
| 0 | any or none | passes |
| > 0 or `unknown` | no allowance configured | `unknown` ("no capacity for <c>/<u>") |
| any | `unbounded` | passes |
| `unknown` | a number | `unknown` |
| ≤ available | a number | passes |
| > available | a number | `blocked` ("<c>: declares N <u>, M available") |

- The gate is `available` only if the binding is valid and every entry passes. It is never weighed
  against expected value.
- **The reservation is atomic with the commit.** Committing an intent reserves all of its declared
  bounds in the capacity ledger in the same durable transaction that records the intent, using an
  expected-version write on the ledger. A conflicting concurrent commit retries the evaluation, so two
  intents that pass alone but exceed capacity together cannot both commit.
- Invocation re-checks that the reservation exists and that the binding version is unchanged. This is
  part of the existing revalidation (spec line 614).
- A reservation becomes consumption when the intent is terminal: settled, rejected, refused, suspended
  or failed.

## 3. Observed steering attention (REQ-NAV-010)

For a committed intent, IS6 records the observed `steering_attention / decisions`, the number of human
authority decisions SEA-Forge recorded for the intent's operation, read from SEA-Forge. The frame
projection carries it beside the declared bound, and every renderer that shows the intent's payment
shows both values.

## 4. The expected outcome (REQ-NAV-011)

**Applicability.** An intent **requires operational settlement** unless its operation is `read_only`
**and** its binding does not say `settlement: required`. The exemptions below apply only to
`read_only AND settlement != required`.

**Structure** (v17 §5):
- `modality`;
- `statement`;
- `refuted_by`;
- `irrelevant` (may be empty, must be stated);
- `unaccounted`;
- `verifier`;
- `window_s`.

**Supported in 1.1.0: one combination only.** `modality: obligation` with the RealityTrace `command`
verifier, where exit 0 means "the statement is observed".
- Every other modality, and every other verifier kind, is valid vocabulary but makes settlement_access
  `blocked` ("not supported by the configured verifiers"). Prohibitions in particular stay blocked
  until a verifier can record a completed search over a declared scope. Nothing here claims one does.

**Vetted, immutable verifier bindings.** The intent cannot supply a verifier as free text. The
operation's **capability binding** declares a verifier template, which is reviewed together with the
binding and versioned with it. The template has:
- a fixed argv in which only the **effect identity** is substituted. The effect identity is the exact
  target the operation writes, keyed by the `intent_id`. For example, for `commit_navigation_intent`
  it is the `NavigationIntentRecord` with that id;
- `artifacts`: every file the verifier executes or loads as code, each pinned by sha256. This covers
  the executable, any interpreter, any script and any module. The argv may name only these artifacts,
  fixed literal arguments, and the effect identity. A verifier whose logic lives in an unpinned file
  is invalid. Self-contained verifier binaries are the recommended form;
- `read_only: true`, which is required.

Before every run, Horizon checks **every** artifact digest. A mismatch makes the run undefined, never
supported. RealityTrace's evidence records the argv, and Horizon compares it with the template.

**Discrimination check, after authority and before execution.** It is part of the authorized
invocation, not something done before authority:
- RealityTrace runs the verifier once, confined. It sees a read-only view of the target only, with no
  network, the same confinement as P03's proof runs. Its cost is declared in the binding's
  `verification` currency and is reserved like every other currency.
- If the run exits 0, the expectation cannot tell success from no change. The operation is **not
  executed**. The intent is terminal as `refused (expected outcome already holds before acting)`, and
  its reservation is consumed.
- If the run cannot complete, the operation is not executed and the intent is `refused (discrimination
  unknown)`.

**Order of operations:**
1. RealityTrace `question declare` and `threshold declare`. The threshold id and position (T) are
   recorded.
2. Capacity is reserved and the intent is recorded, atomically.
3. The SEA-Forge authority request is sent. Its envelope carries exactly the expectation digest, the
   threshold id and T.
4. On allow, the discrimination run (evidence at B > T).
5. Execution.
6. Verification runs (evidence > B).
7. At window close, Horizon records RealityTrace's ledger head (C).
8. Settlement.

**Frozen.** The expectation is part of the intent's canonical input, and the duplicate check compares
its digest. It is never revised. A changed expectation is a new intent.

**Window.** The window opens at commit and closes `window_s` later. Its bounds are stored in the intent
and survive restarts.
- An invocation (for example after a late approval) that would start after the window closes is
  refused. The intent becomes terminal as `refused (window expired)` and its reservation is consumed.
- No verification run starts after the window closes.

**Admissible evidence** is evidence from verification runs started after execution whose RealityTrace
ledger position is in `(B, C]`. C is the ledger head that Horizon records at window close.

**C must be provably on time.** Two rules make it so, and when either cannot be proven the result
fails closed:
- Horizon launches every verification run with a RealityTrace timeout that ends at least `close_grace_s`
  (default 30) before the deadline. An overrunning run ends as undefined (null exit) before the deadline.
- Horizon records C in a durable closure record no later than the deadline plus `close_grace_s`.
- If no such closure record exists, for example because Horizon was down across the deadline, C cannot
  be proven on time. The intent is then settled `unresolved` → `rejected` (obligation), never from
  evidence read after a late restart.
- **Completion time.** Each piece of evidence counts only if RealityTrace recorded the time its run
  completed and that time is at or before the deadline. RealityTrace takes this time when its watchdog
  observes the child's exit, so a delay can only make it later. Evidence without a recorded completion
  time is undefined. This needs RT-1 below. A timeout alone is never treated as proof of timely
  completion.

The evidence set is frozen at C. A run that would straddle the deadline is cut off by its own timeout.
- RealityTrace's `settlement register` also enforces that the threshold precedes all evidence.
- Ledger positions, not wall-clock times, are the provenance. `verify_run` does not persist the
  verifier's timestamps.

## 5. IS7 settlement (REQ-NAV-012)

SEA-Forge settles from RealityTrace's evidence. Horizon records the result, using the spec's
`SettlementReview.epistemic_status`:

Each admissible run gives one of three results:
- **known 0:** exit code 0;
- **known non-zero:** an exit code other than 0;
- **undefined:** timeout, crash, `exit_code: null`, a digest or argv mismatch, or a run that did not
  complete.

Only known results decide. Undefined runs never count as a pass or a fail.

| Admissible results at C (obligation, `command` verifier) | epistemic_status | operational settlement |
|---|---|---|
| at least one known 0, no known non-zero | `supported` | `settled` |
| at least one known non-zero, no known 0 | `contradicted` | `rejected` |
| both known 0 and known non-zero | `inconsistent` | `unsettled` |
| no known result (none, or only undefined) | `unresolved` | `rejected` (asserted occurrence unsupported) |
| window still open | none yet | `pending` |

- An intent exempt under §4 that carries no expectation is `not_required`, never `settled`.
- `disposition` remains the observer's authorized judgment (REQ-CASE-003).

## 6. The settlement_access gate (REQ-NAV-013)

For an intent that requires operational settlement, the gate is `available` only if all of these hold:
- the concrete expectation is valid;
- its modality and verifier combination is supported (§4);
- the operation's binding declares a vetted, read-only verifier template;
- the template's executable digest matches;
- SEA-Forge settlement with RealityTrace corroboration is configured.

The discrimination check is not a gate input. It runs after authority, inside the invocation (§4).

Otherwise it is `blocked` or `unknown`, naming the missing prerequisite.

For exempt intents it is `available` ("read_only: nothing to settle"). Assessment, inspection and
diagnostics never depend on this gate (REQ-SAFE-004).

## Requirement text (exact, appended after REQ-NAV-007)

- **REQ-NAV-008:** "Payment MUST be represented as entries of currency, unit, amount (non-negative or
  unknown), basis and source reference. Horizon's currency set is steering_attention, orchestration,
  compute, verification, recovery, structural_maintenance, representational_formation,
  risk_irreversibility and opportunity; extending it requires a spec version. An operation binding MUST
  declare a declared_bound entry for every currency, exactly one per (currency, unit), or it is
  invalid. Entries MUST NOT be summed, weighted or converted, and predicted estimates MUST NOT be gate
  inputs."
- **REQ-NAV-009:** "The payment gate's inputs are the binding's declared bounds and the observer's
  available capacity per (currency, unit): allowance (non-negative or unbounded, optionally per UTC
  day) minus reserved and consumed bounds. An entry with a positive or unknown bound and no allowance
  is unknown; an unknown bound against a numeric capacity is unknown; a bound above available capacity
  is blocked. Committing MUST reserve every declared bound atomically with recording the intent, so
  concurrent intents cannot jointly exceed capacity; a reservation becomes consumption when the intent
  is terminal. The gate is never weighed against expected value."
- **REQ-NAV-010:** "For a committed intent, the observed steering_attention (human authority decisions)
  MUST be taken from SEA-Forge's record for the intent's operation and presented beside its declared
  bound wherever the intent's payment is presented."
- **REQ-NAV-011:** "An intent requires operational settlement unless its operation is read_only and its
  binding does not require settlement. Such an intent MUST carry an expected outcome (modality,
  statement, refuted_by, irrelevant distinctions, unaccounted factors, window) whose verifier is the
  operation binding's vetted, read-only template, every executed or loaded artifact of which is pinned
  by sha256 and checked before each run, instantiated only with the operation's effect identity. The expectation is registered with RealityTrace as a question and threshold before
  authority is requested; its digest, threshold id and threshold position are carried exactly in the
  SEA-Forge authority request; it is covered by the intent's idempotency key and never revised. After
  authority and before execution, a confined read-only discrimination run MUST NOT already observe the
  statement; if it does, or cannot complete, the operation MUST NOT be executed. An invocation that
  would start after the window closes MUST be refused."
- **REQ-NAV-012:** "Settlement of an intent that requires operational settlement MUST be decided by
  SEA-Forge from RealityTrace evidence of verification runs started after execution whose ledger
  positions lie after the discrimination run and at or before the ledger head recorded in a durable
  closure record no later than the window deadline plus the close grace; each run's timeout ends before
  the deadline; only evidence whose RealityTrace-recorded completion time is at or before the deadline
  is admissible, and evidence without one is undefined; when no on-time closure record exists the intent
  is unresolved and rejected. Only known exit codes decide; timeouts, crashes, null exits and digest or argv mismatches are
  undefined. Known 0 with no known non-zero is supported and settled; known non-zero with no known 0
  is contradicted and rejected; both is inconsistent and unsettled; no known result is unresolved and
  rejected for an obligation; before the window closes the intent is pending. Only the obligation modality with the command verifier is supported in
  this version. An exempt intent without an expectation is not_required, never settled. Disposition
  remains the observer's authorized judgment."
- **REQ-NAV-013:** "For an intent that requires operational settlement, the settlement_access gate MUST
  be available only if its expectation is valid, its modality and verifier are supported, the
  operation binding declares a vetted read-only verifier template whose executable digest matches, and
  SEA-Forge settlement with RealityTrace corroboration is configured; otherwise it is blocked or unknown with the missing
  prerequisite. Assessment, inspection and diagnostics MUST NOT depend on this gate."

## Other spec edits

- `AffordanceAssessment.payment_estimate`: `list-of PaymentEntry`.
- `metadata.version` becomes 1.1.0, with an amendments entry citing DEC-OWNER-2026-10-23-01.

## Migration and upgrade

1. **Back up before upgrading.** Back up the Horizon store using the documented store backup. This is
   the rollback point.
2. **Versions.**
   - Intent records and pending commit run inputs gain `contract_version` (absent means 1). 1.1.0 writes
     2.
   - The store gains the marker `horizon.contract_version = 2` at upgrade.
   - 1.1.x readers refuse an unknown `contract_version` (fail closed).
3. **v1 work.**
   - Committed v1 intents stay readable and are reported `unsettled (contract_version 1: no expected
     outcome)`. Nothing is backfilled.
   - v1 intents still awaiting authority, or still pending execution, when the new world is activated
     are **suspended** and never executed. Their pins are retained (spec line 606). They are presented
     as "suspended by the 1.1.0 upgrade; re-commit under the current world". Suspension consumes no
     capacity.
4. **World identity.**
   - The interaction-model change creates a new world identity (v17 §13).
   - SEA-Forge keeps the old world registered as history. Evidence under it is unchanged.
   - J02's pinned world_ref is updated in the same change.
5. **Interaction model.**
   - Add the `PaymentEntry`, `CapacityAllowance` and `ExpectedOutcome` records and `contract_version`.
   - Add `expected_outcome` and the RealityTrace threshold position to `CommitIntentInput` and
     `NavigationIntentRecord`.
   - Add the capacity ledger aggregate.
   - Mark OQ-IDM-02 resolved.
6. **Ledger and plan.**
   - Regenerate the requirement ledger: 99 requirements become 105.
   - Rebind the plan to the new sha256 and record the freeze id `HORIZON-001-1.1.0@<date>`.

## Rollback

- **Before any v2 state exists** (no marker): revert the code and spec, and rebind the plan to
  `14a42936…`.
- **After v2 state exists:** the 1.0.1 binary MUST NOT open the store. It does not check
  `contract_version` and cannot be made to retroactively.
  - Rollback is restore-from-backup: restore the pre-upgrade store backup, then revert.
  - Intents committed under 1.1.0 are lost from Horizon's store by that restore. Their SEA-Forge and
    RealityTrace records remain as history. The upgrade notes say so.
  - The rollback procedure checks the marker and refuses to start 1.0.1 against a v2 store.

## Preserved

- All 99 requirements keep their text.
- Unchanged:
  - the J01–J06 phases and the REQ-NAV-006 vocabulary;
  - exactly-once commit;
  - SEA-Forge authorization;
  - IS6 observation;
  - committed operations' world and expectation pins.

## Independent evaluation required

1. **Before apply:** an ACCEPT verdict from an independent reviewer (a different model) in `REVIEW.md`.
2. **After apply:** gate J02 revision 2, live (sea-forge-server, RealityTrace). Each check is asserted on
   the owner's record (SEA-Forge, RealityTrace or the Horizon store). Horizon's view does not count.
   - **Payment:**
     - an over-capacity bound is `blocked` naming its currency;
     - a missing allowance is `unknown`;
     - a binding missing a currency or with a duplicate `(currency, unit)` is invalid, so `unknown`;
     - a `predicted` estimate does not make an `unknown` bound pass;
     - two intents that each fit, but jointly exceed capacity, are committed concurrently: exactly one
       commits;
     - a terminal intent's reservation becomes consumption;
     - a day-period allowance resets at the boundary (clock injected).
   - **Causal order (cross-owner).** Each step is asserted on the owner's record: the threshold
     position T in RealityTrace, then the intent record and reservation in Horizon's store, then the
     SEA-Forge authority request, then the SEA-Forge allow, then the discrimination evidence B > T,
     then the execution event, then the verification evidence > B, then C recorded at close, then the
     SEA-Forge settlement.
     - The envelope's digest, threshold id and T **equal** RealityTrace's records.
   - **Settlement**, one test per table row:
     - known 0 → `supported`/`settled`;
     - known non-zero → `contradicted`/`rejected`;
     - both → `inconsistent`/`unsettled`;
     - only undefined (a timeout run and a null-exit run) → `unresolved`/`rejected`;
     - a known 0 alongside undefined runs → `supported`;
     - window open → `pending`.
   - **Falsifiers:**
     - An expectation already true before acting: the discrimination run exits 0 and the operation is
       **not executed**. The target is checked unchanged on disk or in the store.
     - A denied, or unaffordable, intent produces no verifier run and no effect.
     - A wrong-intent check: a verifier instantiated for intent A, run against intent B's effect, does
       not support B.
     - A changed verifier executable: the digest mismatch makes the run undefined, never supported.
     - A changed verifier **script** with the same argv and the same interpreter digest: the artifact
       digest mismatch makes the run undefined.
     - Horizon stopped across the deadline (closure record missing), then restarted with a passing run
       appended late: `unresolved`/`rejected`, not `supported`.
     - Delayed closure within the grace period still records C, and a run whose timeout would pass the
       deadline is cut off as undefined.
     - A watchdog paused across the timeout and the deadline: the child exits early, the watchdog
       resumes after the deadline, and closure happens within grace. The evidence's `completed_at` is
       after the deadline, so it is not admissible.
     - Evidence without `completed_at` is undefined.
     - (implementation) An authorized verifier that attempts a write and network access is denied by
       confinement.
     - Free-text verifiers are rejected as input.
     - A run that straddles the window close (it appends after C) is excluded.
     - Evidence from before execution is not admissible.
     - An approval that arrives after the window closes is refused.
     - Prohibition or permission modality → settlement_access `blocked`.
   - **Integrity:**
     - the same `intent_id` with a changed expectation → `duplicate_intent`;
     - a restart mid-window resumes the same window;
     - after upgrade, a v1 pending intent is suspended and does not execute, even when its approval is
       then granted;
     - an unknown `contract_version` is refused;
     - the rollback procedure refuses to start 1.0.1 against a store marked `contract_version = 2`,
       covering both records and pending run inputs;
     - `read_only` without `settlement: required` and without an expectation → `not_required`;
     - `read_only` with `settlement: required` and without an expectation → refused at preflight.
       Both read-only classes are tested with RealityTrace stopped, and assessment still works.
   - **REQ-NAV-010:** observed steering attention equals SEA-Forge's approval count, and the Clack
     render and the frame projection both show it beside the declared bound.

## Revision 5 finding → revision 6 (verdict r5: ACCEPT_WITH_CHANGES)

| # | Finding | Answer |
|---|---|---|
| 1 | timeout ≠ proof of timely completion | admissible only with a RealityTrace-recorded `completed_at` at or before the deadline (RT-1); missing completion time is undefined; watchdog-pause falsifier |

## Revision 4 findings → revision 5 (verdict r4: ACCEPT_WITH_CHANGES)

| # | Finding | Answer |
|---|---|---|
| 1 | verifier logic mutable via an unpinned script | `artifacts` pins every executed or loaded file; argv limited to pinned artifacts, literals and the effect identity; changed-script falsifier |
| 2 | C after a late restart | runs time out before the deadline; durable closure record by deadline + grace; missing on-time C fails closed to `unresolved`/`rejected`; downtime falsifier |
| minor | confinement not exercised | implementation test: write and network denied |

## Revision 3 findings → revision 4 (verdict r3: ACCEPT_WITH_CHANGES)

| # | Finding | Answer |
|---|---|---|
| 1 | `intent_id` mention does not bind the effect | vetted, versioned verifier template in the capability binding; only the effect identity is substituted; executable sha256 pinned; free-text verifiers rejected; wrong-intent and changed-executable falsifiers |
| 2 | pre-authority verification unsafe | discrimination moved **after** authority, inside the invocation; confined, read-only; paid in `verification`; denied or unaffordable → no run; already-true → not executed |
| 3 | window bounds launch, not observation | admissible = ledger position in (B, C], with C the ledger head at close; evidence frozen at C; straddling run excluded; positions, not timestamps |
| 4 | crashed runs unmapped | known vs undefined results; only known decide; mixed cases defined and tested |
| 5 | acceptance gaps | full causal order with exact digest, id and position equality; rollback guard test |

## Revision 2 findings → revision 3

| # | Finding | Answer |
|---|---|---|
| 1 | per-intent limits are not capacity | capacity ledger (allowance − reserved − consumed), atomic reservation at commit, joint-exceed test |
| 2 | hindsight and evidence cutoff | verifier must reference `intent_id`; discrimination check before acting; admissible = run started after execution and before window close, at positions after the threshold; late approval refused |
| 3 | RealityTrace feasibility | mapped onto existing question/threshold/`command`/`settlement register` (AC-SETTLEMENT-001); only obligation + `command` supported; all else `blocked` |
| 4 | read-only exemption contradiction | exemptions only for `read_only AND settlement != required`; both classes tested during a RealityTrace outage |
| 5 | rollback assumes enforcement | pre-upgrade backup; marker; 1.0.1 must not open v2 state; rollback is restore; pending run inputs versioned too |
| 6 | old-world execution | v1 pending work is suspended at activation, never executed; pins retained; tested after approval |
| 7 | acceptance gaps | cross-owner ordering and digest assertions; projection and render assertions for REQ-NAV-010 |

## Revision 1 findings → revision 2 (still holding)

| # | Finding | Answer |
|---|---|---|
| 1 | estimates control a hard gate | `predicted` advisory only |
| 2 | empty or split payment passes | every currency, unique (currency, unit) |
| 4 | template ≠ concrete expectation | the gate checks the concrete expectation |
| 9 | "closed v17 vocabulary" | labeled Horizon's design choice |

## Dependency in another product

- **RT-1 (RealityTrace):** `verify run` persists the verifier's `started_at` and a new `completed_at`
  in the observation's inline content.
  - `completed_at` is taken when the watchdog observes the child's exit, or its kill on timeout.
  - The change is additive. Old evidence has no `completed_at` and is undefined for this purpose.
  - A RealityTrace PR is required before the J02 revision 2 gate.

## Relation to SPEC-CR-001

SPEC-CR-001 stays proposed. This CR implements its D1 and the obligation part of D2 for committed
intents.

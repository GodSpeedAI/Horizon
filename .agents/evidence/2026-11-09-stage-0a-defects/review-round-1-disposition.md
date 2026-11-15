# Round 1 disposition — every finding, what was done, and what is still open

**Source:** [`independent-review-round-1.md`](independent-review-round-1.md), retained verbatim.
**Reviewer:** a fresh independent Critic (`gpt-5.6-sol`, xhigh, read-only sandbox, ephemeral
session), not the builder. The frozen copy it read is preserved unmodified at
[`frozen/`](frozen/), with its own `MANIFEST.sha256`.
**Round-1 verdict:** **REJECT** — 5 blocking, 6 must-fix-before-Stage-0B, 2 advisory.
**This file records the disposition.** It is the builder's account, not the reviewer's, and the
round-2 critic is instructed not to read it.

The builder independently confirmed that all five blocking findings were true before making any
correction. None was waived, and no finding was closed by arguing about the wording.

## Blocking findings

| ID | Finding | Disposition | Evidence that it is closed |
|---|---|---|---|
| F-01 | The design's catalog omitted ten reconciled IDs, so the design and the manifest disagreed about what exists | **Closed.** The design's section 11 P0/P1 rows now name every reconciled operation, and `cognate.execution.start` is gone (see F-08). A new frozen design version was issued and the manifest re-pinned. | `design_draft.md` section 11; the new design hash `df55e921c0c62e22737a91fcdcbb5ba4bb6160492fbd0de7a1db274f24bd65b7` (747 lines) recorded in [`.agents/evidence/2026-11-08-identity-authority/design-freeze-record.md`](../2026-11-08-identity-authority/design-freeze-record.md); the delta regenerated against the retained immutable acceptance copy |
| F-02 | The catalog used `A3_UV`/`A3_T` where the mechanism and the receipts use `A3-UV`/`A3-T` | **Closed.** The catalog's evidence vocabulary is now the A3 mechanism's own: the mechanism declares an `assurance_requirements` list, and the manifest loader resolves every row's evidence against it and refuses an id the mechanism does not declare. The underscored spelling no longer appears in any contract or test. | `contracts/identity/v1/a3-mechanism.yaml` (`assurance_requirements`); `src/contracts/identity/manifest.ts` (`assuranceRequirementIds()`, the fail-closed check in the loader); `test/identity-contract.test.ts` ("the evidence vocabulary is the A3 mechanism's own") |
| F-03 | The P2 parameter schemas did not bind the fields their handlers consume | **Closed.** The schemas were rewritten to the handlers' normalised, wire-named fields, `params.ask_withdraw` is now discriminated by code operation, and a build check compares every governed row and every agent-door row against the live source field by field. A schema that drifts from its handler fails the build. | `scripts/check-param-schema-binding.ts` (22 handler bindings, plus coverage and fixed-parameter checks), wired into `just check-t23`; `contracts/identity/v1/params.yaml`; `test/identity-contract.test.ts` |
| F-04 | The agent P2 path authenticated a registered key and then wrote, with no execution proof and no bounded delegation | **Closed at the contract level; the runtime gap is declared, not closed.** The catalog now carries a `live_enforcement` block: for every live-bound row it states the caller path, whether the runtime enforces it at this freeze, what is missing, and the stage that closes the gap. `ask.route` and the agent variant of `ask.withdraw` are recorded as **not enforced today**, missing the execution proof, the live bounded grant, and the pending record, and are assigned to Stage 2. The loader refuses a governed row that claims enforcement it does not have. The design's section 11 carries the same table. **The runtime enforcement itself is Stage 0B/2/3 work and is not yet done; Stage 0A does not claim it.** | `contracts/identity/v1/operations.yaml` (`live_enforcement`); `src/contracts/identity/manifest.ts` (the enforcement checks); `design_draft.md` section 11; `test/identity-contract.test.ts` ("the freeze states what the running code enforces") |
| F-05 | `case_record.authority` had nowhere to freeze `case_authority`, and no pending record existed | **Closed.** The record contract gains a `PendingOperation` kind with 30 fields and three constraints: the confirmation is written by the confirmation step and never by the caller; `case_authority` is immutable and a replacement carries the same one; a row whose authority comes from outside the local continuation requires a governed case, and a row that takes its authority from the case record must state the authority the case record carries. The rules are mirrored in the independent Python implementation, and 15 new cross-language fixtures cover them. The design's Appendix A names the record and its rule. | `contracts/identity/v1/records.json`; `src/contracts/identity/records.ts`; `research/tests/identity_records.py`; `contracts/identity/v1/fixtures/record-cases.json` (86 cases); `design_draft.md` Appendix A |

## Must-fix-before-Stage-0B findings

| ID | Finding | Disposition | Evidence that it is closed |
|---|---|---|---|
| F-06 | The approval rows carried no pending expiry against the normative ten-minute limit | **Closed.** Both approval rows declare `pending_expiry: 10m` and say why: an approval not consumed inside the policy's window is expired and the operation must be requested again. | `contracts/identity/v1/operations.yaml` (`approval.approve`, `approval.reject`) |
| F-07 | `/desk/pair` is not a `device.pair` handler | **Closed.** The browser's pairing route is now `session.pair`: a P1 row whose executor is the local console, whose only parameter is the one-time code, and which enrolls no credential and grants no authority. `device.pair` is a **reserved** P2 row for actual device enrollment. The design's Stage 0B boundary states the distinction in normative prose. | `contracts/identity/v1/operations.yaml` (`session.pair`, `device.pair`); `contracts/identity/v1/params.yaml` (`params.session_pair`); `design_draft.md` section 12; `test/identity-contract.test.ts` ("the browser's pairing route is a session, not a device enrollment") |
| F-08 | Starting shared case execution was classified as P1 | **Closed.** The `cognate.execution.start` row is gone. `POST /desk/start` is bound to the `run.start` **Px** dispatcher, which inherits the class of every operation its plan resolves to; the design says so in section 11 and the manifest refuses any other row on that route. | `contracts/identity/v1/operations.yaml` (`run.start`, `dispatch`); `design_draft.md` section 11; `test/identity-contract.test.ts` ("the shared execution route is a dispatcher") |
| F-09 | Alias downgrade resistance was prose, not trusted data | **Closed.** The alias now declares `target_class`, `fixed_parameters`, and a list of `narrowing_checks`, each naming a machine-checkable difference from the target route. The loader refuses an alias whose check and fixed parameter disagree, an alias with no check, and an alias whose declared target class is not the target's class. | `contracts/identity/v1/operations.yaml` (`route_aliases`); `src/contracts/identity/manifest.ts`; `test/identity-contract.test.ts` ("the alias narrowing is data, not prose") |
| F-10 | P0/P1 ownership declarations were incomplete | **Closed.** Every class default and every writable row now carries a `scope_rule` saying whose the effect is, or stating that it changes only the caller's own local state. The loader refuses a writable row with no scope rule. | `contracts/identity/v1/operations.yaml` (`class_defaults`, per-row `scope_rule`); `src/contracts/identity/manifest.ts`; the mutation test in `test/identity-contract.test.ts` (NE-09) |
| F-11 | An unknown search action fell through to a read in the live router | **Closed in the runtime and in the contract.** The route now classifies the `record` value against the closed dispatch table *before* the search runs and refuses anything outside it with the typed Px refusal (`400 unknown_action`, no read, no write). The catalog's dispatch entry declares the literal values that select each action, because the action names there are semantic rather than literal. | `src/app.ts` (`deskSearchAction`, exported and unit-tested); `contracts/identity/v1/operations.yaml` (`action_values`); `test/identity-defects.test.ts` ("the closed dispatch table: an unlisted action never reaches the handler") |

## Advisory findings

| ID | Finding | Disposition | Evidence that it is closed |
|---|---|---|---|
| F-12 | Not every catalog row had a real handler mapping, and `horizon.note.remove` named a nonexistent code operation | **Closed as stated.** The false `note.remove` locator is removed. The remaining candidate and reserved rows are declarations of operations that have no live binding yet, which is exactly what the `binding` field now says for every row; the reviewer's own correction — "promote candidate/reserved rows only when an exact live binding exists" — is what the field encodes. Thirty-seven rows are `verified` and carry a route or code operation; the rest are explicitly not live-bound. | `contracts/identity/v1/operations.yaml` (`binding` on every row); the census in `test/identity-contract.test.ts` |
| F-13 | Caller declarations and the defect register contained stale statements | **Closed.** `horizon.health` declares `executor: anonymous_connection` and `caller_authentication: none_public_liveness`, and the `DEF-ASK-ROUTE-EXECUTOR` residual no longer claims the design disagrees with the catalog — the design now agrees. | `contracts/identity/v1/operations.yaml` (`horizon.health`, `binding_defects`); `design_draft.md` section 11 |

## What remains open, and why it is not a Stage 0A defect

- **F-04's runtime half.** The agent P2 path still authenticates a registered key and writes. Stage 0A's job is to make the contract say so honestly and refuse to pretend otherwise; the enforcement itself belongs to Stage 0B (interim local containment for the person's operations) and Stage 2 (the execution proof and the live bounded grant for the agent's). The catalog's `live_enforcement` block names the missing pieces and the stage for each, and the loader refuses a false claim.
- **The 36 candidate and reserved rows.** They are declarations, not capabilities. They become live-bound only when an exact handler exists, and the `binding` field is what keeps the difference visible.
- **Stage 0B itself.** The pending store, the `horizon confirm` CLI, the presence checks, the reserved-operation routing, and the remote server's refusal of a session-only approval are Stage 0B work and are not begun.

## The review that closes Stage 0A

A second independent review of a **re-frozen** copy of the corrected contract set is the condition for
Stage 0A to settle. The round-2 copy is at
[`frozen-round-2/`](frozen-round-2/) with its own `MANIFEST.sha256`; the round-1 copy is kept
unmodified so the round-1 verdict stays bound to the bytes it read. The round-2 verdict is retained
beside this file as `independent-review-round-2.md` when it lands.

Until that verdict says ACCEPT (or ACCEPT WITH CONDITIONS whose conditions are met), Stage 0A is
**not** complete and is not reported as complete.

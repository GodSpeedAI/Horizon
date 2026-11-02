# Horizon Cockpit Concepts Brief (v3)

**Mode:** BRAINSTORM
**Branch:** horizon-cockpit-projection-review (PR #14 open)
**Date:** 2026-11-02
**Inputs:** feature concept as supplied by the operator, six egm brainstorm lenses, existing reports dated 2026-11-01.
**Constraint:** no source file was edited. This is a brief, not an implementation.

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `egm-design` | completed |
| `egm-codebase-details` | completed |
| `egm-zoom-out` | completed |
| `egm-comprehension` | completed |
| `egm-implementation-readiness` | completed |
| `egm-structural` | completed |

No reviewer was run twice. All six completed on the first attempt.

---

## Defects and Risks (lead section)

These are ordered by how much they would change the work if ignored.

### Blockers

1. **The concept rests on a wrong premise about Cognate, and the repo answer is split.** The concept says Cognate "has no exported approval list or resolve." Two Cognate codebases disagree.
   - `cognate-workbench` does export `governance.approvals.list` and `governance.approval.resolve` (`src/capabilities/governance.ts:12-13`, mounted and documented in `src/capabilities/README.md:55-57`). Its UI already calls resolve (`src/ui/App.tsx:4611`).
   - The `cognate` repo, package `runtime-bun`, only calls `authority_approvals` in its client (`src/sea-forge-authority.ts:416`) and exports no list or resolve capability.
   - **Required decision:** which Cognate is the target for this work. The approval slice depends on the answer. If it is `cognate-workbench`, the approval inbox can consume existing contracts. If it is `cognate`, a new export is needed first.

2. **Terminal accounting is not atomic today, and this is a defect independent of any move.** `terminate` in `src/capabilities/pending-intent.ts:124-127` commits the pending-record update and then the reservation consume as two separate commits. The settlement path in `src/app.ts:702-703` makes up to three writes. A crash between writes leaves a reservation held with no owner. Nothing reclaims holds stuck in `awaiting_authority`: there is no TTL, and the only reader is `app.ts:626`. Restart recovery only resumes stage `executed` (`app.ts:331-332`).
   - **Required:** one commit for terminal accounting, plus a startup reclaim for stuck holds. Test against the local store before any migration.

3. **Moving capacity to Cognate breaks an atomicity guarantee that the code currently relies on.** The reserve write of the pending record and the ledger hold are one commit (`pending-intent.ts:98`), which works only because both live in one `DurableStore`. Splitting them across a Cognate boundary yields either overspend or a phantom hold. The structural and design reviewers both flagged this.
   - **Required:** either Cognate also hosts the pending record, or the move is deferred. Do not split the two.

4. **There is no migration spec for the three live collections.** These are `horizon-cases` (`src/capabilities/workspace-records.ts:10`), `horizon.capacity-ledger` keyed `${tenant}/ledger` (`capacity-ledger.ts:14`), and `horizon-navigation-intent-pending` keyed `${tenant}/${intentId}` (`pending-intent.ts:21`). The store marker is `contract_version` 2 (`capacity-ledger.ts:15-18`, `contract-upgrade.ts:126`), so a 1.x build refuses to open the store after the marker is written. Revert alone is therefore not a safe rollback. v1 runs are suspended on upgrade (`app.ts:294`).
   - The ledger value itself has no `contract_version` (`capacity-ledger.ts:79-84`).
   - Cutover needs writer fencing on the local store path, a dual-read or one-time import rule, and a rule for intents that are mid-flight in `awaiting_authority` when cutover happens.

5. **The Horizon spec is frozen at 1.1.0, and moving ownership needs a new spec version.** `.agents/specs/horizon.agent.spec.yaml:9-19` is immutable. `capacity-ledger.ts:2` cites REQ-NAV-009 from that spec as Horizon's own requirement. The concept does not mention a version bump.

6. **Capacity is a decision, not just storage.** `paymentGate` and `judgeEntry` (`src/domain/payment.ts:169-194`) compute pass, fail, or unknown inside Horizon, using allowances Horizon config supplies per call (`payment.ts:101-107`, `pending-intent.ts:77`). Moving only the ledger leaves Horizon deciding. Cognate would have to own the gate and the allowances. A generic get and put on the ledger would be exactly the "resource framework in disguise" the operator warned about. Note also that Cognate's `execution-slots.ts` is in-memory concurrency and is not payment accounting; the names will collide.

7. **Approval identity is asserted by configuration, not verified at the authority boundary.** `src/adapters/sea-forge-approvals.ts:34-52` checks only that an operator id is configured, and sends `on_behalf_of` from `COGNATE_SEA_FORGE_OPERATOR` (`:39`). Under `local_operator`, the service and the operator share a uid, so the boundary cannot tell the human from the service. The resolve call sends only `approval_id` and `resolution` (`:62-70`) and carries no expected `decision_id` or `criteria_sha256`, so SEA-Forge cannot refuse a stale approval. The current staleness check reads Cognate's cached continuation (`app.ts:425-436`), not SEA-Forge's live state.
   - **Required:** SEA-Forge (or Cognate, if it carries an authenticated operator identity) must verify the actor. A live test must prove that a service-actor approval is refused. The existing live test at `cognate/packages/runtime-bun/test/sea-forge-live.test.ts:282` already asserts this refusal, which is useful evidence.

### Major

8. **The existing review's premise that `authority_approvals` is never called is false.** `src/app.ts:913` calls it over the raw socket to derive steering-attention accounting (`:913-917`). `app.ts:678` also calls `authority_closure` the same way. The raw-socket violations are therefore more numerous than the two files the concept names (`sea-forge-approvals.ts`, `realitytrace-economics.ts`).

9. **There is no single "approval" shape on the wire, and `PendingApproval` does not cover the inbox alone.**
   - The live list verb serializes `ApprovalStanding::to_json` (`sea-rs/crates/sea-forge-authority/src/cep.rs:727-741`): `approval_id`, `state`, `requester`, `world_ref`, `operation_kind`, `operation_name`, `resource_id`, `subject_actor_ref`, `request_ref`, `expires_at`, `resolved_by`.
   - `PendingApproval.schema.json` has `case_id`, `run_id`, `plan_item_id`, `decision_id`, `requested_at`, `expired`, `criteria_ref`, and nullable `governance`. The live row has none of those.
   - The schema has no `state` field, yet `cep_authority.rs:196` says the list returns "its state." Resolved-row semantics are undefined.
   - Consumers already diverge: Cognate reads `state` (`cognate/packages/runtime-bun/src/sea-forge-authority.ts:414-420`), and Horizon reads `resolved_by` (`app.ts:915`).
   - The consumer requirements note treats the schema as the list shape. That is wrong.

10. **The R3 requirement (eligible actors and expired flag on each list row) conflicts with the producer's own schema.** `PendingApproval.schema.json:92-94` says eligibility is resolved per connection and "a list view cannot invent eligible actors." Expiry is not a boolean on the wire. Use `state === "expired"` from `cep.rs` rather than deriving it from `expires_at`.
    - Listing as the service actor shows the wrong eligibility. The list must run on the operator's behalf.
    - Rows with null `governance` need an "unknown eligibility" display and no approve control.

11. **Horizon's approval id is written into free text and parsed back by regex.** `app.ts:411` writes the id into an audit string, and `src/ui/workspace/model.ts:741` extracts it with `awaiting approval (\S+)`. The UI is deciding from authority text. A typed `approvalId` field in Horizon's own record fixes this without any change to sea-rs.

12. **Structural leaks already present.**
    - `src/settlement/obligation.ts` imports types from `src/adapters/realitytrace-obligation.ts`.
    - `src/ui/workspace/economics.tsx` imports types from `src/adapters/realitytrace-economics.ts`.
    - `src/domain/navigation.ts` and `src/domain/expectation.ts` hold availability and hard-coded gates. `expectation.ts:193-203` (`settlementAccessGate`) computes pass or fail in Horizon. This is spec-mandated (REQ-NAV-013), so moving it is a spec change, not a cleanup.

13. **Three meanings of "case" will collide.**
    - Horizon: `horizon-cases` is a record with only `{case_ref, purpose, opened_at, operator, tenant}`, no lifecycle, no link to a SEA-Forge id. The active case is chosen by timestamp (`workspace-records.ts:52-59`). When none exists, the frame fabricates `case:${focus}` with no record (`app.ts:845`).
    - SEA-Forge: `CaseHorizon.schema.json` defines `case_state` (active, awaiting_approval, completed, terminated) with case operations, and `case_id` is on `PendingApproval`.
    - Cognate: the proposed cross-stack case.
    - `docs/glossary.md:58` already defines Case as a derived view that "does not mint identity." The concept makes it a stored record. This is a glossary conflict.

14. **"Settlement" and "capacity" and "projection" and "observer-local" are undefined or overloaded.** `docs/glossary.md:188` defines Settlement as a development gate, but the concept uses it for a cross-stack ruling. "Capacity" maps to `CapacityLedger`, which reads as budget or money, and the unit of reservation is never stated. "Projection" has three meanings. "Observer-local" appears only in the concept; no definition exists in the repo.

### Minor

15. Horizon still applies defaults and gates locally: a hard-coded purpose (`app.ts:846`) and availability computed in `model.ts` and `navigation.ts`.
16. Every reviewer's "the approval verbs are the authority" claim is only as good as the live suite. The 16 live tests are skipped in the current run, and 3 Chromium tests fail on `main`. The acceptance criteria exist only as prose in the consumer note.

---

## Overview

Horizon is the operator's control surface over the GodSpeed stack. The concept assigns ownership as follows:

- **Cognate** hosts cross-stack case coordination and capacity accounting, and carries operator intent.
- **SEA-Forge** keeps authority and its own execution cases.
- **RealityTrace** keeps observation and evidence.
- **Horizon** keeps navigation, presentation, and observer-local state.

Horizon must not decide, infer approvals, declare execution successful, or grant settlement.

The owner has decided that case and capacity ownership moves to Cognate-hosted application capabilities, and Horizon keeps projections and interaction state only. The reviewers agree this direction is correct. They disagree on how much to move at once.

Scope for this run, as set by the operator:
1. The approval path end to end: a SEA-Forge approval inbox via a Cognate typed projection and resolution call, revalidated on submit, with identity verified at the authority boundary.
2. Cross-stack case coordination and capacity accounting moved to Cognate-hosted capabilities, with atomic reservation, pending-intent recording, idempotency, terminal accounting, and restart recovery.
3. Cockpit surfaces that depend on the above.

Gauntlet and SWE_SEED are limited to read-only status. Palantir polish and a full UI redesign are out of scope.

## Analysis

### Does the approval slice work?

Partly. The inbox can be rendered from the existing Cognate list contract, but only once the target Cognate repo is decided (see Blocker 1). The resolve path is blocked on identity verification (Blocker 7) and on the missing staleness check. The schema does not describe the wire row (Major 9), so the consumer note's requirements R1 to R4 must be restated against the actual wire shape before any UI is built.

### Does the capacity and case move work?

Not in this change. Atomicity (Blocker 3), migration (Blocker 4), spec version (Blocker 5), and the decision logic still in Horizon (Blocker 6) each block it. Cases also need a glossary decision (Major 13) before a move.

### What is the minimum coherent change?

- Approval: consume the existing Cognate contracts. No new Cognate capability is needed if `cognate-workbench` is the target.
- Capacity and case: at most a read-only projection from Cognate, with Horizon still writing the ledger. A write move waits for a migration spec and a dual-run check that shows identical balances.

A generic "resource" or "capability" framework is not needed. Two concrete capabilities, capacity and case, are enough, and even they should wait.

### Is the concept understandable?

A new engineer can follow the division of labour, but cannot tell what a case, capacity, projection, or observer-local state means. The glossary must be fixed first. This is cheap and blocks everything else.

## Goals vs Non-Goals

### Goals (this run)

- A typed `approvalId` in Horizon's own record, removing the regex (Major 11).
- One-commit terminal accounting and a startup reclaim of stuck holds, tested locally (Blocker 2).
- An approval inbox that is read-only at first, rendered from the verified Cognate list contract on the operator's behalf (Major 9, 10).
- A resolve path that is refused when the actor is not verified or the approval is stale (Blocker 7).
- Replacing the raw-socket `authority_approvals` read at `app.ts:913` with a tested projection function (Major 8).
- A glossary entry for each overloaded term, with one meaning each (Major 13, 14).
- Gauntlet and SWE_SEED: read-only health status only.

### Non-goals (this run)

- Moving capacity writes to Cognate. Deferred until a migration spec, a spec version bump, and an atomic-commit design exist (Blockers 3, 4, 5, 6).
- Moving the case lifecycle to Cognate. Cases stay as a binding index to SEA-Forge case ids, and the lifecycle is frozen to SEA-Forge (Major 13).
- Moving the RealityTrace CLI spawn behind Cognate. It is blocked upstream and already recorded as debt.
- Moving availability and gate logic out of `navigation.ts`, `model.ts`, and `expectation.ts`. A separate design pass (Major 12).
- Palantir polish and a full UI redesign.
- Any change that makes Horizon grant settlement, infer approval, or declare execution successful.
- The approve control, until Cognate's resolve path is confirmed in the target repo and identity is verified at the boundary.

## Alternatives Weighed

| Option | For | Against | Verdict |
| --- | --- | --- | --- |
| A. Move capacity and case writes to Cognate now | Matches owner decision in full | Atomicity break, no migration spec, spec version bump, decision logic still in Horizon | Rejected for this run |
| B. Cognate-hosted capacity and case capabilities with dual-run migration | Clean ownership end state | Large, cross-repo, no live verification path here | Deferred to a later change |
| C. Read-only Cognate projection of ledger and cases; Horizon keeps writing | Small, verifiable, honours ownership of projections | Horizon still writes the ledger, so ownership is only partial | Chosen as the interim for case and capacity |
| D. Generic resource framework | Reusable | Exactly the over-abstraction the operator warned about | Rejected |
| E. Consume existing Cognate governance list and resolve | No new contract; live suite covers it | Depends on `cognate-workbench` being the target | Chosen for approval, pending the repo decision |
| F. Add a Horizon-owned approval shape | Quick | Third approval shape; two sources of truth | Rejected |
| G. Keep `PendingApproval` and wrap it in a Cognate envelope for the intent join | Reuses the schema; join lives in Cognate | Needs the wire shape reconciled first | Chosen for the join, after the schema is fixed |

## Key Decisions and Staging

### Answers to the operator's questions

- **Is a Cognate case and capacity capability the smallest coherent change, or a generic framework in disguise?** It is a framework in disguise if built generically. Two concrete capabilities are acceptable in principle, but neither should move in this run.
- **What migration risk exists for `horizon-cases`, `horizon.capacity-ledger`, and pending intents?** Atomicity split (Blocker 3), no spec for the marker or fencing (Blocker 4), v1 suspension (Blocker 4), and in-flight `awaiting_authority` holds with no reclaim (Blocker 2). None of these has a written plan.
- **Can SEA-Forge's `PendingApproval` contract cover the inbox without a third approval shape?** Partly. The inbox fields exist in the schema, but the live row differs (Major 9). The fix is to reconcile the schema with `ApprovalStanding::to_json` and add the Cognate envelope for the intent join. Do not add a Horizon shape.
- **Which work should be cut to make this run verifiable?** Capacity and case writes, the RealityTrace spawn, the availability and gate logic, and any inbox that depends on eligibility before SEA-Forge exposes it. Keep the approval inbox read-only at first.

### Staging

**Step 0: Decisions required before any code (owner).**
1. Which Cognate repo is the target: `cognate-workbench` or `cognate`.
2. The glossary entries for case, capacity, projection, observer-local, settlement, and authority, each with one meaning and the retired meaning named.
3. Who verifies operator identity at the authority boundary: SEA-Forge, or Cognate with an authenticated operator identity.
4. Whether the list row shape in `ApprovalStanding::to_json` is the contract, and whether the schema is updated to match.

**Step 1: Local and testable now (Horizon only).**
- Typed `approvalId` on the commit attempt, removing the regex at `model.ts:741`.
- One-commit terminal accounting and a startup reclaim for `awaiting_authority` holds (`pending-intent.ts:124-127`, `app.ts:626`).
- Replace the raw `authority_approvals` read at `app.ts:913` with a tested projection function.

**Step 2: Read-only approval inbox through Cognate.**
- Render from the Cognate list contract on the operator's behalf. Verify against the installed `sea-forge-server`, which the existing live suite already exercises.
- No approve control yet.
- Rows with null `governance` show "unknown eligibility" with no control.

**Step 3: Resolve, gated.**
- Enable the approve control only after: Cognate exports resolve in the target repo, SEA-Forge or Cognate verifies identity at the boundary, the resolve call carries an expected `decision_id` or `criteria_sha256` so stale approvals are refused, and the live test for a service-actor refusal passes.
- Delete `src/adapters/sea-forge-approvals.ts` only after the Cognate path is green in the live suite.

**Step 4: Case binding index (read-only projection).**
- Store a binding from Horizon `case_ref` to SEA-Forge `case_id`. Keep `case_ref` stable because intents embed it (`navigation.ts:585`).
- Lifecycle stays with SEA-Forge.

**Step 5 (separate change, needs spec version bump): Capacity write move.**
- Requires: a new spec version, the ledger value gets a `contract_version`, reservation and pending-record commit atomically in one store, a dual-run check showing identical balances, writer fencing on the store path, and a rollback that does not depend on reverting the store marker.
- Owner of the payment gate decision moves to Cognate, with allowances owned there.

**Step 6 (separate change): Domain-layer availability and gates.**
- Requires a spec change for REQ-NAV-013 and a design pass on `navigation.ts`, `model.ts`, and `expectation.ts`.

### Rollout and rollback

- Each new path gets a feature flag.
- Rollback for any step must not depend on reverting the store marker written by `contract_version` 2.
- v1 runs suspended on upgrade need a documented recovery procedure before any cutover.

### Verification gates

- Local store tests for atomic terminal accounting and reclaim.
- Live suite run against the installed `sea-forge-server` for the inbox (Step 2) and the refusal path (Step 3).
- Fixture-based tests for `PendingApproval` and the list row shape, plus an in-memory `DurableStore` seam for ledger tests and a fake Cognate socket for the approval client.

### Open risks carried forward

- The 16 skipped live tests and 3 failing Chromium tests on `main` mean the acceptance criteria are not yet executable.
- The `cognate` and `cognate-workbench` repos disagree on whether approval list and resolve are exported. This must be resolved before Step 2.
- The reviewers did not verify live SEA-Forge behaviour of `authority_approvals` or whether Cognate's governance contracts are exposed on a remote boundary. They also did not verify PR #14 state.

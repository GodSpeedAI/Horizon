# SPEC-CR-003: approval gate for external-authority settlement declarations

Status: proposed, revised 2026-11-03 to the design merged in sea-rs. Not applied, not frozen. Blocked on two owner
decisions (F-A, F-B below), an independent ACCEPT, and owner freeze approval.
Source draft: `.agents/reports/2026-11-03-settlement-approval-gate-draft.md`.
Live test runbook: `.agents/reports/2026-11-03-settlement-live-roundtrip-runbook.md`.

## Intent (owner decisions)

1. Gate only settlement declarations that rest on an external settlement authority (SWE_SEED).
2. Approvers are operator-role only. A requester cannot approve its own declaration.
3. Ship through this spec change request.

## Proposed requirement (text for the next spec version)

- REQ-SET-GATE-001 (proposed id, not yet in `requirements/ledger.yaml`): A settlement declaration whose declarer is an
  external settlement authority MUST NOT be committed as settled until an operator-role approval for that exact
  declared content is recorded. Approval binds to the case, the operation, the class, and the hash of the declared
  content. A rejected or expired approval MUST leave no committed settlement. An approved approval MUST be claimed by
  exactly one resume attempt, and that attempt MUST be the only one to append a declaration for it. A local-authority
  declaration is not gated by this requirement.

## How the implemented design meets the requirement

- Class: the settlement class is derived from the verified ingress, not from the request body
  (`derive_settlement_authority_class`, sea-rs `crates/sea-forge-authority/src/cep.rs`).
- Gate: a gated settlement writes a durable `settlement_pending` record, keyed by the bound request hash.
  Re-submitting the same request returns the same record. A changed declared field is a new pending request.
- Policy selector: a `settlement_declaration` rule can name `settlement_authority_class: [external]`. An external
  rule must escalate for approval (`crates/sea-forge-authority/src/lib.rs`).
- Claim: `approved` moves to `resuming:N` through one create-only claim. An approved but unclaimed record refuses
  declarations (`authorization_unclaimed`).
- Failure: a resume that errors after claiming is released if no declaration names it, completed if an authorised
  declaration does, and otherwise left open for reconciliation (sea-rs PR #81). It never declares.
- Verification: every reconciliation, read, resume and promotion path calls `verify_case_declarations`. A declaration
  that is not authorised for its pending record is quarantined with a stable reason code.
- Server path: `submit_swe_seed_declaration` (sea-rs `crates/sea-forge-server/src/delegation.rs`) calls the same gate
  before it appends.

## Evidence (file:line in sea-rs main, 09c2541b)

- Selector: `crates/sea-forge-authority/src/lib.rs` ~1418-1440 (validation) and ~3064 (matcher).
- Server gate call: `crates/sea-forge-server/src/delegation.rs` ~973 (`authorize_settlement_declaration`).
- Caller role: the cognate adapter sends `authority_settle` (`cognate/packages/runtime-bun/src/sea-forge-authority.ts`
  line 406, default actor `service` line 319). The server takes the role from the verified socket identity
  (`sea-rs/crates/sea-forge-server/src/lib.rs` ~2569-2577). Production binds the runtime uid to `cognate-service`
  with role `service` (`scripts/gateway-setup.ts` ~345-347).
- First-match: `crates/sea-forge-authority/src/lib.rs` `matches_rule` is applied in file order. The gate rule must
  precede the existing `settlement` rule (`scripts/gateway-setup.ts` ~433).

## Blockers

### D1. External-only scope (RESOLVED in code)

Was: no policy selector existed for external-only scope. Now the `settlement_authority_class` selector exists
(see Evidence). Still to check: the production `policy.yaml`, which is root-owned and not in the repo.

### D2. SWE_SEED server path bypassed the gate (RESOLVED in code)

Was: the server path appended without a gate. Now `submit_swe_seed_declaration` calls the gate before append.
Still to check: the live round trip shows an external declaration returning awaiting approval.

### D3. Declarer role string (OPEN, UNVERIFIED)

`Declarer.role` for SWE_SEED is `permitted_declarer_roles.first()` from the policy's `settlement_authorities` block
(`delegation.rs` ~895-896). Fixtures use `R-AA` and `operator`. The production value is not in the repo. The gate
decides on the verified socket role and the derived class, not on this string, but the value must be confirmed before
apply.

### F-A. Declaration content is not bound at verification (OPEN, owner decision, security)

`verify_one` authorises a declaration from its copied `authorization_request_sha256` and its id. It does not
recompute `declaration_hash` and does not check the declared content against the approved hash. Promotion reads the
unchained `settlement/declarations.jsonl` view, so a local edit there can change status, weight, tags, or
`qualifies_for_capability`. CodeRabbit raised this as Major on PR #80.

Decision needed: which record is authoritative for promotion. Recommended: the hash-chained case ledger, verified by
payload hash, with the view treated as a cache. This changes the security model, so it needs owner approval.

### F-B. Resume-start reconciliation can fail a concurrent declaration (OPEN, owner decision, stability)

`reconcile_open_settlement_attempts` runs at the start of every resume. For a claimed attempt with no declaration yet,
it records a terminal failed status. A concurrent resume still declaring can then fail, and its declaration is
quarantined and the approval spent. CodeRabbit raised this as Major on PR #80.

Decision needed: (1) reconcile only claims older than a bound larger than the declare timeout (recommended, no new
operator step), or (2) refuse to resume while a claim is open, with reconciliation only in an explicit recovery step.

## Verified vs UNVERIFIED

- VERIFIED in code: the external class is derived at ingress; the selector exists and must escalate; the server
  SWE_SEED path calls the gate; approved-but-unclaimed refuses declarations; a failed resume settles its claim.
- UNVERIFIED: production SWE_SEED declarer role string (D3); the live `policy.yaml` contents; the live round trip
  (not run; see the runbook); concurrent resumes (not tested).

## Required before apply

1. Owner decisions on F-A and F-B.
2. Confirm D3 in production.
3. Independent ACCEPT in `REVIEW.md` from a reviewer independent of the builder.
4. Spec version bump, new SHA-256, plan rebind, and re-freeze through `scripts/freeze-formation.sh` on owner approval.
5. Live round trip (runbook section 6): approve commits, reject does not, a local declaration is not escalated.

## Not changed by this candidate

- No frozen spec, plan, ledger or Wayfinder file is edited. `scripts/freeze-formation.sh` is not run.
- The live `/var/lib/godspeed-sea-forge/policy.yaml` is not touched.
- `scripts/apply-candidate-revision.py` is not run (it is wired to T04-CR-001).
- The `CURRENT_STATUS` (1.1.0) versus Wayfinder (1.2.0) version mismatch is left for the owner.

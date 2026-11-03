# SPEC-CR-003: approval gate for external-authority settlement declarations

Status: proposed, not applied, not frozen. Blocked on D1 (scope selector) and on an independent ACCEPT.
Source draft: `.agents/reports/2026-11-03-settlement-approval-gate-draft.md`.

## Intent (owner decisions)

1. Gate only settlement declarations that rest on an external settlement authority (SWE_SEED).
2. Approvers are operator-role only. A requester cannot approve its own declaration (SEA-Forge refuses self-approval).
3. Ship through this spec change request.

## Proposed requirement (text for the next spec version)

- REQ-SET-GATE-001 (proposed id, not yet in `requirements/ledger.yaml`): A settlement declaration whose
  declarer is an external settlement authority MUST NOT commit until an operator-role approval resolution
  for that declaration is recorded. A rejected or expired approval MUST leave no committed settlement.
  A local-authority declaration (strength `local`) is not gated by this requirement.

The requirement text is a proposal. It is not valid until D1 names how the external/local split is enforced.

## What the evidence shows (file:line)

- Gate placement: `scripts/gateway-setup.ts` line 433 holds the existing `settlement` rule
  (`actor_role: service`, `operation_kind: settlement_declaration`). The renderer is `renderPolicyYaml` (line 418).
- First-match: `crates/sea-forge-authority/src/lib.rs` `matches_rule` (~2823) is applied in file order.
- Escalate: `requires_approval: true` yields Escalate (existing tests, lib.rs ~3725-3758).
- Caller role: the cognate adapter sends `authority_settle` (`cognate/packages/runtime-bun/src/sea-forge-authority.ts`
  line 406, default actor `service` line 319). The server takes the role from the verified socket identity
  (`sea-rs/crates/sea-forge-server/src/lib.rs` ~2569-2577). Production binds the runtime uid to `cognate-service`
  with role `service` (`scripts/gateway-setup.ts` ~345-347).
- Settle gate: `sea-rs/crates/sea-forge-authority/src/cep.rs` line 1702 calls `gate(..., "settlement_declaration", ...)`.
  The gate passes only `operation_id` and `surface` as parameters (cep.rs ~1466-1480).

## Blockers

### D1. External-only scope is not expressible by policy (BLOCKING)

- No selector exists for `settlement_declaration`. The Reserved arm of `matches_rule` falls back to `true`
  (lib.rs, `_ => true`). `resources` is rejected for every kind except `cognate_action` / `cognate_capability`
  (lib.rs ~1356-1366). `PolicyRule` denies unknown fields.
- So the rule in `CANDIDATE.yaml` gates ALL service-role settlement declarations, local included.
- Options for the owner:
  - (a) sea-rs code: add the authority reference to the gate parameters and a matching arm in `matches_rule`.
  - (b) sea-rs code: a distinct actor role or identity for the external adapter (`ActorRole`,
    `sea-forge-core/src/types.rs` ~355).
  - (c) accept gating every service-role settlement declaration.
- Options (a) and (b) change sea-rs and need their own tests and review. They are not policy-only.

### D2. SWE_SEED server path bypasses the gate (OPEN)

- `sea-rs/crates/sea-forge-server/src/delegation.rs` `submit_swe_seed_declaration` (~879-967) calls
  `swe_seed_reconciliation::append_and_reconcile_swe_seed_declaration` (line 77), which calls
  `sea_forge_settlement::append_declaration_ledgered_once` (`declaration.rs` ~65-90). No authority gate runs on
  that path. A cep policy rule cannot gate it.
- Whether this path is live in production is UNVERIFIED. The production `policy.yaml` is root-owned and is not
  in the repo.

### D3. Declarer role string (UNVERIFIED)

- The `Declarer.role` for SWE_SEED is `permitted_declarer_roles.first()` from the policy's `settlement_authorities`
  block (`delegation.rs` ~895-896). Fixtures use `R-AA` and `operator`. The production value is not in the repo.
  It is a free string, not the `ActorRole` used by the gate.

## Verified vs UNVERIFIED

- VERIFIED: caller role `service` for the cognate settle path; first-match; `requires_approval` yields Escalate;
  no external selector exists for settlement_declaration; the SWE_SEED path skips the gate.
- UNVERIFIED: production SWE_SEED declarer role string; whether the SWE_SEED server path runs in production; the
  live `policy.yaml` contents.

## Required before apply

1. Owner decision on D1 (a, b or c). If a or b, sea-rs change with tests and its own review.
2. Decision on D2 (is the SWE_SEED server path live? If yes, the gate must be added in code there).
3. Independent ACCEPT in `REVIEW.md` from a reviewer independent of the builder.
4. Spec version bump, new SHA-256, plan rebind, and re-freeze through `scripts/freeze-formation.sh` on owner approval.
5. Live round trip (draft section 6b): approve commits, reject does not, local is not escalated.

## Not changed by this candidate

- No frozen spec, plan, ledger or Wayfinder file is edited. `scripts/freeze-formation.sh` is not run.
- The live `/var/lib/godspeed-sea-forge/policy.yaml` is not touched.
- `scripts/apply-candidate-revision.py` is not run (it is wired to T04-CR-001).

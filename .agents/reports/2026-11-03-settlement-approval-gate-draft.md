# DRAFT: approval gate for external-authority settlement_declaration

Status: DRAFT for owner review. Not applied, not frozen, not committed.
Date: 2026-11-03 (prepared 2026-11-02 session)
Worktree prepared (no edits): /home/sprime01/projects/sea-rs-settlement-gate (branch `settlement-approval-gate`, from origin/main 11efa4b1).

## 1. Problem statement

`settlement_declaration` records are currently allowed without human approval. The production policy
rendered by `scripts/gateway-setup.ts` (function `renderPolicyYaml`, line ~433) contains:

```yaml
  - { name: settlement, verdict: allow, actor_role: service, operation_kind: settlement_declaration }
```

A declaration that rests on an external settlement authority (the SWE_SEED transport in sea-rs, see
`crates/sea-forge-settlement/src/declaration.rs` `SettlementAuthority` / SWE_SEED transport, and
`crates/sea-forge-server/src/swe_seed_reconciliation.rs`) therefore commits without an operator decision.
The owner wants those declarations to stop at Escalate until approved.

The approval mechanism already exists in SEA-Forge (`requires_approval: true` produces Escalate, see section 3).
The gap is only the policy rule and its placement.

## 2. Proposed rule (exact YAML, with placement)

Insert the gated rule IMMEDIATELY BEFORE the existing `settlement` rule. Evaluation is first-match in file order,
so an ungated rule placed earlier would win and the gate would never fire.

```yaml
  - name: settlement-approval-gate
    verdict: allow
    requires_approval: true
    actor_role: service
    operation_kind: settlement_declaration
  - { name: settlement, verdict: allow, actor_role: service, operation_kind: settlement_declaration }
```

Where it goes:
- `scripts/gateway-setup.ts` `renderPolicyYaml` (line ~433): the production gateway policy. Rendered once and placed as
  root-owned `/var/lib/godspeed-sea-forge/policy.yaml` (runbook `docs/gateway-runbook.md` line ~171, ~190).
- `scripts/ignite.ts` (line ~125): the cell policy. It already has a precedent: the `--approve-commits` flag inserts
  `requires_approval: true` into the `navigation-commit` rule. The same pattern can be used for a flag.

CAVEAT (UNRESOLVED, see open decision D1): this rule matches ALL `settlement_declaration` actions whose actor role is
`service`. It does not by itself distinguish external-authority from local-authority declarations. Narrowing to external
only needs either (a) a distinct actor role for the external adapter, or (b) a rule selector on the action's resource
or authority. Neither was verified in code. Do not ship the rule as-is without resolving D1.

## 3. How the gate works (verified in code)

- `crates/sea-forge-authority/src/lib.rs` ~line 2398: the rule is chosen with
  `self.bundle.rules.iter().find(|r| ... matches_rule(r, actor, action) ...)`. This is FIRST MATCH in file order.
  `matches_rule` (line ~3080) requires equal `actor_role` and `operation_kind`, plus sandbox and path/resource checks.
- `lib.rs` ~line 2446-2450: `effective_verdict` is `Deny` if the role lacks permission, else `Escalate` if
  `rule.requires_approval.unwrap_or(false)` OR any SoD rule matches, else `rule.verdict`.
- Escalate path adds `require-human-approval` and `approval-role:<role>` obligations (lines ~2456-2470).
- Existing tests that confirm this: `lib.rs` ~3725-3758 (`requires_approval: true` rule -> `Verdict::Escalate`) and
  ~4301-4311 (`approved-write` rule with `requires_approval: true` -> Escalate).

Answer to "does a `requires_approval: true` rule placed first produce Escalate for a matching action": YES, for an
action whose actor role and operation kind match and whose permission check passes. A non-matching action falls through
to the next rule.

## 4. Which declarations are gated and which are not

| Declaration | Gated? | Basis |
|---|---|---|
| External authority (SWE_SEED transport, `swe_seed_*` authority refs) | YES, intended | Owner request |
| Local settlement authority (`LocalSettlementAuthority`, strength `local`) | NO, intended | Owner request. Currently NOT separable by the rule in section 2 (see D1) |
| `evidence_mutation`, `approval_resolution`, `cognate_*` rules | NO | Not touched |
| Operator-role settlement actions | NO | Rule is actor_role `service` only |

## 5. What is NOT changed

- No spec, plan, or ledger file is edited. HORIZON-001 v1.1.0 (frozen 2026-10-23) and its ledger/plan/policy freeze are untouched.
- No freeze script is run. `scripts/freeze-formation.sh` is not executed.
- The live `/var/lib/godspeed-sea-forge/policy.yaml` is not edited (root-owned; no sudo or chown was used).
- No systemctl restart. The gateway rereads policy on every decision (per the rendered policy comment), so a placed file takes effect without restart.
- The `settlement` rule itself stays in place as the fallback for non-gated cases.
- sea-rs `main` checkout and other worktrees are not touched.

## 6. Verification plan

### 6a. Automated tests (to add)

sea-rs, `crates/sea-forge-authority/tests/cep_settlement.rs` (or `lib.rs` tests module near line 3700):
- `settlement_declaration_gate_escalates_before_allow_rule`: gated rule first, service actor, settlement_declaration -> `Verdict::Escalate`, obligation `require-human-approval`.
- `settlement_declaration_ungated_rule_shadows_gate`: plain `settlement` rule first -> `Verdict::Allow` (documents first-match hazard).
- `settlement_declaration_gate_escalate_then_approve_commits`: approval resolution by operator role -> declaration commits.
- `settlement_declaration_gate_reject_does_not_commit`: rejection -> no ledger commit.
- `settlement_declaration_local_authority_not_escalated` (only after D1 is resolved).

Horizon, `scripts/gateway-setup.ts`:
- Unit check that `renderPolicyYaml` output places `settlement-approval-gate` before `settlement` (string-order check).

Run in sea-rs worktree: `cargo test -p sea-forge-authority` (and the settlement crate). Existing `scripts/check-*` gates as applicable.

### 6b. Live approve/reject round trip (owner-run, needs root for placement)

1. Back up current `/var/lib/godspeed-sea-forge/policy.yaml` to a location outside the repo (runbook line ~223 says back up before removing state).
2. Owner places the new policy (root). Verify with the gateway status.
3. Submit one external-authority settlement declaration through the runtime path.
4. Confirm it is Escalate: an approval request appears (runbook: `/workspace/approvals` lists pending approvals, returns 200 per runbook line ~231).
5. APPROVE as operator: declaration commits; ledger shows the commit with the approval reference.
6. Repeat with a second declaration and REJECT: no commit; denial recorded.
7. Confirm a local-authority declaration (if D1 resolved) is not escalated.

Note: the runbook (line ~232) says the live approve/reject round trip has NOT yet been done. This plan is the first run.

### 6c. Rollback

- Restore the backed-up policy.yaml (root). Gateway rereads on next decision; no restart needed.
- Pending approval requests created while the gate was active: reject or let expire, and record in CURRENT_STATUS.
- Revert the commit in the renderer and re-render if the policy is regenerated.

## 7. Open decisions for the owner

- D1. Scope: gate ALL service-role `settlement_declaration` (simple, current rule), or ONLY external-authority ones
  (requires a distinct actor role or a selector; not verified in code)? Which do you want?
- D2. Governance route: is this a policy-only change (gateway-setup renderer + ignite template), or does it need a spec
  change request for HORIZON-001 (next SPEC-CR number, candidate under `.agents/candidates/horizon/`, independent review,
  then freeze)? The freeze process is in Horizon (`scripts/freeze-formation.sh`, `scripts/check-ledger-freeze.sh`,
  `scripts/apply-candidate-revision.py`). sea-rs has no freeze-formation.sh.
- D3. Approver role: should the approval be `operator` only, or also an SoD approver role (`approval-role:` obligation)?
- D4. Approval TTL and what happens on expiry (deny vs leave pending).
- D5. Actor role of the external adapter caller: UNVERIFIED (see section 8). Confirm before D1 is decided.
- D6. Timing: apply before or after the next SWE_SEED reconciliation run, and who places the root-owned policy file.

## 8. Verified vs UNVERIFIED

- VERIFIED: first-match rule selection; requires_approval -> Escalate; sea-rs has no freeze-formation.sh; policy renderer and
  its settlement rule location in `scripts/gateway-setup.ts` line ~433; `scripts/ignite.ts` approve precedent.
- UNVERIFIED: the actor role used by the external SWE_SEED adapter when it calls the settlement gate in production. The
  only role seen is the test fixture `Declarer { actor_id: "swe_seed_verifier", role: "R-AA" }` in
  `crates/sea-forge-settlement/src/declaration.rs` (~line 739) and `crates/sea-forge-server/src/swe_seed_reconciliation.rs`
  (~line 344). That `role` field is a free string, not the `ActorRole` enum (`service`, `operator`, ...). The production
  caller's `Actor.role` must be checked in `crates/sea-forge-server/src/lib.rs` (Actor constructions ~lines 2645-2800) and
  `crates/sea-forge-server/src/swe_seed_reconciliation.rs` (`append_and_reconcile_swe_seed_declaration` caller).
- NOT VERIFIED: whether `matches_rule` supports a resource or authority selector for `settlement_declaration` (affects D1).
- NOT FOUND: any production-form `policy.yaml` in sea-rs. Only fixtures exist (`fixtures/cells/e2e/policy.yaml`,
  `fixtures/cells/repair-agent/openshell/policy.yaml`, `.tmp/task17-crash/policy.yaml`). Production form is rendered by
  Horizon `scripts/gateway-setup.ts` and placed root-owned at `/var/lib/godspeed-sea-forge/policy.yaml`.

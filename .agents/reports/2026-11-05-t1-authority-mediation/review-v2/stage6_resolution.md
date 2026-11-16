# Goldfish Annotated Review Report — Stage 6 (v3 → v4)

Status: resolved
**Target:** `design_draft.md` v3 (lines 1-186) · Findings: `comprehension_report.md`
Mode: operator-directed autonomous run ⇒ PROPOSE FIX items applied. No contests (EGM rule: do not contest a comprehension gap).

| # | Sev | Finding | Disposition | Verification / edit |
| --- | --- | --- | --- | --- |
| 1 | Major | Adapter's config/identity guards have no home | PROPOSE FIX | Verified `sea-forge-approvals.ts:14-79` holds `approvalAuthorityFromEnv`, `approvalAuthority`, `ACTOR_ID`, `seaForgeActorOf`. D4 moves them unchanged, with their tests, to socket-free `src/adapters/sea-forge-config.ts`; only the socket code is deleted. That is where the `18f0c40` behaviour lives |
| 2 | Major | What validates an untrusted `approvalId` | PROPOSE FIX | Verified that Horizon `APPROVAL_ID` (line 15) and Workbench `validateResolve` (line 95) use the same regex `^[A-Za-z0-9_.:-]{1,200}$`. SDK `resolveApproval` validates the id and the resolution before sending; Workbench keeps `validateResolve` for its messages |
| 3 | Major | No standing contract; "vice versa" path missing | PROPOSE FIX | Verified that no `ApprovalStanding` schema exists in `contracts/schema`; the struct is at `cep.rs:718`. Goal 2 names both contracts. The negative row is rewritten to testable paths: case-task row → `excluded`; case-task id through `resolveApproval` → typed refusal |
| 4 | Major | Rollback logic incoherent | PROPOSE FIX | Verified that `v0.3.0` already has `AuthorityApproval`, `AuthorityApprovals` and `AuthorityClosure`. Rollback rewritten as two independent layers (gateway redeploy of v0.3.0; front PR revert), with no source revert and no unpublishing. The Recovery row becomes a cross-version matrix with real binaries |
| 5 | Major | Workbench commit scope and "updated together" ambiguous | PROPOSE FIX | Scope: `src/`, `package.json`, lockfile. Names and guards stated as unchanged |
| 6 | Major | PR and commit history assumed | PROPOSE FIX | "History referenced" table added (titles from `evidence/phase-a/raw`). "Freeze" explained as step-4 release contents |
| 7 | Major | D-N2 bar unstated | PROPOSE FIX | Bar stated in Vocabulary (T2), from `04-adjudication-remaining.md:54` |
| 8 | Major | Undefined terms | PROPOSE FIX | Vocabulary table: gateway, installer, RealityTrace/SXR, casework-go (`apps/godspeed-casework-go`), linked-versions, CEP, teeth, `approvalState`. Inline: `carry`, envelope-coupled, drift check (`conformance_sfwp.rs` + `justfile`), Gauntlet, label. "Facade policy" replaced by its plain meaning (no new package or entry point) |
| 9 | Nit | `caller` name clash | PROPOSE FIX | Renamed `requestIdPrefix` |
| 10 | Nit | `listApprovals` sentence | PROPOSE FIX | Rewritten |
| 11 | Nit | `onBehalfOf` shape | PROPOSE FIX | `SeaForgeActor = {actor_id, role}` stated |
| 12 | Nit | Two "only changes" | PROPOSE FIX | Audience named in each ("for operators", "for SFWP clients") |
| 13 | Nit | `teeth-t01` numbering | PROPOSE FIX | Verified that the `scripts/teeth-t05…t10` series is the task series. Renamed `teeth-inv2-mutation.ts` |
| 14 | Nit | `app.ts:1011` purpose | PROPOSE FIX | Described as the REQ-NAV-010 `steering_attention` count |

Additional owner input during the stage (2026-11-05): the agent is authorized to run the live roundtrip and the gateway deploy; only steps that need `sudo` go to the owner, as exact commands. Recorded in D2.5 and R5.

**Counts:** 14 accepted, 0 contested, 0 escalated, 0 declined.

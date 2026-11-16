# T1 · Authority Mediation — Design (RESOLVED v2)

* **Date:** 2026-11-05 · **Status:** RESOLVED — full independent five-stage review complete (`review/stage-reports.md`), all findings dispositioned (`RESOLUTION.md`); implementation not authorized/started
* **Input:** concepts brief v4 + adjudication record (owner-resolved D-N1/D-N2/D-N3 + seven directions)
* **Supersedes:** v1 (same file history); changes are marked *Δ* at each site where a review finding altered the design

## The Problem

Two shipping product fronts (Cognate Workbench — the first dogfood product per owner direction — and Horizon) each hand-roll a private SEA-Forge socket client, and both copies lack hardening the Cognate SDK's `SeaForgeAuthority` already has (busy-retry backoff, 256 KB response cap). Three raw socket call sites exist in Horizon app code beyond its adapter (`src/app.ts:776`, `src/app.ts:1011`, `src/adapters/delegating-authority.ts:27`), so Horizon's invariant INV-2 ("all authority I/O goes through the Cognate-mediated client") is aspirational. SEA-Forge exposes two different approval concepts under one name: the **escalation standing** (`ApprovalStanding` — the record that an authority decision is waiting for or has received a human resolution) and the **case-plan human task** (`sfwp PendingApproval` — a person-action item created with a case plan, carrying its own `criteria_sha256`). Consumers disentangle them by folklore. Owner adjudication: one typed hardened client, both fronts on it, concepts renamed apart, staged boundary enforcement, everything by subtraction.

## Overview

One release train makes the Cognate SDK the single owner of SEA-Forge mediation. Workbench and Horizon adopt it and delete their hand-rolled clients; sea-rs lands the schema-contract rename-apart, moves generated contracts to a server-owned home, and cuts 0.4.0; the protected gateway deploys it; Horizon de-vendors Cognate and gains boundary teeth with one named, dated exception. Operator-visible changes are exactly two, both honest: preflight authority renders "decided at invocation" per frozen spec REQ-NAV-006, and resolve now carries the operator reference the server requires. Identity unification is out of scope (T2, bar pre-agreed D-N2).

*Δ (S6-M3)* — v1 claimed "operator-visible behavior does not change except preflight"; v2 states the two changes plainly.

## Goals

1. **One authority client.** `SeaForgeAuthority` is the only SFWP client code in any product front; its `exchange` hardening applies to every approval/closure call.
2. **One wire vocabulary.** The two concepts are renamed apart with one live wire contract each; generated SFWP schemas live in a server-owned `contracts/` home, including sea-rs's own workbench contract copies. *Δ (S8-W1)*
3. **Enforceable mediation boundary, staged.** Horizon teeth fail on any SFWP socket code outside the SDK path (static scan; `scripts/`+`test/` fixture allowlist; mutation-validated per the existing `teeth-tNN-mutation.ts` pattern). Exceptions file initially holds **one** entry: `delegating-authority.ts` (session-operator decide path), dated, closing in T2. *Δ (S6-B1: v1's file listed two sites it also claimed to re-home)*
4. **Subtraction.** Both hand-rolled clients deleted; all three Horizon raw call sites re-homed except the one exception; the approval-id regex replaced by the typed record field; vendored tgz replaced by exact registry `0.9.0` pins — with one explicit exception (`@godspeed/identity` 0.1.0, not in cognate's linked-versions group; T2 owns it). *Δ (S9: identity pin; S7-M4: third site)*
5. **Evidence first and at the tag.** The live roundtrip runbook (`Horizon/docs/gateway-runbook.md`) executes at current heads **before** the train opens, and again at the 0.4.0 tag after gateway deployment, as the standing correctness+recovery+release artifact. The SWE_SEED native-candidate workflow is triggered and its green run + SHA256SUMS recorded as dogfood-packaging evidence. *Δ (S5-Major 2/1)*

## Non-Goals

Identity unification (T2) · SFWP evaluate-only authority verb (post-v1; REQ-NAV-006 already defines the honest state) · client-side approval-content view-binding (descoped — see The Problem note below and RESOLUTION R-A) · capacity/case write-moves · Gauntlet/SWE_SEED architecture (the packaging-green rider in Goal 5 is evidence, not architecture) · estate-wide test infrastructure · Horizon session runtime · CEP hashing · install profiles (owned by no transformation yet — escalated E-2).

*Δ (S7-M1)* — v1's `expectedCriteriaSha256` field is removed: the escalation standing has no server-side criteria referent (`cep.rs:711-741`), and merged #79 (`652ed710`) already binds approval to the exact pending operation server-side, refusing content that differs. Stale-approval protection is therefore **existing server behavior**, now exercised through the typed client and asserted by test — not a new client field that a pre-0.4.0 server would silently drop.

## Technical Plan

### D1 · SDK: complete the mediation surface (cognate → 0.9.0)
- `SeaForgeAuthority` gains, over the existing `exchange` (busy-retry + 256 KB cap inherited):
  - `listApprovals({actor?})` — typed escalation-standing rows; optional actor mirroring the two callers' current behavior (Horizon passes the operator reference, Workbench the server default). *Δ (S9)*
  - `resolveApproval({approvalId, resolution, onBehalfOf?})` — `onBehalfOf` carries the operator principal reference; required wherever the caller is not the service actor (both current callers). Pre-T2 it is a configured reference; T2 upgrades it to a verified credential — the staged boundary the owner chose. *Δ (S7-B1, Blocker)*
  - `authorityClosure(...)` — typed verb covering the existing `authority_closure` method's semantics (result `{b, c, committed_at, on_time}`); serves both the `app.ts:776` write-usage and any read. *Δ (renamed from `readAuthorityClosure`; S6-B1/S8)*
- **Request ids:** unified **only for the three new verbs** — minted at construction as `<caller>:<op>:<uuid>`, reused across busy-retries (idempotency per logical operation), caller fixed via a constructor option. Explicitly exempt and unchanged: `submitEvidence`'s content-derived replay-dedup id and `decide`'s envelope-coupled id (SF-006 correlation). *Δ (S7-M2: v1 moved all id generation; that breaks evidence replay dedup)*
- No new fields on existing verbs; new verbs only (server additive-safety covers unknown verbs). Export: existing `runtime-bun` `SeaForgeAuthority` extended in place (facade policy preserved).
- Version **0.9.0** (release-please linked group publishes the set; one PR, split only if review of the diff demands).

### D2 · sea-rs: the 0.4.0 train (re-decomposed, S9)
0. **Stage 0 (before any T1 PR):** roundtrip runbook at current heads (Goal 5); PR #84 merged independently with its two CodeRabbit Majors fixed in-branch. *Δ (S5-Major 2/3)*
1. Contracts home move: `gen_sfwp_schema.rs` output → top-level `sea-rs/contracts/schema/` (byte-stable-provable; drift test re-pointed) — mechanical PR.
2. Rename-apart: sfwp `PendingApproval` → **`CaseTaskApproval`** (Rust type + schema title/filename + docs); `ApprovalStanding` unchanged; sea-rs's own `workbench/packages/contracts/*` regenerated in the same PR; casework-go in-repo adapters updated. **Wire compatibility: JSON bytes are identical across 0.4.0** (named-field JSON, no discriminator) — pre-0.4.0 consumers are unaffected; the churn is schema title/filename and in-repo names only. *Δ (S6-M2/S8: renderer contracts; explicit compat sentence)*
3. Approval-gate lineage disposition — **forced step before freeze**: commit-map the `settlement-approval-gate` branch (25 files, ~4,280 insertions, base pre-#81): each commit → landed-elsewhere (e.g. `dcaf3049` content landed via #79) / unique-content candidate (`cfb16c18` CLI approve/resume of settlement pendings — lands as its own small PR **iff** the Stage 0 or tag roundtrip needs it) / drop. *Δ (S7/S9: supersession was asserted, not proven)*
4. Release: rebase/regenerate PR #74 → cut **0.4.0** (no T1-foreign content; #84 already landed separately). *Δ (S5-Major 3)*
5. **Deploy 0.4.0 to the protected gateway** (owner-run per runbook; `just gateway-stage` → installer → restart) — explicit train step, before any front sends new-verb calls; rollback = gateway-to-0.3.x and adapter-restoration as one documented sequence. *Δ (S8-Blocker/S7-M3)*

### D3 · Workbench adoption (first product; PRs cut from `main`, commit-only-src; dirty evidence untouched)
- `src/capabilities/governance.ts`: delete `seaForgeCall`; `governance.approvals.list`/`governance.approval.resolve` re-implemented over the SDK client — capability names, actor checks, and the `src/capabilities/README.md` export documentation all updated together. *Δ (S7: README documents the export)*
- Delete hand-rolled `RealityTraceCli` (`src/settlement/realitytrace.ts`); adopt SDK `createSxrCliPort` (env contract identical).
- Registry pins → exact cognate `0.9.0`.

### D4 · Horizon adoption (bases on post-#15-resolution main; #14 state re-verified at train time — *Δ (S9: stale Q3)*)
- Delete `src/adapters/sea-forge-approvals.ts`; rewire its five importing test files (`J02-live`, `J02r2-live`, `approval-inbox`, `remote-sessions`, `gateway-setup`) to the typed client in the same PR; `gateway-setup.ts`'s `seaForgeActorOf` re-pointed. The typed `approvalId` field (already on the branch) becomes the only approval-id source; the `ACTOR_ID`/`APPROVAL_ID` regexes die with the adapter. *Δ (S9: five test files)*
- Re-home `app.ts:776` → `authorityClosure`, `app.ts:1011` → `listApprovals` (operator actor). `delegating-authority.ts` = the single named exception (Goal 3), closed in T2.
- De-vendor per Goal 4 (one commit; clean-install CI check).
- Teeth per Goal 3; exceptions file `docs/inv2-exceptions.md` (one entry, dated, closing condition = T2).
- Preflight: authority gate renders **"authority: decided at invocation"** + applicable policy summary — correcting the deviation from frozen REQ-NAV-006 (`horizon.agent.spec.yaml:725`), not a UI preference.

### D5 · Sequencing
Stage 0 (evidence + #84) → sea-rs PRs 1-4 → 0.4.0 → gateway deploy → cognate 0.9.0 → Workbench adoption → Horizon adoption (+ teeth + label) → roundtrip re-run at tag + SWE_SEED green run recorded. Mixed-state windows are safe by design and named: post-0.4.0/pre-adoption (wire identical), post-Workbench/pre-Horizon (id scheme divergence in correlation logs only), and the formerly-undefined new-client/pre-0.4.0-server window is eliminated by ordering (deploy before adoption) plus the no-new-fields rule. *Δ (S8 window map)*

## Verification & Acceptance (every row stranger-writable; repo-local suites only)

| Category | Requirement — acceptance = all named suites green + artifacts in this folder's `evidence/` |
| --- | --- |
| Correctness | SDK parity suite: extends `packages/runtime-bun/test/sea-forge-authority.test.ts` with a named scripted-socket fixture harness (`test/helpers/sfwp-fixture-socket.ts`, new) covering each new verb's envelope, id reuse-across-retry, error mapping; Horizon `test/J02-live.test.ts` green with the adapter deleted (owner-opt-in env `SEA_FORGE_SERVER_BIN`; recorded run required, not CI-skip silence); Workbench capability tests green with rewired implementation |
| Negative states | Fixture matrix for both concepts in the SDK parity suite: expired standing refused; case-task read as standing and vice versa → typed refusal; malformed row omitted from `listApprovals` output with an `excluded` count field on the result (testable property, replacing v1's "not faked"); unreachable; denied; no-match |
| Adversarial | Replay against the typed client: self-approval refused (sea-rs requester≠resolver), unknown-identity self-approval refused (Horizon commit `18f0c40` behavior), stale approval refused (sea-rs #79 content binding) — each case asserts the typed error, not prose; teeth mutation script (`scripts/teeth-t01-mutation.ts`, new, pattern of `teeth-t05/t06/t07`) breaks one protected property at a time and must fail |
| Regression | sea-rs workspace + `tests/conformance_sfwp.rs` (incl. re-pointed generated-schema drift test); cognate substrate + harness suites; Workbench tranche suites + smoke; Horizon full suite at its branch baseline — each at its recorded green state |
| Integration | Roundtrip runbook executed twice: at heads (Stage 0) and at the 0.4.0 tag post-deployment; pass = recorded approve/reject/resume with the operator actor recorded by SEA-Forge; prerequisites named (build at tag → `just gateway-stage` → owner installer → restart) |
| Recovery | Rollback **executed in a scratch clone** (not merely documented): 0.4.0 revert + adapter-restoration commit identified per front; restart-resume and terminal-accounting tests green (commit `087fecc` behavior preserved) |
| Performance | Non-goal: no new claims. Existing `exchange` hardening asserted by the existing `sea-forge-busy.test.ts` (already green today) — deletion of the unhardened copies is provably a strict improvement |
| Release evidence | Tags `sea-forge v0.4.0`, `cognate v0.9.0` with SHA256SUMS/attestation per existing packaging flows; CHANGELOGs; SWE_SEED `native-candidate.yml` green run + SHA256SUMS recorded; `evidence/` holds runbook outputs, suite logs, tag digests |

## Alternatives Considered

| Alternative | Why rejected |
| --- | --- |
| Raw `seaForgeCall` SDK export (v1-of-record M-1) | Perpetuates unhardened arbitrary-verb copies; typed methods keep hardening in one place |
| Overwrite `PendingApproval.schema.json` to match `ApprovalStanding` (v1-of-record M-2) | Erases the live case-task concept casework-go consumes (two generators, two subsystems — verified) |
| Client-side `expectedCriteriaSha256` view-binding (v1 D1) | No server-side referent on the escalation path; #79 already binds content server-side; silent-drop risk on old servers — descoped (R-A) |
| Move all request-id generation into `exchange` (v1 D1) | Breaks content-derived replay dedup and envelope-coupled ids; scoped to new verbs instead |
| Strict INV-2 immediately | `delegating-authority.ts` genuinely needs its decide path until T2's capability; staged with one dated exception is the honest form (owner direction 3) |
| Include identity in this release | L-size risk implicating frozen spec 1.2.0; owner adjudicated D-N1: split |
| Land PR #84 inside the 0.4.0 train (v1 D2) | Unrelated actively-iterating settlement work; decoupled to its own reviewed merge |
| Feature flags per front | Client is additive; flags would preserve the duplicated paths this transformation deletes |
| Refresh vendored tarballs | Vendor set already rotting (0.7.0 + 0.8.0 mixed); registry pins are the subtraction |

## Risks and Open Items

- **R1 · cognate group publish stall** — 0.9.0 releases ~45 linked packages; one publish failure stalls Horizon's pin sweep. Mitigation: verify release.yml run immediately after tag; pin sweep waits for full group.
- **R2 · Workbench is product #1** — its adoption is critical-path; slippage delays the dogfood claim, not the SDK release.
- **R3 · rename consumer hygiene** — casework-go + sea-rs-internal contracts updated same-PR; verified no external schema-fetch mechanism exists.
- **E-1 (owner)** — name the code reviewer for #84 and the T1 PRs (design review is complete; code review needs a named second party).
- **E-2 (owner)** — sequence install profiles (T3 candidate) vs T2 identity; both on the dogfood critical path; T1 unblocks neither fully.
- **E-3 (owner)** — authorization to implement T1 v2.

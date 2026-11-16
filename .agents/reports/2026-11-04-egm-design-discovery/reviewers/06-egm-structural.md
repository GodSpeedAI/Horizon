# Goldfish Review — egm-structural lens (raw, as returned)

Fresh-context reviewer, dispatched 2026-11-04 per `egm-brainstorm` Step 2. Unedited except for this header.

---

## A. Findings

**BLOCKER A-1. M-2 would erase a second approval concept the hypothesis never noticed.** `PendingApproval.schema.json` is not a stale copy of `ApprovalStanding` — it is *generated* from a different server subsystem: `sea_forge_server::sfwp::approvals::PendingApproval` (generator: `sea-rs/crates/sea-forge-server/src/bin/gen_sfwp_schema.rs:12-20`), while `ApprovalStanding` lives in the *authority* crate (`sea-rs/crates/sea-forge-authority/src/cep.rs:727`). These are two server concepts — authority-escalation standing vs case-plan human task — with overlapping names. "Three approval shapes" is actually **two concepts plus one real wire bug**. M-2 as written ("ApprovalStanding::to_json is the contract; fix PendingApproval.schema.json to match") would silently delete the case-task approval that `apps/godspeed-casework-go` consumes today. The owner must first decide: one concept or two.

**BLOCKER A-2. R-1 is coupled to a live contract home.** `sea-rs/workbench/packages/contracts` (the SFWP schema export) is generated from the server and consumed by casework-go (`apps/godspeed-casework-go/internal/adapters/sfwp/authority.go` et al.). Deleting `workbench/` per R-1 deletes the schema home. Also, R-1 names `godspeed-cognitive-ui` for retirement but not `casework-go`, which is its live backend (`cognitive-ui` README: "Live (the production path)... over the Go casework service") — retiring one half of a pair is incoherent. R-1's "check before deleting" caveat concedes the problem without resolving it; the resolution is: move the contracts generation output to a sea-rs top-level `contracts/` owned by the server crate, then delete renderer, then decide the cognitive-ui/casework pair *as a pair*.

**MAJOR A-3. The identity fork already happened; the hypothesis's clock is wrong.** T-9 says the identity layer is "about to fork." It has forked: Horizon shipped `src/remote/{webauthn,pairing,cbor}.ts` (spec 1.2.0, REQ-SEC-006) while the stranded `cognate` branch `horizon/shared-identity` @ f4d4db6 carries `packages/identity/` with the *same file-level concepts* (`webauthn.ts, pairing.ts, cbor.ts, challenges.ts, posture.ts, service.ts`, 1,463 lines, tested). M-1's "land the branch" now costs more than stated: someone must reconcile three implementations (Horizon's shipped, Workbench's single-operator authenticator, and the SDK's unpushed), and the loser is Horizon's already-frozen spec 1.2.0 contract.

**MAJOR A-4. M-1 is right but aimed at the wrong export.** The hypothesis says "export `seaForgeCall` from the SDK." The SDK already ships `SeaForgeAuthority` (`cognate/packages/runtime-bun/src/sea-forge-authority.ts:313`) with `decide/requestWorldTransition/listTransitions/submitEvidence/settle/approvalState`, over an internal `exchange` that has **busy-retry backoff and a 256 KB response cap** — both *absent* from the two hand-rolled `seaForgeCall` copies (Horizon `src/adapters/sea-forge-approvals.ts:110`, Workbench `src/capabilities/governance.ts:56`). The duplication is not just aesthetic; the copies are *less hardened* than the code they duplicate. The right move is two added methods (`listApprovals`, `resolveApproval`) on `SeaForgeAuthority`, not a raw `seaForgeCall` export that would invite a fourth unhardened copy.

**MAJOR A-5. Undisclosed duplication: two RealityTrace CLI clients.** Workbench hand-rolls `RealityTraceCli` + the `COGNATE_REALITYTRACE_BIN/_DATA_HOME/_STATE_HOME` env contract (`src/settlement/realitytrace.ts:14-30`) while the SDK exports `createSxrCliPort` from `@godspeedai/cognate-realitytrace` (`packages/realitytrace/src/index.ts:141`) — which Horizon's `src/adtlement/settlement.ts` already uses, with the *same env names*. The env contract exists in three places, the client in two. The hypothesis's duplication ledger misses this entirely. [Transcription note by Elephant: the reviewer's path typo "`src/adtlement/settlement.ts`" refers to `src/adapters/settlement.ts`.]

**MAJOR A-6. Version skew is a missing compatibility *proof*, not a missing pin.** `cognate-domainforge` pins 0.21.1 (README states it deliberately) while sxr pins 0.21.2. The system's actual compatibility ruler is world_ref equality; nothing anywhere records "same `.sea` corpus → same worldRef across DomainForge 0.21.1/0.21.2." Without that check, the pin is unarguable in both directions. The structural fix is a recorded corpus-equivalence gate (DomainForge's own `parseSourceMap → worldRefFromIdentityJson` chain makes it mechanical), owned by DomainForge releases.

**MINOR A-7. Vendored-tgz consumption is already rotting.** `Horizon/.cognate/vendor/` contains stale 0.7.0 tgz files alongside 0.8.0 (store-sqlite, protocol-connect, provider-local). Thirty-plus vendored tarballs per product guarantees this recurs.

**MINOR A-8. CEP repo status is defensible; the debt is content, not form.** 8 schemas bind four runtimes in four repos; a folder in any one repo creates ownership bias. Keep the repo; C-4 (hash algorithm) is the real work.

## B. Duplication dispositions — agreed/disputed

| Item | Hypothesis | Verdict |
| --- | --- | --- |
| 3 approval shapes | M-2 reconcile | **Disputed** — two concepts + one bug (A-1); reconcile only after concept decision |
| 2 seaForgeCall | M-1 SDK export | **Agree, wrong mechanism** — extend `SeaForgeAuthority` (A-4); note `request_id` prefixes differ (`workbench:` vs `horizon:`) — idempotency semantics must unify deliberately |
| 2 identity systems | M-1 land branch | **Agree, underestimated** — three-way reconciliation; Horizon spec 1.2.0 implicated (A-3) |
| 2 settlement orchestrators | (implicit keep both) | **Partly disputed** — Workbench's `orchestrator.ts` is a *client* of the one real ledger (submits via `seaForgeAuthority.submitEvidence/settle`); keeping both client flows is fine, but the RealityTrace client + env contract must deduplicate to the SDK (A-5) |
| 2 agent-harness UIs | keep both, converge tokens | **Agree** |
| grammar quadruplication | R-2 archive | **Agree** |
| sea-rs 3 UIs | R-1 retire two | **Agree with coupling fix** (A-2): move contracts home first; decide ui+casework pair together |

## C. Structural end-state I would pick

Repos unchanged (the authority topology *is* defensible — I concur with the load-bearing claim). Changes are all contract-home and fold moves:

1. **Cognate SDK**: land `packages/identity`; add `listApprovals`/`resolveApproval` to `SeaForgeAuthority`; fold the 7 zero-external-single-consumer packages (`a2a, agent-discovery, cognitive-ruvector, cognitive-rvf, mcp, provider-openai-oauth, provider-typesafe` — verified 0 external consumers each) into their sole consumer; keep `cognitive-memory/provider-wire/hook-interoperability` as internal blocks.
2. **sea-rs**: SFWP schema generation emits to top-level `contracts/` (server-crate-owned); delete `workbench/` renderer; archive cognitive-ui + casework-go *as a pair* unless the owner names a journey for them.
3. **Horizon**: adapters layer survives as *domain projections only* (navigation, operational-objects, semantic — Horizon-owned semantics, correctly not in the SDK); all process-external transport (SFWP socket, SXR CLI, CK) via SDK ports; delete local `seaForgeCall`, WebAuthn/pairing/cbor; adopt `packages/identity`.
4. **SWE_SEED**: split roles — keep proof contract + settlement-transport plugin (genuinely the independent verifier SEA-Forge trusts); archive or donate its agent-routing/governance half (overlaps Workbench's purpose). The transport must NOT fold into sea-rs; it *is* the pluggable `SettlementAuthority`.
5. **godspeed_agent**: archive after T17/T21 extraction **and after re-homing the E1→E8 world-loop test** (`tests/test_e2e_world_loop.py` — the only whole-chain world_ref proof) into godspeed-readiness or sea-rs. R-3 misses this re-homing.

## D. Contract revisions required

| Revision | Safe or semantic |
| --- | --- |
| Contracts home move in sea-rs (same generated bytes, new path) | **Provable-safe** (byte-diff + drift test already exists) |
| SDK `SeaForgeAuthority` + approvals methods (new API) | **Provable-safe** per method; `request_id` unification is **semantic** |
| Approval wire reconcile (M-2) | **Semantic** (consumers read `state` vs `resolved_by`; A-1 concept split) |
| Identity unification | **Semantic** (Horizon spec 1.2.0 REQ-SEC-006 vs SDK branch contract) |
| DomainForge pin 0.21.1→0.21.2 | **Provable-safe iff** corpus worldRef-equivalence gate passes (A-6); else semantic |
| Horizon plan rebind / T-task identity (M-3) | Procedural |
| CEP hash algorithm (C-4) | **Semantic** by definition |
| SWE_SEED role trim | **Provable-safe** if archiving routing only; semantic if transport messages change |

## E. Migration cost / dominant risk

- Contracts home move in sea-rs: **S** — risk: casework-go import paths (moot if archived same PR).
- SDK approvals methods + Horizon/Workbench adoption: **M** — risk: idempotency-key semantics diverge silently.
- Identity three-way merge: **L** — risk: Horizon's frozen 1.2.0 spec forces the SDK branch to conform, not vice versa.
- Approval wire reconcile: **M** — risk: conflating the two server concepts (A-1).
- Cognate package folds: **S each** — risk: churn in the 30+ vendored tgz set.
- DomainForge pin + equivalence gate: **S** — risk: undiscovered world_ref inputs beyond the corpus.
- SWE_SEED trim: **M** — risk: SEA-Forge transport tests depend on routing surface.
- godspeed_agent archive + E2E re-home: **M** — risk: losing the only end-to-end world_ref chain proof.

**Bottom line:** the hypothesis's central claim (ownership is right; fix seams) survives this lens. What does not survive unchanged: M-2's framing (two concepts, not one stale schema), R-1's sequencing (contract home is hostage), M-1's mechanism (extend the hardened client; the raw export perpetuates the unhardened copies), and the duplication ledger itself (RealityTrace client/env fork unlisted; identity fork already landed, not pending).

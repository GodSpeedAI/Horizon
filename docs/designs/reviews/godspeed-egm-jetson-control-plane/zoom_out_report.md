# Stage 5 — Initial Zoom Out Review

**Target:** `docs/designs/godspeed-egm-jetson-control-plane.md` (367 lines, full file)
**Persona:** `egm-zoom-out` (Skeptical Architect)
**Standard:** `resources/document_standards/zoom-out-standard.md`
**Reviewer status:** completed (fresh context)

Context sufficiency passes. The objective, motivation, runs and rejected alternatives are stated. Findings concern reuse, altitude and ownership, not comprehension.

## Findings

**S5-1 [Blocker] Case-ID minting inverts a frozen requirement and duplicates existing case semantics.**
Scope: Goals #3 (L30), Components §3 (L136), target files 6–8 (L268–281).
`HORIZON-001` `REQ-CASE-001` (`.agents/specs/horizon.agent.spec.yaml:763`) requires a Case to remain "a purpose-relative derived view … not a competing ontology". The design appoints `control/ids/schema.ts` as "one component mints case IDs". `case_id` is already a live field on `agent-event/v1` (`test/support/economics-fixture.ts:11,34`), Horizon already reads and groups by it, and already surfaces `unbound` as a distinct case (`src/economics/model.ts:85,392`). `control/ids/map.yaml` is therefore a second identity authority and a second memory store, against the design's own non-goal (L39), while L360 claims the spec hash is unchanged.

**S5-2 [Blocker] The Horizon read contract has no defined source.**
Scope: Components §8 (L141), target file 17 (L323–326), data flow (L146–165).
Horizon projections fold Cognate events (`src/projections/README.md`, `navigation-context.ts`) on Cognate's `Projection` interface (`operational-objects.ts:1–14`). Paperclip state is not a Cognate event, so the contract either imports Paperclip rows into Horizon's store (new store plus reconciliation, non-goal #2) or reads Paperclip's API, which is undefined. Reuse exists: `HorizonApplication` in `src/app.ts:137` is already the single seam. The minimal shape is an adapter feeding the existing Case and workspace views, not a new projection module.

**S5-3 [Blocker] A second budget authority.**
Scope: Overview (L11), Components §1 (L134), Alternative A (L190).
Paperclip owns "goals, budgets and approvals"; Horizon already owns affordability through `REQ-NAV-008/009` with declared bounds, allowances, atomic reservations and consumption (`src/domain/payment.ts`, `src/capabilities/capacity-ledger.ts`, `src/config/types.ts:61`). Alternative A's rejection reason — "the budget enforcement that Paperclip provides would be rebuilt" — is factually wrong for this repository. The document must name the affordability authority or the owner will see two budget numbers.

**S5-4 [Major] Six sub-modules where one adapter is the irreducible core.**
Scope: target files 4–12 (L258–306), Components §4–7 (L137–140).
Only `adapter/index.ts` and `paperclip-client.ts` are required by the stated problem. `governor/state-machine.ts`, `verification/container.ts`, `loop/repair.ts` and `loop/gtm.ts` need something to run them, and the design never names that runner (L53 admits the workstream host is unresolved). A TypeScript state machine cannot own cgroup OOM, a thermal trip, or a disk floor. systemd (`MemoryMax`, `MemoryHigh`, `systemd-oomd`), cgroup v2, kernel thermal zones and a netns/nftables config already own every one of those conditions. Rebuilding them is a bespoke-over-platform anti-pattern.

**S5-5 [Major] The governor is not cohesive and hysteresis is speculative.**
Scope: L137, target file 9 (L283–286).
Memory admission, OOM, thermal pause, disk floor, model eviction and egress are grouped in one state machine. Egress is a static policy (target file 13 already is one). R2-5 asks for hysteresis; no retained measurement shows oscillation. This fixes an unobserved defect.

**S5-6 [Major] Two-host verification with SHA256 manifests has no measured justification.**
Scope: L31, L138, target file 10 (L288–291), Verification Plan (L355–358).
The evidence directory holds test and verify logs, not build-size or peak-RSS measurements. R2-1 records that the 6 GB build cgroup failed to compose, not that `godspeed-growth`'s suite needs more than 3 GB. Workstation handoff is the most complex of three options and was chosen before measurement.

**S5-7 [Major] `gate-control` bypasses the plan's gate binding.**
Scope: L341, L360; `.agents/plans/horizon.plan.yaml:115`.
The `gate_binding_rule` requires every gate to be a `gate-tNN` with real checks and forbids "fake green aliases". `gate-control` has no task, requirement IDs, preregistration, falsifier or independent confirmation, while `AGENTS.md` §7 requires all five. Adding it to `verify` puts unbound work into the declared settlement gate.

**S5-8 [Major] The stated boundary gate does not exist.**
Scope: L359.
`scripts/check-boundaries.ts` walks only `src` and `test`; nothing inspects `control/`. Separately, `control/package.json` + Bun + mise Node ≥ 24.11 + Docker means three runtimes in one repository with only a manifest as justification.

**S5-9 [Major] Two approval queues.**
Scope: L34, L266.
`src/adapters/sea-forge-approvals.ts:4` states the approval is a SEA-Forge record under the operator's own identity and Horizon keeps no approval state. The design adds a Paperclip approval that is "organizational only". "Precedence that cannot be shadowed" is asserted, not mechanized; the only teeth are one negative test. The real risk is the owner answering the wrong queue.

**S5-10 [Nit] `control/loop/gtm.ts` contradicts L140.**
L140 says the GTM workstream runs on existing primitives. A module that freezes recipients, executes once and applies a 30-day rule is policy and belongs in `org.yaml` plus an approval request.

**S5-11 [Nit] Internal inconsistency and weeds.**
L48 makes the adapter and read contract conditional; L172 and L239 make both mandatory. Admission floor appears as 14 GiB (L24), 14.3 GiB (L137) and "≥14 GiB" (L31). Per-file changes carrying `--memory=3g` and `Restart=on-failure` are plan-level detail. Smoke and withdrawal scripts are accepted on "exit 0" with no named falsifier.

## What survives
SEA-Forge, RealityTrace, Gauntlet and Cognate keep their owned roles. Auto-merge is correctly refused, including the design's own auto-merge counter. Fixing S5-1 to S5-3 leaves documentation and gate-binding repair, not redesign.

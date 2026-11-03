# GodSpeed EGM Integration — Interim Jetson Control Plane (Paperclip)

* **Author:** Sam Prime (owner) · Cline session, EGM flow
* **Status:** Draft
* **Date:** 2026-11-01

--------------------------------------------------------------------------------

## Overview

GodSpeed operates as a six-pillar organization: strategy, development, growth, attention, intention and knowledge. Today those pillars run across separate repositories and systems with no single always-on surface for organizational work, approvals and budgets. This design adds an interim control plane — upstream **Paperclip** (MIT, npm, run under mise-managed Node ≥ 24.11) — hosted on the always-on Jetson while the owner's HomeStation is offline.

The control plane does not replace anything. Horizon remains the owner-facing strategic cockpit; RealityTrace (`sxr`) remains the independent evidence system; SEA-Forge remains the policy authority; Gauntlet remains bounded long-horizon execution; Cognate, DomainForge, SWE_SEED, `~/.agents`, TokenEconomizer and Context Kernel keep their current roles. The systems are joined by explicit identifiers and existing interfaces, not by new task, execution, evidence, memory or dashboard systems.

The first release operates two loops. The first is a repair loop on `godspeed-growth` (retargeted from RealityTrace by the owner on 2026-11-01): an isolated worktree candidate that fixes the failing suite (missing `src/scripts/hero-lattice.js`) and the delivery-engineering vs tax-first positioning contradiction, classified by SEA-Forge, evidenced by RealityTrace, and merged only by owner approval. The second is the tax-first GTM loop: the already-completed market, ICP and positioning research is executed into approval-ready campaigns, and its acceptance event is one scoped, owner-approved external discovery conversation.

## The Problem

1. **No organizational control surface.** HomeStation is offline; the Jetson is the only always-on host (it already serves Qwen3.8 Flash Next for repair and inference). Organizational work, approvals, budgets and campaign state have no home, and a third dashboard would duplicate Horizon and Workbench.
2. **The identifier chain is broken.** The only live event path carries `case_id: null` (`~/.agents/state/rt/drain-state.json`). Nothing joins a Horizon case, a Paperclip work item, a Cognate assignment, a Gauntlet run, a RealityTrace observation and a settlement. "Which strategic case did this change serve?" is unanswerable except by guessing.
3. **Autonomy is stated but not enforced.** Subscription-backed CLIs must never run autonomously and autonomous spend must be zero, but no mechanism enforces either; TokenEconomizer's paid-model guard is off by policy rather than a hard gate.
4. **The GTM loop has no falsification event.** Research and campaign preparation can run forever without a customer contact, so a "successful" launch could end with nothing learned.
5. **The repair target was self-referential.** Repairing RealityTrace made the verifier the repair object; the owner retargeted the pilot to `godspeed-growth`, which also unblocks campaign artifacts.
6. **The Jetson's real envelope is narrow.** 61 GiB RAM total with orinfer holding ~42 GiB leaves ~14–16 GiB MemAvailable, guarded at 14 GiB; heavy builds and verification cannot run unbounded there.

## Goals

1. **A locally accepted control plane.** Upstream Paperclip is pinned by exact version, run under mise-managed Node ≥ 24.11 on the Jetson with telemetry disabled, and passes a local smoke acceptance (embedded PostgreSQL on ARM64) before any organization definition binds.
2. **One repair pilot, end to end.** `godspeed-growth` runs from an isolated worktree; the failing suite and positioning contradiction are fixed; the candidate is SEA-Forge-classified, RealityTrace-evidenced, and merged only with owner approval.
3. **A working identifier map.** One minting authority and an ID-ownership table (who mints, references, resolves), added additively to the live `agent-event/v1` schema with `unbound` as a first-class state, propagated into agent sessions, version-controlled outside Paperclip's database, and proven with a replay test against a copy of the real ledger.
4. **Bounded, fail-closed operation.** Published memory table (orinfer ≈42G + control plane ≤3G + cockpit/other ≈2G + ≥14G guard ≤ 61G) with the rule "refuse repair, never evict the model"; bounded verification in a 2–3G Docker container on the Jetson (Docker 29.7.1 verified) and heavy builds on the workstation with SHA256-pinned artifacts; a 30-minute binding per-candidate wall clock with 2M tokens advisory; 10 candidates per day; $0 autonomous spend with an egress allowlist; repair pauses below 100 GiB free disk; a thermal pause at 85 °C.
5. **A GTM loop with an external acceptance event.** Preparation runs autonomously from the owner's research bundle; the acceptance event is one scoped, owner-approved discovery conversation; no qualified conversation within 30 days of the first approved outreach is a recorded negative result routed to Horizon, never a reason to widen channels. The bundle has a dated intake: if it is not delivered within 14 days of intake, the workstream continues preparation-only from the discovery-recorded strategy summary, with its own exit criterion, and no outreach approval is requested until the bundle lands.
6. **Owner-facing evidence without a new store.** Horizon shows the linked intention, work, evidence, costs and decisions requiring the owner, reading through a defined contract rather than Paperclip's private schema.
7. **Approval precedence that cannot be shadowed.** Paperclip approvals are scheduling and organizational only; SEA-Forge governs candidate transitions and outranks Paperclip everywhere; the owner gates releases, external engagement and subscription spend.

## Non-Goals

* No auto-merge. Every merge is owner-approved; the auto-merge question is re-decided only after the pilot produces a track record.
* No new task, execution, evidence, memory or dashboard systems; Paperclip's own UI is non-canonical.
* No public releases, release tags, published packages, production deployment, SEA-Forge policy changes, expanded authority or irreversible destruction in the first release.
* No new market, ICP, JTBD, netnography or positioning research; the owner's bundle is an input.
* No Twenty CRM, Home Assistant Yellow data-fabric rebuild, or HomeStation migration in the first release.
* No replacement of Cognate, DomainForge, SEA-Forge, Gauntlet or RealityTrace in their owned roles.
* No autonomous subscription-backed CLI use or paid API calls; any such use is an owner approval event with its own evidence record.

## Open Questions

* **Paperclip→execution adapter and Horizon read contract (R2-3):** both must be specified in Increment 1, or the Horizon view moves to a later increment.
* **ID map cutover (R2-4):** the exact additive field, `unbound` handling, non-re-attribution rule and replay test against ~1,703 existing Horizon records.
* **Resource governor ownership (R2-5):** which single component owns memory admission, cgroup OOM, thermal pause, disk floor, model-guard eviction and egress, including hysteresis and recorded pause reasons.
* **Org seed and withdrawal test (R2-6):** the declarative YAML org/ID seed in git, the uninstall path, the restore drill, and the "uninstall Paperclip, restart both loops, lose nothing" test.
* **Egress allowlist mechanism (R2-7):** network namespace + proxy versus nftables SNI rules, the allowlist contents, and the credential-absence check.
* **GTM preregistration (R2-9..11):** dated research-bundle intake, the frozen recipient list and message variant, the preparation-only window's exit criterion, and the workstream's host and acceptance command.
* **Paperclip write path (R2-14):** Paperclip writable only by the adapter's service identity, with a negative check against citing Paperclip approvals as settlement evidence.
* **Exact Paperclip npm version pin and the per-repository mapping of heavy builds to the workstation.**


## Critical User Journeys (CUJs)

### CUJ 1: Owner brings the organization online

* **Given:** the Jetson is running orinfer with Qwen3.8 Flash Next resident; the `edgeai` deploy is tag-pinned from clean `main` @ `b7e88d9`; Paperclip is not yet installed.
* **When:** the owner starts the control-plane service (`systemctl start paperclip`), with mise-managed Node ≥ 24.11, telemetry off, `MemoryMax=3G`, and the declarative org seed from git.
* **Then:** the Paperclip smoke acceptance passes (embedded PostgreSQL starts, the org loads from the YAML seed, the six pillars exist); Horizon shows the organization as *observed*, not *assumed*; no paid or subscription credential is reachable from the service.

### CUJ 2: One repair candidate on godspeed-growth, end to end

* **Given:** a clean control plane, the ID map active, and `godspeed-growth` failing on the missing `src/scripts/hero-lattice.js` plus the delivery-engineering vs tax-first positioning contradiction.
* **When:** a Paperclip work item is created under a strategic case; the adapter dispatches it; the repairing agent works in an isolated worktree, bounded to one failing test or one single-file class of fix, within a 30-minute wall clock.
* **Then:** the candidate branch and pull request exist; SEA-Forge classifies the change; verification runs in a 2–3G Docker container on the Jetson (heavy builds on the workstation with SHA256-pinned artifacts); RealityTrace holds the observation; the owner approves the merge in Horizon; the suite passes and the public claims are consistent; Horizon shows case → work → run → evidence links with no guessed identifiers.

### CUJ 3: A campaign prepared for one approved conversation

* **Given:** the owner's research bundle has been ingested (dated intake); the GTM workstream runs on existing primitives.
* **When:** agents produce segmentation, a frozen recipient list, one frozen message variant and a complete campaign package, then file one owner-approval request naming content, recipients, channels and window.
* **Then:** the owner approves or rejects the request; on approval, exactly that scoped outreach may be executed once; the discovery conversation's outcome is recorded; if no qualified conversation occurs within 30 days, the negative result is routed to Horizon and the consequence is to revise the buyer hypothesis or segment — never to widen channels.

### CUJ 4: A blocked or denied path stays visible

* **Given:** a repair turn needs more memory than the admission floor allows, or an agent attempts a paid endpoint or a subscription CLI.
* **When:** the resource governor or the egress policy refuses.
* **Then:** the refusal is recorded with its reason (memory, thermal, disk, eviction guard, egress, authority); the control plane keeps running; Horizon shows the blocked state as *blocked*, not as a failure or as success; no spend occurred.

### CUJ 5: Withdrawal proves the design is reversible

* **Given:** Paperclip has been running with a populated org seed and ID map.
* **When:** the owner uninstalls Paperclip and restarts both loops.
* **Then:** both loops operate on existing primitives; the ID map, org definition and evidence remain intact in git and RealityTrace; nothing is lost and no record is re-attributed.


## Technical Plan (Architecture)

### Component map

```text
                         OWNER
                           |  reads / approves
                           v
        +------------------------------+
        | Horizon (strategic cockpit)  |  read contract over projections,
        |  intention | work | evidence |  never Paperclip's private schema
        +--------------+---------------+
                       ^
                       | read contract (R2-3)
                       |
  +--------------------+-------------------+        +---------------------+
  | Paperclip (Jetson, systemd)            |        | SEA-Forge           |
  |  org / goals / budgets / approvals     |<------>| policy authority    |
  |  scheduling + organizational only      |  gate  | fail-closed         |
  |  MemoryMax=3G, telemetry off           |        +----------+----------+
  +--------------------+-------------------+                   |
                       | one-directional dispatch (R2-3)       |
                       v                                       v
  +--------------------+-------------------+        +----------+----------+
  | Dispatch adapter                       |        | Gauntlet / Cognate  |
  |  translates work -> existing routes    |------->| bounded execution   |
  |  mints correlation IDs                 |        +----------+----------+
  +--------------------+-------------------+                   |
                       |                                       v
                       |                            +----------+----------+
                       |                            | RealityTrace (sxr)  |
                       |                            | independent evidence|
                       |                            +----------+----------+
                       v                                       |
        +------------------------------+                       |
        | ID map (git-tracked)         |<----------------------+
        | ids/map.yaml + agent-event/v1|
        |  additive case_id, `unbound` |
        +------------------------------+
```

### Components and responsibilities

1. **Control plane (Paperclip).** Upstream package pinned by exact npm version; mise-managed Node ≥ 24.11 (25.9.0 already installed on the Jetson); systemd unit with `MemoryMax=3G`; telemetry disabled; embedded PostgreSQL for local state. Organization, goals, budgets and approvals live here as *scheduling and organizational* records. The org definition is a declarative YAML seed in git (`control/org.yaml`), which is the recovery source of truth: a lost database is re-seeded, not reconstructed by hand. Paperclip is writable only by the adapter's service identity (R2-14), and a negative check fails any claim that a Paperclip approval is settlement evidence.
2. **Dispatch adapter.** The only path from Paperclip into work. It is one-directional: it translates a Paperclip work item into an existing route (Gauntlet for bounded long-horizon work, direct execution otherwise), refuses targets that are not governed, and mints the run-scoped correlation ID. It never executes work itself, so Paperclip cannot become a second scheduler beside Gauntlet.
3. **ID authority.** One component mints case IDs; the ID-ownership table names who mints, who references and who resolves. The ID map is a version-controlled file (`ids/map.yaml`) outside any product's private store. Case IDs reach existing records through an additive field on the `agent-event/v1` schema; `unbound` is a first-class value; historical records are never re-attributed; a replay test runs against a copy of the real ledger before the first mint (R2-4).
4. **Resource governor.** One state machine owns every refusal condition: memory admission (MemAvailable ≥ 14.3 GiB), cgroup OOM, the 85 °C thermal pause, the 100 GiB disk floor, model-guard eviction and egress. It applies hysteresis so pause/resume does not oscillate, records a pause reason for every transition, and never evicts the model to admit repair.
5. **Verification runner.** Bounded checks run in a Docker container on the Jetson capped at 2–3G with single-job builds (Docker 29.7.1, user in `docker` group, cgroup v2 — verified 2026-11-01). Heavy multi-workspace builds run on the workstation with SHA256-pinned artifact transfer. Verification never runs in the repairing agent's session or runtime.
6. **Repair loop runner.** One candidate at a time, in an isolated worktree of `godspeed-growth`, scoped to one failing test or one single-file class of fix, within the 30-minute wall clock; produces a branch and a pull request; the approval remains the owner's.
7. **GTM workstream.** Runs on existing primitives (`godspeed-growth` artifacts plus agents); maintains segmentation, prospect research, drafts and approval requests; files frozen approval requests (content, recipients, channels, window); executes only what the owner approved, once; records outcomes for Horizon. The research bundle has a dated intake with a 14-day fallback to preparation-only from the discovery-recorded summary; no outreach approval is requested until the bundle lands.
8. **Horizon read contract.** A defined read path over projections (not Paperclip's schema) that renders intention, work, evidence, costs and owner decisions, plus the distinct `blocked` / `unknown` / `denied` / `unbound` states.


### Identifier chain and data flow

```text
owner intent (Horizon case, minted once)
   |
   v
Paperclip work item (references case_id)
   |
   v  adapter dispatch (mints run correlation id, refuses ungoverned targets)
Gauntlet / direct execution run (references case_id + run id)
   |
   v
Cognate events -> RealityTrace observation (references run id; derives its own evidence)
   |
   v
SEA-Forge settlement evaluation (three-valued; execution is not settlement)
   |
   v
Horizon read contract (case -> work -> run -> evidence -> settlement; `unbound` surfaced)
```

Every hop carries the case ID minted once; a hop that cannot resolve its parent is recorded as `unbound` and shown as such, never silently attributed. Historical records (about 1,703 in the live Horizon ledger) are not re-attributed; the additive field starts empty and `unbound` is the honest value for them.

### Increment 1 sequencing

1. **Host baseline.** Fix the Jetson ops-smoke failure (doctor output lacks `Summary`); tag-pin the `edgeai` deploy artifact from clean `main` @ `b7e88d9`; reconcile the workspace `dev` branch with `main`; pause `jetson-probe.timer` before performance-sensitive runs.
2. **Control plane.** Install the pinned upstream Paperclip under mise Node ≥ 24.11 with telemetry off and `MemoryMax=3G`; pass the local smoke acceptance; load the YAML org seed.
3. **Identity.** Define the ID schema and ownership table; add the additive `case_id` field with `unbound`; run the replay test against a copy of the real ledger; commit `ids/map.yaml`.
4. **Coupling.** Build the minimal dispatch adapter and the Horizon read contract (both are Increment 1 items under R2-3).
5. **Safety.** Implement the resource governor and verification runner with the published memory table, hysteresis and recorded pause reasons.
6. **Pilot.** Run one `godspeed-growth` candidate end to end: isolated worktree, bounded scope, SEA-Forge classification, container verification, RealityTrace evidence, owner-approved merge.
7. **Proof.** Horizon shows the linked chain; CUJ 4 (blocked/denied) and CUJ 5 (withdrawal) are exercised; failures stay visible.

### Non-functional requirements

* **Security and privacy.** No paid or subscription credentials on the unattended path; the egress allowlist is a named mechanism with a credential-absence check; Paperclip is writable only by the adapter's service identity; secrets stay in the per-launch `0600` file (existing Horizon behaviour).
* **Performance and capacity.** Inference stays at the measured envelope (64K context, ~50 tok/s decode, serialized); repair is concurrency 1; a candidate's binding ceiling is 30 minutes wall clock (prefill + decode + queue wait; the owner gate is excluded); 2M tokens is advisory; 10 candidates per day.
* **Rollout and rollback.** Deploy from a tag, not a branch tip; the declarative org seed and ID map in git are the recovery source of truth; a documented uninstall plus restore drill exists; the withdrawal test (CUJ 5) must pass before the first release is called accepted.
* **Observability.** Every refusal, pause and approval records a reason; the run correlation ID and per-gate evidence IDs are written to RealityTrace so any merged change can be traced to the gate sequence and evidence that allowed it.


## Alternatives Considered

### Alternative A: Defer Paperclip; run both loops on existing primitives

* **Pros:** no new dependency; orchestration stays on systemd units and existing CLIs; the ID map works either way.
* **Cons:** no organizational surface for goals, budgets and approvals; hand-rolled scheduling drifts into custom glue; the budget enforcement that Paperclip provides would be rebuilt.
* **Reason for Rejection:** the owner pinned upstream Paperclip (2026-11-01). The adapter keeps Paperclip substitutable, so the decision is reversible at low cost if it fails the smoke acceptance.

### Alternative B: Use the local WarpRoom fork instead of upstream

* **Pros:** already cloned locally; the owner's Bun migration commits are present.
* **Cons:** roughly 4,800 commits of divergence from upstream; a Bun migration that Horizon's own integration register warns against; the fork can silently drift from upstream fixes.
* **Reason for Rejection:** the owner pinned upstream (2026-11-01). The register's disposition for WarpRoom follows its own retirement rule; it stays out of the control plane.

### Alternative C: Repair RealityTrace (`sxr`) as the first pilot

* **Pros:** dogfooding the evidence system; the verifier itself would improve.
* **Cons:** the verifying system becomes the repair object, so independence is nominal; the work produces nothing a tax-practice buyer needs; it consumes the scarce headroom first.
* **Reason for Rejection:** the owner retargeted the pilot to `godspeed-growth` (2026-11-01). That target fixes a real failing suite and the positioning contradiction, unblocks campaign artifacts, and removes the self-reference problem.

### Alternative D: Auto-merge routine fixes after gates pass

* **Pros:** less owner attention per change; higher repair throughput.
* **Cons:** merged effects are not reversible in practice; "routine" is a classification the design could not falsify; the proposed "10 consecutive verified merges" counter had no owner, no definition of a rollback event, and would take months to reach under serialized owner-gated operation.
* **Reason for Rejection:** the owner removed auto-merge from the design (2026-11-01). Every merge is owner-approved; the question is re-decided only after the pilot's track record exists.

### Alternative E: GTM preparation only, with no external event

* **Pros:** no external risk; no outreach approval needed; all work stays internal.
* **Cons:** an infinite-preparation loop that can run forever and stay green with zero validated learning; a "successful" launch could end with no customer contact.
* **Reason for Rejection:** the owner accepted one scoped, owner-approved external discovery conversation as the acceptance event, with a 30-day negative-result rule that routes to Horizon instead of widening channels.

### Alternative F: Add a new dashboard, memory store or task system (or adopt Twenty first)

* **Pros:** a tailored surface for the organization; CRM features out of the box.
* **Cons:** duplicates Horizon (cockpit) and Workbench (console); adds a sixth memory system to five existing ones; creates state that must be reconciled with RealityTrace and Cognate events.
* **Reason for Rejection:** out of scope. Paperclip's own UI is non-canonical, Horizon is the only owner-facing surface, and Twenty stays optional until a campaign shows a CRM-shaped need.

### Alternative G: Restart the GTM research

* **Pros:** a fresh, uniform baseline; no dependence on old artifacts.
* **Cons:** repeats completed comparative research, ICP analysis, job-to-be-done work, netnography and positioning; costs weeks; contradicts the owner's explicit instruction.
* **Reason for Rejection:** the completed research bundle is a required input, not a work item. The design distinguishes secondary-research findings from assumptions that still need customer validation.

### Alternative H: Move the control plane to HomeStation, or build the Yellow data fabric first

* **Pros:** the long-term target host; deeper Home Assistant integration.
* **Cons:** HomeStation is offline with no return date; the memory-ledger implementation on the Yellow is stale; both add hidden dependencies to the first launch.
* **Reason for Rejection:** the first release runs on the Jetson with host-agnostic, version-controlled state; the migration and the data-fabric rebuild are deferred, not designed around.



## Detailed Implementation Plan

Proposed home: a new top-level `control/` directory in the Horizon repository, outside `src/` domain boundaries, with one Horizon `src/projections/` addition for the read contract. Alternative: a separate repository; it isolates the control plane further but duplicates release tooling and adds a checkout to reconcile. The `control/` home fails if Horizon's boundary checks reject it or if the adapter grows into execution logic; the separate repo fails if release overhead exceeds one developer's tolerance.

### Target Files to Create/Modify

#### 1. `control/README.md` (Create)

* **Type / Scope:** Deployment runbook (Markdown).
* **Proposed Changes:** Exact pinned Paperclip version, mise Node pin, systemd install, telemetry-off verification, smoke-acceptance steps, the memory table, pause/resume commands, uninstall and restore drill. This is the operational contract a fresh operator follows without reading the code.

#### 2. `control/org.yaml` (Create)

* **Type / Scope:** Declarative organization seed (YAML).
* **Proposed Changes:** The six pillars (strategy, development, growth, attention, intention, knowledge) with goals, budgets, approval policies and owner gates. This file is the recovery source of truth; a lost database is re-seeded from it. It also records which Paperclip approvals are organizational only.

#### 3. `control/systemd/paperclip.service` (Create)

* **Type / Scope:** systemd unit.
* **Proposed Changes:** `MemoryMax=3G`, `Restart=on-failure`, environment for telemetry off, working directory under the Jetson deployment path, and no paid/subscription credentials in the environment. The unit is the enforcement point for the control-plane share of the memory table.

#### 4. `control/adapter/index.ts` (Create)

* **Type / Scope:** Dispatch adapter (TypeScript module).
* **Proposed Changes:** One-directional translation from a Paperclip work item to an existing route (Gauntlet for bounded work, direct execution otherwise); mint the run correlation ID; refuse ungoverned targets with a typed refusal; no execution logic. This is the only path from the control plane into work.

#### 5. `control/adapter/paperclip-client.ts` (Create)

* **Type / Scope:** Paperclip client wrapper.
* **Proposed Changes:** Pinned-version client, service-identity writes only, retry with recorded reasons, and a negative guard that refuses a Paperclip approval presented as settlement evidence (R2-14).

#### 6. `control/ids/schema.ts` (Create)

* **Type / Scope:** ID schema and ownership table types.
* **Proposed Changes:** Case-ID format, the additive `case_id` mapping onto `agent-event/v1` records, `unbound` as a first-class value, and the mint/reference/resolve responsibility table (R2-4). No field is ever rewritten on a historical record.

#### 7. `control/ids/map.yaml` (Create)

* **Type / Scope:** Version-controlled ID ledger.
* **Proposed Changes:** Minted case IDs with their minting authority and parent links, stored in git outside Paperclip's database so organizational identity survives uninstall or rehosting.

#### 8. `control/ids/replay.test.ts` (Create)

* **Type / Scope:** Replay test.
* **Proposed Changes:** Run the additive field and ID mapping against a copy of the real Horizon ledger (~1,703 records); assert `case_id` stays null/`unbound` for pre-cutover records, no record is re-attributed, and every new mint resolves to exactly one parent. This test gates the first mint.

#### 9. `control/governor/state-machine.ts` (Create)

* **Type / Scope:** Resource governor (TypeScript module).
* **Proposed Changes:** One state machine owning memory admission (MemAvailable ≥ 14.3 GiB), cgroup OOM, the 85 °C thermal pause, the 100 GiB disk floor, model-guard eviction and egress; hysteresis bands; a recorded reason for every transition; the precedence rule "refuse repair, never evict the model" (R2-5).

#### 10. `control/verification/container.ts` (Create)

* **Type / Scope:** Verification runner.
* **Proposed Changes:** Docker invocation with `--memory=3g`, single-job builds, no host network, a workspace bind mount for the isolated worktree; workstation handoff path with a SHA256 manifest of transferred artifacts. Never invoked from the repairing agent's session (R2-12).

#### 11. `control/loop/repair.ts` (Create)

* **Type / Scope:** Repair loop runner.
* **Proposed Changes:** Isolated worktree creation for `godspeed-growth`, candidate scoping (one failing test or one single-file class of fix), the 30-minute wall clock with 2M tokens advisory, branch and pull-request creation, and handoff to SEA-Forge classification. No merge authority.

#### 12. `control/loop/gtm.ts` (Create)

* **Type / Scope:** GTM workstream runner.
* **Proposed Changes:** Segmentation and prospect research inputs, a frozen recipient list and one frozen message variant, approval-request filing (content, recipients, channels, window), single execution after approval, outcome recording, and the 30-day negative-result rule (R2-9..11).

#### 13. `control/egress/allowlist.md` (Create)

* **Type / Scope:** Egress policy document.
* **Proposed Changes:** The named mechanism (nftables SNI rules or a network namespace plus proxy), the allowlist contents for builds (crates.io, npm, git remotes) and the denial of paid endpoints, plus the credential-absence check (R2-7).

#### 14. `control/paperclip-smoke.sh` (Create)

* **Type / Scope:** Acceptance script.
* **Proposed Changes:** Start the unit, verify embedded PostgreSQL, load `org.yaml`, confirm telemetry is off, confirm the service identity can write and other identities cannot, and exit non-zero with a reason on any failure. This is CUJ 1's proof.

#### 15. `control/withdrawal-test.sh` (Create)

* **Type / Scope:** Withdrawal test.
* **Proposed Changes:** Uninstall Paperclip, restart both loops on existing primitives, verify the ID map, org seed and evidence remain intact and no record was re-attributed. This is CUJ 5's proof (R2-6).

#### 16. `control/package.json` (Create)

* **Type / Scope:** Package manifest.
* **Proposed Changes:** Pinned Paperclip dependency, mise Node engine constraint (≥ 24.11), lint and test scripts for the `control/` tree only, keeping the control plane out of Horizon's runtime dependency graph.

#### 17. `src/projections/control-plane-read.ts` (Create)

* **Type / Scope:** Horizon read contract.
* **Proposed Changes:** A read path over projections that answers intention → work → run → evidence → settlement, surfaces `blocked` / `unknown` / `denied` / `unbound` as distinct states, and never reads Paperclip's private schema (R2-3). No writes, no authority.

#### 18. `test/control-plane-read.test.ts` (Create)

* **Type / Scope:** Unit tests for the read contract.
* **Proposed Changes:** Tests that an unbound work item is shown as `unbound`, blocked and denied stay distinct, a Paperclip approval is refused as settlement evidence, and the read path works with Paperclip uninstalled.

#### 19. `AGENTS.md` (Modify)

* **Type / Scope:** Repository contract.
* **Proposed Changes:** Add `control/` to the repository map with its boundary: scheduling and organizational state only, never authority, never execution, never evidence. This keeps the new directory from becoming an unstated second runtime.

#### 20. `justfile` (Modify)

* **Type / Scope:** Verification entry points.
* **Proposed Changes:** Add `gate-control` (smoke, unit tests, replay test, withdrawal test) and include it in `verify`, so the control plane's proofs run with the rest of the gates rather than beside them.

#### 21. `.gitignore` (Modify)

* **Type / Scope:** Repository hygiene.
* **Proposed Changes:** Ignore control-plane runtime state (Postgres data, logs, container volumes); the org seed and ID map stay tracked.

#### 22. `edgeai` deploy (Modify — cross-repository, owner action)

* **Type / Scope:** Deployment pin (separate repository).
* **Proposed Changes:** Tag the clean `main` @ `b7e88d9` as the deployable artifact, reconcile the workspace `dev` branch, and pause `jetson-probe.timer` before performance-sensitive runs. No code change beyond the tag.

### Verification Plan

* **Compilation/Build:** `bun install --frozen-lockfile` in `control/`; `bun x tsc --noEmit` for the control tree; `bun x tsc --noEmit` for Horizon.
* **Unit Tests:** `bun test control` (governor, adapter refusals, ID schema, container runner) and `bun test test/control-plane-read.test.ts`.
* **Replay Test:** `bun test control/ids/replay.test.ts` against a copy of the real ledger before the first mint.
* **Acceptance Scripts:** `control/paperclip-smoke.sh` (exit 0) and `control/withdrawal-test.sh` (exit 0) on the Jetson.
* **Static Analysis & Linting:** Horizon's existing `just check` and `just boundaries`; the control tree must not be imported by `src/ui`.
* **Global Gates:** `just verify` on Horizon stays green with `gate-control` included; the frozen Horizon spec hash is unchanged because this design does not alter Horizon's normative meaning.
* **E2E/Integration:** CUJ 2 (one `godspeed-growth` candidate to owner-approved merge), CUJ 3 (one approval request, scoped), CUJ 4 (a blocked and a denied path recorded), CUJ 5 (withdrawal), each with retained trace IDs and RealityTrace evidence.

---

<!-- Provenance: indicates initial structural drafting via EGM. -->

*Drafted with EGM*

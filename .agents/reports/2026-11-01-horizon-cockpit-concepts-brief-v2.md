# Horizon Cockpit Concepts Brief v2

**Concept:** AnchoredFeatureHypothesis (revised, operator-confirmed)
**Mode:** BRAINSTORM
**Date:** 2026-11-01
**Verdict:** Not implementable next sprint as written. The direction is sound, but the hypothesis states an invariant ("Horizon never decides") that the current code and the interaction model already violate. Fix the violations first, then build projections.

## Reviewer Status

| Reviewer | Lens | Status |
| --- | --- | --- |
| `egm-design` | Design Critic | completed |
| `egm-codebase-details` | Technical accuracy and reuse | completed |
| `egm-zoom-out` | Simplicity and scope | completed |
| `egm-comprehension` | Naive reader | completed |
| `egm-implementation-readiness` | Buildability | completed |
| `egm-structural` | Structure and boundaries | completed |

Unverified by all reviewers: the SEA-Forge gate and authority crates in `/home/sprime01/projects/sea-rs`, the contents of `/home/sprime01/projects/sxr`, Gauntlet, and SWE_SEED. Sibling directory globs timed out for several reviewers, so sibling contract claims below rest mainly on Horizon's own consumers.

## Blockers

### B1. Horizon decides, against its own invariant
Horizon computes things the hypothesis reserves for SEA-Forge and the operator:
- Availability: `selectable = status === "available"`, and `assessAffordance` derives status from gate verdicts (`/home/sprime01/projects/Horizon/src/domain/navigation.ts:221-250, 541-557, 601-619`). `choiceOf` sets `available` and `action_id` (`/home/sprime01/projects/Horizon/src/ui/workspace/model.ts:374-391`); `actionOf` sets submit from the same posture (`model.ts:414`).
- Hard-coded `pass` on all seven gates for observer controls (`/home/sprime01/projects/Horizon/src/domain/expectation.ts:194-215`).
- Decided verdict when SEA-Forge is off: a committed move is labelled "Horizon policy only" (`model.ts:742`) and refusals "Refused by Horizon policy" (`model.ts:800`).
- Settlement: `settleable` is derived in Horizon (`model.ts:791-793`). For contract_version 1 intents Horizon writes `status: "unsettled", final: true` with no SEA-Forge answer (`/home/sprime01/projects/Horizon/src/app.ts:501-503`).
- The interaction model gives Horizon the `visibility` and `reach` gates, and says "unknown blocks availability" (`/home/sprime01/projects/Horizon/.sea/interaction/interaction-model.sea:688-700, 723-728`). This contradicts INV-03 (`:757-763`) and the statement that no gate value grants authority (`:709-714`).

Fix: split the invariant. Horizon may compute observable frame, reach and visibility, and may withhold an offer or reject its own invalid input. It never authorizes, commits, settles, or emits a final verdict. Every verdict shown must carry a source ref from a sibling, with `unknown` as the default. Delete the hard-coded `pass` set. Remove "Horizon policy only" and "Refused by Horizon policy". Leave `settleable` and `final` to SEA-Forge. Add a contract test: every verdict in the decision region has a sibling source ref.

### B2. Recorded effects are presented as decided and settled
- "Allowed by SEA-Forge." appears whenever a commit record exists and the process-wide governance flag is on (`model.ts:739-741`; flag from `/home/sprime01/projects/Horizon/src/app.ts:1011-1012`). `StoredMoveFacts` carries no invocation or operation id (`model.ts:717-731`), though the settle path does check a per-record invocation (`/home/sprime01/projects/Horizon/src/capabilities/navigation-settlement.ts:14-21`). The Decided row and the Settlement row can therefore contradict each other ("the commit carries no recorded SEA-Forge decision", `app.ts:508-510`).
- The button "Observe and settle" makes one click trigger a RealityTrace observation and a SEA-Forge ruling (`/home/sprime01/projects/Horizon/src/ui/workspace/render.tsx:351-355`). The copy "Horizon records both answers" makes Horizon read as the store of observed claims.

Fix: pass `invocation_event_id` and `operation_id` into `StoredMoveFacts`. Show "Allowed" only with a typed `decision_ref` from SEA-Forge that names the ruling party. Otherwise show "Recorded by Horizon; no SEA-Forge decision recorded." Split the request from the answers. Rename the button to "Request RealityTrace observation" and "Request SEA-Forge settlement ruling", each with its own row and ref.

### B3. No typed approval contract; approval identity is parsed from text
- Approval id is recovered by regex from the string "awaiting approval <id>" (`model.ts:737`). The receipt's `approvals` field is a bare boolean (`model.ts:86`).
- Approvals appear only inline in the receipt (`render.tsx:359-377, 541`). The rail shows "Approvals: you can approve" with no count or link (`render.tsx:511-512`). A pending approval is invisible from the first screen. There is no approval inbox.
- Horizon holds its own socket client to SEA-Forge approvals, with a comment "Readiness debt: export it from Cognate" (`/home/sprime01/projects/Horizon/src/adapters/sea-forge-approvals.ts:2-11`). Horizon therefore owns a write path to decisions.

Fix: SEA-Forge must publish a versioned approval record (id, requested action, gate, expiry, decider). Horizon reads it. Horizon keeps no decision socket. Until Cognate exports a resolution call, do not build an approval implementation in Horizon. Show a pending-approval count on the main screen, and make it the primary action when the count is non-zero.

### B4. No Cognate session or approval projection readable by Horizon
Cognate has the primitives, but only inside Workbench and not reachable from Horizon: `ApprovalSummary` (`/home/sprime01/projects/cognate-workbench/src/approvalSummary.ts:19`), session task bindings (`src/projections/sessionTaskBindings.ts:14`), `CaseProjection` (`src/cognitive/case.ts:43`), `TraceEntry` (`src/cognitive/mediation.ts:30`). None of the exports in `src/ui/workspace` is a session or approval type. The agent-session and execution-outline screens therefore have no data source.

Fix: Cognate exposes a read-only session, approval and trace projection. Build it before any agent-session or outline screen.

## Major

### M1. Claim vocabulary does not match the hypothesis
- The hypothesis names four claims: request accepted, obligations settled, effect observed, capability improved. The UI has decided, recorded, observed, and a settlement row (`model.ts:60-80, 303-308, 749-795`; `render.tsx:302-308`).
- "Request accepted" is folded into recorded or never shown (`model.ts:723`). "Capability improved" has no slot at all.
- `WorkspaceClaim.state` is typed `string` (`model.ts:61`), so the "never merged" rule is only a convention.

Fix: write a table mapping each claim to a UI row, owner, and source field. Make `state` a discriminated union, with `decided` values limited to SEA-Forge verdicts. Do not render "improved" until a source exists.

### M2. Green is used for recorded, not only success
`render.tsx:770` applies the same bold green to allowed, observed and recorded. Recorded means an intent was written, not that anything succeeded. This conflicts with PRODUCT.md:25 and PRODUCT.md:43. Use a neutral, text-labelled state for recorded, and reserve success colour for observed-and-settled.

### M3. Authority is credited from configuration, and refusals are attributed by regex
`refusedBy` names SEA-Forge whenever the reason text matches "SEA-Forge" or "deny" (`model.ts:798-803`). Use typed `AuthorityOutcome` values (`interaction-model.sea:44-51`) and reason codes. Credit SEA-Forge only from a stored decision record. Otherwise say "committed; decision source not recorded".

### M4. Activation can be met by a read-only probe
The first-run "move" step prefers `horizon.health` (`render.tsx:404`), whose completion is "committed" (`model.ts:703-705`). `/home/sprime01/projects/Horizon/src/domain/frame.ts:87-95` says these structural moves are read-only and settle as not_required. Require a consequential move with a settled answer, or relabel the step.

### M5. Horizon owns state the model assigns to siblings, and the model header contradicts itself
- Case: `CaseRecord` is declared in the Horizon model (`interaction-model.sea:162-166`); Horizon stores `case_ref`, purpose and `opened_at` (`model.ts:111, 698`; `render.tsx:712-716`). Cognate Workbench already has a case projection.
- Payment gate owner is "Cognate with capability binding" (`interaction-model.sea:702-707`), but Horizon has `src/capabilities/capacity-ledger.ts`.
- Identity and remote auth (`src/remote/sessions.ts`, `webauthn.ts`, `pairing.ts`) form an auth surface the hypothesis does not mention. Cognate has `src/auth/identity.ts`.
- Economics totals and `overhead_pct` are computed in Horizon (`/home/sprime01/projects/Horizon/src/economics/model.ts:381, 384, 429`), while Cognate Workbench has `src/workbench/economics.ts`. `economics.tsx:267` says Horizon "keeps nothing itself", which is false.
- The `.sea` header says business entities stay with siblings (`interaction-model.sea:8-9`), yet the same file declares Horizon-owned `NavigationIntentRecord` and `SettlementReviewRecord` (`:298-310, 320-327`).

Fix: write one owner per item in the model. Split the model into Horizon-owned view entities and sibling-owned referenced entities, and rewrite the header to match. Horizon may keep a projection cache, not a second authority. The case becomes a reference to an external record, or an operator note labelled as such.

### M6. Sibling projections: some exist, most are missing
- Exists: `horizon.operational-objects` (`render.tsx:823`); Context Kernel query (`src/ui/workspace/inspect.ts:9`; `/home/sprime01/projects/Horizon/src/adapters/context-kernel.ts:12-16`); sxr record and output schemas (`/home/sprime01/projects/sxr/schemas/sxr-record-v1.json`, `sxr-output-v1.json`), consumed through `createSxrCliPort` (`/home/sprime01/projects/Horizon/src/adapters/settlement.ts:134-136`); Cognate governed-operation and trace types (`/home/sprime01/projects/cognate/packages/runtime-bun/src/governed-operation.ts:81-92`; `/home/sprime01/projects/cognate/packages/realitytrace/src/godspeed.ts:27-41`); DomainForge `world_ref`, reached only through the Cognate capability `horizon.semantics.world` (`/home/sprime01/projects/Horizon/src/agents/health.ts:30`).
- RealityTrace is read through CLI spawns (`/home/sprime01/projects/Horizon/src/adapters/realitytrace-economics.ts:5-7, 53`). The observation ref is read loosely as `evidence_id ?? sxr_observation_id ?? target_ref` (`model.ts:754`). The hypothesis says "sxr"; the code calls a `realitytrace` binary. The mapping is unverified.
- Missing: Gauntlet (no adapter; only a type comment at `/home/sprime01/projects/Horizon/src/ui/surface2/grammar.ts:120-122`); SWE_SEED (no reference anywhere in Horizon, and no entity in `interaction-model.sea:132-144`); candidate proposals (an entity at `.sea:333`, no consumer, absent from `WORKSPACE_REGION_ORDER` at `model.ts:20`); SEA-Forge standalone read projection; RealityTrace observation projection keyed by intent id.

Fix: per sibling, one table row with exposed contract, status (exists, missing, unverified), and Horizon consumer. Scope SWE_SEED out or add its contract. Build the missing read projections before the screens that need them.

### M7. Cognitive load: no single primary next action
- One page stacks a six-item process rail, a Getting Started block, context, decision, moves, evidence, sources, lineage, agent, debugger, and retrieval regions (`render.tsx:541-708`; `model.ts:20`). The receipt renders before the decision, so after a commit the next action is pushed down.
- The decision list gives every available choice the same weight (`render.tsx:573-630`). `choice.primary` only changes the text to "Available, recommended" (`render.tsx:75`).

Fix: add a pure `primaryAction(snapshot)` in the model with fixed precedence: pending approval, then settleable, then primary available choice, then open case. Render only that control prominently. Name its prerequisite in plain words. Collapse everything else. Keep the fixed owner order; it is a real strength.

### M8. Palantir patterns imported without their authority boundary
Per-tool Allow/Ask rules, "Always allow for this session", and submission-criteria authoring make the UI a place where authority is written (`/home/sprime01/projects/Horizon/.agents/reports/2026-11-01-palantir-foundry-aifde-features.csv` rows 8, 16, 28, 30, 64; recon §4.4 S39-S40, §7.7). Horizon's principle is that authority is never authored in the cockpit. Adopt object-view tabs, filter counts, and disabled-with-reason as read-only patterns. Exclude rule builders, always-allow, and criteria authoring. Those stay in SEA-Forge. Also drop the DomainForge authoring rows (CSV rows 4-9, 37, 61-63): object, link and action types, writeback, and the CRUD wizard belong to DomainForge, and Horizon projects only its identity and diagnostics.

### M9. Target user is contradicted
The hypothesis assumes an operator who does not know the systems. PRODUCT.md:9, 11 names a solo stack owner who "understands processes, sockets and logs". A projection layer built for a novice adds concepts for an expert. Settle the user first. If the target is the expert, the cockpit needs density and provenance rather than an abstraction layer.

### M10. Setup leaks into the "no need to know how it works" promise
The cockpit tells the operator to run `bun run ignite`, read docs/IGNITION.md, and set COGNATE_SEA_FORGE_OPERATOR and HORIZON_ECONOMICS_REALITYTRACE_BIN (`render.tsx:373-374`; `economics.tsx:269-271`; `model.ts:692, 761`). Scope the claim to normal operation, and make setup errors name the exact missing sibling and fix.

### M11. Constraint not decided: "no client bundle"
`render.tsx:5-7` forbids a client bundle and allows native form posts only. This blocks a live approval inbox and conflicts with the inline inspect and drag-to-agent patterns (CSV rows 12, 13, 23). State the constraint explicitly as a decision before designing on it. Note that "the operator is not a form" depends on it.

### M12. Economics is out of the operator's job
The operator's job list is see, pick, decide, see outcome (PRODUCT.md:11, 15-17). Economics shows token accounting for the TE tap. Move it off the cockpit or label it as a separate tool. Where derived columns sit beside observed ones (`economics/model.ts:381, 429` beside `economics.tsx:45-54, 71-75`), badge each derived column "derived by Horizon" as well as observed or estimate, or move the computation to RealityTrace or Cognate.

### M13. Retrieval is mixed into canonical inspection
Context Kernel citations render inside "Sources and refs" beside debugger facts and SEA-Forge source bindings (`render.tsx:669`). Citations are typed `untrusted_reference` (`model.ts:251-261`), but the region title does not say so. Move reference material to its own region with a non-canonical label.

### M14. Agent region guarantee is prose only
The agent region is pinned `data-owner-pinned="false"` (`render.tsx:691`), with the guarantee stated only in text (`render.tsx:694`). Add a test that agent text cannot reorder or supersede the decision region.

### M15. Schema versioning
`WORKSPACE_SCHEMA = "horizon.workspace/1"` (`model.ts:19`). Changing receipts, the approval id, or the approvals boolean changes stored output. Bump to `/2`, keep the old parser behind a flag for one release, and roll back by reverting the flag.

## Nits

- Lineage labels are silently cut to 12 and 22 characters (`render.tsx:150-151`), against the "never truncated silently" rule (`model.ts:40`).
- "Also possible from the terminal" (`render.tsx:612`) implies CLI parity, but the terminal UI is a separate presentation layer. Make it a named projection of the same intent contract, or drop the claim.
- Four presentation layers exist (`ui/surface.ts`, `ui/surface2/*`, `ui/sequential/*`, `ui/workspace/*`). The model imports `nextStep` and `plainReason` from `ui/sequential/controller.ts` (`model.ts:15`), while the model is described as renderer-neutral (`model.ts:2-3`). Move those helpers to a neutral module and declare one canonical presentation layer.
- Reuse: `render.tsx` reimplements approval and settlement cards that exist in `/home/sprime01/projects/cognate-workbench/src/ui/GovernanceApprovalCard.tsx:5` and `src/ui/SettlementCard.tsx:44`. `/home/sprime01/projects/sea-rs/workbench/packages/sea-forge-ui-components/src/ProtectedActionButton.tsx` is a React control and cannot be adopted under the no-client-bundle rule.
- Do not import `cognate-workbench/src/domain/approvalGate.ts:51` as an authority. It is a local sandbox-escalation rule, not SEA-Forge.
- The debugger's `authority: false` and `settles: false` are literal types (`inspect.ts:74-75`; `model.ts:246-247`, `263`). Good. Add a compile-time guard so they cannot become `true`.
- OODA adds nothing testable. The existing loop is PRODUCT.md:15-17. Test "exactly one primary action per screen" on a fixture instead of adopting a loop taxonomy.

## Answers to the Five Questions

**Q1. What must each sibling expose?**
- SEA-Forge: typed approval record and gate/decision records (blocker; does not exist as a contract).
- Cognate: read-only session, approval and trace projection (blocker; exists inside Workbench only).
- RealityTrace: observation projection keyed by intent id (missing as a contract; CLI spawn today).
- DomainForge: `world_ref`, checkpoint and diagnostics (exists via a capability).
- Context Kernel: reference query (exists).
- Gauntlet: execution record and status (missing; flows exist only in the model at `.sea:394-395`).
- SWE_SEED: missing and absent from the model. Scope out or add.
- Candidate proposals: missing consumer.
The list is near-minimal once SWE_SEED is dropped and the approval and session contracts are named. The missing piece is a claim envelope that carries origin.

**Q2. What does Horizon own?**
- Owns: frame and revision identity (`model.ts:26-29`), onboarding skip, layout, theme, focus pointers, and the intent and settlement records it writes (`navigation-settlement.ts:61-98`). Case ownership must be corrected (M5).
- Reads only: observed evidence (sxr), SEA-Forge decisions, Cognate projection rows (`render.tsx:823-838`), and economics.
- Never stored: any verdict, approval state, or settlement answer.

**Q3. Where does cognitive load come from, and what is the primary action?**
From six or more regions, a rail, equal-weight choices, and three claims per move (M7). Primary action by state, in precedence order: pending approval (approve or reject), then settleable (request observation and ruling), then the recommended available choice, then open case. Prerequisite named in plain words.

**Q4. Which capabilities are kept, and how do they map?**
- Keep: decision region with gates and review; claim rows (after M1 fixes); receipt; debugger with literal `authority: false` and `settles: false`; evidence list; onboarding (PRODUCT.md:40); owner-pinned regions; read-only economics (off the cockpit, M12); lineage table and graph.
- Map: object view to Evidence and Sources (Cognate projection once built); context ribbon to "Where you are"; approval inbox to SEA-Forge approval records (B3); execution outline to sxr and Cognate traces (B4); agent session to Cognate session primitives (B4). The agent region is append-only and read-only; keep it that way until an agent exists.
- Cut from the default view: SVG lineage (keep the table), retrieval panel as a canonical region, agent region until a session exists, economics.

**Q5. What makes Horizon decide or blur recorded and applied effects, and how is it prevented?**
- Triggers: the combined settle button (B2); "Allowed by SEA-Forge" from config (B2, M3); Horizon-authored availability, settleable, and v1 final settlement (B1); "Horizon policy only"; regex attribution (M3); the shared success colour (M2); `state: string` (M1).
- Existing prevention: typed claims with "Not observed yet" text (`model.ts:749-766`); settleable only when governed and observed (`model.ts:791-794`); the server re-checks settle (`app.ts:507-511`); the approval route is user-only and origin-checked (`app.ts:419, 1505-1516`); INV-07 "a receipt is not settlement" (`interaction-model.sea:789-795`).
- Missing: a discriminated union for claim state; a test that a recorded or pending move never renders "applied" or a green success state; a forbidden-word check for "applied" or "done" on non-observed claims; a source ref on every verdict; a compile-time guard on the literal authority fields.

## Recommended Revision to the Hypothesis

1. Restate the invariant: Horizon computes only observable frame, reach and visibility; authority, settlement and observed effect come from siblings with source refs; `unknown` is the default.
2. Add the claim table (accepted, settled, observed, improved) with owner and source for each.
3. Name the target operator. Drop the no-knowledge promise where setup is involved.
4. Cite INV-03, INV-04 and INV-07 by id.
5. Drop the Palantir authoring patterns and the DomainForge authoring rows.
6. Replace "OODA loop" with a testable primary-action rule.

## Next Sprint (only this)

1. Fix the decision leak at `model.ts:742` and `:800`, and the v1 `final: true` at `app.ts:501-503`.
2. Make `WorkspaceClaim.state` a discriminated union.
3. Replace the regex approval id and the approvals boolean with a typed SEA-Forge approval record contract (versioned, schema `/2`).
4. Add tests: recorded never reads applied; every verdict has a sibling source ref; exactly one primary action per screen.
5. Defer the agent session, execution outline, context ribbon and candidate proposals until Cognate and RealityTrace publish read-only projections.

# Concepts Brief: AnchoredFeatureHypothesis (Horizon world-first operations console)

**Mode:** BRAINSTORM
**Reviewers:** egm-design (Skeptical Architect), egm-codebase-details (Codebase Grounding), egm-zoom-out (Simplicity and Scope), egm-comprehension (Naive Operator UX), egm-implementation-readiness (Delivery Readiness), egm-structural (Structure and Decomposition)

**Reviewer status:** all six completed.

**Verdict:** The concept is not startable as written. Three blockers must be resolved first: scope, the governed agent path, and ownership of ontology and action authoring. A first slice is definable once they are.

**Verification note:** The codebase reviewer checked paths and symbols against the repos. Other reviewers worked from reading and grep, so their line references are indicative and should be re-checked before use.

---

## 🔴 Blockers

### B1. Scope is unbounded
- **Lenses:** zoom-out, design, implementation-readiness, structural
- **Scope:** whole concept; `features.csv` (65 rows: 24 must, 20 should, 12 could, 9 skip; the concept says "about 60")
- **Discrepancy:** The concept stacks the 65-row Palantir matrix, five named patterns, seven integrations, and every current capability into one hypothesis. It has no cut, no pass test, and does not carry the recon's out-of-scope list (microservice estate, certifications, connectors, partner marketplace, FDE service model, installed base). Recon section 12 sizes this as XL and orders five stages.
- **Recommendation:** Treat the matrix as a source of about 10 operator-loop patterns, not a checklist. Name one stage with a pass test and an explicit skip list. Add owner, horizon_route, and acceptance_test columns to the CSV.

### B2. The governed agent move path is unverified
- **Lenses:** design, zoom-out, implementation-readiness, codebase-details, comprehension
- **Scope:** agent session, tool approvals, CSV rows 14-16, 24-30, 36, 38-39, 46, 64
- **Discrepancy:** OQ-IDM-03 (`interaction-model.sea` ~849-855) is open: no verified evaluate-only move preview exists, so "afforded" and `likely_allow` have no source. No agent role exists in the model. The real path is Horizon to Cognate to SEA-Forge (`interaction-model.sea` ~391-393). SEA-Forge exposes `commit_plan` and `decide` (`sea-rs/crates/sea-forge-server/src/lib.rs` ~3456, ~3730) and `issue_with_approval` (postgres.rs), but no move or intent evaluation endpoint. The word "move" is not a governed primitive in SEA-Forge; the code uses it for a committed intent. Commit runs as a Cognate job held in memory (`src/agents/navigation-commit.ts` ~43-44), so pending approvals do not survive a restart.
- **Recommendation:** Spike the SEA-Forge move and preview contract before any agent UI. Until then the agent may propose into review and never submit. Approvals are SEA-Forge-owned; Horizon renders them and links out. Gates with no preview render "unknown" as text. Re-anchor "governed moves" to case plan commit and approve/reject. Add an agent-proposer role to the `.sea` model.

### B3. Ontology and action authoring sits outside Horizon
- **Lenses:** design, structural, implementation-readiness, zoom-out
- **Scope:** CSV rows 4-9, 11-13, 34, 37, 48-49, 61-63, 65 (object types, action types with parameters, writeback, typed variables, inline action form, submit authority, per-property security, generated CRUD, pipelines)
- **Discrepancy:** INV-06 and REQ-STACK-001 say DomainForge alone owns semantics. The `.sea` declares no ActionType schema. Authoring types, action definitions, or submit authority in Horizon contradicts INV-06 and PRODUCT.md ("never decides"). Rows 2, 15, 36 (platform shell, identity, audit) are platform-owned too.
- **Recommendation:** Reclassify as read-only consumption of DomainForge artifacts. Cut pipelines and CRUD generation. Horizon consumes a read-only shape, for example `{operation_ref, parameters[{name,type,required}], reversibility, submit_authority, criteria_ref, expected_outcome_ref}`. The criteria are evaluated by SEA-Forge or Cognate; Horizon renders the verdict.

### B4. Submission criteria and Allow/Ask rules would make Horizon decide
- **Lenses:** design, implementation-readiness, structural
- **Scope:** CSV rows 16, 28, 30; "submission criteria" in the concept; `src/ui/workspace/render.tsx` ~384-397 (ActionForm posts no parameters)
- **Discrepancy:** Palantir's per-tool Allow/Ask rule builder and session pre-approval put authority policy in the cockpit. This violates PRODUCT.md principle 1 and INV-03. `CommitIntentInput` (`interaction-model.sea` ~525-535) is a frozen contract.
- **Recommendation:** Approval policy belongs to SEA-Forge. Horizon displays the authority result and its blocker reason, and never authors it. Use "Request approval" wording, not "Allow".

### B5. No partition, loop list, or enumerated keep-list
- **Lenses:** comprehension, structural, design, implementation-readiness
- **Scope:** whole concept
- **Discrepancy:** The concept names patterns (object views, action types, agent session, context ribbon, branch proposals, operator inbox, Boyd loops) but gives no loops, no screen-to-loop mapping, and no keep-list. "Every capability mapped to one loop" cannot be checked. The keep-list cannot be tested without route-level owners.
- **Recommendation:** Adopt the partition in the structural findings below and make the keep-list a checked artifact. Map every route in `src/app.ts` to an owning test before any destruction (see keep-list).

### B6. "Gauntlet" and "SWE_SEED" integrations do not exist in Horizon
- **Lenses:** codebase-details
- **Scope:** constraint 1 ("keep all GodSpeed integrations")
- **Discrepancy:** Horizon has no Gauntlet integration (only type comments at `src/ui/surface2/grammar.ts` 120, 122). No SWE_SEED references exist in `Horizon/src`. "Keep" is not satisfiable for these.
- **Recommendation:** State them as new integrations and scope them explicitly, or drop them from the keep constraint.

---

## 🟡 Major

### M1. Recorded effects can be presented as applied
- **Lenses:** design, implementation-readiness, comprehension
- **Scope:** `src/ui/workspace/model.ts` ~739-741, ~717-731 (StoredMoveFacts)
- **Discrepancy:** "Allowed by SEA-Forge" is derived from an intent record existing plus a governed config bit. StoredMoveFacts carries no SEA-Forge decision reference.
- **Recommendation:** Carry the decision id and verdict. Otherwise render "decision not captured". Render decided, recorded, observed, and settlement as separate rows. No "applied" text without an observed claim.

### M2. Competing primary actions and overlapping owners
- **Lenses:** comprehension, design, structural, zoom-out
- **Scope:** `render.tsx` ~573 ("The next decision" is the one primary slot); approvals appear in the status rail, moves, inbox, and session card; "context" means three things (the "Where you are" region, the context ribbon, retrieval citations)
- **Recommendation:** One primary action per screen, asserted in a render test. One owner per capability; other places link to it. Retrieval citations stay Inspect-only and never appear as ribbon context.

### M3. No screen list, landing view, or morning routine
- **Lenses:** comprehension
- **Scope:** whole concept
- **Discrepancy:** The current screens (`render.tsx` ~334-708: "Where you are", "The next decision", "Your governed moves", "Evidence", "Sources and refs", "Lineage", "Agent contributions", "Decision receipt", "Getting started") are not mapped. PRODUCT.md's four-step job (see what the world allows, pick a move, authority decides, see what happened) is dropped.
- **Recommendation:** Map each screen to one loop and one job. Name the landing screen. State the single primary action per screen.

### M4. Loops are undefined and the naming collides
- **Lenses:** comprehension, structural, design
- **Discrepancy:** "Operating loop" and "OODA destruction-and-creation" have no enumerated loops, triggers, or verbs. "Decide" collides with "Horizon never decides" and `SurfaceIntent.decide`. The `.sea` `NavigationResponsibility` enum already has orient, inspect, choose, commit, observe, review.
- **Recommendation:** Use the enum as the loop basis, with "choose" and "commit". Three tiers: loops, screens (closed `SurfaceSpecRecord` instances, INV-09), components (ribbon, inbox, tabs).

### M5. Chat-first drift
- **Lenses:** comprehension, design, zoom-out, structural
- **Scope:** "agent session", "context ribbon", "execution outline"; recon section 4.4 S38 and section 7.1 copy a conversational composer; CSV rows 14, 18, 25, 33, 40, 41, 46
- **Discrepancy:** PRODUCT.md lists chat-first as an anti-reference. A session risks becoming a transcript.
- **Recommendation:** The session is a proposal-producing component in Review, not a primary screen. Express it as an ordered list of intent and evidence refs anchored to objects, not as a transcript.

### M6. "Branch proposals" are unmapped
- **Lenses:** design, codebase-details, structural, implementation-readiness
- **Discrepancy:** Foundry branches are ontology-level. Horizon has only candidate `WorldRevision`/`CandidateRevision` (`interaction-model.sea` ~333-338, INV-05; J03 partially bound). The only "proposal" in code is a counterfactual preview (`src/domain/debugger.ts` ~536-574), which is not settlement.
- **Recommendation:** Rename to "candidate proposal". Define it as a DomainForge candidate revision, reviewed through SEA-Forge promotion. Keep the debugger counterfactual labelled as preview only.

### M7. Operator inbox has no list view and does not survive restart
- **Lenses:** codebase-details, implementation-readiness
- **Discrepancy:** Only a POST resolves one `approval_id` (`src/app.ts` ~1390-1407). There is no list. Pending approvals held in memory are lost on restart.
- **Recommendation:** The inbox reads pending approval_ids from the durable store. A restart test shows the list persists. Horizon has no approve or deny control; it links to SEA-Forge. Reuse `resolveApproval` and `seaForgeCall` (`src/adapters/sea-forge-approvals.ts`).

### M8. Architecture: no-JS native forms and streaming
- **Lenses:** design
- **Discrepancy:** `render.tsx` ~5-6 is deliberately no-client-bundle with native forms. A streaming outline and inline approval cards need client state or polling, which breaks that accessibility guarantee.
- **Recommendation:** The session is a server-rendered projection of stored events. Approvals stay native forms.

### M9. Contracts named but not shaped
- **Lenses:** implementation-readiness
- **Discrepancy:** `PromotionDecisionMessage`, `ExecutionRecordMessage`, `SettlementRecordMessage`, `AuthorityDecisionRecord`, `SurfaceBindingMessage` have no fields. No approval-record or outline-event schema exists.
- **Recommendation:** Specify them in `.sea` first. Use `WorkspaceMove` (decided, recorded, observed, settlement, approval_id, settleable) as the outline basis.

### M10. Sibling sequencing and DomainForge location
- **Lenses:** codebase-details, implementation-readiness, design
- **Discrepancy:** `Horizon/.sea/domainforge` does not exist. DomainForge is the vendored tarball `Horizon/.cognate/vendor/godspeedai-cognate-domainforge-0.7.0.tgz` (`package.json` 18; loaded at `src/adapters/semantic.ts` 3, 35), and the code lives in `sea-rs/crates/sea-forge-domainforge` and `sea-forge-domain`. SWE_SEED appears in no `.sea` entity.
- **Recommendation:** Correct the DomainForge location. Define SWE_SEED's role. Document one integration contract per sibling.

### M11. Services named in the model are declarations only
- **Lenses:** codebase-details
- **Scope:** `interaction-model.sea` ~135-140 declares CognateHost, DomainForgeService, SEAForgeService, GauntletService, RealityTraceService, ContextKernelService as `entity`. CaseRecord (~162) and SettlementReviewRecord (~320) have zero references in `src`. AffordanceAssessment and NavigationFrame exist as TS types (`src/domain/navigation.ts` ~187; `src/adapters/navigation.ts` 12).
- **Recommendation:** Do not describe them as services in the brief. Mark declared-but-unbound entities explicitly.

### M12. Migration and rollback
- **Lenses:** implementation-readiness
- **Discrepancy:** Schema `horizon.workspace/1` and `WORKSPACE_REGION_ORDER` (`model.ts` 19-20) are consumed by render. Region drift: six regions in the order, plus a hardcoded seventh "moves" region at `render.tsx` ~635-638.
- **Recommendation:** Version the schema or keep an adapter. Keep old `/workspace` routes live behind a flag as rollback. Pending approvals in the store must still resolve through `/workspace/approval`. Reconcile the region model.

### M13. Keep-list at risk
- **Lenses:** design, comprehension, codebase-details, implementation-readiness
- **Discrepancy:** Region order and the append-only agent region (`model.ts` 20, 342) are structural, and any session must keep "cannot reorder, pin or replace the decision" (`render.tsx` ~694). Onboarding and "Getting started" are not mentioned in the concept.
- **Recommendation:** Ratify the keep-list before any Boyd destruction pass (see keep-list below).

---

## 🟢 Nit

- **N1.** The matrix has 65 rows, not about 60. CSV row 33 duplicates row 29. Rows 19/33, 13/65, 23/24, 22/21 overlap; merge them.
- **N2.** `render.tsx` ~355 "Observe and settle" fuses observation with settlement, against INV-07. Split the verb.
- **N3.** Writeback "latest state" (row 9) reads as an applied effect. Label it as recorded.
- **N4.** Mobile remote (`/workspace/remote`, `render.tsx` ~519-521) ships, but recon section 13 calls it unmapped. Keep it in the inventory.
- **N5.** `src/adapters/operational-objects.ts` line 6 says "Cognate 0.6.1"; the pinned vendor is 0.7.0.
- **N6.** The CSV has no fit, loop, owner, or route column. Every row is original yes / clone no. Add them.
- **N7.** Vocabulary: "action" (Foundry typed write, `WorkspaceAction`, operation), "object" vs focus set, "screen" vs frame. Add a glossary.
- **N8.** Cross-cutting chrome (theme toggle, skip link, footer intent-schema line, onboarding resume) belongs to no loop. Name it an explicit chrome exception.
- **N9.** Cognate, Gauntlet, SWE_SEED, Context Kernel, Cognate Workbench, DomainForge, and RealityTrace need one-line definitions. "Object view" and "operator inbox" have no Horizon referent; the interaction model's J04 says "home attention view".
- **N10.** Use the word "Request approval", not "Allow".

---

## Proposed partition (structural lens)

| Loop (enum) | Capabilities |
|---|---|
| Orient | status rail (off and not-configured states); scope and world kind (historical, current, candidate; INV-05); "Where you are" context; case open and purpose; state machine; onboarding and activation; lineage |
| Inspect | object view (projection only); focus set; sources and refs; debugger answers (`authority:false`, `settles:false`); retrieval citations (`untrusted_reference`); agent contributions (labelled, cannot reorder or replace the decision) |
| Choose | affordance choices with one primary; blocked list with gates (blocked, unknown, conflicted); review card (reversibility, payment, expected evidence, escalation); case economics (estimates labelled); context ribbon as scoping for a proposal |
| Commit | surface actions and forms; `commit_navigation_intent`; approval answer routed to SEA-Forge; agent session submits proposals only; remote control (semantics unverified) |
| Review and observe | operator inbox (approvals, escalations, candidate proposals); governed moves with decided, recorded, observed, settlement kept distinct; receipt; evidence; develop and eval items |
| Chrome (exception) | theme, skip link, footer |

---

## Keep-list (explicit, to be ratified before any destruction)

- Decided / Recorded / Observed rows (`render.tsx` ~303-327)
- Owner-pinned region order and append-only agent region (`model.ts` 20, 342)
- Three-step Getting Started and Skip setup (`render.tsx` ~400-448)
- Refusal copy and `refusedBy` attribution (`model.ts` ~798-825)
- Status rail with off and not-configured states (`render.tsx` ~503-515)
- Case economics `/workspace/economics`, observed vs estimate badges (`economics.tsx` 1-5)
- Mobile remote `/workspace/remote` (`render.tsx` ~519-521)
- Debugger answers with `authority:false` and `settles:false` (`inspect.ts` 1-15)
- Context Kernel citations, class `untrusted_reference` (`inspect.ts` 12-14)
- Lineage folded-node disclosure (`render.tsx` ~119-170)
- Receipt deep links `?receipt=` and `#receipt` (`render.tsx` ~341, 465)
- No-JS native forms (`render.tsx` 5-6)
- Routes in `src/app.ts`: `/health`, `/frame`, `/intent`, `/surface` (+ schema, intent), `/workspace`, `/workspace.json`, `/workspace/economics`, `/workspace/inspect`, `/workspace/intent`, `/workspace/case`, `/workspace/approval`, `/workspace/settle`, `/workspace/onboarding/skip`, `/workspace/onboarding/resume`, `/workspace/remote` (+ status, events, start, refresh, stop). Each needs an owning golden test.

---

## Proposed MVP (ordered, pending operator decision)

- **M0.** Read-only object and claims view over existing `model.ts`. Decided, recorded, observed, and settlement labelled separately.
- **M1.** Next-move panel fed from `AffordanceAssessment`. Blocked actions disabled with the reason at the control.
- **M2.** Approval inbox of pending approval_ids from the durable store. No approve or deny control; links to SEA-Forge.
- **M3.** Settlement and evidence view reusing `navigation-settlement.ts`, with obligations distinct from RealityTrace observations.
- **Deferred** until the SEA-Forge contract is confirmed: agent session, approvals UI, candidate proposals, Allow/Ask rules, ontology authoring.
- **Cut:** CSV rows 2-9, 11-13, 15, 19-21, 25-27, 31, 33-34, 37, 40-42, 44, 47-51, 61-63; stage the rest.

## First-slice definition of done (implementation-readiness)

1. Keep-list file with a golden test per route, passing before and after the change.
2. `WorkspaceMove` and the approval record documented in `.sea`. No Horizon-owned authority field.
3. Committed move shows four separate claim rows. No "applied" text without an observed claim. Gates with no preview render "unknown".
4. Approval inbox reads the durable store; a restart test shows persistence. No approve or deny control.
5. One primary action per screen, asserted in a render test.
6. Feature-flagged route; old render is the default and the rollback.
7. No new sibling dependency beyond the existing Cognate commit path, documented in a contract file.

## Open questions for the operator

1. Are Gauntlet and SWE_SEED new integrations in scope, or dropped from the keep constraint (B6)?
2. Does SEA-Forge need a move preview endpoint spiked before any agent UI (B2)?
3. Confirm DomainForge as the owner of action definitions and ontology authoring (B3).

# Stage 8 — Intermediate Zoom Out Report

- Target: `.agents/specs/Horizon_Operator_Workspace_Design_v1.md` (411 lines), unchanged since Stage 5.
- Reviewer: egm-zoom-out (Haiku), standard `zoom-out-standard.md`.
- Context it read: `zoom_out_report.md`, `critic_report.md` (including C7-28), `evals_requirement_brief.md`.
- Reviewer checks: `src/` has no journal, notebook, or eval module. `src/ui/surface2/` exists (only file names were checked). Cognate packages are declared in `package.json` (Stage 5) but are not installed in `node_modules`, so no Cognate notes or annotation facility could be verified.

## Verdict

Apply the Stage 5 cut (ZO-1: v1 = Slices A–C) **before** adding anything from Stage 7. Several Stage 7 findings (C7-8 advisor continuity, C7-11 idempotency, C7-15 trace join) concern slices outside v1. They go to a deferred list with triggers, not into v1 sections. Evals fit inside Slice C with **no new slice and no new component**.

## 1. Size limits for the Stage 7 additions (v1 content only)

| Addition | Rule |
|---|---|
| Goals / Non-goals | One block of ≤10 lines. Non-goals = Slices D–G, benchmarks, LLM judge, regression runs. |
| Alternatives | No standalone section. Add one table under §3 step 4, with a row per new v1 component (expected: 0–1, the journal store). Alternatives for the advisor and for delegation move with their deferred slices. |
| Risks & Mitigations | ≤8 rows for v1. Each deferred risk is recorded with its deferred item and trigger. |
| Architecture | A component list of ≤6 lines, plus the J1/J2 data flow. It points to the §2 table and does not repeat it. |
| Glossary | No separate glossary. Define v1 terms on first use. Move EGM, replicator, leanrea, donor, and Cobalt out of the body. |
| Envelope (C7-12) | No table. Put the numbers in the Slice A measurement plan, labelled "assumption until measured". |
| Acceptance criteria | One row per v1 journey: J1, J2, and one eval journey. |

Estimated net addition: about 60–80 lines.

## 2. Reviewer conflicts — resolution

**Decide now vs measure first.** Split the items by kind rather than treating the choice as either/or:
- **Decide now (correctness and authority):** the day identity key (ZO-9), filter-before-count access enforcement (C7-10), the durable note write path (C7-3), and eval label ownership and storage (§3 below).
- **Measure first (performance):** envelope numbers (C7-12), cursors and paging (ZO-7), and the trace join (ZO-6).
- **Defer with a trigger:** idempotency, admission records, and retry bounds (C7-11), advisor continuity (C7-8), and trace-join identity (C7-15), all at Slice E or later.

**Add sections vs cut scope.** Cut scope first (ZO-1). Size every new section for v1 only. Material that serves only deferred slices goes to the deferred list, never into a new section.

## 3. Evals as first-class in v1, without a second harness

- A **label** is a tag (from §5 tagging) on an **authored note block**. The block embeds a typed reference to the run, using the reference block type from L125. This needs no placement or backlink operation, so Slice D stays deferred.
- Attributes on the block: run reference, native run ID, labeler, pass/fail, first-failure text, and the version of the rubric or first-failure note. These are needed so that later regression comparison (brief item 8) is possible.
- The **grouping view** is a tag-filtered retrieval, which Slice C already provides. It shows counts per group. **No aggregate pass rate in v1**, because failures must be read before any score is trusted.
- The set of labelled blocks **is** the v1 eval set. No separate eval-set entity is needed.
- Compared with the brief's proposal: no separate grouping view is needed, and the label metadata above was missing.

**Proposed ownership row for the §2 table (this closes the ownership part of C7-28):**

| Concern | Owner | Horizon's role |
|---|---|---|
| Eval cases, graders, judge rubrics, pass^k results, regression runs | Cognate (SDK capability; runs in Workbench) | Render results with environment, model, and grader version |
| Organizational rules used as the grading basis | SEA-Forge (versioned references) | Show which rule version applied |
| Trajectory evidence for trajectory grading | RealityTrace | Link only (the join stays deferred) |
| Operator labels and first-failure notes | Horizon (authored content, the existing §9 exception) | Native authoring, tagging, grouping |
| Benchmark results for model selection | Model/provider configuration owner | Not shown in v1 |

## 4. Findings

| # | Sev | Lines | Problem | Fix |
|---|---|---|---|---|
| S8-1 | 🔴 | §10, L131–134, L252 | Labelling a run would quietly need a cross-context link, which is Slice D (deferred). | Label = tag on an authored block with an embedded typed reference (L125). No relation operation. |
| S8-2 | 🔴 | §2 table, L47 | A human pass/fail is a new status. Without a rule it reads as acceptance, which breaks the "observed ≠ verified ≠ accepted" chain. | Name it "operator-reviewed". State that it does not change case status or SEA-Forge authority. Test: labelling a run leaves case state unchanged. |
| S8-3 | 🔴 | L44, L250, §3 L60; C7-8, C7-11, C7-15 | Some Stage 7 Blockers concern slices v1 excludes. Fixing them now adds weight with no v1 benefit. | Defer C7-8, C7-11, and C7-15 with triggers. Decide only the four v1 items in §2. |
| S8-4 | 🟡 | §1–§11 | Full-length Stage 7 sections would double the weight of v1. | Apply the size limits in §1. |
| S8-5 | 🟡 | §2 table | There is no row for eval ownership. | Add the proposed row. |
| S8-6 | 🟡 | L352–361 | The v1 evidence list has no eval item. | Add: "A labelled failure can be recorded on a real run, grouped by tag, and does not change case status." |
| S8-7 | 🟡 | §5 L123–125, §9 L250 | Storing eval labels separately would create a second authored-content exception. | Labels are authored blocks under the same exception. No eval store. |
| S8-8 | 🟢 | brief item 3 | Benchmark results and product-eval scores must never mix. | Non-goal: no benchmark display in v1. |
| S8-9 | 🟢 | §6 L154–162 | Judge model and context isolation is a Cognate concern. | Deferred list: "judge isolation is a Cognate requirement, verified by J7". |

## 5. Effect on Stage 5 findings

- **ZO-1 is stronger.** Both the Stage 7 additions and the evals requirement push against it. Hold the cut and add only S8-6.
- **ZO-2 holds.** S8-1 keeps placements deferred.
- **ZO-3 holds.** "Each failure becomes a case" is a human workflow and must not reopen Slice G.
- **ZO-4 holds** (see S8-9).
- **ZO-5 is stronger.** Labels and grouping must go through surface2, so reconciling the two is a prerequisite for Slice C. How much that costs is unverified.
- **ZO-6 holds.** Trajectory grading is the second eval tier, and its trigger is "trajectory grading in scope".
- **ZO-7 holds.** Measure first.
- **ZO-8 is stronger.** Envelope and eval-measurement assumptions belong in the separate implementation plan.
- **ZO-9 holds** with less pressure, because labels key on runs, not days.
- **ZO-10 to ZO-13 are unchanged.** ZO-11 still blocks Slice B.

## 6. Reconciliation with the operator methodology addendum (Elephant)

The operator supplied `methodology_addendum_brief.md` after this stage ran. It states product intent, so where it conflicts with a reviewer's scope cut, the operator's intent governs **what the product is**. The reviewers' YAGNI findings still govern **what ships in v1 and in which order**. Each earlier finding is re-ruled below:

| Finding | Ruling | Reason |
|---|---|---|
| ZO-1 (v1 = Slices A–C) | **Holds as sequencing, not as a product cut.** D–G stay in the design as committed later slices with triggers, not as "deferred, maybe". | The addendum asks for refinement within approved scope and says to document gaps rather than redesign. Its Journey 1 still requires a **case link** and a **placement**, so v1 needs at least one of each (see ZO-2). |
| ZO-2 (defer placements, backlinks, map) | **Partly overridden.** v1 needs a single placement (journal + one case) with the rule "placement is not a copy", because Journey 1 requires it. Backlinks, collections, and the map stay later. | Addendum Journey 1 and its journal rules. |
| ZO-3 (remove the learning subsystem) | **Partly overridden.** Keep the human-gated loop: *propose* a verified lesson, and never promote one silently (Journey 6, addendum §7). Learned-context injection and token measurement stay out. | Learn/Compound is a core methodology stage. The addendum names unreviewed conclusions becoming authoritative as a risk. |
| ZO-4 (one advisor) | **Contested in favour of the addendum's framing.** Keep three *responsibilities* (advisor, coordinator, reviewer) with no new services. The independent reviewer's context isolation is a Horizon-visible requirement, because the operator sees its verdict in Journey 4. | The addendum says explicitly: "responsibilities, not mandatory new services". |
| ZO-10, C7-9 (`~/.agents` donor) | **Holds, and the addendum confirms it:** patterns, not dependencies. | Addendum §7. |
| S8-2 ("operator-reviewed" status) | **Holds and gets stronger.** Place it explicitly in the state ladder requested → authorized → executed → observed → verified → accepted → settled. An eval label is an operator judgment on a run. It is not "verified" and it is not "accepted". | Addendum §3. |
| C7-28, S8 §3 (evals) | **Holds.** The addendum's "cost and effort per independently accepted outcome" is the evals north-star metric, and its Validate/Instrument/Learn stages are the eval loop. Journey 6 ("what was predicted vs what happened") is a product eval of predictions. | Addendum §1, §7, Journey 6. |
| C7-13 (acceptance criteria) | **Replace J1–J10 with the addendum's seven journeys,** or map J1–J10 onto them, and add the S8-6 eval journey. | The addendum asks for real-UI and real-service validation. |

**New gaps the addendum reveals in the spec** (to be checked in Stage 9 and fixed in remediation):

- **G-1 🟡:** the Context Kernel is not in the §2 ownership table. Context assembly for the advisor and reviewer has no owner.
- **G-2 🟡:** the Explore / Operate / Work compositions and the Explore, Operate, Build, Monitor, Compare, Develop journeys are not mapped to spec sections. The spec should say which composition each feature lives in.
- **G-3 🟡:** the requested → … → settled state ladder is not stated as one ladder with an owner per state. L47 has only part of it.
- **G-4 🟡:** neither the Field Case nor the methodology stages appear. Without forcing a wizard, the spec should say how a case's position (including backward moves, branches, and abandonment) is shown, and who owns it (SEA-Forge casework).
- **G-5 🟢:** the predictions-vs-evidence distinction is required in the UI ("a prediction is not evidence"), but the spec has no prediction object or display.
- **G-6 🟢:** keeping action semantics the same across GUI, terminal, and machine interfaces is not stated.

## Not checked

- Cognate notes or annotation facility (other repo; packages not installed).
- The contents of `src/ui/surface2/`.
- Whether RealityTrace's read capability can supply run references for labels.

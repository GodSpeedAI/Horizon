# Stage 5 — Initial Zoom Out Report

- Target: `.agents/specs/Horizon_Operator_Workspace_Design_v1.md` (lines 1–411)
- Split: FeatureRange 1..298 (§1–11), DetailedRange 299..411 (§12–15)
- Reviewer: egm-zoom-out (Haiku), standard `zoom-out-standard.md`
- Goldfish context: none beyond files the spec names
- Elephant spot-check: findings 9 (L113) and 11 (L407) re-read and confirmed against the text.

## Verdict

Revise before the next stage. The main problem is scope. The document describes a whole platform as a single v1. The reuse-first stance (§3) and the rule that Horizon is an interface and not a second harness both hold up.

What the reviewer checked: `src/ui/workspace/model.ts` and `src/ui/surface2/` exist. `package.json` already depends on the Cognate durable packages (artifacts, continuations, projections, realitytrace, store-sqlite). No notebook or journal module exists in `src/`. The Workbench-side paths are in another repo and were not checked.

## Findings

| # | Sev | Lines | Problem | Fix |
|---|-----|-------|---------|-----|
| 1 | 🔴 | §5–§7, §13 Slices D–G (L342–348) | One v1 holds a notebook, placements, backlinks, a relationship map, governed case orchestration, event routing, a cross-store trajectory join, a learned-context subsystem, and three agent roles. The spec's own thinnest demo (L376) needs almost none of it. | Declare v1 = Slices A–C plus journeys J1/J2. Move D–G to a deferred section with explicit triggers, and drop their items from the v1 minimum evidence (L352–361). |
| 2 | 🟡 | L127–137, L144, L252 | Four relation operations, backlinks, and a map are specified before a single note has been proven. J3 depends on them. | v1 = one entry on one day. Defer placements, backlinks, and the map to Slice D. Keep revision only if Cognate provides it natively. |
| 3 | 🟡 | §6 L164–175, J7 L274, Slice G L348, donor row L74 | The learning subsystem (capture, role-scoped injection, token measurement, memory isolation) is speculative. It also pulls session-learning from a personal `~/.agents` setup into product scope. | Remove it and Slice G. Keep only the isolation invariant (L174) as a constraint. |
| 4 | 🟡 | L154–162 | The three-role agent setup (advisor, coordinator, reviewer) is speculative, and L154 says to use existing Cognate constructs anyway. | One advisor that delegates to Workbench. State reviewer isolation as a Workbench requirement, not a Horizon role. |
| 5 | 🟡 | §9 L241–250 vs L49, L105 | The six-field "source-to-surface contract" is new and sits beside the existing `horizon.surface/2` (`src/ui/surface2/`). The two are never reconciled. | Map which fields surface2 already carries. Add only the missing ones, with file references. |
| 6 | 🟡 | L203–205, L233–237, L215 | The trajectory join, its cursors, redaction, and recovery are prescribed even though the gap itself is marked unverified (L215). | Make the join a §12 reconnaissance question. Design it after the gap is measured. |
| 7 | 🟡 | §11 L290–293 | Cursor-based reads, lazy trace loading, and recoverable cursors are required with no measured bottleneck. L362 already asks for measurements first. | "Measure first. Add cursoring when a measured threshold is exceeded." |
| 8 | 🟡 | §12–§14 (L299–389) | The procedure, deliverables, and slice plan sit inside the design. L301 says "before prescribing a design", but §5–§9 already prescribe designs. | Move §12–14 to an implementation plan or checklist. Link it from the design. |
| 9 | 🟡 | L113 | The identity key includes the "recorded timezone convention", yet the same line requires stable references across timezone changes. These contradict. | Key on (organization, operator, local date). Store the timezone convention as an attribute of the entry. |
| 10 | 🟡 | L74 vs L77, L295 | Listing "passive observations, case correlation" from `~/.agents` creates a second owner next to RealityTrace. | Remove those items from the donor row. `~/.agents` is for research only, with no product dependency. |
| 11 | 🟡 | L407 (also L7, L79) | The "Composer/conversation panel mockup" pointer points at this document itself. The required V3 prototype is neither in the repo nor linked. | Link the V3 artifact, or state that it is not supplied yet and that this blocks Slice B. |
| 12 | 🟢 | L93 | Color and visual-register wording belongs to Workbench `DESIGN.md`. | Replace with "Workbench Cobalt tokens per DESIGN.md". |
| 13 | 🟢 | header L3–8 | The spec cites no root philosophy or README document for alignment. | Add one line citing the document it aligns to. |

## Not checked

The Workbench-side claims in §8 (L213–215) and the Workbench paths in §15.

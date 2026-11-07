# EGM review — Horizon Operator Workspace Design v1 (2026-11-06)

- Target: `.agents/specs/Horizon_Operator_Workspace_Design_v1.md`. The review made no edits to it.
- Mode: interactive review of all five stages. Split: FeatureRange L1–298, DetailedRange L299–411.
- Outcome: the review was concluded after Stage 9 and then resolved under the operator's instruction. v1 is unchanged. The resolution is `../../specs/Horizon_Operator_Workspace_Design_v2.md` plus `..._v2_technical_annex.md`, re-checked once (see `goldfish_review_report.md`).
- Reviewers: Haiku throughout. Stage 9's codebase-details reviewer ran on Sonnet because it had to trace code across repos.

## Reports, in order

1. `zoom_out_report.md` (Stage 5): the spec puts a whole platform into v1. The proposed cut is v1 = Slices A–C.
2. `comprehension_report.md` (Stage 6): key mechanisms and systems are never defined, and the spec does not say what already exists.
3. `critic_report.md` (Stage 7): it lacks Alternatives and Risks sections, its write path contradicts itself, and it has no evals design (C7-28).
4. `intermediate_zoom_out_report.md` (Stage 8): sets size caps on the sections to add, proposes a v1 cut for evals, and reconciles the spec against the methodology addendum (gaps G-1–G-6).
5. `implementation_readiness_report.md` (Stage 9): code facts. There is no Cognate notes store, surface2 cannot express notebook blocks, and Cognate has no eval capability. The slices have no files, tests, or done criteria.

## Operator context supplied during the review

- `evals_requirement_brief.md`: evals and benchmarking are first-class.
- `methodology_addendum_brief.md`: the FDE methodology, UX intent, and seven end-to-end journeys.
- `capability_addendum_brief.md`: in Workbench, plugins are how capabilities are presented, and the parts of that which touch Horizon (G-7, G-8). The text supplied was cut off partway through.

## Suggested remediation order

1. Apply the scope cut (ZO-1, read with the S8 §6 reconciliation).
2. Fix the code facts (R9-2, R9-3, R9-11).
3. Record the v1 decisions (R9-4 to R9-10).
4. Add v1-sized Goals, Alternatives, Risks, and Architecture sections, using the S8 §1 caps.
5. Write the glossary terms at first use.
6. Apply the style fixes.

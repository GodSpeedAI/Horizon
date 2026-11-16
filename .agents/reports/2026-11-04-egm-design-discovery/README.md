# EGM Design-Discovery Bundle (2026-11-04)

Second phase of the EGM process, per owner instruction: genuine design-discovery and independent criticism of the reconnaissance bundle's essential-design hypothesis, before any implementation planning. No product source was modified; no frozen contract rewritten; the build stage was not launched.

## What this is

The `egm-brainstorm` workflow (installed skill at `~/projects/elephant-goldfish-model/skills/egm-brainstorm/`) executed at system level over the reconnaissance bundle. Six fresh-context Goldfish reviewers were dispatched in parallel with no conversation history, per the skill's delegation rule; each received the central design question (verbatim), the hypothesis under review (`../2026-11-04-egm-distillation/03-essential-design-hypothesis.md`), the facts baseline (`01`, `02`, `07` of that bundle), and lens-specific sources — and were **excluded from** the bundle's `04`/`05`/`06` (downstream judgments) to preserve independence from the Elephant's reasoning. The synthesizer (this session) deduplicated, contested where source evidence disproved, and reassessed the decision register.

## Contents

| File | What it is |
| --- | --- |
| `01-goldfish-synthesis.md` | Deduplicated findings: convergent (G-1..G-7), accepted corrections (W-1..W-5 — where the hypothesis was verifiably wrong), new findings (N-1..N-10), contested with counter-evidence (X-1..X-4), and what survived |
| `02-concepts-brief.md` | Updated system-level concepts brief (v4) in EGM format: Overview / Analysis / Goals-NonGoals / Alternatives Weighed / Key Decisions & Staging. Names the first formal `egm-draft`: **the Cognate Mediation Release** |
| `03-adjudication-decisions.md` | D1–D8 reassessed: which resolve from evidence (Part 1) vs the genuine owner set A-1..A-9 (Part 2), each with alternatives, benefit/cost, recommendation, consequences, and now-vs-defer |
| `reviewers/01..06-*.md` | The six raw Goldfish reports, unedited (one marked transcription note), as the independence/provenance record |

## Headline results of the criticism

1. **The central claim survived with corrections:** every seam the hypothesis named was verified real by the source-checking lens, and the structural lens concurred the authority topology is defensible. But the *work ledger* was wrong in the hypothesis's favor-against: M-4 already landed, C-2 is mostly proof-work now, and the boundary already enforces more identity than brief v3 claimed.
2. **Two genuine discoveries:** the "three approval shapes" are two distinct server concepts plus one wire bug (M-2 as written would have deleted a live concept); and the Operate preflight is structurally unanswerable without either an SFWP evaluate-only verb or an honest "decided at invocation" presentation.
3. **The strongest challenge is portfolio-level, not architectural:** no real world, no second user, no distribution — the reviews converged that the first-product decision (dogfood via Workbench vs mission-first via Horizon) must be made explicitly. It is adjudication A-1.
4. **M-1 was re-specified on verified evidence:** extend the hardened `SeaForgeAuthority` client (busy-retry, 256 KB cap) rather than export a raw escape hatch both fronts would copy unhardened.

## Stop point (per owner instruction)

Architectural adjudication is requested on `03-adjudication-decisions.md` — minimum set **A-1, A-2, A-3 (+A-6), A-4**; A-5..A-9 carry recommendations ratifiable in the same pass. After adjudication: `egm-draft` on the Cognate Mediation Release boundary (`02` §Key Decisions), then the full independent `egm-review` process and `egm-resolve`, per the EGM feature flow.

## Honesty notes

- The six reviewers are same-model fresh-context agents: adversarial and independent of this session's reasoning, but not a second implementer; P3-grade independent confirmation remains the tagged-readiness run (Stage 3).
- Reviewer findings marked **verified** carry source citations checked by the codebase-details lens; where I disputed a reviewer, the counter-evidence is in `01` §D. One transcription fix in `reviewers/06` is marked inline.
- The distillation bundle's stale line anchors (an inherited-from-brief-v3 defect the reviews caught) are corrected in `01` W-4; re-verify anchors before acting on any single citation.

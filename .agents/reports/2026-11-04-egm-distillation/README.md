# EGM Architectural Distillation — Reconnaissance Bundle (2026-11-04)

Workspace-wide Elephant–Goldfish Model Phase 1–3 pass over the GodSpeed AI estate, produced read-only at the owner's request. No product changes were implemented; no repo was modified.

## Reading order

| File | Deliverable |
| --- | --- |
| `01-actual-system-map.md` | Implemented components, versions, dependency/runtime topology (mermaid), installed-host reality, EGM bootstrap state |
| `02-drift-and-tension-report.md` | 19 numbered findings: governance/evidence drift, duplication, boundary tension, product gaps — each with evidence |
| `03-essential-design-hypothesis.md` | The target design: preserve / modify / merge / retire / complete, with alternatives weighed |
| `04-product-experience-gap-map.md` | Horizon Master-UI target vs actual: six journeys, cockpit, Workbench, install/onboarding/upgrade |
| `05-decision-register.md` | D1–D8: the only decisions that need the owner, each decision-ready |
| `06-egm-design-boundary.md` | The first formal design doc boundary + next EGM command + Goldfish reading package |
| `07-appendix-repo-dossiers.md` | Condensed per-repo evidence dossiers backing the above |

## Headline conclusions

1. **The authority topology is right and needs no re-architecture** — the defects are seams and duplication (three approval shapes, two hand-rolled authority clients, three settlement branch lineages), not ownership.
2. **The estate's strongest verified asset is the live governed-commit spine** (Horizon → Cognate → SEA-Forge escalate → human approval → RealityTrace), and the highest-value completion is closing it: payment/settlement (REQ-NAV-008..013), SPEC-CR-003 approval gate, and the prepared-but-unrun live roundtrip.
3. **Governance drift is the systemic risk**: Horizon runs on two execution ledgers (T-task DAG vs production-readiness classes), the whole-stack GO evidence is stale at every head, and settlement correctness is spread across three unmerged sea-rs lineages.
4. **Two products, one mechanism layer**: keep Horizon and Cognate Workbench separate; converge identity, authority client, and design tokens through Cognate (D1/D8).
5. **Retire the parallel surfaces**: sea-rs's own UIs, dormant grammar/editor tooling, and godspeed_agent after T17/T21 extraction.
6. **The presentation track has its own fresh contract**: the Master UI Specification v1.0 (2026-11-04, design-only) phases the UI work (Operate inbox → Explore Object View → Work harness → shell → six journeys) behind an A–E work-scope gate that forbids UI work from creating authority/substrate debt — mutually reinforcing with this bundle's substrate-first boundary. It currently lives unversioned in gitignored `.tmp/` (T-EGM-4: commit it).

## Next step (per the session stop condition)

`egm-draft` on the boundary in `06`, then `egm-review-loop` with the curated reading package; owner decisions D1–D4 (minimum) before design approval. See `06-egm-design-boundary.md` §2–§4.

## Provenance and honesty notes

- Method: workspace survey + six parallel read-only recon agents (2026-11-04), cross-checked against directly read status ledgers, plans, briefs, and git state in Horizon, and the readiness evidence rules.
- Every claim carries **[F]** observed / **[I]** inference / **[P]** proposal / **[U]** unknown plus file or commit citations (dossiers in `07`). Recon-agent findings that drive decisions were spot-verified; the rest are evidence-cited for independent checking.
- Intended-experience/theory sources, located after owner correction (T-EGM-2): Master UI Spec v1.0 at `Horizon/.tmp/Horizon_Master_UI_Spec_v1_0.md`; CognitiveOS Manifesto **v17** and Math Layer **v2.3** at `godspeed-growth/world/` (which also holds the strategic set: developmental cybernetics manifesto, ADE/DE SOPs, revision/measurement theory); Palantir materials at `Horizon/.tmp/palintar-screens/` + the two 2026-11-01 reports. The UI spec's own register cites manifesto v13.1 — four versions stale against the workspace copy (T-EGM-3).
- Head snapshot date: 2026-11-04. Branches move daily in this estate; dossiers name exact HEADs.

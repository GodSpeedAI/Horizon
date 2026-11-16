# 04 · Product Experience Gap Map

Intended experience sources of record (corrected per T-EGM-2): **Horizon Master UI Specification v1.0** (2026-11-04, design-only — the presentation-side contract: three compositions Explore/Operate/Work + stable shell, phases 0–6, verification matrix, A–E work-scope gate, UI-01..20), Horizon `README.md`, spec HORIZON-001 1.2.0 journeys, cockpit concepts brief v3, Palantir Foundry recon + screenshots, Cognate Workbench `PRODUCT.md`/`DESIGN.md`/`UX.md`, and the CognitiveOS Manifesto v17 + Math Layer v2.3 as theory grounding. **[F]** unless marked.

Legend: ✅ implemented & tested · 🟡 implemented, verification incomplete · 🔶 presentation missing (substrate exists) · 🔴 substrate capability genuinely missing.

**How to read this against the UI spec:** the spec's own work-scope gate (§11: A re-layout / B pure presentation adapter / C donor reuse / D missing capability / E authority change prohibited) is the classification mechanism for every row below. The spec's Phase 1–6 order (Operate inbox → Explore Object View → Work harness → shell → six journeys → cross-projection verification) is compatible with this bundle's finding that J02-completion and the approval wire reconciliation come first — the spec's §6 approval records table *requires* the M-2 wire shape (`use actual InboxApproval fields … typed verified approval-ID relation`) and its Phase 1 exit condition is exactly the inbox recompose that P2.1 built the domain layer for.

## 1. The six journeys (Horizon)

| Journey | Intended (README §canonical journeys) | Actual today | Gap class |
| --- | --- | --- | --- |
| **J01 Explore** | Resolve observer+world, search, filter, traverse relations, keep focus | Fixture-proven (`behavioral/journeys/J01.yaml`); semantic adapter live vs vendored world; debugger `reach`/`why` live for fixture world | 🔶 live-world scale unproven; object-set traversal over a *real organizational* world (not the fixture) untested |
| **J02 Operate** | Discover op → spendability gates → freeze expectations → authority → execute → correlate → review | **Live** for authority slice: allow/deny/offline/escalate→approval→resolve→commit-once/reject (`test/J02-live.test.ts`); approval inbox built 🟡; settlement stages + honest claims shipped on branch 🟡 (not live-verified); payment/capacity (REQ-NAV-008–010) 🔴; IS7 settlement + RT-1 🔴 (J02r2 gate exists, no recorded pass); identity-at-boundary 🟡 (18f0c40 refuses unknown-identity self-approval; `decision_id`/`criteria_sha256` staleness refusal missing) |
| **J03 Build** | Lineage, propose revision, validate closure, governed promotion to new world_ref | `diff`/`counterfactual` debugger ops exist for projections; no revision proposal flow, no promotion governance, no lineage graph over a real world | 🔴 mostly missing (by design — later tasks) |
| **J04 Monitor** | Source events → projections → reassess cases → notify/approve/idempotent respond | Event monitoring task (T14) unstarted; no source-event ingestion from a real organizational system | 🔴 |
| **J05 Compare** | Pin baseline, hypothetical branch, compare assumptions/payment, return to real authority | Not started | 🔴 |
| **J06 Develop** | Review repeated settlement, run preregistered research, governed estimator activation | godspeed_agent has the full research pipeline (datasets/calibration/ROC-AUC) **unmerged**; Horizon T17/T21 fail-closed gates; developmental memory design exists in predecessor only | 🔴 (substrate exists in predecessor — migration is the work) |

**Read:** the *hardest* slice (governed commit under authority) is the one that works. The remaining journeys are sequenced behind it in the plan, which is the right order; the gap that matters near-term is completing J02's payment+settlement half (C-2) rather than starting J03–J06.

## 2. The cockpit experience (intended vs actual)

| Intended (README + brief v3 + P8) | Actual | Class |
| --- | --- | --- |
| Home view: resumes where you left off; first shows pending approvals, contradicted evidence, work in flight, degraded sources | Workspace view w/ fixed regions, one-primary-action, approval inbox; "needs you" ordering only partially realized; settlement `observe` button can return a refusal (P2.4 "make it honest") | 🟡 |
| Keyboard palette reaching every object and move | Not present; UI spec §3 classes global search/palette as **conditional** (requires a real search contract; local-only search must be labeled local) | 🔶 (frame/typed-intent substrate supports it; D-class until a search contract exists) |
| Stable links reopening same world/checkpoint/selection; "newer state exists" honesty | Checkpoint/frame refs exist; deep-link reopen + newer-state notice not built; UI spec §9.3 mandates the newer-checkpoint visibility and stale-frame renewal rules | 🔶 |
| Clack terminal + Atomic GUI + remote sending the **same typed intents** | Implemented: three transports, one `application.surface()` seam (`src/main.ts:1–16`); remote phone panel w/ WebAuthn 🟡 (access path for per-launch secret unconfirmed, P1.5) | ✅ architecture / 🟡 remote ops |
| Agent-composed surfaces that can't steal pinned panels/focus | Closed surface grammar (surface2) + boundary teeth ✅; agent composition itself not yet exercised by a live agent | ✅/🔶 |
| Seven-question debugger, values labelled, typed refusals | Shipped T10 with 11 teeth + mutation runner ✅; Context Kernel wire is scripted fixture, not live process (integration_level `fixture`) | ✅/🟡 |
| Governed-action wizard: prerequisites, predicted burden, authority conditions, recovery, evidence requirements *before* commit (Palantir action-wizard pattern, P8.4) | Availability/gates computed in Horizon (`navigation.ts`, `model.ts`, `expectation.ts`) rather than shown from SEA-Forge's authoritative state; eligibility "unknown" rows exist in inbox | 🔶→🔴 (needs M-2 wire shape + authoritative eligibility) |
| Stable shell (orientation bar, six-experience left nav, persistent inspector, status strip — UI spec §2.1) | Current workspace has fixed semantic regions (context/decision/evidence/inspector/lineage/agent, owner-pinned); no orientation bar/nav/inspector chrome | 🔶 (B-class re-layout over `WorkspaceSnapshot`/`WorkspaceChrome`; regions' ownership semantics already enforced) |
| Explore composition: Object View w/ full selected-object properties, typed-relation traversal, bounded lineage w/ disclosed truncation | **Substrate gap found by the UI spec itself** (§4.2): `WorkspaceSnapshot` exposes only reduced `WorkspaceLineage`, not complete selected-object properties — needs a *pure presentation mapping over existing authorized reads* (UI-12: no new store); bounded `traverse` + `buildLineage` (bound 24) exist | 🔶 (B-class) with one honest D-edge |
| Contextual **Work** composition inside Horizon (session rail, transcript, tool cards, context ribbon, outline, composer — reusing Workbench patterns; *not* a seventh journey) | Not started; UI spec Phase 3; review taxonomy keeps tool consent / SEA-Forge approval / artifact review separate (UI-17) | 🔴→🔶 (depends on Cognate session contracts the Workbench already exercises; no Horizon-side session surface exists) |
| Responsive multi-pane behavior (wide/medium/narrow — UI spec §2.3) | Server-rendered native-form HTML today; spec itself flags a reactive SPA as a *presentation-layer implementation change*, not current capability | 🔶 (design targets only; do not migrate rendering to match a screenshot) |
| Palantir-pattern presentation (object hub, action wizard, AI-FDE ribbon) | Scoped as UI spec §2.2 donor compositions + P8; not started | 🔶 (presentation only, A/B/C-class) |
| Workbench design system adoption (Cobalt tokens, card states) | UI spec §4.3 names Workbench `DESIGN.md`/`UX.md` tokens the compatible donor ("reconcile brand through contrast testing, not a second improvised design system"); adoption still an owner decision | 🔶 + owner decision (D8) |
| WCAG 2.2 AA, full keyboard path, focus restoration | Not yet an enforced gate; UI spec §12 makes accessibility a mandatory verification row | 🔴 (test debt, not substrate) |

## 3. Workbench experience (the second product front)

- Intended (README): accountable coding-agent harness — real tools in real directories, streaming, plans, subagents, experts/teams/assignments, approval gates, steering, terminal, shared browser, previews, desktop shell. **Actual: substantially delivered** — T12 mission journey end-to-end, 1,571 tests (2 load flakes), 5-platform packaging qualified, desktop sidecar lifecycle hardened (96f7fb0). Open: Tauri release build + WSLg real-window pass; T6 center-view registry extraction skipped (folded into T12). [F]
- Known capability limits are honest in its README: capability substitution and parallelism plans are "recorded, do not act." Single-operator dev authenticator is a stated security limitation. [F]

## 4. Installation, onboarding, operations, upgrade (whole product)

| Aspect | Intended (goal: installable, production-grade) | Actual | Class |
| --- | --- | --- | --- |
| First install | A supported path per product | DomainForge on 3 registries ✅; sea-forge native installers + attestation ✅ (0.4.0 pending); RealityTrace binaries verified ✅ (tag uncut); Workbench packages built 🟡 (uncommitted); Gauntlet untagged 🟡 (PostgreSQL required); SWE_SEED candidate not yet green 🔴 | 🟡 |
| The *composed* GodSpeed install (Horizon + SEA-Forge + RealityTrace on one machine) | One operator path | Exists exactly once, on this host, via owner-run runbook steps (sudo/systemd/chown by owner; gateway two-account hardening). `docs/gateway-runbook.md` + IGNITION.md; not reproducible by a non-owner | 🔴 for product; ✅ as a proven prototype |
| Onboarding a *world* | Author `.sea`, compile, pin world_ref, connect sources | `cognate create` starter scaffolds a world ✅; Horizon expects a vendored/pinned world; no journey connects a real organizational source system | 🔴 (J04 dependency) |
| Upgrades | Pinned releases, store contract_version migration w/ safe rollback | contract_version 2 marker makes revert-alone unsafe (brief v3 Blocker 4); upgrade path undesigned | 🔴 |
| Operational support | Health/doctor, logs, containment verification | `gateway-check`, `doctor` commands exist in several products; socket containment verified 2026-11-02 🟡; no cross-product health surface (Horizon P5 read-only status planned) | 🟡 |
| Security model beyond loopback | Multi-user/remote hardening | Explicitly not there: Workbench single-operator authenticator; Product Actualizer loopback trust rejected by Horizon spec §10; `local_operator` uid-sharing identity gap (T-15) | 🔴 (known, scoped) |

## 5. Where the intended UX is fragmented across products

1. **Approving work** happens in: Horizon inbox (branch), Workbench approval cards, sea-forge CLI (`sea-forge approve`), and SEA-Forge's own pending-approval surface. Same act, four surfaces, two shapes (T-7/T-8). Fragmentation is *presentational* today but becomes *semantic* the moment eligibility is computed differently per surface — M-2 + M-1 close it.
2. **Reading evidence** happens in: Horizon debugger/economics views, Workbench settlement cards, `realitytrace` CLI. Acceptable (different depths for different users) once Horizon's views read the same ledger fields (P7.2 token-field export gap).
3. **Identity/onboarding an operator**: three implementations (Horizon WebAuthn 1.2.0, Workbench dev authenticator, SEA-Forge configured operator). T-9/M-1 is the fix.

## 6. Sharpest conclusions

- **Do not start new journey surfaces yet.** J02 completion (payment, settlement, live approval round-trip) + the install path (C-6) convert what exists from prototype to product; J03–J06 wait. The Master UI Spec's own phase order agrees: Phase 1 (Operate inbox) consumes exactly the wire shape this bundle's M-2 must reconcile.
- **The presentation track now has its own contract** (Master UI Spec v1.0): its A–E work-scope gate and "availability rule" are the mechanism that keeps UI work from manufacturing substrate debt — hold implementation to that gate (no D/E items silently entering A/B/C), and commit the spec itself to version control (T-EGM-4).
- The cockpit's *honesty machinery* (typed refusals, labelled values, one primary action, settlement stages) is ahead of its *authority wiring*; M-1/M-2 close the authority wiring, and the UI spec's Phase 1–2 presentation then has something true to present.
- The Workbench is the most product-complete front in the estate; its gaps are release engineering, not capability — and per UI-03/UI-13 it donates *harness interactions, not authority*; the agent Work surface inside Horizon must keep that separation (UI-17's three review types).

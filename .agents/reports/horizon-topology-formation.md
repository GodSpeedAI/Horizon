# Horizon topology formation record (T00 — Project Topology Architect P0)

Read-only formation output. The ruler is the spec; this record routes, it does not
restate. It captures what T00 observed, decided and left open before any scaffolding.

## Ruler pin (verified)

- Skill loaded FIRST, from the owner-designated path:
  `~/projects/project-topology-architect/skills/project-topology-architect/SKILL.md`
  (+ `references/greenfield-formation.md`, `references/requirement-ledger.md`).
  The vendored `.agents/skills/project-topology-architect/` copy was NOT substituted.
- Spec: `.agents/specs/horizon.agent.spec.yaml` — HORIZON-001 **1.0.0, status frozen**.
  `sha256sum` = `75cfc1ceb9eec6139f7b8e73f8d1107fcc5e2b680e80683824edd7d8de434130`,
  equal to `plan.source.spec.sha256`. Verified by `scripts/check-ruler.py` (exit 0).
- Inventory: 98 unique `REQ-*` ids (CASE 3, CONFIG 7, DEV 3, GOAL 5, INT 4, NAV 7, OUT 4,
  RES 7, SAFE 5, SEC 6, STACK 14, UI 8, UX 12, VERIFY 5, WORLD 8) and six journeys J01–J06.
  The plan's `traceability` maps all 98 to tasks with no unknown ids.
- Plan: `.agents/plans/horizon.plan.yaml` — HORIZON-PLAN-001 **1.0.0, ready**; 23 tasks,
  dependency DAG. Execute by DAG. P1/P1B/P1C precede topology; T04 is the first scaffold task.

## Modes and formation contract (not a reordering of the plan)

Greenfield/scaffold. The plan's settlement sequence is authoritative:
P0 (T00) → P1 semantic IDM (T01) → P1B Behavioral IR (T02) → P1C Atomic UI IR (T03) →
P2–P8 executable Cognate topology + walking skeleton (T04) → projections/navigation
(T05–T07) → renderers/debugger (T08–T10) → authority/Gauntlet/evidence (T11–T13) →
builder/monitor/scenarios/learning/products (T14–T22) → fresh whole-stack conformance (T19).

## Source-of-truth map (one home per fact)

| Fact | Home |
|---|---|
| What must be true | `.agents/specs/horizon.agent.spec.yaml` (frozen) |
| Dependency order, gates, evidence | `.agents/plans/horizon.plan.yaml` |
| Canonical interaction semantics | `.sea/` via DomainForge (T01) — not yet formed |
| Application runtime, events, projections | Cognate |
| Authority, approvals, obligations | SEA-Forge (`~/projects/sea-rs`) |
| Independent evidence | RealityTrace (`~/projects/sxr`) |
| Frozen execution records | Gauntlet (`~/projects/gauntlet`) |
| Scoped reference retrieval | Context Kernel (`~/projects/Context_Kernel`) |
| Observer navigation + developmental interpretation | Horizon |
| Requirement→source binding, gates | `requirements/ledger.yaml` (candidate, generated) |
| Decisions / open questions | `.agents/reports/horizon-decisions.yaml`, `.agents/OPEN_QUESTIONS.md` |

## Sibling checkouts (resolved by git remote, not directory name; no fetch)

All read-only. Branch/commit at observation time:

| Dir | Remote | Branch@commit | License | Note |
|---|---|---|---|---|
| cognate | GodSpeedAI/Cognate | main@a477933 | Apache-2.0 | 0.6.1; `loadSemanticWorld` present; binds domainforge 0.21.1 |
| domainforge | GodSpeedAI/DomainForge | main@6e941ff | Apache-2.0 | npm @godspeedai/domainforge 0.21.1 |
| sea-rs | GodSpeedAI/SEA-Forge | main@257b622 | LicenseRef-SEA-Forge (+LICENSE_EE) | authority, server, settlement crates |
| gauntlet | GodSpeedAI/Gauntlet | main@62dbc52 | none in root | Rust CLI; `.gauntlet/reference.lock` |
| sxr | GodSpeedAI/RealityTrace | main@42879a8 | Apache-2.0 | sxr CLI (not on PATH) |
| Context_Kernel | GodSpeedAI/Context-Kernel | harden@3111d26 | Apache-2.0 | MCP stdio + HTTP /mcp |
| godspeed_agent | GodSpeedAI/GodSpeed-Agent | migration/cep-world-required-evidence@4bfed12 | see repo | Python research subsystem (T21) |
| product-actualizer | SPRIME01/Product-Actualizer | main@c9df8d2 | **Apache-2.0** | cockpit donor; relicense commit verified |
| terminal-ui | GodSpeedAI/Terminal-UI | remediation/audit-2026-09-29@7932154 | MIT | OpenTUI React registry |
| godspeed-compass | GodSpeedAI/godspeed-compass | main@d52f39d | none | supersede (T07/T17 concepts) |
| gs-term | GodSpeedAI/gs-term | main@73137e4 | none | host_surface |
| cognate-workbench | GodSpeedAI/Cognate-Workbench | feature/expert-teams@f071e67 | see repo | host_surface |
| WarpRoom | SPRIME01/WarpRoom | master@16cc7d5e2 | see repo | join second wave |

## Stable vs proposed APIs (source-inspected)

Stable enough to bind: Cognate `loadSemanticWorld` (`packages/domainforge/src/index.ts:96`;
imports require the world loader, never concatenation); `@godspeedai/cognate-realitytrace`
adapter (`packages/realitytrace/src/`); SEA-Forge authority `evaluate`/`grant`/
`grant_after_approval` (`crates/sea-forge-authority/src/lib.rs:1612-1670`) and SFWP
`case.preflight`/`case.entry_options` (`crates/sea-forge-server/src/sfwp/case.rs`).

Proposed / not yet bound: Gauntlet and Context Kernel have **no** Cognate adapters
(DEC-T00-04); authority has **no non-granting evaluate over the wire** — `sfwp/mod.rs`
states a verdict without a ledger entry would be an unrecorded grant, so Horizon shows
`deferred_to_invocation` pending an upstream evaluate-only operation (DEBT D-001).

## Environment / CLI versions (observed 2026-10-19)

bun 1.4.0 · node v26.8.2 · just 1.58.0 · python3 3.14.4 (PyYAML 6.0.3) · uv 0.12.1 ·
rustc/cargo 1.98.0 · git 2.53.0 · jq 1.8.1. Missing/stale on PATH: `sxr` MISSING;
`yq` MISSING; `domainforge` 0.19.0 (stale vs required 0.21.1). User-controlled env paths
all unset: COGNATE_SOURCE, COGNATE_CHECKOUT, SXR_BIN, GAUNTLET_BIN, DOMAINFORGE_BIN,
CK_BIN, HORIZON_PROFILE.

## Drift (recorded, nothing fetched)

- Local cognate and domainforge are now on `main` (a477933 / 6e941ff); the earlier
  "lagging" drift is resolved. No fetch was performed.
- domainforge CLI on PATH lags the Cognate-bound npm binding (OQ-03).
- `cognate create` at a477933 still requires `--source`; commit 61015df (optional) is not
  on main (OQ-01).

## Ruler integrity

No spec ambiguity found that makes the frozen ruler untrustworthy. All observed conflicts
are execution/environment issues recorded in `.agents/OPEN_QUESTIONS.md`, not ruler
defects; no `CandidateRevision` is triggered. The spec was not edited.

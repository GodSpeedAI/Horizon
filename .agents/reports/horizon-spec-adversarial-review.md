# Horizon spec/plan adversarial review — 2026-10-19

Scope: `HORIZON-001` 0.1.0 and `HORIZON-PLAN-001` 0.1.0, checked against workspace source. Outcome: spec revised to 0.2.0, plan to 0.2.0. Evidence came from read-only recon of local checkouts and `git show origin/main:` (no fetch). Claims below cite the source that grounds them.

## Findings that changed the spec

| # | Finding | Source evidence | Resolution |
|---|---|---|---|
| F1 | Four of eight donor paths did not exist | `sea-forge` → `sea-rs` (remote GodSpeedAI/SEA-Forge); `realitytrace` → `sxr`; `context-kernel` → `Context_Kernel`; `godspeed-agent` → `godspeed_agent` | Spec lists repos by remote identity plus workspace path |
| F2 | Local checkouts lag the claims | cognate local on `feature/landing-repositioning` 0.5.0 / DomainForge 0.19.0; `origin/main` a477933 is 0.6.1 with `loadSemanticWorld` and DomainForge 0.21.1; local domainforge 0.18.2 | CLAIM-001 cites exact refs; plan pins published releases and forbids silent fetch |
| F3 | Cognate has no operational object store, object-set query, traversal or business checkpoint | `DurableStore.listRecords` is top-level equality on internal collections; DomainForge `Instance` is parse-time only | CLAIM-005, REQ-WORLD-006/007; T06 builds the object layer on Cognate projections |
| F4 | SEA-Forge has no authority preview on the wire, so the 0.1.0 rule "unknown gate ≠ available" made every consequential action permanently unavailable | `PolicyAuthorityEngine` evaluate/grant exist in-library only; SFWP `preflight` validates templates; Cognate adapter calls invocation-time authority | REQ-NAV-006 gate vocabulary incl. `deferred_to_invocation`; CLAIM-006; upstream ask in DEBT |
| F5 | SEA-Forge dispositions are allow/deny/escalate/boundary/degraded with a move-only `ActionGrant` bound to action hash and expiry; spec knew only allow/deny/escalate | `sea-forge-authority/src/lib.rs` | REQ-STACK-009: only allow + matching grant permits effect |
| F6 | J02/J04 had Horizon calling SEA-Forge directly; Cognate is the only real client | `runtime-bun/src/sea-forge-authority.ts` (Unix socket NDJSON) | REQ-STACK-010 single integration seam; journeys rerouted |
| F7 | Gauntlet and Context Kernel have no Cognate adapters or TS clients | Gauntlet Rust CLI; Context Kernel MCP stdio/HTTP | CLAIM-007; T10/T12 steps name the adapter work |
| F8 | "Activate new world_ref" had no owner; DomainForge owns aliases but has no world diff | `domainforge-core/src/application/world.rs` (`WorldAlias`, `retarget_alias`, alias history); only `pack diff` exists | REQ-WORLD-008; J03 retargets the alias; diff is a derived read-only view |
| F9 | GodSpeed Agent's Python ML research infrastructure was absent from spec and plan | `godspeed_agent/scripts/settlement_datasets/*`, `godspeed_nav/ml.py`, v006–v008 preregistered matrices (v008 SETTLED, v007 PARTIAL), shadow/guarded evaluation, AgentTrove, ~1.1 GB data, `cybernetic_nav.*` MCP tools | `research_and_learning` REQ-RES-001..007, J06 Develop, CLAIM-008, T21 |
| F10 | Developmental rules would have two homes (Python godspeed_nav and a TS port) | T17 said "port" with no oracle | REQ-DEV-003 single home with golden-fixture oracle; decided at T00 |
| F11 | Product Actualizer is AGPL-3.0 | `product-actualizer/LICENSE` | CLAIM-009; plan rule: copy code only after recorded owner decision |
| F12 | No identity provider exists; Cognate ships only a dev token authenticator | Cognate `devTokenAuthenticator`, `docs/security.md` | Deployment profiles; REQ-SEC-006 makes `local_operator` the initial conformance target |
| F13 | "Ties the stack together" had no mechanism; overlapping control planes ignored | gs-term, godspeed-compass, cognate-workbench, WarpRoom | Product integration contract REQ-STACK-011..013; register in `horizon-product-integration-register.yaml`; T20 |
| F14 | Internal inconsistencies | Gate keys differed between REQ-NAV-002 and the entity; README "Develop" lens had no journey; spec lens said "review"; state machine lacked defer, uncertain-execution, abandon, continue and close transitions | Canonical gate keys; `vocabulary_alignment`; J06; added `closed` state and transitions |
| F15 | "Astryx" assumed as the GUI basis | Astryx is a beta third-party design system (Cognate ADR-0009); `ui-astryx` shell is chat-first | R5 says Astryx-compatible; T09 uses `cognate-react` plus SEA-Forge governed components |
| F16 | UX was under-specified for a whole-stack control plane | No home/attention view, palette, deep links, history, accessibility target, latency budget, actor attribution or first-run state; PA debt shows delegated agent actions look like owner actions and graphs unreadable at default zoom | `operator_experience` REQ-UX-001..012; T22 |

## Plan defects fixed

- Bad paths: `~projects/cognate`, `product-actualizer/blob/main/docs/*`, `cockpit/grammar.test.ts`, `cognate/packages/client-react` (does not exist).
- T18 teeth needed idempotent commit (T11) but did not depend on it; now depends on T11 and T22.
- New tasks T20 (products), T21 (research), T22 (operator home); T17 depends on T21; T19 on all three.
- Traceability regenerated from `settles`: 97/97 requirements mapped, no unknown IDs.

## Verified as grounded (unchanged)

- Cockpit block vocabulary is exactly the 15 blocks (`cockpit/protocol/spec.ts:175`); modes and intents match the spec.
- `domainforge validate <file> --application` exists (file targets only).
- RealityTrace is reachable via `@godspeedai/cognate-realitytrace` (shells out to `sxr`).
- `cognate create <dir> --profile copilot|harness` exists; `--source` is optional despite the skill text.
- The topology skill exists at the owner-designated path.

## Owner decisions, 2026-10-19 (after review)

- Spec approved and frozen as 1.0.0.
- Product Actualizer relicensed to Apache-2.0 (sole author; vendored skills MIT; AGPL donors ideas only). Its `actualize/` model still says AGPL until its next run.
- Dependency is one-way: every product and stack owner, SEA-Forge included, must work without Horizon (REQ-STACK-014, VAR-011).
- WarpRoom joins as a second-wave product through its own MCP and REST surfaces (see register).
- Fast-forwarding the local Cognate and DomainForge checkouts was authorized; the session's auto-mode safety check blocked it, so the owner runs it.

## Decisions taken on the owner's behalf (reversible)

1. Python research stays Python behind Cognate capabilities; no TS port of ML.
2. `local_operator` is the initial conformance profile; remote multi-user is roadmap.
3. Horizon supersedes godspeed-compass and GodSpeed Agent, hosts gs-term and cognate-workbench as surfaces, and defers WarpRoom.
4. First-wave products: the research subsystem and Strategist (confirm at T00).
5. Approvals are SEA-Forge records shown in Horizon, never Horizon state.
6. Concrete UX budgets: 300 ms p95 read navigation, WCAG 2.2 AA, light and dark themes.

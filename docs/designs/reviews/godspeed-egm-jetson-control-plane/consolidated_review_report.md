# Consolidated Goldfish Review Report

**Target:** `docs/designs/godspeed-egm-jetson-control-plane.md` (367 lines)
**Split:** `FeatureRange 1..236` (Overview → Alternatives Considered) · `DetailedRange 237..367` (Detailed Implementation Plan → Verification Plan)
**Preset:** Consolidated report with all review rubrics (Stages 5–9, no checkpoints)
**Method:** five stages, nine fresh-context Goldfish reviewers, direct dispatch
**Date:** 2026-11-01

## Reviewer Status

| Stage | Reviewer | Standard | Status |
| --- | --- | --- | --- |
| 5 | `egm-zoom-out` | zoom-out-standard | completed |
| 6 | `egm-comprehension` | none | completed |
| 7 | `egm-design` | feature-spec-standard | completed |
| 7 | `egm-structural` | feature-spec-standard | completed |
| 7 | `egm-style` | none | completed |
| 8 | `egm-zoom-out` (intermediate) | zoom-out-standard | completed |
| 9 | `egm-implementation-readiness` | implementation-readiness-standard | completed |
| 9 | `egm-codebase-details` | implementation-readiness-standard | completed |
| 9 | `egm-style` | none | completed |

No reviewer failed or was recorded as not run.

## Verdict

The document is a coherent decision record with an honest alternatives section, and it is not implementation-ready. Two defect classes dominate.

1. **Authority conflicts with the frozen ruler.** The design introduces a Case-ID minting authority, a Paperclip budget authority and a Paperclip approval authority, each of which collides with `HORIZON-001` (`REQ-CASE-001` derived-not-minted cases; `REQ-NAV-008/009` affordability; `REQ-UX-007` approvals held by SEA-Forge under the operator's identity). The document then asserts on L360 that the frozen spec hash is unchanged. It cannot be both.
2. **Undefined mechanism.** The Paperclip package, its API, its service identity, the ID ledger schema, the control-module host, the egress mechanism and the read contract's data source are all unnamed. Nine of the 22 file entries cannot be written from the text.

The most consequential factual finding is that the design's central identity proposal is already implemented: `agent-event/v1` already carries `case_id`, and `src/economics/model.ts` already derives and renders `unbound` from `case_id === null`. The design treats as future work something that exists.

## Verification performed on the consolidated findings

The orchestrating agent re-checked the load-bearing claims directly rather than accepting reviewer assertion.

| Claim | Result |
| --- | --- |
| `REQ-CASE-001` requires a Case to be a derived view, not a competing ontology | **Confirmed**, `.agents/specs/horizon.agent.spec.yaml:763` |
| `case_id` already exists on `agent-event/v1` and Horizon already renders `unbound` | **Confirmed**, `test/support/economics-fixture.ts:11,25,34`; `src/economics/model.ts:12,84,386–396` |
| Horizon keeps no approval state of its own | **Confirmed**, `src/adapters/sea-forge-approvals.ts:4` |
| `just verify` composition, and no `gate-control` in the `justfile` | **Confirmed**, `justfile:116` |
| Gates must be `gate-tNN`; fake green aliases forbidden | **Confirmed**, `.agents/plans/horizon.plan.yaml:115` |
| `just boundaries` walks only `src` and `test` | **Confirmed**, `scripts/check-boundaries.ts:117` |
| Root `tsconfig.json` excludes `control/`; `just test` is `bun test` with no workspace split | **Confirmed**, `tsconfig.json:19–23`; `package.json:11` |
| `.tmp/` is gitignored, so the R2 register and the cited evidence are uncommitted | **Confirmed**, `.gitignore` |
| Register gives WarpRoom `join_product`, one-way MCP/REST join, board approvals authoritative inside WarpRoom; 4,800 upstream commits plus 3 owner commits | **Confirmed**, `.agents/reports/horizon-product-integration-register.yaml:35–51` |
| RealityTrace ledger export currently fails at record 704; first real drain was 1,449 records | **Not verified by the orchestrator** — reviewer-reported; re-run `realitytrace ledger export` before relying on it |
| Docker 29.7.1, cgroup v2, mise Node 25.9.0, ARM64 embedded PostgreSQL | **Not verified and not retained in the repository** |
| Paperclip npm package name and version | **Absent from the document and the repository** |

## Prioritized Findings

### 🔴 Blockers

**C1 — Case-ID minting conflicts with the frozen spec, and the feature already exists.**
Scope: L30, L136, L165, L171, L268–281.
`control/ids/schema.ts` is named "one component mints case IDs" and `ids/map.yaml` becomes an identity registry. `REQ-CASE-001` requires a Case to stay a derived view, not a competing ontology. Meanwhile `case_id` is already on `agent-event/v1`, already parsed by Horizon, and `unbound` is already derived and rendered. The claim that historical records start empty is false: they already carry `case_id: null`. Fix: either declare this an extension of the existing RealityTrace-owned field (no minting authority, no new ledger) or obtain owner approval to revise the frozen spec and rebind the plan.
*Trace:* S5-1, S7D-4, S7D-13, S7Y-3, S9I-3, S9C-1, S9Y-2.

**C2 — The Horizon read contract has no defined source, wrong module, no wiring, and duplicates existing proofs.**
Scope: L33, L141, L323–331.
`src/projections/` is a Cognate-event fold contract; a read over Paperclip records belongs in `src/adapters/` by repository convention. The module has no signature, no named source rows, no state union, and no `src/app.ts` wiring, so it ships as dead code `just test` cannot detect. Item 18's assertions restate `test/J02-live.test.ts` and the J02r2 approval rig. The read path's own test ("works with Paperclip uninstalled") contradicts its own requirement to read Paperclip. Fix: defer it (the document's own Open Question permits this) or specify it as an adapter with named inputs, a typed state union, a wiring point and non-duplicative assertions.
*Trace:* S5-2, S6-10, S8-2, S9I-7, S9C-4, S9C-8, S7Y-4.

**C3 — Three authorities are duplicated: case identity, budget, approval.**
Scope: L11, L34, L70, L134, L136–137, L266.
Paperclip holds "goals, budgets and approvals" while Horizon already owns affordability (`src/domain/payment.ts`, `src/capabilities/capacity-ledger.ts`) and SEA-Forge owns approvals (`REQ-UX-007`, `src/adapters/sea-forge-approvals.ts`). The integration register says WarpRoom's board approvals and budgets stay authoritative inside WarpRoom; the design demotes them to non-authoritative without an owner decision. No precedence is stated between a SEA-Forge grant and a later governor refusal, or between Paperclip budget exhaustion and the Horizon payment gate. "Precedence that cannot be shadowed" is a claim, not a mechanism; the only teeth are one negative test.
*Trace:* S5-3, S5-9, S7D-4, S9C-5.

**C4 — Alternative B misstates the integration register, and the load-bearing decisions have no alternatives.**
Scope: L185–233.
The register records 3 owner commits on top of 4,800 upstream commits (not "4,800 commits of divergence"), warns against forking core to fit Horizon rather than against the Bun migration, and gives WarpRoom `join_product` with a required one-way MCP/REST join — not "it stays out of the control plane". No alternatives are offered for the minting authority, git-YAML-as-recovery-truth, the egress mechanism, or approval precedence.
*Trace:* S7D-1, S7D-2, S9C-5.

**C5 — The GTM falsifier cannot fire.**
Scope: L32, L76, L140.
The 30-day clock starts at first approved outreach, but no outreach approval is requested until the research bundle lands. Never approve, and the clock never starts, so CUJ 3 passes vacuously. R2-10 required the clock to start at bundle intake. "Qualified conversation" and the preparation-only exit criterion are undefined.
*Trace:* S7D-3, S6-9, S7Y-2.

**C6 — The R2-* requirement register is uncommitted and unresolvable.**
Scope: L48–55 and every `(R2-*)` citation.
The identifiers resolve only to `.tmp/egm-integration/concepts_brief.md`, which is gitignored. R2-1, R2-2, R2-8 and R2-13 are never cited; R2-12 is cited but never listed. Fix: inline a committed requirement table.
*Trace:* S6-1, S7S-2, S9Y-1.

**C7 — The Paperclip pin, API and service identity are unspecified.**
Scope: L28, L55, L263–266, L308–311.
No package name, exact version, transport, endpoint list, auth mechanism, or service-identity issuance. The smoke script's "confirm the service identity can write and other identities cannot" cannot be written.
*Trace:* S6-3, S9I-1, S9I-2.

**C8 — `ids/map.yaml` and the mint path have no schema or entrypoint.**
Scope: L273–276.
Missing: ID grammar, YAML layout, parent cardinality, timestamp source, append-only rule, concurrency protocol, and the command that mints.
*Trace:* S9I-4.

**C9 — No control module has a runner, host, entrypoint or schedule.**
Scope: L258–301.
Seven TypeScript modules and two shell scripts exist with nothing to execute them. Only `paperclip.service` is defined. The two loop runners contradict L140's "run on existing primitives" and duplicate what a systemd timer plus an existing CLI would do.
*Trace:* S5-4, S8-3, S9I-5.

**C10 — The ledger that the replay test copies is neither Horizon's nor reproducible.**
Scope: L49, L165, L281, L357.
Horizon stores no agent events; the ledger is RealityTrace's. Reviewer-reported: the current export fails integrity verification at record 704, and the committed report counts 1,449 records, not 1,703. The 1,703 figure appears only in gitignored scratch. Fix the precondition before the replay test is written, or drop the test and state the real cutover constraint.
*Trace:* S9C-2, S9Y-13.

**C11 — `gate-control` breaks the plan's gate binding and cannot be green on one host.**
Scope: L338–341, L353–361.
`gate_binding_rule` requires `gate-tNN` targets with real checks, requirement IDs, preregistration, a falsifier and independent confirmation. `gate-control` has none of these. Its proofs need Docker, Paperclip and a Jetson memory envelope, so `just verify` cannot stay green on a fresh clone or an offline workstation, contradicting L360. The "spec hash unchanged" claim is an argument with no verifying command.
*Trace:* S5-7, S7S-6, S8-5, S9I-9, S9C-10, S7Y-6.

**C12 — Horizon's boundary, typecheck and test collection do not cover `control/`.**
Scope: L355, L359.
`scripts/check-boundaries.ts` walks `src` and `test` only; `tsconfig.json` includes `src`, `scripts`, `test` and `cognate.config.ts`; `just test` runs `bun test`, which recursively collects `control/**/*.test.ts`. Meanwhile the root-wide competing-model scan would walk `control/node_modules`, so adding the tree can also break existing gates. No target file modifies the boundary script or adds a control tsconfig or test exclusion.
*Trace:* S5-8, S9I-6, S9C-6, S9C-7.

**C13 — No Risks & Mitigations section (standard-mandatory).**
Scope: whole document.
No failure-mode register, no security risk list, no single-point-of-failure statement. The Jetson is the only always-on host; one OOM or thermal event stops control plane, cockpit and repair loop together, and a governor co-resident with the model it protects is not a remedy. The governor's own fail-open/fail-closed behaviour is unstated.
*Trace:* S7D-6, S7S-1.

**C14 — The detailed plan fails the Zero-Decision Rule.**
Scope: L237–367.
The entries are inventories, not executable specifications: no schemas, no signatures, no endpoint contracts, no argument lists, no expected values, no phase mapping. An implementer must choose the dependency, the API shape, the config format, the state encoding, the error codes and the file layout.
*Trace:* S9I-1…S9I-8, S9Y-5, S9Y-7, S9Y-8.

**C15 — The replay gate is circular.**
Scope: L281 vs L341, L356–357, L360.
The replay test "gates the first mint" and requires a copy of the real ledger as a precondition, yet it sits inside `gate-control`, which `just verify` must keep green. It can never pass before the first mint and is required unconditionally after.
*Trace:* S9Y-4.

**C16 — `unknown` and `unbound` cannot be distinct under the current parser.**
Scope: L141, L326, L331.
`src/economics/model.ts:213–215` collapses the tap's `"unknown"` sentinel into `null`, i.e. into unbound. The contract requires four distinct states; achieving it needs a `Modify` entry on that parser, which the plan does not list.
*Trace:* S9C-3.

**C17 — "No new systems" is contradicted by the document's own component list.**
Scope: L13, L39 vs L132–141, L243–346.
The design adds a second durable store (embedded PostgreSQL), an identity registry, a governor, a verification runner, two loop runners and a read path — while rejecting a new surface at L220 for adding "a sixth memory system to five existing ones". Paperclip's embedded Postgres is that sixth store.
*Trace:* S8-1, S7Y-12.

**C18 — Three incompatible admission floors.**
Scope: L24, L31, L137, L286.
`14 GiB` / `≥14G guard ≤ 61G` / `≥ 14.3 GiB`, with the guard written as an upper bound in the table and a lower bound in the state machine. The published table sums to exactly 61 GiB, leaving zero slack, while the text claims 14–16 GiB of headroom.
*Trace:* S7S-4, S7Y-1, S6-7.

**C19 — The $0-spend control is a Markdown file with an undecided mechanism.**
Scope: L52, L179, L303–306.
The only deliverable is `control/egress/allowlist.md`, whose content is "nftables SNI rules or a network namespace plus proxy". The design also requires repository write credentials on the Jetson for branch push and PR creation, which contradicts "no paid or subscription credential is reachable" as written unless spend and repository credentials are separated.
*Trace:* S8-4, S7D-8, S6-11, S9Y-5.

**C20 — Host-envelope numbers are asserted as verified with no retained artifact.**
Scope: L31, L134, L138, L180.
Docker 29.7.1, cgroup v2, Node 25.9.0, ~50 tok/s, 85 °C and the 100 GiB floor are used as refusal thresholds. Nothing in the repository preserves the measurements, and all cited evidence lives in gitignored `.tmp/`. Only the `doctor` `Summary` failure is corroborated by a retained log.
*Trace:* S8-7, S9C-9, S7D-11.

### 🟡 Major

**C21 — Six sub-modules where one adapter is the irreducible core; the governor is non-cohesive and its hysteresis has no number.**
Memory admission, cgroup OOM, thermal pause, disk floor, model-eviction guard and egress are grouped in one TypeScript state machine, though egress is separately a policy document. systemd, cgroup v2, kernel thermal zones and nftables already own those conditions. Hysteresis bands and dwell times are the only thresholds without values.
*Trace:* S5-4, S5-5, S9Y-11.

**C22 — The two-host verification path is unspecified and contradicts the stated host facts.**
"the workstation" is never named; HomeStation is described as offline. No transport, no ownership of the SHA256 comparison, no transfer budget, and the path sits outside both the memory table and the egress allowlist. Workstation handoff was chosen before any build-size or peak-RSS measurement was retained.
*Trace:* S5-6, S7D-7.

**C23 — SEA-Forge and RealityTrace transport and failure states are unnamed.**
The "gate" arrow has no transport or host, and no fail-closed behaviour is stated for when the Jetson is thermally held or the model is evicted.
*Trace:* S7D-9.

**C24 — Acceptance events are not measurable, and success metrics are absent.**
CUJ 1's "observed, not assumed" has no command; CUJ 2's "public claims are consistent" has no detection rule; the 30-minute clock has no instrumentation; "2M tokens advisory" is not a ceiling while Problem 3 claims ceilings are enforced; 10 candidates/day has no owner or evidence path. Goals and CUJs are prose throughout.
*Trace:* S7D-10, S7S-8, S9I-8.

**C25 — Open Questions contradict mandatory Increment 1, and phasing is not mapped to files.**
L48 makes the adapter and read contract conditional; L172 and L239 make both mandatory. Items at L49–54 are posed as open but already committed as deliverables. No file is assigned to a phase, so no buildable intermediate state is guaranteed.
*Trace:* S7S-3, S9I-10.

**C26 — The two architecture diagrams describe different graphs.**
The component map ends at the ID map and omits the governor, verification runner, loops and read path; the identifier chain ends at the read contract. The map feeds Horizon from the dispatch column while the text says Horizon reads projections.
*Trace:* S7S-5.

**C27 — The document header is not a design-of-record header.**
`Status: Draft` coexists with seven decisions dated 2026-11-01 asserted as settled. No version, no revision history, no owner approval line or evidence link.
*Trace:* S7S-7.

**C28 — Item 22 puts cross-repository and host operations into a Horizon deliverables list.**
Tagging another repository's `main`, reconciling the workspace `dev` branch, and pausing `jetson-probe.timer` are owner operations with no restore step for the probe and no authority boundary.
*Trace:* S8-6, S9I-11, S9Y-8.

**C29 — `org.yaml` and the withdrawal test have no schema or command.**
No YAML keys, budget units, approval-policy grammar, validation, re-seed command, or field marking an approval as organizational-only. The withdrawal test is accepted on "exit 0" with no assertions.
*Trace:* S9I-12, S5-11.

**C30 — Project-specific terms remain undefined.**
`godspeed-growth` and `edgeai` are never described; "tax-first" and the delivery-engineering contradiction are never stated; settlement and "three-valued" are never defined; `observed`/`assumed` appear once and never join the state list; Cognate, DomainForge, SWE_SEED, `~/.agents`, TokenEconomizer, Context Kernel and Workbench are named without definition or link.
*Trace:* S6-2, S6-4, S6-5, S6-6, S7Y-11.

**C31 — Overlapping vocabulary names different objects.**
"control plane" (Paperclip), "control surface" (the missing thing), "cockpit"/"console"/"dashboard" (the prohibited things) and "surface" (Paperclip's non-canonical UI) are used interchangeably. "evidence" names a RealityTrace record, a gate artifact and a category; "settlement evidence" is defined only by negation.
*Trace:* S7Y-9, S7Y-10.

**C32 — Name drift and inconsistent requirement citations in the plan.**
"ID ledger" versus "ID map" versus "the real ledger"; "resource governor" versus "one state machine"; three names for the ownership table. Fourteen of 22 entries carry no `R2-*`; paired requirements mark only one artifact; entry 12's `R2-9..11` over-claims.
*Trace:* S9Y-6, S9Y-12.

**C33 — The Verification Plan mixes categories with criteria.**
A lint bullet carries an acceptance criterion instead of a command; "Global Gates" carries an unfalsifiable argument and subsumes the preceding bullets; "E2E/Integration" lists journeys without pass conditions and omits CUJ 1.
*Trace:* S9Y-9, S9Y-10.

**C34 — Four enumerations of one architecture.**
Goals, components, increment steps and file entries restate the same eight things, which is why the internal inconsistencies survive: no single list is authoritative.
*Trace:* S8-8.

### 🟢 Nit

- **C35** Alternatives F and H bundle two decisions each, unlike A–E and G, so their pros and cons cannot be attributed. *(S7S-9)*
- **C36** Diagram-1 arrow semantics: a bidirectional `<-->` gate beside a "one-directional" claim; mixed arrow glyphs; an arrowhead driven into a border with no junction. *(S7S-10)*
- **C37** Mixed numbered and bulleted enumerations; letters for alternatives and numbers for files. *(S7S-11)*
- **C38** Hedges and unowned passives: "in practice", "before the first release is called accepted", "the pilot's track record exists". *(S7Y-14)*
- **C39** Advisory limits with no consequence: "2M tokens advisory" and "10 candidates per day" appear in no refusal path. *(S7Y-15)*
- **C40** Single-use terms without introduction: `sxr`, `EGM`, WarpRoom, "the register", "Twenty", "Home Assistant Yellow data-fabric rebuild". *(S6-12)*
- **C41** Approximation inside a test assertion: "~1,703 records". *(S9Y-13)*
- **C42** Entries 4, 9 and 17 restate L135–137 near-verbatim with no implementation delta. *(S9Y-14)*
- **C43** Unnamed edit locations for the `AGENTS.md` section and the exact `.gitignore` entries. *(S9I-13)*

**Counts:** 20 Blockers · 14 Major · 9 Nits (43 consolidated items from 108 raw findings).

## Traceability Matrix

| Consolidated | Raw findings |
| --- | --- |
| C1 Case-identity authority / already exists | S5-1, S6-8, S7D-4, S7D-13, S7Y-3, S9I-3, S9C-1, S9Y-2 |
| C2 Read contract source / placement / wiring | S5-2, S6-10, S7Y-4, S8-2, S9I-7, S9C-4, S9C-8 |
| C3 Competing budget and approval authorities | S5-3, S5-9, S7D-4, S7D-5, S7Y-7, S9C-5 |
| C4 Register misstatement / missing alternatives | S7D-1, S7D-2, S7D-12, S9C-5 |
| C5 GTM falsifier cannot fire | S6-9, S7D-3, S7Y-2 |
| C6 R2 register uncommitted | S6-1, S7S-2, S9Y-1 |
| C7 Paperclip pin / API / identity | S6-3, S9I-1, S9I-2 |
| C8 ID ledger schema / mint entrypoint | S9I-4 |
| C9 No runner or host for control modules | S5-4, S8-3, S9I-5 |
| C10 Ledger figure / replay precondition | S9C-2, S9Y-13 |
| C11 gate-control and gate binding | S5-7, S7S-6, S7Y-6, S8-5, S9I-9, S9C-10 |
| C12 Boundary / typecheck / test collection | S5-8, S9I-6, S9C-6, S9C-7 |
| C13 Missing Risks & Mitigations | S7D-6, S7S-1 |
| C14 Zero-Decision failures | S9I-1…S9I-8, S9Y-5, S9Y-7, S9Y-8 |
| C15 Circular replay gate | S9Y-4 |
| C16 unknown/unbound collapse | S9C-3 |
| C17 "No new systems" contradiction | S7Y-12, S8-1 |
| C18 Admission-floor contradiction | S6-7, S7S-4, S7Y-1 |
| C19 Egress as documentation / credential conflict | S6-11, S7D-8, S7Y-5, S8-4, S9Y-5 |
| C20 Unretained host measurements | S7D-11, S7Y-13, S8-7, S9C-9 |
| C21 Sub-modules, cohesive governor, hysteresis | S5-4, S5-5, S9Y-3, S9Y-11 |
| C22 Two-host verification | S5-6, S7D-7 |
| C23 SEA-Forge / RealityTrace transport | S7D-9 |
| C24 Unmeasurable acceptance / no metrics | S7D-10, S7S-8, S9I-8 |
| C25 Open Questions vs Increment 1 / phasing | S7S-3, S9I-10 |
| C26 Unsynchronised diagrams | S7S-5 |
| C27 Design-of-record header | S7S-7 |
| C28 Item 22 cross-repository actions | S8-6, S9I-11, S9Y-8 |
| C29 org.yaml / withdrawal test gap | S5-11, S9I-12 |
| C30 Undefined terms | S6-2, S6-4, S6-5, S6-6, S7S-12, S7Y-11 |
| C31 Vocabulary conflation | S7Y-8, S7Y-9, S7Y-10 |
| C32 Name drift / citation attachment | S9Y-6, S9Y-12 |
| C33 Verification Plan category mixing | S9Y-9, S9Y-10 |
| C34 Four enumerations | S5-10, S8-8 |
| C35–C43 Nits | S6-12, S7D-12, S7S-9, S7S-10, S7S-11, S7Y-14, S7Y-15, S9I-13, S9Y-13, S9Y-14 |

## Recommended Remediation Order

The reviewers converge on one sequencing point: **resolve authority and delete surplus components before rewriting prose.** Adding explanatory sections to justify the current component list raises complexity and will need another review round.

1. **Authority first (owner decisions, no code).** Decide C1 (does a Case ID get minted, and by whom), C3 (who owns affordability and approvals), C4 (is the register accurate about the Paperclip join). Until these are answered, every file entry below them is provisional. If the answer requires changing `REQ-CASE-001`, that is a spec revision and a plan rebind, not a document edit.
2. **Delete before adding.** Drop `control/loop/repair.ts` and `control/loop/gtm.ts` (C9), defer or re-home the Horizon read contract (C2), convert `control/egress/allowlist.md` into enforced configuration (C19), move item 22 to an owner-action checklist with a probe-restore step (C28). Stage 8 estimates about ten files and four component entries disappear.
3. **Commit the evidence base.** Inline the R2 register (C6), correct the document header and owner decisions (C27), retain the host measurements the thresholds depend on (C20), and re-derive one admission floor (C18).
4. **Pin the external boundary.** Paperclip package, exact version, transport, endpoints and service identity (C7), and the ID-ledger schema plus mint command (C8) — or drop the adapter from Increment 1 and keep the pilot on existing primitives.
5. **Bind the gates honestly.** A host-scoped control target rather than `gate-control` inside `just verify` (C11), a real boundary rule plus a control tsconfig plus a test-collection decision (C12), and a replay gate that is not circular (C15).
6. **Rewrite `DetailedRange` as an executable plan.** Schemas, signatures, argument contracts, expected assertion values, and a phase-to-file mapping (C14, C25).
7. **Add the missing standard sections.** Risks & Mitigations with a single-point-of-failure register (C13), and success metrics with a measurable predicate per CUJ (C24).
8. **Fix the GTM clock** so the negative-result rule can fire (C5).

## What Survives Scrutiny

- The ownership map holds: SEA-Forge, RealityTrace, Gauntlet, Cognate and DomainForge keep their roles, and the design refuses to become a second compiler, runtime, policy authority or evidence store.
- Auto-merge is correctly refused, including rejection of the design's own "10 consecutive merges" counter on the honest ground that "routine" was not falsifiable.
- The alternatives section names real options and, for the product choice, records concrete rejection reasons. Two of them (B, and partly A) are factually wrong, which is a repair, not a discard.
- The declarative org seed in git, the withdrawal test, the "refuse repair, never evict the model" precedence rule and the owner-gated external conversation are the right shape for the stated constraints.
- The document is a decision record for the owner, and a good one. It is not yet a design of record a fresh implementing agent can execute, and it cannot claim an unchanged frozen spec while adding a Case minting authority.

## Artifacts

- `zoom_out_report.md` — Stage 5
- `comprehension_report.md` — Stage 6
- `critic_report.md` — Stage 7 (`egm-design`, `egm-structural`, `egm-style`)
- `intermediate_zoom_out_report.md` — Stage 8
- `implementation_readiness_report.md` — Stage 9 (`egm-implementation-readiness`, `egm-codebase-details`, `egm-style`)
- `consolidated_review_report.md` — this file

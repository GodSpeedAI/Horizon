# Stage 9 — Implementation Readiness Test

**Target:** `docs/designs/godspeed-egm-jetson-control-plane.md`, `DetailedRange 237..367`
**Personas:** `egm-implementation-readiness` (implementation-readiness-standard), `egm-codebase-details` (implementation-readiness-standard), `egm-style` (no standard)
**Reviewer status:** completed · completed · completed

## Implementation Readiness (`egm-implementation-readiness`)

**S9I-1 [Blocker] The Paperclip package and version are unpinned.**
Scope: `control/package.json` (L318–321), `control/README.md` (L243–246), `control/adapter/paperclip-client.ts` (L263–266).
The document only says "pinned Paperclip dependency" and "pinned by exact npm version". No package name, version, registry, commit or tarball hash. Line 55 lists the pin as an open question. The Zero-Decision Rule fails at the first file: the implementer cannot write `control/package.json`.

**S9I-2 [Blocker] The Paperclip API surface is unspecified.**
Scope: `control/adapter/paperclip-client.ts` (L263–266), `control/paperclip-smoke.sh` (L308–311), `control/org.yaml` (L248–251).
No endpoint list, transport (HTTP/GraphQL/database), auth header, service-identity issuance, or the call that loads `org.yaml` into Paperclip ("load org.yaml" at L311 has no command). "Retry with recorded reasons" has no count, backoff or idempotency key. Also unspecified: the error type returned when refusing a Paperclip approval as settlement evidence, and how that guard is wired to `src/settlement/` and `src/adapters/settlement.ts`.

**S9I-3 [Blocker] `agent-event/v1` already carries `case_id`, and the "additive change" has no schema location or mechanism.**
Scope: `control/ids/schema.ts` (L268–271), `control/ids/replay.test.ts` (L278–281).
The live schema is RealityTrace-owned and Horizon only reads it (`test/support/economics-fixture.ts:25–33` emits `schema: "agent-event/v1"`, `agent_event_version: 1`, `case_id`; `src/economics/model.ts:85,207–215` parses `case_id` and derives unbound from `case_id === null`). So the additive field already exists, no schema file exists in this repository, no cross-repo target is listed, and the additive-change rule (unknown-field tolerance, version bump, required versus optional) is undefined. It is also unspecified whether `unbound` is stored or derived.

**S9I-4 [Blocker] `ids/map.yaml` has no schema.**
Scope: `control/ids/map.yaml` (L273–276).
"Minted case IDs with their minting authority and parent links" is not a schema. Missing: case-ID grammar, top-level layout, per-entry fields, `unbound` representation, parent-link cardinality, timestamp source, monotonic ordering, append-only or not, the concurrency protocol for two mints, and who writes the file (CLI or function) with its entrypoint.

**S9I-5 [Blocker] No runner, host, entrypoint or schedule for any `control/` module.**
Scope: items 4, 9, 10, 11, 12 (L258–301).
Seven TypeScript modules and two shell scripts are created, and nothing says what executes them. No systemd units beyond `paperclip.service` (L253), no `control/bin/*` entrypoints, no CLI argument contracts, no timers, no invocation path from the adapter. "Refuses ungoverned targets with a typed refusal" names no type. "Gauntlet for bounded work" names no Gauntlet client (none exists in `src/`), no correlation-ID format, and no SEA-Forge classification call.

**S9I-6 [Blocker] The stated boundary check has no enforcing code.**
Scope: L359.
`scripts/check-boundaries.ts` enforces only `src/domain|ui|config` → `adapters|runtime` import direction and bans product-model/cockpit-server references; nothing inspects `control/`. No target file modifies that script, so the claim is unverified and the implementer must invent the rule.

**S9I-7 [Blocker] The Horizon read contract is unreachable and unwired.**
Scope: item 17 (L323–326).
No exported signature, no projection names it reads, no state union type, no `src/app.ts` or `src/ui` wiring, so `control-plane-read.ts` ships as dead code that `just test` cannot detect. The distinct states `blocked|unknown|denied|unbound` have no field to live in.

**S9I-8 [Major] Test assertions are not concrete.**
Scope: items 8 and 18 (L278–281, L328–331); Verification Plan L356.
"blocked and denied stay distinct", "a Paperclip approval is refused", "works with Paperclip uninstalled" name no inputs, expected values or fixtures. Each case needs the fixture row and the asserted value or error code, following `test/support/` conventions.

**S9I-9 [Major] No requirement binding, evidence paths, falsifiers or independent confirmation.**
Scope: Verification Plan (L353–361).
Horizon `AGENTS.md` requires, per settlement task: spec IDs, positive observation, falsifier/teeth, redesign trigger, evidence path and fresh independent confirmation; `gate_binding_rule` requires a real verified target with no fake green aliases. The plan cites only `R2-*`, which are this document's own labels and several are listed as unresolved (L48–55). No preregistration entry, no evidence path, no plan or ledger rebind.

**S9I-10 [Major] Phasing is not mapped to the 22 files.**
Scope: L167–175 vs L241–351.
The seven-step Increment 1 sequence and the 22-file list are independent orderings; no file is assigned to a phase, so nothing guarantees a buildable, testable state between phases. Whether the additive schema and `map.yaml` land before or after the adapter is unstated, as is what the first mint waits on.

**S9I-11 [Major] Item 22 is an owner action in another repository, listed as a Horizon target file.**
Scope: L348–351.
`edgeai` deploy is "Modify — cross-repository" with no path, and "reconcile the workspace `dev` branch" is a git mutation with no commands.

**S9I-12 [Major] `org.yaml` schema and loader unstated.**
Scope: item 2 (L248–251).
"Six pillars with goals, budgets, approval policies and owner gates" has no YAML keys, no budget units or currency, no approval-policy grammar, no validation and no re-seed command. "Records which Paperclip approvals are organizational only" has no field.

**S9I-13 [Nit] Unnamed edit locations.**
Scope: item 19 (L333–336), item 21 (L343–346).
The `AGENTS.md` edit location (§2 map versus §9 boundaries) and the exact `.gitignore` entries are unspecified.

## Codebase Details (`egm-codebase-details`)

**S9C-1 [Blocker] `case_id` is presented as future work but already exists and is already consumed.**
Scope: L30, L136, L165, L171, L271, L281.
`agent-event/v1` records already carry `case_id` and Horizon already parses it (`src/economics/model.ts:85,176,207,215,314,392`); the live-schema witness is `test/economics-live.test.ts:27–28` (`schema: "agent-event/v1"`, `case_id: "case:live"`) and the fixture is `test/support/economics-fixture.ts:11,34`. `unbound` is already first-class and rendered (`model.ts:388–396`, covered by `test/economics-model.test.ts:42,48,51`). Every reader inherits "additive field to be introduced / starts empty" as false.

**S9C-2 [Blocker] The "~1,703 live Horizon ledger" figure is neither Horizon's store nor reproducible.**
Scope: L49, L165, L281.
Horizon stores no agent events; the ledger belongs to RealityTrace (`.agents/reports/2026-10-30-agent-economics-realitytrace.md` §6; `src/adapters/realitytrace-economics.ts:6–9` "Nothing it returns is stored"). The reviewer reports that `realitytrace ledger export` currently exits 2 with "ledger integrity: startup tail-chain verification failed …:704", so the replay test's precondition ("a copy of the real ledger", L281/L357) is broken now, and an unmerged fix is documented in a committed report the design never mentions. The 1,703 figure appears only in `.tmp/egm-integration/discovery.md:52`, which is gitignored; the committed report's own count is "first real drain: 1 449 ledger records". Re-run the export before relying on either figure.

**S9C-3 [Major] `unknown` and `unbound` cannot be distinct as drawn.**
Scope: L141, L326, L331.
The existing parser deliberately collapses the tap's `"unknown"` sentinel to `null` (`src/economics/model.ts:213–215`), i.e. into unbound. Achieving the contract requires editing that parse, and no file is listed as `Modify` for it.

**S9C-4 [Major] `src/projections/control-plane-read.ts` contradicts the projection contract.**
`src/projections/README.md` and both members are Cognate-event folds implementing `Projection`. Nothing folds Paperclip work items or `ids/map.yaml`, and no such source exists. A read over a foreign product's records is the pattern already implemented under `src/adapters/` (`realitytrace-economics.ts`), which the design ignores. Item 17 never names which projection rows feed "intention → work → run → evidence → settlement".

**S9C-5 [Major] The cited integration register says the opposite about Paperclip.**
`.agents/reports/horizon-product-integration-register.yaml:35–51` gives WarpRoom (Paperclip) disposition `join_product`, "Join one-way through its own MCP server (packages/mcp-server) and REST API", and "WarpRoom's board approvals and budgets stay authoritative inside WarpRoom". Alternative B (L197) misstates that disposition, the design demotes Paperclip approvals to non-authoritative (L34), and it proposes a bespoke client in place of the registered MCP/REST join.

**S9C-6 [Major] `just boundaries` would not cover `control/`, and could fail it.**
`src` and `test` are the only walked directories. Meanwhile the competing-model and duplicate-semantic-authority scans walk the repository root while skipping `node_modules` only at the root-relative prefix, so `control/node_modules` (implied by item 16) is walked, and any dependency directory named `product-model`/`product-actualizer`, or any `.sea` file inside a pinned npm dependency, fails `just verify` once `gate-control` is added.

**S9C-7 [Major] Control-tree verification is under-specified.**
Root `tsconfig.json` includes only `["src","scripts","test","cognate.config.ts"]`, so `control/**.ts` is not typechecked; "`bun x tsc --noEmit` for the control tree" (L355) needs an unlisted `control/tsconfig.json`. `just test` runs `bun test`, which recursively collects `control/**/*.test.ts`, so the real-ledger replay test would run under plain `just test`/`verify` with no skip or exclusion defined. Root `package.json` has no workspaces, and item 20 edits only the `justfile`.

**S9C-8 [Major] The "new" read-contract tests duplicate existing proofs.**
`test/J02-live.test.ts:220–254` already proves `execution_record` → `realitytrace_observation` → `settlement_reference: unsettled`; approvals are covered by `test/J02r2-live.test.ts` and `test/support/j02r2-rig.ts` over `src/adapters/sea-forge-approvals.ts` (`REQ-UX-007`); affordability is covered by `src/domain/payment.ts`, `src/capabilities/capacity-ledger.ts` and `test/payment-capacity.test.ts`. Item 18 restates existing behaviour without naming it.

**S9C-9 [Major] The "verified 2026-11-01" host claims have no retained artifact.**
No evidence log contains Docker, cgroup, `29.7.1` or `25.9`. The one EdgeAI evidence file (`edgeai-egm-jetson-ops.log`, exit 1) does show the doctor `missing 'Summary'` failure the document cites, so that single claim holds. The Docker 29.7.1, cgroup v2 and Node 25.9.0 claims remain unsourced, and all cited evidence sits in gitignored `.tmp/`.

**S9C-10 [Nit] Governance naming.**
`just gate-control` (L341) breaks the `gate-tNN` convention; no plan task, requirement set, preregistration or settlement entry is named for this workstream, while L360 asserts the frozen spec hash is unchanged even though the design adds a Case-ID minting authority for a concept the spec defines as derived (`REQ-CASE-001`, `src/domain/navigation.ts:326`).

Verified as accurate: the per-launch `0600` secret (`src/config/load.ts:235–236`), the existence of `just check`/`just boundaries`, and `just verify` composition.

## Style Editor (`egm-style`, implementation range)

**S9Y-1 [Blocker] Dangling citation.**
Scope: L291, L48–54.
`(R2-12)` is the only requirement ID in the section that is never defined; the Open Questions list runs R2-3…R2-7, R2-9..11, R2-14, skipping R2-8 and R2-12–13. A fresh agent cannot resolve what it must satisfy.

**S9Y-2 [Blocker] One word, three referents.**
Scope: L275, 281, 316, 346, 357.
"Version-controlled ID ledger" and "verify the ID map" name `ids/map.yaml`; "a copy of the real ledger" and "the real Horizon ledger" name the `agent-event/v1` record set. The Verification Plan's command and the artifact under test are distinguishable only by guessing.

**S9Y-3 [Blocker] Contradictory ownership.**
Scope: L286 vs L306 vs L50, L52.
L286 gives the governor `egress`; L306 assigns the egress mechanism to a separate document and names no enforcing component. R2-5 asks which single component owns egress; the plan answers twice.

**S9Y-4 [Blocker] Circular execution rule.**
Scope: L281 vs L341, L356–357, L360.
The replay test "gates the first mint" and runs "against a copy of the real ledger" as a precondition, yet it sits inside `bun test control` and inside `gate-control`, which `just verify` must keep green. The gate can never be satisfied before the first mint and is required unconditionally after.

**S9Y-5 [Blocker] An undecided either/or inside an executable entry.**
Scope: L306.
"The named mechanism (nftables SNI rules or a network namespace plus proxy)" leaves the file's content undetermined.

**S9Y-6 [Major] Citation attachment is inconsistent.**
Scope: L243–351.
Fourteen of 22 entries carry no `R2-*`. Where cited, only one artifact of a paired requirement is marked: R2-3 marks the read contract (L326) but not the dispatch adapter (L261); R2-4 marks `schema.ts` (L271) but not `map.yaml` or the replay test; R2-6 marks the withdrawal test (L316) but not the org seed (L251). Entry 12's `(R2-9..11)` over-claims: the preparation-only exit criterion named at L53 does not appear at L301.

**S9Y-7 [Major] Mixed mood within a structured field.**
Scope: L246–351.
Most `Proposed Changes` are nominal inventories ("Pinned-version client, service-identity writes only"), entries 8, 14 and 15 are imperative, and entry 17 is a descriptive noun phrase. Every entry also appends rationale or acceptance claim after the instruction list ("This test gates the first mint."), mixing two categories in one field.

**S9Y-8 [Major] Heading-versus-content break.**
Scope: L348–351 vs L241.
The heading promises `Target Files to Create/Modify`, but entry 22 is not a file, its type is "Modify — cross-repository, owner action", and "reconcile the workspace `dev` branch" names no verifiable operation.

**S9Y-9 [Major] Categories mixed with criteria in the Verification Plan.**
Scope: L353–361.
"Static Analysis & Linting" carries an acceptance criterion, not a command. "Global Gates" carries an unfalsifiable argument (the spec hash is unchanged "because this design does not alter Horizon's normative meaning") and subsumes every preceding bullet, so five bullets verify the same set twice. "E2E/Integration" lists journeys without pass conditions and omits CUJ 1, whose proof entry 14 already claims.

**S9Y-10 [Major] Unfalsifiable phrasing.**
Scope: L246, 266, 311, 316, 326.
"without reading the code" (L246) reads as a goal statement in a change inventory. "retry with recorded reasons" has no bound and no reason schema. "exit non-zero with a reason on any failure" enumerates no failures and accepts any non-empty string. "remain intact" and "No writes, no authority" are properties, not tests, and none of the five phrases an observable failure condition.

**S9Y-11 [Major] `hysteresis bands` is the only threshold without a number.**
Scope: L286.
Its siblings are `≥ 14.3 GiB`, `85 °C` and `100 GiB`. Without bands or a dwell time, the state machine cannot be implemented.

**S9Y-12 [Major] Name drift for the same constructs.**
Scope: L260, 285, 290, 356, 357.
"Verification runner" / "container runner" / "container.ts"; "Resource governor" / "One state machine" / "state-machine.ts"; "Dispatch adapter" / "adapter refusals" with two distinct refusal behaviours in entries 4 and 5; three names for the ownership table ("ownership table types", "mint/reference/resolve responsibility table", "ID-ownership table").

**S9Y-13 [Nit] Approximation inside a test assertion.**
Scope: L281.
"~1,703 records" is not a testable quantity.

**S9Y-14 [Nit] Restatement without implementation delta.**
Scope: L261, 286, 326.
Entries 4, 9 and 17 restate L135–137 near-verbatim.

# Brownfield Restructuring

The audit-then-restructure procedure for an existing repository (SKILL.md mode: **Brownfield / Restructure**) and its audit-only variant. Load this reference when the working repository already exists and the goal is a better topology — not a rewrite.

## Goal

Improve an existing repository's topology — navigation, source-of-truth placement, instruction locality, configuration, command discoverability, verification discoverability, project memory, semantic representation, and evidence/observation seams — **without** unnecessary aesthetic reorganization or behavioral rewrites. You are improving where truth lives and how work is found, not reskinning the tree.

Every move must trace to an observed finding. If the only argument for a change is "this layout looks prettier," the change is out of scope.

### How to use this reference

Progressive disclosure: after reading SKILL.md section 4, load this file to drive the pass. Do not preload the sibling references; load each only when a phase names it ([verification-topology](verification-topology.md) at B8 and D6, [agents-workbench](agents-workbench.md) at D2 and D6, [cold-agent-evaluation](cold-agent-evaluation.md) at E4). The bundled skills (`neatcode`, `deriving-interaction-domain-models`, `domainforge-sea`) are invoked through SKILL.md section 5 and never re-implemented or restated here.

## Invariants held

- Freeze semantics and cross-component interfaces; leave private implementation open.
- One home per fact; a link beats a copy. Minimum sufficient structure; no architecture theater.
- Never false-green; structural E2E settles before handoff; unimplemented behavioral obligations stay honestly red.
- Observed-only evidence. Error surfaces are bounded, discriminating, diagnosable, actionable, recoverable, independently verifiable.
- Portable paths only; never machine-specific absolute paths, model names, or local ports in generated artifacts.
- Deterministic machinery is scripted; semantic judgment is model reasoning.
- Preserve effective existing conventions. Do not force a greenfield template over mature repositories.
- Do not rearrange code merely because another layout is prettier.

## Orientation

Distinguish the two entry modes before starting. Ask the user only about ambiguities that would materially corrupt the outcome; otherwise pick the defensible minimum and record it in `.agents/OPEN_QUESTIONS.md`.

- **Restructure** — the user wants a topology pass followed by concrete migration. Run Phases A–E.
- **Audit-only** — the user wants the report only, nothing moved. Run Phases A–C (classification as proposals), deliver `xxx-audit.md`, stop. Phases D–E do not run.

### Scope exclusions

This reference does not cover, and a brownfield pass must not drift into:

- **Greenfield formation.** Fresh substrate, semantic formation, walking skeletons, born-observable project shaping — see [greenfield-formation](greenfield-formation.md).
- **Behavioral rewrites.** Reimplementing algorithms, changing contracts, migrating to a new framework. If the user's real need is a rewrite, say so and hand off; a topology pass on a codebase slated for replacement is wasted work.
- **Verification graph construction beyond the map rows.** The graph itself is defined in [verification-topology](verification-topology.md); brownfield wires only the requirement→proof links that the audit's B8 and B4 rows justify.
- **Plugin-internal reference content.** Rules that belong to another reference of this plugin stay in that reference; this file only links to them.

Workflow at a glance:

| Phase | Purpose | Edits | Gate |
|-------|---------|-------|------|
| A | Inventory the tree before any reasoning about changes | none | inventory artifact written |
| B | Audit eleven dimensions against observed evidence | none | findings list written |
| C | Classify findings, build the migration map | none (proposal only) | **human approval** |
| D | Execute the approved map; write routers/contracts/config/justfile | yes | map executed |
| E | Verify before/after; cold-walk; record evidence | repairs only | report written |

### Audit probes

Deterministic machinery — run them, record output, do not re-derive by hand. All are portable; substitute the repo's ecosystem equivalents where named tools differ.

- Tree map: the inventory pass over paths, sizes, and per-area file counts.
- Referent map: resolve who imports, includes, or links each area (dependency resolver or `rg <identifier> --glob`).
- Change history: `git log -1 -- <path>` per area; `git log --diff-filter=D` for recently deleted targets still referenced.
- Command surface: task-runner listing (`just --list` or equivalent), package scripts, `Makefile` targets, CI workflow steps.
- Truth duplication: count distinct definitions of key identifiers per tree; diff the top two per identifier.
- Prose-config scan: identity matches between values your tools consume and values your prose documents.
- Test→requirement map: enumerate test targets, then cross-reference each against requirement/capability identifiers.

Never invent evidence for a probe that errored; record the error and treat the dimension as partially audited.

## Phase A — Inventory before modifying

No edits this pass. Map what exists so every later decision is about observed facts.

1. Record the worktree state: `git status` and recent `git log`. Note uncommitted local work; you will preserve it untouched. Do not fetch, pull, reset, clean, or rebase.
2. Map the tree. For each top-level area, record:
   - **What it is** — one-line identity (package, module, docs, tests, scratch, CI).
   - **What refers to it** — imports, `ref:`/grep hits, doc links, build config, task-runner recipes, CI steps.
   - **When it changed** — `git log -1 -- <path>`; quiescent areas signal decoration or dead weight.
3. Identify existing infrastructure before proposing anything: `.agents/`, `AGENTS.md`, `.sea`, specs, plans, tests, a `justfile`/task runner, structured config, CI config.
4. Produce an **inventory artifact**: `.agents/reports/xxx-inventory.md`. Concrete, observed, path-referenced. Not an opinionated restructuring plan at this stage.
5. Snapshot the **baseline verification surface**: every command that exists today to build, test, check, and verify, with the assertion that it runs green/red. This is the before-side of Phase E's before/after; without it, "no unintended change" is unprovable.
6. Record unresolved material ambiguities in `.agents/OPEN_QUESTIONS.md`; do not silently resolve them.

**Definition of done:** a cold observer can reconstruct the tree, its referents, and its change history from the inventory artifact alone. If the tree is unversioned or not in git, say so in the inventory — the safety rails in Phase D depend on version-control moves.

## Phase B — Audit dimensions

Work each dimension against the inventory. Record only what you actually observe; a signal is a signal only when you can name the file and the evidence.

### B1. Actual source-of-truth surfaces
Files that own facts versus files that carry copies of them. Signals: the file everyone edits yet no interface imports; an exported constant re-declared nearby; "definitive" policy stated inline in two call sites; a schema literal duplicated across adapters. Locate by grepping identifiers across the tree and counting distinct definitions; treat each count ≥ 2 as a candidate copy.

### B2. Architecture and boundaries
Package/module/service seams and dependency direction. Signals: import edges that cross what look like intended layers; `import any`/god-objects silently bridging boundaries; composition roots declaring the seams. Locate by resolving the import graph per package, then recording edges that contradict an explicit statement of intent (doc or code comment). Do not redesign here — record the seams that matter and the contracts that cross them; Phase C decides what moves.

### B3. Duplicated or contradictory truth
The same fact in ≥2 places (a port re-declared, a policy stated in both code and markdown, two numeric constants that agree by accident or disagree by mistake). Locate by diffing the copies you found in B1 and by grepping prose for strings that look like code identifiers. Mark contradictions explicitly with both locations and the divergence. **Conflict resolution rule:** pick one home, link the rest — never merge-then-split. Prefer the machine-verifiable home (code/structured config) for behavioral facts, and the authored home (spec/ledger) over projection for requirements.

### B4. Oversized routing/instruction surfaces
Entry files carrying payload. Signals: a root `README` or `AGENTS.md` that is every doc at once; a router file containing business logic; a `main` that orchestrates rather than wires; a single test harness that "runs everything". Locate by measuring entry files: line count, ratio of wiring to logic, number of distinct topics they cover. Record what the surface should delegate and to which target.

### B5. Missing local instructions
Deep folders with no contract for what lives there or how to work inside them. Signals: a directory with no directory-local doc while sibling directories have one; a folder whose purpose is inferable only from its file names; a folder that accumulates "misc". Locate by walking the inventory tree and flagging leaf folders with no instruction-bearing file. A folder is undiscoverable if nothing says why it exists, what belongs in it, or how its output couples to another folder's input. The fix is *local* instruction, not a fatter root router.

### B6. Machine config expressed as prose
Configuration written in markdown, README-documented flags, or hardcoded env values where durable ecosystem-native config belongs. Signals: "set X by editing line 14 of README"; a `config.example` no tool reads; values with no schema. Locate by grepping prose for command-output strings and by diffing the config that tools read against the config the docs describe. Audit for TOML/YAML/JSON/ecosystem-native homes. **Do not move** environment-local secrets to committed files; `.env` stays for environment-local values only.

### B7. Undocumented or scattered commands
Find every command actually used to build/test/check: `just --list` (or the task runner's equivalent), package scripts, Makefile, CI steps. Signals: a command discoverable only by reading a doc or a CI log; the same operation spelled three ways across three entries; "how do I run the tests" answered with a paragraph. Locate by listing the task runner surface, then dumping the CI workflow steps and diffing the two. Record what `just` recipes the repo needs so `just --list` is a usable cold map that matches reality.

### B8. Verification-discovery debt
Tests that cannot be mapped to a requirement or capability; a suite with no narrow proof command (only "run everything"); red tests with no corresponding open obligation. Signals: `just test` turns the whole suite red but the cause is one module; a test file whose name maps to no capability name; a failing test no one can trace to a requirement. Locate by enumerating test targets and cross-referencing each to a requirement or capability identifier. See [verification-topology](verification-topology.md) for the graph you are allowed to establish.

### B9. Transient work mixed with durable truth
Mutable work state (drafts, scratch output, in-progress artifacts) living inside durable reference areas. Signals: `notes/` next to `docs/`; experiment output in the spec folder; `WIP` markers in files a test imports; outputs committed where inputs live. Locate by diffing what changes most often (git log) against what the docs claim is durable. Durable reference (docs, specs, schema, config, ledger) must be trustworthy on a cold read; separate mutable work state into its own place — never the reverse.

### B10. Reuse the good parts
Inspect existing `.agents/`, `AGENTS.md`, `.sea`, specs, plans, tests, task runner, structured config **before proposing anything**. Adopt what genuinely works; rehome only what is mis-placed; extend, don't replace. Preserve effective existing conventions over greenfield templates.

### B11. Semantic representation gaps
Where purposeful domain interactions exist but no canonical model does, note `.sea` formation candidates. Only where an interaction surface actually exists — never force semantics onto a pure infrastructure substrate. Formation is performed by the bundled skills (`deriving-interaction-domain-models`, `domainforge-sea`) per SKILL.md section 5 — this reference records the *candidate*, it does not re-derive the skill.

### B-summary
End Phase B with a findings list; each row: finding id, dimension, evidence (paths), impact, severity. This list is the input to Phase C. **Definition of done:** every row names observed evidence; there are no hypothetical rows.

## Phase C — Classify and propose the smallest useful revision

Map each finding to one action:

- **Preserve** — works, idiomatic, correctly placed. Change nothing. Explicitly *choose* to keep it so the map is auditable.
- **Generalize** — a narrow-but-valuable instruction or use becomes reusable at the right level (local doc → documented convention; one-off script → `just` recipe).
- **Migrate** — move the thing to its correct home (prose config → structured config, scattered commands → `justfile`, duplicated truth → one home plus links).
- **Retire** — dead or superseded. Propose it; record it in `DEBT_OBSERVED.md`; **do not silently delete**. Deletion without a recorded rationale is a behavior change.

Decision rules:

- **Burden vs move cost.** A finding whose burden (cold-read cost, contradiction risk, mis-placement) is lower than the cost of moving it stays **preserve**. When a move and a preserve both appear defensible, choose the smaller delta and record why in the proposal.
- **Consumers decide migrate vs link.** A path with live consumers (CI, cloned repos, other packages) either moves with those consumers in the same pass or keeps its path and gains a link — never silently breaks.
- **One row per fact.** A duplicated fact (B3) yields exactly one migration row for the winning home plus link rows for the losers; it never yields a merge-then-split.

Steps:

1. Build the **migration map**: `old path → new path → action → rationale`. Every row traces to a Phase B finding; every proposed new surface traces to a reason (semantics, engineering constraint, or verification need). No architecture theater.
2. Get approval before moving. Write the proposal to `.agents/plans/xxx-restructure.md` (or `reports/`) and record open questions. This is a **human gate**: the user is present; you do not move trees on your own authority. Deliver the map and wait.
3. Name the surfaces you keep frozen through the move: cross-component contracts, public schemas, event schemas, observable interfaces, documented command names. Private decomposition stays free.
4. Check for downstream consumers: CI, cloned copies, other repos importing the moved paths. If the move breaks a consumer, either migrate it in the same pass or leave the path and link — say which in the proposal.

**Definition of done:** the proposal names every surface that moved or froze, a rationale per row, and the consumers checked. No row lacks an audit-finding anchor.

## Phase D — Migrate without aesthetic churn

Preserve behavior. Move files with the version-control rename (`git mv`) when tracked; leave provenance legible. Do not re-style files you are only relocating.

1. **Move files, not content clouds.** Follow the approved map. A file that moves retains its content; edit content only where the move's own rationale requires it.
2. **Write the router and the contracts.** Root `AGENTS.md` (a concise operating surface — identity, repo map, dev loop, conventions, testing strategy, boundaries, security, git policy, completion criteria) and the directory-local instructions B5 exposed. Delegate; do not dump. Where `.agents/` is created or repaired, include `.agents/AGENTS.md` with the status append/mirror protocol plus `CURRENT_STATUS.jsonl` and its `CURRENT_STATUS.md` mirror. See [agents-workbench](agents-workbench.md).
3. **De-duplicate toward one home per fact.** Where a copy lived and something might still reference it, leave a link or a pointer — a pointer, not a second truth. For behavioral facts prefer the machine-verifiable home; for requirements prefer the authored home.
4. **Establish structured config** (TOML/YAML/JSON/ecosystem-native) for durable machine-consumed behavior; move prose config out of markdown. Keep `.env` for environment-local values only. Portable paths everywhere; no local model names, ports, or absolute paths.
5. **Standardize the command surface.** Derive a `justfile` from the repo's real ecosystem commands (`setup`, `dev`, `build`, `check`, `fmt`, `lint`, `test` with scoped variants, task-scoped gates, `clean`). Recipes compose ecosystem-native tools; they never replace them. `just --list` must be a usable cold map.
6. **Wire the verification graph** per [verification-topology](verification-topology.md) — requirement → proof command → gate — and the workbench per [agents-workbench](agents-workbench.md) (status: append one complete-snapshot line to `CURRENT_STATUS.jsonl`, mirror `CURRENT_STATUS.md` in place in the same change; record command/outcome/scope before calling a gate passed).
7. **Record moves and rationale as you go** in `.agents/` (plans/reports). Nothing moves without a map row; nothing changes behavior except as explicitly approved.

Constraints:

- Freeze semantics and cross-component interfaces; leave private implementation open.
- Do not restructure private helpers "while the file is open" — that is aesthetic churn unrelated to the migration.
- Do not hot-fix an oversized router so it "works now" instead of rehoming its payload; the router stays a router.
- Sequence moves so every intermediate state still builds — proceed in map order; each step is independently verifiable at its boundary.

**Definition of done:** the tree matches the approved map; content changed only where the move's rationale required it; `.agents/` and `AGENTS.md` reflect the executed state, not the proposal.

## Phase E — Verify no unintended change

1. **Run the existing verification surface before** the migration and record the baseline: commands, versions, environment assumptions, green/red per item. Run the **same commands after**. Green stays green; red stays honestly red.
2. Confirm no **stole-green**: red did not turn green because a mock now agrees with itself, a test can no longer reach the thing it tests, or a previously-failing path was quietly deleted. A green that replaced a meaningful red is a regression, not progress.
3. Run the deterministic scripts in this plugin (`scripts/` — validate-plugin, scaffold-check, and the rest) against any substrate you touched. They are machinery; run them, do not re-derive their checks by hand.
4. **Re-run the cold-agent evaluation** from [cold-agent-evaluation](cold-agent-evaluation.md): a cold actor must reach the right work/proof surface cheaply — where truth lives, where change X belongs, the narrowest proof command, what must not be modified, how to tell whether a requirement settled. Fix structural or routing debt the walk reveals.
5. Record results in `.agents/reports/`: baseline, after, cold-walk evidence, deviations from the approved map with rationale. Evidence is observed-only: commands run and output, not "should be green".

**Definition of done:** the report names every command run and its observed result; the before/after comparison has no unexplained green→red or red→green transitions; the cold-walk is recorded and any debt it surfaced is either fixed or written to `DEBT_OBSERVED.md`.

## Audit-only path

When the user wants only the audit: run Phase A + Phase B, classify findings (Phase C classification, no execution), and deliver the report — `.agents/reports/xxx-audit.md`. **No edits**, no migration-map execution. The report lists candidate actions as proposals, never as performed changes, and names the human gate where execution would begin.

## Failure modes

- **Force-fitting a greenfield template onto a mature repo.** The template is a router, not a mold. Preserve effective conventions; reuse the good parts you found in B10. Detection: map rows with no corresponding audit finding; generated files the repo's own tools never read.
- **Aesthetic churn with no topology gain.** Every move must trace to an inventory finding; "prettier" is not a rationale. Detection: Phase E cold-walk shows equal-or-worse navigation burden.
- **Silently changing behavior during a "topology-only" pass.** Relocating a file must not change what it does. Detection: before/after verification shows a previously-passing item failing, or an output diffs.
- **Breaking canonical truth while de-duplicating.** Merging two versions of a fact introduces alias corruption unless the winner is picked explicitly (B3), recorded, and the losers linked. Detection: two call sites that previously agreed now diverge; a config the tool reads differs from the documented one.
- **Hot-fixing routing files instead of rehoming payload.** Patching an oversized router so it "works now" grows the debt it was meant to dissolve. Detection: the oversized surface in Phase E has more lines than it did in Phase B.
- **Leaving the workbench stale.** `.agents/` plans, reports, status history, and `OPEN_QUESTIONS.md` must reflect the migration actually performed. A stale workbench is a lie the next cold actor pays for. Detection: a cold actor consults `.agents/` and finds a plan that describes a different tree, or the last `CURRENT_STATUS.jsonl` line / `CURRENT_STATUS.md` mirror predates the move.
- **Claiming verification without observed runs.** No "should be green". Record the commands run, the output, and the after-state. Detection: the report lacks command names, results, or timestamps.
- **Stole-green.** A red obligation flipped to green because the test lost its reach is a false green — the worst kind, because it looks complete and is not. Detection: Phase E diffs test reachability, not just the pass/fail bit.

## Summative checklist

A restructure passes when, in order: the inventory artifact is standalone-readable; every Phase B row names observed evidence; the proposal's map rows all anchor to findings and the human gate approved them; the tree matches the map; `.agents/` and `AGENTS.md` match the executed state (status appended to `CURRENT_STATUS.jsonl`, `CURRENT_STATUS.md` mirrored in place); before/after verification shows green-stays-green, red-stays-honest-red, and no stole-green; the cold-walk is recorded with any surfaced debt written down. Anything short of that is an incomplete pass, not a small one — record the gap in `DEBT_OBSERVED.md` or the report and say explicitly what did not complete.

## Related

- [topology-principles](topology-principles.md) — generalized principles; decide what actually improves a given repo.
- [verification-topology](verification-topology.md) — verification graph, structural vs behavioral E2E, task-scoped gates, proof kinds.
- [agents-workbench](agents-workbench.md) — `AGENTS.md` and `.agents/` conventions for the migrated workbench.
- [cold-agent-evaluation](cold-agent-evaluation.md) — cold-walk the result; navigation-burden measurement.
- [greenfield-formation](greenfield-formation.md) — only where a fresh substrate, not a restructure, is the mandate.
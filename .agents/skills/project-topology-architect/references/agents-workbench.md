# Agents-workbench: root `AGENTS.md` and the `.agents/` durable workbench

Phase P6 procedure for generated projects. Produce a concise router plus a durable,
knowledge-holding workbench that cold agents operate from with minimal search and no
context reconstruction. Pair this reference with [greenfield-formation](greenfield-formation.md)
(for when the workbench is built) and [topology-principles](topology-principles.md) (one home
per fact, minimum sufficient structure). Cross-check the finished surface with
`scripts/scaffold-check.py`.

## 1. Root `AGENTS.md` — the project-wide router

1. Write one file at the repository root.
2. Give it the single role: **project-wide agent operating and router surface** for agents
   and humans. It routes, it does not contain.
3. Cover the twelve concise categories, in order:

   1. Identity and priorities — what the project is and what dominates.
   2. Repository map — where truth, work, and proof live.
   3. Development loop — edit → build → test → verify loop.
   4. Build and validation — canonical build and validation entry points.
   5. Code conventions — style and structure rules.
   6. Testing strategy — what kinds of tests exist and when each runs.
   7. Documentation conventions — where docs live and how they are kept.
   8. Architecture and boundaries — the frozen vs mutable surface.
   9. Security and privacy — secrets, credentials, privacy obligations.
   10. Git and change policy — branch, commit, review, release rules.
   11. Operational constraints — environments, limits, external dependencies.
   12. Task completion criteria — what counts as done.

4. Keep each category to a few lines that **route** to the authority (files, the `.agents/`
   workbench, `just --list`) rather than restating it.

What stays out of `AGENTS.md`:

- Skills dumps, plans, project history, long explanations. **Link instead.**
- Anything the workbench holds (`CURRENT_STATUS.jsonl`, `CURRENT_STATUS.md`,
  `OPEN_QUESTIONS.md`, specs). Root file points at `.agents/`; it is not a mirror
  of it.
- Machine configuration. That belongs in structured config, never in Markdown.

Target length: a generated project's `AGENTS.md` fits on roughly one scrolled screen
(≈40–70 lines). If a category needs prose, it belongs in a referenced file. A cold agent
must read the whole file in one pass without incurring a large context load.

### Lean illustrative skeleton

```markdown
# <Project> — agent operating surface

## 1. Identity and priorities
<one-line purpose; one-line dominant constraint>

## 2. Repository map
- Source truth -> semantic model: `.sea/` (canonical)
- Work home: `.agents/` (<status/questions/debt link>)
- Specifications: specs -> <canonical location or link>
- Proof surface: <test/E2E location>, verification map -> <link>

## 3. Development loop
1. <edit>
2. <build>
3. <test>
4. <verify>
Run `just --list` for the task surface.

## 4. Build and validation
`just setup`, `just build`, `just check`, `just verify`. See
<config/CI location>.

## 5. Code conventions
<2-3 rules or link to style authority>

## 6. Testing strategy
- Unit/integration/E2E command and scope: <link>
- Structural E2E must stay green; behavioral obligations stay honestly red:
  [verification-topology](verification-topology.md).

## 7. Documentation conventions
<where docs live; how they update>

## 8. Architecture and boundaries
Frozen contract surface: <link> (do not edit without a CandidateRevision).
Editable internals: unrestricted inside boundaries.

## 9. Security and privacy
Secrets only in `.env` (gitignored); never in source, logs, or Markdown.

## 10. Git and change policy
<branch flow; commit convention; review requirement>

## 11. Operational constraints
<environments, limits, external dependencies>

## 12. Task completion criteria
A task is complete when its gate passes, its evidence is recorded in
`.agents/evidence/`, and `.agents/CURRENT_STATUS.jsonl` (plus its
`CURRENT_STATUS.md` mirror) reflects reality.
```

Prefer this skeleton as a start, then shape category content to the actual project —
it is a derived minimum, not a template to fill ceremony into.

## 2. `.agents/` workbench — file and folder roles

Create only the minimum applicable subset. Each artifact holds one kind of fact; nothing
else writes to another's home. Definitions:

- `AGENTS.md` — **maintenance invariant** for the workbench: the acting agent updates
  this workbench when repository reality changes. It states where each file's facts live,
  who may close questions, and the `CURRENT_STATUS` append/mirror protocol below.
  Always created.
- `CURRENT_STATUS.jsonl` — agent-facing, append-only status history. Each line is one
  complete snapshot JSON object with a higher `revision` than the line before it plus
  `recorded_at`, `stage`, `summary`, `verified`, `limits`, `next`, `evidence`, `spec`,
  and `ledger`. Carry forward facts that remain true; an entry is a complete snapshot,
  not a delta. Never edit previous entries. Read only the last line
  (`tail -n 1 .agents/CURRENT_STATUS.jsonl`) for the latest snapshot; read earlier
  records only when history matters. Always created. Example line:
  `{"revision":3,"recorded_at":"2026-09-25T00:00:00Z","stage":"P3","summary":"...","verified":"just verify green","limits":"...","next":"...","evidence":"...","spec":"...","ledger":"..."}`.
- `CURRENT_STATUS.md` — human-facing view of only the latest snapshot. Update it in
  place in the same change that appends the `.jsonl` line, with matching `revision`
  and `summary`; do not append history there. Always created.
- `OPEN_QUESTIONS.md` — unresolved distinctions that would materially corrupt decisions.
  Record; do not silently resolve. Close only with evidence recorded. Always created (even
  if empty of entries, keep the file so the home exist explicitly).
- `DEBT_OBSERVED.md` — discovered debt **with the evidence that revealed it** (file, line,
  observation, or proof command). Debt without evidence is noise. Created when first
  evidence-backed debt is observed.
- `specs/` — load-bearing project specifications **only when `.agents/specs/` is their
  canonical home**. If the canonical spec lives elsewhere (packaged spec repo, product
  tracker, upstream doc), route to it in `AGENTS.md`; never duplicate it here.
- `plans/` — executable implementation routes (steps with exit criteria), not essays.
- `skills/` — project-local reusable procedures. Not a copy of plugin-distributed
  Anthropic skills, unless a skill is intentionally copied for the project's own use.
- `roles/` — reusable role contracts (for a named role's operating agreements) when
  multiple agents or repeated engagement need them.
- `reports/` — investigations and findings; conclusions plus how they were reached.
- `evidence/` — proof artifacts and pointers (hashes, logs, recorded command output).
  **Observed-only.** Never fabricate records.
- `lessons/` — earned, reusable project knowledge; one concise entry per lesson learned.

## 3. Generation rules

1. Emit only the applicable subset of the folders above; never create an empty placeholder
   directory to satisfy a template. Minimum sufficient structure is an invariant.
2. **One home per fact; a link beats a copy.** If a fact is owned elsewhere, `AGENTS.md`
   routes to it.
3. Route to the canonical spec rather than materializing it into `.agents/specs/`. Create
   `specs/` only when there is no existing canonical home.
4. The semantic model normally lives in the project-local `.sea/` area, not in `.agents/`.
   `.agents/` holds routing and work memory; `.sea/` holds canon.
5. Never write machine configuration into Markdown merely because `.agents/` (or `.agents/`
   conventions) exist. Durable machine-consumed behavior goes in structured config
   (TOML/YAML/JSON/ecosystem-native). Environment-local values and secrets go in `.env`.
   Markdown-as-config is a defect.
6. Use portable paths throughout — never machine-specific absolutes, model names, or local
   ports in generated artifacts.

## 4. Maintenance discipline

- `.agents/` is durable project/agent work memory, not a snapshot. It must remain current;
  its maintenance invariant is documented in `.agents/AGENTS.md` and enforced by the agent
  that acts.
- **Who updates:** the acting agent, at the moment truth changes — not later, not in bulk,
  not "when convenient." A change that moves reality (a gate passes, a debt appears, a
  question closes, a plan lands) updates the corresponding file in the same work session.
- **Status protocol.** Appending to `CURRENT_STATUS.jsonl` and mirroring to
  `CURRENT_STATUS.md` happen in the same change: append exactly one line with a higher
  `revision` (complete snapshot, carry-forward, never edit prior lines), then update the
  `.md` in place with the matching `revision` and `summary`.
- **Gate, question, debt, structure rules.** Record a command, outcome, and scope before
  calling a gate passed. Close a question only with a cited decision or observation.
  Record evidence-backed debt when found. Create no empty directories. A candidate ledger
  is not a frozen contract.
- Consequence: an **accurate workbench guarantees cold agents** can (a) find present
  reality and the next transition from the last `CURRENT_STATUS.jsonl` line (human skim
  via `CURRENT_STATUS.md`), (b) act without rediscovering the topology, (c) avoid
  silently resolving open questions, and (d) produce truth compatible with prior agents.
  An inaccurate workbench costs those guarantees; that is the debt that accumulates when
  maintenance is skipped.

## 5. Relationship to verification

- The frozen requirement surface (requirement ledger, Wayfinder freeze, hash-bound frozen
  artifacts) lives in frozen artifacts, described in
  [requirement-ledger](requirement-ledger.md) and
  [gauntlet-formation-freeze](gauntlet-formation-freeze.md). It is not restated in
  `.agents/`.
- `CURRENT_STATUS.jsonl` reports current status and gates and **links** to the frozen artifacts
  and their proof commands; it does not re-own the requirements. `CURRENT_STATUS.md`
  mirrors only the latest entry for human reading.
- Prove progress from `evidence/`, never from memory. A status claim is supported only by a
  recorded proof artifact or pointer. See
  [verification-topology](verification-topology.md) for proof kinds and
  [realitytrace-integration](realitytrace-integration.md) if SXR-bound evidence is in use.

## 6. Failure modes

- **Stale status** — cold agents act on yesterday's reality; maintenance
  discipline (section 4) was skipped. Fix: append + mirror at the moment truth changes.
- **Edited status history** — a prior `CURRENT_STATUS.jsonl` line was modified instead of
  appended to. Fix: never edit; append a correcting snapshot with a higher `revision`.
- **Diverged mirror** — `CURRENT_STATUS.md` revision/summary does not match the last
  `.jsonl` line, or history was appended to the `.md`. Fix: rewrite the `.md` in place
  from the latest `.jsonl` entry.
- **`OPEN_QUESTIONS.md` silently resolved** — a materially important ambiguity was decided
  without entry and evidence. Fix: record before resolving; close only with evidence.
- **Debt without evidence** — `DEBT_OBSERVED.md` entries lacking the observation that
  revealed them; indistinguishable from opinion. Fix: require evidence per entry.
- **Duplicated specs** — canonical spec copied into `.agents/specs/`, creating two homes
  for one fact. Fix: route, do not copy (generation rule 3).
- **`.agents/` as an everything-dump** — history, plans, long explanations, and prose
  collecting in workbench files; the router stops routing. Fix: keep file roles pure;
  link heavier content out.
- **Machine configuration in Markdown** — config-as-prose appearing in `AGENTS.md` or
  `.agents/` merely because the directory exists. Fix: structured config and `.env`
  (generation rule 5).
- **Empty placeholder directories** — `specs/`, `roles/`, `lessons/`, … created empty for
  symmetry. Fix: create only on first real content (generation rule 1).
- **Fabricated evidence records** — inventing proof artifacts or claiming observed results
  that were not observed. Never acceptable; violates the observed-only invariant and the
  honest-green rule.
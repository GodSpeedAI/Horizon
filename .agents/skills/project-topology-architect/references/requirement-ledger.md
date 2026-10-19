# Requirement ledger (phase P5)

The machine-readable, versioned requirement/acceptance ledger. Load this reference when
authoring, validating, freezing, or consuming `requirements/ledger.yaml`. It is a phase P5
companion to [gauntlet-formation-freeze](gauntlet-formation-freeze.md) (criticism and the
freeze boundary) and [verification-topology](verification-topology.md) (the gates the
ledger's proof commands name).

## 1. Purpose

The ledger is the durable answer to "what is the current unsatisfied task, exactly what
does it require, and how do I prove it". It binds every requirement to its source and
semantic identity so that a downstream agent can find, in one read:

- the current unsatisfied task and its exact requirement text;
- the source file, section, and digest the requirement was formed against;
- the canonical semantic entity and invariant it binds to;
- the acceptance contracts and the narrow proof command for each;
- the legal modification surfaces versus the frozen surfaces;
- the failure evidence, and what regression surface a change must be re-checked against.

The ledger **complements** (does not replace) `.wayfinder/answer-key.md`. The answer key
is the frozen evaluation projection; the ledger is the requirement-source binding. Both are
frozen together and cross-checked (see §5).

## 2. Schema (ledger v1)

Top-level fields:

```yaml
ledger_version: 1
project: <name>
generated_at: <utc timestamp>
freeze_hash: <sha256 hex as set at freeze, or "candidate">
requirements: [...]
acceptance_contracts: [...]
```

- `ledger_version` — required; the validator rejects a missing version. Bump only with the
  validator script.
- `project` — the project name, matching the Wayfinder freeze header.
- `generated_at` — formation timestamp. Informational; not part of identity.
- `freeze_hash` — the sha256 recorded at freeze over the frozen artifact set (per
  [gauntlet-formation-freeze](gauntlet-formation-freeze.md)). Until freeze, write the
  literal `candidate`. A frozen-status requirement with `freeze_hash: candidate` is invalid.
- `requirements` — ordered list of requirement entries (below).
- `acceptance_contracts` — flat list of acceptance contracts (below).

Each requirement entry:

```yaml
- id: AK-017
  title: <short imperative title>
  source:
    file: <path relative to repo root>
    section: <section/heading identifier>
    digest: sha256:<hex>
  semantic_binding:
    entity: <canonical semantic entity>
    invariant: <canonical invariant/witness>
  acceptance: [AC-017-01, AC-017-02]
  proof: [just gate-ak-017]
  mutable_surfaces: [...]
  frozen_surfaces: [...]
  dependencies: [AK-...]
  critic_predicate: <source-fidelity|semantic-fidelity|contradiction|evasion|verification-quality>
  status: candidate|frozen|settled
  notes: <optional>
```

Field obligations:

- `id` — `AK-NNN` lettered sequential id. The source-of-truth id for every downstream
  reference (`just gate-ak-017`, acceptance ids, dependencies, Wayfinder entries).
- `title` — imperative statement of the obligation, in the ruler's own words.
- `source` — where this requirement came from.
  - `file` — path relative to the repo root.
  - `section` — the section/heading inside that file the requirement was derived from.
  - `digest` — `sha256:<hex>` of the named source file, computed at ledger-formation time.
    Store the digest you observed, never one you assume.
- `semantic_binding` — the canonical semantic entity and the invariant this requirement
  witnesses, taken from the `.sea` model when one exists. When the project has no `.sea`,
  name the conceptual entity it binds. This is what makes the ledger survive file moves.
- `acceptance` — the `AC-NNN-NN` ids this requirement's satisfaction is measured by. Match
  the `AC-` prefix of the requirement id (`AK-017` contracts are `AC-017-*`).
- `proof` — non-empty list of the task-scoped proof commands that gate satisfaction, e.g.
  `just gate-ak-017`. See [verification-topology](verification-topology.md) for gate
  design.
- `mutable_surfaces` — files/dirs an executor may legally modify while satisfying this
  requirement.
- `frozen_surfaces` — files/dirs that must not change unless via a `CandidateRevision`.
- `dependencies` — other `AK-*` ids that must be satisfied first.
- `critic_predicate` — the independent predicate that defends this requirement at freeze:
  `source-fidelity | semantic-fidelity | contradiction | evasion | verification-quality`.
- `status` — lifecycle: `candidate` → `frozen` → `settled`. See §3.
- `notes` — optional. Never record an observation as if it were a claim (§8).

Each acceptance contract entry:

```yaml
- id: AC-017-01
  requirement: AK-017
  expected: <observable outcome in the runtime's own terms>
  gate_command: <command that proves this expectation>
  status: candidate|frozen|settled
```

- `expected` — an observable, stated in domain terms, not "tests pass". See the
  observed-only-evidence invariant in the master workflow.
- `gate_command` — the exact command that produces the evidence for this expectation.
- Contracts must be individually addressable so an executor can run one proof without
  re-running the suite.

Disjointness and identity rules:

- `mutable_surfaces` and `frozen_surfaces` must be **disjoint**; an overlapping path is a
  validator error.
- `dependencies` may only reference ids that exist in `requirements`.
- Deterministic identity belongs to the scripts
  ([`../scripts/freeze-hash.py`](../scripts/freeze-hash.py)); semantic identity belongs to
  `semantic_binding`. The two must stay consistent — never rename an entity without
  checking the Wayfinder answer key.

## 3. Lifecycle

1. **Candidate** — the ledger is authored during formation, validated, and iterated while
   open questions resolve.
2. **Freeze** — set `freeze_hash` over the frozen artifact set (source spec, canonical
   `.sea`, ledger, Wayfinder, acceptance contracts, frozen verification artifacts) using
   [../scripts/freeze-hash.py](../scripts/freeze-hash.py), and write the hashes into the
   Wayfinder freeze header. All entries move to `frozen`.
3. **Settled** — a requirement moves to `settled` only when its gate passes **and** its
   evidence is recorded (see [realitytrace-integration](realitytrace-integration.md) for the
   proof-claim separation).

Post-freeze rules:

- **The ruler is immutable inside an active run.** Do not silently edit a frozen
  requirement, contract, or surface list — this defeats the guarantee downstream agents
  navigate on.
- Evidence that the frozen ruler is defective (wrong semantics, wrong source binding,
  contradictory obligation) becomes a **`CandidateRevision`**: a recorded proposal with
  rationale, not a silent edit. A new run that incorporates it requires an **explicit new
  freeze boundary** — a new `freeze_hash` and a fresh Wayfinder freeze. See
  [gauntlet-formation-freeze](gauntlet-formation-freeze.md).
- Record formation-time open questions in `.agents/OPEN_QUESTIONS.md` and debts in
  `.agents/DEBT_OBSERVED.md`; the ledger must not carry them as resolved fact.

## 4. Validation contract

The validator [`../scripts/validate-requirement-ledger.py`](../scripts/validate-requirement-ledger.py)
is machinery, run `python` against the ledger — never hand-verify and skip it. It checks:

- YAML parses; `ledger_version` is present.
- requirement ids are unique (`AK-NNN`); acceptance ids are unique (`AC-NNN-NN`).
- every `AC-*` in an acceptance contract references an existing requirement; every
  `acceptance` id on a requirement references an existing contract.
- `source.file` exists in the repo and `source.digest` equals the `sha256:` of that file as
  of the ledger-formation time.
- `acceptance` and `proof` are non-empty on every requirement.
- `mutable_surfaces` and `frozen_surfaces` are disjoint.
- `dependencies` reference existing requirement ids.
- `status` ∈ `{candidate, frozen, settled}`.
- a `frozen` (or `settled`) status requires a non-candidate `freeze_hash`.

Semantic fidelity is **model judgment, not script-checkable**. The validator proves shape
and traceability; the critics in
[gauntlet-formation-freeze](gauntlet-formation-freeze.md) prove that the ledger truthfully
represents the ruler. Color the two differently — a green validator run does not settle
semantics.

## 5. Requirement ↔ Wayfinder cross-reference

Every frozen requirement must appear in the Wayfinder answer key, and every answer-key
entry must trace to a frozen ledger requirement. Run
[`../scripts/validate-wayfinder.py`](../scripts/validate-wayfinder.py), which checks Wayfinder
integrity (freeze header, hash binding) and that cross-reference, in both directions. Any
asymmetry is a formation defect — fix it before freeze, never by editing one side alone.

## 6. Example ledger fragment

```yaml
requirements:
  - id: AK-017
    title: Reject duplicate submission ids within one batch run.
    source: { file: specs/batch-ingest.md, section: "3.2 Duplicate handling",
              digest: sha256:9f86d0... }
    semantic_binding: { entity: BatchSubmit, invariant: batch.id uniqueness per run }
    acceptance: [AC-017-01, AC-017-02]
    proof: [just gate-ak-017]
    mutable_surfaces: [src/ingest/, tests/ingest/]
    frozen_surfaces: [contracts/submission.schema.json]
    dependencies: [AK-012]
    critic_predicate: source-fidelity
    status: frozen
acceptance_contracts:
  - id: AC-017-01
    requirement: AK-017
    expected: A duplicate submission id is rejected with a per-rule error, not a crash.
    gate_command: just gate-ak-017
    status: frozen
  - id: AC-017-02
    requirement: AK-017
    expected: Two distinct submission ids in one run both persist.
    gate_command: just gate-ak-017
    status: frozen
```

## 7. Downstream usage

A bounded executor consumes the ledger for a single task as follows:

1. Read the `AK-NNN` entry — title, `expected` obligations, `proof`, surfaces, status.
2. Read each `AC-NNN-NN` listed under `acceptance` for the exact observable each gate
   proves.
3. Respect the surface split: modify inside `mutable_surfaces` only; treat
   `frozen_surfaces` as read-only unless a `CandidateRevision` exists.
4. Run the narrow proof — `just gate-ak-NNN` — matching the requirement `proof` entry; do
   not improvise a broader suite.
5. Record the evidence and its scope as observed, not as a claim of real-world consequence.

Progression and status:

- `candidate` → work may adjust surfaces while the ledger is still forming.
- `frozen` → the contract is fixed; executor changes must not violate `frozen_surfaces`.
- `settled` → the gate passed and evidence is recorded. A requirement never returns to
  frozen; a `CandidateRevision` at a new freeze boundary is the only path to rewrite it.

The unsatisfied-task pointer flows from the Wayfinder evaluation to this ledger: the
Wayfinder names the next unmet `AK`; the ledger entry gives its source, binding, surfaces,
dependencies, and proof in one read. That is why no later agent reconstructs the ruler.

## 8. Failure modes

- **Stale digests** — a source file edited after ledger-formation without a ledger update.
  The validator fails the digest check; treat it as a freeze-boundary violation, not an
  edit. Re-fetch and re-freeze, or record a `CandidateRevision`.
- **Overlapping mutable/frozen surfaces** — an executor receives license to edit what it
  must not. The disjointness check is the guard; if it passes while semantics still clash,
  the critics must catch it, because scripts cannot.
- **Orphan acceptance contracts** — contracts with no requirement (or requirements with no
  contracts) that let work ship with no gate. The validator's cross-reference checks catch
  these.
- **Fabricated digests** — a digest not taken from the actual source read at formation
  time. Always derive from the observed file bytes; a digest you did not observe is a lie
  the validator cannot detect.
- **Documenting claims as observed** — recording an inference as evidence obtained. The
  ledger's `notes`/`expected` fields are not a place to assert consequences no observation
  supports. See [realitytrace-integration](realitytrace-integration.md).
- **Marking frozen before independent criticism** — freezing a ledger the critics have not
  defended. Freeze is the last step of P5, after fresh, context-isolated critics ran their
  predicates. Where the host cannot isolate critics, record that independent criticism is
  incomplete — never claim it happened.
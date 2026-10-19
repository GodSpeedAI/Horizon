# Gauntlet Formation and Freeze

**Scope.** Form, criticize, and freeze the convergence envelope that a Gauntlet run
evaluates against: the Wayfinder. This reference covers the role separation, the greenfield
formation chain, independent criticism, the freeze boundary, and the CandidateRevision
flow. The envelope is the *projection*; it composes the [requirement-ledger](requirement-ledger.md)
schema and assumes the gates described in [verification-topology](verification-topology.md).

**Boundary that must not be crossed.** This plugin induces a frozen convergence envelope
for an external Gauntlet runtime to evaluate. It does **not** implement, embed, or
reimplement the Gauntlet runtime. If a task would execute a run, settle requirements, or
replay evidence inside this plugin, stop and hand that obligation to the runtime.

**Determinism boundary.** Scripts are machinery: `freeze-hash.py` computes content
identities; `validate-wayfinder.py` and `validate-requirement-ledger.py` re-verify
integrity. Semantic judgment — fidelity, contradiction, evasion, gate honesty — is model
reasoning and is never delegated to a script. Never claim a script verdict where judgment
was required.

## 1. Role separation

Five roles; each has a permitted and a forbidden shape. Confusing them is the root failure
mode of this phase.

| Role | Is | Is not |
|------|----|--------|
| **Specification** | Normative ruler; the single source of "what must be true". | A suggestion, a changelog, or an implementation memo. |
| **Plan** | Route; sequencing, staging, allocation of work against the ruler. | A second ruler; plan text is normative only where the spec defers to it. |
| **Wayfinder** | Frozen evaluation projection; the "answer key" the run is judged against. | A live document; editing it mid-run is not allowed. |
| **Implementation** | Mutable work surface; everything the builder may freely change. | A source of requirements or of truth about them. |
| **Evidence** | Observed proof; recorded, dated, reproducible facts. | Inferred claims, mock-mock agreement, or intended behavior. |

**Decision rule.** Any statement that changes "what must be true" belongs in the
specification. Any statement about how work proceeds belongs in the plan. Anything the
run should be scored on belongs in the Wayfinder. Everything else belongs to
implementation or evidence.

## 2. Greenfield formation chain

Produce each artifact in order. Determinism boundary is annotated per step: `[script]`,
`[model]`, or `[model+script]`.

1. **Specification** → pin the normative ruler. Resolve only material ambiguities; log the
   rest to `.agents/OPEN_QUESTIONS.md`. Do not freeze an untrustworthy ruler.
2. **Plan** → derive the route from the ruler. The plan is normative only where the spec
   delegates. `[model]`
3. **Canonical `.sea`** → P1 semantic formation via `deriving-interaction-domain-models`
   and `domainforge-sea`; validate with the `domainforge` CLI. `[model+script]`
4. **Candidate requirement ledger** → machine-readable `requirements/ledger.yaml`; one
   requirement per row, bound to source file/section/digest, semantic binding, acceptance
   obligations, proof commands, mutable/frozen surfaces, dependencies. Validate with
   `../scripts/validate-requirement-ledger.py`. `[model+script]`
5. **Candidate acceptance contracts** → `AC-*` ids, one per acceptance obligation (e.g. a
   gate for requirement `AK-017` carries `AC-017-02`). `[model]`
6. **Candidate Wayfinder** → the frozen evaluation projection over the ledger: the answer
   key plus the identical machine-readable ledger it points at (section 3). `[model]`
7. **Independent criticism** → fresh, context-isolated critics run their predicates
   (section 4); each verdict is recorded and pinned to the formation record. `[model]`
8. **Correction** → resolve every confirmed defect by revising the candidate — a ledger
   row, an acceptance contract, or the Wayfinder — then re-run criticism for the changed
   predicate only. Repeat until no confirmed defects remain. `[model]`
9. **Freeze** → compute deterministic hashes, bind them in the Wayfinder freeze header and
   the ledger `freeze_hash` (section 5), and re-run `validate-wayfinder.py` until green.
   `[model+script]`

**Rule.** Step 7 is mandatory. Step 9 is forbidden while any confirmed critic defect is
unaddressed. A freeze produced without independent criticism is not a freeze; it is a
draft masquerading as one.

## 3. Wayfinder structure

The Wayfinder is the folded evaluation projection; a run reads it as an answer key.

- `.wayfinder/answer-key.md` — the frozen evaluation projection over requirements: per
  requirement, the expected observable settlements and the gates that prove them.
- The parallel machine-readable requirement ledger (`.wayfinder/ledger.yaml` or the
  canonical `requirements/ledger.yaml`) — the identical obligation set the Wayfinder
  cross-references. Full schema lives in [requirement-ledger](requirement-ledger.md).

**Freeze header.** The Wayfinder opens with a freeze header recording deterministic
hashes that bind:

- the source specification (sole normative ruler);
- the plan, where the plan is normative/relevant to the projection;
- the canonical `.sea`;
- the requirement ledger;
- the Wayfinder itself;
- the acceptance contracts;
- the relevant frozen verification artifacts (structure and graph, per
  [verification-topology](verification-topology.md)).

Compute every identity with `../scripts/freeze-hash.py`; bind the result set into the
header in one commit-time shape. Re-verify the binding with `../scripts/validate-wayfinder.py`.

**Rule.** A Wayfinder that cannot reproduce its own hash set from the artifacts on disk is
corrupt and must not be used for a run.

## 4. Independent criticism

Freeze only after criticism. The author may author the candidate Wayfinder but must not be
the sole unchallenged judge of its faithfulness — including the author-as-interpreter of
their own rationale.

**Critic roster and predicates.**

| Critic | Predicate | Guards against |
|--------|-----------|----------------|
| Source-fidelity | Does the projection faithfully represent the source specification and plan? | Projection that invents, drops, or rewrites requirements. |
| Semantic-fidelity | Does the projection respect the canonical semantic model (`.sea`)? | Projection drifting from the domain semantics into screen/API fiction. |
| Contradiction/ambiguity | Do unresolved contradictions from the ruler or between ruler and projection remain material? | Freezing a ruler nobody can act on unambiguously. |
| Evasion | Does anything required slip past the projection — a requirement without a gate, a claim without a settlement rule? | Compliance theatre with empty acceptance obligations. |
| Verification-quality | Are the gates honest — measurable, non-false-green, mapped to real proof commands? | Tests that pass because mocks agree with each other. |

**Operational rules.**

- Use fresh, disposable, context-isolated critic contexts — one per predicate.
- Critics are blind to implementation rationale and to prior builder reasoning, including
  "why this projection should pass."
- Critics may inspect the source, artifacts, implementation, tests, and observable evidence
  needed to reach a verdict.
- Record each critic's verdict and pin it to the formation record (requirement, predicate,
  verdict, findings, timestamp).
- Re-running a predicate after corrections restarts a fresh critic context; do not reuse a
  judged context.

**Host without isolation.** If the host lacks a suitable isolated-subagent mechanism, run
the deterministic formation checks, record that *independent critic formation is
incomplete* in the formation record, and stop before freezing on that basis. Never
fabricate critic independence: do not reuse the author context as a "critic," do not
self-certify, do not write a verdict the reviewer never produced.

## 5. Freeze mechanics

1. **What gets hashed.** Every artifact in the freeze header list (section 3) plus the
   requirement ledger's own identity.
2. **Where the hash set is written.** In the Wayfinder freeze header, and the matching
   `freeze_hash` field of the requirement ledger. Both must reference the same
   computation run of `../scripts/freeze-hash.py`.
3. **Immutability.** Inside an active run the ruler — and its projection, the Wayfinder —
   is immutable. Adding a test, fixing style, or decorating the repo does not change the
   frozen projection; changing a requirement, its gate, or its acceptable evidence does.
4. **What is a run boundary.** An explicit new freeze. Evidence of a ruler defect becomes a
   `CandidateRevision` (section 6); only the next freeze makes it effective. There is no
   "soft update" path.

**Decision rule.** If a change would alter any hash in the freeze header, it is a ruler
change and requires the CandidateRevision path — never a silent edit.

## 6. CandidateRevision flow

Implementation work reveals a likely ruler defect. The ruler stays frozen.

1. **Capture evidence** in a bounded form: `Task` / `Gate` / `Expected` / `Observed` —
   one record, no narrative.
2. **Write a CandidateRevision** describing the proposed change to the frozen projection
   and the ruler text or acceptance contract it touches. File it alongside the project's
   change records. Never edit the active ruler or Wayfinder.
3. **Propose Wayfinder N+1** with an explicit new freeze boundary: what changes, which
   hashes will recompute, exactly which artifacts must be re-criticized and re-frozen.
4. Only the new freeze makes the revision effective. Until then, counters still settle
   against Wayfinder N.

**Shaping decision rule.** Runtime-level disagreement resolved by the external Gauntlet's
settlement record becomes evidence input, never a silent ruler edit — the boundary in
section 1 is preserved.

## 7. Failure modes

| Failure | How it reads | Guard |
|---------|--------------|-------|
| Freezing before independent criticism | "Freeze" pushed straight from author context | Mandatory ordered chain (section 2, step 7). |
| Author as sole unchallenged judge | Author self-certifies the projection | Fresh isolated critics; verdicts pinned to the record. |
| Critics loaded with builder rationale | Critics inherit "this must pass" framing | Blind-to-rationale rule, disposable contexts. |
| Hash drift | Header hashes don't match artifacts on disk | `validate-wayfinder.py` green before every run. |
| Silent ruler edits | Requirement/gate changed without revision | Hash immutability; CandidateRevision is the only path. |
| Claiming Gauntlet compatibility without the envelope | "Gauntlet-ready" said mid-draft | Compatibility is only assertable post-freeze, post-validation. |
| Reimplementing the Gauntlet runtime | Plugin starts executing/settling runs | Section 1 boundary; hand runs to the external runtime. |
| Fabricated critic independence | A verdict attributed to a critic that never ran | If no isolation mechanism exists, record incomplete and stop. |
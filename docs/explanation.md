# Explanation: why Horizon is built this way

Design rationale, separated into what the repository *evidences* and what is *inferred*.
Confirmed rationale is backed by frozen governance texts, tests, or recorded decisions;
inferred rationale is flagged.

---

## Frozen artifacts and why they exist

Horizon is developed as a sequence of settlement tasks (T01–T22) under a frozen spec and
plan. The machinery — requirement ledger, wayfinder, preregistrations, teeth, mutation
runners — exists because the project treats "the agent wrote code and tests passed" as
*insufficient* for settling a requirement.

Why this matters mechanically:

- The **ledger** (`requirements/ledger.yaml`) binds every spec requirement to a semantic
  entity, acceptance criteria, proof commands, and settling tasks — generated, so drift
  between spec and tests is checkable (`scripts/gen-requirement-ledger.py`,
  `check-ledger-freeze.sh`).
- **Preregistration** (`.agents/prereg/horizon/T*.yaml`) fixes expectations *before*
  implementation, then `check-prereg-shape` and the `check-tNN-prereg-coverage` scripts
  prove each expectation is named by a test that names its anchors. Shape runs first
  because "a preregistration whose expectations a parser cannot see would make every
  count below meaningless" (DEC-T05-09, recorded in the plan).
- **Teeth** are separate targets from coverage so a green consumer path can never be read
  as adversarial proof; **mutation runners** then prove the teeth bite (breaking one
  protected property at a time and requiring the named test to fail).
- **Frozen surfaces** (spec, plan, prereg, ledger, wayfinder, post-freeze `.sea`) are
  immutable inside a run so that a mid-run change cannot retroactively make evidence
  self-consistent.

This is all confirmed by the plan text and the justfile composition.

## One frame, many renderers (why the seam exists)

The R1–R5 chain (IDM → Behavioral IR → sequential proof → Atomic UI IR → renderers) exists
so that interface richness is *earned* by proven behavior rather than invented per
renderer. Confirmed consequences in code: all three transports resolve through the same
`application.surface()` seam and commit through `commitSurfaceIntent` (`src/main.ts`
header); equivalence between GUI, CLI, and MCP is a tested property
(`teeth-t05-equivalence`), not an aspiration; the ui-model contract's
`forbidden_policy_keys` makes renderer-local policy (`enabled_when`, `is_authorized`)
structurally illegal, forcing policy into the domain's gates.

## Possibility is not affordance (why gates can be `unknown`)

A naive model has booleans: can/can't. Horizon's `available` / `blocked` / `unknown`
triad exists because the honest answer is often "the world has not recorded this yet" —
and *reporting* an unknown authority as "blocked" (or worse, "available") would fabricate
governance state. Confirmed: `AUTHORITY_OUTCOMES` and gate ordering in
`src/domain/navigation.ts`; tests asserting unknown-vs-denied distinctions
(`test/navigation-controller.test.ts`, `test/retrieval-debugger-teeth.test.ts`).

The corollary — *a retrieved citation is never an authority* — is why Context Kernel
answers are classed `untrusted_reference` by Horizon itself rather than by the kernel:
the trust decision must belong to the system that owns the gates, and copying a trust
statement from the external party would invert the trust boundary.

## Refusals are events, not exceptions (why the audit stream exists)

`appendIntentAttempt` records *every* refused attempt — stale frames, spoofed frame ids,
unauthorized roles — as durable events. A refusal that leaves no trace cannot be
audited, cannot be learned from, and cannot be distinguished from "nothing happened."
Confirmed by `test/app.test.ts` (spoofed frame produces refusal *and* attempt record) and
the refusal-teeth across T07–T10.

## Every value labelled (why the debugger's five classes exist)

`recorded / derived / unknown / effect / untrusted_reference` forces each answer to say
where it came from. The design intent (spec: distinct epistemic states; never present
derived values as recorded) is confirmed by the teeth: an `unknown` must name the source
that records nothing, and silence may not be filled with plausible values. A debugger
that guesses would poison the developmental record it exists to serve.

## Fail closed (why the app refuses rather than degrades)

Degraded success is the most dangerous failure mode in a governance-heavy system: a
surface that renders "best effort" without authority, a traversal with default bounds, a
checkpoint comparison that silently uses the wrong position. Horizon's pattern — typed
refusal, distinct outcomes, CLI exit 1 on refused intent, grammar-invalid surface as
failure not broken page (`src/main.ts` "A surface the grammar refuses is a failure") —
makes the failure visible at the boundary instead. Confirmed across
`test/*-negative.test.ts` and the teeth suites.

Why the research subsystem is *not* fail-fast at boot: it is a health probe of an
optional subsystem, and blocking startup on it would couple world navigation to
research availability. Hence the opposite pattern there — typed degraded observation
(`research_unavailable`), fail-closed *only* for research-dependent operations. The
asymmetry is deliberate: degrade observation, refuse action.

## Why one SQLite store (and why projections are rebuildable)

Single store: a walking skeleton needs exactly one consistency boundary and one recovery
story. Event-sourced projections mean any projection bug is fixable by rebuild rather
than by data migration — which is why the tests rebuild projections from events and
compare (`test/operational-objects.test.ts` rebuild/recovery scenarios). Inferred
trade-off: additive-projection assumptions (noted as a current limit in
`.agents/CURRENT_STATUS.md`) keep checkpoint-restore simple but will need revisiting when
projections start retracting rows.

## Why vendored Cognate (0.6.1 tarballs)

Reproducibility and boundary honesty: the runtime is pinned via
`src/runtime/required-cognate.ts` and vendored tarballs (`.cognate/vendor/`), so an
upstream Cognate release cannot silently change event/store semantics under a frozen
governance record. The documented release mismatch and the "current-source wins" rule in
`AGENTS.md` both push the same direction: pin what you verify against (see
[donors](donors.md)).

## Inferred rationale (flagged, not confirmed)

- The choice of Bun + OpenTUI + React for a single-process local app plausibly follows
  Cognate's supported distribution and the terminal-first default mode; the repository
  does not record this decision explicitly.
- The six-gate decomposition (commitment/authority/evidence/safety/reversibility/
  settlement) appears derived from the spec's safety requirements; the *mapping* of each
  spec clause to a gate key is not individually documented.
- Port 4319 and profile naming (`local_operator`) appear to be conventions without
  recorded rationale.

### Source trail

- `.agents/plans/horizon.plan.yaml` — T05/T06 gate design rationale (DEC-T05-09)
- `src/ui/surface2/reducer.ts`, `src/ui/surface2/grammar.ts` — attribution enforcement
- `src/capabilities/navigation-intent.ts` — attempt audit streams
- `src/domain/debugger.ts` — value classes
- `.agents/CURRENT_STATUS.md` — limits and trade-offs as recorded at T10

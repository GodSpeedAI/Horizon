# T06 — operational object layer on Cognate's public Projection API

**Settled 2026-10-20.** P2 — builder proof with adversarial teeth. Not P3: no independent replay
has been performed, and nothing here implies one. Additional passing tests do not raise the level.

Prereg: `.agents/prereg/horizon/T06.prereg.yaml`, recorded before implementation. Shape-verified
before any code was written (`check-prereg-shape`: 10 positive + 9 negative structural members),
which is the check the frozen T05 preregistration would have failed (DEC-T05-09).

## The decision this implements

DEC-T05-10: a Horizon-owned typed object projection on Cognate's **public** `Projection` API. No
fork, no patch, no shadow framework. Verified against the pinned 0.6.1 sources before writing code
(`pinned-api-inspection.log`), not against skill prose:

| primitive | what it gives | used for |
| --- | --- | --- |
| `ProjectionRunner.catchUp` | folds new events; `rebuild_required` on version change | every read |
| `readProjectionSnapshot` | checkpoint **and** rows from one statement | the consistency guarantee (NE-08) |
| `readProjectionSnapshotFallback` | documented fallback for stores without the above | same path, no behaviour change |
| `listProjection` | all state, code-point ordered | the NE-09 row-order assertion |
| `ProjectionRunner.rebuild` | replay from position 0 | recovery (PE-08, NE-09) |

D-002 is therefore settled: the gap is *query*, not *state*. The upstream deficiencies to report
are no predicate query beyond top-level equality, no traversal, and no version-aware query API.

D-023 (CLI and server contending for one SQLite store) does **not** block T06 or T07: it was
reclassified as latent after failing to reproduce, and `busy_timeout` is supplied by the pinned
store. It was not touched here.

## What is now true

- `src/domain/operational.ts` — `horizon.operational-objects/1`: typed object, link and lineage
  shapes; `semantic_ref` (a declared type) and `object_ref` (an instance) are different types;
  the five-way outcome set; and a composite `checkpoint_ref` that names commit position **plus**
  projection name/version.
- `src/projections/operational-objects.ts` — the fold. Pure, keyed (so replay is idempotent), and
  keyed by *position* for error rows so a rebuild reproduces the same keys.
- `src/adapters/operational-objects.ts` — record (integrity checked before commit), query, and
  bounded breadth-first traversal.
- `test/support/operational-fixture.ts` — a durable fixture over the **real pinned world**; the
  fixture refuses to run if the world stops declaring a type it uses.

| ID | Verdict | Evidence |
| --- | --- | --- |
| PE-01 | pass | Identity: every object names its declared `semantic_ref` and has a distinct `object_ref`; two strategies stay distinguishable; one row per object. |
| PE-02 | pass | All 5 links name declared relation types; both endpoints resolve; more than one relation type in use. |
| PE-03 | pass | Every object carries `product`, `connector`, `integration_level` (all `fixture`, honestly), `checkpoint_ref`, `observed_at`; the connector is the recording connector, not a default. |
| PE-04 | pass | `checkpoint_ref` parses to position + `horizon.operational-objects@1.0.0`; the same checkpoint is answerable, another is refused (`code: checkpoint`). |
| PE-05 | pass | Two observers, two correctly-scoped sets; each answer names its own observer. |
| PE-06 | pass | `j01 -> covers -> alpha -> governed_by -> beta`: two hops, two relation types; identical serialization on repeat; `max_depth: 1` stops before beta. |
| PE-07 | pass | Five outcomes produced and distinguished: `empty` (fresh store), `no-match`, `denied`, `unavailable`, and blocked surfaced as `degraded` on a readable answer. |
| PE-08 | pass | Version 0.9.0 in the checkpoint implies `rebuild_required`; explicit `rebuild()` restores 1.0.0 with the same objects. |
| PE-09 | pass | Links are all `graph: operational`; no `flow.*` import edge in the link set; lineage is not traversable; the semantic import graph is a larger, separate structure. |
| PE-10 | pass | `observer_state` carries focus, object set, observer, world and checkpoint — including on refused answers. |

## Negative evidence (NE-01…NE-09)

`test/operational-objects-negative.test.ts`, 9/9.

- **NE-01** a denied scope returns `denied`; the serialized refusal contains no `obj:` and no count.
- **NE-02** a down source is `unavailable` (naming the source); a blocked connector is reported in
  `degraded` while the readable objects are still returned.
- **NE-03** an unbounded traversal is refused before any work, naming `max_depth` and
  `max_objects`; an exceeded object bound is refused, not truncated.
- **NE-04** an undeclared relation type and a dangling endpoint are both rejected at record time,
  and the link count is unchanged afterwards.
- **NE-05** a mismatched checkpoint is refused; a bumped version reports `rebuild_required`.
- **NE-06** a `flow.to` import edge and a `graph: lineage` edge are both refused by the recorder.
- **NE-07** an undeclared semantic type is refused; **a record into the wrong world is refused**
  (this was a real gap — see below).
- **NE-08** the read is consistent (one statement); after more events fold, the old checkpoint is
  refused rather than answered from newer rows.
- **NE-09** the answer equals the lexicographic order of `object_ref` **whatever the store's row
  order**, and a rebuild from position 0 reproduces the same checkpoint and items.


## Found by the evidence, not by design

1. **The wrong-world write.** `recordObject` validated the semantic type against the declared
   world but never compared the *requested* world to it, so an object could be filed under a
   tenant nothing validated. NE-07 caught it; `assertSameWorld` now guards all three recorders.
2. **`SemanticRef` rejected real world types.** The first regex allowed one namespace segment and
   rejected `horizon.products.strategist::StrategyEntity`. The projection recorded an *error row*
   rather than failing — which is how it surfaced, later, as a dangling link endpoint.
3. **An empty projection is not "unavailable".** Cognate's runner commits no checkpoint when there
   were no events to fold, so requiring one reported a healthy empty store as a source failure.
   Corrected: no checkpoint means `empty`; `unavailable` is reserved for a checkpoint that records
   a failure, or for a source the caller names as down.
4. **The determinism test was weaker than its title.** A rebuild comparison cannot detect an
   order-dependent query, because today's store already returns rows in `object_ref` order, so any
   *deterministic* order reproduces. The test now asserts the mechanism directly — the answer
   equals the sorted refs regardless of row order — and mutant M8 confirms that assertion bites.
5. **One mutant was initially a no-op** (a trailing `.reverse()` after sorting by `object_ref`).
   It was replaced, not counted.

## Evidence strength — what the mutation teeth do and do not show

`teeth-t06-mutation`: **8 mutants, each caught by a failing assertion in the test that claims the
property.** M1 denied-as-empty, M2 unavailable-as-empty, M3 missing traversal bound accepted,
M4 dangling endpoint accepted, M5 checkpoint mismatch answered, M6 import edge accepted,
M7 wrong-world write accepted, M8 store order returned unsorted.

This shows those eight hypotheses were falsifiable and were falsified by the named tests. It does
**not** show that an arbitrary violating implementation would be caught, that the properties hold
outside the exercised inputs, or anything about code no mutant touches. That is the limit of P2.

## What fixture evidence does not establish

The events are recorded by the fixture through the pinned store and the public projection API.
They are **not** produced by MLflow, GitHub or any external system, and `integration_level` says
`fixture` on every object for that reason. Consequently:

- "connector blocked" and "source unavailable" are simulated by name, not by taking a system down;
- no live settlement, external action, or operational-instance completeness is claimed;
- Horizon's scope decision here is a **query filter**, not an authorization ruling — SEA-Forge
  remains the authority at consequential invocation and was not consulted;
- Horizon reads whole projections and filters in process, so cost scales with projection size; no
  scale claim is made and no second object store was introduced (REQ-WORLD-006).

## Commands and outcome

```
just check-t06              -> exit 0   (shape + linkage: 19/19 registered expectations)
just teeth-t06              -> exit 0   (shape teeth 6/6, mutation teeth 8/8)
just gate-t06               -> exit 0   (.agents/evidence/horizon/T06/gate-t06.log)
just verify                 -> exit 0   (.agents/evidence/horizon/T06/just-verify.log)
just gate-t05               -> exit 0   (no regression: t05-regression.log)
bun test                    -> 45 pass / 0 fail, 7 files, 458 expect()
tsc --noEmit                -> clean
spec sha256                 -> 14a42936...24a4 (unchanged; matches the plan)
T05 prereg sha256           -> ff36d65b...3019 (unchanged, unedited)
```

## Remaining unknowns / open work

- No live connector. Binding one, and taking `unavailable`/`blocked` from a real outage, belongs to
  a later task; T06 establishes the shape of those outcomes, not their source.
- Traversal is breadth-first over a whole-projection read. Adequate for the fixture; a large world
  would need an index or an upstream query API. That is an upstream ask, recorded in D-002.
- D-030 (module-level state in the T05 boundary check) remains out of scope and untouched.


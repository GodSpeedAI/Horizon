# Subsystem: operational objects

The event-sourced runtime layer: typed objects, links, and lineage projected from the
durable event log, with checkpointed reads.

## Purpose

Give the navigation controller, debuggers, and renderers a typed, tenant-partitioned,
reproducible view of what actually happened in the world — without ever letting that view
mint its own identity or contradict the declared semantic world.

## Responsibilities

- Define the V1 schemas: `OperationalObjectV1`, `OperationalLinkV1`, `LineageEdgeV1`,
  provenance, `SemanticRef`, `ObjectRef`, `RelationTypeRef`
  (`src/domain/operational.ts`).
- Project events into tenant-partitioned rows with per-projection checkpoints
  (`src/projections/operational-objects.ts`).
- Read snapshots at the current position or any earlier checkpoint
  (`readSnapshot` / `readSnapshotAt`, `src/adapters/operational-objects.ts`).
- Serve typed queries: scope-filtered queries (`queryObjects` with `authorized` check),
  bounded traversal (`traverse` with `maxDepth`/`maxObjects` — required, never
  defaulted).
- Record objects/links/lineage via the projection API and commit events
  (`recordObject`, `recordLink`, `recordLineage`, `commit`).
- Preserve distinct failure observations: `denied`, `unavailable`, `blocked`,
  `no_match` — plus source failures as typed degraded entries.

## Non-responsibilities

- It does not decide what is *possible* (navigation does) or *why* state looks wrong (the
  [debugger](world-debugger.md) does).
- It does not trust the semantic world's contents as runtime rows; it only validates refs
  against the declared world (`assertSameWorld`, declared relation types).
- No cross-tenant reads: all keys are tenant-prefixed (`tenantKey`).

## Position in the system

- Fed by: events from intent commits and observation runs; direct object recordings via
  the projection API.
- Read by: `src/adapters/navigation.ts` (frame input), `src/domain/debugger.ts` (answers),
  `src/ui/workspace` (lineage, evidence), CLI/GUI surfaces.

## Core abstractions

| Symbol | Location | Role |
| --- | --- | --- |
| `OBJECT_SCHEMA` / `OperationalObjectV1` | `src/domain/operational.ts:58` | row schema + provenance |
| `parseCheckpointRef` / `formatCheckpointRef` | `src/domain/operational.ts:202` | composite checkpoint refs |
| `operationalObjectsProjection` | `src/projections/operational-objects.ts:84` | event → rows, tenant-prefixed |
| `readProjection` / `readSnapshotAt` | `src/adapters/operational-objects.ts` | checkpointed reads |
| `queryObjects` / `traverse` | `src/adapters/operational-objects.ts` | scoped query + bounded traversal |
| `assertSameWorld` | `src/adapters/operational-objects.ts:491` | world-identity guard |
| `QueryScope`, `ObserverState` | `src/domain/operational.ts` | access framing |

## Internal operation

1. Events land on the store (streams per tenant/subject).
2. The projection handler (`operationalObjectsProjection`) wraps and validates payloads
   (`payloadObject`), writing object/link/lineage/error rows under prefixed keys and
   advancing the projection checkpoint.
3. Reads resolve the requested checkpoint (current or historical via marker scan), assert
   same-world, filter by scope and declared relation types, and degrade explicitly when
   sources fail (`sourceFailure` keeps the reason, never invents rows).
4. Traversal walks declared outgoing relations only, with caller-supplied bounds;
   undeclared relation types are refused by name rather than silently dropped.

## State

Owned rows in the durable SQLite store, rebuildable from the event log (rebuild +
recovery paths are exercised in `test/operational-objects.test.ts` and its negative
companion).

## Lifecycle

event appended → projected → read at checkpoint → (optionally) compacted as new events
supersede. Checkpoint restore filters current rows — exact while the projection stays
additive (a known limit recorded in `.agents/CURRENT_STATUS.md` and `DEBT.md`).

## Failure modes

| Failure | Symptom | Handling |
| --- | --- | --- |
| Wrong world ref on write | `OperationalObjectError` | fix caller; rows never cross worlds |
| Missing bounds on traversal | typed refusal | caller must pass `maxDepth`/`maxObjects` |
| Denied scope | `denied` result, not empty success | check observer authorization |
| Projection rebuild divergence | rebuild test fails | fix projection determinism |
| Stale checkpoint read | read returns the historical snapshot as named | re-read at current position |

## Extension points

New row kinds follow the established pattern: domain schema → projection handler with
tenant key + payload validation → adapter read API → tests. Relation types must be
declared in the semantic world first.

## Source trail

- `src/domain/operational.ts` — schemas and checkpoint refs
- `src/projections/operational-objects.ts` — projection handler
- `src/adapters/operational-objects.ts` — read/query/traverse API
- `test/support/operational-fixture.ts` — fixture world/objects/links
- `test/operational-objects.test.ts`, `test/operational-objects-negative.test.ts` — contracts

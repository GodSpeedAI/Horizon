# Projections

## Overview

Cognate `Projection` definitions: pure folds from durable events into derived, read-only state. Both
are built on `@godspeedai/cognate-projections`'s public `Projection` interface; Horizon does not fork,
patch or shadow Cognate, and no projection here is a source of truth.

Two projections live here. `operational-objects.ts` folds recorded operational objects, links and
lineage edges into one row per entity, keyed so the store's code-point ordering is the ordering a query
sees. `navigation-context.ts` folds `run.started` into one tenant-partitioned row per run carrying the
observer, world, run and correlation references that were already in the event.

## Interface

- `operational-objects.ts`: `OPERATIONAL_OBJECTS_PROJECTION` = `{ name: "horizon.operational-objects",
  version: "1.1.0" }` `[operational-objects.ts:OPERATIONAL_OBJECTS_PROJECTION]`; folded event types
  `OBJECT_EVENTS` = `horizon.object.recorded`, `horizon.object.link.recorded`,
  `horizon.object.lineage.recorded` `[operational-objects.ts:OBJECT_EVENTS]`; key builders
  `objectKey`, `linkKey`, `lineageKey`, `errorKey` `[operational-objects.ts:objectKey]`;
  `operationalObjectsProjection: Projection` `[operational-objects.ts:operationalObjectsProjection]`;
  `DeclaredTypes` `[operational-objects.ts:DeclaredTypes]`.
- `navigation-context.ts`: `NAVIGATION_CONTEXT_PROJECTION` = `{ name:
  "horizon.navigation-context", version: "1.0.0" }` `[navigation-context.ts:NAVIGATION_CONTEXT_PROJECTION]`;
  `navigationContextProjection: Projection` folding `run.started` only
  `[navigation-context.ts:navigationContextProjection]`.
- Consumed by `../adapters/operational-objects.ts`, which names `OPERATIONAL_OBJECTS_PROJECTION.name`
  and `.version` when catching the projection up and when formatting a checkpoint ref.

## Invariants

- State keys are tenant-partitioned: every row key starts `<tenant>/`
  `[operational-objects.ts:tenantKey]`, which is what lets the read layer drop another observer's rows
  `[operational-objects.ts:tenantKey]`.
- The projection version is part of the contract: a stored checkpoint with another version yields
  `rebuild_required` from Cognate's runner rather than a silent reinterpretation
  `[operational-objects.ts:OPERATIONAL_OBJECTS_PROJECTION]`.
- Events other than the three declared types produce no state `[operational-objects.ts:operationalObjectsProjection]`.
- A malformed payload is not skipped: a zod failure writes an `error/` row with `code: "schema"`
  `[operational-objects.ts:operationalObjectsProjection]`, and the query layer treats any error row as
  degraded rather than empty.
- Object recording is idempotent and first-observation-wins: an object ref already in state produces no
  new row, so a later duplicate cannot rewrite history for an earlier checkpoint
  `[operational-objects.ts:operationalObjectsProjection]`.
- A link is keyed by relation type, endpoints **and** the provenance checkpoint ref, so recording the
  same link twice is a no-op rather than a duplicate the traversal would visit once per copy
  `[operational-objects.ts:linkKey]`.
- The error key is derived from event position (zero-padded to ten digits) and event id, not from a
  counter, so rebuilding from durable events reproduces the same keys
  `[operational-objects.ts:errorKey]`.
- Key prefixes `object/`, `link/`, `lineage/` and `error/` are disjoint so entity kinds never collide
  `[operational-objects.ts:objectKey]`.
- The navigation-context projection ignores every event type but `run.started` and requires a truthy
  `runId` `[navigation-context.ts:navigationContextProjection]`; its checkpoint ref is the event's own
  position, `cognate:${event.position}` `[navigation-context.ts:navigationContextProjection]`.
- Fold purity: `apply` depends only on the event and the state it is given, so replaying the same
  events in the same order reproduces the same state `[operational-objects.ts:operationalObjectsProjection]`.

## Side Effects

- None observed in source. Both modules return row values to the caller; the commit is performed by
  Cognate's projection runner, not here. No store, file, network, clock, randomness or subprocess call
  appears in either file. `navigation-context.ts` reads `event.metadata` (`agent`, `startedBy`) and
  `event.payload.input` as values passed in `[navigation-context.ts:navigationContextProjection]`.

## Verification

- Run: `bun test`

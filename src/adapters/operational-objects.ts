/**
 * Query and traversal over the operational object projection (T06, REQ-WORLD-002 / REQ-SAFE-003).
 *
 * ## Read model
 *
 * Cognate 0.6.1 has no predicate query, so this reads a projection's full state through
 * `readProjectionSnapshot` (one statement, so the checkpoint can never be ahead of the rows),
 * falling back to Cognate's documented `readProjectionSnapshotFallback` for stores without the
 * optional method, and filters in process. Cost is proportional to projection size. That is the
 * deliberate consequence of not forking Cognate (DEC-T05-10), and the reason traversal requires
 * explicit bounds (NE-03).
 *
 * ## What the layer refuses rather than smooths over
 *
 *  - a query whose requested checkpoint is not the projection's state (PE-04, NE-05)
 *  - a traversal with no bound, or beyond it (PE-06, NE-03)
 *  - an undeclared semantic type or relation type (NE-04, NE-07)
 *  - a link whose endpoint is not a projected object (NE-04)
 *  - a denied scope, with nothing about its contents in the answer (NE-01)
 */
import {
  readProjectionSnapshotFallback,
  type DurableStore,
  type Json,
  type StoredEvent,
  type ProjectionCheckpoint,
} from "@godspeedai/cognate-events";
import { ProjectionRunner } from "@godspeedai/cognate-projections";
import {
  formatCheckpointRef,
  parseCheckpointRef,
  type ObserverState,
  type LineageEdgeV1,
  type OperationalLinkV1,
  type OperationalObjectV1,
  type QueryResult,
  type QueryScope,
  type RelationTypeRef,
  type ResultStatus,
  type SemanticRef,
} from "../domain/operational.ts";
import { OBJECT_EVENTS, OPERATIONAL_OBJECTS_PROJECTION, operationalObjectsProjection } from "../projections/operational-objects.ts";

const SCHEMA_VERSION = "horizon.operational-objects/1";

/** The declared vocabulary of the pinned world. Absent declarations are refused, never guessed. */
export interface DeclaredWorld {
  readonly world_ref: string;
  /** The Cognate tenant partition the operational rows belong to. Public projections are keyed `<tenant>/<key>`. */
  readonly tenant: string;
  readonly types: ReadonlySet<SemanticRef>;
  readonly relations: ReadonlySet<RelationTypeRef>;
}

export interface ReadOptions {
  /** The checkpoint the caller believes it is reading at. Omitted means "current". */
  readonly checkpoint_ref?: string;
  readonly scope: QueryScope;
  /** Object refs the caller is continuing from, preserved on the result (REQ-WORLD-003). */
  readonly object_set?: readonly string[];
  readonly focus_ref?: string | null;
}

export interface ProjectionView {
  readonly checkpoint: ProjectionCheckpoint | undefined;
  readonly objects: readonly OperationalObjectV1[];
  readonly links: readonly OperationalLinkV1[];
  readonly errors: readonly { readonly key: string; readonly code: string; readonly message: string }[];
  /** True when checkpoint and rows came from one statement. */
  readonly consistent: boolean;
}

/**
 * Catch the projection up and read it in one consistent step.
 *
 * `catchUp` goes through `ProjectionRunner`, which reports `rebuild_required` when the stored
 * version differs from the code version. That condition is surfaced, never worked around: a
 * caller must call `rebuild` explicitly (PE-08).
 */
export async function readProjection(
  store: DurableStore,
  world: DeclaredWorld,
  worldRef: string,
): Promise<{ readonly ok: true; readonly view: ProjectionView } | { readonly ok: false; readonly status: "rebuild_required"; readonly reason: string }> {
  void worldRef;
  void world;
  const runner = new ProjectionRunner(store, operationalObjectsProjection);
  const caught = await runner.catchUp();
  if (caught.status === "rebuild_required") {
    return { ok: false, status: "rebuild_required", reason: `stored projection version ${caught.storedVersion} does not match ${OPERATIONAL_OBJECTS_PROJECTION.version}; rebuild required` };
  }
  if (caught.status === "error") {
    return { ok: false, status: "rebuild_required", reason: `projection stopped at position ${caught.position}: ${caught.error.message}` };
  }

  const snapshot = await readSnapshot(store, OPERATIONAL_OBJECTS_PROJECTION.name);
  const tenantPrefix = `${world.tenant}/`;
  // No checkpoint means the projection has never been committed. That is the genuine "nothing
  // has been recorded yet" case, and it is *empty*, not unavailable: Cognate's runner does not
  // commit a checkpoint when there were no events to fold, so requiring one would report a
  // healthy, empty store as a source failure. `unavailable` is reserved for a checkpoint that
  // records a failure, or for a source the caller names as down.
  const objects: OperationalObjectV1[] = [];
  const links: OperationalLinkV1[] = [];
  const errors: { key: string; code: string; message: string }[] = [];
  for (const row of snapshot.rows) {
    // Public projection state is tenant-partitioned. A row outside this tenant is not ours to
    // read, even when the same store also holds another observer's objects.
    if (!row.key.startsWith(tenantPrefix)) continue;
    const key = row.key.slice(tenantPrefix.length);
    if (key.startsWith("object/")) objects.push(row.value as unknown as OperationalObjectV1);
    else if (key.startsWith("link/")) links.push(row.value as unknown as OperationalLinkV1);
    else if (key.startsWith("error/")) {
      const entry = row.value as { code?: unknown; message?: unknown };
      errors.push({ key, code: String(entry.code ?? "unknown"), message: String(entry.message ?? "") });
    }
  }
  return {
    ok: true,
    view: { checkpoint: snapshot.checkpoint, objects, links, errors, consistent: store.readProjectionSnapshot !== undefined },
  };
}

/** One consistent read; the optional native method when present, Cognate's documented fallback otherwise. */
async function readSnapshot(store: DurableStore, name: string) {
  return store.readProjectionSnapshot !== undefined ? store.readProjectionSnapshot(name) : readProjectionSnapshotFallback(store, name);
}

/** The composite checkpoint string for this projection state. */
export function checkpointOf(view: ProjectionView): string {
  return formatCheckpointRef({
    position: view.checkpoint?.position ?? 0,
    projections: [{ name: OPERATIONAL_OBJECTS_PROJECTION.name, version: OPERATIONAL_OBJECTS_PROJECTION.version }],
  });
}

/** The status a successful result carries, derived from what was in scope and what matched. */
function statusOf(scopedTotal: number, matched: number): ResultStatus {
  if (scopedTotal === 0) return "empty";
  return matched === 0 ? "no-match" : "ok";
}

/**
 * The observer state carried on every answer, so the next surface can continue from it
 * (REQ-WORLD-003). It is built for failures too: a denied query still returns the checkpoint and
 * the observer, because those are not what was denied.
 */
function observerState(options: ReadOptions, worldRef: string, checkpoint: string): ObserverState {
  return {
    observer_ref: options.scope.observer_ref,
    world_ref: worldRef,
    checkpoint_ref: checkpoint,
    object_set: (options.object_set ?? []) as ObserverState["object_set"],
    focus_ref: (options.focus_ref ?? null) as ObserverState["focus_ref"],
  };
}


/**
 * Are any of the projection's contributors unavailable or blocked? (PE-07)
 *
 * This runs *before* the filter, because "the source is down" is not a property of a filter. A
 * caller that got `empty` for a blocked connector would conclude the world has no such objects,
 * which is a different and false claim.
 */
function sourceFailure(
  view: ProjectionView,
  options: ReadOptions,
): { readonly ok: false; readonly status: "unavailable" | "blocked"; readonly reason: string; readonly code: "scope" } | null {
  // Compare the requested checkpoint with the stored one before anything else, so a stale
  // request cannot be answered from newer rows (PE-04 / NE-05).
  const requested = options.checkpoint_ref;
  if (requested !== undefined) {
    const parsed = parseCheckpointRef(requested);
    if (parsed === null) return null; // handled by the checkpoint check
    const stored = checkpointOf(view);
    if (requested !== stored) {
      return { ok: false, status: "unavailable", reason: `requested ${requested} but the projection is at ${stored}`, code: "scope" };
    }
  }
  for (const source of options.scope.unavailable_sources ?? []) {
    return { ok: false, status: "unavailable", reason: `source ${source.source} is unavailable: ${source.reason}`, code: "scope" };
  }
  return null;
}


/** Authorized only if the observer's scope names the type, or names no types at all. */
function authorized(scope: QueryScope, object: OperationalObjectV1): boolean {
  const allowed = scope.allowed_semantic_refs;
  if (allowed === undefined) return true;
  return allowed.includes(object.semantic_ref);
}

/**
 * Filter, then disclose only what survives the scope.
 *
 * Denial is decided against the *requested* types, so an observer who may see nothing of the
 * requested type gets `denied` rather than an empty set — and that refusal is built from the
 * request, not from the rows, so it cannot leak a count (NE-01).
 */
export async function queryObjects(
  store: DurableStore,
  world: DeclaredWorld,
  worldRef: string,
  filter: { readonly semantic_refs?: readonly SemanticRef[]; readonly fields?: Readonly<Record<string, string | number | boolean>> },
  options: ReadOptions,
): Promise<QueryResult<OperationalObjectV1>> {
  const read = await readProjection(store, world, worldRef);
  if (!read.ok) {
    return {
      ok: false,
      status: "unavailable",
      code: "checkpoint",
      reason: read.reason,
      checkpoint_ref: formatCheckpointRef({ position: 0, projections: [{ name: OPERATIONAL_OBJECTS_PROJECTION.name, version: OPERATIONAL_OBJECTS_PROJECTION.version }] }),
      observer_state: observerState(options, worldRef, ""),
    };
  }
  const view = read.view;
  const checkpoint = checkpointOf(view);
  const state = observerState(options, worldRef, checkpoint);

  // 1. Undeclared types are refused before any row is touched (NE-07).
  for (const ref of filter.semantic_refs ?? []) {
    if (!world.types.has(ref)) {
      return { ok: false, status: "empty", code: "undeclared", reason: `semantic type ${ref} is not declared in ${worldRef}`, checkpoint_ref: checkpoint, observer_state: state };
    }
  }

  // 2. A requested checkpoint that is not the stored one is refused, not answered (PE-04).
  if (options.checkpoint_ref !== undefined && options.checkpoint_ref !== checkpoint) {
    return { ok: false, status: "empty", code: "checkpoint", reason: `requested checkpoint ${options.checkpoint_ref} is not the projection state ${checkpoint}`, checkpoint_ref: checkpoint, observer_state: state };
  }

  // 3. A source that is down is not an empty result (PE-07 / NE-02).
  const failure = sourceFailure(view, options);
  if (failure !== null && failure.status !== "unavailable") {
    return { ok: false, status: failure.status, code: "scope", reason: failure.reason, checkpoint_ref: checkpoint, observer_state: state };
  }
  for (const source of options.scope.unavailable_sources ?? []) {
    return { ok: false, status: "unavailable", code: "scope", reason: `source ${source.source} is unavailable: ${source.reason}`, checkpoint_ref: checkpoint, observer_state: state };
  }

  // 4. A projection that recorded a malformed event is degraded, not empty.
  if (view.errors.length > 0) {
    return { ok: false, status: "unavailable", code: "undeclared", reason: `projection state is corrupt: ${view.errors[0]?.message ?? ""}`, checkpoint_ref: checkpoint, observer_state: state };
  }

  // 5. Scope. Decided from the request so a refusal cannot carry a count.
  const wanted = filter.semantic_refs ?? [...new Set(view.objects.map((object) => object.semantic_ref))];
  const permitted = wanted.filter((ref) => options.scope.allowed_semantic_refs === undefined || options.scope.allowed_semantic_refs.includes(ref));
  if (permitted.length === 0 && wanted.length > 0) {
    return { ok: false, status: "denied", code: "scope", reason: "the observer's scope covers none of the requested object types", checkpoint_ref: checkpoint, observer_state: state };
  }


  const scoped = view.objects.filter((object) => authorized(options.scope, object));
  const filtered = scoped.filter((object) => {
    if (filter.semantic_refs !== undefined && !filter.semantic_refs.includes(object.semantic_ref)) return false;
    for (const [field, value] of Object.entries(filter.fields ?? {})) {
      if (object.fields[field] !== value) return false;
    }
    return true;
  });

  // A blocked connector whose other objects are readable degrades the answer visibly rather
  // than failing it: the caller must be able to tell "partial" from "complete".
  const degraded = (options.scope.blocked_connectors ?? []).map((entry) => ({ connector: entry.connector, reason: entry.reason }));

  // Deterministic order: object_ref is unique, so sorting by it is total and insertion- and
  // replay-order independent (PE-06 / NE-09).
  const items = [...filtered].sort((left, right) => (left.object_ref < right.object_ref ? -1 : left.object_ref > right.object_ref ? 1 : 0));
  return {
    ok: true,
    status: statusOf(scoped.length, items.length),
    items,
    checkpoint_ref: checkpoint,
    observer_state: state,
    degraded,
  };
}


export interface TraversalStep {
  readonly relation_type: RelationTypeRef;
  readonly from: string;
  readonly to: string;
  /** The hop index at which this edge was crossed. */
  readonly depth: number;
}

export interface TraversalResult {
  readonly objects: readonly OperationalObjectV1[];
  readonly steps: readonly TraversalStep[];
}

/**
 * Breadth-first traversal over the operational link set only (REQ-WORLD-002, REQ-WORLD-005).
 *
 * Bounded on purpose. `max_depth` and `max_objects` are required, so a caller cannot ask for the
 * transitive closure of a cyclic graph by omitting them (NE-03). The search is BFS over
 * object_ref-sorted edges, which makes the visit order a function of the graph rather than of
 * insertion order (PE-06 / NE-09).
 *
 * Import and lineage edges are not in this index at all: they are different graphs with different
 * identities, and a traversal is a claim about operational linkage (REQ-WORLD-005 / NE-06).
 */
export async function traverse(
  store: DurableStore,
  world: DeclaredWorld,
  worldRef: string,
  request: {
    readonly from: readonly string[];
    readonly relation_types: readonly RelationTypeRef[];
    readonly max_depth?: number;
    readonly max_objects?: number;
  },
  options: ReadOptions,
): Promise<QueryResult<OperationalObjectV1> & { readonly steps?: readonly TraversalStep[] }> {
  const read = await readProjection(store, world, worldRef);
  if (!read.ok) {
    return {
      ok: false,
      status: "unavailable",
      code: "checkpoint",
      reason: read.reason,
      checkpoint_ref: "",
      observer_state: observerState(options, worldRef, ""),
    };
  }
  const view = read.view;
  const checkpoint = checkpointOf(view);
  const state = observerState(options, worldRef, checkpoint);

  // The bound is checked before any traversal work, and the refusal says which one is missing.
  const missing: string[] = [];
  if (request.max_depth === undefined) missing.push("max_depth");
  if (request.max_objects === undefined) missing.push("max_objects");
  if (missing.length > 0) {
    return { ok: false, status: "no-match", code: "limit", reason: `traversal requires a bound: missing ${missing.join(", ")}`, checkpoint_ref: checkpoint, observer_state: state };
  }
  const maxDepth = request.max_depth as number;
  const maxObjects = request.max_objects as number;

  // A relation type that the world does not declare cannot be traversed honestly (NE-04).
  for (const relation of request.relation_types) {
    if (!world.relations.has(relation)) {
      return { ok: false, status: "no-match", code: "undeclared", reason: `relation type ${relation} is not declared in ${worldRef}`, checkpoint_ref: checkpoint, observer_state: state };
    }
  }

  if (view.objects.length === 0) {
    return { ok: true, status: "empty", items: [], steps: [], checkpoint_ref: checkpoint, observer_state: state, degraded: [] };
  }

  const byRef = new Map(view.objects.map((object) => [object.object_ref, object]));
  const permitted = new Set(request.relation_types);
  // Edges indexed by endpoint, sorted, so BFS order is graph order and not insertion order.
  const outgoing = new Map<string, TraversalStep[]>();
  for (const link of view.links) {
    if (!permitted.has(link.relation_type)) continue;
    const bucket = outgoing.get(link.from) ?? [];
    bucket.push({ relation_type: link.relation_type, from: link.from, to: link.to, depth: 0 });
    outgoing.set(link.from, bucket);
  }
  for (const bucket of outgoing.values()) {
    bucket.sort((left, right) => {
      const byRelation = left.relation_type < right.relation_type ? -1 : left.relation_type > right.relation_type ? 1 : 0;
      if (byRelation !== 0) return byRelation;
      return left.to < right.to ? -1 : left.to > right.to ? 1 : 0;
    });
  }


  const visited = new Set<string>();
  const steps: TraversalStep[] = [];
  let frontier = [...request.from].sort();
  for (const ref of frontier) {
    if (!byRef.has(ref)) {
      return { ok: false, status: "no-match", code: "dangling", reason: `traversal start ${ref} is not a projected object`, checkpoint_ref: checkpoint, observer_state: state };
    }
    visited.add(ref);
  }

  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth += 1) {
    const next: string[] = [];
    for (const ref of frontier) {
      const source = byRef.get(ref);
      // A start whose objects the observer may not see is neither traversed nor disclosed.
      if (source === undefined || !authorized(options.scope, source)) continue;
      for (const edge of outgoing.get(ref) ?? []) {
        const target = byRef.get(edge.to);
        if (target === undefined) {
          // A link pointing at nothing is a corrupted projection, not an empty path.
          return { ok: false, status: "no-match", code: "dangling", reason: `link ${edge.relation_type} from ${ref} points at unprojected ${edge.to}`, checkpoint_ref: checkpoint, observer_state: state };
        }
        if (!authorized(options.scope, target)) continue;
        if (visited.has(edge.to)) continue;
        if (visited.size >= maxObjects) {
          return { ok: false, status: "no-match", code: "limit", reason: `traversal exceeded max_objects=${maxObjects}`, checkpoint_ref: checkpoint, observer_state: state };
        }
        visited.add(edge.to);
        steps.push({ ...edge, depth });
        next.push(edge.to);
      }
    }
    frontier = next.sort();
  }

  const items = [...visited]
    .map((ref) => byRef.get(ref) as OperationalObjectV1)
    .sort((left, right) => (left.object_ref < right.object_ref ? -1 : left.object_ref > right.object_ref ? 1 : 0));
  return { ok: true, status: items.length === 0 ? "no-match" : "ok", items, steps, checkpoint_ref: checkpoint, observer_state: state, degraded: [] };
}


/**
 * Refuse a write whose world is not the world the declarations were checked against (NE-07).
 *
 * The event's `tenant` is derived from `worldRef`, so accepting a mismatched world would file the
 * object under a tenant nothing validated.
 */
function assertSameWorld(world: DeclaredWorld, worldRef: string): void {
  if (world.world_ref !== worldRef) {
    throw new OperationalObjectError("world", `declarations were checked against ${world.world_ref}, not ${worldRef}`);
  }
}

export class OperationalObjectError extends Error {
  override readonly name = "OperationalObjectError";
  constructor(
    readonly code: "undeclared" | "dangling" | "world" | "schema" | "graph",
    message: string,
  ) {
    super(`OPERATIONAL: ${message}`);
  }
}

/**
 * Record an operational object, link or lineage edge as a durable event.
 *
 * Integrity is enforced *before* the commit, so a refused record writes nothing: a half-link can
 * never exist for a later traversal to discover (NE-04). The checks are the ones the prereg
 * states, in the order that avoids a false negative:
 *
 *   1. the payload matches its schema;
 *   2. the semantic type is declared in the pinned world (NE-07);
 *   3. for a link, the relation type is declared (NE-04) and both endpoints are already
 *      projected objects, at the same world (NE-04);
 *   4. the graph kind agrees with the event type (NE-06): an import or lineage edge cannot be
 *      submitted as an operational link.
 */
export async function recordObject(
  store: DurableStore,
  world: DeclaredWorld,
  worldRef: string,
  input: { readonly object: OperationalObjectV1 },
): Promise<{ readonly eventId: string; readonly position: number }> {
  const object = input.object;
  if (object.schema !== SCHEMA_VERSION) throw new OperationalObjectError("schema", `schema ${object.schema} is not ${SCHEMA_VERSION}`);
  // An object may only be recorded into the world whose declarations were checked (NE-07). Without
  // this, a caller could write an object attributed to a world it was never validated against.
  assertSameWorld(world, worldRef);
  if (!world.types.has(object.semantic_ref)) {
    throw new OperationalObjectError("undeclared", `semantic type ${object.semantic_ref} is not declared in ${worldRef}`);
  }
  return commit(store, world.tenant, worldRef, OBJECT_EVENTS.objectRecorded, object.object_ref, object);
}

export async function recordLink(
  store: DurableStore,
  world: DeclaredWorld,
  worldRef: string,
  input: { readonly link: OperationalLinkV1 },
): Promise<{ readonly eventId: string; readonly position: number }> {
  const link = input.link;
  assertSameWorld(world, worldRef);
  if (link.graph !== "operational") {
    throw new OperationalObjectError("graph", `a ${link.graph} edge is not an operational link`);
  }
  if (!world.relations.has(link.relation_type)) {
    throw new OperationalObjectError("undeclared", `relation type ${link.relation_type} is not declared in ${worldRef}`);
  }
  const view = await currentView(store, world, worldRef);
  const present = new Set(view.objects.map((object) => object.object_ref));
  for (const endpoint of [link.from, link.to]) {
    if (!present.has(endpoint)) {
      throw new OperationalObjectError("dangling", `link endpoint ${endpoint} is not a projected object`);
    }
  }
  return commit(store, world.tenant, worldRef, OBJECT_EVENTS.linkRecorded, `${link.from}->${link.to}`, link);
}

export async function recordLineage(
  store: DurableStore,
  world: DeclaredWorld,
  worldRef: string,
  input: { readonly edge: LineageEdgeV1 },
): Promise<{ readonly eventId: string; readonly position: number }> {
  const edge = input.edge;
  assertSameWorld(world, worldRef);
  if (edge.graph !== "lineage") throw new OperationalObjectError("graph", `a ${edge.graph} edge is not a lineage record`);
  const view = await currentView(store, world, worldRef);
  if (!view.objects.some((object) => object.object_ref === edge.object_ref)) {
    throw new OperationalObjectError("dangling", `lineage object ${edge.object_ref} is not a projected object`);
  }
  return commit(store, world.tenant, worldRef, OBJECT_EVENTS.lineageRecorded, edge.observation_ref, edge);
}

async function currentView(store: DurableStore, world: DeclaredWorld, worldRef: string): Promise<ProjectionView> {
  const read = await readProjection(store, world, worldRef);
  if (!read.ok) throw new OperationalObjectError("schema", read.reason);
  return read.view;
}

/** One append, through the durable store. The event carries its own world and object identity. */
async function commit(
  store: DurableStore,
  tenant: string,
  worldRef: string,
  eventType: string,
  streamKey: string,
  body: { readonly object_ref?: string; readonly from?: string; readonly to?: string },
): Promise<{ readonly eventId: string; readonly position: number }> {
  const streamId = `horizon.operational/${streamKey}`;
  const version = await store.streamVersion(streamId);
  const occurredAt = new Date().toISOString();
  const outcome = await store.commit({
    appends: [
      {
        streamId,
        expectedVersion: version,
        events: [
          {
            eventType,
            schemaVersion: 1,
            occurredAt,
            tenant,
            correlationId: `corr-${streamKey}`,
            causationId: null,
            runId: null,
            scopeId: streamKey,
            payload: { object: body } as unknown as Json,
          },
        ],
      },
    ],
    result: { ok: true } as unknown as Json,
  });
  if (outcome.kind !== "committed") throw new OperationalObjectError("schema", `commit was ${outcome.kind}`);
  const first: StoredEvent | undefined = outcome.events[0];
  return { eventId: first?.eventId ?? "", position: first?.position ?? 0 };
}


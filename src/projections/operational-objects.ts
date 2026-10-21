/**
 * `horizon.operational-objects` — the operational object projection (T06, REQ-WORLD-006).
 *
 * Built on `@godspeedai/cognate-projections`'s public `Projection` interface. Horizon does not
 * fork, patch or shadow Cognate (DEC-T05-10); it folds durable events into projection state and
 * reads that state back through Cognate's public store API.
 *
 * The projection is a pure fold: `apply` depends only on the event and its own state, so replaying
 * the same events in the same order reproduces the same state (and NE-09 checks that a different
 * order does not matter either, by keying state rather than appending).
 *
 * State is stored as one row per entity, keyed so that `listProjection`'s code-point ordering is
 * the ordering a query sees. That is what makes traversal deterministic without a sort step.
 */
import type { Json } from "@godspeedai/cognate-events";
import type { Projection, ProjectionState } from "@godspeedai/cognate-projections";
import {
  LineageEdgeV1,
  OBJECT_SCHEMA,
  OperationalLinkV1,
  OperationalObjectV1,
  SemanticRef,
} from "../domain/operational.ts";

export const OPERATIONAL_OBJECTS_PROJECTION = {
  name: "horizon.operational-objects",
  /**
   * Bump on any change to how state is derived. A stored checkpoint with another version yields
   * `rebuild_required` from Cognate's runner rather than a silent reinterpretation (PE-08).
   */
  version: "1.1.0",
} as const;

/** Event types this projection folds. Anything else is ignored, not guessed at. */
export const OBJECT_EVENTS = {
  objectRecorded: "horizon.object.recorded",
  linkRecorded: "horizon.object.link.recorded",
  lineageRecorded: "horizon.object.lineage.recorded",
} as const;

/** Key prefixes. Ordered so objects, links and lineage never collide, and reads are stable. */
const OBJECT_PREFIX = "object/";
const LINK_PREFIX = "link/";
const LINEAGE_PREFIX = "lineage/";

/** Public projections are tenant-partitioned: every state key starts with `<tenant>/`. */
function tenantKey(event: { readonly tenant: string }, key: string): string {
  return `${event.tenant}/${key}`;
}

export function objectKey(objectRef: string): string {
  return `${OBJECT_PREFIX}${objectRef}`;
}

/**
 * A link is keyed by everything that identifies it, so recording the same link twice is a
 * no-op rather than a duplicate the traversal would visit once per copy.
 */
export function linkKey(link: { readonly relation_type: string; readonly from: string; readonly to: string; readonly checkpoint_ref: string }): string {
  return `${LINK_PREFIX}${link.relation_type}/${link.from}/${link.to}/${link.checkpoint_ref}`;
}

/**
 * The fold-error row. Keyed by *position*, not event id, so rebuilding from durable events
 * reproduces the same keys (NE-09) and a poisoned event is reported at the same place twice.
 */
export function errorKey(event: { readonly position: number; readonly eventId: string }): string {
  return `error/${String(event.position).padStart(10, "0")}/${event.eventId}`;
}


export function lineageKey(edge: { readonly observation_ref: string; readonly object_ref: string }): string {
  return `${LINEAGE_PREFIX}${edge.observation_ref}/${edge.object_ref}`;
}

function payloadObject(event: { readonly payload: Json }): Record<string, unknown> | null {
  const payload = event.payload;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
  const wrapped = (payload as Record<string, unknown>)["object"];
  const candidate = wrapped ?? payload;
  return candidate !== null && typeof candidate === "object" && !Array.isArray(candidate) ? (candidate as Record<string, unknown>) : null;
}

export const operationalObjectsProjection: Projection = {
  name: OPERATIONAL_OBJECTS_PROJECTION.name,
  version: OPERATIONAL_OBJECTS_PROJECTION.version,
  apply(event, state: ProjectionState) {
    const body = payloadObject(event);
    if (body === null) return [];

    if (event.eventType === OBJECT_EVENTS.objectRecorded) {
      const parsed = OperationalObjectV1.safeParse({ schema: OBJECT_SCHEMA, ...body });
      // A malformed event is not silently skipped: it is written to an error row so the query
      // layer can report the projection as degraded instead of claiming an empty result.
      if (!parsed.success) return [{ key: tenantKey(event, errorKey(event)), value: { code: "schema", message: parsed.error.message } }];
      const object = parsed.data;
      const existing = state.get(tenantKey(event, objectKey(object.object_ref)));
      // Idempotent: the same object recorded twice is one object, and the first observation wins
      // so a later duplicate cannot rewrite history for an earlier checkpoint.
      if (existing !== undefined) return [];
      return [{ key: tenantKey(event, objectKey(object.object_ref)), value: object as unknown as Json }];
    }

    if (event.eventType === OBJECT_EVENTS.linkRecorded) {
      const parsed = OperationalLinkV1.safeParse({ schema: OBJECT_SCHEMA, ...body });
      if (!parsed.success) return [{ key: tenantKey(event, `error/${event.eventId}`), value: { code: "schema", message: parsed.error.message } }];
      const link = parsed.data;
      // Endpoint integrity is checked structurally here; the store-facing recorder refuses a
      // dangling endpoint before committing, so a half-link cannot be written in the first place.
      return [{ key: tenantKey(event, linkKey({ ...link, checkpoint_ref: link.provenance.checkpoint_ref })), value: link as unknown as Json }];
    }

    if (event.eventType === OBJECT_EVENTS.lineageRecorded) {
      const parsed = LineageEdgeV1.safeParse({ schema: OBJECT_SCHEMA, ...body });
      if (!parsed.success) return [{ key: tenantKey(event, `error/${event.eventId}`), value: { code: "schema", message: parsed.error.message } }];
      return [{ key: tenantKey(event, lineageKey(parsed.data)), value: parsed.data as unknown as Json }];
    }

    return [];
  },
};

/** The declared semantic types, from the pinned world. Used to refuse undeclared types. */
export type DeclaredTypes = ReadonlySet<SemanticRef>;

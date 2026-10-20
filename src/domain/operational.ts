/**
 * `horizon.operational-objects/1` — the typed operational object layer (T06, REQ-WORLD-001/002/006).
 *
 * ## What this is
 *
 * A projection, not a store. Operational objects and links are derived from durable Cognate events
 * by a `Projection` (`src/projections/operational-objects.ts`) and read back through Cognate's
 * public store API. Horizon keeps no mutable object database of its own (REQ-WORLD-006).
 *
 * ## Three graphs, kept distinct (REQ-WORLD-005)
 *
 *  - **semantic** — declared types and import edges, owned by DomainForge and read through the
 *    pinned world (`semantic_ref`). Never mutable here.
 *  - **operational** — instances and links between them, derived from events (`object_ref`).
 *  - **lineage** — which observation produced which object (`lineage_ref`), a separate edge kind.
 *
 * A semantic reference is a *string that names a declared type*. An operational reference is a
 * *string that names an instance*. They are different types in this module, so a semantic id
 * cannot be passed where an object ref is expected without an explicit conversion.
 */
import { z } from "zod";

export const OBJECT_SCHEMA = "horizon.operational-objects/1" as const;

/** A declared type in the pinned world, e.g. `horizon.products.strategist::StrategyEntity`. */
export const SemanticRef = z
  .string()
  .regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*::[A-Za-z][A-Za-z0-9_]*$/, "semantic_ref MUST be <dotted.namespace>::<TypeName>");
export type SemanticRef = z.infer<typeof SemanticRef>;

/** An instance in the operational graph, e.g. `obj:schedule-window:alpha`. */
export const ObjectRef = z.string().regex(/^obj:[a-z0-9-]+:[a-z0-9-]+$/, "object_ref MUST be obj:<type>:<key>");
export type ObjectRef = z.infer<typeof ObjectRef>;

export const RelationTypeRef = z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_-]*$/, "relation_type MUST be <group>.<name>");
export type RelationTypeRef = z.infer<typeof RelationTypeRef>;

/** The integration level a source has actually reached. Never inferred from configuration. */
export const INTEGRATION_LEVELS = ["bound", "read_only", "fixture", "planned"] as const;
export type IntegrationLevel = (typeof INTEGRATION_LEVELS)[number];

/**
 * Where an object came from. `connector` is the component that observed it; `product` the owning
 * product. `checkpoint_ref` is the Cognate commit position at which the observation was recorded.
 */
export const ProvenanceV1 = z
  .object({
    product: z.string().min(1),
    connector: z.string().min(1),
    integration_level: z.enum(INTEGRATION_LEVELS),
    checkpoint_ref: z.string().regex(/^cognate:\d+$/, "checkpoint_ref MUST be cognate:<position>"),
    /** ISO-8601 of the observation, for checkpoint age (REQ-WORLD-007). */
    observed_at: z.string().datetime(),
  })
  .strict();
export type ProvenanceV1 = z.infer<typeof ProvenanceV1>;

export const OperationalObjectV1 = z
  .object({
    schema: z.literal(OBJECT_SCHEMA),
    object_ref: ObjectRef,
    /** The declared type this is an instance of. Distinct from `object_ref`. */
    semantic_ref: SemanticRef,
    label: z.string().min(1),
    /** Flat, deliberately simple: a typed field bag, not a second ontology. */
    fields: z.record(z.union([z.string(), z.number(), z.boolean()])),
    provenance: ProvenanceV1,
  })
  .strict();
export type OperationalObjectV1 = z.infer<typeof OperationalObjectV1>;

/** Which graph an edge belongs to. `import` and `lineage` are never operational links. */
export const GRAPH_KINDS = ["operational", "import", "lineage"] as const;
export type GraphKind = (typeof GRAPH_KINDS)[number];

export const OperationalLinkV1 = z
  .object({
    schema: z.literal(OBJECT_SCHEMA),
    graph: z.literal("operational"),
    relation_type: RelationTypeRef,
    from: ObjectRef,
    to: ObjectRef,
    provenance: ProvenanceV1,
  })
  .strict();
export type OperationalLinkV1 = z.infer<typeof OperationalLinkV1>;

/**
 * A lineage edge: which observation produced which object. Deliberately a different shape from a
 * link — it carries no relation type from the world, because lineage is not an operational claim.
 */
export const LineageEdgeV1 = z
  .object({
    schema: z.literal(OBJECT_SCHEMA),
    graph: z.literal("lineage"),
    observation_ref: z.string().min(1),
    object_ref: ObjectRef,
    provenance: ProvenanceV1,
  })
  .strict();
export type LineageEdgeV1 = z.infer<typeof LineageEdgeV1>;

/**
 * The closed outcome set for a query (REQ-SAFE-003, PE-07).
 *
 * These are five different facts and collapsing any two is a lie:
 *
 *  - `empty`        the projection is genuinely empty at this checkpoint (nothing was ever recorded)
 *  - `no-match`     objects exist, and the filter selected none of them
 *  - `denied`       the observer may not see this scope; nothing about its contents is disclosed
 *  - `blocked`      a named connector is not answering, and its objects cannot be enumerated
 *  - `unavailable`  the source behind the projection cannot be read at all
 *
 * `denied` deliberately carries no count: a "denied, 4 objects" answer has already leaked.
 */
export const OUTCOME_STATUSES = ["empty", "no-match", "denied", "blocked", "unavailable"] as const;
export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number];

/** A status that accompanies a successful result set. */
export type ResultStatus = "ok" | "empty" | "no-match";

export interface QueryScope {
  /** The observer. Authorization is evaluated per query against this ref. */
  readonly observer_ref: string;
  /** Semantic types the observer may see. Absent means "all declared types". */
  readonly allowed_semantic_refs?: readonly SemanticRef[];
  /** Connectors whose objects are blocked right now, and why. */
  readonly blocked_connectors?: readonly { readonly connector: string; readonly reason: string }[];
  /** Sources that cannot be read at all. */
  readonly unavailable_sources?: readonly { readonly source: string; readonly reason: string }[];
}

export type QueryResult<T> =
  | {
      /** A result set, possibly empty. `checkpoint_ref` covers the rows *and* the projection versions. */
      readonly ok: true;
      readonly status: ResultStatus;
      readonly items: readonly T[];
      readonly checkpoint_ref: string;
      /** Focus, selection, observer and world, carried for the next surface (REQ-WORLD-003). */
      readonly observer_state: ObserverState;
      /** Non-fatal degradations: a blocked connector whose other objects are still returned. */
      readonly degraded: readonly { readonly connector: string; readonly reason: string }[];
    }
  | {
      readonly ok: false;
      readonly status: Exclude<OutcomeStatus, never>;
      readonly reason: string;
      /** Set when a required scope precondition failed, e.g. `scope`. */
      readonly code: QueryFailureCode;
      readonly checkpoint_ref: string;
      readonly observer_state: ObserverState;
    };

export const QUERY_FAILURE_CODES = [
  /** The observer's scope does not cover the request. Discloses nothing about contents. */
  "scope",
  /** Traversal bound missing or exceeded. */
  "limit",
  /** The requested checkpoint is not the projection's state. */
  "checkpoint",
  /** The pinned world does not declare this type or relation. */
  "undeclared",
  /** A link endpoint does not resolve. */
  "dangling",
  /** The world ref on a fixture/query does not match the pinned world. */
  "world",
] as const;
export type QueryFailureCode = (typeof QUERY_FAILURE_CODES)[number];

export interface ObserverState {
  readonly observer_ref: string;
  readonly world_ref: string;
  readonly checkpoint_ref: string;
  /** Selection as object refs, in the order the caller asked for them. */
  readonly object_set: readonly ObjectRef[];
  readonly focus_ref: ObjectRef | null;
}

/**
 * `checkpoint_ref` is not one number. It is the commit position *plus* the projection names and
 * versions read (REQ-WORLD-006), so a result can be reproduced exactly or refused — never
 * silently reinterpreted after a version bump.
 */
export const CHECKPOINT_SCHEMA = "cognate-checkpoint/1" as const;

export const ProjectionReadRef = z
  .object({ name: z.string().min(1), version: z.string().min(1) })
  .strict();
export type ProjectionReadRef = z.infer<typeof ProjectionReadRef>;

export const CompositeCheckpointRef = z
  .object({
    schema: z.literal(CHECKPOINT_SCHEMA),
    position: z.number().int().nonnegative(),
    projections: z.array(ProjectionReadRef).min(1),
  })
  .strict();
export type CompositeCheckpointRef = z.infer<typeof CompositeCheckpointRef>;

/** Parse `cognate-checkpoint/1@{position};{name}@{version},…`. Refuses anything else. */
export function parseCheckpointRef(value: string): CompositeCheckpointRef | null {
  const match = /^cognate-checkpoint\/1@(\d+);(.+)$/.exec(value);
  if (match === null) return null;
  const projections: ProjectionReadRef[] = [];
  for (const part of (match[2] ?? "").split(",")) {
    const entry = /^(.+)@(.+)$/.exec(part);
    if (entry?.[1] === undefined || entry[2] === undefined) return null;
    projections.push({ name: entry[1], version: entry[2] });
  }
  if (projections.length === 0) return null;
  return { schema: CHECKPOINT_SCHEMA, position: Number(match[1]), projections };
}

/** Serialize a checkpoint. Projections are sorted so the string is order-independent. */
export function formatCheckpointRef(ref: { readonly position: number; readonly projections: readonly ProjectionReadRef[] }): string {
  const listed = [...ref.projections]
    .map((projection) => `${projection.name}@${projection.version}`)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return `cognate-checkpoint/1@${ref.position};${listed.join(",")}`;
}

/**
 * Horizon's own framing of the read it performed: which projections, and whether the store could
 * give checkpoint and rows in one consistent read.
 */
export interface ReadFraming {
  readonly projections: readonly ProjectionReadRef[];
  /** True when the rows and checkpoint came from one statement (`readProjectionSnapshot`). */
  readonly consistent: boolean;
}


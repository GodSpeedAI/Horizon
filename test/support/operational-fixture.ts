/**
 * T06 fixture: a durable operational graph over the real pinned world.
 *
 * ## What this establishes, and what it does not
 *
 * It records operational objects, links and lineage as *durable Cognate events* in a real SQLite
 * store, then reads them back through the projection and query layer. That establishes the
 * projection, query, scoping, traversal and checkpoint behaviour against the pinned Cognate API.
 *
 * It does NOT establish that any external system produces these events. `connector: "mlflow"`
 * means "an observation attributed to the mlflow connector"; the integration level says `fixture`
 * because nothing real is bound. See the prereg's `known_confounds`.
 *
 * The semantic types are read from the pinned world, so a fixture cannot quietly use a type the
 * world does not declare.
 */
import type { DurableStore } from "@godspeedai/cognate-events";
import { loadWorld } from "../../src/adapters/semantic.ts";
import type { DeclaredWorld } from "../../src/adapters/operational-objects.ts";
import { recordLineage, recordLink, recordObject } from "../../src/adapters/operational-objects.ts";
import {
  OBJECT_SCHEMA,
  type LineageEdgeV1,
  type OperationalLinkV1,
  type OperationalObjectV1,
  type RelationTypeRef,
  type SemanticRef,
} from "../../src/domain/operational.ts";

export const FIXTURE_WORLD_REF = "world:horizon@sha256:6c18d6a608bd9d83e6aa354d5a8cc804009ca208562021c1736ee429412309f0";

/** Declared types the fixture uses, verified against the pinned world at fixture time. */
const FIXTURE_TYPES = [
  "horizon.interaction::CanonicalJourney",
  "horizon.interaction::HorizonHost",
  "horizon.interaction::ObserverActor",
  "horizon.products.strategist::StrategyEntity",
] as const;

/**
 * The operational relation vocabulary, declared here and *not* conflated with the semantic import
 * edges in the world (`flow.from`, …). These are the only relation types a link may use
 * (REQ-WORLD-005). `entity.lineage_of` exists so a lineage edge recorded as an operational link
 * can be distinguished from a real operational dependency.
 */
export const OPERATIONAL_RELATIONS: readonly RelationTypeRef[] = [
  "journey.covers",
  "entity.governed_by",
  "host.serves",
  "entity.lineage_of",
] as const;

export function declaredWorld(worldRef = FIXTURE_WORLD_REF, tenant = "local:test"): DeclaredWorld {
  const world = loadWorld(worldRef);
  const types = new Set<SemanticRef>();
  for (const object of world.projection.objects) {
    if (object.kind === "Entity" || object.kind === "EntityInstance") types.add(object.ref.id as SemanticRef);
  }
  const relations = new Set<RelationTypeRef>(OPERATIONAL_RELATIONS);
  return { world_ref: world.worldRef, tenant, types, relations };
}

function provenance(connector: string, position: number, observedAt: string) {
  return {
    product: "horizon",
    connector,
    integration_level: "fixture" as const,
    checkpoint_ref: `cognate:${position}`,
    observed_at: observedAt,
  };
}

function object(
  ref: string,
  semantic: SemanticRef,
  label: string,
  fields: Record<string, string | number | boolean>,
  connector: string,
  position: number,
  observedAt: string,
): OperationalObjectV1 {
  return { schema: OBJECT_SCHEMA, object_ref: ref, semantic_ref: semantic, label, fields, provenance: provenance(connector, position, observedAt) };
}

/** The fixture's objects, in the order they are recorded. */
export function fixtureObjects(observedAt: string): OperationalObjectV1[] {
  const at = observedAt;
  return [
    object("obj:journey:j01", "horizon.interaction::CanonicalJourney", "J01 explore", { journey_id: "J01", status: "partially_bound" }, "fixture-model", 1, at),
    object("obj:journey:j02", "horizon.interaction::CanonicalJourney", "J02 operate", { journey_id: "J02", status: "partially_bound" }, "fixture-model", 2, at),
    object("obj:strategy:alpha", "horizon.products.strategist::StrategyEntity", "Strategy alpha", { name: "alpha", tier: 1 }, "mlflow", 3, at),
    object("obj:strategy:beta", "horizon.products.strategist::StrategyEntity", "Strategy beta", { name: "beta", tier: 2 }, "mlflow", 4, at),
    object("obj:host:local", "horizon.interaction::HorizonHost", "Local host", { host: "local_operator" }, "fixture-model", 5, at),
    object("obj:observer:operator", "horizon.interaction::ObserverActor", "Operator", { role: "NavigatingObserver" }, "os-session", 6, at),
  ];
}

/** The fixture's operational links. Two relation types, so traversal spans two relationships. */
export function fixtureLinks(observedAt: string): OperationalLinkV1[] {
  const at = observedAt;
  return [
    { schema: OBJECT_SCHEMA, graph: "operational", relation_type: "journey.covers", from: "obj:journey:j01", to: "obj:strategy:alpha", provenance: provenance("fixture-model", 10, at) },
    { schema: OBJECT_SCHEMA, graph: "operational", relation_type: "journey.covers", from: "obj:journey:j02", to: "obj:strategy:beta", provenance: provenance("fixture-model", 11, at) },
    { schema: OBJECT_SCHEMA, graph: "operational", relation_type: "entity.governed_by", from: "obj:strategy:alpha", to: "obj:strategy:beta", provenance: provenance("fixture-model", 12, at) },
    { schema: OBJECT_SCHEMA, graph: "operational", relation_type: "host.serves", from: "obj:host:local", to: "obj:observer:operator", provenance: provenance("fixture-model", 13, at) },
    { schema: OBJECT_SCHEMA, graph: "operational", relation_type: "host.serves", from: "obj:host:local", to: "obj:journey:j01", provenance: provenance("fixture-model", 14, at) },
  ];
}

export function fixtureLineage(observedAt: string): LineageEdgeV1[] {
  const at = observedAt;
  return [{ schema: OBJECT_SCHEMA, graph: "lineage", observation_ref: "obs:mlflow:run-1", object_ref: "obj:strategy:alpha", provenance: provenance("mlflow", 20, at) }];
}

/**
 * Record the fixture into a store: objects first, then links (which require resolvable
 * endpoints), then lineage — the order the recorder enforces.
 */
export async function seedOperationalFixture(
  store: DurableStore,
  worldRef = FIXTURE_WORLD_REF,
  tenant = "local:test",
): Promise<{ readonly world: DeclaredWorld; readonly objects: number; readonly links: number }> {
  const world = declaredWorld(worldRef, tenant);
  // Fail loudly if the pinned world stops declaring a fixture type: the fixture is a claim about
  // *this* world, and a silent fallback would hide a world change.
  for (const type of FIXTURE_TYPES) {
    if (!world.types.has(type)) throw new Error(`fixture type ${type} is not declared in ${worldRef}`);
  }

  const at = "2026-10-20T12:00:00.000Z";
  const objects = fixtureObjects(at);
  for (const entry of objects) await recordObject(store, world, worldRef, { object: entry });
  const links = fixtureLinks(at);
  for (const link of links) await recordLink(store, world, worldRef, { link });
  for (const edge of fixtureLineage(at)) await recordLineage(store, world, worldRef, { edge });

  return { world, objects: objects.length, links: links.length };
}


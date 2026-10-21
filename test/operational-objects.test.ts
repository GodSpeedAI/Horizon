/**
 * T06 positive evidence (PE-01 … PE-10), one test per `.agents/prereg/horizon/T06.prereg.yaml`
 * `positive_expectations` entry.
 *
 * Every test here reads a *real* Cognate SQLite store: the fixture commits durable events and the
 * queries go back through `readProjectionSnapshot`. Nothing is faked at the store boundary, so a
 * projection that never folded its events fails rather than returning fixture-shaped answers.
 *
 * What these do NOT establish: that any external system produced the events (see the prereg's
 * `known_confounds`). The connector names are fixture-attributed, and the integration level says
 * `fixture` for exactly that reason.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DurableStore } from "@godspeedai/cognate-events";
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import { ProjectionRunner } from "@godspeedai/cognate-projections";
import { checkpointOf, queryObjects, readProjection, traverse } from "../src/adapters/operational-objects.ts";
import { operationalObjectsProjection } from "../src/projections/operational-objects.ts";
import { loadWorld } from "../src/adapters/semantic.ts";
import { parseCheckpointRef } from "../src/domain/operational.ts";
import { FIXTURE_WORLD_REF, seedOperationalFixture } from "./support/operational-fixture.ts";

const roots: string[] = [];
const stores: DurableStore[] = [];

afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function storeAt(name = "operational"): DurableStore {
  const root = mkdtempSync(join(tmpdir(), "t06-"));
  roots.push(root);
  const store = openSqliteStore({ path: join(root, `${name}.sqlite`) });
  stores.push(store);
  return store;
}

/** A store with the fixture recorded, plus the declared world it was checked against. */
async function seeded() {
  const store = storeAt();
  const { world } = await seedOperationalFixture(store);
  return { store, world };
}

/** The observer who may see everything the fixture contains. */
const FULL_SCOPE = {
  observer_ref: "os:operator:1000",
  allowed_semantic_refs: [
    "horizon.interaction::CanonicalJourney",
    "horizon.products.strategist::StrategyEntity",
    "horizon.interaction::HorizonHost",
    "horizon.interaction::ObserverActor",
  ],
} as const;

describe("T06 operational object layer — positive evidence (PE-01…PE-10)", () => {
  test("PE-01 objects keep a DomainForge semantic_ref distinct from their object_ref, and one object is projected once", async () => {
    const { store, world } = await seeded();
    const result = await queryObjects(store, world, FIXTURE_WORLD_REF, {}, { scope: FULL_SCOPE });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Every object names the declared type it instantiates, and that type is not its own ref.
    for (const object of result.items) {
      expect(object.semantic_ref).toContain("::");
      expect(object.object_ref.startsWith("obj:")).toBe(true);
      expect(object.object_ref).not.toBe(object.semantic_ref);
      expect(world.types.has(object.semantic_ref)).toBe(true);
    }
    // Two objects of the same semantic type remain distinguishable by operational identity.
    const strategies = result.items.filter((object) => object.semantic_ref === "horizon.products.strategist::StrategyEntity");
    expect(strategies.length).toBe(2);
    expect(new Set(strategies.map((object) => object.object_ref)).size).toBe(2);
    // One row per object: the projection is keyed, not appended to.
    expect(new Set(result.items.map((object) => object.object_ref)).size).toBe(result.items.length);
  });

  test("PE-02 every link names a declared relation type and both endpoints resolve to projected objects", async () => {
    const { store, world } = await seeded();
    const read = await readProjection(store, world, FIXTURE_WORLD_REF);
    expect(read.ok).toBe(true);
    if (!read.ok) return;

    expect(read.view.links.length).toBe(5);
    const projected = new Set(read.view.objects.map((object) => object.object_ref));
    for (const link of read.view.links) {
      expect(world.relations.has(link.relation_type)).toBe(true);
      expect(projected.has(link.from)).toBe(true);
      expect(projected.has(link.to)).toBe(true);
    }
    // The fixture uses genuinely different relationships, not one type repeated.
    expect(new Set(read.view.links.map((link) => link.relation_type)).size).toBeGreaterThanOrEqual(2);
  });

  test("PE-03 every object carries product, connector, checkpoint_ref, integration_level and checkpoint age", async () => {
    const { store, world } = await seeded();
    const result = await queryObjects(store, world, FIXTURE_WORLD_REF, {}, { scope: FULL_SCOPE });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const object of result.items) {
      expect(object.provenance.product).toBeTruthy();
      expect(object.provenance.connector).toBeTruthy();
      expect(object.provenance.integration_level).toBe("fixture");
      expect(object.provenance.checkpoint_ref).toMatch(/^cognate:\d+$/);
      // Checkpoint age is computable: the observation time is present and parseable.
      expect(Number.isNaN(Date.parse(object.provenance.observed_at))).toBe(false);
    }
    // The connector is the one the object was recorded through, not a default.
    expect(result.items.find((object) => object.object_ref === "obj:strategy:alpha")?.provenance.connector).toBe("mlflow");
    expect(result.items.find((object) => object.object_ref === "obj:host:local")?.provenance.connector).toBe("fixture-model");
  });

  test("PE-04 checkpoint_ref names the Cognate commit position plus the projection names and versions read", async () => {
    const { store, world } = await seeded();
    const result = await queryObjects(store, world, FIXTURE_WORLD_REF, {}, { scope: FULL_SCOPE });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const checkpoint = parseCheckpointRef(result.checkpoint_ref);
    expect(checkpoint).not.toBeNull();
    expect(checkpoint?.position).toBeGreaterThan(0);
    expect(checkpoint?.projections).toEqual([{ name: "horizon.operational-objects", version: "1.1.0" }]);
    // The same checkpoint is answerable; a different one is refused rather than answered.
    const at = await queryObjects(store, world, FIXTURE_WORLD_REF, {}, { scope: FULL_SCOPE, checkpoint_ref: result.checkpoint_ref });
    expect(at.ok).toBe(true);
    const stale = await queryObjects(store, world, FIXTURE_WORLD_REF, {}, { scope: FULL_SCOPE, checkpoint_ref: "cognate-checkpoint/1@1;horizon.operational-objects@1.0.0" });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.code).toBe("checkpoint");
  });

  test("PE-05 the same query from two observers with different authority yields different, correctly-scoped sets", async () => {
    const { store, world } = await seeded();
    const everything = await queryObjects(store, world, FIXTURE_WORLD_REF, {}, { scope: FULL_SCOPE });
    const narrow = await queryObjects(store, world, FIXTURE_WORLD_REF, {}, {
      scope: { observer_ref: "os:operator:2000", allowed_semantic_refs: ["horizon.products.strategist::StrategyEntity"] },
    });
    expect(everything.ok).toBe(true);
    expect(narrow.ok).toBe(true);
    if (!everything.ok || !narrow.ok) return;

    expect(narrow.items.length).toBeLessThan(everything.items.length);
    for (const object of narrow.items) expect(object.semantic_ref).toBe("horizon.products.strategist::StrategyEntity");
    // Scope is per query, not ambient: each answer names the observer it was computed for.
    expect(narrow.observer_state.observer_ref).toBe("os:operator:2000");
    expect(everything.observer_state.observer_ref).toBe("os:operator:1000");
  });

  test("PE-06 traversal is deterministic and bounded across two relationships (journey.covers + entity.governed_by)", async () => {
    const { store, world } = await seeded();
    const request = {
      from: ["obj:journey:j01"],
      relation_types: ["journey.covers" as const, "entity.governed_by" as const],
      max_depth: 3,
      max_objects: 10,
    };
    const first = await traverse(store, world, FIXTURE_WORLD_REF, request, { scope: FULL_SCOPE });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // j01 -covers-> alpha -governed_by-> beta: two hops, two different relation types.
    expect(first.items.map((object) => object.object_ref)).toEqual(["obj:journey:j01", "obj:strategy:alpha", "obj:strategy:beta"]);
    expect(new Set((first.steps ?? []).map((step) => step.relation_type))).toEqual(new Set(["journey.covers", "entity.governed_by"]));

    // Deterministic: an identical request returns an identical serialization.
    const second = await traverse(store, world, FIXTURE_WORLD_REF, request, { scope: FULL_SCOPE });
    expect(second.ok).toBe(true);
    if (second.ok) expect(JSON.stringify(second)).toBe(JSON.stringify(first));

    // Depth is a real bound: at depth 1 the search stops before beta.
    const shallow = await traverse(store, world, FIXTURE_WORLD_REF, { ...request, max_depth: 1 }, { scope: FULL_SCOPE });
    expect(shallow.ok).toBe(true);
    if (shallow.ok) expect(shallow.items.map((object) => object.object_ref)).toEqual(["obj:journey:j01", "obj:strategy:alpha"]);
  });

  test("PE-07 empty, no-match, denied, blocked and unavailable are five distinct outcomes", async () => {
    // An empty projection, with a seeded store beside it so the world is identical.
    const emptyStore = storeAt("empty");
    const { store, world } = await seeded();
    const empty = await queryObjects(emptyStore, world, FIXTURE_WORLD_REF, {}, { scope: FULL_SCOPE });
    expect(empty.ok).toBe(true);
    if (empty.ok) expect(empty.status).toBe("empty");

    const noMatch = await queryObjects(store, world, FIXTURE_WORLD_REF, { fields: { name: "does-not-exist" } }, { scope: FULL_SCOPE });
    expect(noMatch.ok).toBe(true);
    if (noMatch.ok) expect(noMatch.status).toBe("no-match");

    const denied = await queryObjects(store, world, FIXTURE_WORLD_REF, { semantic_refs: ["horizon.interaction::HorizonHost"] }, {
      scope: { observer_ref: "os:operator:3000", allowed_semantic_refs: ["horizon.products.strategist::StrategyEntity"] },
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.status).toBe("denied");

    const unavailable = await queryObjects(store, world, FIXTURE_WORLD_REF, {}, {
      scope: { ...FULL_SCOPE, unavailable_sources: [{ source: "mlflow", reason: "tracking server unreachable" }] },
    });
    expect(unavailable.ok).toBe(false);
    if (!unavailable.ok) expect(unavailable.status).toBe("unavailable");

    // Blocked does not pretend to be empty: the readable objects are returned and the degradation
    // is named, so a partial answer cannot be mistaken for a complete one.
    const blocked = await queryObjects(store, world, FIXTURE_WORLD_REF, {}, {
      scope: { ...FULL_SCOPE, blocked_connectors: [{ connector: "mlflow", reason: "connector not authorized yet" }] },
    });
    expect(blocked.ok).toBe(true);
    if (blocked.ok) {
      expect(blocked.status).toBe("ok");
      expect(blocked.degraded).toEqual([{ connector: "mlflow", reason: "connector not authorized yet" }]);
    }
  });

  test("PE-08 a stale or mismatched projection version reports rebuild_required instead of reinterpreting state", async () => {
    const { store, world } = await seeded();
    const before = await readProjection(store, world, FIXTURE_WORLD_REF);
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    const position = before.view.checkpoint?.position ?? 0;
    expect(position).toBeGreaterThan(0);

    // A deployment of new projection code leaves a checkpoint under the old version behind.
    await store.commitProjection({ name: "horizon.operational-objects", version: "0.9.0", fromPosition: position, toPosition: position, writes: [] });

    const after = await readProjection(store, world, FIXTURE_WORLD_REF);
    expect(after.ok).toBe(false);
    if (!after.ok) {
      expect(after.status).toBe("rebuild_required");
      expect(after.reason).toContain("0.9.0");
    }

    // Recovery is explicit and reaches the same state again, from the durable events.
    const runner = new ProjectionRunner(store, operationalObjectsProjection);
    const rebuilt = await runner.rebuild();
    expect(rebuilt.status).toBe("ok");
    const recovered = await readProjection(store, world, FIXTURE_WORLD_REF);
    expect(recovered.ok).toBe(true);
    if (recovered.ok) {
      expect(recovered.view.checkpoint?.version).toBe("1.1.0");
      expect(recovered.view.objects.map((object) => object.object_ref)).toEqual(before.view.objects.map((object) => object.object_ref));
    }
  });

  test("PE-09 the semantic, operational and lineage graphs keep distinct identities and semantics", async () => {
    const { store, world } = await seeded();
    const read = await readProjection(store, world, FIXTURE_WORLD_REF);
    expect(read.ok).toBe(true);
    if (!read.ok) return;

    // Every link declares itself operational, and no semantic import edge is in the link set.
    expect(read.view.links.every((link) => link.graph === "operational")).toBe(true);
    expect(read.view.links.some((link) => (link.relation_type as string) === "flow.from")).toBe(false);

    // Lineage is recorded, and is not traversable as an operational link.
    const traversed = await traverse(store, world, FIXTURE_WORLD_REF, {
      from: ["obj:strategy:alpha"],
      relation_types: ["entity.lineage_of"],
      max_depth: 2,
      max_objects: 10,
    }, { scope: FULL_SCOPE });
    expect(traversed.ok).toBe(true);
    if (traversed.ok) expect(traversed.items.map((object) => object.object_ref)).toEqual(["obj:strategy:alpha"]);

    // The semantic import graph is a different, larger structure with its own identity.
    const semanticRelations = loadWorld(FIXTURE_WORLD_REF).projection.relations;
    expect(semanticRelations.length).toBeGreaterThan(read.view.links.length);
    expect(semanticRelations.some((relation) => relation.type === "flow.from")).toBe(true);
  });

  test("PE-10 focus, object-set selection, observer and world are carried on the result for the next surface", async () => {
    const { store, world } = await seeded();
    const result = await queryObjects(store, world, FIXTURE_WORLD_REF, {}, {
      scope: FULL_SCOPE,
      object_set: ["obj:strategy:alpha", "obj:journey:j01"],
      focus_ref: "obj:strategy:alpha",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.observer_state).toEqual({
      observer_ref: "os:operator:1000",
      world_ref: FIXTURE_WORLD_REF,
      checkpoint_ref: result.checkpoint_ref,
      object_set: ["obj:strategy:alpha", "obj:journey:j01"],
      focus_ref: "obj:strategy:alpha",
    });

    // A refused query still carries the observer state: the refusal is about the scope, not the
    // observer, and the next surface needs to know where it was.
    const denied = await queryObjects(store, world, FIXTURE_WORLD_REF, { semantic_refs: ["horizon.interaction::HorizonHost"] }, {
      scope: { observer_ref: "os:operator:3000", allowed_semantic_refs: ["horizon.products.strategist::StrategyEntity"] },
      focus_ref: "obj:host:local",
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.observer_state.focus_ref).toBe("obj:host:local");
      expect(denied.observer_state.observer_ref).toBe("os:operator:3000");
    }
  });
});


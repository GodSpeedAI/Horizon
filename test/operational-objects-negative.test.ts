/**
 * T06 negative evidence (NE-01 … NE-09), one test per `.agents/prereg/horizon/T06.prereg.yaml`
 * `negative_expectations` entry.
 *
 * Each test performs the prereg's *attack* and asserts the prereg's *expected* refusal. Where the
 * refusal is a status, the test asserts the status and not merely `ok === false`, because "failed"
 * is not the property: `denied`, `unavailable` and `blocked` are different facts.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DurableStore } from "@godspeedai/cognate-events";
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import { ProjectionRunner } from "@godspeedai/cognate-projections";
import { OperationalObjectError, queryObjects, readProjection, recordLink, recordObject, traverse } from "../src/adapters/operational-objects.ts";
import { OBJECT_SCHEMA } from "../src/domain/operational.ts";
import { operationalObjectsProjection } from "../src/projections/operational-objects.ts";
import { FIXTURE_WORLD_REF, fixtureLinks, fixtureObjects, seedOperationalFixture } from "./support/operational-fixture.ts";

const roots: string[] = [];
const stores: DurableStore[] = [];

afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function storeAt(name = "negative"): DurableStore {
  const root = mkdtempSync(join(tmpdir(), "t06-neg-"));
  roots.push(root);
  const store = openSqliteStore({ path: join(root, `${name}.sqlite`) });
  stores.push(store);
  return store;
}

async function seeded() {
  const store = storeAt();
  const { world } = await seedOperationalFixture(store);
  return { store, world };
}

const FULL_SCOPE = {
  observer_ref: "os:operator:1000",
  allowed_semantic_refs: [
    "horizon.interaction::CanonicalJourney",
    "horizon.products.strategist::StrategyEntity",
    "horizon.interaction::HorizonHost",
    "horizon.interaction::ObserverActor",
  ],
} as const;

describe("T06 operational object layer — negative evidence (NE-01…NE-09)", () => {
  test("NE-01 a denied observer learns nothing: no object, no count, no type in the refusal", async () => {
    const { store, world } = await seeded();
    const refusal = await queryObjects(store, world, FIXTURE_WORLD_REF, { semantic_refs: ["horizon.interaction::HorizonHost"] }, {
      scope: { observer_ref: "os:operator:4000", allowed_semantic_refs: [] },
    });
    expect(refusal.ok).toBe(false);
    if (refusal.ok) return;
    expect(refusal.status).toBe("denied");

    // The only permitted disclosure is that the scope covers none of the requested types. No
    // object ref, no count, and no field naming an object the observer may not see.
    const serialized = JSON.stringify(refusal);
    expect(serialized).not.toMatch(/obj:/);
    expect(serialized).not.toMatch(/\d+\s+(objects?|rows?)/);
    expect(serialized).not.toContain("obj:host:local");
  });

  test("NE-02 a down source is unavailable and a blocked connector is blocked, never empty or no-match", async () => {
    const { store, world } = await seeded();
    const down = await queryObjects(store, world, FIXTURE_WORLD_REF, {}, {
      scope: { ...FULL_SCOPE, unavailable_sources: [{ source: "mlflow", reason: "tracking server unreachable" }] },
    });
    expect(down.ok).toBe(false);
    if (!down.ok) {
      expect(down.status).toBe("unavailable");
      expect(down.status).not.toBe("empty");
      expect(down.status).not.toBe("no-match");
      // The refusal names the responsible source.
      expect(down.reason).toContain("mlflow");
    }

    // A blocked connector is visible on the answer's `degraded` list rather than being reported
    // as an absence of objects: the objects that are readable are still returned.
    const blocked = await queryObjects(store, world, FIXTURE_WORLD_REF, {}, {
      scope: { ...FULL_SCOPE, blocked_connectors: [{ connector: "mlflow", reason: "connector blocked pending authorization" }] },
    });
    expect(blocked.ok).toBe(true);
    if (blocked.ok) {
      expect(blocked.degraded.map((entry) => entry.connector)).toEqual(["mlflow"]);
      expect(blocked.items.length).toBeGreaterThan(0);
    }
  });

  test("NE-03 an unbounded traversal is refused before any work, naming the missing bound", async () => {
    const { store, world } = await seeded();
    const unbounded = await traverse(store, world, FIXTURE_WORLD_REF, {
      from: ["obj:host:local"],
      relation_types: ["host.serves"],
    }, { scope: FULL_SCOPE });
    expect(unbounded.ok).toBe(false);
    if (!unbounded.ok) {
      expect(unbounded.code).toBe("limit");
      expect(unbounded.reason).toContain("max_depth");
      expect(unbounded.reason).toContain("max_objects");
    }

    // An over-tight object bound is refused, not silently truncated.
    const overBound = await traverse(store, world, FIXTURE_WORLD_REF, {
      from: ["obj:host:local"],
      relation_types: ["host.serves"],
      max_depth: 2,
      max_objects: 2,
    }, { scope: FULL_SCOPE });
    expect(overBound.ok).toBe(false);
    if (!overBound.ok) expect(overBound.code).toBe("limit");
  });


  test("NE-04 an undeclared relation type and a dangling endpoint are both refused at record time", async () => {
    const { store, world } = await seeded();
    const at = "2026-10-20T12:00:00.000Z";

    // Undeclared relation type: refused by the recorder, so no half-link is ever stored.
    await expect(
      recordLink(store, world, FIXTURE_WORLD_REF, {
        link: {
          schema: OBJECT_SCHEMA,
          graph: "operational",
          relation_type: "flow.from" as never,
          from: "obj:journey:j01",
          to: "obj:strategy:alpha",
          provenance: { product: "horizon", connector: "fixture-model", integration_level: "fixture", checkpoint_ref: "cognate:30", observed_at: at },
        },
      }),
    ).rejects.toThrow(OperationalObjectError);

    // Dangling endpoint: refused, and nothing is written for it.
    const before = await readProjection(store, world, FIXTURE_WORLD_REF);
    expect(before.ok).toBe(true);
    await expect(
      recordLink(store, world, FIXTURE_WORLD_REF, { link: { ...fixtureLinks(at)[0]!, from: "obj:journey:nonexistent" } }),
    ).rejects.toThrow(/not a projected object/);
    const after = await readProjection(store, world, FIXTURE_WORLD_REF);
    expect(after.ok).toBe(true);
    if (before.ok && after.ok) expect(after.view.links.length).toBe(before.view.links.length);
  });

  test("NE-05 a mismatched checkpoint is refused and a changed projection version reports rebuild_required, never answered", async () => {
    const { store, world } = await seeded();
    const read = await readProjection(store, world, FIXTURE_WORLD_REF);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const position = read.view.checkpoint?.position ?? 0;

    // A checkpoint that is not the projection's state yields no result set at all.
    const mismatch = await queryObjects(store, world, FIXTURE_WORLD_REF, {}, { scope: FULL_SCOPE, checkpoint_ref: "cognate-checkpoint/1@1;horizon.operational-objects@1.0.0" });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.code).toBe("checkpoint");

    // A version change without a rebuild is reported, and the stored rows are not reinterpreted
    // under the new version: the read refuses rather than returning them.
    await store.commitProjection({ name: "horizon.operational-objects", version: "2.0.0", fromPosition: position, toPosition: position, writes: [] });
    const afterBump = await readProjection(store, world, FIXTURE_WORLD_REF);
    expect(afterBump.ok).toBe(false);
    if (!afterBump.ok) expect(afterBump.status).toBe("rebuild_required");
  });

  test("NE-06 a semantic import edge and a lineage record are refused by the operational link set", async () => {
    const { store, world } = await seeded();
    const at = "2026-10-20T12:00:00.000Z";

    // A semantic import edge submitted as an operational link: its type is not in the operational
    // vocabulary, so the recorder refuses it by kind.
    await expect(
      recordLink(store, world, FIXTURE_WORLD_REF, { link: { ...fixtureLinks(at)[0]!, relation_type: "flow.to" as never } }),
    ).rejects.toThrow(/not declared/);

    // A lineage record submitted as an operational link: the graph marker itself is refused.
    await expect(
      recordLink(store, world, FIXTURE_WORLD_REF, { link: { ...fixtureLinks(at)[0]!, graph: "lineage" as never } }),
    ).rejects.toThrow(/is not an operational link/);

    // And no semantic import edge appears in the link set afterwards.
    const read = await readProjection(store, world, FIXTURE_WORLD_REF);
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.view.links.some((link) => (link.relation_type as string).startsWith("flow."))).toBe(false);
  });

  test("NE-07 an object for an undeclared semantic type or the wrong world is refused, leaving no orphan", async () => {
    const { store, world } = await seeded();
    const at = "2026-10-20T12:00:00.000Z";
    const orphan = { ...fixtureObjects(at)[0]!, object_ref: "obj:journey:orphan" as never, semantic_ref: "horizon.interaction::NotDeclared" as never };

    await expect(recordObject(store, world, FIXTURE_WORLD_REF, { object: orphan })).rejects.toThrow(/not declared/);

    // A record whose world does not match the declared world is refused too: an object may not be
    // attributed to the wrong world.
    const wrongWorld = `world:horizon@sha256:${"0".repeat(64)}`;
    await expect(
      recordObject(store, world, wrongWorld, { object: { ...fixtureObjects(at)[1]!, object_ref: "obj:journey:wrong-world" as never } }),
    ).rejects.toThrow();

    const read = await readProjection(store, world, FIXTURE_WORLD_REF);
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.view.objects.some((object) => object.object_ref === "obj:journey:orphan")).toBe(false);
  });

  test("NE-08 a result set is never assembled from rows of two checkpoint positions", async () => {
    const { store, world } = await seeded();
    const read = await readProjection(store, world, FIXTURE_WORLD_REF);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    // The checkpoint and the rows came from one statement, which is what makes the claim true.
    expect(read.view.consistent).toBe(true);

    // Folding more events moves the checkpoint; a request at the old one is refused rather than
    // quietly returning the newer rows under the older checkpoint.
    const old = await queryObjects(store, world, FIXTURE_WORLD_REF, {}, { scope: FULL_SCOPE });
    expect(old.ok).toBe(true);
    if (!old.ok) return;
    await recordObject(store, world, FIXTURE_WORLD_REF, {
      object: { ...fixtureObjects("2026-10-20T13:00:00.000Z")[0]!, object_ref: "obj:journey:later" as never },
    });

    const mixed = await queryObjects(store, world, FIXTURE_WORLD_REF, {}, { scope: FULL_SCOPE, checkpoint_ref: old.checkpoint_ref });
    expect(mixed.ok).toBe(false);
    if (!mixed.ok) expect(mixed.code).toBe("checkpoint");
  });

  test("NE-09 the same events rebuilt from position zero produce identical results at the same checkpoint", async () => {
    const { store, world } = await seeded();
    const before = await queryObjects(store, world, FIXTURE_WORLD_REF, {}, { scope: FULL_SCOPE });
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    // The fixture must actually exercise the order: a single-row answer would make the determinism
    // assertions below vacuous.
    expect(before.items.length).toBeGreaterThanOrEqual(2);

    // The mechanism behind the guarantee, asserted directly. Today's store already returns rows in
    // code-point key order, so a rebuild reproduces results even for an implementation that did not
    // sort — which is why a rebuild comparison alone cannot detect an order-dependent query. The
    // ordering guarantee NE-09 needs is the explicit sort, so this asserts it where it lives: two
    // orderings of the same rows must produce the same answer.
    const rows = (await store.listProjection("horizon.operational-objects"))
      .filter((row) => row.key.startsWith("object/"))
      .map((row) => row.value as { object_ref: string });
    const references = rows.map((row) => row.object_ref);
    expect(references.length).toBe(before.items.length);
    // Whatever order the store hands back, the query's answer is the same lexicographic sequence.
    // An implementation that merely echoes row order fails here for any store whose row order is
    // not already `object_ref` order — which the store is free to change.
    expect(before.items.map((object) => object.object_ref)).toEqual([...references].sort());

    const runner = new ProjectionRunner(store, operationalObjectsProjection);
    const rebuilt = await runner.rebuild();
    expect(rebuilt.status).toBe("ok");

    const after = await queryObjects(store, world, FIXTURE_WORLD_REF, {}, { scope: FULL_SCOPE });
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.checkpoint_ref).toBe(before.checkpoint_ref);
    expect(after.items.map((object) => object.object_ref)).toEqual(before.items.map((object) => object.object_ref));
    expect(JSON.stringify(after.items)).toBe(JSON.stringify(before.items));
  });
});



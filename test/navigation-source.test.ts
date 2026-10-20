/**
 * The T07 controller over a real T06 read.
 *
 * The store is a real Cognate SQLite store and the objects come back through
 * `readProjectionSnapshot`, so this is not a controller-only fixture. It is still fixture-produced
 * data: the integration level stays `fixture` (T06's known confound), and no consequential move is
 * derived because no SEA-Forge evaluation exists at T07.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DurableStore } from "@godspeedai/cognate-events";
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import { checkpointOf, readProjection } from "../src/adapters/operational-objects.ts";
import { deriveOperationalNavigation, isOptionalOnly } from "../src/adapters/navigation.ts";
import { buildNavigationFrame } from "../src/domain/navigation.ts";
import { FIXTURE_WORLD_REF, seedOperationalFixture } from "./support/operational-fixture.ts";

const roots: string[] = [];
const stores: DurableStore[] = [];

afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function seeded() {
  const root = mkdtempSync(join(tmpdir(), "t07-source-"));
  roots.push(root);
  const store = openSqliteStore({ path: join(root, "navigation.sqlite") });
  stores.push(store);
  const { world } = await seedOperationalFixture(store);
  const read = await readProjection(store, world, FIXTURE_WORLD_REF);
  if (!read.ok) throw new Error(`projection read failed: ${read.reason}`);
  return { world, view: read.view, checkpoint: checkpointOf(read.view) };
}

const BASE = {
  observer_ref: "os:operator:1000",
  tenant_ref: "tenant:godspeed",
  world_ref: FIXTURE_WORLD_REF,
  case_ref: "case:alpha",
  purpose: "keep the strategy inside its declared direction",
  direction_ref: "direction:alpha",
  direction_statement: "stay inside the declared range",
} as const;

describe("T07 navigation over the T06 projection", () => {
  test("derives an optional-only case and only read-only inspection moves from real rows", async () => {
    const { world, view, checkpoint } = await seeded();
    const navigation = deriveOperationalNavigation({
      ...BASE,
      checkpoint_ref: checkpoint,
      focus_ref: "obj:strategy:alpha",
      projection: view,
      declared: world,
    });

    expect(isOptionalOnly(navigation)).toBe(true);
    expect(navigation.case.ontology).toBeNull();
    expect(navigation.case.authoritative_fact_refs.length).toBeGreaterThan(1);
    expect(navigation.candidates.length).toBe(2);
    for (const candidate of navigation.candidates) {
      expect(candidate.reversibility).toBe("read_only");
      expect(candidate.gates.authority.authority_outcome).toBe("not_applicable");
    }

    const frame = buildNavigationFrame({
      frame_id: "frame-source-1",
      revision: 1,
      context: {
        observer_ref: BASE.observer_ref,
        tenant_ref: BASE.tenant_ref,
        world_ref: BASE.world_ref,
        checkpoint_ref: checkpoint,
        checkpoint_unknown_reason: null,
        focus_ref: "obj:strategy:alpha",
        case_ref: BASE.case_ref,
      },
      case: navigation.case,
      possible_operations: navigation.possible_operations,
      candidates: navigation.candidates,
    });

    expect(frame.decision).toBe("owner_choice");
    expect(frame.primary_choice_ref).toBeNull();
    expect(frame.evidence_refs).toContain(checkpoint);
    expect(frame.evidence_refs).toContain("obj:strategy:alpha");
    expect(frame.reasons.join(" ")).toContain("optional choices");
  });

  test("an absent focus is a material operational deviation, not a fabricated repair", async () => {
    const { world, view, checkpoint } = await seeded();
    const navigation = deriveOperationalNavigation({
      ...BASE,
      checkpoint_ref: checkpoint,
      focus_ref: "obj:strategy:missing",
      projection: view,
      declared: world,
    });

    expect(navigation.case.optional_only).toBe(false);
    expect(navigation.case.material_deviations).toHaveLength(1);
    expect(navigation.case.material_deviations[0]?.fact_ref).toContain("focus-missing");
    expect(navigation.candidates).toHaveLength(0);

    const frame = buildNavigationFrame({
      frame_id: "frame-source-2",
      revision: 1,
      context: {
        observer_ref: BASE.observer_ref,
        tenant_ref: BASE.tenant_ref,
        world_ref: BASE.world_ref,
        checkpoint_ref: checkpoint,
        checkpoint_unknown_reason: null,
        focus_ref: "obj:strategy:missing",
        case_ref: BASE.case_ref,
      },
      case: navigation.case,
      possible_operations: navigation.possible_operations,
      candidates: navigation.candidates,
    });
    expect(frame.decision).toBe("no_affordance");
    expect(frame.primary_choice_ref).toBeNull();
    expect(frame.choices.every((choice) => choice.status === "available")).toBe(true);
    expect(frame.choices.every((choice) => choice.operation_ref.startsWith("horizon.navigation."))).toBe(true);
  });
});

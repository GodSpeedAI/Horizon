/**
 * T08 over the real T06 read: the terminal does not get a hand-built navigation frame in this
 * test. It gets one derived from a Cognate projection snapshot, then emits the controller's
 * typed inspect intent. The integration level remains `fixture`; this is not live settlement.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DurableStore } from "@godspeedai/cognate-events";
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import { checkpointOf, readProjection } from "../src/adapters/operational-objects.ts";
import { buildOperationalFrame } from "../src/adapters/navigation.ts";
import { applySequential, openSequential } from "../src/ui/sequential/controller.ts";
import { FIXTURE_WORLD_REF, seedOperationalFixture } from "./support/operational-fixture.ts";

const roots: string[] = [];
const stores: DurableStore[] = [];

afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function seeded() {
  const root = mkdtempSync(join(tmpdir(), "t08-source-"));
  roots.push(root);
  const store = openSqliteStore({ path: join(root, "terminal.sqlite") });
  stores.push(store);
  const { world } = await seedOperationalFixture(store);
  const read = await readProjection(store, world, FIXTURE_WORLD_REF);
  if (!read.ok) throw new Error(`projection read failed: ${read.reason}`);
  return { world, view: read.view, checkpoint: checkpointOf(read.view) };
}

describe("T08 sequential renderer over the operational projection", () => {
  test("opens a read-only inspection decision from real rows and emits one typed intent", async () => {
    const { world, view, checkpoint } = await seeded();
    const { frame } = buildOperationalFrame({
      observer_ref: "os:operator:1000",
      tenant_ref: "tenant:godspeed",
      world_ref: FIXTURE_WORLD_REF,
      checkpoint_ref: checkpoint,
      focus_ref: "obj:strategy:alpha",
      case_ref: "case:alpha",
      purpose: "keep the strategy inside its declared direction",
      direction_ref: "direction:alpha",
      direction_statement: "stay inside the declared range",
      projection: view,
      declared: world,
    });

    expect(frame.schema).toBe("horizon.navigation/2");
    expect(frame.choices.find((choice) => choice.operation_ref === "horizon.inspect.focus")?.selectable).toBe(true);
    expect(frame.choices.filter((choice) => choice.kind === "move")).toHaveLength(0);

    const session = openSequential(frame, { source: "operational-projection" });
    expect(session.prompt.kind).toBe("choice");
    const transition = applySequential(session, {
      type: "select",
      choice_id: "horizon.inspect.focus",
      frame_id: frame.frame_id,
      revision: frame.revision,
    });
    expect(transition.ok).toBe(true);
    expect(transition.intent?.kind).toBe("inspect");
    expect(transition.intent?.operation_ref).toBe("horizon.inspect.focus");
    expect(transition.intent?.simulated).toBe(false);
    expect(frame.authority.grants_authority).toBe(false);
  });

  test("an absent focus is an informative dead end, not a fabricated action", async () => {
    const { world, view, checkpoint } = await seeded();
    const { frame } = buildOperationalFrame({
      observer_ref: "os:operator:1000",
      tenant_ref: "tenant:godspeed",
      world_ref: FIXTURE_WORLD_REF,
      checkpoint_ref: checkpoint,
      focus_ref: "obj:strategy:missing",
      case_ref: "case:missing",
      purpose: "keep the strategy inside its declared direction",
      direction_ref: "direction:alpha",
      direction_statement: "stay inside the declared range",
      projection: view,
      declared: world,
    });
    const session = openSequential(frame);
    expect(session.prompt.kind).toBe("choice");
    if (session.prompt.kind !== "choice") return;
    expect(session.prompt.blocked).toHaveLength(0);
    expect(session.prompt.body.join(" ")).toContain("material deviation");
    const enabledMoves = session.prompt.options.filter(
      (option) => option.operation_ref !== undefined && !option.disabled && !option.operation_ref.startsWith("horizon.navigation."),
    );
    expect(enabledMoves).toHaveLength(0);
  });
});

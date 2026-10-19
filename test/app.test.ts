import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Json } from "@godspeedai/cognate-events";
import { createApplication, type HorizonApplication } from "../src/app.ts";
import { buildStructuralFrame } from "../src/domain/frame.ts";
import { projectFrame } from "../src/ui/surface.ts";

const PINNED =
  "world:horizon@sha256:6c18d6a608bd9d83e6aa354d5a8cc804009ca208562021c1736ee429412309f0";

let application: HorizonApplication | undefined;

afterAll(async () => {
  await application?.close();
});

describe("structural walking skeleton", () => {
  test("boots the canonical world, real runtime, projection and HTTP health", async () => {
    const storePath = join(mkdtempSync(join(tmpdir(), "horizon-app-")), "app.sqlite");
    application = await createApplication({ storePath });
    const { world, runtime, caller } = application;

    expect(world.worldRef).toBe(PINNED);
    expect(world.cognateWorldRef.startsWith("world:horizon@sha256:")).toBe(true);
    expect(world.objectCount).toBeGreaterThan(0);
    expect(world.relationCount).toBeGreaterThan(0);
    expect(statSync(storePath).isFile()).toBe(true);

    const semantic = await runtime.runtime.service.invoke(caller, {
      capability: "horizon.semantics.world",
      input: {},
      idempotencyKey: "t04-semantic",
    });
    expect((semantic as Record<string, unknown>).world_ref).toBe(PINNED);

    const frame = buildStructuralFrame({
      frameId: "frame-t04",
      observerRef: caller.actor.id,
      world,
      checkpointRef: "cognate:pending",
    });
    const surface = projectFrame(frame);
    expect(surface.persistent_context.world_ref).toBe(PINNED);
    expect(surface.blocks.length).toBeGreaterThan(0);
    expect(JSON.stringify(surface)).not.toContain("<");

    const run = await runtime.runtime.service.startRun(caller, {
      agent: "horizon.health",
      input: frame as unknown as Json,
      idempotencyKey: "t04-health-run",
    });
    await runtime.runtime.idle(10_000);
    let view = await runtime.runtime.service.getRun(caller, { runId: run.runId });
    for (let i = 0; i < 200 && view.status !== "completed" && view.status !== "failed"; i += 1) {
      await Bun.sleep(10);
      view = await runtime.runtime.service.getRun(caller, { runId: run.runId });
    }
    expect(view.status).toBe("completed");
    const output = view.output as Record<string, unknown>;
    expect(output.world_ref).toBe(PINNED);
    expect(output.input_world_ref).toBe(PINNED);
    expect(output.correlation_ref).toBe(run.correlationId);

    let rows: readonly { readonly key: string; readonly value: unknown }[] = [];
    for (let i = 0; i < 100 && rows.length === 0; i += 1) {
      const projection = await runtime.runtime.service.readProjection(caller, { name: "horizon.navigation-context" });
      rows = projection.rows;
      if (rows.length === 0) await Bun.sleep(10);
    }
    expect(rows.some((row) => row.key === run.runId)).toBe(true);

    const server = application.startServer(0);
    try {
      const response = await fetch(new URL("/health", server.url));
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.status).toBe("ok");
      expect(body.profile).toBe("local_operator");
      expect((body.world as Record<string, unknown>).world_ref).toBe(PINNED);
      expect(body.research).toEqual({
        contract: "horizon.research/1",
        status: "ok",
        capabilities: ["health", "typed-process-contract"],
        ml: false,
      });
    } finally {
      server.stop();
    }
  }, 30_000);
});

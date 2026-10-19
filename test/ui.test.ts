import { describe, expect, test } from "bun:test";
import { buildStructuralFrame } from "../src/domain/frame.ts";
import { projectFrame } from "../src/ui/surface.ts";
import type { LoadedWorld } from "../src/adapters/semantic.ts";

const world = {
  worldRef: "world:horizon@sha256:6c18d6a608bd9d83e6aa354d5a8cc804009ca208562021c1736ee429412309f0",
  cognateWorldRef: "world:horizon@sha256:aa459cf9c096b8102824d5d0a0d7a3b29bbf3f2537013800c88d7e7690300a9b",
  projection: { objects: [], relations: [] },
  objectCount: 0,
  relationCount: 0,
  unmapped: [],
} as unknown as LoadedWorld;

describe("renderer-neutral surface seam", () => {
  test("projects a frame without executable markup and with sources on every block", () => {
    const frame = buildStructuralFrame({
      frameId: "frame-ui",
      observerRef: "os:operator:1000",
      world,
      checkpointRef: "cognate:42",
    });
    const surface = projectFrame(frame);
    expect(surface.schema).toBe("horizon.surface/1");
    expect(surface.persistent_context.checkpoint_ref).toBe("cognate:42");
    for (const block of surface.blocks) {
      expect(block.sources.length).toBeGreaterThan(0);
    }
    expect(JSON.stringify(surface)).not.toMatch(/<[a-z][^>]*>/i);
  });

  test("marks agent-supplied values as agent sources", () => {
    const frame = buildStructuralFrame({
      frameId: "frame-agent",
      observerRef: "os:operator:1000",
      world,
      checkpointRef: "cognate:43",
    });
    const surface = projectFrame(frame);
    const agentSources = surface.blocks.flatMap((block) => block.sources).filter((source) => source.kind === "agent");
    expect(agentSources.length).toBeGreaterThan(0);
    expect(agentSources.every((source) => source.ref.startsWith("agent:"))).toBe(true);
  });
});

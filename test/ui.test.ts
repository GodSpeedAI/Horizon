import { describe, expect, test } from "bun:test";
import { buildStructuralFrame } from "../src/domain/frame.ts";
import { bindingContextOf, projectFrame } from "../src/ui/surface.ts";
import { GUI_VIEW_SCHEMA } from "../src/ui/surface2/project.ts";
import type { LoadedWorld } from "../src/adapters/semantic.ts";

const world = {
  worldRef: "world:horizon@sha256:6c18d6a608bd9d83e6aa354d5a8cc804009ca208562021c1736ee429412309f0",
  cognateWorldRef: "world:horizon@sha256:aa459cf9c096b8102824d5d0a0d7a3b29bbf3f2537013800c88d7e7690300a9b",
  projection: { objects: [], relations: [] },
  objectCount: 0,
  relationCount: 0,
  unmapped: [],
} as unknown as LoadedWorld;

/**
 * An in-process route: it may read `file:` sources, but it resolves no entities and no gate
 * state, so every binding it reports is honestly unbound rather than fabricated.
 */
const context = bindingContextOf({ root: process.cwd(), allowFileReads: true });

function project(frame: ReturnType<typeof buildStructuralFrame>) {
  const projection = projectFrame(frame, context);
  if (!projection.ok) throw new Error(`surface rejected: ${projection.issues.map((issue) => issue.path).join(", ")}`);
  return projection.view;
}

describe("renderer-neutral surface seam", () => {
  test("projects a frame without executable markup and with sources on every block", () => {
    const frame = buildStructuralFrame({
      frameId: "frame-ui",
      observerRef: "os:operator:1000",
      world,
      checkpointRef: "cognate:42",
    });
    const view = project(frame);
    expect(view.schema).toBe(GUI_VIEW_SCHEMA);
    expect(view.world_ref).toBe(world.worldRef);
    expect(view.nodes.length).toBeGreaterThan(0);
    for (const node of view.nodes) {
      expect(node.bindings.length).toBeGreaterThan(0);
    }
    // Neutrality is the claim: no renderer can recover executable content from this document.
    expect(JSON.stringify(view)).not.toMatch(/<[a-z][^>]*>/i);
  });

  test("never lets a binding claim an observation the route did not make", () => {
    const frame = buildStructuralFrame({
      frameId: "frame-agent",
      observerRef: "os:operator:1000",
      world,
      checkpointRef: "cognate:43",
    });
    const view = project(frame);
    const bindings = view.nodes.flatMap((node) => node.bindings);
    expect(bindings.length).toBeGreaterThan(0);
    // A route with no entity or gate resolver reports refusals, not values. Anything marked
    // agent-supplied says so, so a caller cannot mistake the agent's claim for an authority's.
    for (const binding of bindings) {
      if (binding.agent_supplied) continue;
      expect(binding.status).not.toBe("bound");
      expect(binding.observation).toBeUndefined();
      expect(binding.value).toBeNull();
      // Every non-bound binding names a machine-readable code without parsing prose:
      // `reason` for a refusal, `awaiting` for an authority that has not answered yet.
      if (binding.status === "blocked") expect(binding.awaiting).toBeDefined();
      else expect(binding.reason).toBeDefined();
    }
  });
});

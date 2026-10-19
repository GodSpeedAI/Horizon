import type { Component, HandlerContext } from "@godspeedai/cognate-kernel-api";
import type { LoadedWorld } from "../adapters/semantic.ts";

export const SEMANTIC_WORLD = {
  id: "horizon.semantics.world",
  version: "1.0.0",
} as const;

export function semanticWorldComponent(world: LoadedWorld): Component {
  return {
    id: "horizon.semantic-adapter",
    provides: [SEMANTIC_WORLD],
    activate(fiber) {
      fiber.provide(SEMANTIC_WORLD, (_input: unknown, context: HandlerContext) => ({
        world_ref: world.worldRef,
        cognate_world_ref: world.cognateWorldRef,
        object_count: world.objectCount,
        relation_count: world.relationCount,
        unmapped: world.unmapped,
        correlation_ref: context.correlationId,
      }));
    },
  };
}

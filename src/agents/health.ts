import type { AgentDefinition } from "@godspeedai/cognate-runtime-api";
import { assertSemanticOutput } from "../adapters/semantic.ts";

export const HEALTH_AGENT = {
  id: "horizon.health",
  version: "1.0.0",
} as const;

export const healthAgent: AgentDefinition = {
  id: HEALTH_AGENT.id,
  version: HEALTH_AGENT.version,
  async run(input, context) {
    const semantic = assertSemanticOutput(await context.invoke("horizon.semantics.world", {}));
    const correlationRef = context.correlationId;
    await context.emit("horizon.health.checked", {
      world_ref: semantic.world_ref,
      correlation_ref: correlationRef,
    });
    return {
      world_ref: semantic.world_ref,
      cognate_world_ref: semantic.cognate_world_ref,
      object_count: semantic.object_count,
      relation_count: semantic.relation_count,
      checkpoint_ref: `cognate:${context.runId}`,
      correlation_ref: correlationRef,
      input_world_ref: readWorldRef(input),
    };
  },
};

function readWorldRef(input: unknown): string | null {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return null;
  const value = (input as Record<string, unknown>).world_ref;
  return typeof value === "string" ? value : null;
}

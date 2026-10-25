import type { AgentDefinition } from "@godspeedai/cognate-runtime-api";
import { assertSemanticOutput } from "../adapters/semantic.ts";
import { assertCommitIntent, type CommitIntentInput } from "../domain/intent.ts";
import type { NavigationFrameV1, NavigationIntentRecord } from "../domain/frame.ts";
import { frameForIntent, type FrameRegister } from "../capabilities/navigation-intent.ts";

export const HEALTH_AGENT = {
  id: "horizon.health",
  version: "1.0.0",
} as const;

/**
 * One structural observation run. It is started only for a committed typed intent
 * (`horizon.navigation.intent.commit`), and it carries the intent, frame and checkpoint
 * it was started from so the projection and the output can be traced back to them.
 */
export interface StructuralObservationRequest {
  readonly intent: NavigationIntentRecord;
  readonly world_ref: string;
  readonly checkpoint_ref: string;
}

export function structuralObservationAgent(register: FrameRegister): AgentDefinition {
  return {
    id: HEALTH_AGENT.id,
    version: HEALTH_AGENT.version,
    async run(input, context) {
      const intentValue = input !== null && typeof input === "object" ? (input as { intent?: unknown }).intent : undefined;
      const request = readObservationRequest(input, register.current() === null ? null : frameForIntent(register, intentValue, "HEALTH"));
      const semantic = assertSemanticOutput(await context.invoke("horizon.semantics.world", {}));
      const correlationRef = context.correlationId;
      await context.emit("horizon.health.checked", {
        world_ref: semantic.world_ref,
        correlation_ref: correlationRef,
        intent_id: request.intent.intent_id,
      });
      return {
        world_ref: semantic.world_ref,
        cognate_world_ref: semantic.cognate_world_ref,
        object_count: semantic.object_count,
        relation_count: semantic.relation_count,
        checkpoint_ref: `cognate:${context.runId}`,
        correlation_ref: correlationRef,
        input_world_ref: request.world_ref,
        input_checkpoint_ref: request.checkpoint_ref,
        intent_id: request.intent.intent_id,
        frame_id: request.intent.frame_id,
        operation_ref: request.intent.operation_ref,
        observer_ref: request.intent.actor_ref,
      };
    },
  };
}

function readObservationRequest(input: unknown, frame: NavigationFrameV1 | null): StructuralObservationRequest {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("HEALTH: observation input must be an object");
  }
  const record = input as Record<string, unknown>;
  const intentValue = record.intent;
  if (frame === null) throw new Error("HEALTH: no navigation frame has been issued");
  const intent: CommitIntentInput = assertCommitIntent(intentValue, frame, frame.observer_ref, ["correlation_ref"]);
  const correction = (intentValue as Record<string, unknown>).correlation_ref;
  if (typeof record.world_ref !== "string" || typeof record.checkpoint_ref !== "string") {
    throw new Error("HEALTH: observation input must name the world_ref and checkpoint_ref it was started from");
  }
  const navigationIntent: NavigationIntentRecord = {
    intent_id: intent.intent_id,
    frame_id: intent.frame_id,
    frame_revision: intent.frame_revision,
    actor_ref: intent.actor_ref,
    operation_ref: intent.operation_ref,
    ...(typeof correction === "string" ? { correlation_ref: correction } : {}),
  };
  return {
    intent: navigationIntent,
    world_ref: record.world_ref,
    checkpoint_ref: record.checkpoint_ref,
  };
}

/** Historical name: the plain health agent (no intent binding). */
export const healthAgent: AgentDefinition = structuralObservationAgent({ current: () => null, issue() {}, retain() {}, retained: () => null });

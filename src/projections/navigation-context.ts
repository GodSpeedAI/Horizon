import type { Json } from "@godspeedai/cognate-events";
import type { Projection } from "@godspeedai/cognate-projections";

export const NAVIGATION_CONTEXT_PROJECTION = {
  name: "horizon.navigation-context",
  version: "1.0.0",
} as const;

function inputWorldRef(payload: unknown): string | null {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
  const input = (payload as Record<string, unknown>).input;
  if (input === null || typeof input !== "object" || Array.isArray(input)) return null;
  const worldRef = (input as Record<string, unknown>).world_ref;
  return typeof worldRef === "string" ? worldRef : null;
}

function readMetadata(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" ? value : null;
}

export const navigationContextProjection: Projection = {
  name: NAVIGATION_CONTEXT_PROJECTION.name,
  version: NAVIGATION_CONTEXT_PROJECTION.version,
  apply(event) {
    if (event.eventType !== "run.started" || !event.runId) return [];
    const metadata = event.metadata ?? {};
    return [
      {
        key: `${event.tenant}/${event.runId}`,
        value: {
          run_ref: event.runId,
          agent_ref: readMetadata(metadata, "agent") ?? "",
          observer_ref: readMetadata(metadata, "startedBy") ?? "",
          correlation_ref: event.correlationId,
          world_ref: inputWorldRef(event.payload),
          recorded_at: event.recordedAt,
          checkpoint_ref: `cognate:${event.position}`,
          // Provenance of the typed intent this observation run was started from.
          ...(intentProvenance(event.payload) ? { intent: intentProvenance(event.payload) } : {}),
        },
      },
    ];
  },
};

function intentProvenance(payload: unknown): { readonly [key: string]: Json } | null {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
  const input = (payload as Record<string, unknown>).input;
  if (input === null || typeof input !== "object" || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  const intent = record.intent;
  if (intent === null || typeof intent !== "object" || Array.isArray(intent)) return null;
  const fields = intent as Record<string, unknown>;
  return {
    intent_id: typeof fields.intent_id === "string" ? fields.intent_id : null,
    frame_id: typeof fields.frame_id === "string" ? fields.frame_id : null,
    frame_revision: typeof fields.frame_revision === "number" ? fields.frame_revision : null,
    operation_ref: typeof fields.operation_ref === "string" ? fields.operation_ref : null,
    input_checkpoint_ref: typeof record.checkpoint_ref === "string" ? record.checkpoint_ref : null,
  };
}

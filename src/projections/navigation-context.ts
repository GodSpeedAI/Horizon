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
          agent_ref: typeof metadata.agent === "string" ? metadata.agent : "",
          observer_ref: typeof metadata.startedBy === "string" ? metadata.startedBy : "",
          correlation_ref: event.correlationId,
          world_ref: inputWorldRef(event.payload),
          recorded_at: event.recordedAt,
          checkpoint_ref: `cognate:${event.position}`,
        },
      },
    ];
  },
};

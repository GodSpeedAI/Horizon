import type { AgentDefinition } from "@godspeedai/cognate-runtime-api";
import type { DurableStore, Json } from "@godspeedai/cognate-events";
import type { CommitIntentInput, CommitIntentOutput } from "../domain/intent.ts";
import { appendIntentAttempt, appendIntentRecord, NAVIGATION_INTENT_COMMIT } from "../capabilities/navigation-intent.ts";
import { assertCurrentRunInput } from "../capabilities/contract-upgrade.ts";

export const NAVIGATION_COMMIT_AGENT = {
  id: "horizon.navigation.commit",
  version: "1.0.0",
} as const;

/** What a governed commit run returns once the intent record exists. */
export interface NavigationCommitOutput {
  readonly intent_id: string;
  readonly correlation_ref: string | null;
  readonly event_id: string;
  readonly position: number;
}

/**
 * The governed commit of one typed intent (J02 IS3-IS5), as a Cognate run.
 *
 * A direct `service.invoke` cannot wait for a human: SEA-Forge's `escalate` would come back as a
 * refusal. Inside a run, Cognate's Governor parks the invoke on a durable governance-approval
 * continuation; the operator decides through SEA-Forge, and on resume Cognate revalidates with
 * SEA-Forge, which alone decides whether the call proceeds. A rejection fails the run.
 *
 * The record is written only after the governed invoke returned, in a recorded step, and
 * `appendIntentRecord` is exactly-once per `intent_id`, so a replayed or crash-resumed run never
 * writes a second record.
 *
 * The capability still validates the intent against the frame register, which lives in memory: a
 * run resumed after a restart, or after a newer frame was issued, fails as a stale intent. An
 * approval never revives a stale frame.
 */
export function navigationCommitAgent(store: () => DurableStore): AgentDefinition {
  return {
    id: NAVIGATION_COMMIT_AGENT.id,
    version: NAVIGATION_COMMIT_AGENT.version,
    async run(input, context) {
      const intent = readIntent(input);
      // A v1 run (started before the 1.1.0 upgrade) is suspended and never executes, even once approved.
      assertCurrentRunInput(input, intent.intent_id);
      const result = (await context.invoke(NAVIGATION_INTENT_COMMIT.id, intent as unknown as Json)) as unknown as CommitIntentOutput;
      if (result?.intent_id !== intent.intent_id) throw new Error("INTENT: the commit answered for a different intent");
      const correlationRef = result.correlation_ref ?? null;
      const recorded = await context.step("record", async () => {
        assertCurrentRunInput(input, intent.intent_id);
        const r = await appendIntentRecord(store(), {
          record: { ...intent, ...(correlationRef ? { correlation_ref: correlationRef } : {}) },
          tenant: context.tenant,
          scopeId: `horizon-${context.tenant}`,
          contract: { expectation: null, threshold: null, window: null, payment: null, now: new Date() },
        });
        return { event_id: r.eventId, position: r.position };
      });
      // Audited here, not by whoever happens to observe the run: a commit resumed by SEA-Forge polling
      // after an approval made outside Horizon is audited exactly like one resolved through Horizon.
      await context.step("audit", async () => {
        await appendIntentAttempt(store(), {
          attempt: { intent_id: intent.intent_id, actor_ref: intent.actor_ref, caller_ref: context.actor.id, outcome: "accepted", reason: null, at: new Date().toISOString() },
          tenant: context.tenant,
          scopeId: `horizon-${context.tenant}`,
        });
        return null;
      });
      const output: NavigationCommitOutput = { intent_id: intent.intent_id, correlation_ref: correlationRef, ...recorded };
      return output as unknown as Json;
    },
  };
}

/** Shape only; the capability validates the intent against the current frame. */
function readIntent(input: unknown): CommitIntentInput {
  const value = (input && typeof input === "object" && !Array.isArray(input) ? input : {}) as Record<string, unknown>;
  const intent = value.intent as Record<string, unknown> | undefined;
  if (!intent || typeof intent.intent_id !== "string" || typeof intent.frame_id !== "string" || typeof intent.frame_revision !== "number" || typeof intent.actor_ref !== "string" || typeof intent.operation_ref !== "string") {
    throw new Error("INTENT: a governed commit run needs { intent: CommitIntentInput }");
  }
  return {
    intent_id: intent.intent_id,
    frame_id: intent.frame_id,
    frame_revision: intent.frame_revision,
    actor_ref: intent.actor_ref,
    operation_ref: intent.operation_ref,
  };
}

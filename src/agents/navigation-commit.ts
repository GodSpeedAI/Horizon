import type { AgentDefinition } from "@godspeedai/cognate-runtime-api";
import type { DurableStore, Json } from "@godspeedai/cognate-events";
import type { CommitIntentInput, CommitIntentOutput } from "../domain/intent.ts";
import { appendIntentAttempt, appendIntentRecord, NAVIGATION_INTENT_COMMIT } from "../capabilities/navigation-intent.ts";
import { assertCurrentRunInput } from "../capabilities/contract-upgrade.ts";
import { readPending } from "../capabilities/pending-intent.ts";
import { windowOpen } from "../domain/expectation.ts";
import type { OperationBindingConfig } from "../config/types.ts";
import { type ObligationDeps, ObligationRefusal, claimsFor, discriminateRun } from "../settlement/obligation.ts";
import { terminate } from "../capabilities/pending-intent.ts";

/** What the commit run needs for a bound operation (HORIZON-001 1.1.0): its binding and the obligation flow. */
export interface CommitObligation {
  readonly bindingFor: (operationRef: string) => OperationBindingConfig | undefined;
  readonly deps: ObligationDeps;
}

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
export function navigationCommitAgent(store: () => DurableStore, obligation?: CommitObligation): AgentDefinition {
  return {
    id: NAVIGATION_COMMIT_AGENT.id,
    version: NAVIGATION_COMMIT_AGENT.version,
    async run(input, context) {
      const intent = readIntent(input);
      // A v1 run (started before the 1.1.0 upgrade) is suspended and never executes, even once approved.
      assertCurrentRunInput(input, intent.intent_id);
      const binding = obligation?.bindingFor(intent.operation_ref);
      const pending = binding ? (await readPending(store(), context.tenant, intent.intent_id))?.pending : undefined;
      if (binding && !pending) throw new Error(`INTENT: ${intent.operation_ref} is bound; its commit needs a pending intent`);
      if (pending?.terminal) throw new ObligationRefusal(pending.terminal.reason ?? pending.terminal.outcome);
      // Refused, terminal and consumed in a recorded step, so a replay never runs the effect it refused.
      const refuseNow = async (refusal: string): Promise<never> => {
        await context.step(`refuse`, async () => {
          await terminate(store(), context.tenant, intent.intent_id, "refused", refusal, obligation!.deps.now());
          return refusal;
        });
        throw new ObligationRefusal(refusal);
      };
      const windowExpired = () => pending?.window !== null && pending?.window !== undefined && !windowOpen(pending.window, obligation!.deps.now());
      if (windowExpired()) await refuseNow("window expired");
      const claims = pending && obligation ? claimsFor(pending, obligation.deps.settlement?.close_grace_s ?? 30) : undefined;
      const result = (await context.invoke(NAVIGATION_INTENT_COMMIT.id, intent as unknown as Json, (claims ? { authorityClaims: claims } : undefined) as never)) as unknown as CommitIntentOutput;
      if (result?.intent_id !== intent.intent_id) throw new Error("INTENT: the commit answered for a different intent");
      if (pending?.expectation && binding && obligation) {
        // An approval that arrives after the window closed is refused before anything runs.
        if (windowExpired()) await refuseNow("window expired");
        const decided = await context.step("discriminate", async () => {
          const { run, decision } = await discriminateRun(obligation.deps, binding, pending);
          return { run, decision } as unknown as Json;
        });
        const decision = (decided as unknown as { decision: { proceed: boolean; refusal?: string } }).decision;
        if (!decision.proceed) await refuseNow(decision.refusal ?? "discrimination unknown");
      }
      const correlationRef = result.correlation_ref ?? null;
      const recorded = await context.step("record", async () => {
        assertCurrentRunInput(input, intent.intent_id);
        const r = await appendIntentRecord(store(), {
          record: { ...intent, ...(correlationRef ? { correlation_ref: correlationRef } : {}) },
          tenant: context.tenant,
          scopeId: `horizon-${context.tenant}`,
          contract: {
            expectation: pending?.expectation ?? null,
            threshold: pending?.threshold ? { id: pending.threshold.threshold_id, position: pending.threshold.position.ordinal } : null,
            window: pending?.window ?? null,
          },
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

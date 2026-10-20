import { randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import type { Caller } from "@godspeedai/cognate-runtime-api";
import { loadWorld, type LoadedWorld } from "./adapters/semantic.ts";
import { observeResearch, requireResearch, type ResearchStatus } from "./adapters/research.ts";
import { loadConfig } from "./config/load.ts";
import type { LoadedConfig } from "./config/types.ts";
import { createHorizonRuntime, type HorizonRuntime } from "./runtime/create.ts";
import { appendIntentAttempt, appendIntentRecord, createFrameRegister, NAVIGATION_INTENT_COMMIT, navigationIntentComponent, type FrameRegister, type IntentAttempt } from "./capabilities/navigation-intent.ts";
import { structuralObservationAgent, healthAgent, HEALTH_AGENT, type StructuralObservationRequest } from "./agents/health.ts";
import type { Json } from "@godspeedai/cognate-events";
import type { RunView } from "@godspeedai/cognate-runtime-api";
import { buildStructuralFrame, type NavigationFrameV1, type NavigationIntentRecord } from "./domain/frame.ts";
import { buildCommitIntent, type CommitIntentInput, type CommitIntentOutput } from "./domain/intent.ts";
import type { Server } from "bun";

type HttpServer = Server<unknown>;

/** The frame this application most recently issued and the gates assessed on it. */
export interface FrameView {
  readonly frame: NavigationFrameV1;
}

export interface IntentCommit {
  readonly intent: CommitIntentInput;
  readonly result: CommitIntentOutput;
  /** Store position of the committed `NavigationIntentRecord` event: the checkpoint this intent is observed at. */
  readonly position: number;
  readonly eventId: string;
}

export interface HorizonApplication {
  readonly loaded: LoadedConfig;
  readonly world: LoadedWorld;
  readonly runtime: HorizonRuntime;
  readonly caller: Caller;
  /** Healthy, or a typed degraded observation; never a startup prerequisite. */
  readonly research: ResearchStatus;
  readonly frames: FrameRegister;
  frame(): FrameView | null;
  commitNavigationIntent(request: { readonly operationRef: string; readonly intentId?: string }): Promise<IntentCommit>;
  /** Submit a pre-built intent (e.g. one a surface composed): same validation and audit. */
  submitIntent(intent: CommitIntentInput): Promise<IntentCommit>;
  startObservation(commit: IntentCommit): Promise<RunView>;
  researchContract(): ReturnType<typeof requireResearch>;
  startServer(port?: number): HttpServer;
  close(): Promise<void>;
}

/**
 * Compose the walking skeleton.
 *
 * Configuration comes from `config/horizon.toml` (or `configPath`); the store comes
 * from `HORIZON_STORE` or that file unless `storePath` is given. Tests supply
 * `configPath`, never `storePath`, so the store guard is always exercised.
 *
 * Research is observed but optional: failure there degrades one typed observation and
 * blocks only research-dependent operations (REQ-CONFIG-012).
 */
export async function createApplication(
  options: { readonly storePath?: string; readonly configPath?: string } = {},
): Promise<HorizonApplication> {
  const loaded = loadConfig(options.configPath);
  const world = loadWorld(loaded.config.world_ref);
  const research = await observeResearch(loaded.config.research_command);
  const caller: Caller = { actor: loaded.operator.principal, tenant: loaded.operator.tenant };
  const frames = createFrameRegister();
  const runtime = await createHorizonRuntime(loaded.config, world, {
    caller,
    ...(options.storePath ? { storePath: options.storePath } : {}),
    components: [navigationIntentComponent(frames)],
    agents: [structuralObservationAgent(frames)],
  });
  let issued: FrameView | null = null;

  /** Issue a frame for the current request and register it as the one an intent may name. */
  function issueFrame(checkpointRef = checkpointRefOf(runtime.storePath)): FrameView {
    const frame = buildStructuralFrame({
      frameId: `frame-${randomUUID()}`,
      observerRef: caller.actor.id,
      world,
      checkpointRef,
      ...(research.kind === "research"
        ? {}
        : { availability: { status: "unknown" as const, firstBlockers: { "horizon.research.health": `research_source: ${research.code}` } } }),
    });
    frames.issue(frame);
    issued = { frame };
    return issued;
  }

  /** Submit an already-built intent: refused intents are audited and write no record. */
  async function submitIntent(intent: CommitIntentInput): Promise<IntentCommit> {
    const audit = (attempt: IntentAttempt) => appendIntentAttempt(runtime.runtime.store, { attempt, tenant: caller.tenant, scopeId: `horizon-${caller.tenant}` });
    let result: CommitIntentOutput;
    try {
      result = (await runtime.runtime.service.invoke(caller, {
        capability: NAVIGATION_INTENT_COMMIT.id,
        input: intent as unknown as Json,
      })) as unknown as CommitIntentOutput;
    } catch (error) {
      // Refused: no intent record is written, but the attempt is not silent.
      await audit({
        intent_id: intent.intent_id,
        actor_ref: intent.actor_ref,
        caller_ref: caller.actor.id,
        outcome: "refused",
        reason: error instanceof Error ? error.message : String(error),
        at: new Date().toISOString(),
      });
      throw error;
    }
    const recorded = await appendIntentRecord(runtime.runtime.store, {
      record: {
        intent_id: intent.intent_id,
        frame_id: intent.frame_id,
        frame_revision: intent.frame_revision,
        actor_ref: intent.actor_ref,
        operation_ref: intent.operation_ref,
        ...(result.correlation_ref ? { correlation_ref: result.correlation_ref } : {}),
      },
      tenant: caller.tenant,
      scopeId: `horizon-${caller.tenant}`,
    });
    await audit({ intent_id: intent.intent_id, actor_ref: intent.actor_ref, caller_ref: caller.actor.id, outcome: "accepted", reason: null, at: new Date().toISOString() });
    return { intent, result, position: recorded.position, eventId: recorded.eventId };
  }

  /** Source → frame → typed intent → commit. The route never supplies an observer. */
  async function commitNavigationIntent(request: { readonly operationRef: string; readonly intentId?: string }): Promise<IntentCommit> {
    const { frame } = issueFrame();
    return submitIntent(
      buildCommitIntent({
        frame,
        operationRef: request.operationRef,
        intentId: request.intentId ?? randomUUID(),
      }),
    );
  }

  /** Start the structural observation run for one committed intent (no raw frame cast). */
  async function startObservation(commit: IntentCommit): Promise<RunView> {
    const frame = frames.current();
    if (frame === null || frame.frame_id !== commit.intent.frame_id) {
      throw new Error(`HEALTH: intent names frame ${commit.intent.frame_id}, which is not the current frame`);
    }
    const request: StructuralObservationRequest = {
      intent: { ...commit.intent, correlation_ref: commit.result.correlation_ref ?? undefined } as NavigationIntentRecord,
      world_ref: frame.world_ref,
      checkpoint_ref: `cognate:${commit.position}`,
    };
    return runtime.runtime.service.startRun(caller, {
      agent: HEALTH_AGENT.id,
      input: request as unknown as Json,
      idempotencyKey: `intent:${commit.intent.intent_id}`,
    });
  }

  return {
    loaded,
    world,
    runtime,
    caller,
    research,
    frames,
    frame: () => issued,
    commitNavigationIntent,
    submitIntent,
    startObservation,
    researchContract: () => requireResearch(research),
    startServer(port = loaded.config.port): HttpServer {
      return Bun.serve({
        hostname: loaded.config.bind_host,
        port,
        async fetch(request) {
          const url = new URL(request.url);
          if (url.pathname === "/health") {
            const semantic = await runtime.runtime.service.invoke(caller, {
              capability: "horizon.semantics.world",
              input: {},
            });
            return Response.json({
              status: "ok",
              profile: loaded.config.deployment_profile,
              operator_ref: loaded.operator.principal.id,
              world: semantic,
              research,
              transports: loaded.config.transports,
            });
          }
          if (url.pathname === "/frame") {
            return Response.json({ ...issueFrame(), research });
          }
          if (url.pathname === "/intent" && request.method === "POST") {
            let body: unknown;
            try {
              body = await request.json();
            } catch {
              return Response.json({ code: "invalid_argument", message: "INTENT: body is not JSON" }, { status: 400 });
            }
            const record = (body ?? {}) as Record<string, unknown>;
            if (typeof record.operation_ref !== "string") {
              return Response.json({ code: "invalid_argument", message: "INTENT: operation_ref is required" }, { status: 400 });
            }
            return Response.json(await commitNavigationIntent({ operationRef: record.operation_ref }));
          }
          if (url.pathname === "/") {
            return new Response("Horizon structural skeleton\n", {
              headers: { "content-type": "text/plain; charset=utf-8" },
            });
          }
          return new Response("not found\n", { status: 404 });
        },
      });
    },
    async close() {
      await runtime.runtime.close();
    },
  };
}

/** `cognate:store@<bytes>`: the durable store's size — observed, never fabricated. */
function checkpointRefOf(storePath: string): string {
  try {
    return `cognate:store@${statSync(storePath).size}`;
  } catch {
    return "cognate:none";
  }
}

async function lastPosition(runtime: HorizonRuntime): Promise<number> {
  let max = 0;
  for await (const event of runtime.runtime.service.events(runtime.caller, {})) {
    if (event.position > max) max = event.position;
  }
  return max;
}

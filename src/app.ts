import { randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import type { Caller } from "@godspeedai/cognate-runtime-api";
import { governanceFromEnv, type GovernanceOptions } from "@godspeedai/cognate-runtime-bun";
import { loadWorld, type LoadedWorld } from "./adapters/semantic.ts";
import { observeResearch, requireResearch, type ResearchStatus } from "./adapters/research.ts";
import { loadConfig } from "./config/load.ts";
import type { LoadedConfig } from "./config/types.ts";
import { createHorizonRuntime, type HorizonRuntime } from "./runtime/create.ts";
import { appendIntentAttempt, appendIntentRecord, createFrameRegister, NAVIGATION_INTENT_COMMIT, navigationIntentComponent, readIntentRecords, type FrameRegister, type IntentAttempt } from "./capabilities/navigation-intent.ts";
import { structuralObservationAgent, healthAgent, HEALTH_AGENT, type StructuralObservationRequest } from "./agents/health.ts";
import { navigationCommitAgent, NAVIGATION_COMMIT_AGENT, type NavigationCommitOutput } from "./agents/navigation-commit.ts";
import { approvalAuthorityFromEnv, resolveApproval, type ApprovalAuthority } from "./adapters/sea-forge-approvals.ts";
import { authorityOf, defaultRealityTraceRepo, observationOutbox, realityTraceFromEnv, RealityTraceEvidence, type GovernedInvocation, type RealityTraceConfig, type SettlementAuthority } from "./adapters/settlement.ts";
import { appendSettlement, latestSettlement, type ExecutionRecord, type NavigationSettlement, type SettlementReference } from "./capabilities/navigation-settlement.ts";
import type { Json } from "@godspeedai/cognate-events";
import type { RunView } from "@godspeedai/cognate-runtime-api";
import { buildStructuralFrame, type NavigationFrameV1, type NavigationIntentRecord } from "./domain/frame.ts";
import { buildCommitIntent, IntentError, type CommitIntentInput, type CommitIntentOutput } from "./domain/intent.ts";
import type { NavigationFrame as NavigationFrameV2 } from "./domain/navigation.ts";
import type { SemanticRef } from "./domain/operational.ts";
import { buildOperationalFrame } from "./adapters/navigation.ts";
import { checkpointOf, readProjection, readSnapshotAt, type DeclaredWorld, type ProjectionView } from "./adapters/operational-objects.ts";
import {
  bindingContextOf,
  canonicalIntent,
  composeSurface,
  frameFromCheckpoint,
  assessmentOf,
  intentsEquivalent,
  projectForRole,
  type EquivalenceResult,
  type GuiView,
  type SurfaceRouteContext,
} from "./ui/surface.ts";
import { publishSurfaceSchema, SURFACE_SCHEMA, type SurfaceRole } from "./ui/surface2/grammar.ts";
import { renderHtml, renderText } from "./ui/surface2/render.ts";
import { buildWorkspace, type WorkspaceDebugger, type WorkspaceFrameRef, type WorkspaceRetrieval, type WorkspaceSnapshot, type WorkspaceTheme } from "./ui/workspace/model.ts";
import { debuggerView, inspect, missingRetrieval } from "./ui/workspace/inspect.ts";
import type { ContextKernelAdapter, ContextReferenceAnswer } from "./adapters/context-kernel.ts";
import { CONTEXT_REFERENCE } from "./capabilities/context.ts";
import { runDebugger, DEBUGGER_OPERATIONS, type DebuggerArguments, type DebuggerOperation, type DebuggerSources } from "./domain/debugger.ts";
import { renderWorkspacePage } from "./ui/workspace/render.tsx";
import type { Server } from "bun";

type HttpServer = Server<unknown>;

/** The frame this application most recently issued and the gates assessed on it. */
export interface FrameView {
  readonly frame: NavigationFrameV1;
}

export interface SurfaceIntentRequestBody {
  readonly transport: "gui" | "cli" | "mcp";
  readonly role?: unknown;
  /** GUI: the action the operator activated. */
  readonly node_id?: unknown;
  /** CLI/MCP: the operation the caller named. */
  readonly operation?: unknown;
  readonly frame_id?: unknown;
}

export interface NavigationOptions {
  readonly focusRef?: string;
  readonly caseRef?: string;
  readonly purpose?: string;
  readonly directionRef?: string;
  readonly directionStatement?: string;
}

export interface WorkspaceData {
  readonly frame: NavigationFrameV2;
  readonly view: GuiView;
  readonly objects: readonly import("./domain/operational.ts").OperationalObjectV1[];
  readonly links: readonly import("./domain/operational.ts").OperationalLinkV1[];
  readonly current: WorkspaceFrameRef;
  readonly snapshot: WorkspaceSnapshot;
}

export interface IntentCommit {
  readonly intent: CommitIntentInput;
  readonly result: CommitIntentOutput;
  /** Store position of the committed `NavigationIntentRecord` event: the checkpoint this intent is observed at. */
  readonly position: number;
  readonly eventId: string;
}

/**
 * SEA-Forge escalated the commit (J02 IS3): it waits, durably, for the operator's decision and no
 * record exists yet. Answer it with `resolveNavigationApproval`; this is not a refusal.
 */
export class AwaitingAuthorityError extends Error {
  override readonly name = "AwaitingAuthorityError";
  readonly code = "awaiting_authority";
  constructor(
    readonly intent: CommitIntentInput,
    readonly runId: string,
    readonly approvalId: string,
  ) {
    super(`INTENT: intent ${intent.intent_id} awaits SEA-Forge approval ${approvalId}`);
  }
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
  /**
   * The T07 observer-relative frame over the current operational projection (T08's shared input).
   * It is a real Cognate read, not a renderer fixture; an empty projection becomes an honest
   * "focus absent" deviation rather than a fabricated move.
   */
  navigationFrame(options?: NavigationOptions): Promise<NavigationFrameV2>;
  /** The GUI's data seam: one navigation read, one closed surface projection and the same frame. */
  workspace(options?: NavigationOptions & {
    readonly evidenceRef?: string;
    readonly theme?: WorkspaceTheme;
    /** An already-answered inspection about this frame, carried into the surface verbatim. */
    readonly inspection?: { readonly debugger: WorkspaceDebugger; readonly retrieval: WorkspaceRetrieval | null };
  }): Promise<WorkspaceData>;
  /**
   * Answer one of the seven debugger questions about the shared focus, citing reference material
   * when a query is given (T10). Read-only: it never commits and never mutates the frame.
   */
  inspectFocus(
    operation: string,
    options?: NavigationOptions & {
      readonly checkpointRef?: string;
      readonly query?: string;
      /** The operation's own arguments; the debugger validates them and types any refusal. */
      readonly arguments?: Omit<DebuggerArguments, "operation">;
    },
  ): Promise<{ readonly frame: NavigationFrameV2; readonly debugger: WorkspaceDebugger; readonly retrieval: WorkspaceRetrieval | null }>;
  commitNavigationIntent(request: { readonly operationRef: string; readonly intentId?: string }): Promise<IntentCommit>;
  /**
   * Submit a pre-built intent (e.g. one a surface composed): same validation and audit. With SEA-Forge
   * governance the commit runs as a governed Cognate run; an escalation throws `AwaitingAuthorityError`.
   */
  submitIntent(intent: CommitIntentInput): Promise<IntentCommit>;
  /**
   * The human operator's answer to an escalated commit, recorded at SEA-Forge under the operator's
   * identity (REQ-UX-007). Approved: SEA-Forge revalidates and the intent is committed exactly once.
   * Rejected: the run fails and nothing is committed (both are audited).
   */
  resolveNavigationApproval(request: { readonly approvalId: string; readonly resolution: "approved" | "rejected" }): Promise<IntentCommit>;
  /**
   * J02 IS6/IS7: the committed intent's execution record, its RealityTrace observation and SEA-Forge's
   * settlement reference. A completion trace alone is `unsettled`; what cannot be obtained is marked
   * `unavailable` with the reason, never invented. A final settlement is returned as recorded.
   */
  settleNavigationIntent(intentId: string): Promise<NavigationSettlement>;
  surface(role?: SurfaceRole): ReturnType<typeof projectForRole>;
  /** The published `horizon.surface/2` vocabulary, for discovery (PE-01). */
  surfaceSchema(): ReturnType<typeof publishSurfaceSchema>;
  commitSurfaceIntent(submission: SurfaceIntentRequestBody): Promise<
    | { readonly ok: true; readonly result: IntentCommit; readonly bound: EquivalenceResult }
    | { readonly ok: false; readonly code: string; readonly message: string }
  >;
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
  options: {
    readonly storePath?: string;
    readonly configPath?: string;
    /**
     * The Context Kernel adapter to bind, instead of building one from `context_kernel.command`.
     *
     * Injected by tests so a scripted wire can stand in for the server process without pretending
     * one exists. The adapter is still reached only through the boot-registered capability, so the
     * policy and the binding shape under test are the production ones (REQ-STACK-010).
     */
    readonly contextAdapter?: ContextKernelAdapter;
    /**
     * The external authority for consequential operations (J02 IS3). Defaults to Cognate's
     * `COGNATE_GOVERNANCE` / `COGNATE_SEA_FORGE_SOCKET` / `COGNATE_WORLD_REF`; off when unset, and a
     * partial configuration is a startup error, never a silent fallback.
     */
    readonly governance?: GovernanceOptions;
    /** Who answers an escalation. Defaults to `COGNATE_SEA_FORGE_OPERATOR`; unset, no one can. */
    readonly approvals?: ApprovalAuthority;
    /**
     * Where governed commits are observed (J02 IS6). Defaults to `COGNATE_REALITYTRACE_BIN` /
     * `_DATA_HOME` / `_STATE_HOME`, with the repository beside the store; `null` or unset: none, and
     * settlement references say RealityTrace is unavailable.
     */
    readonly realityTrace?: RealityTraceConfig | null;
  } = {},
): Promise<HorizonApplication> {
  const loaded = loadConfig(options.configPath);
  const world = loadWorld(loaded.config.world_ref);
  const research = await observeResearch(loaded.config.research_command);
  const caller: Caller = { actor: loaded.operator.principal, tenant: loaded.operator.tenant };
  const frames = createFrameRegister();
  const configured = options.governance ?? governanceFromEnv(process.env);
  // Poll SEA-Forge for decided escalations, so a commit approved or rejected at SEA-Forge directly
  // (not through resolveNavigationApproval) still resumes or fails on its own.
  const governance: GovernanceOptions =
    configured.mode === "sea-forge" ? { ...configured, approvalPollMs: configured.approvalPollMs ?? 2_000 } : configured;
  const approvals = options.approvals ?? approvalAuthorityFromEnv(process.env);
  const realityTrace =
    governance.mode !== "sea-forge"
      ? undefined
      : options.realityTrace === null
        ? undefined
        : (options.realityTrace ?? realityTraceFromEnv(process.env, defaultRealityTraceRepo(options.storePath ?? process.env.HORIZON_STORE ?? loaded.config.runtime_store)));
  const runtime: HorizonRuntime = await createHorizonRuntime(loaded.config, world, {
    caller,
    ...(options.storePath ? { storePath: options.storePath } : {}),
    components: [navigationIntentComponent(frames)],
    agents: [structuralObservationAgent(frames), navigationCommitAgent(() => runtime.runtime.store)],
    ...(options.contextAdapter === undefined ? {} : { contextAdapter: options.contextAdapter }),
    governance,
    // The observation commits with the governed invocation itself (the outbox), so it cannot be lost.
    ...(realityTrace ? { outboxFor: observationOutbox(NAVIGATION_INTENT_COMMIT.id) } : {}),
  });
  const evidence = realityTrace ? new RealityTraceEvidence(runtime.runtime.store, realityTrace) : undefined;
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

  function audit(intent: CommitIntentInput, outcome: IntentAttempt["outcome"], reason: string | null) {
    const attempt: IntentAttempt = { intent_id: intent.intent_id, actor_ref: intent.actor_ref, caller_ref: caller.actor.id, outcome, reason, at: new Date().toISOString() };
    return appendIntentAttempt(runtime.runtime.store, { attempt, tenant: caller.tenant, scopeId: `horizon-${caller.tenant}` });
  }

  /**
   * The governed commit (J02 IS3-IS5): a Cognate run, so SEA-Forge's `escalate` parks it on a durable
   * approval instead of failing. One run per intent id (the idempotency key), and the run writes the
   * record itself, exactly once.
   */
  async function governedSubmit(intent: CommitIntentInput): Promise<IntentCommit> {
    let run: RunView;
    try {
      run = await runtime.runtime.service.startRun(caller, {
        agent: NAVIGATION_COMMIT_AGENT.id,
        input: { intent } as unknown as Json,
        idempotencyKey: `commit:${intent.intent_id}`,
      });
    } catch (error) {
      // The id already started a commit run for a different intent: duplicate_intent, audited.
      if ((error as { code?: unknown } | null)?.code !== "already_exists") throw error;
      const duplicate = new IntentError("already_exists", `duplicate_intent: intent ${intent.intent_id} was already submitted with different input`);
      await audit(intent, "refused", duplicate.message);
      throw duplicate;
    }
    return settleCommitRun(intent, await runOutcome(run.runId, (status) => status !== "running"));
  }

  const terminal = (status: RunView["status"]) => status === "completed" || status === "failed" || status === "cancelled";

  async function runOutcome(runId: string, settled: (status: RunView["status"]) => boolean, ms = 30_000): Promise<RunView> {
    const end = Date.now() + ms;
    for (let delay = 5; ; delay = Math.min(delay * 2, 200)) {
      const view = await runtime.runtime.service.getRun(caller, { runId });
      if (settled(view.status)) return view;
      if (Date.now() > end) {
        throw new Error(`INTENT: governed commit run ${runId} is still ${view.status}; it continues durably and records its own outcome`);
      }
      await Bun.sleep(delay);
    }
  }

  async function settleCommitRun(intent: CommitIntentInput, view: RunView): Promise<IntentCommit> {
    if (view.status === "completed") {
      // The run audited its own acceptance, in the step that wrote the record.
      const out = view.output as unknown as NavigationCommitOutput;
      return {
        intent,
        result: { intent_id: out.intent_id, ...(out.correlation_ref ? { correlation_ref: out.correlation_ref } : {}) },
        position: out.position,
        eventId: out.event_id,
      };
    }
    if (view.status === "waiting") {
      const wait = (await runtime.runtime.service.listContinuations(caller, { runId: view.runId, status: "OPEN" })).find((c) => c.type === "governance-approval");
      const approvalId = (wait?.condition as { approvalId?: unknown } | undefined)?.approvalId;
      if (typeof approvalId !== "string") throw new Error(`INTENT: governed commit run ${view.runId} waits on something other than SEA-Forge`);
      await audit(intent, "awaiting_authority", `SEA-Forge escalated; awaiting approval ${approvalId}`);
      throw new AwaitingAuthorityError(intent, view.runId, approvalId);
    }
    const reason = view.error ?? `run ${view.status}`;
    await audit(intent, "refused", reason);
    throw new Error(`INTENT: governed commit refused: ${reason}`);
  }

  async function resolveNavigationApproval(request: { readonly approvalId: string; readonly resolution: "approved" | "rejected" }): Promise<IntentCommit> {
    if (!approvals) throw new Error("APPROVAL: no operator is configured to answer escalations (COGNATE_SEA_FORGE_OPERATOR)");
    // An agent must never answer its own escalation: only the human operator's session may.
    if (caller.actor.kind !== "user") throw new Error("APPROVAL: only a human operator may answer an escalation");
    // Pick up a decision already made at SEA-Forge directly before answering again.
    await runtime.runtime.pollApprovals();
    const wait = (await runtime.runtime.service.listContinuations(caller, {})).find(
      (c) => c.type === "governance-approval" && (c.condition as { approvalId?: unknown } | null)?.approvalId === request.approvalId,
    );
    if (!wait) throw new Error(`APPROVAL: no governed commit waits on ${request.approvalId}`);
    const run = await runtime.runtime.service.getRun(caller, { runId: wait.runId });
    if (run.agent !== NAVIGATION_COMMIT_AGENT.id) throw new Error(`APPROVAL: ${request.approvalId} does not belong to a navigation commit`);
    const intent = (run.input as unknown as { intent: CommitIntentInput }).intent;
    if (wait.status !== "OPEN") {
      // Already decided (at SEA-Forge directly, or by an earlier resolution): report that outcome, never
      // a second decision. A finished commit is not answered again.
      if (terminal(run.status) && run.status !== "completed") return settleCommitRun(intent, run);
      throw new Error(`APPROVAL: ${request.approvalId} was already decided (run ${run.status})`);
    }
    await resolveApproval(approvals, request);
    await runtime.runtime.pollApprovals();
    return settleCommitRun(intent, await runOutcome(run.runId, terminal));
  }

  async function settleNavigationIntent(intentId: string): Promise<NavigationSettlement> {
    const store = runtime.runtime.store;
    const prior = await latestSettlement(store, caller.tenant, intentId);
    if (prior?.settlement_reference.final) return prior;
    const committed = (await readIntentRecords(store)).find((entry) => entry.record.intent_id === intentId && entry.event.tenant === caller.tenant);
    if (!committed) throw new Error(`SETTLEMENT: intent ${intentId} was never committed`);
    let execution: ExecutionRecord = { record_event_id: committed.event.eventId, position: committed.event.position, invocation_event_id: null, operation_id: null };
    let observation = prior?.realitytrace_observation ?? null;
    const record = async (reference: SettlementReference): Promise<NavigationSettlement> => {
      const settlement: NavigationSettlement = { intent_id: intentId, execution_record: execution, realitytrace_observation: observation, settlement_reference: reference, at: new Date().toISOString() };
      await appendSettlement(store, { settlement, tenant: caller.tenant, scopeId: `horizon-${caller.tenant}` });
      return settlement;
    };
    const unavailable = (reason: string) => record({ status: "unavailable", final: false, envelope_id: null, ledger_entry: null, reason });
    const refused = (reason: string) => record({ status: "refused", final: false, envelope_id: null, ledger_entry: null, reason });

    if (governance.mode !== "sea-forge") return unavailable("SEA-Forge governance is off: the commit carries no authority decision to settle");
    const invocation = await governedInvocationOf(intentId);
    const authority = invocation ? authorityOf(invocation) : undefined;
    if (!invocation || !authority) return unavailable("the commit carries no recorded SEA-Forge decision");
    execution = { ...execution, invocation_event_id: invocation.eventId, operation_id: authority.operationId };
    const seaForge = governance.authority as Partial<SettlementAuthority> | undefined;
    if (typeof seaForge?.submitEvidence !== "function" || typeof seaForge.settle !== "function") return unavailable("the configured authority cannot settle");
    if (!evidence) return unavailable("RealityTrace is not configured (COGNATE_REALITYTRACE_BIN)");

    if (!observation) {
      try {
        const targetRef = await evidence.observe(invocation);
        const derived = await evidence.evidenceFor(targetRef);
        const packet = await evidence.packet(authority.worldRef, authority, derived);
        const receipt = await seaForge.submitEvidence(packet);
        if (!receipt.ok) return refused(`SEA-Forge refused the evidence: ${receipt.errorClass}: ${receipt.error}`);
        observation = { target_ref: targetRef, sxr_observation_id: derived.sxrObservationId, evidence_id: derived.evidenceId, evidence_packet_id: receipt.envelopeId, evidence_ledger_entry: receipt.ledgerEntry };
      } catch (error) {
        return unavailable(`RealityTrace: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const settled = await seaForge.settle(authority.operationId, authority.worldRef);
    if (!settled.ok) {
      return settled.errorClass === "unreachable" ? unavailable(`SEA-Forge: ${settled.error}`) : refused(`SEA-Forge refused the settlement: ${settled.errorClass}: ${settled.error}`);
    }
    return record({ status: settled.status, final: settled.final, envelope_id: String(settled.envelope.envelope_id), ledger_entry: settled.ledgerEntry, reason: null });
  }

  /** The governed `run.invocation` of the commit capability in this intent's commit run. */
  async function governedInvocationOf(intentId: string): Promise<GovernedInvocation | undefined> {
    for (const run of await runtime.runtime.service.listRuns(caller, { agent: NAVIGATION_COMMIT_AGENT.id })) {
      if ((run.input as { intent?: { intent_id?: unknown } } | null)?.intent?.intent_id !== intentId) continue;
      const events = await runtime.runtime.store.readStream(`run-${run.runId}`, {});
      const invocation = events.find((e) => e.eventType === "run.invocation" && (e.metadata as { capability?: unknown } | undefined)?.capability === NAVIGATION_INTENT_COMMIT.id);
      if (invocation) return { eventId: invocation.eventId, correlationId: invocation.correlationId, occurredAt: invocation.occurredAt, metadata: (invocation.metadata ?? {}) as Record<string, unknown> };
    }
    return undefined;
  }

  /** Submit an already-built intent: refused intents are audited and write no record. */
  async function submitIntent(intent: CommitIntentInput): Promise<IntentCommit> {
    if (governance.mode === "sea-forge") return governedSubmit(intent);
    let result: CommitIntentOutput;
    try {
      result = (await runtime.runtime.service.invoke(caller, {
        capability: NAVIGATION_INTENT_COMMIT.id,
        input: intent as unknown as Json,
      })) as unknown as CommitIntentOutput;
    } catch (error) {
      // Refused: no intent record is written, but the attempt is not silent.
      await audit(intent, "refused", error instanceof Error ? error.message : String(error));
      throw error;
    }
    let recorded;
    try {
      recorded = await appendIntentRecord(runtime.runtime.store, {
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
    } catch (error) {
      // duplicate_intent: the id was already committed with different input; audited like any refusal.
      if (error instanceof IntentError) await audit(intent, "refused", error.message);
      throw error;
    }
    await audit(intent, "accepted", null);
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

  /**
   * The surface routes present. Nothing here reduces or projects for itself: every transport
   * calls the one seam in `ui/surface.ts`, so GUI, CLI and MCP cannot drift (PE-01/PE-04).
   *
   * `allowFileReads` is false for every route: a caller reaching this process over the wire has
   * not shown it a filesystem permit, so a `file:` source is refused rather than read.
   */
  function routeContext(): SurfaceRouteContext {
    return {
      root: process.cwd(),
      allowFileReads: false,
      // `SemanticRef`s are a closed union; a caller's string is compared after the binder has
      // already refused anything that is not one of them.
      resolveEntity: (ref) => world.projection.objects.find((object) => String(object.ref) === ref),
      ...(research.kind === "research"
        ? {}
        : {
            resolveHorizon: (key) =>
              key === "horizon.research.health"
                ? { status: "blocked" as const, reason: `research_source: ${research.code}` }
                : undefined,
          }),
    };
  }

  /** `horizon.surface/2` for the current frame, projected for one presenting role. */
  function surfaceFor(role: SurfaceRole): ReturnType<typeof projectForRole> {
    const { frame } = issueFrame();
    return projectForRole(composeSurface(frame), role, frame, bindingContextOf(routeContext()));
  }

  /**
   * Commit an intent a transport expressed in its own vocabulary, after checking that the
   * canonical intent is the one the surface offered. A divergent submission (another
   * operation, frame or actor) is refused rather than "closest-matched" (PE-04/NE-09).
   */
  async function commitSurfaceIntent(
    submission: SurfaceIntentRequestBody,
  ): Promise<
    | { readonly ok: true; readonly result: IntentCommit; readonly bound: EquivalenceResult }
    | { readonly ok: false; readonly code: string; readonly message: string }
  > {
    const frame = frames.current();
    if (frame === null) return { ok: false, code: "stale_surface", message: "SURFACE: no frame is current; request the surface first" };
    if (typeof submission.frame_id === "string" && submission.frame_id !== frame.frame_id) {
      return { ok: false, code: "stale_surface", message: `SURFACE: frame ${submission.frame_id} is not the current frame` };
    }
    const role: SurfaceRole = submission.role === "agent" || submission.role === "system" ? submission.role : "human";
    const offered = projectForRole(composeSurface(frame), role, frame, bindingContextOf(routeContext()));
    if (!offered.ok) return { ok: false, code: offered.code, message: JSON.stringify(offered.issues) };
    const view: GuiView = offered.view;

    // Every transport is reduced to one canonical intent by the same function; a submission
    // the projection cannot place is refused rather than "closest-matched" (PE-04/NE-09).
    const bound: EquivalenceResult =
      submission.transport === "gui"
        ? typeof submission.node_id === "string"
          ? canonicalIntent({ transport: "gui", view, node_id: submission.node_id, role })
          : { ok: false, code: "unknown_node" }
        : typeof submission.operation === "string"
          ? canonicalIntent({ transport: submission.transport, view, operation: submission.operation, role })
          : { ok: false, code: "operation_not_in_view" };
    if (!bound.ok) return { ok: false, code: bound.code, message: `SURFACE: ${bound.code}` };

    const match = view.actions.find((action) => action.action_id === bound.intent.action_id);
    if (match === undefined) return { ok: false, code: "not_offered", message: "SURFACE: the intent names no action" };
    if (match.affordance !== "available") {
      // Possibility is not affordance: an operation the frame assessed as blocked, unknown or
      // conflicted is reported as such, never invoked because it was syntactically well-formed.
      return { ok: false, code: "not_affordable", message: `SURFACE: ${bound.intent.operation} is ${match.affordance}` };
    }
    try {
      return { ok: true, result: await commitNavigationIntent({ operationRef: bound.intent.operation }), bound };
    } catch (error) {
      if (error instanceof AwaitingAuthorityError) return { ok: false, code: error.code, message: error.message };
      throw error;
    }
  }

  /**
   * Read the operational projection once and build the navigation frame a terminal or agent
   * consumes. The declared vocabulary is taken from the pinned semantic world; operational
   * relation declarations are not invented here, because the sequential reader only inspects
   * objects and their already-projected links.
   */
  /**
   * The declared vocabulary of the pinned world, as the T06 adapter needs it.
   *
   * Relation types are read from the world's declared relations, not invented: the debugger
   * refuses to traverse a relation the world does not declare, and an empty set means "this
   * reader knows of no declared relation", which the debugger reports rather than silently
   * traversing operational links it was never authorised to interpret.
   */
  function declaredFor(tenant: string): DeclaredWorld {
    const types = new Set<SemanticRef>();
    for (const object of world.projection.objects) {
      if (object.kind === "Entity" || object.kind === "EntityInstance") types.add(object.ref.id as SemanticRef);
    }
    return { world_ref: world.worldRef, tenant, types, relations: new Set() };
  }

  async function readNavigation(options: NavigationOptions = {}): Promise<{ readonly frame: NavigationFrameV2; readonly projection: ProjectionView }> {
    const declared = declaredFor(caller.tenant);
    const read = await readProjection(runtime.runtime.store, declared, world.worldRef);
    if (!read.ok) throw new Error(`NAVIGATION: operational projection is unavailable: ${read.reason}`);
    const objects = [...read.view.objects].sort((left, right) => (left.object_ref < right.object_ref ? -1 : left.object_ref > right.object_ref ? 1 : 0));
    const focus = options.focusRef ?? objects[0]?.object_ref ?? `focus:${world.worldRef}`;
    const frame = buildOperationalFrame(
      {
        observer_ref: caller.actor.id,
        tenant_ref: caller.tenant,
        world_ref: world.worldRef,
        checkpoint_ref: checkpointOf(read.view),
        focus_ref: focus,
        case_ref: options.caseRef ?? `case:${focus}`,
        purpose: options.purpose ?? "keep the focused object inside its declared direction",
        direction_ref: options.directionRef ?? `direction:${focus}`,
        direction_statement: options.directionStatement ?? "navigate the focused object without changing the world",
        projection: read.view,
        declared,
      },
    ).frame;
    return { frame, projection: read.view };
  }

  async function navigationFrame(options: NavigationOptions = {}): Promise<NavigationFrameV2> {
    return (await readNavigation(options)).frame;
  }

  async function workspace(
    options: NavigationOptions & {
      readonly evidenceRef?: string;
      readonly theme?: WorkspaceTheme;
      /**
       * The answer this surface should carry, already read about this frame. The surface never asks
       * a question itself, so a rendered answer and its frame can never disagree.
       */
      readonly inspection?: { readonly debugger: WorkspaceDebugger; readonly retrieval: WorkspaceRetrieval | null };
    } = {},
  ): Promise<WorkspaceData> {
    const { frame, projection } = await readNavigation(options);
    const surface = surfaceFor("human");
    if (!surface.ok) throw new Error(`WORKSPACE: surface projection is unavailable: ${surface.code}`);
    const current: WorkspaceFrameRef = { frame_id: frame.frame_id, revision: frame.revision };
    const snapshot = buildWorkspace({
      frame,
      view: surface.view,
      objects: projection.objects,
      links: projection.links,
      current,
      ...(options.evidenceRef === undefined ? {} : { evidenceRef: options.evidenceRef }),
      ...(options.theme === undefined ? {} : { theme: options.theme }),
      ...(options.inspection === undefined ? {} : { debugger: options.inspection.debugger, retrieval: options.inspection.retrieval }),
    });
    return { frame, view: surface.view, objects: projection.objects, links: projection.links, current, snapshot };
  }

  /**
   * Answer one debugger question, and optionally cite reference material, about the shared focus.
   *
   * This is a read: it builds a frame exactly as the workspace does, reads the projection behind
   * it, and returns answers. It never commits, never appends and never selects a capability but
   * the registered read-only one, so an inspection cannot become a state change.
   */
  async function inspectFocus(
    operation: string,
    options: NavigationOptions & {
      readonly checkpointRef?: string;
      readonly query?: string;
      readonly arguments?: Omit<DebuggerArguments, "operation">;
    } = {},
  ): Promise<{ readonly frame: NavigationFrameV2; readonly debugger: WorkspaceDebugger; readonly retrieval: WorkspaceRetrieval | null }> {
    if (!(DEBUGGER_OPERATIONS as readonly string[]).includes(operation)) {
      throw new Error(`INSPECT: '${operation}' is not one of ${DEBUGGER_OPERATIONS.join(", ")}`);
    }
    const { frame, projection } = await readNavigation(options);
    const declared = declaredFor(caller.tenant);
    const sources: DebuggerSources = {
      frame,
      objects: projection.objects,
      links: projection.links,
      lineage: projection.lineage ?? [],
      declared_relations: [...declared.relations],
    };
    const runtimeForInspection = {
      // The capability is invoked, never the adapter: the renderer and debugger hold no client
      // (REQ-STACK-010). A refusal or an unavailable kernel comes back as a typed answer.
      invoke: async (query: string): Promise<ContextReferenceAnswer> =>
        (await runtime.runtime.service.invoke(caller, {
          capability: CONTEXT_REFERENCE.id,
          input: { operation: "query_reference", query } as unknown as Json,
        })) as unknown as ContextReferenceAnswer,
      readSnapshotAt: async (checkpointRef: string) => {
        const read = await readSnapshotAt(runtime.runtime.store, declared, world.worldRef, checkpointRef);
        // A checkpoint that cannot be restored says so; one that can hands over the rows it held.
        if (!read.ok) return { ok: false };
        return { ok: true, objects: read.objects, links: read.links };
      },
    };
    try {
      const result = await inspect(
        {
          frame,
          sources,
          operation: operation as DebuggerOperation,
          ...(options.checkpointRef === undefined ? {} : { checkpoint_ref: options.checkpointRef }),
          ...(options.arguments === undefined ? {} : { arguments: options.arguments }),
          ...(options.query === undefined ? {} : { query: options.query }),
        },
        runtimeForInspection,
      );
      return { frame, ...result };
    } catch (error) {
      // The capability refused or could not be reached. The debugger answer is still the local
      // answer; only the citation row degrades, and it degrades to a named fact (REQ-STACK-005).
      const local = runDebugger(sources, { operation: operation as DebuggerOperation } as DebuggerArguments);
      return {
        frame,
        debugger: debuggerView(local),
        retrieval: options.query === undefined || options.query.trim() === ""
          ? null
          : missingRetrieval("unavailable", error instanceof Error ? `the context reference capability refused: ${error.message}` : "the context reference capability could not be reached"),
      };
    }
  }

  return {
    loaded,
    world,
    runtime,
    caller,
    research,
    frames,
    frame: () => issued,
    navigationFrame,
    workspace,
    inspectFocus,
    commitNavigationIntent,
    submitIntent,
    resolveNavigationApproval,
    settleNavigationIntent,
    startObservation,
    surface: surfaceFor,
    surfaceSchema: publishSurfaceSchema,
    commitSurfaceIntent,
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
            try {
              return Response.json(await commitNavigationIntent({ operationRef: record.operation_ref }));
            } catch (error) {
              if (!(error instanceof AwaitingAuthorityError)) throw error;
              // Accepted for a decision, not committed: the operator answers it at SEA-Forge.
              return Response.json({ code: error.code, intent_id: error.intent.intent_id, approval_id: error.approvalId, run_id: error.runId }, { status: 202 });
            }
          }
          if (url.pathname === "/surface") {
            const role = url.searchParams.get("role");
            if (role !== null && role !== "human" && role !== "agent" && role !== "system") {
              return Response.json({ code: "invalid_argument", message: `SURFACE: unknown role '${role}'` }, { status: 400 });
            }
            const projection = surfaceFor(role ?? "human");
            if (!projection.ok) {
              // Fail closed: a surface its own grammar rejects is a 500, never a best-effort page.
              return Response.json({ code: projection.code, issues: projection.issues }, { status: 500 });
            }
            // `Accept` selects the rendering; every rendering comes from the same projection.
            const accepts = request.headers.get("accept") ?? "";
            if (accepts.includes("text/html")) {
              return new Response(renderHtml(projection.view), { headers: { "content-type": "text/html; charset=utf-8" } });
            }
            if (accepts.includes("text/plain")) {
              return new Response(renderText(projection.view), { headers: { "content-type": "text/plain; charset=utf-8" } });
            }
            return Response.json({ schema: SURFACE_SCHEMA, frame: frames.current()?.frame_id, view: projection.view });
          }
          if (url.pathname === "/surface/schema") {
            return Response.json(publishSurfaceSchema());
          }
          if (url.pathname === "/surface/intent" && request.method === "POST") {
            let body: unknown;
            try {
              body = await request.json();
            } catch {
              return Response.json({ code: "invalid_argument", message: "SURFACE: body is not JSON" }, { status: 400 });
            }
            const record = (body ?? {}) as Record<string, unknown>;
            const transport = record.transport === "gui" || record.transport === "cli" || record.transport === "mcp" ? record.transport : "mcp";
            const outcome = await commitSurfaceIntent({
              transport,
              role: record.role,
              operation: record.operation,
              node_id: record.node_id,
              frame_id: record.frame_id,
            });
            return outcome.ok
              ? Response.json({ ok: true, intent: outcome.bound, committed: outcome.result })
              : Response.json({ ok: false, code: outcome.code, message: outcome.message }, { status: 409 });
          }
          if (url.pathname === "/workspace" && request.method === "GET") {
            const theme = url.searchParams.get("theme") === "light" ? "light" as const : "dark" as const;
            const evidenceRef = url.searchParams.get("evidence");
            const data = await workspace({
              ...(url.searchParams.get("focus") === null ? {} : { focusRef: url.searchParams.get("focus") as string }),
              ...(evidenceRef === null ? {} : { evidenceRef }),
              theme,
            });
            // An `operation=` on the page is answered server-side and rendered with the frame it
            // was answered about, so the surface never shows an answer next to a different focus.
            const inspectOperation = url.searchParams.get("operation");
            const inspectQuery = url.searchParams.get("query");
            const inspected = inspectOperation !== null && (DEBUGGER_OPERATIONS as readonly string[]).includes(inspectOperation)
              ? await inspectFocus(inspectOperation, {
                  ...(url.searchParams.get("focus") === null ? {} : { focusRef: url.searchParams.get("focus") as string }),
                  ...(inspectQuery === null ? {} : { query: inspectQuery }),
                })
              : null;
            const html = await renderWorkspacePage({
              service: runtime.runtime.service,
              caller,
              frame: data.frame,
              view: data.view,
              current: data.current,
              evidenceRef,
              theme,
              expectedObjects: data.objects.length,
              debuggerAnswer: inspected?.debugger ?? null,
              retrievalAnswer: inspected?.retrieval ?? null,
            });
            return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
          }
          if (url.pathname === "/workspace.json" && request.method === "GET") {
            const theme = url.searchParams.get("theme") === "light" ? "light" as const : "dark" as const;
            const evidenceRef = url.searchParams.get("evidence");
            const data = await workspace({
              ...(url.searchParams.get("focus") === null ? {} : { focusRef: url.searchParams.get("focus") as string }),
              ...(evidenceRef === null ? {} : { evidenceRef }),
              theme,
            });
            return Response.json(data.snapshot, { headers: { "cache-control": "no-store" } });
          }
          if (url.pathname === "/workspace/inspect" && request.method === "GET") {
            // Read-only, deliberately: GET, no form, no commit. The operation is one of the seven
            // published ones or the request is refused before any read happens.
            const operation = url.searchParams.get("operation") ?? "why";
            if (!(DEBUGGER_OPERATIONS as readonly string[]).includes(operation)) {
              return Response.json(
                { code: "invalid_argument", message: `INSPECT: operation must be one of ${DEBUGGER_OPERATIONS.join(", ")}` },
                { status: 400 },
              );
            }
            const focus = url.searchParams.get("focus");
            const checkpoint = url.searchParams.get("checkpoint");
            const query = url.searchParams.get("query");
            const data = await inspectFocus(operation, {
              ...(focus === null ? {} : { focusRef: focus }),
              ...(checkpoint === null ? {} : { checkpointRef: checkpoint }),
              ...(query === null ? {} : { query }),
            });
            return Response.json(
              {
                schema: "horizon.inspection/1",
                frame: { frame_id: data.frame.frame_id, revision: data.frame.revision, focus: data.frame.focus_ref },
                operations: DEBUGGER_OPERATIONS,
                debugger: data.debugger,
                retrieval: data.retrieval,
              },
              { headers: { "cache-control": "no-store" } },
            );
          }
          if (url.pathname === "/workspace/intent" && request.method === "POST") {
            let form: FormData;
            try {
              form = await request.formData();
            } catch {
              return Response.json({ code: "invalid_argument", message: "WORKSPACE: body is not a form" }, { status: 400 });
            }
            const actionId = form.get("action_id");
            if (typeof actionId !== "string" || actionId === "") {
              return Response.json({ code: "invalid_argument", message: "WORKSPACE: action_id is required" }, { status: 400 });
            }
            const submittedFrame = form.get("frame_id");
            const submittedRevision = form.get("frame_revision");
            const focus = typeof form.get("focus") === "string" ? (form.get("focus") as string) : undefined;
            const evidence = typeof form.get("evidence") === "string" && (form.get("evidence") as string) !== "" ? (form.get("evidence") as string) : undefined;
            const theme = form.get("theme") === "light" ? "light" as const : "dark" as const;
            const data = await workspace({ ...(focus === undefined ? {} : { focusRef: focus }), ...(evidence === undefined ? {} : { evidenceRef: evidence }), theme });
            if (
              typeof submittedFrame !== "string" || submittedFrame === "" ||
              (submittedRevision !== null && String(data.frame.revision) !== String(submittedRevision))
            ) {
              return Response.json({ code: "invalid_argument", message: "WORKSPACE: frame_id and frame_revision are required" }, { status: 400 });
            }
            if (submittedFrame !== data.frame.frame_id) {
              return Response.json({ code: "stale_surface", message: `WORKSPACE: frame ${submittedFrame} is not the current frame` }, { status: 409 });
            }
            const action = data.view.actions.find((candidate) => candidate.action_id === actionId);
            if (action === undefined || action.posture !== "offered" || action.affordance !== "available") {
              return Response.json({ code: "not_available", message: `WORKSPACE: ${actionId} is not an available action in the current view` }, { status: 409 });
            }
            const outcome = await commitSurfaceIntent({ transport: "gui", role: "human", node_id: actionId });
            if (!outcome.ok) return Response.json({ code: outcome.code, message: outcome.message }, { status: 409 });
            const query = new URLSearchParams({ result: `intent:${actionId}` });
            if (focus !== undefined) query.set("focus", focus);
            if (evidence !== undefined) query.set("evidence", evidence);
            query.set("theme", theme);
            return Response.redirect(`/workspace?${query.toString()}`, 303);
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

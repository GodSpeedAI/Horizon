import { reconcilePending } from "./capabilities/pending-reconcile.ts";
import { randomBytes, randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { createIdentityService, type IdentityService } from "@godspeed/identity";
import { delegatingAuthority, delegationSender } from "./adapters/delegating-authority.ts";
import { identityStoreOf } from "./remote/identity-store.ts";
import { OperatorActors, resolveOperatorsConfig, validateOperatorActors } from "./remote/operators.ts";
import { statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Caller } from "@godspeedai/cognate-runtime-api";
import { governanceFromEnv, type GovernanceOptions } from "@godspeedai/cognate-runtime-bun";
import { loadWorld, type LoadedWorld } from "./adapters/semantic.ts";
import { observeResearch, requireResearch, type ResearchStatus } from "./adapters/research.ts";
import { economicsFromEnv, loadConfig } from "./config/load.ts";
import { ECONOMICS_SCHEMA } from "./economics/model.ts";
import type { LoadedConfig, OperatorsConfig } from "./config/types.ts";
import { createHorizonRuntime, type HorizonRuntime } from "./runtime/create.ts";
import { appendIntentAttempt, appendIntentRecord, createFrameRegister, NAVIGATION_INTENT_COMMIT, navigationIntentComponent, readIntentAttempts, readIntentRecords, type FrameRegister, type IntentAttempt } from "./capabilities/navigation-intent.ts";
import { checkPurpose, latestCase, onboardingSkipped, openCase, setOnboardingSkipped } from "./capabilities/workspace-records.ts";
import { CONTRACT_VERSION, contractVersionOf } from "./capabilities/capacity-ledger.ts";
import { activateContract } from "./capabilities/contract-upgrade.ts";
import { RealityTraceObligation } from "./adapters/realitytrace-obligation.ts";
import { realityTraceEconomics, type EconomicsSource } from "./adapters/realitytrace-economics.ts";
import { listPending, readPending, terminate, updatePending, type PendingIntent } from "./capabilities/pending-intent.ts";
import { type ObligationDeps, ObligationRefusal, bindingGates, close as closeWindow, prepare as prepareObligation, verifyRun } from "./settlement/obligation.ts";
import { assertSnapshotDir } from "./settlement/snapshot.ts";
import { isClosurePending, settleAwaitingClosure } from "./settlement/settle-awaiting-closure.ts";
import { windowOpen } from "./domain/expectation.ts";
import type { StructuralChoice } from "./domain/frame.ts";
import type { CandidateOperation } from "./domain/navigation.ts";
import type { ObservedPayment } from "./domain/payment.ts";
import { structuralObservationAgent, healthAgent, HEALTH_AGENT, type StructuralObservationRequest } from "./agents/health.ts";
import { navigationCommitAgent, NAVIGATION_COMMIT_AGENT, type NavigationCommitOutput } from "./agents/navigation-commit.ts";
import { approvalAuthorityFromEnv, listApprovals, resolveApproval, seaForgeCall, type ApprovalAuthority } from "./adapters/sea-forge-approvals.ts";
import { buildInbox, type InboxReadout } from "./domain/approval-inbox.ts";
import { authorityOf, defaultRealityTraceRepo, observationOutbox, realityTraceFromEnv, RealityTraceEvidence, type GovernedInvocation, type RealityTraceConfig, type SettlementAuthority } from "./adapters/settlement.ts";
import { appendSettlement, latestSettlement, type ExecutionRecord, type NavigationSettlement, type RealityTraceObservation, type SettlementReference } from "./capabilities/navigation-settlement.ts";
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
import {
  approvalAssuranceOf,
  buildWorkspace,
  moveOf,
  onboardingOf,
  statusOf,
  type StoredMoveFacts,
  type WorkspaceChrome,
  type WorkspaceDebugger,
  type WorkspaceFrameRef,
  type WorkspaceMove,
  type WorkspaceReceipt,
  type WorkspaceRetrieval,
  type WorkspaceSnapshot,
  type WorkspaceTheme,
} from "./ui/workspace/model.ts";
import { debuggerView, inspect, missingRetrieval } from "./ui/workspace/inspect.ts";
import type { ContextKernelAdapter, ContextReferenceAnswer } from "./adapters/context-kernel.ts";
import { CONTEXT_REFERENCE } from "./capabilities/context.ts";
import { runDebugger, DEBUGGER_OPERATIONS, type DebuggerArguments, type DebuggerOperation, type DebuggerSources } from "./domain/debugger.ts";
import { renderWorkspacePage } from "./ui/workspace/render.tsx";
import { renderEconomicsPage } from "./ui/workspace/economics.tsx";
import { renderApprovalInboxPage } from "./ui/workspace/approval-inbox.tsx";
import { renderComparePage, type ComparePageProps } from "./ui/workspace/compare.tsx";
import { compareSession, listSessions, onlyContradicted, type CompareView } from "./ui/workspace/compare-model.ts";
import { applyStandIns, namesOfRepos } from "./ui/workspace/presenting.ts";
import { listLabels, putLabel, type RunLabel } from "./capabilities/labels.ts";
import { presentingOn, setPresenting } from "./capabilities/workspace-records.ts";
import { readLedgerDay } from "./adapters/ledger-day.ts";
import { recordReader, type RecordReader } from "./adapters/realitytrace-economics.ts";
import { buildExport, chooseStandIns, writeExport } from "./exports/export.ts";
import { setupMapping } from "./config/setup.ts";
import type { RecordSource } from "./config/types.ts";
import { existsSync as fileExists, mkdirSync as makeDir, readFileSync as readFileText, writeFileSync as writeFileText } from "node:fs";
import { dirname as dirOf, join as joinPath } from "node:path";
import type { Server } from "bun";
import { RemoteController, type RemoteStatus } from "./remote/server.ts";
import { remoteSettings } from "./remote/settings.ts";
import { remotePanelPage } from "./remote/panel.ts";

type HttpServer = Server<unknown>;

/** The frame this application most recently issued and the gates assessed on it. */
/**
 * Why `approver` may not answer an escalation that `requester` raised, or null when it may. Fails closed: an unknown
 * requester or approver is refused, never treated as distinct. The requester is compared both as its recorded id and
 * as the SEA-Forge actor it maps to, so neither spelling lets a requester approve its own escalation.
 */
export function selfApprovalRefusal(input: {
  readonly requester: string | null | undefined;
  readonly approver: string | null | undefined;
  readonly actorFor: (id: string) => string | undefined;
}): string | null {
  if (typeof input.approver !== "string" || input.approver === "") return "the approver's identity cannot be determined, so this escalation cannot be approved";
  if (typeof input.requester !== "string" || input.requester === "") return "the requester of this escalation cannot be determined, so it cannot be approved";
  if (input.requester === input.approver || input.actorFor(input.requester) === input.approver) return "the requester cannot approve its own escalation";
  return null;
}

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
  /** GUI: the intent id the receipt will name, so a refused or awaiting commit is addressable. */
  readonly intent_id?: unknown;
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

/** Settlement in steps: `observe` records RealityTrace's observation, `rule` asks SEA-Forge to rule on it, `both` does both (the default). */
export type SettlementPhase = "observe" | "rule" | "both";

export interface HorizonApplication {
  readonly loaded: LoadedConfig;
  readonly world: LoadedWorld;
  readonly runtime: HorizonRuntime;
  readonly caller: Caller;
  /** The phone remote (passkey-paired, loopback listener). Off until started from the cockpit panel. */
  readonly remote: RemoteController;
  /** The shared identity service over the application's own store: durable operators, devices and sessions. */
  readonly identity: IdentityService;
  /** The validated operator-to-SEA-Forge-actor mapping. */
  readonly operatorActors: OperatorActors;
  /** The commit the phone makes, run as a session's Caller with its mapped SEA-Forge actor. Refuses any Caller that is not a mapped operator session. */
  commitForSession(actionId: string, intentId: string, who: Caller): Promise<{ readonly ok: true } | { readonly ok: false; readonly code: string; readonly message: string }>;
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
  /** `expectation` is the expected outcome (REQ-NAV-011) a bound operation that requires settlement must carry. */
  commitNavigationIntent(request: { readonly operationRef: string; readonly intentId?: string; readonly expectation?: unknown }): Promise<IntentCommit>;
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
  settleNavigationIntent(intentId: string, phase?: SettlementPhase): Promise<NavigationSettlement>;
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
    /**
     * Where case economics are read from (HC-06): a read-only RealityTrace reader. Defaults to the
     * `[economics]` config table / `HORIZON_ECONOMICS_REALITYTRACE_BIN`; unset, the view says it is not configured.
     */
    readonly economics?: EconomicsSource;
    /** Stage 1: how a `[[records.sources]]` entry is read for the comparison view. Tests inject a fake; default runs `realitytrace`. */
    readonly recordReader?: (source: RecordSource) => RecordReader;
    /** Stage 1: folder for the comparison cache, exports and the Presenting key. Defaults to the setup root, else beside the store. */
    readonly deskRoot?: string;
    /** Stage 1: the clock for "today" and export names. */
    readonly now?: () => Date;
    /** The SEA-Forge socket for `authority_closure`. Defaults to the approvals socket or `COGNATE_SEA_FORGE_SOCKET`. */
    readonly seaForgeSocket?: string;
    /**
     * Operator-to-SEA-Forge-actor mapping, replacing the `[operators]` config table. The only source of a
     * session's SEA-Forge actor. Absent in both: the single-operator development default.
     */
    readonly operators?: OperatorsConfig;
    /** The wire to SEA-Forge for delegated (`on_behalf_of`) commits. Injected by tests; defaults to the Unix socket. */
    readonly delegationSend?: (request: Record<string, unknown>) => Promise<Record<string, unknown>>;
  } = {},
): Promise<HorizonApplication> {
  const loaded = loadConfig(options.configPath);
  const economics = options.economics ?? realityTraceEconomics(economicsFromEnv(process.env, loaded.config.economics));
  const world = loadWorld(loaded.config.world_ref);
  const research = await observeResearch(loaded.config.research_command);
  const caller: Caller = { actor: loaded.operator.principal, tenant: loaded.operator.tenant };
  const frames = createFrameRegister();
  const configured = options.governance ?? governanceFromEnv(process.env);
  // Poll SEA-Forge for decided escalations, so a commit approved or rejected at SEA-Forge directly
  // (not through resolveNavigationApproval) still resumes or fails on its own.
  const approvals = options.approvals ?? approvalAuthorityFromEnv(process.env, caller.actor.id);
  // A signed-in operator's commits go to SEA-Forge as the gateway acting on behalf of the operator's mapped actor.
  // The mapping is validated after the identity store opens; until then every session operator is refused.
  let operatorActors: OperatorActors | null = null;
  const serviceActor = approvals?.service ?? { actor_id: process.env.COGNATE_SEA_FORGE_ACTOR?.trim() || "cognate-service", role: "service" };
  const delegationSocket = options.seaForgeSocket ?? approvals?.socketPath ?? process.env.COGNATE_SEA_FORGE_SOCKET?.trim() ?? "";
  const governance: GovernanceOptions =
    configured.mode === "sea-forge"
      ? {
          ...configured,
          approvalPollMs: configured.approvalPollMs ?? 2_000,
          ...(configured.authority === undefined
            ? {}
            : {
                authority: delegatingAuthority(configured.authority, {
                  service: serviceActor,
                  actors: () => operatorActors,
                  serverPrincipalId: caller.actor.id,
                  send: options.delegationSend ?? delegationSender(delegationSocket),
                }),
              }),
        }
      : configured;
  /** Whom a commit runs as: the session's Caller inside `commitAs`, otherwise the cockpit's own operator. */
  const acting = new AsyncLocalStorage<Caller>();
  const actor = (): Caller => acting.getStore() ?? caller;
  const realityTrace =
    governance.mode !== "sea-forge"
      ? undefined
      : options.realityTrace === null
        ? undefined
        : (options.realityTrace ?? realityTraceFromEnv(process.env, defaultRealityTraceRepo(options.storePath ?? process.env.HORIZON_STORE ?? loaded.config.runtime_store)));
  // HORIZON-001 1.1.0: bound operations, capacity and the obligation flow (SPEC-CR-002).
  const bindingFor = (operationRef: string) => loaded.config.operations.find((binding) => binding.operation_ref === operationRef);
  const obligationDeps: ObligationDeps = {
    store: () => runtime.runtime.store,
    tenant: caller.tenant,
    // Its own repository in the same RealityTrace home, so SEA-Forge reads both through one data home.
    realityTrace: realityTrace ? new RealityTraceObligation({ bin: realityTrace.bin, dataHome: realityTrace.dataHome, stateHome: realityTrace.stateHome, repoDir: `${realityTrace.repoDir}-obligations` }) : null,
    settlement: loaded.config.settlement ?? null,
    // The verifier reads a read-only snapshot of the store, never the live WAL database (see settlement/snapshot.ts).
    get snapshot() {
      return loaded.config.settlement ? { liveStore: runtime.storePath, dir: snapshotDirOf(loaded.config.settlement, runtime.storePath) } : undefined;
    },
    allowances: loaded.config.capacity,
    settlementConfigured: governance.mode === "sea-forge" && realityTrace !== undefined,
    now: () => new Date(),
  };
  const runtime: HorizonRuntime = await createHorizonRuntime(loaded.config, world, {
    caller,
    ...(options.storePath ? { storePath: options.storePath } : {}),
    components: [navigationIntentComponent(frames)],
    agents: [structuralObservationAgent(frames), navigationCommitAgent(() => runtime.runtime.store, { bindingFor, deps: obligationDeps })],
    ...(options.contextAdapter === undefined ? {} : { contextAdapter: options.contextAdapter }),
    governance,
    // The observation commits with the governed invocation itself (the outbox), so it cannot be lost.
    ...(realityTrace ? { outboxFor: observationOutbox(NAVIGATION_INTENT_COMMIT.id) } : {}),
  });
  if (loaded.config.settlement) assertSnapshotDir(snapshotDirOf(loaded.config.settlement, runtime.storePath), runtime.storePath);
  // HORIZON-001 1.1.0: suspend pending v1 commit runs and mark the store before anything is served.
  await activateContract(runtime.runtime.store, new Date());
  // Durable operators, sessions and devices live in the same store. Operators named in configuration are
  // provisioned here (the host's administrative act); the mapping is then validated, never trusted blindly.
  const identity = createIdentityService(identityStoreOf(runtime.runtime.store));
  const identityTenant = identityTenantOf(caller.tenant);
  const operatorsConfig = resolveOperatorsConfig(options.operators ?? loaded.config.operators);
  for (const operatorId of Object.keys(operatorsConfig.actors)) await identity.registerOperator({ tenant: identityTenant, operatorId, label: "configured operator" });
  operatorActors = await validateOperatorActors(operatorsConfig, { identity, tenant: identityTenant, serviceActorId: serviceActor.actor_id });
  const mappedActors: OperatorActors = operatorActors;
  /** Why a session Caller may not commit, or null when it may. */
  function sessionRefusal(who: Caller): string | null {
    if (who.tenant !== caller.tenant || who.actor.kind !== "user" || who.actor.id === caller.actor.id) return "SESSION: not a signed-in operator session";
    if (who.actor.id === serviceActor.actor_id) return "SESSION: the gateway service identity cannot be used as the operator";
    if (mappedActors.actorFor(who.actor.id) === undefined) return `SESSION: no SEA-Forge actor is configured for operator ${who.actor.id}`;
    return null;
  }
  // Complete accounting for terminal intents that still hold; awaiting-authority holds are only reported.
  const stranded = await reconcilePending(runtime.runtime.store, caller.tenant);
  if (stranded.blockers.length > 0) console.error(`horizon: ${stranded.blockers.length} intent(s) hold capacity awaiting authority`);
  const evidence = realityTrace ? new RealityTraceEvidence(runtime.runtime.store, realityTrace) : undefined;
  let issued: FrameView | null = null;
  let boundChoices: readonly StructuralChoice[] = [];
  const windowTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const closureSocket = options.seaForgeSocket ?? approvals?.socketPath ?? process.env.COGNATE_SEA_FORGE_SOCKET?.trim() ?? "";

  /**
   * Bound operations as frame choices. At frame time no expectation exists, so settlement readiness is assessed
   * with a well-formed placeholder naming the binding's template (template, digests, configuration); the
   * concrete expectation is assessed when the intent is committed.
   */
  async function refreshBoundChoices(): Promise<void> {
    const choices: StructuralChoice[] = [];
    for (const binding of loaded.config.operations) {
      const placeholder = binding.verifier
        ? { modality: "obligation", statement: "-", refuted_by: "-", irrelevant: [], unaccounted: [], verifier: { template_ref: `${binding.verifier.template_id}@${binding.verifier.version}` }, window_s: 60 }
        : undefined;
      const gates = await bindingGates(obligationDeps, binding, placeholder);
      const failing = (Object.entries(gates) as [string, { verdict: string; reason?: string }][]).filter(([, gate]) => gate.verdict !== "pass");
      const blocked = failing.find(([, gate]) => gate.verdict === "fail");
      choices.push({
        operation_ref: binding.operation_ref,
        label: binding.label,
        assessment: {
          status: blocked ? "blocked" : failing.length > 0 ? "unknown" : "available",
          first_blocker: failing.length > 0 ? `${failing[0]![0]}: ${failing[0]![1].reason ?? failing[0]![1].verdict}` : null,
          reversibility: binding.reversibility,
        },
      });
    }
    boundChoices = choices;
  }
  await refreshBoundChoices();
  // Resume stored windows. A restart mid-window resumes the same window; a window that closed while Horizon was
  // down is closed late, which SEA-Forge settles unresolved (C cannot be proven on time), never from late evidence.
  for (const pending of await listPending(runtime.runtime.store, caller.tenant)) {
    if (!pending.terminal && pending.stage === "executed") scheduleClose(pending);
  }

  /** Issue a frame for the current request and register it as the one an intent may name. */
  function issueFrame(checkpointRef = checkpointRefOf(runtime.storePath)): FrameView {
    const frame = buildStructuralFrame({
      frameId: `frame-${randomUUID()}`,
      observerRef: caller.actor.id,
      world,
      checkpointRef,
      bound: boundChoices,
      ...(research.kind === "research"
        ? {}
        : { availability: { status: "unknown" as const, firstBlockers: { "horizon.research.health": `research_source: ${research.code}` } } }),
    });
    frames.issue(frame);
    issued = { frame };
    return issued;
  }

  function audit(intent: CommitIntentInput, outcome: IntentAttempt["outcome"], reason: string | null, approvalId: string | null = null) {
    const attempt: IntentAttempt = { intent_id: intent.intent_id, actor_ref: intent.actor_ref, caller_ref: actor().actor.id, outcome, reason, at: new Date().toISOString(), operation_ref: intent.operation_ref, approvalId };
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
      run = await runtime.runtime.service.startRun(actor(), {
        agent: NAVIGATION_COMMIT_AGENT.id,
        input: { intent, contract_version: CONTRACT_VERSION } as unknown as Json,
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
      await afterExecution(intent.intent_id);
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
      frames.retain(intent.frame_id);
      await audit(intent, "awaiting_authority", `SEA-Forge escalated; awaiting approval ${approvalId}`, approvalId);
      throw new AwaitingAuthorityError(intent, view.runId, approvalId);
    }
    const reason = view.error ?? `run ${view.status}`;
    await audit(intent, "refused", reason);
    throw new Error(`INTENT: governed commit refused: ${reason}`);
  }

  async function resolveNavigationApproval(request: { readonly approvalId: string; readonly resolution: "approved" | "rejected" }, who?: Caller): Promise<IntentCommit> {
    if (!approvals) throw new Error("APPROVAL: no operator is configured to answer escalations (COGNATE_SEA_FORGE_OPERATOR)");
    // An agent must never answer its own escalation: only the human operator's session may.
    if (caller.actor.kind !== "user") throw new Error("APPROVAL: only a human operator may answer an escalation");
    // A session answers as its own mapped actor, never as the configured approver, and never to its own request.
    let authority = approvals;
    if (who !== undefined) {
      const refusal = sessionRefusal(who);
      if (refusal !== null) throw new Error(`APPROVAL: ${refusal}`);
      authority = { ...approvals, operator: { actor_id: mappedActors.actorFor(who.actor.id)!, role: "operator" } };
    }
    // The check runs on every path (session or desktop) and always fails closed on an unknown identity.
    const approver = who !== undefined ? mappedActors.actorFor(who.actor.id) : approvals.operator.actor_id;
    const asked = (await readIntentAttempts(runtime.runtime.store)).filter((entry) => entry.outcome === "awaiting_authority" && entry.approvalId === request.approvalId).at(-1);
    const selfRefusal = selfApprovalRefusal({ requester: asked?.caller_ref, approver, actorFor: (id) => mappedActors.actorFor(id) });
    if (selfRefusal !== null) throw new Error(`APPROVAL: ${selfRefusal}`);
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
    await resolveApproval(authority, request);
    await runtime.runtime.pollApprovals();
    return settleCommitRun(intent, await runOutcome(run.runId, terminal));
  }

  /** Append a settlement record for an executed intent, keeping the RealityTrace observation already recorded. */
  async function recordSettlementFor(intentId: string, reference: SettlementReference, observed?: RealityTraceObservation | null): Promise<NavigationSettlement> {
    const store = runtime.runtime.store;
    const prior = await latestSettlement(store, caller.tenant, intentId);
    const committed = (await readIntentRecords(store)).find((entry) => entry.record.intent_id === intentId && entry.event.tenant === caller.tenant);
    if (!committed) throw new Error(`SETTLEMENT: intent ${intentId} was never executed`);
    const invocation = await governedInvocationOf(intentId);
    const authority = invocation ? authorityOf(invocation) : undefined;
    const pendingObserved = (await readPending(store, caller.tenant, intentId))?.pending.observed;
    const settlement: NavigationSettlement = {
      intent_id: intentId,
      execution_record: { record_event_id: committed.event.eventId, position: committed.event.position, invocation_event_id: invocation?.eventId ?? null, operation_id: authority?.operationId ?? null },
      realitytrace_observation: observed ?? prior?.realitytrace_observation ?? null,
      settlement_reference: reference,
      ...(pendingObserved ? { observed_payment: pendingObserved } : {}),
      at: new Date().toISOString(),
    };
    await appendSettlement(store, { settlement, tenant: caller.tenant, scopeId: `horizon-${caller.tenant}` });
    return settlement;
  }

  /** The execution trace, as RealityTrace recorded it, submitted to SEA-Forge: SEA-Forge's execution floor. */
  async function submitExecutionEvidence(intentId: string, invocation: GovernedInvocation, authority: NonNullable<ReturnType<typeof authorityOf>>): Promise<void> {
    const seaForge = governance.authority as Partial<SettlementAuthority> | undefined;
    if (!evidence || typeof seaForge?.submitEvidence !== "function") throw new Error("RealityTrace and SEA-Forge evidence submission are both required");
    const prior = await latestSettlement(runtime.runtime.store, caller.tenant, intentId);
    if (prior?.realitytrace_observation) return;
    const targetRef = await evidence.observe(invocation);
    const derived = await evidence.evidenceFor(targetRef);
    const packet = await evidence.packet(authority.worldRef, authority, derived);
    const receipt = await seaForge.submitEvidence(packet);
    if (!receipt.ok) throw new Error(`SEA-Forge refused the execution evidence: ${receipt.errorClass}: ${receipt.error}`);
    await recordSettlementFor(
      intentId,
      { status: "pending", final: false, envelope_id: null, ledger_entry: null, reason: "executed; the window is open" },
      { target_ref: targetRef, sxr_observation_id: derived.sxrObservationId, evidence_id: derived.evidenceId, evidence_packet_id: receipt.envelopeId, evidence_ledger_entry: receipt.ledgerEntry },
    );
  }

  async function settleNavigationIntent(intentId: string, phase: SettlementPhase = "both"): Promise<NavigationSettlement> {
    const store = runtime.runtime.store;
    const prior = await latestSettlement(store, caller.tenant, intentId);
    if (prior?.settlement_reference.final) return prior;
    // Observing again is a no-op: the observation is kept and reused, never re-recorded.
    if (phase === "observe" && prior?.realitytrace_observation) return prior;
    // A bound operation settles through its obligation flow (or as not_required), never the evidence-item rule.
    const obligationPending = await readPending(store, caller.tenant, intentId);
    if (obligationPending) {
      if (phase !== "both") throw new Error("SETTLEMENT: this operation settles through its obligation window in one step; it cannot be observed and ruled on separately");
      const settled = await closeAndSettle(intentId);
      const latest = settled ?? (await latestSettlement(store, caller.tenant, intentId));
      if (latest) return latest;
      throw new Error(`SETTLEMENT: intent ${intentId} has not executed (${obligationPending.pending.terminal ? `${obligationPending.pending.terminal.outcome}: ${obligationPending.pending.terminal.reason ?? ""}` : obligationPending.pending.stage})`);
    }
    const committed = (await readIntentRecords(store)).find((entry) => entry.record.intent_id === intentId && entry.event.tenant === caller.tenant);
    if (!committed) throw new Error(`SETTLEMENT: intent ${intentId} was never committed`);
    let execution: ExecutionRecord = { record_event_id: committed.event.eventId, position: committed.event.position, invocation_event_id: null, operation_id: null };
    let observation = prior?.realitytrace_observation ?? null;
    const record = async (reference: SettlementReference): Promise<NavigationSettlement> => {
      const settlement: NavigationSettlement = { intent_id: intentId, execution_record: execution, realitytrace_observation: observation, settlement_reference: reference, at: new Date().toISOString() };
      await appendSettlement(store, { settlement, tenant: caller.tenant, scopeId: `horizon-${caller.tenant}` });
      return settlement;
    };
    // A v1 intent stays readable and is never backfilled: it carries no expected outcome to settle against.
    if (contractVersionOf(committed.record) === 1) {
      // Horizon does not rule on evidence: a v1 intent gets no SEA-Forge settlement, so it stays non-final and can be settled later.
      return record({ status: "unavailable", final: false, envelope_id: null, ledger_entry: null, reason: "contract_version 1: no expected outcome to settle against" });
    }
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

    // Ruling before observation is refused without writing a record: nothing was observed, so nothing is settled.
    if (phase === "rule" && !observation) throw new Error("SETTLEMENT: no RealityTrace observation to rule on: observe the commit first");
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
    // The observation step stops here: SEA-Forge has the evidence but has not ruled on it yet.
    if (phase === "observe") return record({ status: "pending", final: false, envelope_id: null, ledger_entry: null, reason: "RealityTrace observed the commit; SEA-Forge has not ruled yet" });
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
      result = (await runtime.runtime.service.invoke(actor(), {
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
        contract: { expectation: null, threshold: null, window: null },
      });
    } catch (error) {
      // duplicate_intent: the id was already committed with different input; audited like any refusal.
      if (error instanceof IntentError) await audit(intent, "refused", error.message);
      throw error;
    }
    await audit(intent, "accepted", null);
    await afterExecution(intent.intent_id);
    return { intent, result, position: recorded.position, eventId: recorded.eventId };
  }

  /** Source → frame → typed intent → commit. The route never supplies an observer. */
  async function commitNavigationIntent(request: { readonly operationRef: string; readonly intentId?: string; readonly expectation?: unknown }): Promise<IntentCommit> {
    const binding = bindingFor(request.operationRef);
    if (binding) await refreshBoundChoices();
    const { frame } = issueFrame();
    const intent = buildCommitIntent({ frame, operationRef: request.operationRef, intentId: request.intentId ?? randomUUID() });
    if (binding) {
      // Steps 1-2: gates, RealityTrace threshold, then the pending intent and its reservation, atomically.
      try {
        await prepareObligation(obligationDeps, binding, intent, request.expectation);
      } catch (error) {
        if (error instanceof ObligationRefusal || error instanceof IntentError) await audit(intent, "refused", error.message);
        throw error;
      } finally {
        await refreshBoundChoices();
      }
    } else if (request.expectation !== undefined) {
      throw new IntentError("invalid_argument", `INTENT: ${request.operationRef} is not a bound operation; it takes no expected outcome`);
    }
    return submitIntent(intent);
  }

  /**
   * Steps 5-6 after the commit run executed: an exempt intent settles not_required; otherwise record the
   * SEA-Forge operation, submit the execution evidence (SEA-Forge's execution floor), run one verification and
   * schedule the closure at window close. Idempotent: only an intent still awaiting authority moves on.
   */
  async function afterExecution(intentId: string): Promise<void> {
    const store = runtime.runtime.store;
    const found = await readPending(store, caller.tenant, intentId);
    if (!found || found.pending.stage !== "awaiting_authority") return;
    const pending = found.pending;
    const binding = bindingFor(pending.operation_ref);
    if (!pending.expectation || !binding) {
      await terminate(store, caller.tenant, intentId, "not_required", "read_only: nothing to settle", new Date());
      await recordSettlementFor(intentId, { status: "not_required", final: true, envelope_id: null, ledger_entry: null, reason: "read_only: nothing to settle" });
      await refreshBoundChoices();
      return;
    }
    const invocation = await governedInvocationOf(intentId);
    const authority = invocation ? authorityOf(invocation) : undefined;
    if (!invocation || !authority) {
      await recordSettlementFor(intentId, { status: "unavailable", final: false, envelope_id: null, ledger_entry: null, reason: "the commit carries no recorded SEA-Forge decision" });
      return;
    }
    const steering = await observedSteeringAttention(intentId).catch(() => null);
    const executed = await updatePending(store, caller.tenant, intentId, () => ({ stage: "executed", operation_id: authority.operationId, ...(steering ? { observed: [steering] } : {}) }));
    try {
      await submitExecutionEvidence(intentId, invocation, authority);
    } catch (error) {
      await recordSettlementFor(intentId, { status: "unavailable", final: false, envelope_id: null, ledger_entry: null, reason: `execution evidence: ${error instanceof Error ? error.message : String(error)}` });
    }
    await verifyRun(obligationDeps, binding, executed);
    scheduleClose(executed);
  }

  function scheduleClose(pending: PendingIntent): void {
    if (!pending.window || windowTimers.has(pending.intent.intent_id)) return;
    const delay = Math.max(0, Date.parse(pending.window.closes_at) - Date.now() + 50);
    const timer = setTimeout(() => {
      windowTimers.delete(pending.intent.intent_id);
      void closeAndSettle(pending.intent.intent_id).catch(() => {});
    }, delay);
    windowTimers.set(pending.intent.intent_id, timer);
  }

  /** Steps 7-8: SEA-Forge records C at window close, then settles from RealityTrace's ledger. */
  async function closeAndSettle(intentId: string): Promise<NavigationSettlement | null> {
    const store = runtime.runtime.store;
    const found = await readPending(store, caller.tenant, intentId);
    if (!found) return null;
    let pending = found.pending;
    if (pending.terminal) return latestSettlement(store, caller.tenant, intentId);
    if (pending.stage !== "executed" || !pending.window || !pending.operation_id) return latestSettlement(store, caller.tenant, intentId);
    if (windowOpen(pending.window, new Date())) {
      scheduleClose(pending);
      return recordSettlementFor(intentId, { status: "pending", final: false, envelope_id: null, ledger_entry: null, reason: "the window is still open" });
    }
    try {
      pending = await closeWindow(obligationDeps, pending, {
        closure: async (operationId, discrimination, verifications) => {
          if (!closureSocket || !approvals) throw new Error("no SEA-Forge socket is configured for authority_closure");
          const response = await seaForgeCall(closureSocket, { verb: "authority_closure", operation_id: operationId, discrimination_observation_id: discrimination, verification_observation_ids: verifications, request_id: `horizon:closure:${operationId}`, actor: approvals.service }, 30_000);
          if (response.ok !== true) throw new Error(`SEA-Forge refused the closure: ${String(response.error ?? response.error_class)}`);
          return { b: Number(response.b), c: Number(response.c), committed_at: String(response.committed_at), on_time: response.on_time === true };
        },
      });
    } catch (error) {
      // Without a recorded closure SEA-Forge still settles once deadline + grace passed: unresolved, rejected.
      await recordSettlementFor(intentId, { status: "unavailable", final: false, envelope_id: null, ledger_entry: null, reason: `closure: ${error instanceof Error ? error.message : String(error)}` });
    }
    const seaForge = governance.authority as Partial<SettlementAuthority> | undefined;
    const worldRef = (await governedInvocationOf(intentId).then((inv) => (inv ? authorityOf(inv)?.worldRef : undefined))) ?? world.cognateWorldRef;
    if (typeof seaForge?.settle !== "function") return recordSettlementFor(intentId, { status: "unavailable", final: false, envelope_id: null, ledger_entry: null, reason: "the configured authority cannot settle" });
    // "Settlement is pending" means SEA-Forge has not recorded the closure yet: wait for it (bounded by window close + grace), never refuse.
    const settle = seaForge.settle.bind(seaForge);
    const deadlineAt = Date.parse(pending.window!.closes_at) +(obligationDeps.settlement?.close_grace_s ?? 0) * 1000;
    const settled = await settleAwaitingClosure(() => settle(pending.operation_id!, worldRef), { deadlineAt });
    if (!settled.ok) {
      if (isClosurePending(settled)) return recordSettlementFor(intentId, { status: "pending", final: false, envelope_id: null, ledger_entry: null, reason: "settlement is pending: the closure is not recorded yet" });
      return recordSettlementFor(intentId, { status: settled.errorClass === "unreachable" ? "unavailable" : "refused", final: false, envelope_id: null, ledger_entry: null, reason: `SEA-Forge: ${settled.errorClass}: ${settled.error}` });
    }
    const ext = (settled.envelope.extensions as Record<string, Record<string, unknown>> | undefined)?.["godspeed.settlement_packet"] ?? {};
    const epistemic = typeof ext.epistemic_status === "string" ? (ext.epistemic_status as "supported" | "contradicted" | "inconsistent" | "unresolved") : undefined;
    const reference = { status: settled.status, final: settled.final, envelope_id: String(settled.envelope.envelope_id), ledger_entry: settled.ledgerEntry, reason: null, ...(epistemic ? { epistemic_status: epistemic } : {}) };
    const recorded = await recordSettlementFor(intentId, reference);
    if (settled.final) {
      await terminate(store, caller.tenant, intentId, settled.status, epistemic ?? null, new Date());
      await refreshBoundChoices();
    }
    return recorded;
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
      const intentId = typeof submission.intent_id === "string" && submission.intent_id !== "" ? submission.intent_id : undefined;
      return { ok: true, result: await commitNavigationIntent({ operationRef: bound.intent.operation, ...(intentId === undefined ? {} : { intentId }) }), bound };
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
    // The operator's latest open case frames the workspace unless a caller names its own case or purpose.
    const activeCase = options.caseRef === undefined && options.purpose === undefined ? await latestCase(runtime.runtime.store, caller.tenant) : null;
    const frame = buildOperationalFrame(
      {
        observer_ref: caller.actor.id,
        tenant_ref: caller.tenant,
        world_ref: world.worldRef,
        checkpoint_ref: checkpointOf(read.view),
        focus_ref: focus,
        case_ref: options.caseRef ?? activeCase?.case_ref ?? `case:${focus}`,
        purpose: options.purpose ?? activeCase?.purpose ?? "keep the focused object inside its declared direction",
        direction_ref: options.directionRef ?? `direction:${focus}`,
        direction_statement: options.directionStatement ?? "navigate the focused object without changing the world",
        projection: read.view,
        declared,
      },
      {},
      await boundCandidates(),
    ).frame;
    return { frame, projection: read.view };
  }

  /**
   * Bound operations as T07 candidates with their real gates: payment and settlement_access from the binding
   * and the capacity ledger, authority deferred to invocation (SEA-Forge has no evaluate-only preview), and the
   * payment the binding declares beside what owners observed for its latest committed intent (REQ-NAV-010).
   */
  async function boundCandidates(): Promise<readonly CandidateOperation[]> {
    const pendings = await listPending(runtime.runtime.store, caller.tenant);
    const out: CandidateOperation[] = [];
    for (const binding of loaded.config.operations) {
      const basis = `binding:${binding.operation_ref}`;
      const placeholder = binding.verifier
        ? { modality: "obligation", statement: "-", refuted_by: "-", irrelevant: [], unaccounted: [], verifier: { template_ref: `${binding.verifier.template_id}@${binding.verifier.version}` }, window_s: 60 }
        : undefined;
      const gates = await bindingGates(obligationDeps, binding, placeholder);
      const pass = { verdict: "pass" as const, basis_ref: basis };
      const governed = governance.mode === "sea-forge";
      const latest = pendings.filter((pending) => pending.operation_ref === binding.operation_ref && (pending.observed?.length ?? 0) > 0).at(-1);
      out.push({
        operation_ref: binding.operation_ref,
        label: binding.label,
        kind: "move",
        responsibility: "commit",
        reversibility: binding.reversibility,
        gates: {
          visibility: pass,
          reach: pass,
          payment: gates.payment,
          authority: governed
            ? { verdict: "pass", authority_outcome: "deferred_to_invocation", basis_ref: "sea-forge:authority_request" }
            : binding.reversibility === "read_only"
              ? { verdict: "pass", authority_outcome: "not_applicable", basis_ref: basis }
              : { verdict: "unknown", authority_outcome: "unknown", reason: "no SEA-Forge authority is configured", basis_ref: basis },
          capability: pass,
          recovery: pass,
          settlement_access: gates.settlement_access,
        },
        payment: { entries: binding.payment, ...(latest?.observed ? { observed: latest.observed } : {}) },
        expected_evidence: binding.verifier ? [`verifier:${binding.verifier.template_id}@${binding.verifier.version}`] : [],
        escalation: governed ? { behavior: "approval", approval_ref: "sea-forge:authority_approval", note: "SEA-Forge may escalate to an operator's approval" } : { behavior: "none" },
      });
    }
    return out;
  }

  /** REQ-NAV-010: the human authority decisions SEA-Forge recorded for the approvals this intent's commit waited on. */
  async function observedSteeringAttention(intentId: string): Promise<ObservedPayment | null> {
    if (!closureSocket || !approvals) return null;
    const run = (await runtime.runtime.service.listRuns(caller, { agent: NAVIGATION_COMMIT_AGENT.id })).find((r) => (r.input as { intent?: { intent_id?: unknown } } | null)?.intent?.intent_id === intentId);
    if (!run) return null;
    const waited = new Set(
      (await runtime.runtime.service.listContinuations(caller, { runId: run.runId }))
        .filter((c) => c.type === "governance-approval")
        .map((c) => (c.condition as { approvalId?: unknown } | null)?.approvalId)
        .filter((id): id is string => typeof id === "string"),
    );
    const listed = await seaForgeCall(closureSocket, { verb: "authority_approvals", actor: approvals.service }, 15_000);
    if (listed.ok !== true || !Array.isArray(listed.approvals)) return null;
    const decided = (listed.approvals as { approval_id?: unknown; resolved_by?: unknown }[]).filter((a) => typeof a.approval_id === "string" && waited.has(a.approval_id) && a.resolved_by !== null && a.resolved_by !== undefined);
    const unit = bindingFor((run.input as { intent: { operation_ref: string } }).intent.operation_ref)?.payment.find((entry) => entry.currency === "steering_attention" && entry.basis === "declared_bound")?.unit ?? "decisions";
    return { currency: "steering_attention", unit, amount: decided.length, source_ref: "sea-forge:authority_approvals" };
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

  /** Authority and observation are on only when configured; nothing here assumes them. */
  function cockpitStatus(): { readonly governed: boolean; readonly realitytrace: boolean; readonly approvals: boolean } {
    return { governed: governance.mode === "sea-forge", realitytrace: realityTrace !== undefined, approvals: approvals !== undefined };
  }

  /** The stored facts about one intent: its committed record, its latest audited attempt and its settlement. */
  async function storedMove(intentId: string): Promise<StoredMoveFacts | null> {
    const store = runtime.runtime.store;
    const row = (await readIntentRecords(store)).find((entry) => entry.record.intent_id === intentId && entry.event.tenant === caller.tenant);
    const attempt = (await readIntentAttempts(store)).filter((entry) => entry.intent_id === intentId).at(-1) ?? null;
    if (!row && !attempt) return null;
    const settled = await latestSettlement(store, caller.tenant, intentId);
    // The decision reference is SEA-Forge's own decision envelope, not the Cognate invocation event that carried it.
    const invocation = row ? await governedInvocationOf(intentId) : undefined;
    const authority = invocation ? authorityOf(invocation) : undefined;
    const authorized = authority ? { ref: authority.decisionEnvelopeId } : null;
    return {
      intent_id: intentId,
      operation_ref: row?.record.operation_ref ?? attempt?.operation_ref ?? "operation not recorded",
      committed: row ? { at: row.event.occurredAt, expected: (row.record.expected_outcome ?? null) !== null } : null,
      decision: authorized,
      attempt: attempt === null ? null : { outcome: attempt.outcome, reason: attempt.reason, approvalId: attempt.approvalId ?? null },
      settlement: settled
        ? {
            status: settled.settlement_reference.status,
            final: settled.settlement_reference.final,
            reason: settled.settlement_reference.reason ?? null,
            observation: settled.realitytrace_observation ?? null,
          }
        : null,
      at: attempt?.at ?? null,
    };
  }

  /** The decision receipt for one intent id, read from stored records and never from the query text. */
  async function receiptFor(intentId: string): Promise<WorkspaceReceipt> {
    const facts = await storedMove(intentId);
    return {
      intent_id: intentId,
      found: facts !== null,
      move: facts === null ? null : moveOf(facts, cockpitStatus()),
      approvals: approvals !== undefined,
    };
  }

  /**
   * The approval inbox (P2.1): SEA-Forge's listing, validated, with the approvals a Horizon commit waits on
   * marked. Read-only. A decision still goes through `/workspace/approval`, which SEA-Forge decides.
   */
  async function approvalInbox(now: Date = new Date()): Promise<InboxReadout> {
    if (!approvals) return { state: "not_configured" };
    try {
      const rows = await listApprovals(approvals);
      const waiting = new Set((await readIntentAttempts(runtime.runtime.store)).flatMap((entry) => (entry.outcome === "awaiting_authority" && entry.approvalId ? [entry.approvalId] : [])));
      return { state: "listed", inbox: buildInbox(rows, { now, waitingApprovalIds: waiting, operatorRef: caller.actor.id }) };
    } catch (error) {
      return { state: "unreachable", message: error instanceof Error ? error.message : String(error) };
    }
  }

  /** The approval an escalated commit waits on, and the intent it belongs to; null when nothing waits on it. */
  async function intentIdForApproval(approvalId: string): Promise<string | null> {
    const waiting = (await readIntentAttempts(runtime.runtime.store)).filter((entry) => entry.outcome === "awaiting_authority" && entry.approvalId === approvalId);
    return waiting.at(-1)?.intent_id ?? null;
  }

  /** Governed moves, newest first: committed intents and refusals or waits, capped at twenty. */
  async function recentMoves(limit = 20): Promise<WorkspaceMove[]> {
    const store = runtime.runtime.store;
    const latest = new Map<string, string>();
    const note = (intentId: string, at: string) => {
      if ((latest.get(intentId) ?? "") < at) latest.set(intentId, at);
    };
    for (const entry of await readIntentRecords(store)) {
      if (entry.event.tenant === caller.tenant) note(entry.record.intent_id, entry.event.occurredAt);
    }
    for (const attempt of await readIntentAttempts(store)) {
      if (attempt.intent_id !== null && attempt.outcome !== "accepted") note(attempt.intent_id, attempt.at);
    }
    const ids = [...latest.entries()].sort((left, right) => (left[1] < right[1] ? 1 : left[1] > right[1] ? -1 : 0)).slice(0, limit).map(([id]) => id);
    const moves: WorkspaceMove[] = [];
    for (const id of ids) {
      const facts = await storedMove(id);
      if (facts !== null) moves.push(moveOf(facts, cockpitStatus()));
    }
    return moves;
  }

  /** The first-run path, status rail, case, receipt and moves, all read from configuration and stored records. */
  async function cockpitChrome(options: { readonly caseError?: string | null; readonly receipt?: string | null } = {}): Promise<WorkspaceChrome> {
    const store = runtime.runtime.store;
    const status = cockpitStatus();
    const committed = (await readIntentRecords(store)).some((entry) => entry.event.tenant === caller.tenant);
    const current = await latestCase(store, caller.tenant);
    const skipped = await onboardingSkipped(store, caller.tenant, caller.actor.id);
    return {
      approvalAssurance: approvalAssuranceOf(process.env.HORIZON_APPROVAL_ASSURANCE),
      status: statusOf({ worldRef: world.worldRef, governed: status.governed, realitytrace: status.realitytrace, approvals: status.approvals, operator: caller.actor.id }),
      onboarding: onboardingOf({ governed: status.governed, realitytrace: status.realitytrace, caseOpen: current !== null, committed, skipped }),
      openCase: current === null ? null : { case_ref: current.case_ref, purpose: current.purpose, opened_at: current.opened_at },
      caseError: options.caseError ?? null,
      receipt: options.receipt ? await receiptFor(options.receipt) : null,
      moves: await recentMoves(),
      remote: remoteRailOf(await remote.status()),
    };
  }

  /** The cockpit's commit of one offered action, run as a session's Caller; refused when that Caller is not a mapped operator session. */
  async function commitForSession(actionId: string, intentId: string, who: Caller): Promise<{ readonly ok: true } | { readonly ok: false; readonly code: string; readonly message: string }> {
    const refusal = sessionRefusal(who);
    if (refusal !== null) return { ok: false, code: "no_actor_mapping", message: refusal };
    // The same commit the desktop's /workspace/intent makes, run as the session's Caller.
    let outcome: Awaited<ReturnType<typeof commitSurfaceIntent>> | null = null;
    let failure: unknown = null;
    try {
      outcome = await acting.run(who, () => commitSurfaceIntent({ transport: "gui", role: "human", node_id: actionId, intent_id: intentId }));
    } catch (error) {
      failure = error;
    }
    const audited = (await readIntentAttempts(runtime.runtime.store)).some((entry) => entry.intent_id === intentId);
    if (outcome !== null && !outcome.ok) return { ok: false, code: outcome.code, message: outcome.message };
    if (failure !== null && !audited) throw failure;
    return { ok: true };
  }


  // ---- Stage 1: the comparison view, labels, Presenting and exports. Reads go through the allow-listed RealityTrace reader. ----
  const setupName = loaded.setup;
  const deskMapping = setupName === undefined ? undefined : setupMapping(setupName);
  const deskRoot = options.deskRoot ?? deskMapping?.root ?? joinPath(dirOf(loaded.config.runtime_store), "desk");
  const presentingKeyPath = deskMapping && options.deskRoot === undefined ? deskMapping.presentingKey : joinPath(deskRoot, "secrets", "presenting.key");
  const cacheDir = joinPath(deskRoot, "cache");
  const exportsDir = joinPath(deskRoot, "exports");
  const clock = options.now ?? (() => new Date());
  const economicsConfig = economicsFromEnv(process.env, loaded.config.economics);
  const rtBin = economicsConfig?.realitytrace_bin ?? "realitytrace";
  const recordSources: readonly RecordSource[] =
    loaded.config.records?.sources ?? (economicsConfig ? [{ name: "default", kind: "personal", ...(economicsConfig.data_home ? { data_home: economicsConfig.data_home } : {}), ...(economicsConfig.state_home ? { state_home: economicsConfig.state_home } : {}) }] : []);
  const readerFor = options.recordReader ?? ((source: RecordSource) => recordReader(source, rtBin));
  const deskTimeZone = loaded.config.ui?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  /** The Presenting key: created once (32 random bytes, mode 0600) if the setup script has not made it. Never printed. */
  function presentingKey(): Buffer {
    if (!fileExists(presentingKeyPath)) {
      makeDir(dirOf(presentingKeyPath), { recursive: true });
      writeFileText(presentingKeyPath, randomBytes(32), { mode: 0o600, flag: "wx" });
    }
    return readFileText(presentingKeyPath);
  }

  function dayOf(param: string | null): string {
    if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) return param;
    return new Intl.DateTimeFormat("en-CA", { timeZone: deskTimeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(clock());
  }

  async function compareData(params: URLSearchParams): Promise<{ props: ComparePageProps; view: CompareView | null; repoNames: string[]; labels: RunLabel[] }> {
    const sourceName = params.get("source") ?? recordSources[0]?.name ?? null;
    const source = recordSources.find((candidate) => candidate.name === sourceName) ?? null;
    const allRepos: { repo_id: string; path: string | null }[] = [];
    for (const each of recordSources) {
      const listed = readerFor(each).repos();
      if (listed.ok) allRepos.push(...listed.repos);
    }
    const labels = await listLabels(runtime.runtime.store, caller.tenant);
    const presenting = await presentingOn(runtime.runtime.store, caller.tenant, caller.actor.id);
    const day = dayOf(params.get("day"));
    const only = params.get("only") === "contradicted" ? ("contradicted" as const) : null;
    let repos: { repo_id: string; path: string | null }[] = [];
    let notice: string | null = null;
    let repoId: string | null = params.get("repo");
    let view: CompareView | null = null;
    let sessions: ComparePageProps["sessions"] = [];
    const labelOf = (sessionId: string, eventId: string): RunLabel | null => labels.find((l) => l.session_id === sessionId && l.event_id === eventId) ?? null;
    const sessionId = params.get("session");
    if (source === null) {
      notice = "No record source is configured, so there is nothing to compare. Add a [[records.sources]] table to the config.";
    } else {
      const reader = readerFor(source);
      const listed = reader.repos();
      if (!listed.ok) notice = `The record could not be listed: ${listed.message}`;
      else {
        repos = [...listed.repos];
        repoId = repoId ?? repos[0]?.repo_id ?? null;
        if (repoId === null) notice = "This record source holds no repositories yet, so there is nothing to compare.";
        else {
          const read = readLedgerDay(reader, { repoId, day, timeZone: deskTimeZone, cacheDir });
          if (!read.ok) notice = `The record could not be read: ${read.message}`;
          else {
            const all = listSessions(read.rows);
            const shown = only === "contradicted" ? onlyContradicted(all) : all;
            sessions = shown.map((summary) => ({ ...summary, label: labelOf(summary.session_id, summary.event_id) }));
            if (shown.length === 0) notice = only ? "No contradicted session on this day." : "No sessions are recorded on this day.";
            if (sessionId !== null) {
              view = compareSession({ rows: read.rows, sessionId, ...(loaded.config.workshop ? { workshopUrl: loaded.config.workshop.url } : {}), intact: { intact: read.intact, records: read.records, divergence: read.divergence } });
              if (view === null) notice = "That session is not in the record for this day.";
            }
          }
        }
      }
    }
    const props: ComparePageProps = {
      presenting,
      selection: { source: sourceName, repo: repoId, day, session: sessionId, only },
      sources: recordSources.map((each) => each.name),
      repos,
      sessions,
      view,
      label: view ? labelOf(view.session.session_id, view.session.event_id) : null,
      notice,
      labelError: params.get("label_error"),
    };
    return { props, view, repoNames: namesOfRepos(allRepos), labels };
  }

  const remote = new RemoteController(remoteSettings(), {
    store: runtime.runtime.store,
    tenant: caller.tenant,
    identity,
    identityTenant,
    operator: mappedActors.desktopOperator,
    workspace: () => workspace(),
    chrome: (receipt) => cockpitChrome({ receipt: receipt ?? null }),
    position: () => lastPosition(runtime),
    approvalIntent: (approvalId) => intentIdForApproval(approvalId),
    resolveApproval: async (approvalId, resolution, who) => {
      await resolveNavigationApproval({ approvalId, resolution }, who);
    },
    commitAction: (actionId, intentId, who) => commitForSession(actionId, intentId, who),
    settle: async (intentId, phase) => {
      await settleNavigationIntent(intentId, phase);
    },
    openCase: async (purpose, who) => {
      await openCase(runtime.runtime.store, { tenant: caller.tenant, operator: who.actor.id, purpose, now: new Date() });
    },
  });

  return {
    loaded,
    world,
    runtime,
    caller,
    remote,
    identity,
    operatorActors: mappedActors,
    commitForSession,
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
      const server: HttpServer = Bun.serve({
        hostname: loaded.config.bind_host,
        port,
        async fetch(request) {
          const url = new URL(request.url);
          // Every request checks Host (DNS rebinding: the remote panel's GET carries the pairing link);
          // state-changing routes also check Origin and Sec-Fetch-Site (cross-site POSTs).
          const refused = crossSiteRefusal(request, server.port ?? port, request.method !== "POST");
          if (refused !== null) return refused;
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
              return Response.json(await commitNavigationIntent({ operationRef: record.operation_ref, ...(record.expected_outcome === undefined ? {} : { expectation: record.expected_outcome }) }));
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
            const theme = themeOf(url.searchParams.get("theme"));
            const evidenceRef = url.searchParams.get("evidence");
            const data = await workspace({
              ...(url.searchParams.get("focus") === null ? {} : { focusRef: url.searchParams.get("focus") as string }),
              ...(evidenceRef === null ? {} : { evidenceRef }),
              ...(theme === undefined ? {} : { theme }),
            });
            const caseParam = url.searchParams.get("case_error");
            const chrome = await cockpitChrome({
              caseError: caseParam === "empty" || caseParam === "too_long" ? caseParam : null,
              receipt: url.searchParams.get("receipt"),
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
              ...(theme === undefined ? {} : { theme }),
              expectedObjects: data.objects.length,
              debuggerAnswer: inspected?.debugger ?? null,
              retrievalAnswer: inspected?.retrieval ?? null,
              chrome,
            });
            return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
          }
          if (url.pathname === "/workspace.json" && request.method === "GET") {
            const theme = themeOf(url.searchParams.get("theme"));
            const evidenceRef = url.searchParams.get("evidence");
            const data = await workspace({
              ...(url.searchParams.get("focus") === null ? {} : { focusRef: url.searchParams.get("focus") as string }),
              ...(evidenceRef === null ? {} : { evidenceRef }),
              ...(theme === undefined ? {} : { theme }),
            });
            return Response.json(data.snapshot, { headers: { "cache-control": "no-store" } });
          }
          if (url.pathname === "/workspace/economics" && request.method === "GET") {
            // Read-only: RealityTrace is read through its CLI on every request; nothing is stored or written.
            const readout = economics.read();
            if ((request.headers.get("accept") ?? "").includes("application/json")) {
              return Response.json({ schema: ECONOMICS_SCHEMA, ...readout }, { headers: { "cache-control": "no-store" } });
            }
            return new Response(renderEconomicsPage(readout, themeOf(url.searchParams.get("theme"))), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
          }
          if (url.pathname === "/workspace/compare" && request.method === "GET") {
            // Read-only: RealityTrace is read through its allow-listed CLI; labels and the Presenting switch are Horizon's own records.
            const data = await compareData(url.searchParams);
            const props = data.props.presenting ? applyStandIns(data.props, presentingKey(), data.repoNames) : data.props;
            const theme = themeOf(url.searchParams.get("theme"));
            return new Response(renderComparePage({ ...props, ...(theme === undefined ? {} : { theme }) }), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
          }
          if (url.pathname === "/workspace/label" && request.method === "POST") {
            const form = await request.formData().catch(() => null);
            if (form === null) return Response.json({ code: "invalid_argument", message: "LABEL: body is not a form" }, { status: 400 });
            const back = safeReturn(form.get("return"));
            try {
              await putLabel(runtime.runtime.store, {
                tenant: caller.tenant,
                operator: caller.actor.id,
                session_id: String(form.get("session") ?? ""),
                event_id: String(form.get("event") ?? ""),
                record_seq: form.get("record_seq") === null || form.get("record_seq") === "" ? null : Number(form.get("record_seq")),
                verdict: form.get("verdict"),
                first_failure: form.get("first_failure") ?? "",
                now: clock(),
              });
            } catch (error) {
              const code = error instanceof Error ? error.message.replace(/^LABEL: /, "") : "failed";
              return Response.redirect(`/workspace/compare?${back}${back ? "&" : ""}label_error=${encodeURIComponent(code)}`, 303);
            }
            return Response.redirect(`/workspace/compare?${back}`, 303);
          }
          if (url.pathname === "/workspace/presenting" && request.method === "POST") {
            const form = await request.formData().catch(() => null);
            if (form === null) return Response.json({ code: "invalid_argument", message: "PRESENTING: body is not a form" }, { status: 400 });
            await setPresenting(runtime.runtime.store, { tenant: caller.tenant, operator: caller.actor.id, on: form.get("on") === "1" });
            return Response.redirect(`/workspace/compare?${safeReturn(form.get("return"))}`, 303);
          }
          if (url.pathname === "/workspace/export" && request.method === "GET") {
            const kind = url.searchParams.get("kind");
            if (kind !== "labels" && kind !== "comparison") return Response.json({ code: "invalid_argument", message: "EXPORT: kind must be labels or comparison" }, { status: 400 });
            const presenting = await presentingOn(runtime.runtime.store, caller.tenant, caller.actor.id);
            const choice = chooseStandIns(presenting, url.searchParams.get("standins"));
            if (!choice.ok) return Response.json({ code: "invalid_argument", message: choice.message }, { status: choice.status });
            const data = await compareData(url.searchParams);
            if (kind === "comparison" && data.view === null) return Response.json({ code: "not_found", message: "EXPORT: no such session in the record" }, { status: 404 });
            const built = buildExport({ kind, labels: data.labels, comparison: data.view, standins: choice.standins, key: presentingKey(), names: data.repoNames, now: clock() });
            writeExport(exportsDir, built);
            return new Response(built.body, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "content-disposition": `attachment; filename="${built.name}"` } });
          }
          if (url.pathname === "/workspace/approvals" && request.method === "GET") {
            // Read-only listing. Decisions are POSTed to /workspace/approval, which SEA-Forge decides.
            return new Response(renderApprovalInboxPage(await approvalInbox(), themeOf(url.searchParams.get("theme"))), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
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
            const theme = themeOf(form.get("theme"));
            const data = await workspace({ ...(focus === undefined ? {} : { focusRef: focus }), ...(evidence === undefined ? {} : { evidenceRef: evidence }), ...(theme === undefined ? {} : { theme }) });
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
            // The intent id is chosen here, so every outcome that reached the store (committed, awaiting, refused) has a receipt.
            const intentId = randomUUID();
            let outcome: Awaited<ReturnType<typeof commitSurfaceIntent>> | null = null;
            let failure: unknown = null;
            try {
              outcome = await commitSurfaceIntent({ transport: "gui", role: "human", node_id: actionId, intent_id: intentId });
            } catch (error) {
              failure = error;
            }
            const audited = (await readIntentAttempts(runtime.runtime.store)).some((entry) => entry.intent_id === intentId);
            if (outcome !== null && !outcome.ok && outcome.code !== "awaiting_authority") {
              return Response.json({ code: outcome.code, message: outcome.message }, { status: 409 });
            }
            if (failure !== null && !audited) throw failure;
            const query = new URLSearchParams({ receipt: intentId });
            if (focus !== undefined) query.set("focus", focus);
            if (evidence !== undefined) query.set("evidence", evidence);
            if (theme !== undefined) query.set("theme", theme);
            return Response.redirect(`/workspace?${query.toString()}#receipt`, 303);
          }
          if (url.pathname === "/workspace/case" && request.method === "POST") {
            const form = await request.formData().catch(() => null);
            if (form === null) return Response.json({ code: "invalid_argument", message: "CASE: body is not a form" }, { status: 400 });
            const check = checkPurpose(form.get("purpose"));
            if (!check.ok) return Response.redirect(`/workspace?case_error=${check.code}#getting-started`, 303);
            await openCase(runtime.runtime.store, { tenant: caller.tenant, operator: caller.actor.id, purpose: check.purpose, now: new Date() });
            return Response.redirect("/workspace#getting-started", 303);
          }
          if (url.pathname === "/workspace/onboarding/skip" && request.method === "POST") {
            await setOnboardingSkipped(runtime.runtime.store, { tenant: caller.tenant, operator: caller.actor.id, skipped: true, now: new Date() });
            return Response.redirect("/workspace", 303);
          }
          if (url.pathname === "/workspace/onboarding/resume" && request.method === "POST") {
            await setOnboardingSkipped(runtime.runtime.store, { tenant: caller.tenant, operator: caller.actor.id, skipped: false, now: new Date() });
            return Response.redirect("/workspace#getting-started", 303);
          }
          if (url.pathname === "/workspace/approval" && request.method === "POST") {
            const form = await request.formData().catch(() => null);
            const approvalId = form?.get("approval_id");
            const decision = form?.get("decision");
            if (typeof approvalId !== "string" || approvalId === "" || (decision !== "approve" && decision !== "reject")) {
              return Response.json({ code: "invalid_argument", message: "APPROVAL: approval_id and decision (approve or reject) are required" }, { status: 400 });
            }
            const intentId = await intentIdForApproval(approvalId);
            if (intentId === null) return Response.json({ code: "not_found", message: "APPROVAL: no escalated commit waits on this approval" }, { status: 404 });
            try {
              await resolveNavigationApproval({ approvalId, resolution: decision === "approve" ? "approved" : "rejected" });
            } catch (error) {
              // A rejected commit fails by design and is audited; its receipt says so. Anything else is refused here.
              if (!(error instanceof Error && error.message.startsWith("INTENT: governed commit refused"))) {
                return Response.json({ code: "approval_refused", message: error instanceof Error ? error.message : String(error) }, { status: 409 });
              }
            }
            return Response.redirect(`/workspace?receipt=${encodeURIComponent(intentId)}#receipt`, 303);
          }
          if (url.pathname === "/workspace/settle" && request.method === "POST") {
            const form = await request.formData().catch(() => null);
            const intentId = form?.get("intent_id");
            if (typeof intentId !== "string" || intentId === "") {
              return Response.json({ code: "invalid_argument", message: "SETTLEMENT: intent_id is required" }, { status: 400 });
            }
            const phase = form?.get("phase");
            if (phase !== "observe" && phase !== "rule") {
              return Response.json({ code: "invalid_argument", message: "SETTLEMENT: phase must be observe or rule" }, { status: 400 });
            }
            try {
              await settleNavigationIntent(intentId, phase);
            } catch (error) {
              return Response.json({ code: "settlement_refused", message: error instanceof Error ? error.message : String(error) }, { status: 409 });
            }
            return Response.redirect(`/workspace?receipt=${encodeURIComponent(intentId)}#receipt`, 303);
          }
          if (url.pathname === "/workspace/remote" && request.method === "GET") {
            await remote.checkReachable();
            const nonce = randomBytes(16).toString("base64");
            const html = remotePanelPage({ status: await remote.status(), link: remote.pairingLink(), nonce, now: Date.now() });
            return new Response(html, {
              headers: {
                "content-type": "text/html; charset=utf-8",
                "cache-control": "no-store",
                "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
              },
            });
          }
          if (url.pathname === "/workspace/remote/status" && request.method === "GET") {
            return Response.json(await remote.status(), { headers: { "cache-control": "no-store" } });
          }
          if (url.pathname === "/workspace/remote/events" && request.method === "GET") {
            // The panel's status stream: one event when the state changes, a heartbeat otherwise.
            const encoder = new TextEncoder();
            let timer: ReturnType<typeof setInterval> | null = null;
            let last = "";
            const stream = new ReadableStream<Uint8Array>({
              start: (controller) => {
                const tick = async () => {
                  const next = await remote.status();
                  const text = JSON.stringify(next);
                  if (text !== last) {
                    last = text;
                    controller.enqueue(encoder.encode(`event: status\ndata: ${text}\n\n`));
                  } else {
                    controller.enqueue(encoder.encode(": heartbeat\n\n"));
                  }
                };
                void tick();
                timer = setInterval(() => void tick().catch(() => undefined), 2000);
              },
              cancel: () => {
                if (timer !== null) clearInterval(timer);
              },
            });
            return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store" } });
          }
          if (url.pathname === "/workspace/remote/start" && request.method === "POST") {
            await remote.start();
            return Response.redirect("/workspace/remote", 303);
          }
          if (url.pathname === "/workspace/remote/refresh" && request.method === "POST") {
            await remote.refresh();
            return Response.redirect("/workspace/remote", 303);
          }
          if (url.pathname === "/workspace/remote/stop" && request.method === "POST") {
            await remote.stop();
            return Response.redirect("/workspace/remote", 303);
          }
          if (url.pathname === "/") {
            return Response.redirect("/workspace", 303);
          }
          return new Response("not found\n", { status: 404 });
        },
      });
      return server;
    },
    async close() {
      if (remote.listening) await remote.stop();
      for (const timer of windowTimers.values()) clearTimeout(timer);
      windowTimers.clear();
      await runtime.runtime.close();
    },
  };
}

/** The status-rail item for the phone remote: its state in words, and where to act on it. */
function remoteRailOf(status: RemoteStatus): { readonly state: string; readonly label: string } {
  const label = status.state === "off" ? "off" : status.state === "connected" ? "phone connected" : status.state === "restoring" ? "restoring" : "waiting";
  return { state: status.state, label: `Remote: ${label}` };
}

/** A `return` field is a query string for our own compare page, never a URL: no open redirect. */
function safeReturn(value: FormDataEntryValue | null): string {
  const text = typeof value === "string" ? value : "";
  return /^[A-Za-z0-9_=&%.:\-+]*$/.test(text) ? text : "";
}

/** A theme is set only when the caller asked for one; otherwise the page follows the OS preference. */
function themeOf(value: FormDataEntryValue | string | null): WorkspaceTheme | undefined {
  return value === "light" || value === "dark" ? value : undefined;
}

/**
 * Refuse a request unless it comes from this cockpit: the Host header must name this server (DNS
 * rebinding). Unless `hostOnly`, any Origin or Sec-Fetch-Site must also be same-origin (cross-site POSTs).
 * A request with neither Origin nor Sec-Fetch-Site (a CLI or test client) is allowed on the Host check alone.
 */
function crossSiteRefusal(request: Request, port: number, hostOnly = false): Response | null {
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
  const refuse = (message: string) => Response.json({ code: "forbidden_origin", message: `REQUEST: ${message}` }, { status: 403 });
  if (!hosts.includes(request.headers.get("host") ?? "")) return refuse("the Host header does not name this cockpit");
  if (hostOnly) return null;
  const origin = request.headers.get("origin");
  if (origin !== null && !hosts.some((host) => origin === `http://${host}`)) return refuse("the Origin is not this cockpit");
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") return refuse("the request is cross-site");
  return null;
}

/** `cognate:store@<bytes>`: the durable store's size — observed, never fabricated. */
/** The configured snapshot directory, else `verifier-snapshot` beside the live store's directory. */
function snapshotDirOf(settlement: { readonly snapshot_dir?: string }, storePath: string): string {
  return resolve(settlement.snapshot_dir ?? join(dirname(resolve(storePath)), "verifier-snapshot"));
}

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

/** The identity store's tenant is a lowercase slug; the runtime tenant (`local:<host>`) is mapped to one, deterministically. */
function identityTenantOf(tenant: string): string {
  const slug = tenant.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[^a-z0-9]+/, "").slice(0, 64);
  return slug === "" ? "local" : slug;
}

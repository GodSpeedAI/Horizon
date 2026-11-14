import { reconcilePending } from "./capabilities/pending-reconcile.ts";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { createIdentityService, type IdentityService } from "@godspeed/identity";
import { delegatingAuthority } from "./adapters/delegating-authority.ts";
import { identityStoreOf } from "./remote/identity-store.ts";
import { OperatorActors, resolveOperatorsConfig, validateOperatorActors } from "./remote/operators.ts";
import { statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Caller } from "@godspeedai/cognate-runtime-api";
import { governanceFromEnv, SeaForgeAuthority, type GovernanceOptions } from "@godspeedai/cognate-runtime-bun";
import { loadWorld, type LoadedWorld } from "./adapters/semantic.ts";
import { observeResearch, requireResearch, type ResearchStatus } from "./adapters/research.ts";
import { economicsFromEnv, loadConfig } from "./config/load.ts";
import { ECONOMICS_SCHEMA } from "./economics/model.ts";
import type { LoadedConfig, OperatorsConfig } from "./config/types.ts";
import { assertStoreBoundary, createHorizonRuntime, openReadOnlyStore, type HorizonRuntime } from "./runtime/create.ts";
import { appendIntentAttempt, appendIntentRecord, createFrameRegister, NAVIGATION_INTENT_COMMIT, navigationIntentComponent, readIntentAttempts, readIntentRecords, type FrameRegister, type IntentAttempt } from "./capabilities/navigation-intent.ts";
import { checkPurpose, latestCase, onboardingSkipped, openCase, setOnboardingSkipped } from "./capabilities/workspace-records.ts";
import { CONTRACT_VERSION, contractVersionOf } from "./capabilities/capacity-ledger.ts";
import { activateContract } from "./capabilities/contract-upgrade.ts";
import { decideLesson, listLessons, proposeLesson } from "./capabilities/lessons.ts";
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
import { approvalAuthorityFromEnv, type ApprovalAuthority } from "./adapters/sea-forge-config.ts";
import { buildInbox, type InboxReadout } from "./domain/approval-inbox.ts";
import { authorityOf, defaultRealityTraceRepo, observationOutbox, realityTraceFromEnv, RealityTraceEvidence, type GovernedInvocation, type RealityTraceConfig, type SettlementAuthority } from "./adapters/settlement.ts";
import { appendSettlement, latestSettlement, type ExecutionRecord, type NavigationSettlement, type RealityTraceObservation, type SettlementReference } from "./capabilities/navigation-settlement.ts";
import type { DurableStore, Json } from "@godspeedai/cognate-events";
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import type { RunView } from "@godspeedai/cognate-runtime-api";
import { buildStructuralFrame, type NavigationFrameV1, type NavigationIntentRecord } from "./domain/frame.ts";
import {
  actionFieldFor,
  classify,
  classifyReference,
  loadOperationManifest,
  refusedPrefixesFor,
  resolveDispatchedOperation,
  type LoadedManifest,
} from "./contracts/identity/manifest.ts";
import { RESERVED_ACTOR_FIELDS, reservedActorField, schemaFieldNames, unknownField } from "./contracts/identity/reserved-fields.ts";
import { frozenRefusal, refusalWords, type FrozenRefusal } from "./contracts/identity/enforcement.ts";
import { loadParamSchemas, wireName, type ParamSchemaSpec } from "./contracts/identity/params.ts";
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
import { fdeDebuggerValues } from "./adapters/fde-view.ts";
import { fdePathsFromEnv, readFdeSources, type FdeSourcePaths } from "./adapters/fde-sources.ts";
import { runDebugger, DEBUGGER_OPERATIONS, type DebuggerArguments, type DebuggerOperation, type DebuggerSources } from "./domain/debugger.ts";
import { renderComparePage, type ComparePageProps } from "./ui/workspace/compare.tsx";
import { compareSession, listSessions, onlyContradicted, type CompareView } from "./ui/workspace/compare-model.ts";
import { applyStandIns, namesOfRepos } from "./ui/workspace/presenting.ts";
import { acquireDeskLock, acquireStoreLockFile, releaseDeskLock, releaseStoreLockFile, type StoreLockFile } from "./capabilities/desk-lock.ts";
import { appliedVersion, DESK_MIGRATIONS, MIGRATING_WORDS, MIGRATION_FAILED_WORDS, runDeskMigrations } from "./capabilities/desk-migrations.ts";
import { BAD_REQUEST_ID_WORDS, REQUEST_ID_REQUIRED_WORDS, REUSED_REQUEST_WORDS, requestFingerprint, requestRecord, seenRequest, validRequestId } from "./capabilities/desk-requests.ts";
import { answerRowOf, appendRow, discardRow, listConversation, newRowRecord, panelRowOf, planAppend, planUpdate, settleDraftRow } from "./capabilities/conversation.ts";
import { answerEcho, cleanAgentName, MAX_WAITING_PROPOSALS, TOO_MANY_PROPOSALS, WAITING_FOR_AGENT, type ConversationRow, type RowSource, type RowStage } from "./ui/desk/conversation-model.ts";
import { listLabels, putLabel, type RunLabel } from "./capabilities/labels.ts";
import { CASE_COLLECTION, presentingOn, setPresenting } from "./capabilities/workspace-records.ts";
import { NoteRefused, getNote, listCase, listDay, listDays, listTags, noteHistory, saveNote, search as searchNotes, type Who } from "./capabilities/notes.ts";
import { assign as assignToAgent, assignmentId, keyState, workshopAccess, type Access } from "./adapters/workshop.ts";
import { refused as attemptRefused, requestIdFor } from "./adapters/request-id.ts";
import { checkReassign } from "./capabilities/question-rules.ts";
import { acceptanceBlocked, AGREED_COLLECTION, agreedFingerprint, agreedFingerprintOf, agreedId, answerFor, guardIdOf, PANEL_ANSWERS_COLLECTION, answerState, listAnswers, listConflicts, NOTHING_SENT, QuestionAlreadyAnswered, planReassign, planRoute, planStopWaiting, recordAnswer, checkValue, waitsForAgent, OUTCOMES, WAITING_WORDS, type AgreedQuestion, type PanelAnswer } from "./capabilities/panel-answers.ts";
import { CATALOGUE, vocabulary } from "./ui/surface2/catalog.ts";
import { ANSWER_NEEDS_REVISION, ANSWERED_CANNOT_CHANGE, NO_PANELS, UNNAMED_AGENT, checkAgentOp, moveQuestion, openPanelId, reduceAgent, reduceHuman, type AgentOp, type AskBlock, type HumanOp, type Panel, type Panels as PanelsBoard } from "./ui/desk/panels-model.ts";
import { boardWrites, deskScopeOf, loadBoard, movedStoredQuestion, PANEL_LOAD_WORDS, PANEL_UNREADABLE_WORDS, readsBack, stateWrites, withStored, type CommitRecord } from "./capabilities/panel-records.ts";
import { currentDraft, handoffItem, handoffRequestId, handoffStepId, nextDraft, saveDraft, stepNameOf, validDraftId, DRAFT_TEXT_MAX } from "./capabilities/handoff.ts";
import { readableTitle } from "./ui/desk/banned-words.ts";
import { agentRowsOf, agentSearchOf, agentStateOf, WITHHELD_WORDS } from "./ui/desk/agent-view.ts";
import { caseTitle, matches, partsOf, plainWords, sourcesOf, type DeskCase, type DecideState, type DecisionCardData, type PanelsData, type DeskState, type HomeState, type SearchResult } from "./ui/desk/model.ts";
import { confirmedDecision, failedDecision } from "./ui/desk/decision-words.ts";
import { buildDecide, waitingCount, type CaseApprovals, type HumanStepInput } from "./ui/desk/decide-build.ts";
import { conflictLogLines } from "./ui/desk/conflict-model.ts";
import { addItem, advance as caseAdvance, detailsOf, entryOptions, approvalList, caseDigest, caseSteps, decide as caseKeeperDecide, humanTaskComplete, listCases, type CaseKeeper, type CaseLine } from "./adapters/sea-forge-case.ts";
import { activeHolds, checkReason, putHold, recordDecision } from "./capabilities/decisions.ts";
import { recordRefusal } from "./capabilities/refusals.ts";
import { caseItems, costSource, orderWork, sessionItems, type AcceptedKnowledge, type WorkData } from "./ui/desk/work-build.ts";
import { readLedgerDay } from "./adapters/ledger-day.ts";
import { recordReader, type RecordReader } from "./adapters/realitytrace-economics.ts";
import { buildExport, chooseStandIns, writeExport } from "./exports/export.ts";
import { clearedSessionCookie, createDeskPairing, NOT_PAIRED_WORDS, PAIR_FIRST_WORDS, PairingNeedsTerminal, printPairingCode } from "./desk/pairing.ts";
import { gate as confirmationGate, type ConsumeResult } from "./capabilities/pending-confirmations.ts";
import { runConfirm, type ConfirmIO, type ConfirmOutcome } from "./capabilities/confirm-command.ts";
import { AUTHORITY_DECISION_INTERFACE, interfacePublicationStatus } from "./contracts/identity/interface-status.ts";
import { terminalOutput as confirmationTerminal } from "./desk/pairing.ts";
import { DEFAULT_AGENT_KEY_ID, DEFAULT_AGENT_NAME, ownerOfKey, readRegistry } from "./desk/agent-keys.ts";
import { checkWithdraw, questionFingerprint } from "./capabilities/question-rules.ts";
import { notRecordedWarnings } from "./capabilities/reconciliation.ts";
import { setupMapping } from "./config/setup.ts";
import type { RecordSource } from "./config/types.ts";
import { existsSync as fileExists, mkdirSync as makeDir, readFileSync as readFileText, writeFileSync as writeFileText } from "node:fs";
import { dirname as dirOf, join as joinPath } from "node:path";
import { tmpdir as tmpDir } from "node:os";
import type { Server } from "bun";
import { EnrollmentAuthority, type P3Authority } from "./remote/enrollment.ts";
import { DEVICE_ACTOR_PREFIX, RemoteController, type RemoteStatus } from "./remote/server.ts";
import { remoteSettings } from "./remote/settings.ts";
import { qrSvg, remotePanelPage } from "./remote/panel.ts";
import { itemOf, questionOf } from "./ui/surface2/panel-blocks.ts";

type HttpServer = Server<unknown>;

/** The decision was recorded by SEA-Forge, but a step after it (polling, settling the commit) failed. Same message as the original error. */
export class ApprovalFollowUpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalFollowUpError";
  }
}

/** Run the steps that follow a decision SEA-Forge has already recorded; any failure but a refused commit becomes an ApprovalFollowUpError. */
/** The decision state as the lookup read it, with the step each card decides (a card with no step has none). */
type DecideLookup = DecideState & { readonly stepOf: ReadonlyMap<string, string> };

export async function afterRecordedDecision<T>(steps: () => Promise<T>): Promise<T> {
  try {
    return await steps();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("INTENT: governed commit refused")) throw error;
    throw new ApprovalFollowUpError(error instanceof Error ? error.message : String(error));
  }
}

/** The fixed outcome codes a refused or failed decision maps to. The caller owns the copy; no error text travels in a URL. */
export type InboxErrorCode = "refused" | "not_pending" | "invalid" | "unavailable" | "followup_failed" | "unknown";

export function approvalErrorCode(error: unknown): InboxErrorCode {
  if (error instanceof ApprovalFollowUpError) return "followup_failed";
  const message = error instanceof Error ? error.message : "";
  if (/already decided|no governed commit waits|does not belong/.test(message)) return "not_pending";
  if (/^APPROVAL: /.test(message)) return "refused";
  return "unavailable";
}

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

/**
 * Request fields that would name the caller. The caller is never taken from a request: the actor
 * comes from the authenticated session or the agent key, and the role comes from the same place.
 * A request that carries one of these is refused outright rather than quietly ignored, so no
 * caller can ask to be read as somebody else.
 *
 * The list itself lives with the contract, in `contracts/identity/reserved-fields.ts`, because
 * every write boundary answers the same question with the same names. The phone used to keep a
 * shorter list of its own, and a field the desktop refused was an ordinary unknown field on the
 * phone (R4-07).
 */
export const ACTOR_NAMING_FIELDS = RESERVED_ACTOR_FIELDS;

export interface SurfaceIntentRequestBody {
  readonly transport: "gui" | "cli" | "mcp";
  /**
   * The role is deliberately absent. It selects which projection the surface is reduced for, and
   * it comes from the authenticated caller, never from the body (DEF-ROLE-FROM-REQUEST).
   */
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
  /** Stage 4: an agent's panel tool call (`show_surface`, `ask_human`, `arrange`, `annotate`, `read_responses`). */
  applyAgentOp(op: AgentOp & { readonly request_id?: unknown }, agentName?: string, keyId?: string): Promise<{ readonly ok: true; readonly panel: string | null; readonly responses?: readonly PanelAnswer[] } | { readonly ok: false; readonly code: string; readonly message: string }>;
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
  /**
   * Commit one surface intent for the role the caller's context gives it. The role is never read
   * from the submission: at an HTTP boundary it comes from the signed-in session, and in process
   * it comes from the local console (DEF-ROLE-FROM-REQUEST).
   */
  commitSurfaceIntent(submission: SurfaceIntentRequestBody, role: SurfaceRole): Promise<
    | { readonly ok: true; readonly result: IntentCommit; readonly bound: EquivalenceResult }
    | { readonly ok: false; readonly code: string; readonly message: string }
  >;
  startObservation(commit: IntentCommit): Promise<RunView>;
  researchContract(): ReturnType<typeof requireResearch>;
  startServer(port?: number): HttpServer;
  /** Stage 0B: the local terminal side of a waiting reserved operation (`horizon confirm --pending <id>`). */
  confirmPending(pendingId: string, io: ConfirmIO): Promise<ConfirmOutcome>;
  /** Resolves when the saved records are migrated. Until then every change is refused with words saying so (design v3, step 4). */
  readonly migrated: Promise<void>;
  close(): Promise<void>;
}

/**
 * The identity catalog, read once and kept.
 *
 * A catalog that cannot be loaded is a refusal, never a default. The gate below would otherwise
 * see every reference as unknown, and an unknown reference that the deployment happens to bind
 * would be allowed — the opposite of failing closed.
 */
let identityCatalog: LoadedManifest | null = null;
function identityCatalogOf(): LoadedManifest {
  if (identityCatalog !== null) return identityCatalog;
  identityCatalog = loadOperationManifest();
  return identityCatalog;
}

/**
 * What the catalog says the runtime does with the operation a request is about to perform.
 *
 * The answer comes from the catalog's own live-enforcement table, so the contract and the runtime
 * cannot drift: a contract that says a row is refused is a row the route refuses, and a contract
 * that says a row runs is a row the route runs. A catalog that cannot be loaded is a refusal, not
 * a default: the route answers 503 and changes nothing (R5-01).
 */
type RefusalCheck = { readonly ok: true; readonly refusal: FrozenRefusal | null } | { readonly ok: false; readonly message: string };
function checkFrozenRefusal(
  operationId: string,
  selector: { readonly route?: string; readonly codeOp?: string },
): RefusalCheck {
  try {
    return { ok: true, refusal: frozenRefusal(identityCatalogOf(), operationId, selector) };
  } catch (error) {
    return {
      ok: false,
      message: `The identity catalog could not be loaded, so nothing was changed (${error instanceof Error ? error.message : String(error)}).`,
    };
  }
}

/**
 * Whether the catalog lets a route perform the operation it is about to perform.
 *
 * `run` means the catalog has no refusal for the row, so the route's own checks decide.
 * `refused` means the row is refused at this freeze: the refusal audit is written now, before the
 * route returns, and the caller answers with the catalog's own words. `unavailable` means the
 * catalog could not be read, which is a refusal too — never a default (R5-01).
 */
type FrozenGate = { readonly state: "run" } | { readonly state: "refused"; readonly refusal: FrozenRefusal } | { readonly state: "unavailable"; readonly message: string };
async function frozenGate(
  store: DurableStore,
  tenant: string,
  operationId: string,
  selector: { readonly route?: string; readonly codeOp?: string },
  caller: string | null,
): Promise<FrozenGate> {
  const check = checkFrozenRefusal(operationId, selector);
  if (!check.ok) return { state: "unavailable", message: check.message };
  if (check.refusal === null) return { state: "run" };
  try {
    await recordRefusal(store, {
      tenant,
      operation: check.refusal.operationId,
      code_op: check.refusal.codeOp,
      route: selector.route ?? null,
      caller,
      reason: check.refusal.reason,
      now: new Date(),
    });
  } catch {
    // The refusal stands whether or not its audit could be kept: nothing was changed either way.
  }
  return { state: "refused", refusal: check.refusal };
}

/**
 * The qualifier the identity catalog dispatches a desk decision on.
 *
 * The card kind is never read from the request: the person names a card, and the server looks
 * that card up. The settlement card is one kind with two halves, so its phase is read from the
 * card's own id — the same id the settlement handler parses. A kind the catalog does not know
 * resolves to nothing, and the pair is then refused rather than guessed (R3-02).
 */
function deskCardKind(card: { readonly kind: string; readonly id: string }): string | null {
  switch (card.kind) {
    case "escalation":
    case "lesson":
    case "case_task":
    case "human_step":
      return card.kind;
    case "acceptance": {
      const cut = card.id.lastIndexOf(":");
      const phase = card.id.slice(cut + 1);
      return phase === "observe" || phase === "rule" ? `acceptance_${phase}` : null;
    }
    default:
      return null;
  }
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
    /** The SEA-Forge P3 authority for device enrolment. Omitted in production, where enrolment is refused. Tests wire a double. */
    readonly remoteP3Authority?: P3Authority;
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
    /**
     * WP-19: where the read-only FDE evidence adapters read from (case dir, RealityTrace compare/derive output, world pin).
     * Defaults to `HORIZON_FDE_CASE_DIR` / `_COMPARE` / `_DERIVE` / `_PIN`; each unset path reads as "not connected".
     */
    readonly fdeSources?: FdeSourcePaths;
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
    /** The client for delegated (`on_behalf_of`) commits. Injected by tests; defaults to the gateway client. */
    readonly delegationClient?: Pick<SeaForgeAuthority, "decide">;
    /** Stage 4: how work is handed to a workshop agent. Injected by tests; defaults to the workshop named in the config and its key file. */
    readonly workshop?: () => Access;
    /** Test seam: a promise the desk's record migration waits for before it runs, so a test can hold a migration pending. */
    readonly migrationHold?: Promise<unknown>;
    /**
     * Read-only open for the CLI `surface` path, which may run while a desk holds the store. It takes no desk lock, writes nothing
     * at startup (no operator registration, contract activation, reconciliation, migration or Obligation snapshot), and refuses to
     * start when the desk's records are not migrated yet. Every store write it attempts is refused.
     */
    readonly readOnly?: boolean;
    /** Test seam only: lets an in-process test drive governed mode with a scripted wire while the owner has not published the authority decision. */
    readonly unpublishedAuthorityForTests?: boolean;
  } = {},
): Promise<HorizonApplication> {
  const loaded = loadConfig(options.configPath, { readOnly: options.readOnly === true });
  const fdePaths: FdeSourcePaths = options.fdeSources ?? fdePathsFromEnv(process.env);
  const economics = options.economics ?? realityTraceEconomics(economicsFromEnv(process.env, loaded.config.economics));
  const world = loadWorld(loaded.config.world_ref);
  const research = await observeResearch(loaded.config.research_command);
  const caller: Caller = { actor: loaded.operator.principal, tenant: loaded.operator.tenant };
  const frames = createFrameRegister();
  const configured = options.governance ?? governanceFromEnv(process.env);
  // Fail closed: governed mode consumes SEA-Forge's authority decision, which the owner has not published (external-interfaces.json).
  if (configured.mode === "sea-forge" && !options.unpublishedAuthorityForTests && interfacePublicationStatus(AUTHORITY_DECISION_INTERFACE) !== "published") {
    throw new Error("SEA-Forge governance is refused: sea_forge.authority_decision is specified_not_published, so Horizon cannot read a committed decision. Governance stays off until SEA-Forge publishes it.");
  }
  // Poll SEA-Forge for decided escalations, so a commit approved or rejected at SEA-Forge directly
  // (not through resolveNavigationApproval) still resumes or fails on its own.
  const approvals = options.approvals ?? approvalAuthorityFromEnv(process.env, caller.actor.id);
  // A signed-in operator's commits go to SEA-Forge as the gateway acting on behalf of the operator's mapped actor.
  // The mapping is validated after the identity store opens; until then every session operator is refused.
  let operatorActors: OperatorActors | null = null;
  const serviceActor = approvals?.service ?? { actor_id: process.env.COGNATE_SEA_FORGE_ACTOR?.trim() || "cognate-service", role: "service" };
  const delegationSocket = options.seaForgeSocket ?? approvals?.socketPath ?? process.env.COGNATE_SEA_FORGE_SOCKET?.trim() ?? "";
  // One gateway client serves delegation, resolution, the inbox listing and closure: the Cognate SDK owns the wire.
  const seaForge =
    approvals !== undefined || (configured.mode === "sea-forge" && configured.authority !== undefined)
      ? new SeaForgeAuthority({ socketPath: delegationSocket, actor: serviceActor, requestIdPrefix: "horizon", ...(approvals?.timeoutMs === undefined ? {} : { timeoutMs: approvals.timeoutMs }) })
      : undefined;
  const governance: GovernanceOptions =
    configured.mode === "sea-forge"
      ? {
          ...configured,
          approvalPollMs: options.readOnly ? 0 : (configured.approvalPollMs ?? 2_000),
          ...(configured.authority === undefined
            ? {}
            : {
                authority: delegatingAuthority(configured.authority, {
                  service: serviceActor,
                  actors: () => operatorActors,
                  serverPrincipalId: caller.actor.id,
                  client: options.delegationClient ?? seaForge!,
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
  // Design v3, section 2: one local writer per desk database. The store is opened and the writer lock taken before any runtime, recovery
  // worker, projection runner or poller is built, so a second desk on the same store is refused before it touches the outbox. A read-only
  // open reads through a guard that refuses writes, and takes no lock and gives none up.
  const storeFile = assertStoreBoundary(loaded.config, options.storePath ?? loaded.config.runtime_store);
  // The process-level lock file comes before any open of the store: opening a store at an older schema migrates it, so a second desk
  // must be refused before that open (R3-4). The store's own record lock below stays as a second check.
  let storeLock: StoreLockFile | undefined;
  if (!options.readOnly) storeLock = await acquireStoreLockFile(storeFile);
  let deskStore: DurableStore;
  try {
    deskStore = options.readOnly ? openReadOnlyStore(storeFile) : openSqliteStore({ path: storeFile });
  } catch (error) {
    if (storeLock !== undefined) await releaseStoreLockFile(storeLock);
    throw error;
  }
  let deskLockToken: string | undefined;
  if (!options.readOnly) {
    try {
      deskLockToken = await acquireDeskLock(deskStore);
    } catch (error) {
      await deskStore.close();
      if (storeLock !== undefined) await releaseStoreLockFile(storeLock);
      throw error;
    }
  }
  // HORIZON-001 1.1.0: bound operations, capacity and the obligation flow (SPEC-CR-002).
  const bindingFor = (operationRef: string) => loaded.config.operations.find((binding) => binding.operation_ref === operationRef);
  /** The operations this deployment binds. A reference outside the catalog and outside this set is Px. */
  const deploymentBoundRefs = new Set(loaded.config.operations.map((binding) => binding.operation_ref));
  // The rulebook is Horizon's DomainForge model; RealityTrace snapshots it so records carry its edition.
  const obligationRt = realityTrace ? new RealityTraceObligation({ bin: realityTrace.bin, dataHome: realityTrace.dataHome, stateHome: realityTrace.stateHome, repoDir: `${realityTrace.repoDir}-obligations`, rulebookEntry: resolve("domain", "interaction-model.sea") }) : null;
  if (!options.readOnly) void obligationRt?.snapshot();
  const obligationDeps: ObligationDeps = {
    store: () => runtime.runtime.store,
    tenant: caller.tenant,
    // Its own repository in the same RealityTrace home, so SEA-Forge reads both through one data home.
    realityTrace: obligationRt,
    settlement: loaded.config.settlement ?? null,
    // The verifier reads a read-only snapshot of the store, never the live WAL database (see settlement/snapshot.ts).
    get snapshot() {
      return loaded.config.settlement ? { liveStore: runtime.storePath, dir: snapshotDirOf(loaded.config.settlement, runtime.storePath) } : undefined;
    },
    allowances: loaded.config.capacity,
    settlementConfigured: governance.mode === "sea-forge" && realityTrace !== undefined,
    now: () => new Date(),
  };
  // The runtime uses the store opened above (and locked, when writable) instead of opening its own.
  const runtime: HorizonRuntime = await createHorizonRuntime(loaded.config, world, {
    caller,
    ...(options.storePath ? { storePath: options.storePath } : {}),
    store: deskStore,
    components: [navigationIntentComponent(frames)],
    agents: [structuralObservationAgent(frames), navigationCommitAgent(() => runtime.runtime.store, { bindingFor, deps: obligationDeps })],
    ...(options.contextAdapter === undefined ? {} : { contextAdapter: options.contextAdapter }),
    governance,
    // The observation commits with the governed invocation itself (the outbox), so it cannot be lost.
    ...(realityTrace ? { outboxFor: observationOutbox(NAVIGATION_INTENT_COMMIT.id) } : {}),
  }).catch(async (error: unknown): Promise<never> => {
    if (deskLockToken !== undefined) await releaseDeskLock(deskStore, deskLockToken);
    await deskStore.close();
    if (storeLock !== undefined) await releaseStoreLockFile(storeLock);
    throw error;
  });
  // A read-only open never migrates: until the desk has run every migration, its records cannot be surfaced read-only.
  if (options.readOnly && (await appliedVersion(runtime.runtime.store, deskScopeOf(caller.tenant, caller.actor.id))) < Math.max(...DESK_MIGRATIONS.map((migration) => migration.version))) {
    await runtime.runtime.close();
    await deskStore.close();
    throw new Error("horizon: the desk's records are not migrated yet, so the store cannot be surfaced read-only. Start the desk once to finish the migration, then surface again.");
  }
  if (loaded.config.settlement) assertSnapshotDir(snapshotDirOf(loaded.config.settlement, runtime.storePath), runtime.storePath);
  // HORIZON-001 1.1.0: suspend pending v1 commit runs and mark the store before anything is served.
  if (!options.readOnly) await activateContract(runtime.runtime.store, new Date());
  // Durable operators, sessions and devices live in the same store. Operators named in configuration are
  // provisioned here (the host's administrative act); the mapping is then validated, never trusted blindly.
  const identity = createIdentityService(identityStoreOf(runtime.runtime.store));
  const identityTenant = identityTenantOf(caller.tenant);
  const operatorsConfig = resolveOperatorsConfig(options.operators ?? loaded.config.operators);
  // The operator the configuration names (before any HORIZON_OPERATOR_REF override): the only operator legacy panel records can be proven to belong to (migration 7).
  const soleOperator = loaded.operator.configuredRef;
  if (!options.readOnly) for (const operatorId of Object.keys(operatorsConfig.actors)) await identity.registerOperator({ tenant: identityTenant, operatorId, label: "configured operator" });
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
  if (!options.readOnly) {
    const stranded = await reconcilePending(runtime.runtime.store, caller.tenant);
    if (stranded.blockers.length > 0) console.error(`horizon: ${stranded.blockers.length} intent(s) hold capacity awaiting authority`);
  }
  const evidence = realityTrace ? new RealityTraceEvidence(runtime.runtime.store, realityTrace) : undefined;
  let issued: FrameView | null = null;
  let boundChoices: readonly StructuralChoice[] = [];
  const windowTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const closureSocket = delegationSocket;

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
    if (!options.readOnly && !pending.terminal && pending.stage === "executed") scheduleClose(pending);
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
    const resolved = await seaForge!.resolveApproval({ approvalId: request.approvalId, resolution: request.resolution, onBehalfOf: authority.operator });
    if (!resolved.ok) throw new Error(`APPROVAL: SEA-Forge refused the resolution: ${resolved.error === "no detail" ? resolved.errorClass : resolved.error}`);
    // SEA-Forge has recorded the decision. A failure from here on must not read as "not recorded".
    return afterRecordedDecision(async () => {
      await runtime.runtime.pollApprovals();
      return settleCommitRun(intent, await runOutcome(run.runId, terminal));
    });
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
    const settlementAuthority = governance.authority as Partial<SettlementAuthority> | undefined;
    if (!evidence || typeof settlementAuthority?.submitEvidence !== "function") throw new Error("RealityTrace and SEA-Forge evidence submission are both required");
    const prior = await latestSettlement(runtime.runtime.store, caller.tenant, intentId);
    if (prior?.realitytrace_observation) return;
    const targetRef = await evidence.observe(invocation);
    const derived = await evidence.evidenceFor(targetRef);
    const packet = await evidence.packet(authority.worldRef, authority, derived);
    const receipt = await settlementAuthority.submitEvidence(packet);
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
    const settlementAuthority = governance.authority as Partial<SettlementAuthority> | undefined;
    if (typeof settlementAuthority?.submitEvidence !== "function" || typeof settlementAuthority.settle !== "function") return unavailable("the configured authority cannot settle");
    if (!evidence) return unavailable("RealityTrace is not configured (COGNATE_REALITYTRACE_BIN)");

    // Ruling before observation is refused without writing a record: nothing was observed, so nothing is settled.
    if (phase === "rule" && !observation) throw new Error("SETTLEMENT: no RealityTrace observation to rule on: observe the commit first");
    if (!observation) {
      try {
        const targetRef = await evidence.observe(invocation);
        const derived = await evidence.evidenceFor(targetRef);
        const packet = await evidence.packet(authority.worldRef, authority, derived);
        const receipt = await settlementAuthority.submitEvidence(packet);
        if (!receipt.ok) return refused(`SEA-Forge refused the evidence: ${receipt.errorClass}: ${receipt.error}`);
        observation = { target_ref: targetRef, sxr_observation_id: derived.sxrObservationId, evidence_id: derived.evidenceId, evidence_packet_id: receipt.envelopeId, evidence_ledger_entry: receipt.ledgerEntry };
      } catch (error) {
        return unavailable(`RealityTrace: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    // The observation step stops here: SEA-Forge has the evidence but has not ruled on it yet.
    if (phase === "observe") return record({ status: "pending", final: false, envelope_id: null, ledger_entry: null, reason: "RealityTrace observed the commit; SEA-Forge has not ruled yet" });
    const settled = await settlementAuthority.settle(authority.operationId, authority.worldRef);
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
    // The gate is here as well as at the request boundary: this is the last place before a
    // capability runs and a record is appended, so an unclassified reference cannot reach it by
    // any other route into the application (R2-03).
    // A classification refusal (unknown, governed, deployment-bound) appends nothing: the contract says no record is appended before refusal (NE-16).
    let classificationRefusal: IntentError | null = null;
    try {
      const classification = classifyReference(identityCatalogOf(), intent.operation_ref, deploymentBoundRefs);
      if (!classification.allowed) {
        const governed = classification.reason === "governed_operation_needs_confirmation";
        const bound = classification.reason === "deployment_bound_operation_needs_its_own_path";
        classificationRefusal = new IntentError(
          governed || bound ? "failed_precondition" : "invalid_argument",
          governed
            ? `${intent.operation_ref} is a ${classification.class} row: it needs its pending record, its confirmation and its authority writer, not a plain intent`
            : bound
              ? `${intent.operation_ref} is bound by this deployment: its authority, its evidence and its expiry are its binding contract's, and a plain intent carries none of them`
              : `${intent.operation_ref} is not a classified operation: it is neither in the identity catalog nor bound by this deployment`,
        );
      }
    } catch (error) {
      throw new IntentError("failed_precondition", `the identity catalog could not be loaded, so nothing was committed (${error instanceof Error ? error.message : String(error)})`);
    }
    if (classificationRefusal !== null) throw classificationRefusal;
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
    // The operation reference is classified before anything runs. An operation the identity
    // catalog does not know is not a local write by default: it is Px unless the deployment binds
    // it, and a governed row never travels the plain intent path (R2-03).
    let classification;
    try {
      classification = classifyReference(identityCatalogOf(), request.operationRef, deploymentBoundRefs);
    } catch (error) {
      throw new IntentError("failed_precondition", `the identity catalog could not be loaded, so nothing was committed (${error instanceof Error ? error.message : String(error)})`);
    }
    if (!classification.allowed) {
      const governed = classification.reason === "governed_operation_needs_confirmation";
      const bound = classification.reason === "deployment_bound_operation_needs_its_own_path";
      throw new IntentError(
        governed || bound ? "failed_precondition" : "invalid_argument",
        governed
          ? `${request.operationRef} is a ${classification.class} row: it needs its pending record, its confirmation and its authority writer, not a plain intent`
          : bound
            ? `${request.operationRef} is bound by this deployment: its authority, its evidence and its expiry are its binding contract's, and a plain intent carries none of them`
            : `${request.operationRef} is not a classified operation: it is neither in the identity catalog nor bound by this deployment`,
      );
    }
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
          const closed = await seaForge!.authorityClosure({ operationId, discriminationObservationId: discrimination, verificationObservationIds: verifications, timeoutMs: 30_000 });
          if (!closed.ok) throw new Error(`SEA-Forge refused the closure: ${closed.error === "no detail" ? closed.errorClass : closed.error}`);
          return { b: closed.b, c: closed.c, committed_at: closed.committed_at, on_time: closed.on_time };
        },
      });
    } catch (error) {
      // Without a recorded closure SEA-Forge still settles once deadline + grace passed: unresolved, rejected.
      await recordSettlementFor(intentId, { status: "unavailable", final: false, envelope_id: null, ledger_entry: null, reason: `closure: ${error instanceof Error ? error.message : String(error)}` });
    }
    const settlementAuthority = governance.authority as Partial<SettlementAuthority> | undefined;
    const worldRef = (await governedInvocationOf(intentId).then((inv) => (inv ? authorityOf(inv)?.worldRef : undefined))) ?? world.cognateWorldRef;
    if (typeof settlementAuthority?.settle !== "function") return recordSettlementFor(intentId, { status: "unavailable", final: false, envelope_id: null, ledger_entry: null, reason: "the configured authority cannot settle" });
    // "Settlement is pending" means SEA-Forge has not recorded the closure yet: wait for it (bounded by window close + grace), never refuse.
    const settle = settlementAuthority.settle.bind(settlementAuthority);
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
   *
   * The role is an argument, not a field of the request: it selects the projection the surface
   * is reduced for, and every caller passes the role its authenticated context gives it. The
   * role never establishes identity or authority — the intent's actor is the frame's observer
   * (DEF-ROLE-FROM-REQUEST).
   */
  async function commitSurfaceIntent(
    submission: SurfaceIntentRequestBody,
    role: SurfaceRole,
  ): Promise<
    | { readonly ok: true; readonly result: IntentCommit; readonly bound: EquivalenceResult }
    | { readonly ok: false; readonly code: string; readonly message: string }
  > {
    const frame = frames.current();
    if (frame === null) return { ok: false, code: "stale_surface", message: "SURFACE: no frame is current; request the surface first" };
    if (typeof submission.frame_id === "string" && submission.frame_id !== frame.frame_id) {
      return { ok: false, code: "stale_surface", message: `SURFACE: frame ${submission.frame_id} is not the current frame` };
    }
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
    const listed = await seaForge!.listApprovals({ timeoutMs: 15_000 });
    if (!listed.ok) return null;
    const decided = listed.approvals.filter((a) => waited.has(a.approval_id) && a.resolved_by !== null);
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
    const fdeTarget = operation === "why" ? (options.arguments as { readonly target_ref?: string } | undefined)?.target_ref : undefined;
    const sources: DebuggerSources = {
      frame,
      objects: projection.objects,
      links: projection.links,
      lineage: projection.lineage ?? [],
      declared_relations: [...declared.relations],
      ...(fdeTarget === undefined ? {} : { fde: { episode_ref: fdeTarget, values: fdeDebuggerValues(readFdeSources(fdePaths), fdeTarget) } }),
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
      const listed = await seaForge!.listApprovals({ timeoutMs: approvals.timeoutMs ?? 15_000 });
      if (!listed.ok) return { state: "unreachable", message: `${listed.errorClass}: ${listed.error}` };
      const waiting = new Set((await readIntentAttempts(runtime.runtime.store)).flatMap((entry) => (entry.outcome === "awaiting_authority" && entry.approvalId ? [entry.approvalId] : [])));
      return { state: "listed", inbox: buildInbox(listed.approvals, listed.excluded, { now, waitingApprovalIds: waiting, operatorRef: caller.actor.id }) };
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
    if (refusal !== null) {
      // A device credential is never turned into the operator. The phone's move would have to run
      // under the device's own principal, and the commit path is the person's: the two are not
      // interchangeable, so the commit is refused rather than run under a borrowed identity
      // (R5-03). The row the phone's command resolves is refused by the catalog before this
      // branch; this is the backstop that keeps a drifted catalog from succeeding here.
      if (who.actor.id.startsWith(DEVICE_ACTOR_PREFIX)) {
        return { ok: false, code: "no_device_delegation", message: "A phone cannot make this move as the person: there is no delegation from the device to the operator at this release. Make the move on the desktop." };
      }
      return { ok: false, code: "no_actor_mapping", message: refusal };
    }
    // The same commit the desktop's /workspace/intent makes, run as the session's Caller.
    let outcome: Awaited<ReturnType<typeof commitSurfaceIntent>> | null = null;
    let failure: unknown = null;
    try {
      outcome = await acting.run(who, () => commitSurfaceIntent({ transport: "gui", node_id: actionId, intent_id: intentId }, "human"));
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
  /** The case keeper as a client: present when a socket is named. Reads go as the service; writes also name the operator. */
  const caseKeeper: CaseKeeper | null =
    delegationSocket === ""
      ? null
      : { socketPath: delegationSocket, service: serviceActor, ...(approvals ? { operator: approvals.operator } : {}), ...(approvals?.timeoutMs ? { timeoutMs: approvals.timeoutMs } : {}) };
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
    let repos: { repo_id: string; path: string | null; temporary?: boolean }[] = [];
    let lastDay: string | null = null;
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
        repos = listed.repos.map((r) => ({ ...r, temporary: r.path !== null && (r.path.startsWith(`${tmpDir().replace(/\/$/, "")}/`) || r.path.startsWith("/tmp/")) }));
        repoId = repoId ?? repos[0]?.repo_id ?? null;
        if (repoId === null) notice = "This record source holds no repositories yet, so there is nothing to compare.";
        else {
          const read = readLedgerDay(reader, { repoId, day, timeZone: deskTimeZone, cacheDir });
          if (!read.ok) notice = `The record could not be read: ${read.message}`;
          else {
            lastDay = read.last_day;
            const all = listSessions(read.rows);
            const shown = only === "contradicted" ? onlyContradicted(all) : all;
            sessions = shown.map((summary) => ({ ...summary, label: labelOf(summary.session_id, summary.event_id) }));
            if (shown.length === 0) notice = `${only ? "No contradicted session on this day." : "No sessions are recorded on this day."}${read.last_day === null ? " The record holds no sessions on any day." : read.last_day === day ? "" : ` Last recorded session: ${read.last_day}.`}`;
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
      lastDay,
      sessions,
      view,
      label: view ? labelOf(view.session.session_id, view.session.event_id) : null,
      notice,
      labelError: params.get("label_error"),
    };
    return { props, view, repoNames: namesOfRepos(allRepos), labels };
  }


  // ---- Stage 2: the notebook and the live desk. Notes are the operator's own writing and are not sent to the record keeper. ----
  const deskWho: Who = { tenant: caller.tenant, operator: caller.actor.id };
  const deskDist = joinPath(import.meta.dir, "..", "dist", "desk");
  let repoNameCache: { at: number; names: string[] } = { at: 0, names: [] };

  /** Repository names to hide while Presenting is on. The record keeper is asked at most once a minute. */
  function deskRepoNames(): string[] {
    if (clock().getTime() - repoNameCache.at < 60_000 && repoNameCache.at !== 0) return repoNameCache.names;
    const all: { repo_id: string; path: string | null }[] = [];
    for (const each of recordSources) {
      try {
        const listed = readerFor(each).repos();
        if (listed.ok) all.push(...listed.repos);
      } catch {
        // A record keeper that cannot be asked contributes no names; the desk still hides the ones it knows.
      }
    }
    repoNameCache = { at: clock().getTime(), names: namesOfRepos(all) };
    return repoNameCache.names;
  }

  /** The case keeper's cases, asked at most every two seconds so one poll and one view agree. */
  let keeperCaseCache: { at: number; value: Awaited<ReturnType<typeof listCases>> } | null = null;
  async function keeperCases(): Promise<Awaited<ReturnType<typeof listCases>> | null> {
    if (caseKeeper === null) return null;
    if (keeperCaseCache !== null && Date.now() - keeperCaseCache.at < 2_000) return keeperCaseCache.value;
    const value = await listCases(caseKeeper);
    keeperCaseCache = { at: Date.now(), value };
    return value;
  }
  // A case is named by what its template says it is for. The template of a case never changes, so it is read once per case; a template's
  // description is read once per template (and again, at most every 30 s, while some template is still unknown).
  const caseTemplate = new Map<string, string | null>();
  const templateWords = new Map<string, string | null>();
  let templatesAt = 0;
  async function titleOf(c: CaseLine): Promise<string> {
    const fallback = caseTitle(c.summary, c.created_at);
    if (caseKeeper === null) return fallback;
    if (!caseTemplate.has(c.case_id)) {
      const overview = await caseDigest(caseKeeper, c.case_id);
      if (overview.kind !== "ok") return fallback;
      caseTemplate.set(c.case_id, overview.value.template_ref);
    }
    const ref = caseTemplate.get(c.case_id) ?? null;
    if (ref === null) return fallback;
    if (!templateWords.has(ref) && Date.now() - templatesAt > 30_000) {
      templatesAt = Date.now();
      const options = await entryOptions(caseKeeper);
      if (options.kind === "ok") for (const t of options.value.templates) templateWords.set(t.template_ref, t.description);
    }
    const description = templateWords.get(ref);
    return readableTitle(description, ref) ?? fallback;
  }
  const isOpenCase = (c: CaseLine): boolean => c.case_state === "active" || c.case_state === "awaiting_approval";
  const CASE_STATE_PLAIN: Record<string, string> = { active: "Running", awaiting_approval: "Waiting for your approval", completed: "Done", terminated: "Stopped" };

  /** Horizon's own cases and the case keeper's, newest first. The status bar, the left list, Explore and Work all read this one list. */
  async function deskCases(): Promise<DeskCase[]> {
    const rows = await runtime.runtime.store.listRecords(CASE_COLLECTION, { tenant: caller.tenant });
    const own = rows.map((row): DeskCase => ({ case_ref: String(row.value.case_ref), purpose: String(row.value.purpose), opened_at: String(row.value.opened_at), source: "horizon" }));
    const listed = await keeperCases();
    const theirs = listed?.kind === "ok" ? await Promise.all(listed.value.cases.map(async (c): Promise<DeskCase> => ({ case_ref: `case:${c.case_id}`, purpose: await titleOf(c), opened_at: c.created_at, source: "case keeper", state: CASE_STATE_PLAIN[c.case_state] ?? "Unknown state" }))) : [];
    return [...own, ...theirs].sort((a, b) => (a.opened_at < b.opened_at ? 1 : -1));
  }

  async function deskState(params: URLSearchParams): Promise<DeskState> {
    const store = runtime.runtime.store;
    const now = clock();
    const today = dayOf(null);
    const day = dayOf(params.get("day"));
    const status = cockpitStatus();
    const openCaseNow = await latestCase(store, caller.tenant);
    const casesNow = await deskCases();
    // With no case opened in Horizon, the newest case still running at the case keeper is the open case.
    const keeperOpen = casesNow.find((c) => c.source === "case keeper" && (c.state === "Running" || c.state === "Waiting for your approval")) ?? null;
    const presenting = await presentingOn(store, caller.tenant, caller.actor.id);
    const workshop = loaded.config.workshop ? keyState(loaded.config.workshop, now) : ({ state: "missing", days_left: null } as const);
    const health = partsOf({ rules: world.worldRef !== "", cases: status.governed, records: recordSources.length > 0 || status.realitytrace, workshop: { state: workshop.state, days_left: "days_left" in workshop ? workshop.days_left : null } });
    const sources = sourcesOf({ cases: status.governed, agentWork: workshop.state === "ok" || workshop.state === "expiring", records: recordSources.length > 0 || status.realitytrace });
    const allMoves = await recentMoves();
    const moves = status.governed ? allMoves : [];
    const decide = await decideState(allMoves);
    const noteId = params.get("note");
    const selectedNote = noteId ? await getNote(store, deskWho, noteId) : null;
    const base: Omit<DeskState, "rev"> = {
      today,
      day,
      timezone: deskTimeZone,
      status: {
        org: caller.tenant,
        setup: loaded.setup ?? null,
        rules: world.worldRef === "" ? "" : statusOf({ worldRef: world.worldRef, governed: status.governed, realitytrace: status.realitytrace, approvals: status.approvals, operator: caller.actor.id }).world,
        openCase: openCaseNow ? { case_ref: openCaseNow.case_ref, purpose: openCaseNow.purpose } : keeperOpen ? { case_ref: keeperOpen.case_ref, purpose: keeperOpen.purpose } : null,
        waiting: waitingCount(decide),
        parts: health.parts,
        keyWarning: health.keyWarning,
        presenting,
        reconciliation: await notRecordedWarnings(store, caller.tenant),
        rulebookWarning: obligationRt !== null && obligationRt.rulebookConnected() === false ? "Rulebook not connected for records: new records are made without a rulebook edition." : null,
      },
      days: await listDays(store, deskWho),
      cases: casesNow,
      tags: await listTags(store, deskWho),
      notes: await listDay(store, deskWho, day),
      caseNotes: openCaseNow ?? keeperOpen ? await listCase(store, deskWho, (openCaseNow?.case_ref ?? keeperOpen!.case_ref)) : [],
      activity: moves
        .filter((move) => move.at !== null && new Intl.DateTimeFormat("en-CA", { timeZone: deskTimeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(move.at)) === day)
        .map((move) => ({ id: `move:${move.intent_id}`, at: move.at as string, source: "Cases" as const, text: `${move.operation_ref}: ${move.decided.text}` }))
        .sort((a, b) => (a.at < b.at ? -1 : 1)),
      sources,
      selected: selectedNote ? { note: selectedNote, history: await noteHistory(store, deskWho, selectedNote.note_id) } : null,
      decide,
      home: await homeState(params, openCaseNow !== null || keeperOpen !== null, allMoves),
      panels: await panelsData(),
    };
    const shown = presenting ? applyStandIns(base, presentingKey(), deskRepoNames()) : base;
    return { ...shown, rev: createHash("sha256").update(JSON.stringify(shown)).digest("hex").slice(0, 16) };
  }

  /** `forAgent`: only notes marked "Let agents read this note" take part, and days and tags (which are made from every note) are not given. */
  async function deskSearch(params: URLSearchParams, forAgent = false): Promise<SearchResult> {
    const store = runtime.runtime.store;
    const q = (params.get("q") ?? "").trim();
    const day = params.get("day") || null;
    const tag = params.get("tag") || null;
    const filtered = day !== null || tag !== null;
    const notes = (await searchNotes(store, deskWho, { q, ...(day ? { day } : {}), ...(tag ? { tag } : {}) })).filter((n) => !forAgent || n.shared_with_agents === true);
    const records = sourcesOf({ cases: true, agentWork: false, records: recordSources.length > 0 || cockpitStatus().realitytrace })[2]!;
    const result: SearchResult = {
      q,
      day,
      tag,
      notes,
      cases: filtered ? [] : (await deskCases()).filter((c) => matches(c.purpose, q)),
      days: filtered || forAgent ? [] : (await listDays(store, deskWho)).filter((d) => matches(d.day, q)),
      tags: filtered || forAgent ? [] : (await listTags(store, deskWho)).filter((t) => matches(t.name, q)),
      records,
    };
    return (await presentingOn(store, caller.tenant, caller.actor.id)) ? applyStandIns(result, presentingKey(), deskRepoNames()) : result;
  }

  // ---- Stage 3: Decide, Work, and the home panels that used to live on the old workspace page ----
  async function decideState(moves: readonly WorkspaceMove[]): Promise<DecideLookup> {
    const inbox = await approvalInbox(clock());
    let caseApprovals: CaseApprovals = { kind: "none" };
    if (caseKeeper !== null && approvals !== undefined) {
      const listed = await approvalList(caseKeeper);
      caseApprovals = listed.kind === "ok" ? { kind: "listed", approvals: listed.value.approvals, unreadable: listed.value.unreadable } : listed.kind === "stale" ? { kind: "none" } : { kind: "notice", words: listed.words };
    }
    const holds = await activeHolds(runtime.runtime.store, caller.tenant);
    const human = await humanSteps();
    const proposedLessons = await listLessons(runtime.runtime.store, caller.tenant, "proposed");
    const built = buildDecide({ inbox, moves, caseApprovals, holds, humanSteps: human.steps, extraNotices: human.notices, lessons: proposedLessons });
    // Accepting a step is blocked while an answer the operator gave an agent about it has had no reply.
    const stepOf = new Map<string, string>();
    for (const card of built.cards) {
      const step = card.kind === "human_step" ? /^human:[^:]+:(.+)$/.exec(card.id)?.[1] ?? null : card.kind === "case_task" && caseApprovals.kind === "listed" ? caseApprovals.approvals.find((row) => `case-task:${row.approval_id}` === card.id)?.plan_item_id ?? null : null;
      if (step !== null) stepOf.set(card.id, step);
    }
    // Accepting a step is blocked while an answer the operator gave an agent about it has had no reply.
    const answers = (await listAnswers(runtime.runtime.store, deskScopeOf(caller.tenant, caller.actor.id))).filter((a) => waitsForAgent(a) && a.step !== null);
    if (answers.length === 0) return { ...built, stepOf };
    return {
      ...built,
      stepOf,
      cards: built.cards.map((card) => {
        const step = stepOf.get(card.id) ?? null;
        return step !== null && acceptanceBlocked(answers, step) ? { ...card, blocked: card.blocked ?? WAITING_WORDS, preview: { ...card.preview, accept: null } } : card;
      }),
    };
  }

  /** Every human step that is running and not settled, in every open case at the case keeper. Each one waits for a person. */
  async function humanSteps(): Promise<{ readonly steps: HumanStepInput[]; readonly notices: string[] }> {
    const steps: HumanStepInput[] = [];
    const notices: string[] = [];
    if (caseKeeper === null) return { steps, notices };
    const listed = await keeperCases();
    if (listed === null) return { steps, notices };
    if (listed.kind !== "ok") return { steps, notices: [`Steps waiting for you cannot be listed. ${listed.kind === "stale" ? REFUSED_OLD : listed.words}`] };
    for (const c of listed.value.cases.filter(isOpenCase).slice(0, 20)) {
      const horizon = await caseSteps(caseKeeper, c.case_id);
      if (horizon.kind !== "ok") {
        notices.push(`The steps of ${await titleOf(c)} could not be read, so one waiting for you may be missing. ${horizon.kind === "stale" ? REFUSED_OLD : horizon.words}`);
        continue;
      }
      const waiting = horizon.value.steps.filter((s) => /^human_?task$/i.test(s.item_kind) && s.execution === "active" && s.settlement === "unsettled");
      if (waiting.length === 0) continue;
      const overview = await caseDigest(caseKeeper, c.case_id);
      for (const step of waiting) steps.push({ case_id: c.case_id, case_title: await titleOf(c), plan_item_id: step.plan_item_id, name: step.name, last_event_at: step.last_event_at, digest: overview.kind === "ok" ? overview.value.digest : null });
    }
    return { steps, notices };
  }

  async function homeState(params: URLSearchParams, caseOpen: boolean, moves: readonly WorkspaceMove[]): Promise<HomeState> {
    const store = runtime.runtime.store;
    const status = cockpitStatus();
    const committed = (await readIntentRecords(store)).some((entry) => entry.event.tenant === caller.tenant);
    const skipped = await onboardingSkipped(store, caller.tenant, caller.actor.id);
    const caseParam = params.get("case_error");
    const receiptId = params.get("receipt");
    const receipt = receiptId ? await receiptFor(receiptId) : null;
    return {
      onboarding: onboardingOf({ governed: status.governed, realitytrace: status.realitytrace, caseOpen, committed, skipped }),
      caseError: caseParam === "empty" || caseParam === "too_long" ? caseParam : null,
      moves,
      receipt: receipt === null ? null : { intent_id: receipt.intent_id, found: receipt.found, move: receipt.move },
      assurance: approvalAssuranceOf(process.env.HORIZON_APPROVAL_ASSURANCE),
    };
  }

  const REFUSED_OLD = "That decision changed or is no longer waiting. Look at the new version and decide again.";
  /** What a decision says when the wait it was looked up with has changed before the decision ran. */
  const STALE_LOOKUP_WORDS = "The case changed after you looked. Look again, then start.";

  /** One decision from a card. The preview code the operator looked at must still be the card's, or nothing is done. */
  /** A finding from a review, proposed as a lesson. It waits in Decide; only a person's accept makes it active. */
  async function deskProposeLesson(request: Request): Promise<Response> {
    const headers = { "cache-control": "no-store" };
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(await request.text());
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
      body = parsed as Record<string, unknown>;
    } catch {
      return Response.json({ ok: false, message: "That lesson could not be read. Nothing was recorded." }, { status: 400, headers });
    }
    // The proposer is the caller, never a string in the request. A body that names one is
    // refused rather than believed: a lesson displayed as "Proposed by ..." is a claim about who
    // said it, and the only source for that claim is the session that asked (R4-07).
    const named = reservedActorField(body);
    if (named !== null) {
      return Response.json({ ok: false, message: `This request does not take an actor from the body (${named}). The signed-in session is who you are. Nothing was recorded.` }, { status: 400, headers });
    }
    const extra = unknownField(body, schemaFieldNames("params.horizon_lesson_propose"));
    if (extra !== null) {
      return Response.json({ ok: false, message: `This request does not take ${extra}. Nothing was recorded.` }, { status: 400, headers });
    }
    const proposed = await proposeLesson(runtime.runtime.store, { tenant: caller.tenant, text: typeof body.text === "string" ? body.text : "", source: typeof body.source === "string" && body.source !== "" ? body.source.slice(0, 200) : null, proposed_by: caller.actor.id, now: clock() });
    if (!proposed.ok) return Response.json({ ok: false, message: proposed.message }, { status: 400, headers });
    return Response.json({ ok: true, message: "Lesson proposed. It waits in Decide until you accept it.", lesson_id: proposed.lesson.lesson_id, status: proposed.lesson.status }, { headers });
  }

  /** Mark done, approve, reject, hold: the same operation as before, and one conversation row for what came of it. */
  async function deskDecide(request: Request): Promise<Response> {
    let sent: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(await request.clone().text());
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) sent = parsed as Record<string, unknown>;
    } catch {
      // The core answers an unreadable request in words.
    }
    const cardId = typeof sent.card_id === "string" ? sent.card_id : "";
    // The lookup runs outside the queue: it may wait on the case keeper, and what it finds never authorises a decision. The queued
    // command re-reads the local waits the card depends on, and refuses if the lookup no longer matches them.
    const looked = cardId === "" ? null : await decideState(await recentMoves()).catch(() => null);
    const lookedCard = looked?.cards.find((c) => c.id === cardId);
    const { card, response } = await panelCommand(async () => {
      // Revalidated when the command runs, not when it was queued: a session that ended while it waited (logout) refuses it.
      if (!pairing.paired(request.headers.get("cookie"))) return { card: undefined, response: notPairedRefusal() };
      // Shared with the panel and agent writes: no decision while the records are migrating or after a failed migration.
      const paused = migrationBlock();
      if (paused !== null) return { card: undefined, response: Response.json({ ok: false, outcome: "unavailable", message: paused }, { status: 503, headers: { "cache-control": "no-store" } }) };
      if (looked !== null && lookedCard !== undefined) {
        const step = looked.stepOf.get(cardId) ?? null;
        const answers = await listAnswers(runtime.runtime.store, deskScopeOf(caller.tenant, caller.actor.id));
        // A wait that exists now is refused with its own words, as the rule above does.
        if (step !== null && acceptanceBlocked(answers, step)) return { card: lookedCard, response: Response.json({ ok: false, outcome: "blocked", message: WAITING_WORDS }, { status: 409, headers: { "cache-control": "no-store" } }) };
        // A wait the lookup saw has gone since: the card the person looked at is no longer the one that would be decided.
        if (lookedCard.blocked === WAITING_WORDS) return { card: lookedCard, response: Response.json({ ok: false, outcome: "stale", message: STALE_LOOKUP_WORDS }, { status: 409, headers: { "cache-control": "no-store" } }) };
      }
      return { card: lookedCard, response: await deskDecideCore(request, looked) };
    });
    if (card === undefined || (response.status === 400 && !response.ok)) return response;
    const done = (await response.clone().json().catch(() => null)) as { ok?: boolean; message?: string; receipt?: string | null } | null;
    const verb = sent.choice === "hold" ? "Held" : sent.choice === "release" ? "Released" : sent.choice === "reject" ? "Rejected" : card.kind === "human_step" ? "Marked done" : "Accepted";
    const human = /^human:([^:]+):(.+)$/.exec(card.id);
    const recorded = await logRow({ source: "you", kind: "decision", words: `${verb}: ${card.title}`, outcome: done?.message ?? "", status: done?.ok === true ? "done" : "refused", refs: { ...(human ? { case_id: human[1]!, step_id: human[2]! } : {}), ...(typeof done?.receipt === "string" ? { intent_id: done.receipt } : {}) } });
    return withRecorded(response, recorded);
  }

  async function deskDecideCore(request: Request, looked: DecideLookup | null = null): Promise<Response> {
    const fail = (status: number, outcome: string, message: string, details: string | null = null): Response => Response.json({ ok: false, outcome, message, ...(details === null ? {} : { details }) }, { status, headers: { "cache-control": "no-store" } });
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(await request.text());
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
      body = parsed as Record<string, unknown>;
    } catch {
      return fail(400, "unreadable", "That decision could not be read. Nothing was done.");
    }
    const cardId = typeof body.card_id === "string" ? body.card_id : "";
    const choice = body.choice;
    const previewCode = typeof body.preview_code === "string" ? body.preview_code : "";
    if (cardId === "" || (choice !== "accept" && choice !== "reject" && choice !== "hold" && choice !== "release")) return fail(400, "unreadable", "Choose accept, reject or hold on a card. Nothing was done.");
    const store = runtime.runtime.store;
    const now = clock();
    const state = looked ?? (await decideState(await recentMoves()));
    const card = state.cards.find((candidate) => candidate.id === cardId);
    if (card === undefined) return fail(404, "gone", "That decision is no longer waiting. It may have been answered somewhere else. Nothing was done.");
    // The route is a dispatcher: the server resolves what kind of card this is, and the catalog
    // says which operation that kind together with the chosen action performs. A pair the catalog
    // does not list is Px and is refused before any effect runs, so no card is ever downgraded to
    // a weaker row by taking another path to it (R3-02).
    let operation: string | null;
    try {
      operation = resolveDispatchedOperation(identityCatalogOf(), "POST /desk/decide", choice, deskCardKind(card));
    } catch (error) {
      return fail(503, "unavailable", `The identity catalog could not be loaded, so nothing was decided (${error instanceof Error ? error.message : String(error)}).`);
    }
    if (operation === null) return fail(400, "px", "That decision is not one Horizon knows. Nothing was done.");
    if (choice === "release") {
      if (operation !== "decision.release") return fail(400, "px", "That decision is not one Horizon knows. Nothing was done.");
      if (card.held === null) return fail(409, "not_held", "That card is not on hold.");
      await putHold(store, { tenant: caller.tenant, card_id: card.id, reason: card.held.reason, released: true, now });
      return Response.json({ ok: true, message: "Released. The card is back under Needs you." }, { headers: { "cache-control": "no-store" } });
    }
    if (card.held !== null) return fail(409, "held", "This one is on hold. Release the hold first.");
    const sentRecords = Array.isArray(body.records) ? (body.records as unknown[]).flatMap((r) => (typeof r === "object" && r !== null && typeof (r as { ref?: unknown }).ref === "string" && typeof (r as { expected_digest?: unknown }).expected_digest === "string" ? [{ ref: (r as { ref: string }).ref, expected_digest: (r as { expected_digest: string }).expected_digest }] : [])) : [];
    const sameRecords = JSON.stringify(sentRecords) === JSON.stringify(card.preview.records);
    // The case keeper judges its own versions: for its approvals, what the operator saw is what gets sent to it.
    const keeperJudges = card.kind === "case_task" && (choice === "accept" || choice === "reject");
    if (previewCode !== card.preview.code && !(keeperJudges && !sameRecords)) return fail(409, "preview_out_of_date", "Preview out of date. What this decision shows changed while you were looking. Nothing was done. Look at the new preview and decide again.");
    const needsReason = choice === "hold" || (choice === "accept" && card.reason_for_accept);
    const reasonCheck = checkReason(body.reason);
    if (needsReason && !reasonCheck.ok) return fail(400, "reason_needed", reasonCheck.message);
    const reason = reasonCheck.ok ? reasonCheck.reason : null;
    const audit = async (outcome: string): Promise<void> => {
      try {
        await recordDecision(store, { tenant: caller.tenant, operator: caller.actor.id, card_id: card.id, choice, reason, preview_code: previewCode, outcome, now });
      } catch {
        // The decision itself is already recorded where it counts; a missing audit row is not hidden by failing the answer.
      }
    };
    // What the catalog says the runtime does with this operation, checked before anything is
    // changed. A row the catalog refuses performs no target effect here: the approval, the case
    // decision and the settlement halves are all refused at this freeze, and the refusal is
    // recorded (R5-01).
    const refusalCheck = checkFrozenRefusal(operation, { route: "POST /desk/decide" });
    if (!refusalCheck.ok) return fail(503, "unavailable", refusalCheck.message);
    if (refusalCheck.refusal !== null) {
      await audit("refused");
      return fail(403, "refused", refusalWords(refusalCheck.refusal));
    }
    if (choice === "hold") {
      if (operation !== "decision.hold") return fail(400, "px", "That decision is not one Horizon knows. Nothing was done.");
      await putHold(store, { tenant: caller.tenant, card_id: card.id, reason: reason as string, released: false, now });
      await audit("held");
      return Response.json({ ok: true, message: "On hold. Nothing changed; the step keeps waiting. Release the hold to bring it back." }, { headers: { "cache-control": "no-store" } });
    }
    if (card.blocked !== null) return fail(409, "blocked", card.blocked);

    if (operation === "approval.approve" || operation === "approval.reject") {
      const approvalId = card.id.slice("approval:".length);
      let failure: unknown = null;
      try {
        await resolveNavigationApproval({ approvalId, resolution: choice === "accept" ? "approved" : "rejected" });
      } catch (error) {
        // A rejected commit fails by design and is audited; anything else is refused here.
        if (!(error instanceof Error && error.message.startsWith("INTENT: governed commit refused"))) failure = error;
      }
      // What was decided and what happened is read back from the case keeper's own list, never from the click.
      const readout = await approvalInbox(clock());
      const listedItem = readout.state === "listed" ? [...readout.inbox.waiting, ...readout.inbox.decided].find((entry) => entry.approval_id === approvalId) : undefined;
      const standing = listedItem === undefined ? null : { state: listedItem.state, resolved_by: listedItem.resolved_by };
      if (failure !== null) {
        const code = approvalErrorCode(failure);
        // A later step failed after the decision was recorded: the decision itself still counts.
        await audit(code === "followup_failed" ? (choice === "accept" ? "approved" : "rejected") : "refused");
        return fail(409, code, failedDecision(code, standing), failure instanceof Error ? failure.message : String(failure));
      }
      await audit(choice === "accept" ? "approved" : "rejected");
      const intentId = await intentIdForApproval(approvalId);
      const confirmed = confirmedDecision(choice, standing);
      return Response.json({ ok: confirmed.ok, ...(confirmed.ok ? {} : { outcome: "unconfirmed" }), message: confirmed.message, receipt: intentId }, { headers: { "cache-control": "no-store" } });
    }

    if (operation === "lesson.decide") {
      // Stage 0B: a lesson decision is a reserved person change; it waits for the local terminal.
      const lessonWaiting = await confirmationGate(store, { tenant: caller.tenant, operator: caller.actor.id, operationId: "lesson.decide", params: { lesson_id: card.id, choice }, now }, confirmationTerminal());
      if (!lessonWaiting.ok) return awaitingDeskConfirmation(lessonWaiting);
      const decided = await decideLesson(store, { lesson_id: card.id, choice: choice === "accept" ? "accept" : "reject", person: caller.actor.id, now });
      if (!decided.ok) {
        await audit("refused");
        return fail(409, "refused", decided.message);
      }
      await audit(choice === "accept" ? "lesson_active" : "lesson_rejected");
      return Response.json({ ok: true, message: choice === "accept" ? "Lesson accepted. It is now active, recorded with your name and the time." : "Lesson rejected. It will not become active." }, { headers: { "cache-control": "no-store" } });
    }

    if (operation === "case.task.decide") {
      if (caseKeeper === null) return fail(503, "unreachable", "The case keeper is not set up, so this cannot be decided.");
      const approvalId = card.id.slice("case-task:".length);
      const listed = await approvalList(caseKeeper);
      const row = listed.kind === "ok" ? listed.value.approvals.find((candidate) => candidate.approval_id === approvalId) : undefined;
      if (listed.kind !== "ok") return fail(502, "unreachable", listed.kind === "stale" ? REFUSED_OLD : listed.words, detailsOf(listed));
      if (row === undefined) return fail(404, "gone", "That decision is no longer waiting. Nothing was done.");
      if (sentRecords.length === 0) return fail(400, "unreadable", "This decision did not carry the version you looked at, so it was not sent. Nothing was done.");
      const decideBase = `horizon:decide:${approvalId}:${choice}`;
      const decideId = await requestIdFor(store, caller.tenant, decideBase);
      const result = await caseKeeperDecide(caseKeeper, {
        case_id: row.case_id,
        approval_id: approvalId,
        decision: choice === "accept" ? "approve" : "reject",
        ...(reason ? { note: reason } : {}),
        request_id: decideId,
        preconditions: { records: sentRecords },
      });
      if (result.kind === "stale" || result.kind === "refused") await attemptRefused(store, caller.tenant, decideBase, decideId);
      if (result.kind === "ok") {
        await audit(choice === "accept" ? "approved" : "rejected");
        return Response.json({ ok: true, message: choice === "accept" ? "Approved. The case keeper recorded your decision." : "Rejected. The case keeper recorded your decision." }, { headers: { "cache-control": "no-store" } });
      }
      await audit(result.kind === "stale" ? "refused_as_stale" : result.kind);
      if (result.kind === "stale") return fail(409, "stale", `The case keeper refused this: ${result.words}`);
      return fail(result.kind === "refused" ? 409 : 502, result.kind, result.words, detailsOf(result));
    }

    if (operation === "case.task.complete") {
      if (caseKeeper === null) return fail(503, "unreachable", "The case keeper is not set up, so this cannot be done.");
      const [, caseId, itemId] = /^human:([^:]+):(.+)$/.exec(card.id) ?? [];
      if (caseId === undefined || itemId === undefined) return fail(400, "unreadable", "That step is not one Horizon knows. Nothing was done.");
      if (reason === null) return fail(400, "reason_needed", "Type a reason first. It is kept with the decision.");
      // `human_task_complete` takes no preconditions, so the case keeper cannot refuse a stale request itself. Horizon reads the
      // case's version again right now and refuses locally if it is not the one the card pinned.
      const pinned = card.preview.records[0];
      const fresh = await caseDigest(caseKeeper, caseId);
      if (fresh.kind !== "ok") return fail(fresh.kind === "stale" ? 409 : fresh.kind === "refused" ? 409 : 502, fresh.kind, fresh.kind === "stale" ? REFUSED_OLD : fresh.words, detailsOf(fresh));
      if (pinned === undefined || fresh.value.digest === null || fresh.value.digest.expected_digest !== pinned.expected_digest) return fail(409, "preview_out_of_date", "Preview out of date. This case changed after you looked at it. Nothing was done. Look at the new preview and decide again.");
      const humanBase = `horizon:human:${caseId}:${itemId}`;
      const humanId = await requestIdFor(store, caller.tenant, humanBase);
      const result = await humanTaskComplete(caseKeeper, { case_id: caseId, item_id: itemId, justification: reason, request_id: humanId });
      if (result.kind === "stale" || result.kind === "refused") await attemptRefused(store, caller.tenant, humanBase, humanId);
      if (result.kind === "ok") {
        await audit("marked_done");
        return Response.json({ ok: true, message: "Marked done. The case keeper recorded your reason." }, { headers: { "cache-control": "no-store" } });
      }
      await audit(result.kind);
      if (result.kind === "stale") return fail(409, "stale", `The case keeper refused this: ${result.words}`);
      return fail(result.kind === "refused" ? 409 : 502, result.kind, result.words, detailsOf(result));
    }

    // The settlement halves: the observation and the ruling of a committed move. The card's own
    // phase and the operation the catalog resolved must agree, so a card that names one half
    // cannot run the other.
    if (operation !== "horizon.settlement.observe" && operation !== "horizon.settlement.rule") {
      return fail(400, "px", "That decision is not one Horizon knows. Nothing was done.");
    }
    const cut = card.id.lastIndexOf(":");
    const phase = card.id.slice(cut + 1);
    const intentId = card.id.slice("settle:".length, cut);
    const expectedPhase = operation === "horizon.settlement.observe" ? "observe" : "rule";
    if (phase !== expectedPhase) return fail(400, "px", "That decision is not one Horizon knows. Nothing was done.");
    try {
      await settleNavigationIntent(intentId, phase);
    } catch (error) {
      await audit("refused");
      return fail(409, "refused", error instanceof Error ? error.message : String(error));
    }
    await audit(phase === "rule" ? "signed_off" : "observed");
    return Response.json({ ok: true, message: phase === "rule" ? "Signed off. The case keeper ruled on the evidence and the answer is recorded." : "Checked. The record keeper observed the move and sent the evidence on.", receipt: intentId }, { headers: { "cache-control": "no-store" } });
  }

  async function deskWork(params: URLSearchParams): Promise<WorkData> {
    const data = await compareData(params);
    const presenting = await presentingOn(runtime.runtime.store, caller.tenant, caller.actor.id);
    let cases: WorkData["cases"] = { connected: false, words: "Cases are not connected, so running work cannot be shown.", items: [], unreadable: 0 };
    let knowledge: AcceptedKnowledge = { kind: "unknown", why: "Cases are not connected, so no outcome can be counted as accepted." };
    if (caseKeeper !== null) {
      const listed = await listCases(caseKeeper);
      if (listed.kind === "ok") {
        const waitingMap = await waitingToStart(listed.value.cases);
        cases = { connected: true, words: listed.value.cases.length === 0 ? "No cases yet." : `${listed.value.cases.length} ${listed.value.cases.length === 1 ? "case" : "cases"}.`, items: await Promise.all(listed.value.cases.map(async (c) => ({ ...c, title: await titleOf(c), waiting: (waitingMap.get(c.case_id) ?? []) as { plan_item_id: string; name: string }[] }))), unreadable: listed.value.unreadable.length };
        knowledge = listed.value.unreadable.length > 0 ? { kind: "unknown", why: "some cases could not be read, so the count of accepted outcomes cannot be trusted." } : { kind: "known", completed: listed.value.cases.filter((c) => c.case_state === "completed").map((c) => c.case_id) };
      } else {
        const words = listed.kind === "stale" ? REFUSED_OLD : listed.words;
        cases = { connected: false, words, items: [], unreadable: 0 };
        knowledge = { kind: "unknown", why: words };
      }
    }
    const work: WorkData = {
      compare: data.props,
      items: orderWork([...sessionItems(data.props.sessions), ...caseItems(cases.items)]),
      cases,
      cost: costSource(economics.read(), knowledge),
    };
    return presenting ? applyStandIns(work, presentingKey(), data.repoNames) : work;
  }

  /** The desk page holds no secret. A browser pairs with the code the terminal printed at start; the session cookie it gets then goes with every write. */
  const { code: pairingCode, pairing, refuseWithoutTerminal } = createDeskPairing(clock);
  let pairingPrinted = false;
  const DESK_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Horizon desk</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/desk/app.css"></head><body><div id="root"></div><noscript>The desk needs JavaScript to show live updates. Turn it on for this page.</noscript><script type="module" src="/desk/app.js"></script></body></html>`;
  const SETUP_GUIDE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Horizon setup guide</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:46rem;margin:1rem auto;padding:0 1rem}code{overflow-wrap:anywhere}</style></head><body><p><a href="/workspace">Back to the desk</a></p><h1>Setup guide</h1><h2>Start Horizon with the case keeper and record keeper</h2><p>Start the whole set with <code>bun run ignite</code> (see docs/IGNITION.md).</p><h2>Record what agent work costs</h2><ol><li>Install the agent tap with the record keeper: <code>te-agents install --with-realitytrace</code></li><li>Enroll each repository you want measured: <code>te-agents rt enroll &lt;repo&gt;</code></li><li>Point Horizon at the record keeper and the tap's store: set <code>HORIZON_ECONOMICS_REALITYTRACE_BIN</code> (and, if the tap does not use the default location, <code>HORIZON_ECONOMICS_DATA_HOME</code> and <code>HORIZON_ECONOMICS_STATE_HOME</code>), or add an <code>[economics]</code> table with <code>realitytrace_bin</code> to the Horizon config.</li></ol></body></html>`;
  const deskPage = (): Response => new Response(DESK_HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": DESK_CSP, "x-content-type-options": "nosniff" } });
  const DESK_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

  async function deskAsset(name: "app.js" | "app.css"): Promise<Response> {
    const path = joinPath(deskDist, name);
    if (!fileExists(path)) return new Response("The desk has not been built yet. Run: bun run build:desk", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
    return new Response(Bun.file(path), { headers: { "content-type": name === "app.js" ? "text/javascript; charset=utf-8" : "text/css; charset=utf-8", "cache-control": "no-cache", "x-content-type-options": "nosniff" } });
  }

  // ---- Stage 4: panels from agents. The open panels are held here; the person's answers are kept in `horizon-panel-answers`. ----
  // Design v3, step 1: every panel command (put, remove, annotate, withdraw, answer, route, reassign, stop waiting, and the acceptance
  // check) runs through this one FIFO. One command runs at a time, in arrival order. A command that fails does not stop the next.
  let panelTail: Promise<unknown> = Promise.resolve();
  const panelCommand = <T>(command: () => Promise<T>): Promise<T> => {
    const run = panelTail.then(command);
    panelTail = run.catch(() => undefined);
    return run;
  };
  // Design v3 step 2: the board is read from the durable records. A read that fails is kept as words the desk shows instead of the
  // board; it never becomes an empty board, and panel changes are refused. A desk that migrates does not read the board here: it reads
  // it once every migration has run (answersMigrated below), so the board holds the records the migrations moved.
  let panelBoard: PanelsBoard = NO_PANELS;
  let storedPanels: ReadonlyMap<string, Panel> = new Map();
  let boardRefused: string | null = null;
  if (options.readOnly) {
    try {
      const view = await loadBoard(runtime.runtime.store, deskScopeOf(caller.tenant, caller.actor.id));
      panelBoard = view.board;
      storedPanels = view.stored;
    } catch (error) {
      boardRefused = PANEL_LOAD_WORDS;
      console.error("panels: the saved panels could not be read, so panel changes are refused", error instanceof Error ? error.name : "unknown");
    }
  }
  /** Rebuilds the board from the records the store now holds. A record that cannot be read refuses panel changes from here on. */
  async function rebuildBoard(): Promise<void> {
    try {
      const view = await loadBoard(runtime.runtime.store, deskScopeOf(caller.tenant, caller.actor.id));
      panelBoard = view.board;
      storedPanels = view.stored;
    } catch {
      boardRefused = PANEL_LOAD_WORDS;
    }
  }
  /**
   * Commits the change the board made, with the question states it implies and any records that go with it (such as a conversation
   * row), as one commit, then rebuilds the board from them. A failed commit changes nothing and leaves the board as it was.
   */
  async function commitBoard(before: PanelsBoard, after: PanelsBoard, alongside: readonly CommitRecord[] = []): Promise<void> {
    const store = runtime.runtime.store;
    const records = [...(await boardWrites(store, deskScopeOf(caller.tenant, caller.actor.id), before, after)), ...(await stateWrites(store, deskScopeOf(caller.tenant, caller.actor.id), after)), ...alongside];
    if (records.length > 0) await store.commit({ appends: [], records });
    await rebuildBoard();
  }
  // Answers from before the upgrade with no owner are closed once, at start. Panel reads wait for that to finish.
  // The question states are written first (once per record); the pre-upgrade closing reads them.
  // Design v3, step 4 (item 4): the records are migrated under a versioned marker. Until that run finishes, every change is refused with
  // words saying so (503); a run that fails pauses changes for good until the desk restarts with the store fixed.
  let migrationState: "running" | "done" | "failed" = options.readOnly ? "done" : "running";
  // The startup listing of conflicts reads the store. A caller that closes the application first (the `mcp` command does) must not
  // leave that read running against a closed store: close() skips a listing that has not started and waits for one that has.
  let closing = false;
  let conflictsListed: Promise<void> = Promise.resolve();
  const answersMigrated: Promise<void> = options.readOnly ? Promise.resolve() : runDeskMigrations(runtime.runtime.store, deskScopeOf(caller.tenant, caller.actor.id), clock(), panelCommand, DESK_MIGRATIONS, options.migrationHold, soleOperator).then(
    async () => {
      // Every migration has run, so the records are where the desk reads them. The board is read from the store now, with the
      // operator-scope records migration 7 moved. Changes stay refused until that read holds; a read that fails keeps them refused.
      // A desk closed before its migrations finish has closed its store: nothing is served, so the board is not read (and nothing logs).
      if (!closing) {
        try {
          const view = await loadBoard(runtime.runtime.store, deskScopeOf(caller.tenant, caller.actor.id));
          panelBoard = view.board;
          storedPanels = view.stored;
          migrationState = "done";
        } catch (error) {
          migrationState = "failed";
          boardRefused = PANEL_LOAD_WORDS;
          console.error("desk: the saved panels could not be read after the migration, so changes are paused", error instanceof Error ? error.name : "unknown");
        }
      }
      // One line per conflicted question, with ids only: the answers' words are never logged (R2-10).
      if (!options.readOnly && !closing) {
        conflictsListed = (async (): Promise<void> => {
          try {
            for (const line of conflictLogLines((await listConflicts(runtime.runtime.store, deskScopeOf(caller.tenant, caller.actor.id))).map((c) => ({ panel: c.panel_id, ask: c.ask })))) console.error(line);
          } catch (error) {
            // The error's class and message only: the log never carries answer text.
            console.error("desk: the conflicted answers could not be listed", error instanceof Error ? error.name : "unknown", error instanceof Error ? error.message : "");
          }
        })();
        await conflictsListed;
      }
    },
    (error: unknown) => {
      migrationState = "failed";
      // The board was never read after the migrations, so it is shown as words, not as an empty board.
      boardRefused = PANEL_LOAD_WORDS;
      console.error("desk: the saved records could not be migrated, so changes are paused", error instanceof Error ? error.name : "unknown");
    },
  );
  const migrationRefusal = (): Response => Response.json({ ok: false, message: migrationState === "failed" ? MIGRATION_FAILED_WORDS : MIGRATING_WORDS }, { status: 503, headers: { "cache-control": "no-store" } });
  /** The words every panel change gets while the records are not migrated (pending or failed). Null once the desk may change records. */
  const migrationBlock = (): string | null => (migrationState === "done" ? null : migrationState === "failed" ? MIGRATION_FAILED_WORDS : MIGRATING_WORDS);

  /** The question's own words and the open-question test for one panel, from the board. */
  const askOf = (panelId: string, askId: string): { readonly question: string } | null => {
    const q = panelBoard.open.find((p) => p.id === panelId)?.blocks.find((b) => b.kind === "question" && b.id === askId) as { question?: string } | undefined;
    return q === undefined ? null : { question: q.question ?? "" };
  };
  /** Whether a panel on `board` still has a question open for the person. `except` leaves one question out (the one just routed). */
  const stillAskingIn = (board: PanelsBoard, panelId: string, except?: string): boolean => (board.open.find((p) => p.id === panelId)?.blocks ?? []).some((b) => { const q = b as unknown as { kind?: string; id?: string; answered?: unknown; withdrawn?: unknown }; return q.kind === "question" && q.id !== except && q.answered == null && q.withdrawn == null; });
  const stillAsking = (panelId: string): boolean => stillAskingIn(panelBoard, panelId);
  /**
   * The panel's own conversation row as a record for a commit: "Waiting for you" only while a question is open. Null when the panel has no row.
   * It joins the commit that changes the panel, so the row and the change are both there or neither is.
   */
  async function panelRowWrite(board: PanelsBoard, panelId: string, outcome: string, except?: string): Promise<CommitRecord | null> {
    const row = await panelRowOf(runtime.runtime.store, deskWho, panelId);
    if (row === undefined) return null;
    const planned = await planUpdate(runtime.runtime.store, deskWho, row.row_id, stillAskingIn(board, panelId, except) ? { status: "waiting", outcome: "An agent asks you a question." } : { status: "done", outcome });
    return planned === null ? null : planned.record;
  }
  /** A route claim's step lookup, run before the command is queued (R3-10). `resolves` is the step it was run for. */
  type RouteLookup = { readonly resolves: string | null; readonly found: { step_id: string; name: string; case_id: string; case_title: string } | null };
  /** The lookup a route claim needs, or null for any other op. Reads the board and the case keeper only; nothing is written. */
  async function routeLookupFor(op: AgentOp): Promise<RouteLookup | null> {
    if (op.tool !== "answer.route" || typeof op.routed_as !== "string") return null;
    const resolves = (panelBoard.open.find((p) => p.id === op.panel_id)?.blocks.find((b) => b.kind === "question" && b.id === op.ask_id) as { resolves?: string | null } | undefined)?.resolves ?? null;
    return { resolves, found: await findRoutedStep(op.routed_as.trim(), resolves) };
  }
  async function routeLookupForText(text: string): Promise<RouteLookup | null> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return routeLookupFor(parsed as AgentOp);
  }
  /** A keeper lookup that does not answer within the limit counts as not found: the claim is shown as not checked. */
  const ROUTE_LOOKUP_MS = 2_000;
  async function findRoutedStep(said: string, resolves: string | null): Promise<RouteLookup["found"]> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ROUTE_LOOKUP_MS);
    });
    try {
      return await Promise.race([findRoutedStepNow(said, resolves).catch(() => null), late]);
    } finally {
      clearTimeout(timer);
    }
  }
  /**
   * The step a route claim is checked against. The claim is checked only when the agent names the step the question resolves, and that
   * step is waiting in an open case now. Any other step the words name leaves the claim as the agent's word. Null otherwise.
   */
  async function findRoutedStepNow(said: string, resolves: string | null): Promise<{ step_id: string; name: string; case_id: string; case_title: string } | null> {
    if (caseKeeper === null || resolves === null || resolves.length < 4 || !said.split(/[^A-Za-z0-9_.:-]+/).includes(resolves)) return null;
    try {
      const listed = await listCases(caseKeeper);
      if (listed.kind !== "ok") return null;
      for (const c of listed.value.cases.slice(0, 20).filter(isOpenCase)) {
        const horizon = await caseSteps(caseKeeper, c.case_id);
        if (horizon.kind !== "ok") continue;
        const hit = horizon.value.steps.find((st) => st.plan_item_id === resolves && st.execution === "pending");
        if (hit !== undefined) return { step_id: hit.plan_item_id, name: hit.name, case_id: c.case_id, case_title: await titleOf(c) };
      }
    } catch {
      // A case keeper that cannot answer leaves the claim unchecked.
    }
    return null;
  }

  /** The words a withdrawal of an answered or cancelled question gets. Same meaning as the rule's own refusal for that case. */
  const SEALED_WITHDRAW_WORDS = "That question was already answered, so it cannot be withdrawn.";
  /** Whether a question is sealed as answered or cancelled in the store: its guard, a legacy agreement, or a committed answer. Reads only. */
  async function questionSealed(panelId: string, askId: string): Promise<boolean> {
    const store = runtime.runtime.store;
    const scope = deskScopeOf(caller.tenant, caller.actor.id);
    const guard = await store.getRecord(PANEL_ANSWERS_COLLECTION, guardIdOf(scope, panelId, askId));
    if (guard !== null && guard !== undefined && ["answered", "cancelled"].includes(String((guard.value as { readonly outcome?: unknown }).outcome))) return true;
    if ((await store.getRecord(AGREED_COLLECTION, agreedId(scope, panelId, askId))) != null) return true;
    return (await listAnswers(store, scope, panelId)).some((a) => a.ask === askId && (a.outcome === "answered" || a.outcome === "cancelled"));
  }

  /** An agent's tool call (`show_surface`, `ask_human`, `arrange`, `annotate`, `read_responses`, `ask.withdraw`, `answer.route`). To choose parts well an agent reads `GET /desk/panels/catalogue`. A reply on a panel clears the wait on the answers given there. */
  type AgentReply = { readonly ok: true; readonly panel: string | null; readonly responses?: readonly PanelAnswer[] } | { readonly ok: false; readonly code: string; readonly message: string };
  /** The one entry point for an agent's change, from the agent door and from inside the desk. Every caller goes through agentCommandNow. */
  async function applyAgentOp(op: AgentOp & { readonly request_id?: unknown }, agentName?: string, keyId: string = UNKEYED_AGENT): Promise<AgentReply> {
    // The optional step lookup runs before the command is queued (R3-10). The queued command checks the rest again.
    const lookup = await routeLookupFor(op);
    return panelCommand(() => agentCommandNow(op, agentName, keyId, lookup));
  }

  /**
   * The checks every agent change gets, whoever sent it: its types, its request id, and the id's stored receipt. A retry with the same
   * id and the same contents returns the stored response and writes nothing; the same id with other contents is refused. Runs only
   * inside panelCommand (applyAgentOp, or the door, which is queued already).
   */
  async function agentCommandNow(op: AgentOp & { readonly request_id?: unknown }, agentName: string | undefined, keyId: string, lookup: RouteLookup | null = null): Promise<AgentReply> {
    const typing = checkAgentOp(op);
    if (typing !== null) return { ok: false, code: "SCHEMA", message: typing };
    const requestId = (op as { readonly request_id?: unknown }).request_id;
    if (requestId !== undefined && !validRequestId(requestId)) return { ok: false, code: "SCHEMA", message: BAD_REQUEST_ID_WORDS };
    if (typeof requestId !== "string") return applyAgentOpNow(op, agentName, keyId, null, lookup);
    const fingerprint = requestFingerprint(op as unknown as { readonly [key: string]: unknown });
    const seen = await seenRequest(runtime.runtime.store, deskScopeOf(caller.tenant, caller.actor.id), requestId, fingerprint);
    if (seen.kind === "reused") return { ok: false, code: "REUSED", message: REUSED_REQUEST_WORDS };
    if (seen.kind === "replay") return seen.response as unknown as AgentReply;
    return applyAgentOpNow(op, agentName, keyId, { requestId, fingerprint }, lookup);
  }

  /** The body of applyAgentOp. Runs only inside panelCommand. `dedupe` is the request id and fingerprint of a retried call, if it has one. */
  async function applyAgentOpNow(op: AgentOp, agentName: string | undefined, keyId: string, dedupe: { readonly requestId: string; readonly fingerprint: string } | null, lookup: RouteLookup | null = null): Promise<{ readonly ok: true; readonly panel: string | null; readonly responses?: readonly PanelAnswer[] } | { readonly ok: false; readonly code: string; readonly message: string }> {
    await answersMigrated;
    // The request's record, kept with the change it made: a retry with the same id returns this response and writes nothing.
    const agentKeep = (response: { readonly ok: true; readonly panel: string | null; readonly responses?: readonly PanelAnswer[] }): CommitRecord[] => (dedupe === null ? [] : [requestRecord(deskScopeOf(caller.tenant, caller.actor.id), dedupe.requestId, dedupe.fingerprint, JSON.parse(JSON.stringify(response)) as Json)]);
    const who = agentName ?? UNNAMED_AGENT;
    // An agent reads only the answers to the questions it asked itself.
    // Ownership is the key id that put the question up, never the display name: a name is a label any caller can send.
    if (op.tool === "read_responses") return { ok: true, panel: null, responses: (await listAnswers(runtime.runtime.store, deskScopeOf(caller.tenant, caller.actor.id))).filter((a) => !a.replied && a.owner_key === keyId) };
    // Shared with the person's writes: no panel changes while the records are migrating or after a failed migration, whoever calls.
    const paused = migrationBlock();
    if (paused !== null) return { ok: false, code: "UNAVAILABLE", message: paused };
    if (boardRefused !== null) return { ok: false, code: "UNAVAILABLE", message: boardRefused };
    if (op.tool === "ask.withdraw") {
      // A question sealed as answered or cancelled cannot be withdrawn, whether the board shows it as open or not. The seal is read from
      // the store (the question's guard, its agreement, or its committed answer), never from the board, which a republish can show as unanswered.
      if (await questionSealed(op.panel_id, op.ask_id)) return { ok: false, code: "SCHEMA", message: SEALED_WITHDRAW_WORDS };
      // A question still on the board is checked by the rule inside the board's withdraw (reduceAgent). One that is only on record
      // (its panel is closed) is checked here, with the same rule, before the board says it is not open.
      const onBoard = panelBoard.open.find((p) => p.id === op.panel_id)?.blocks.some((b) => b.kind === "question" && b.id === op.ask_id) ?? false;
      const record = onBoard ? undefined : (await listAnswers(runtime.runtime.store, deskScopeOf(caller.tenant, caller.actor.id), op.panel_id)).find((a) => a.ask === op.ask_id);
      if (record !== undefined) {
        const verdict = checkWithdraw({ state: answerState(record), callerKey: keyId, resolvesRequiredStep: false });
        if (!verdict.ok) return { ok: false, code: "SCHEMA", message: verdict.message };
      }
    }
    // A question the person agreed to cannot be recreated with other words, even after its panel was removed or the desk restarted.
    if (await agreedAltered(op)) return { ok: false, code: "SCHEMA", message: ANSWERED_CANNOT_CHANGE };
    const movedStep = await stepAltered(op);
    if (movedStep !== null) return { ok: false, code: "SCHEMA", message: movedStep };
    // Only the agent saying where an answer went closes it; nothing else counts as a reply. The owner, the words and the waiting
    // state are checked by the rule inside planRoute, for this key. Nothing is written until the commit below.
    const routePlan = op.tool === "answer.route" ? await planRoute(runtime.runtime.store, deskScopeOf(caller.tenant, caller.actor.id), op.panel_id, op.ask_id, op.routed_as, keyId) : null;
    if (routePlan !== null && !routePlan.ok) return { ok: false, code: "SCHEMA", message: routePlan.message };
    const question = op.tool === "answer.route" || op.tool === "ask.withdraw" ? askOf(op.panel_id, op.ask_id)?.question ?? null : null;
    // What the question settles, as the board has it now: the only step a route claim may be checked against.
    const resolves = op.tool === "answer.route" ? ((panelBoard.open.find((p) => p.id === op.panel_id)?.blocks.find((b) => b.kind === "question" && b.id === op.ask_id) as { resolves?: string | null } | undefined)?.resolves ?? null) : null;
    // A panel that was closed or evicted comes back with its stored questions, so the put merges with them.
    const target = op.tool === "show_surface" ? op.surface.id : op.tool === "ask_human" ? op.panel : null;
    const base = target === null ? panelBoard : withStored(panelBoard, storedPanels, target);
    const { state, result } = reduceAgent(base, op, who, keyId);
    if (!result.ok) return result;
    const store = runtime.runtime.store;
    // A panel this change would leave unreadable is refused here, so nothing is stored that the load would refuse (and then every change).
    if (result.panel !== null && (op.tool === "show_surface" || op.tool === "ask_human" || op.tool === "annotate" || op.tool === "ask.withdraw")) {
      const changed = state.open.find((p) => p.id === result.panel);
      if (changed !== undefined && !(await readsBack(store, deskScopeOf(caller.tenant, caller.actor.id), changed))) return { ok: false, code: "SCHEMA", message: PANEL_UNREADABLE_WORDS };
    }
    if (op.tool === "answer.route" && routePlan !== null && routePlan.ok) {
      // The agent's words are kept as its claim. A step the case keeper holds is shown as found, but it is not delivery: the row stays
      // claimed, and nothing marks it done without independent evidence that the step was delivered.
      const said = op.routed_as.trim();
      // The lookup ran before the queue for the same step; if the step changed since, the claim is shown as not checked.
      const found = lookup !== null && lookup.resolves === resolves ? lookup.found : null;
      const where = found === null ? `The agent says it took it to: ${said}. Not checked: Horizon found no step with that name.` : `The agent says it took it to: ${said}. Step found: the step "${found.name}" is in the case "${found.case_title}".`;
      // One entry per answer: the one made when you answered is finished in place. The route, the row and the panel's row are one commit.
      // The row keeps the person's words, so it stays the person's row; the agent that made the claim is named by its
      // authenticated key in the row's references, never by a label the request chose (DEF-ASK-ROUTE-EXECUTOR).
      const mine = await answerRowOf(store, deskWho, op.panel_id, op.ask_id);
      const row = await planAppend(store, deskWho, { source: "you", kind: "answer", words: mine?.words ?? (question ? `Your answer to: ${question}` : "Your answer to the agent's question"), outcome: where, status: "claimed", refs: { panel_id: op.panel_id, ask_id: op.ask_id, executor_key: keyId, ...(found === null ? {} : { step_id: found.step_id, case_id: found.case_id }) } }, clock());
      const panelRow = await panelRowWrite(state, op.panel_id, "You answered. The agent says it has taken it on.", op.ask_id);
      try {
        await store.commit({ appends: [], records: [...routePlan.records, row.record, ...(panelRow === null ? [] : [panelRow]), ...agentKeep(result)] });
      } catch {
        return { ok: false, code: "UNAVAILABLE", message: NOTHING_SENT };
      }
      await rebuildBoard();
      return result;
    }
    if (op.tool === "ask.withdraw") {
      // The withdrawal, its question state, the conversation row and the panel's row are one commit.
      const why = `The agent withdrew this question: ${op.reason.trim()}`;
      const mine = await answerRowOf(store, deskWho, op.panel_id, op.ask_id);
      const row = await planAppend(store, deskWho, { source: "you", kind: "answer", words: mine?.words ?? (question ? `The agent's question: ${question}` : "The agent's question"), outcome: why, status: "done", refs: { panel_id: op.panel_id, ask_id: op.ask_id, executor_key: keyId } }, clock());
      const panelRow = await panelRowWrite(state, op.panel_id, why);
      try {
        await commitBoard(panelBoard, state, [row.record, ...(panelRow === null ? [] : [panelRow]), ...agentKeep(result)]);
      } catch {
        return { ok: false, code: "UNAVAILABLE", message: NOTHING_SENT };
      }
      return result;
    }
    // The panel and its conversation row are one commit: both are there or neither is, and a failed row write fails the put.
    const by = agentName === undefined ? {} : { agent_name: agentName };
    try {
      const alongside: CommitRecord[] = [...agentKeep(result)];
      if (result.panel !== null && (op.tool === "show_surface" || op.tool === "ask_human")) {
        const panel = state.open.find((p) => p.id === result.panel);
        const asking = stillAskingIn(state, result.panel);
        alongside.push((await planAppend(store, deskWho, { source: "agent", ...by, kind: "panel", words: panel?.title ?? result.panel, outcome: asking ? "An agent asks you a question." : "An agent put this up.", status: asking ? "waiting" : "done", refs: { panel_id: result.panel, ...(panel?.step ? { step_id: panel.step } : {}) } }, clock())).record);
      }
      await commitBoard(panelBoard, state, alongside);
    } catch {
      return { ok: false, code: "UNAVAILABLE", message: "The desk could not save the panel. Nothing was changed. Try again." };
    }
    return result;
  }

  /** A request body as it was read before the queue: the text, or why it was not read (too large, or not in time). */
  type BodyRead = { readonly kind: "ok"; readonly text: string } | { readonly kind: "large" } | { readonly kind: "late" };
  const BODY_LIMIT_BYTES = 500_000;
  const BODY_READ_MS = 10_000;
  /**
   * Reads a request body outside the command queue (R3-10). A body declared or sent past the limit is not read in full, and a body that
   * does not finish within the time limit is given up (its stream is cancelled), so neither holds the queue or waits forever.
   */
  async function readBodyBounded(request: Request): Promise<BodyRead> {
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > BODY_LIMIT_BYTES) return { kind: "large" };
    const reader = request.body?.getReader();
    if (reader === undefined) return { kind: "ok", text: "" };
    const decoder = new TextDecoder();
    const read = (async (): Promise<BodyRead> => {
      let text = "";
      let total = 0;
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        total += chunk.value.byteLength;
        if (total > BODY_LIMIT_BYTES) {
          await reader.cancel().catch(() => undefined);
          return { kind: "large" };
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
      return { kind: "ok", text: text + decoder.decode() };
    })().catch((): BodyRead => ({ kind: "late" }));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<BodyRead>((resolve) => {
      timer = setTimeout(() => {
        void reader.cancel().catch(() => undefined);
        resolve({ kind: "late" });
      }, BODY_READ_MS);
    });
    try {
      return await Promise.race([read, late]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * The agents' door for panels: `POST /agent/panels` (one AgentOp), `GET /agent/panels/answers`, `GET /agent/panels/catalogue`.
   * It needs `Authorization: Bearer <an agent key>`. The setup's agent.key is the default agent; every other agent has its own key in the
   * registry (agents.json, hashes only; `scripts/agent-key.ts add <name>` makes one). The key decides the owner of each question the
   * agent puts up. The page-agent header is not a key and is refused here. Only agent tools pass; the person's operations never do.
   */
  const AGENT_TOOLS = ["show_surface", "ask_human", "arrange", "annotate", "read_responses", "ask.withdraw", "answer.route"] as const;
  async function agentDoor(request: Request, pathname: string): Promise<Response> {
    // The request body is read before the command is queued, with a size and a time limit, so a slow client never holds the queue (R3-10).
    const read = pathname === "/agent/panels" && request.method === "POST" ? await readBodyBounded(request) : null;
    // A route claim's keeper lookup also runs here, for a key that is valid now. The queued command checks the key again.
    const bearer = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
    const lookup = read !== null && read.kind === "ok" && ownerOfKey(bearer, loaded.agentKey, loaded.agentRegistryPath) !== null ? await routeLookupForText(read.text) : null;
    // Authentication runs inside the queued command, so the key is checked when the command runs, not when it was queued.
    return panelCommand(() => agentDoorNow(request, pathname, read, lookup));
  }

  async function agentDoorNow(request: Request, pathname: string, read: BodyRead | null, lookup: RouteLookup | null): Promise<Response> {
    const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
    const refuse = (status: number, message: string): Response => Response.json({ ok: false, message }, { status, headers });
    const given = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
    const owner = ownerOfKey(given, loaded.agentKey, loaded.agentRegistryPath);
    if (owner === null) return refuse(401, "This door needs an agent key. Send it as: Authorization: Bearer <key>. The setup's default key is in the secrets folder, in agent.key; other agents' keys are shown once, when they are added.");
    if (pageAgentOf(request) !== null) return refuse(403, "An agent on the page cannot use this door.");
    const name = cleanAgentName(request.headers.get("x-horizon-agent-name"));
    if (pathname === "/agent/panels/catalogue" && request.method === "GET") return Response.json({ schema: SURFACE_SCHEMA, vocabulary: vocabulary(), blocks: CATALOGUE }, { headers });
    if (pathname === "/agent/panels/answers" && request.method === "GET") {
      const done = await applyAgentOpNow({ tool: "read_responses" }, name, owner.key_id, null);
      return Response.json({ ok: true, responses: done.ok ? done.responses ?? [] : [] }, { headers });
    }
    if (pathname !== "/agent/panels" || request.method !== "POST") return refuse(404, "There is nothing at this address. Use POST /agent/panels, GET /agent/panels/answers or GET /agent/panels/catalogue.");
    if (read === null || read.kind === "large") return refuse(413, "That is too large. Send a smaller panel.");
    if (read.kind === "late") return refuse(408, "The request body did not arrive in time. Nothing was changed.");
    let body: unknown;
    try {
      body = JSON.parse(read.text);
    } catch {
      return refuse(400, "That could not be read as JSON. Nothing was changed.");
    }
    const op = body as Record<string, unknown> | null;
    if (op === null || typeof op !== "object" || Array.isArray(op)) return refuse(400, "Send one object with a \"tool\" field. Nothing was changed.");
    // The door takes no identity from the body: the key in the Authorization header is the caller.
    // A body that names an executor, a role or an actor is refused, not quietly ignored
    // (DEF-ASK-ROUTE-EXECUTOR: the executor is the authenticated key, never a label in the request).
    for (const field of ACTOR_NAMING_FIELDS) {
      if (field in op) return refuse(400, `This door does not take an actor from the body (${field}). The agent key in the Authorization header is who you are. Nothing was changed.`);
    }
    // The refused prefixes are the route's own: the catalog says which field carries the semantic
    // action, and the refusal is checked against that field. A refusal read from another field
    // would let a reserved operation through under a different name (R2-10).
    const agentDoorRoute = "POST /agent/panels";
    let actionField: string;
    let refusedPrefixes: readonly string[];
    try {
      const catalog = identityCatalogOf();
      actionField = actionFieldFor(catalog, agentDoorRoute) ?? "tool";
      refusedPrefixes = refusedPrefixesFor(catalog, agentDoorRoute);
    } catch {
      return refuse(503, "The identity catalog could not be loaded, so nothing was changed.");
    }
    const action = op[actionField];
    if (typeof action === "string" && refusedPrefixes.some((prefix) => action.startsWith(prefix))) return refuse(403, "Only the person can do that. An agent cannot answer, pin, close or open a panel for them.");
    if (typeof op.tool !== "string" || !(AGENT_TOOLS as readonly string[]).includes(op.tool)) return refuse(400, `Say which tool: ${AGENT_TOOLS.join(", ")}. Nothing was changed.`);
    // The catalog says which operation the named action performs, and whether the runtime refuses
    // it at this freeze. The answer comes from the catalog, not from a list kept beside it, so a
    // row the catalog refuses is a row this door refuses (R5-01, R5-02): asking a person to route
    // an answer, and withdrawing one that was asked, both need a grant and a pending record the
    // agent key alone does not carry.
    let dispatched: string | null;
    try {
      dispatched = resolveDispatchedOperation(identityCatalogOf(), agentDoorRoute, typeof action === "string" ? action : op.tool);
    } catch {
      return refuse(503, "The identity catalog could not be loaded, so nothing was changed.");
    }
    if (dispatched !== null) {
      const gate = await frozenGate(runtime.runtime.store, caller.tenant, dispatched, { route: agentDoorRoute }, owner.key_id);
      if (gate.state === "unavailable") return refuse(503, gate.message);
      if (gate.state === "refused") return Response.json({ ok: false, outcome: "refused", code: "refused", message: refusalWords(gate.refusal) }, { status: 403, headers });
    }
    // Every change an agent makes carries its id (R2-11). Reading the answers changes nothing and needs none. The id's checks, its stored
    // receipt and the change itself are one path, agentCommandNow, which the desk's own callers use too.
    const requestId = op.request_id;
    if (op.tool !== "read_responses" && typeof requestId !== "string") return refuse(400, REQUEST_ID_REQUIRED_WORDS);
    const done = await agentCommandNow(op as unknown as AgentOp, name, owner.key_id, lookup);
    const status = done.ok ? 200 : done.code === "NOT_FOUND" ? 404 : done.code === "REUSED" || done.code === "DECISION" ? 409 : done.code === "UNAVAILABLE" ? 503 : 400;
    return Response.json(done, { status, headers });
  }

  /**
   * Whether a put would move a question to another step than the one its stored answers bear on (finding R3-5). The answers are read
   * from the durable record, so a panel that is gone still counts. An answer whose step is unknown (not a string) is preserved as unknown
   * and does not block the put; nothing here writes the submitted step into an answer. Returns the refusal words, or null.
   */
  async function stepAltered(op: AgentOp): Promise<string | null> {
    const store = runtime.runtime.store;
    const incoming: { readonly panel: string; readonly ask: string; readonly step: string | null | undefined }[] = [];
    // An omitted step means the panel's step. When the panel is not known (neither open nor stored), that step is unknown, so it is
    // not compared: undefined is left out of the check below.
    const panelStepNow = (panel: string): string | null | undefined => {
      const known = panelBoard.open.find((p) => p.id === panel) ?? storedPanels.get(panel);
      return known === undefined ? undefined : (known.step ?? null);
    };
    if (op.tool === "ask_human") {
      const raw = op.ask as Record<string, unknown>;
      if (typeof raw.id === "string") incoming.push({ panel: op.panel, ask: raw.id, step: op.step === undefined ? panelStepNow(op.panel) : (op.step ?? null) });
    } else if (op.tool === "show_surface") {
      const surface = op.surface as unknown as { id?: unknown; step?: unknown; blocks?: unknown };
      if (typeof surface.id === "string" && Array.isArray(surface.blocks)) {
        const step = surface.step === undefined ? panelStepNow(surface.id) : (typeof surface.step === "string" ? surface.step : null);
        for (const item of surface.blocks.slice(0, 64).map((b, i) => itemOf(b, i))) if (item.kind === "question") incoming.push({ panel: surface.id, ask: item.id, step });
      }
    }
    for (const { panel, ask, step } of incoming) {
      for (const a of (await listAnswers(store, deskScopeOf(caller.tenant, caller.actor.id), panel)).filter((x) => x.ask === ask)) {
        if (step === undefined || typeof a.step !== "string" || a.step === step) continue;
        return `That question was answered for the step "${a.step}", so it cannot be put up for ${step === null ? "no step" : `the step "${step}"`}. Use a new question id. Nothing was changed.`;
      }
    }
    return null;
  }

  /** Whether a put would change a question the person agreed to, judged against the durable record (not the panel, which may be gone). */
  async function agreedAltered(op: AgentOp): Promise<boolean> {
    const store = runtime.runtime.store;
    const incoming: { readonly panel: string; readonly question: AgreedQuestion }[] = [];
    if (op.tool === "ask_human") {
      const raw = op.ask as Record<string, unknown>;
      const block = typeof raw.id === "string" ? questionOf(raw, raw.id) : null;
      if (block !== null) incoming.push({ panel: op.panel, question: block });
    } else if (op.tool === "show_surface") {
      const surface = op.surface as unknown as { id?: unknown; blocks?: unknown };
      if (typeof surface.id === "string" && Array.isArray(surface.blocks)) {
        for (const item of surface.blocks.slice(0, 64).map((b, i) => itemOf(b, i))) if (item.kind === "question") incoming.push({ panel: surface.id, question: item });
      }
    }
    for (const { panel, question } of incoming) {
      // A question an answer or cancel sealed keeps its first wording. Its own fingerprint decides when it has one. Without one (written
      // before fingerprints) the wording is unknown, so only the agreement store, read here, can say the new words are the same.
      const sealed = (await listAnswers(store, deskScopeOf(caller.tenant, caller.actor.id), panel)).filter((a) => a.ask === question.id && (a.outcome === "answered" || a.outcome === "cancelled"));
      if (sealed.some((a) => a.fingerprint != null)) {
        if (sealed.some((a) => a.fingerprint != null && a.fingerprint !== questionFingerprint(question))) return true;
        continue;
      }
      const agreed = await agreedFingerprintOf(store, deskScopeOf(caller.tenant, caller.actor.id), panel, question.id);
      if (agreed !== null && agreed !== agreedFingerprint(panel, question)) return true;
      // A sealed question whose wording is unknown is refused unless the agreement store says the words are the same.
      if (sealed.length > 0 && agreed !== agreedFingerprint(panel, question)) return true;
    }
    return false;
  }

  /** The person's operations on panels: answer, pin, close, open, and stop waiting for an agent's reply. */
  async function deskPanelOp(request: Request): Promise<Response> {
    // The body is read before the command is queued, with a size and a time limit (R3-10).
    const read = await readBodyBounded(request);
    return panelCommand(() => deskPanelOpNow(request, read));
  }

  /** The body of deskPanelOp. Runs only inside panelCommand. */
  async function deskPanelOpNow(request: Request, read: BodyRead): Promise<Response> {
    const headers = { "cache-control": "no-store" };
    const fail = (status: number, message: string): Response => Response.json({ ok: false, message }, { status, headers });
    if (read.kind === "large") return fail(413, "That is too large. Nothing was changed.");
    if (read.kind === "late") return fail(408, "The request body did not arrive in time. Nothing was changed.");
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(read.text);
    } catch {
      parsed = null;
    }
    const body = parsed as Record<string, unknown> | null;
    if (body === null || typeof body !== "object" || typeof body.op !== "string") return fail(400, "That could not be read. Nothing was changed.");
    const store = runtime.runtime.store;
    await answersMigrated;
    // Revalidated when the command runs, not when it was queued: a session that ended while it waited (logout) refuses it.
    if (!pairing.paired(request.headers.get("cookie"))) return notPairedRefusal();
    // Shared with the agent's writes: a person's change is refused while the records are migrating or after a failed migration.
    const paused = migrationBlock();
    if (paused !== null) return fail(503, paused);
    // What the catalog says the runtime does with the operation this command names. Every person
    // operation on this route runs at this freeze; the gate is here so that a row the catalog
    // starts refusing is refused here too, rather than settling nothing and answering as if it had
    // (R5-01). A route that cannot read the catalog answers 503, never a default.
    let panelOperation: string | null;
    try {
      panelOperation = resolveDispatchedOperation(identityCatalogOf(), "POST /desk/panels/op", body.op);
    } catch (error) {
      return fail(503, `The identity catalog could not be loaded, so nothing was changed (${error instanceof Error ? error.message : String(error)}).`);
    }
    if (panelOperation !== null) {
      const gate = await frozenGate(store, caller.tenant, panelOperation, { route: "POST /desk/panels/op" }, caller.actor.id);
      if (gate.state === "unavailable") return fail(503, gate.message);
      if (gate.state === "refused") return fail(403, refusalWords(gate.refusal));
    }
    // Design v3, section 2: every person operation takes a request id. The same id with the same body returns the response it got and
    // writes nothing, so a retry never repeats a change (a retry after a new wait exists does not close it). The same id with other
    // contents is refused. The id's record joins the operation's commit, so the change and its record are stored together or not at all.
    const requestId = body.request_id;
    if (requestId !== undefined && !validRequestId(requestId)) return fail(400, BAD_REQUEST_ID_WORDS);
    // Every person change carries its id, so a retry of one command can be told from a new command (R2-11).
    if (typeof requestId !== "string") return fail(400, REQUEST_ID_REQUIRED_WORDS);
    const fingerprint = requestFingerprint(body);
    if (typeof requestId === "string") {
      const seen = await seenRequest(store, deskScopeOf(caller.tenant, caller.actor.id), requestId, fingerprint);
      if (seen.kind === "reused") return fail(409, REUSED_REQUEST_WORDS);
      if (seen.kind === "replay") return Response.json(seen.response, { headers });
    }
    // Stage 0B: a person's reserved (P2) change runs only after an exact local confirmation on the
    // terminal. Low-risk collaboration (P1) is not gated. The request id is not part of the operation,
    // so a new attempt at the same change matches the descriptor it was confirmed under.
    if (panelOperation !== null && classify(identityCatalogOf(), panelOperation).class === "P2") {
      const { request_id: _requestId, ...operationParams } = body;
      const waiting = await confirmationGate(store, { tenant: caller.tenant, operator: caller.actor.id, operationId: panelOperation, params: operationParams, now: clock() }, confirmationTerminal());
      if (!waiting.ok) return awaitingDeskConfirmation(waiting);
    }
    const requestKeep = (response: { readonly ok: true; readonly message: string }): CommitRecord[] => (typeof requestId === "string" ? [requestRecord(deskScopeOf(caller.tenant, caller.actor.id), requestId, fingerprint, response)] : []);
    if (body.op === "human.stop_waiting") {
      if (typeof body.step !== "string" || body.step === "") return fail(400, "Say which step to stop waiting for.");
      // The answers' stop, their conversation rows and the request's record are one commit: all are there or none is.
      const plan = await planStopWaiting(store, deskScopeOf(caller.tenant, caller.actor.id), body.step, deskWho, clock());
      const response = plan.count === 0 ? { ok: true as const, message: "Nothing was waiting." } : { ok: true as const, message: "Stopped waiting. The step can be accepted now." };
      const records = [...plan.records, ...requestKeep(response)];
      if (records.length > 0) {
        try {
          await store.commit({ appends: [], records });
        } catch {
          return fail(500, NOTHING_SENT);
        }
        await rebuildBoard();
      }
      return Response.json(response, { headers });
    }
    if (boardRefused !== null) return fail(503, boardRefused);
    if (body.op === "human.reassign_owner") {
      // The person moves a waiting question to another registered agent. Paired only (the route is paired), a recent pairing, a
      // registered target, and an explicit second confirm that echoes the owner the person saw.
      if (typeof body.panel !== "string" || typeof body.ask !== "string" || (typeof body.from_key_id !== "string" && body.from_key_id !== null) || typeof body.to_key_id !== "string") return fail(400, "That change could not be read. Nothing was changed.");
      let registry: ReturnType<typeof readRegistry>;
      try {
        registry = readRegistry(loaded.agentRegistryPath);
      } catch {
        return fail(500, "The agent list could not be read. Nothing was changed.");
      }
      const toEntry = body.to_key_id === DEFAULT_AGENT_KEY_ID ? { key_id: DEFAULT_AGENT_KEY_ID, name: DEFAULT_AGENT_NAME } : registry.find((e) => e.key_id === body.to_key_id);
      // A null previous owner is an answer that has no owner recorded (a legacy answer from before the upgrade). It names no agent.
      const fromName = body.from_key_id === null ? "no one" : body.from_key_id === DEFAULT_AGENT_KEY_ID ? DEFAULT_AGENT_NAME :registry.find((e) => e.key_id === body.from_key_id)?.name ?? "an agent no longer listed";
      // Design v3, step 4 (item 6): a question nobody has answered yet moves the same way. Its owner is the panel block's asked_by_key,
      // and the move and its conversation row are one commit. A question with a waiting answer moves its answers (below).
      // A closed panel is still a durable panel: its own record holds the question, so its owner moves with the answers (R2-4).
      const hiddenPanel = !panelBoard.open.some((p) => p.id === body.panel);
      const openQuestion = (panelBoard.open.find((p) => p.id === body.panel) ?? storedPanels.get(body.panel))?.blocks.find((b) => b.kind === "question" && b.id === body.ask) as { readonly question?: string; readonly answered?: unknown; readonly withdrawn?: unknown; readonly asked_by_key?: string | null; readonly owner_key?: string | null } | undefined;
      const waitingAnswers = (await listAnswers(store, deskScopeOf(caller.tenant, caller.actor.id), body.panel)).filter((a) => a.ask === body.ask && waitsForAgent(a));
      if (openQuestion !== undefined && openQuestion.answered == null && openQuestion.withdrawn == null && waitingAnswers.length === 0) {
        const toName = toEntry?.name ?? "";
        const ownerNow = openQuestion.owner_key ?? openQuestion.asked_by_key ?? null;
        if (ownerNow !== body.from_key_id) return fail(409, "The owner changed while you were looking. Look again, then try. Nothing was changed.");
        const verdict = checkReassign({ state: { owner_key: ownerNow, fingerprint: null, outcome: null, replied: true, waiting_on: "none", history: [], routed_as: null, version: null }, paired: true, pairedAgeMs: pairing.pairedAgeMs(request.headers.get("cookie")) ?? Number.POSITIVE_INFINITY, newOwnerKey: body.to_key_id, targetRegistered: toEntry !== undefined, confirmed: body.confirmed === true });
        if (!verdict.ok) return fail(409, verdict.message);
        const when = clock().toISOString();
        const moveRow = newRowRecord(deskWho, { source: "you", kind: "note", words: `Moved the question "${openQuestion.question ?? "the agent's question"}" from ${fromName} to ${toName}.`, outcome: `${toName} now answers for it, since ${when}. Nothing has been answered yet.`, status: "done", refs: { panel_id: body.panel, ask_id: body.ask } }, clock());
        const movedOpen = moveQuestion(panelBoard, body.panel, body.ask, body.to_key_id, toName);
        const hiddenMove = hiddenPanel ? await movedStoredQuestion(store, deskScopeOf(caller.tenant, caller.actor.id), body.panel, body.ask, body.to_key_id, toName) : null;
        const response = { ok: true as const, message: `Moved to ${toName}. The question waits for them to answer.` };
        try {
          await commitBoard(panelBoard, movedOpen, [moveRow, ...(hiddenMove === null ? [] : [hiddenMove]), ...requestKeep(response)]);
        } catch {
          return fail(500, NOTHING_SENT);
        }
        return Response.json(response, { headers });
      }
      const planned = await planReassign(store, { tenant: deskScopeOf(caller.tenant, caller.actor.id), panel_id: body.panel, ask: body.ask, question: askOf(body.panel, body.ask)?.question ?? "the agent's question", from_key: body.from_key_id, to_key: body.to_key_id, from_name: fromName, to_name: toEntry?.name ?? "", paired: true, pairedAgeMs: pairing.pairedAgeMs(request.headers.get("cookie")), targetRegistered: toEntry !== undefined, confirmed: body.confirmed === true, who: deskWho, now: clock() });
      if (!planned.ok) return fail(planned.message.startsWith("Nothing was sent") ? 500 : 409, planned.message);
      // The owner on the answers, the owner on the panel and the conversation row are one commit. The panel follows the stored
      // owner, so a route by the old key is refused from now on.
      const toName = toEntry?.name ?? "";
      const moved = moveQuestion(panelBoard, body.panel, body.ask, body.to_key_id, toName);
      const hiddenMove = hiddenPanel ? await movedStoredQuestion(store, deskScopeOf(caller.tenant, caller.actor.id), body.panel, body.ask, body.to_key_id, toName) : null;
      const response = { ok: true as const, message: `Moved to ${toName}. Its answer waits for them to say where it went.` };
      try {
        await commitBoard(panelBoard, moved, [...planned.records, ...(hiddenMove === null ? [] : [hiddenMove]), ...requestKeep(response)]);
      } catch {
        return fail(500, NOTHING_SENT);
      }
      return Response.json(response, { headers });
    }
    if (body.op === "human.answer") {
      const outcome = body.outcome;
      const value = checkValue(body.value);
      if (typeof body.panel !== "string" || typeof body.ask !== "string" || !(OUTCOMES as readonly unknown[]).includes(outcome) || !value.ok) return fail(400, "That answer could not be read. Nothing was sent.");
      if (outcome === "answered" && (value.value === null || value.value === "")) return fail(400, "Pick an answer first, or choose Not now.");
      // Every answer, deferral and cancellation says which question version and owner revision it was given under.
      if (typeof body.version !== "string" || !/^[0-9a-f]{14}$/.test(body.version) || typeof body.owner_rev !== "number" || !Number.isInteger(body.owner_rev) || body.owner_rev < 0) return fail(400, ANSWER_NEEDS_REVISION);
      const note = typeof body.note === "string" && body.note.trim() !== "" ? body.note.trim().slice(0, 600) : null;
      const before = panelBoard;
      // The answer settles the step the question is about (its target), which is the panel's step for a question stored before targets.
      const askBefore = before.open.find((p) => p.id === body.panel)?.blocks.find((b): b is AskBlock => b.kind === "question" && b.id === body.ask);
      const step = askBefore !== undefined && askBefore.target !== undefined ? askBefore.target : (before.open.find((p) => p.id === body.panel)?.step ?? null);
      const { state, result } = reduceHuman(before, { op: "human.answer", panel: body.panel, ask: body.ask, outcome: outcome as "answered", value: value.value, note, version: body.version, owner_rev: body.owner_rev });
      if (!result.ok) return fail(409, result.message);
      // Store what the question accepted (a text answer is trimmed), not the raw body.
      const askBlock = before.open.find((p) => p.id === body.panel)?.blocks.find((b) => b.kind === "question" && b.id === body.ask) as { id: string; question: string; resolves?: string | null; version?: string; asked_by?: string | null; asked_by_key?: string | null; owner_key?: string | null; input?: "select" | "confirm" | "multiselect" | "text"; options: readonly { option_id: string; label: string; consequence?: string | null }[] } | undefined;
      const checked = outcome === "answered" && askBlock !== undefined ? answerFor({ input: askBlock.input ?? "select", options: askBlock.options }, value.value) : null;
      if (checked !== null && !checked.ok) return fail(400, checked.message);
      const stored = checked !== null && checked.ok ? checked.value : value.value;
      // Design v3: the answer, its question state, the panel's presentation and the conversation row are one commit. Either all are
      // stored or none is, and a failed commit says so in plain words.
      const sentWords = outcome === "answered" ? "Sent. Waiting for the agent to say where it went." : outcome === "deferred" ? "Put off. Waiting for the agent to say where it went." : "Cancelled. Waiting for the agent to say where it went.";
      // "Not yet" is not an answer: nothing is sent to the agent, and the row says so.
      const deferredOnly = outcome === "deferred";
      const panelId: string = body.panel;
      const askId: string = body.ask;
      const answerResponse = { ok: true as const, message: sentWords };
      try {
        // The answer carries the question's fingerprint, so the same question cannot come back with other words (see agreedAltered).
        await recordAnswer(store, { tenant: deskScopeOf(caller.tenant, caller.actor.id), panel_id: panelId, ask: askId, outcome: outcome as "answered", value: stored, note, step, version: askBlock?.version ?? null, asked_by: askBlock?.asked_by ?? null, asked_by_key: askBlock?.asked_by_key ?? null, owner_key: askBlock?.owner_key ?? askBlock?.asked_by_key ?? null, fingerprint: askBlock === undefined ? null : questionFingerprint(askBlock), now: clock(), alsoRecords: async () => {
          const row = await planAppend(store, deskWho, { source: "you", kind: "answer", words: answerEcho({ ...(askBlock?.input === undefined ? {} : { input: askBlock.input }), options: askBlock?.options ?? [] }, outcome as "answered", stored), outcome: deferredOnly ? "Not yet. Nothing was sent to the agent." : WAITING_FOR_AGENT, status: deferredOnly ? "done" : "waiting", refs: { panel_id: panelId, ask_id: askId, ...(step ? { step_id: step } : {}) } }, clock());
          const panelRow = await panelRowWrite(state, panelId, deferredOnly ? "Not yet. You can answer it later." : "You answered. Waiting for the agent to say where it went.");
          return [...(await boardWrites(store, deskScopeOf(caller.tenant, caller.actor.id), before, state, { panel: panelId, ask: askId })), row.record, ...(panelRow === null ? [] : [panelRow]), ...requestKeep(answerResponse)];
        } });
      } catch (error) {
        if (error instanceof QuestionAlreadyAnswered) return fail(409, error.message);
        return fail(500, NOTHING_SENT);
      }
      await rebuildBoard();
      return Response.json(answerResponse, { headers });
    }
    const op: HumanOp | null =
      body.op === "human.pin" && typeof body.id === "string" && typeof body.pinned === "boolean" ? { op: "human.pin", id: body.id, pinned: body.pinned }
      : body.op === "human.close" && typeof body.id === "string" ? { op: "human.close", id: body.id }
      : body.op === "human.open" && typeof body.template === "string" ? { op: "human.open", template: body.template, ...(typeof body.title === "string" ? { title: body.title } : {}) }
      : null;
    if (op === null) return fail(400, "That is not something a panel can do. Nothing was changed.");
    // An opened panel comes back with its stored questions when it had been opened before.
    const base = op.op === "human.open" ? withStored(panelBoard, storedPanels, openPanelId(op.template)) : panelBoard;
    const { state, result } = reduceHuman(base, op);
    if (!result.ok) return fail(409, result.message);
    const response = { ok: true as const, message: "Done." };
    try {
      await commitBoard(panelBoard, state, requestKeep(response));
    } catch {
      return fail(500, "The desk could not save the panel. Nothing was changed. Try again.");
    }
    return Response.json(response, { headers });
  }

  async function panelsData(): Promise<PanelsData> {
    await answersMigrated;
    if (boardRefused !== null) {
      // The board is not shown as empty: the words say why it is missing.
      const unread = new Map<string, string>();
      for (const a of await listAnswers(runtime.runtime.store, deskScopeOf(caller.tenant, caller.actor.id))) if (waitsForAgent(a) && a.step !== null && !unread.has(a.step)) unread.set(a.step, a.panel_id);
      return { open: [], max: panelBoard.max, waiting: [...unread].map(([step, panel]) => ({ step, panel })), refused: boardRefused };
    }
    const waiting = new Map<string, string>();
    const allAnswers = await listAnswers(runtime.runtime.store, deskScopeOf(caller.tenant, caller.actor.id));
    for (const a of allAnswers) if (waitsForAgent(a) && a.step !== null && !waiting.has(a.step)) waiting.set(a.step, a.panel_id);
    // A question whose stored answers disagree is listed until the person decides (R2-10). Its step is the one its answers bear on.
    const conflicts = (await listConflicts(runtime.runtime.store, deskScopeOf(caller.tenant, caller.actor.id))).map((c) => ({ panel: c.panel_id, ask: c.ask, question: askOf(c.panel_id, c.ask)?.question ?? null, step: allAnswers.find((a) => a.panel_id === c.panel_id && a.ask === c.ask && a.step !== null)?.step ?? null }));
    return { ...panelBoard, waiting: [...waiting].map(([step, panel]) => ({ step, panel })), conflicts };
  }

  /** Starts the waiting steps of a case (`case_advance`). The id names one attempt; a refusal moves it on, a timeout keeps it. */
  async function startCase(caseId: string, base: string): Promise<{ readonly ok: boolean; readonly words: string }> {
    if (caseKeeper === null) return { ok: false, words: "Cases are not connected." };
    const store = runtime.runtime.store;
    const id = await requestIdFor(store, caller.tenant, base);
    const result = await caseAdvance(caseKeeper, caseId, id);
    if (result.kind === "ok") return { ok: true, words: "Started." };
    if (result.kind === "stale" || result.kind === "refused") await attemptRefused(store, caller.tenant, base, id);
    return { ok: false, words: result.kind === "stale" ? REFUSED_OLD : result.words };
  }

  /** Steps that were added but have not started, per open case. They are listed under Work as "Waiting to start". */
  async function waitingToStart(cases: readonly CaseLine[]): Promise<Map<string, { plan_item_id: string; name: string }[]>> {
    const out = new Map<string, { plan_item_id: string; name: string }[]>();
    if (caseKeeper === null) return out;
    for (const c of cases.filter(isOpenCase).slice(0, 20)) {
      const horizon = await caseSteps(caseKeeper, c.case_id);
      if (horizon.kind !== "ok") continue;
      const pending = horizon.value.steps.filter((st) => st.execution === "pending").map((st) => ({ plan_item_id: st.plan_item_id, name: st.name }));
      if (pending.length > 0) out.set(c.case_id, pending);
    }
    return out;
  }

  async function deskStart(request: Request): Promise<Response> {
    const headers = { "cache-control": "no-store" };
    // The catalog refuses this row at this freeze: the dispatcher's targets are not resolved, so
    // the route cannot know the class or the authority of what it starts. Nothing is started and
    // the refusal is recorded (R5-02).
    const gate = await frozenGate(runtime.runtime.store, caller.tenant, "run.start", { route: "POST /desk/start" }, caller.actor.id);
    if (gate.state === "unavailable") return Response.json({ ok: false, message: gate.message }, { status: 503, headers });
    if (gate.state === "refused") return Response.json({ ok: false, outcome: "refused", code: "refused", message: refusalWords(gate.refusal) }, { status: 403, headers });
    // The start is bound to what the person previewed: the steps listed as waiting, sent back as `also_starts`. A different set is refused.
    const body = (await request.json().catch(() => null)) as { case_id?: unknown; also_starts?: unknown } | null;
    if (caseKeeper === null) return Response.json({ ok: false, message: "Cases are not connected, so nothing can be started." }, { status: 503, headers });
    const caseId = typeof body?.case_id === "string" ? body.case_id.replace(/^case:/, "") : "";
    const listed = await listCases(caseKeeper);
    if (listed.kind !== "ok") return Response.json({ ok: false, message: listed.kind === "stale" ? REFUSED_OLD : listed.words }, { status: 502, headers });
    const target = listed.value.cases.find((c) => c.case_id === caseId && isOpenCase(c));
    if (target === undefined) return Response.json({ ok: false, message: "That case is not running, so nothing can be started." }, { status: 409, headers });
    const waiting = (await waitingToStart([target])).get(caseId) ?? [];
    if (waiting.length === 0) return Response.json({ ok: false, message: "Nothing is waiting to start in that case." }, { status: 409, headers });
    const previewed = Array.isArray(body?.also_starts) && body.also_starts.every((id) => typeof id === "string") ? (body.also_starts as string[]) : null;
    if (previewed === null) return Response.json({ ok: false, message: "Look at the steps waiting to start, then start them." }, { status: 400, headers });
    if (!sameSet(previewed, waiting.map((w) => w.plan_item_id))) return Response.json({ ok: false, message: "The case changed after you looked. Look again, then start." }, { status: 409, headers });
    // The id names this set of waiting steps: a later, different set is a different request.
    const digest = createHash("sha256").update(waiting.map((w) => w.plan_item_id).sort().join("\n")).digest("hex").slice(0, 12);
    const result = await startCase(caseId, `advance:start:${caseId}:${digest}`);
    keeperCaseCache = null;
    return Response.json(result.ok ? { ok: true, message: "Started. The waiting steps are under way." } : { ok: false, message: `It did not start: ${result.words}` }, { status: result.ok ? 200 : 502, headers });
  }

  /** Step names for the cases an agent may see, from the case keeper. Names only. */
  async function agentSteps(cases: readonly DeskCase[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (caseKeeper === null) return out;
    for (const c of cases.filter((x) => x.source === "case keeper").slice(0, 10)) {
      try {
        const horizon = await caseSteps(caseKeeper, c.case_ref.replace(/^case:/, ""));
        if (horizon.kind === "ok") out.set(c.case_ref, horizon.value.steps.map((st) => st.name));
      } catch {
        // No step names for this case.
      }
    }
    return out;
  }

  /** What an agent reads goes out with stand-ins too, while Presenting is on. */
  async function agentJson(body: unknown, headers: Record<string, string>): Promise<Response> {
    return presentedJson(body, headers);
  }

  /** A hand off answer that shows case and step names: while Presenting is on, repository names in it get their stand-ins. */
  async function presentedJson(body: unknown, headers: Record<string, string>): Promise<Response> {
    const on = await presentingOn(runtime.runtime.store, caller.tenant, caller.actor.id);
    return Response.json(on ? applyStandIns(body, presentingKey(), deskRepoNames()) : body, { headers });
  }

  /** What came of each stage of a hand off that was sent. A stage that was not tried is not shown; the result is "Not seen yet" until it is observed. */
  function handoffStages(body: Record<string, any> | null): RowStage[] {
    const stages: RowStage[] = [{ name: "Sent", status: "done", words: "The step was added to the case." }];
    const started = body?.started as { ok?: boolean; words?: string } | undefined;
    if (started !== undefined) stages.push(started.ok === true ? { name: "Started", status: "done", words: "The step is under way." } : { name: "Started", status: "refused", words: `It did not start: ${started.words ?? "No reason was given."}`, recovery: "Try again" });
    const assigned = body?.assigned as { done?: boolean; words?: string } | null | undefined;
    if (assigned !== null && assigned !== undefined) stages.push(assigned.done === true ? { name: "Given to an agent", status: "done", words: "An agent has the step." } : { name: "Given to an agent", status: "refused", words: `No agent has it: ${assigned.words ?? "No reason was given."}`, recovery: "Open the step" });
    stages.push({ name: "Result seen", status: "unseen", words: "Not seen yet." });
    return stages;
  }

  /** The "Result seen" stage turns to done only when the case keeper shows the step finished. Nothing is stored for it. */
  async function observeResults(rows: ConversationRow[]): Promise<ConversationRow[]> {
    if (caseKeeper === null) return rows;
    const wanted = rows.filter((r) => r.stages?.some((g) => g.name === "Result seen" && g.status === "unseen") && r.refs.case_id !== undefined && r.refs.step_id !== undefined);
    const finished = new Set<string>();
    for (const caseId of [...new Set(wanted.map((r) => r.refs.case_id!))].slice(0, 20)) {
      try {
        const horizon = await caseSteps(caseKeeper, caseId);
        if (horizon.kind === "ok") for (const st of horizon.value.steps) if (st.execution === "completed") finished.add(`${caseId}/${st.plan_item_id}`);
      } catch {
        // Not seen stays not seen.
      }
    }
    return rows.map((r) => (r.refs.case_id !== undefined && r.refs.step_id !== undefined && finished.has(`${r.refs.case_id}/${r.refs.step_id}`) && r.stages !== undefined
      ? { ...r, stages: r.stages.map((g) => (g.name === "Result seen" ? { ...g, status: "done" as const, words: "The step finished." } : g)) }
      : r));
  }

  /** Hand off (stage 4): `POST /desk/handoff/preview` shows the step that would be added; `POST /desk/handoff` adds it. */
  async function deskHandoff(request: Request, phase: "preview" | "send", page: PageAgent | null = null): Promise<Response> {
    let sent: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(await request.clone().text());
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) sent = parsed as Record<string, unknown>;
    } catch {
      // The core answers an unreadable request in words.
    }
    const words = typeof sent.text === "string" ? sent.text.trim() : "";
    const draftId = typeof sent.draft_id === "string" ? sent.draft_id : "";
    const source: RowSource = page ? "page-agent" : "you";
    const named = page?.name === undefined ? {} : { agent_name: page.name };
    const response = await deskHandoffCore(request, phase, true);
    // An agent may leave at most 20 suggestions waiting on one case; asking again about the same draft changes the same row.
    if (page && phase === "preview" && response.ok) {
      const made = (await response.clone().json().catch(() => null)) as Record<string, any> | null;
      const caseOf = made?.preview?.case_id;
      if (typeof caseOf === "string") {
        const rows = await listConversation(runtime.runtime.store, deskWho);
        const same = rows.some((r) => r.kind === "handoff-proposal" && r.status === "waiting" && r.refs.draft_id === draftId);
        const waiting = rows.filter((r) => r.kind === "handoff-proposal" && r.status === "waiting" && r.refs.case_id === caseOf).length;
        if (!same && waiting >= MAX_WAITING_PROPOSALS) return Response.json({ ok: false, outcome: "too_many_waiting", message: TOO_MANY_PROPOSALS }, { status: 409, headers: { "cache-control": "no-store" } });
      }
    }
    // The answer goes out with stand-ins when Presenting is on; the row keeps the real words and shows them the same way.
    const body = (await response.clone().json().catch(() => null)) as Record<string, any> | null;
    const outcomeWords = typeof body?.message === "string" ? body.message : "That did not work.";
    let recorded = true;
    if (phase === "preview") {
      if (response.ok && body?.preview) recorded = await logRow({ source, ...named, kind: page ? "handoff-proposal" : "handoff", words, outcome: page ? "An agent suggests this. Nothing is sent until you confirm." : "Preview ready. Nothing is sent until you confirm.", status: "waiting", refs: { case_id: String(body.preview.case_id), step_id: String(body.preview.step_id), draft_id: draftId } });
      else if (!page && words !== "" && response.status !== 400) await logRow({ source, kind: "handoff", words, outcome: outcomeWords, status: "refused", refs: { draft_id: draftId } });
    } else if (words !== "" && draftId !== "" && !(response.status === 400)) {
      const ok = response.ok;
      const stages = ok ? handoffStages(body) : undefined;
      const status = !ok ? "refused" : stages?.some((g) => g.status === "refused") ? "partial" : "done";
      try {
        await settleDraftRow(runtime.runtime.store, deskWho, draftId, status, outcomeWords, { source: "you", kind: "handoff", words, outcome: outcomeWords, status, refs: { ...(ok && typeof body?.step_id === "string" ? { step_id: body.step_id } : {}), ...(ok && typeof body?.case_id === "string" ? { case_id: body.case_id } : {}) } }, clock(), stages);
      } catch {
        // The hand off already happened; the answer says the row is missing instead of failing.
        recorded = false;
      }
    }
    return response.ok && body !== null ? presentedJson(recorded ? body : { ...body, recorded: false, recorded_words: NOT_RECORDED_WORDS }, { "cache-control": "no-store" }) : response;
  }

  async function deskHandoffCore(request: Request, phase: "preview" | "send", raw = false): Promise<Response> {
    const headers = { "cache-control": "no-store" };
    const out = (body: unknown, h: Record<string, string>): Promise<Response> | Response => (raw ? Response.json(body, { headers: h }) : presentedJson(body, h));
    const fail = (status: number, outcome: string, message: string, details: string | null = null): Response => Response.json({ ok: false, outcome, message, ...(details === null ? {} : { details }) }, { status, headers });
    if (caseKeeper === null) return fail(503, "unreachable", "Cases are not connected, so work cannot be handed off.");
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(await request.text());
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
      body = parsed as Record<string, unknown>;
    } catch {
      return fail(400, "unreadable", "That hand off could not be read. Nothing was sent.");
    }
    const draftId = body.draft_id;
    const text = typeof body.text === "string" ? body.text : "";
    if (!validDraftId(draftId)) return fail(400, "unreadable", "That hand off has no draft number. Nothing was sent.");
    if (stepNameOf(text) === "") return fail(400, "empty", "Type what you want done first.");
    if (text.length > DRAFT_TEXT_MAX) return fail(400, "too_long", `That is too long for one step (limit ${DRAFT_TEXT_MAX} characters). Split it into smaller steps.`);
    const store = runtime.runtime.store;
    // The case to add to: the one named, else the newest case that is still running.
    const listed = await listCases(caseKeeper);
    if (listed.kind !== "ok") return fail(502, listed.kind, listed.kind === "stale" ? REFUSED_OLD : listed.words, detailsOf(listed));
    const open = listed.value.cases.filter(isOpenCase).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const wanted = typeof body.case_id === "string" && body.case_id !== "" ? body.case_id.replace(/^case:/, "") : (open[0]?.case_id ?? "");
    const target = open.find((c) => c.case_id === wanted);
    if (target === undefined) return fail(409, "no_case", wanted === "" ? "There is no running case to add a step to. Start a case first." : "That case is not running, so a step cannot be added to it.");
    const caseTitleNow = await titleOf(target);
    // Run a review: the new step is marked as a review, and it points at a finished step whose agent work it checks.
    const reviewAsked = typeof body.review === "object" && body.review !== null && !Array.isArray(body.review);
    const reviewStepId = reviewAsked && typeof (body.review as { step_id?: unknown }).step_id === "string" ? ((body.review as { step_id: string }).step_id) : "";
    let reviewable: { step_id: string; name: string }[] = [];
    if (reviewAsked) {
      const horizon = await caseSteps(caseKeeper, target.case_id);
      if (horizon.kind !== "ok") return fail(horizon.kind === "refused" || horizon.kind === "stale" ? 409 : 502, horizon.kind, horizon.kind === "stale" ? REFUSED_OLD : horizon.words, detailsOf(horizon));
      reviewable = horizon.value.steps.filter((st) => st.execution === "completed").map((st) => ({ step_id: st.plan_item_id, name: st.name }));
      if (reviewStepId === "" && phase === "send") return fail(400, "no_review_target", "Choose which finished work to review first. Nothing was sent.");
      if (reviewStepId !== "" && !reviewable.some((st) => st.step_id === reviewStepId)) return fail(409, "not_finished", "That step has no finished work to review. Nothing was sent.");
    }
    const item = handoffItem(draftId, text, reviewAsked);
    const agent = deskAgent();
    // The case keeper can only start a whole case, so sending starts every step that is waiting in it, not just this one.
    const waitingNow = await caseSteps(caseKeeper, target.case_id);
    if (waitingNow.kind !== "ok") return fail(waitingNow.kind === "refused" || waitingNow.kind === "stale" ? 409 : 502, waitingNow.kind, waitingNow.kind === "stale" ? REFUSED_OLD : waitingNow.words, detailsOf(waitingNow));
    const alsoStarts = waitingNow.value.steps.filter((st) => st.execution === "pending" && st.plan_item_id !== item.plan_item_id).map((st) => ({ step_id: st.plan_item_id, name: st.name }));
    if (phase === "send" && Array.isArray(body.also_starts) && !sameSet(body.also_starts, alsoStarts.map((st) => st.step_id))) {
      return fail(409, "preview_out_of_date", "Preview out of date. The steps waiting to start in this case changed after you looked at it. Nothing was sent. Look at the new preview and decide again.");
    }
    if (phase === "preview") {
      await saveDraft(store, caller.tenant, caller.actor.id, { draftId, text, mode: "handoff" });
      const dry = await addItem(caseKeeper, { case_id: target.case_id, item, dry_run: true });
      if (dry.kind !== "ok") return fail(dry.kind === "refused" ? 409 : dry.kind === "stale" ? 409 : 502, dry.kind, dry.kind === "stale" ? REFUSED_OLD : dry.words, detailsOf(dry));
      if (dry.value.plan_precondition === null) return fail(502, "unreadable", "The case keeper did not give a version code for this case, so the hand off cannot be tied to what you see. Try again in a moment.");
      return out({ ok: true, preview: { draft_id: draftId, case_id: target.case_id, case_title: caseTitleNow, step_name: item.name, step_id: dry.value.plan_item_id, check: "The case keeper checked this step against the case and it fits.", plan_precondition: dry.value.plan_precondition, also_starts: alsoStarts, agent, review: reviewAsked ? { reviewable } : null } }, headers);
    }
    const pre = body.plan_precondition;
    if (typeof pre !== "object" || pre === null || typeof (pre as { ref?: unknown }).ref !== "string" || typeof (pre as { expected_digest?: unknown }).expected_digest !== "string") {
      return fail(400, "unreadable", "This hand off did not carry the version you looked at, so it was not sent. Nothing was done.");
    }
    const wantsAgent = body.assign === true;
    if (wantsAgent && !agent.offered) return fail(409, "not_connected", `${agent.words} Nothing was sent.`);
    // The catalog refuses this row at this freeze: sending a hand off adds a step to a case and
    // starts it, and the row has no pending record, no protected confirmation and no authority for
    // either. The checks above refuse what a person could not have meant; this gate refuses the
    // effect itself, after them and before anything is added, and records the refusal (R5-01).
    {
      const gate = await frozenGate(store, caller.tenant, "handoff.send", { route: "POST /desk/handoff" }, caller.actor.id);
      if (gate.state === "unavailable") return fail(503, "unavailable", gate.message);
      if (gate.state === "refused") return fail(403, "refused", refusalWords(gate.refusal));
    }
    const sentId = await requestIdFor(store, caller.tenant, handoffRequestId(draftId));
    const sent = await addItem(caseKeeper, {
      case_id: target.case_id,
      item,
      request_id: sentId,
      dry_run: false,
      preconditions: { records: [{ ref: (pre as { ref: string }).ref, expected_digest: (pre as { expected_digest: string }).expected_digest }] },
    });
    // A refusal is remembered by the case keeper under this id, so the next try gets a new one. A timeout keeps the id.
    if (sent.kind === "stale" || sent.kind === "refused") await attemptRefused(store, caller.tenant, handoffRequestId(draftId), sentId);
    if (sent.kind === "stale") return fail(409, "preview_out_of_date", "Preview out of date. This case changed after you looked at it. Nothing was sent. Look at the new preview and decide again.");
    if (sent.kind !== "ok") return fail(sent.kind === "refused" ? 409 : 502, sent.kind, sent.words, detailsOf(sent));
    // A step that was added stays waiting until the case is advanced. If starting fails, the step is still there.
    const started = await startCase(target.case_id, `advance:${sentId}`);
    let assigned: { readonly done: boolean; readonly words: string } | null = null;
    if (wantsAgent) {
      const access = options.workshop?.() ?? workshopAccess(loaded.config.workshop, caller, clock());
      const result = await assignToAgent(access, { caseId: target.case_id, stepId: sent.value.plan_item_id, expertId: loaded.config.workshop?.expert_id ?? "", workspaceId: loaded.config.workshop?.workspace_id ?? "", message: text, ...(reviewAsked ? { reviews: assignmentId(target.case_id, reviewStepId) } : {}) });
      assigned = result.kind === "ok" ? { done: true, words: "Given to an agent." } : { done: false, words: result.words };
    }
    const next = await nextDraft(store, caller.tenant, caller.actor.id, draftId);
    return out({ ok: true, message: `Handed off: "${item.name}" is now a step in "${caseTitleNow}".${started.ok ? " It has started." : ` It has not started yet: ${started.words} Use Start it under Work.`}${assigned === null ? "" : assigned.done ? " It was given to an agent." : ` It was not given to an agent: ${assigned.words}`}`, step_id: sent.value.plan_item_id, case_id: target.case_id, started, assigned, draft_id: next.draftId }, headers);
  }

  /** Whether a step can be given to an agent right now, in words. Nothing is offered that would fail silently. */
  function deskAgent(): { readonly offered: boolean; readonly words: string } {
    const access = options.workshop?.() ?? workshopAccess(loaded.config.workshop, caller, clock());
    if (access.kind !== "ready") return { offered: false, words: access.words.replace(/^Agent work is not connected: /, "Agent work: Not connected. ") };
    if (options.workshop === undefined && (!loaded.config.workshop?.expert_id || !loaded.config.workshop?.workspace_id)) return { offered: false, words: "Agent work: Not connected. No agent is chosen for handed-off steps yet." };
    return { offered: true, words: "An agent can take this step." };
  }

  /** One conversation row. Never fails the move it describes: a row that could not be kept is only missing from the record. */
  async function logRow(input: Parameters<typeof appendRow>[2]): Promise<boolean> {
    try {
      await appendRow(runtime.runtime.store, deskWho, input, clock());
      return true;
    } catch (error) {
      // The operation itself is already done or refused; the record is a read model. A failed
      // write is logged by its kind only, so the gap is visible to whoever runs the desk.
      console.error(`conversation: a row could not be recorded (${error instanceof Error ? error.name : "unknown error"})`);
      return false;
    }
  }

  /** When the move was done but its row was not kept, the answer says so (`recorded: false`) in plain words, for the status line. */
  async function withRecorded(response: Response, recorded: boolean): Promise<Response> {
    if (recorded || !response.ok) return response;
    const body = (await response.clone().json().catch(() => null)) as Record<string, unknown> | null;
    if (body === null) return response;
    return Response.json({ ...body, recorded: false, recorded_words: NOT_RECORDED_WORDS }, { status: response.status, headers: { "cache-control": "no-store" } });
  }

  /** Pairing: a typed code that matches gives this browser a session cookie. Only the code is checked here; see desk/pairing.ts. */
  async function pairDesk(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
    const outcome = pairing.pair(typeof body?.code === "string" ? body.code : "");
    if (!outcome.ok) return Response.json({ ok: false, paired: false, message: outcome.words }, { status: outcome.status, headers: { "cache-control": "no-store" } });
    return Response.json({ ok: true, paired: true }, { headers: { "cache-control": "no-store", "set-cookie": outcome.cookie } });
  }

  async function deskSaveNote(request: Request): Promise<Response> {
    const text = await request.text();
    if (text.length > 1_000_000) return Response.json({ ok: false, message: "That note is too large to save. Split it into smaller notes." }, { status: 413 });
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return Response.json({ ok: false, message: "That note could not be read. Try typing it again." }, { status: 400 });
    }
    try {
      const note = await saveNote(runtime.runtime.store, { ...deskWho, input: body, now: clock(), timeZone: deskTimeZone });
      const recorded = await logRow({ source: "you", kind: "note", words: note.body, outcome: `Saved to ${note.day}.`, status: "done", refs: note.case_ref ? { case_id: note.case_ref } : {} });
      return Response.json({ ok: true, note, ...(recorded ? {} : { recorded: false, recorded_words: NOT_RECORDED_WORDS }) }, { headers: { "cache-control": "no-store" } });
    } catch (error) {
      if (error instanceof NoteRefused) await logRow({ source: "you", kind: "note", words: typeof (body as { body?: unknown } | null)?.body === "string" ? (body as { body: string }).body : "", outcome: error.message, status: "refused" });
      if (error instanceof NoteRefused) return Response.json({ ok: false, message: error.message }, { status: 400 });
      if (error instanceof Error && /conflict|expectedVersion|version/i.test(error.name + error.message)) return Response.json({ ok: false, message: "Another change to this note was saved at the same moment. Reload and try again." }, { status: 409 });
      return Response.json({ ok: false, message: "The note was not saved. Nothing was changed. Try again." }, { status: 500 });
    }
  }

  const remote = new RemoteController(remoteSettings(), {
    store: runtime.runtime.store,
    tenant: caller.tenant,
    identity,
    identityTenant,
    operator: mappedActors.desktopOperator,
    // The P3 authority for device enrolment. Production wires none, so enrolment is refused (see UNAVAILABLE_P3_AUTHORITY).
    enrollment: new EnrollmentAuthority(runtime.runtime.store, undefined, options.remoteP3Authority),
    workspace: () => workspace(),
    chrome: (receipt) => cockpitChrome({ receipt: receipt ?? null }),
    position: () => lastPosition(runtime),
    // The phone's credential is a device credential: it proves which enrolled device is at the
    // route and never which person is holding it. The catalog's dispatch table resolves the
    // kind to a device-credential row, and the row's class comes back with it so the remote can
    // refuse a governed row rather than downgrading it (R3-01, R4-02).
    resolveCommand: (kind, phase) => {
      const catalog = identityCatalogOf();
      const operation = resolveDispatchedOperation(catalog, "POST /m/api/command", kind, phase);
      if (operation === null) return null;
      const row = catalog.byId.get(operation);
      // The phone's body is closed: the dispatch envelope plus the fields the resolved row's own
      // schema names. The schema is the contract's, so the phone cannot carry a field the
      // operation does not have (R4-07).
      const fields = row?.paramsSchema === null || row?.paramsSchema === undefined
        ? []
        : schemaFieldNames(row.paramsSchema);
      // The catalog's own refusal, not a second list kept here: the row the contract refuses is
      // the row the phone's command refuses (R5-01).
      const refusal = frozenRefusal(catalog, operation, { route: "POST /m/api/command", codeOp: kind });
      return { operation, class: row?.class ?? "PX", fields, refusal };
    },
    commitAction: (actionId, intentId, who) => commitForSession(actionId, intentId, who),
    // The device acts; the operator its enrolment belongs to is recorded beside it as
    // attribution. The two are never collapsed into one field (R5-03).
    openCase: async (purpose, who, attribution) => {
      await openCase(runtime.runtime.store, { tenant: caller.tenant, operator: who.actor.id, attributed_operator: attribution.operator, purpose, now: new Date() });
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
    applyAgentOp,
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
    confirmPending: (pendingId: string, io: ConfirmIO) => runConfirm(runtime.runtime.store, pendingId, io, clock()),
    startServer(port = loaded.config.port): HttpServer {
      const route = async (request: Request): Promise<Response> => {
          const url = new URL(request.url);
          // Every request checks Host (DNS rebinding: the remote panel's GET carries the pairing link);
          // state-changing routes also check Origin and Sec-Fetch-Site (cross-site POSTs).
          const refused = crossSiteRefusal(request, server.port ?? port, request.method !== "POST");
          if (refused !== null) return refused;
          // Reads are served while records are migrated; a change is refused until the migration has finished. Pairing writes no
          // record, so a browser can still pair and read the words that say why the board is not shown.
          if (!READ_METHODS.has(request.method) && migrationState !== "done" && url.pathname !== "/desk/pair") return migrationRefusal();
          if (url.pathname.startsWith("/agent/panels")) return agentDoor(request, url.pathname);
          // Every read needs the pairing session, except the page itself, its session check and the static client bundle that pairs.
          // The page-agent header is a label, never a grant: an unpaired caller is refused whatever the header says.
          const paired = pairing.paired(request.headers.get("cookie"));
          if (READ_METHODS.has(request.method) && !OPEN_READS.has(url.pathname) && !paired) return notPairedRead();
          // An agent on the page may read, find, inspect and preview a hand off. Every other write is the person's alone.
          const page = pageAgentOf(request);
          if (page !== null) {
            const blocked = pageAgentRefusal(request.method, url.pathname);
            if (blocked !== null) return blocked;
          }
          // Central rule: every route that is not a read needs a paired session cookie. /agent/panels returned above and keeps
          // its own key; /desk/pair is how a browser gets the cookie. Adding a route cannot skip this check.
          if (!READ_METHODS.has(request.method) && url.pathname !== "/desk/pair" && !paired) return notPairedRefusal();
          if (url.pathname === "/desk/session" && request.method === "GET") return Response.json({ paired }, { headers: { "cache-control": "no-store" } });
          if (url.pathname === "/desk/pair" && request.method === "POST") return pairDesk(request);
          if (url.pathname === "/desk/pair/logout" && request.method === "POST") {
            pairing.end(request.headers.get("cookie"));
            return Response.json({ ok: true, paired: false }, { headers: { "cache-control": "no-store", "set-cookie": clearedSessionCookie() } });
          }
          if (url.pathname === "/health" && request.method === "GET") {
            // The liveness probe is public and says one thing: the process is up. It answers the
            // same to a paired caller as to an unpaired one, so it never becomes a second way in
            // to the deployment profile, the operator reference, the semantic world, the research
            // state or the transports (R3-10).
            try {
              await runtime.runtime.service.invoke(caller, { capability: "horizon.semantics.world", input: {} });
              return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
            } catch {
              return Response.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
            }
          }
          if (url.pathname === "/diagnostics" && request.method === "GET") {
            // The diagnostics read is a separate operation from the probe: it is paired, it writes
            // nothing, and it is the only route that reports the deployment in detail.
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
          if (url.pathname === "/frame" && request.method === "GET") {
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
              if (!(error instanceof AwaitingAuthorityError)) {
                if (error instanceof IntentError) {
                  return Response.json({ code: error.code, message: error.message }, { status: error.code === "already_exists" ? 409 : error.code === "failed_precondition" ? 412 : 400 });
                }
                throw error;
              }
              // Accepted for a decision, not committed: the operator answers it at SEA-Forge.
              return Response.json({ code: error.code, intent_id: error.intent.intent_id, approval_id: error.approvalId, run_id: error.runId }, { status: 202 });
            }
          }
          if (url.pathname === "/surface" && request.method === "GET") {
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
          if (url.pathname === "/surface/schema" && request.method === "GET") {
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
            // The role comes from the signed-in session, never from the body. A request that names
            // its own actor is refused outright rather than quietly ignored (DEF-ROLE-FROM-REQUEST).
            for (const field of ACTOR_NAMING_FIELDS) {
              if (field in record) {
                return Response.json({ code: "forbidden_field", message: `SURFACE: a request cannot name its own role (${field}); the role comes from the signed-in session` }, { status: 400 });
              }
            }
            // The body has a closed vocabulary: a field the operation's schema does not name is
            // refused rather than ignored, so no caller believes an unnamed field was read.
            const extra = unknownField(record, schemaFieldNames("params.horizon_surface_intent_commit"));
            if (extra !== null) {
              return Response.json({ code: "unknown_field", message: `SURFACE: this request does not take ${extra}` }, { status: 400 });
            }
            const transport = record.transport === "gui" || record.transport === "cli" || record.transport === "mcp" ? record.transport : "mcp";
            const outcome = await commitSurfaceIntent({
              transport,
              operation: record.operation,
              node_id: record.node_id,
              frame_id: record.frame_id,
            }, "human");
            return outcome.ok
              ? Response.json({ ok: true, intent: outcome.bound, committed: outcome.result })
              : Response.json({ ok: false, code: outcome.code, message: outcome.message }, { status: 409 });
          }
          if (url.pathname === "/desk" && request.method === "GET") return deskPage();
          if (url.pathname === "/desk/app.js" && request.method === "GET") return deskAsset("app.js");
          if (url.pathname === "/desk/app.css" && request.method === "GET") return deskAsset("app.css");
          if (url.pathname === "/desk/state.json" && request.method === "GET") {
            const state = await deskState(url.searchParams);
            const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
            // An agent on the page reads a summary only: titles, step names, open items, counts and its own suggestions.
            if (page !== null) return agentJson(agentStateOf(state, await listConversation(runtime.runtime.store, deskWho), await agentSteps(state.cases)), headers);
            if (url.searchParams.get("since") === state.rev) return Response.json({ unchanged: true, rev: state.rev }, { headers });
            return Response.json(state, { headers });
          }
          if (url.pathname === "/desk/search" && request.method === "GET") {
            // Read-only. Find as you type is not a move, and a GET never records one.
            const found = await deskSearch(url.searchParams, page !== null);
            if (page !== null) return agentJson(agentSearchOf(found), { "cache-control": "no-store", "x-content-type-options": "nosniff" });
            return Response.json(found, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
          }
          if (url.pathname === "/desk/search" && request.method === "POST") {
            // The Find action. It is recorded in the conversation only when the body asks for it (`record`), so a find is a move only when the person makes one.
            const noStore = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
            const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
            if (body === null || typeof body !== "object" || Array.isArray(body)) return Response.json({ ok: false, message: "That find could not be read." }, { status: 400, headers: noStore });
            const params = new URLSearchParams();
            for (const key of ["q", "day", "tag"]) if (typeof body[key] === "string") params.set(key, body[key] as string);
            const asked = (params.get("q") ?? "").trim();
            // The closed catalog names two actions for this route and nothing else: a read that
            // records nothing, and a recorded find. Any other `record` value is Px, and it is
            // refused before the search runs, so an unlisted action can never execute a read.
            const action = deskSearchAction(body.record, asked);
            if (action === null) return Response.json({ ok: false, code: "unknown_action", message: "That find asked for something this desk does not do. Nothing was searched and nothing was recorded." }, { status: 400, headers: noStore });
            const found = await deskSearch(params, page !== null);
            if (action === "true_with_non_empty_q") {
              await logRow({ source: "you", kind: "find", words: `Find: ${asked}`, outcome: `${found.notes.length} notes, ${found.cases.length} cases, ${found.days.length} days, ${found.tags.length} tags.`, status: "done" });
            }
            return Response.json(found, { headers: noStore });
          }
          if (url.pathname === "/desk/conversation" && request.method === "GET") {
            if (page !== null) return agentJson({ rows: agentRowsOf(await listConversation(runtime.runtime.store, deskWho)), withheld: WITHHELD_WORDS }, { "cache-control": "no-store", "x-content-type-options": "nosniff" });
            return presentedJson({ rows: await observeResults(await listConversation(runtime.runtime.store, deskWho)) }, { "cache-control": "no-store", "x-content-type-options": "nosniff" });
          }
          if (url.pathname === "/desk/conversation/discard" && request.method === "POST") {
            const asked = (await request.json().catch(() => null)) as { row_id?: unknown } | null;
            if (asked === null || typeof asked.row_id !== "string" || asked.row_id === "") return Response.json({ ok: false, message: "Say which suggestion to discard." }, { status: 400, headers: { "cache-control": "no-store" } });
            const discarded = await discardRow(runtime.runtime.store, deskWho, asked.row_id);
            return discarded.ok ? presentedJson({ ok: true, row: discarded.row }, { "cache-control": "no-store" }) : Response.json({ ok: false, message: discarded.message }, { status: discarded.status, headers: { "cache-control": "no-store" } });
          }
          if (url.pathname === "/desk/note" && request.method === "POST") return deskSaveNote(request);
          if (url.pathname === "/desk/draft" && request.method === "GET") {
            return Response.json({ ...(await currentDraft(runtime.runtime.store, caller.tenant, caller.actor.id)), agent: deskAgent() }, { headers: { "cache-control": "no-store" } });
          }
          if (url.pathname === "/desk/draft" && request.method === "POST") {
            const parsed = (await request.json().catch(() => null)) as { draft_id?: unknown; text?: unknown; mode?: unknown } | null;
            if (parsed === null || !validDraftId(parsed.draft_id) || typeof parsed.text !== "string") return Response.json({ ok: false, message: "That draft could not be read." }, { status: 400 });
            const kept = await saveDraft(runtime.runtime.store, caller.tenant, caller.actor.id, { draftId: parsed.draft_id, text: parsed.text, mode: parsed.mode === "handoff" ? "handoff" : "write" });
            return Response.json({ ok: kept }, { status: kept ? 200 : 409, headers: { "cache-control": "no-store" } });
          }
          if (url.pathname === "/desk/start" && request.method === "POST") return deskStart(request);
          if (url.pathname === "/desk/panels/op" && request.method === "POST") return deskPanelOp(request);
          // The parts catalogue, in plain words, for agents choosing how to build a panel. Read-only, so an agent on the page may call it.
          if (url.pathname === "/desk/panels/catalogue" && request.method === "GET") return Response.json({ schema: SURFACE_SCHEMA, vocabulary: vocabulary(), blocks: CATALOGUE }, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
          if (url.pathname === "/desk/handoff/preview" && request.method === "POST") return deskHandoff(request, "preview", page);
          if (url.pathname === "/desk/handoff" && request.method === "POST") return deskHandoff(request, "send");
          if ((url.pathname === "/workspace" || url.pathname === "/workspace/approvals") && request.method === "GET") {
            // The desk is the workspace: the page is a shell, and the browser bundle draws every view from /desk/*.json.
            return deskPage();
          }
          if (url.pathname === "/desk/decide.json" && request.method === "GET") {
            const state = await decideState(await recentMoves());
            const shown = (await presentingOn(runtime.runtime.store, caller.tenant, caller.actor.id)) ? applyStandIns(state, presentingKey(), deskRepoNames()) : state;
            return Response.json(shown, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
          }
          if (url.pathname === "/desk/decide" && request.method === "POST") return deskDecide(request);
          if (url.pathname === "/desk/lesson" && request.method === "POST") return deskProposeLesson(request);
          if (url.pathname === "/desk/lessons.json" && request.method === "GET") return Response.json({ lessons: await listLessons(runtime.runtime.store, caller.tenant) }, { headers: { "cache-control": "no-store" } });
          if (url.pathname === "/desk/work.json" && request.method === "GET") {
            return Response.json(await deskWork(url.searchParams), { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
          }
          if (url.pathname === "/desk/setup-guide" && request.method === "GET") {
            // The one page that may name programs, files and settings: the runbook behind the desk's Settings.
            return new Response(SETUP_GUIDE_HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" } });
          }
          if (url.pathname === "/desk/next.json" && request.method === "GET") {
            // The frame-based "next decision": read-only. It builds a frame, so the desk asks only when Decide is open.
            const data = await workspace({});
            const snap = data.snapshot;
            return Response.json({ state: snap.state, state_message: snap.state_message, focus: snap.frame.focus_ref, choices: snap.choices, blocked: snap.blocked }, { headers: { "cache-control": "no-store" } });
          }
          if (url.pathname === "/desk/first-move.json" && request.method === "GET") {
            // The one move the first-run path offers. Computed only when asked for, because it builds a frame.
            const data = await workspace({});
            const submittable = data.snapshot.actions.filter((action) => action.submit);
            const action = submittable.find((candidate) => candidate.operation === "horizon.health") ?? submittable[0] ?? null;
            return Response.json(
              action === null
                ? { firstMove: null }
                : { firstMove: { action_id: action.action_id, operation: action.operation, frame_id: data.frame.frame_id, frame_revision: String(data.frame.revision), focus: data.frame.focus_ref, label: action.label } },
              { headers: { "cache-control": "no-store" } },
            );
          }
          if (url.pathname === "/desk/remote.json" && request.method === "GET") {
            await remote.checkReachable();
            const link = remote.pairingLink();
            return Response.json({ status: await remote.status(), link, qr: link === null ? null : qrSvg(link) }, { headers: { "cache-control": "no-store" } });
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
            if ((request.headers.get("accept") ?? "").includes("application/json")) {
              return Response.json({ schema: ECONOMICS_SCHEMA, ...economics.read() }, { headers: { "cache-control": "no-store" } });
            }
            return deskPage();
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
            // Stage 0B: a label is a reserved human write. It runs only after an exact local confirmation.
            const labelParams = { session: String(form.get("session") ?? ""), event: String(form.get("event") ?? ""), record_seq: String(form.get("record_seq") ?? ""), verdict: String(form.get("verdict") ?? ""), first_failure: String(form.get("first_failure") ?? "") };
            const labelWaiting = await confirmationGate(runtime.runtime.store, { tenant: caller.tenant, operator: caller.actor.id, operationId: "workspace.label", params: labelParams, now: clock() }, confirmationTerminal());
            if (!labelWaiting.ok) return awaitingLocalConfirmation(request, labelWaiting, back ? `/workspace/compare?${back}` : "/workspace/compare");
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
              if ((request.headers.get("accept") ?? "").includes("application/json")) return Response.json({ ok: false, code, message: `The label was not saved: ${code}.` }, { status: 400 });
              return Response.redirect(`/workspace/compare?${back}${back ? "&" : ""}label_error=${encodeURIComponent(code)}`, 303);
            }
            if ((request.headers.get("accept") ?? "").includes("application/json")) return Response.json({ ok: true });
            return Response.redirect(`/workspace/compare?${back}`, 303);
          }
          if (url.pathname === "/workspace/presenting" && request.method === "POST") {
            const form = await request.formData().catch(() => null);
            if (form === null) return Response.json({ code: "invalid_argument", message: "PRESENTING: body is not a form" }, { status: 400 });
            await setPresenting(runtime.runtime.store, { tenant: caller.tenant, operator: caller.actor.id, on: form.get("on") === "1" });
            return Response.redirect(`/workspace/compare?${safeReturn(form.get("return"))}`, 303);
          }
          if (url.pathname === "/workspace/export" && request.method === "POST") {
            // The catalog refuses the export at this freeze: writing a labelled copy of the record
            // is a P3 effect, and the row has no pending record, no A3-UV confirmation, no
            // authority decision and no separation-of-duty check. Nothing is written and the
            // refusal is recorded (R5-01).
            const gate = await frozenGate(runtime.runtime.store, caller.tenant, "workspace.export", { route: "POST /workspace/export" }, caller.actor.id);
            if (gate.state === "unavailable") return Response.json({ code: "unavailable", message: gate.message }, { status: 503 });
            if (gate.state === "refused") return Response.json({ code: "refused", message: refusalWords(gate.refusal) }, { status: 403 });
            // The export writes a file, so it is a POST from a form the person pressed, with the session. A GET is never served.
            const form = await request.formData().catch(() => null);
            if (form === null) return Response.json({ code: "invalid_argument", message: "EXPORT: body is not a form" }, { status: 400 });
            const fields = new URLSearchParams();
            for (const [key, value] of form.entries()) if (typeof value === "string") fields.set(key, value);
            const kind = fields.get("kind");
            if (kind !== "labels" && kind !== "comparison") return Response.json({ code: "invalid_argument", message: "EXPORT: kind must be labels or comparison" }, { status: 400 });
            const presenting = await presentingOn(runtime.runtime.store, caller.tenant, caller.actor.id);
            const choice = chooseStandIns(presenting, fields.get("standins"));
            if (!choice.ok) return Response.json({ code: "invalid_argument", message: choice.message }, { status: choice.status });
            const data = await compareData(fields);
            if (kind === "comparison" && data.view === null) return Response.json({ code: "not_found", message: "EXPORT: no such session in the record" }, { status: 404 });
            const built = buildExport({ kind, labels: data.labels, comparison: data.view, standins: choice.standins, key: presentingKey(), names: data.repoNames, now: clock() });
            writeExport(exportsDir, built);
            return new Response(built.body, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "content-disposition": `attachment; filename="${built.name}"` } });
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
              outcome = await commitSurfaceIntent({ transport: "gui", node_id: actionId, intent_id: intentId }, "human");
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
          if (url.pathname === "/" && request.method === "GET") {
            return Response.redirect("/workspace", 303);
          }
          return new Response("not found\n", { status: 404 });
      };
      const server: HttpServer = Bun.serve({
        hostname: loaded.config.bind_host,
        port,
        async fetch(request) {
          return route(request);
        },
      });
      if (!pairingPrinted) {
        // No terminal: the code is written nowhere, and the server still listens. Every human route stays refused until a browser
        // pairs, and pairing is refused with words that say to run Horizon from an interactive terminal (R3-3).
        try {
          printPairingCode(server.url.origin, pairingCode);
        } catch (error) {
          if (!(error instanceof PairingNeedsTerminal)) {
            server.stop(true);
            throw error;
          }
          refuseWithoutTerminal();
        }
        pairingPrinted = true;
      }
      return server;
    },
    migrated: answersMigrated,
    async close() {
      closing = true;
      await conflictsListed;
      if (remote.listening) await remote.stop();
      for (const timer of windowTimers.values()) clearTimeout(timer);
      windowTimers.clear();
      if (deskLockToken !== undefined) await releaseDeskLock(runtime.runtime.store, deskLockToken);
      await runtime.runtime.close();
      await deskStore.close();
      if (storeLock !== undefined) await releaseStoreLockFile(storeLock);
    },
  };
}

/** The status-rail item for the phone remote: its state in words, and where to act on it. */
function remoteRailOf(status: RemoteStatus): { readonly state: string; readonly label: string } {
  const label = status.state === "off" ? "off" : status.state === "connected" ? "phone connected" : status.state === "restoring" ? "restoring" : "waiting";
  return { state: status.state, label: `Remote: ${label}` };
}

/** A `return` field is a query string for our own compare page, never a URL: no open redirect. */
/** The desk's JSON answer while a reserved change waits for the local terminal. Nothing was written. */
function awaitingDeskConfirmation(waiting: Extract<ConsumeResult, { ok: false }>): Response {
  const pending = waiting.code === "awaiting_local_confirmation" ? waiting.pending_id : null;
  const message =
    pending !== null
      ? `Confirm this on the Horizon terminal with: horizon confirm --pending ${pending}. Nothing was changed yet.`
      : "Horizon has no terminal to confirm on, so nothing was changed.";
  return Response.json({ ok: false, code: waiting.code, pending_id: pending, message }, { status: 409, headers: { "cache-control": "no-store" } });
}

/**
 * The answer a reserved route gives while its operation waits for the local terminal (Stage 0B).
 * Nothing was written: the route returns this instead of performing its write.
 */
function awaitingLocalConfirmation(request: Request, waiting: Extract<ConsumeResult, { ok: false }>, target: string): Response {
  const pending = waiting.code === "awaiting_local_confirmation" ? waiting.pending_id : null;
  const message =
    pending !== null
      ? `Confirm this on the Horizon terminal with: horizon confirm --pending ${pending}. Nothing was changed yet.`
      : "Horizon has no terminal to confirm on, so nothing was changed.";
  if ((request.headers.get("accept") ?? "").includes("application/json")) {
    return Response.json({ ok: false, code: waiting.code, pending_id: pending, message }, { status: 409 });
  }
  const separator = target.includes("?") ? "&" : "?";
  return Response.redirect(`${target}${separator}confirm=${encodeURIComponent(pending ?? "none")}`, 303);
}

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
export interface PageAgent {
  readonly name?: string;
}

/** `x-horizon-source: page-agent` marks a call an agent made through the page; `x-horizon-agent-name` is its optional plain-text name (60 characters at most). */
export function pageAgentOf(request: Request): PageAgent | null {
  if (request.headers.get("x-horizon-source")?.trim().toLowerCase() !== "page-agent") return null;
  const name = cleanAgentName(request.headers.get("x-horizon-agent-name"));
  return name === undefined ? {} : { name };
}

/** Whether a list the page sent holds exactly these ids. */
const sameSet = (given: readonly unknown[], ids: readonly string[]): boolean => given.length === ids.length && given.every((g) => typeof g === "string" && ids.includes(g)) && new Set(given).size === given.length;

export const NOT_RECORDED_WORDS = "This was done, but it could not be added to the conversation. Check the desk log.";

/** Methods that only read. Every other method needs a paired session cookie. */
export const READ_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);

/** A write from a browser that has not paired (or whose session has ended). Nothing is changed. */
export function notPairedRefusal(): Response {
  return Response.json({ ok: false, outcome: "not_paired", code: "forbidden_write", message: NOT_PAIRED_WORDS }, { status: 403, headers: { "cache-control": "no-store" } });
}

/** The only GET routes an unpaired browser may open: the page, its session check, its pairing route (POST) and the static client bundle that does the pairing. */
export const OPEN_READS: ReadonlySet<string> = new Set(["/desk", "/desk/session", "/desk/pair", "/desk/app.js", "/desk/app.css", "/health"]);

/** A read from a browser that has not paired. Nothing is shown. */
export function notPairedRead(): Response {
  return Response.json({ ok: false, outcome: "not_paired", code: "unauthorized", message: PAIR_FIRST_WORDS }, { status: 401, headers: { "cache-control": "no-store" } });
}

/** The owner of a call that carries no agent key. No question is ever owned by it, so such a call reads and routes nothing. */
export const UNKEYED_AGENT = "unkeyed";
/**
 * Which closed-catalog action a `POST /desk/search` body performs. The catalog's dispatch table
 * for that route names exactly two actions — `false_or_absent` (the read, which records nothing)
 * and `true_with_non_empty_q` (the recorded find) — and every other `record` value is Px.
 *
 * Null means "refuse": the caller asked for an action the closed catalog does not list, so the
 * desk searches nothing and writes nothing. A `record` of true with an empty question is refused
 * for the same reason: there is no find to bind the record to.
 */
export function deskSearchAction(record: unknown, query: string): "false_or_absent" | "true_with_non_empty_q" | null {
  if (record === undefined || record === false || record === "0") return "false_or_absent";
  if (record === true || record === "1") return query.trim() === "" ? null : "true_with_non_empty_q";
  return null;
}

export const AGENT_NOTE_WORDS = "An agent can suggest a note; you save it.";
export const AGENT_REFUSAL_WORDS = "Only you can confirm this. The agent's suggestion is waiting in the conversation.";

/** Null when an agent on the page may make the call. Reads and the hand off preview pass; every other write is refused with 403. */
export const AGENT_READS: ReadonlySet<string> = new Set(["/desk", "/workspace", "/desk/app.js", "/desk/app.css", "/desk/state.json", "/desk/search", "/desk/conversation", "/desk/panels/catalogue", "/desk/session"]);
export const AGENT_READ_WORDS = "An agent on the page can read the summary, a find and the conversation. Other parts of the desk are for you.";

export function pageAgentRefusal(method: string, pathname: string): Response | null {
  if (method === "GET" || method === "HEAD") return AGENT_READS.has(pathname) ? null : Response.json({ ok: false, outcome: "agent_refused", message: AGENT_READ_WORDS }, { status: 403, headers: { "cache-control": "no-store" } });
  if (method === "POST" && pathname === "/desk/handoff/preview") return null;
  const message = pathname === "/desk/note" ? AGENT_NOTE_WORDS : AGENT_REFUSAL_WORDS;
  return Response.json({ ok: false, outcome: "agent_refused", message }, { status: 403, headers: { "cache-control": "no-store" } });
}

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

/**
 * The connection from Horizon to the workshop (Cognate Workbench).
 *
 * `connectTransport` -> `createRemoteRuntimeService` -> `createClient`, the same path the workshop's own tests use.
 * The session key is read from `workshop.key_path` at call time and handed to the transport; it is never logged,
 * stored, exported or put in an error message. The key's expiry comes from the companion `workbench.key.json`
 * (`{sessionId, expiresAt}`), which holds no secret.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { createClient } from "@godspeedai/cognate-client";
import { createRemoteRuntimeService } from "@godspeedai/cognate-protocol-connect";
import { connectTransport } from "@godspeedai/cognate-protocol-connect-bun";
import type { Json } from "@godspeedai/cognate-events";
import type { Caller, CaseContext, RuntimeService } from "@godspeedai/cognate-runtime-api";
import { caseContextIssues } from "@godspeedai/cognate-runtime-api";
import type { WorkshopConfig } from "../config/types.ts";

export const KEY_WARNING_DAYS = 7;

export type KeyState = { readonly state: "missing" } | { readonly state: "empty" } | { readonly state: "unsafe" } | { readonly state: "ok" | "expiring" | "expired"; readonly expiresAt: string | null; readonly days_left: number | null };

type KeyRead = { readonly state: "ok"; readonly key: string } | { readonly state: "missing" | "empty" | "unsafe" };

/**
 * Reads the key file's trimmed contents. The only place the secret is read. A key file that other people on this computer
 * can read (any group or world permission bit) is refused: the key is a password, so the file must be mode 0600.
 */
function readKeyChecked(keyPath: string): KeyRead {
  try {
    if ((statSync(keyPath).mode & 0o077) !== 0) return { state: "unsafe" };
    const key = readFileSync(keyPath, "utf8").trim();
    return key === "" ? { state: "empty" } : { state: "ok", key };
  } catch {
    return { state: "missing" };
  }
}

const readKey = (keyPath: string): string | null => {
  const read = readKeyChecked(keyPath);
  return read.state === "ok" ? read.key : null;
};

/** State of the key from the companion file only; the key itself is not opened. */
export function keyState(config: WorkshopConfig, now: Date = new Date()): KeyState {
  if (!existsSync(config.key_path)) return { state: "missing" };
  const read = readKeyChecked(config.key_path);
  if (read.state !== "ok") return { state: read.state };
  let expiresAt: string | null = null;
  try {
    const doc = JSON.parse(readFileSync(`${config.key_path}.json`, "utf8")) as { expiresAt?: unknown };
    if (typeof doc.expiresAt === "string") expiresAt = doc.expiresAt;
  } catch {
    // The key exists but its expiry is unknown: shown as ok with no date, never as a guess.
  }
  if (expiresAt === null) return { state: "ok", expiresAt: null, days_left: null };
  const days = Math.floor((Date.parse(expiresAt) - now.getTime()) / 86_400_000);
  if (Number.isNaN(days)) return { state: "ok", expiresAt: null, days_left: null };
  return { state: days < 0 ? "expired" : days <= KEY_WARNING_DAYS ? "expiring" : "ok", expiresAt, days_left: days };
}

export interface WorkshopConnection {
  readonly service: RuntimeService;
  readonly client: ReturnType<typeof createClient>;
}

/** A client bound to the workshop, or null when the key is missing, empty or readable by others. The token is supplied lazily to the transport. */
export function connectWorkshop(config: WorkshopConfig, caller: Caller): WorkshopConnection | null {
  if (readKey(config.key_path) === null) return null;
  const service = createRemoteRuntimeService(connectTransport(config.url), () => readKey(config.key_path) ?? "");
  return { service, client: createClient({ service, caller }) };
}

/** Plain words for a key that cannot be used. Never names the key's contents. */
export function keyWords(state: "missing" | "empty" | "unsafe" | "expired"): string {
  switch (state) {
    case "missing":
      return "Agent work is not connected: there is no access key yet. Make one in the workshop settings.";
    case "empty":
      return "Agent work is not connected: the access key file is empty. Make a new key in the workshop settings.";
    case "unsafe":
      return "Agent work is not connected: the access key file can be read by other people on this computer, so Horizon will not use it. Make it private (only you) and try again.";
    default:
      return "Agent work is not connected: the access key has run out. Make a new one in the workshop settings.";
  }
}

/** The smallest client the hand-off needs. A real connection and a test double both fit. */
export interface WorkshopCaller {
  invoke(capability: string, input: Json): Promise<Json>;
}

export type Access =
  | { readonly kind: "ready"; readonly client: WorkshopCaller }
  | { readonly kind: "not_connected"; readonly why: "not_set_up" | "missing" | "empty" | "unsafe" | "expired"; readonly words: string };

/** Whether work can be handed to an agent right now, with the reason in words when it cannot. Nothing is sent. */
export function workshopAccess(config: WorkshopConfig | undefined, caller: Caller, now: Date = new Date()): Access {
  if (config === undefined) return { kind: "not_connected", why: "not_set_up", words: "Agent work is not connected: the workshop is not set up." };
  const state = keyState(config, now);
  if (state.state === "missing" || state.state === "empty" || state.state === "unsafe" || state.state === "expired") return { kind: "not_connected", why: state.state, words: keyWords(state.state) };
  const connection = connectWorkshop(config, caller);
  if (connection === null) return { kind: "not_connected", why: "missing", words: keyWords("missing") };
  return { kind: "ready", client: connection.client as unknown as WorkshopCaller };
}

export type WorkshopOutcome<T> =
  | { readonly kind: "ok"; readonly value: T }
  /** The workshop answered that this assignment already exists. For a step, that means the step is already assigned. */
  | { readonly kind: "already_assigned"; readonly words: string }
  | { readonly kind: "refused"; readonly words: string }
  | { readonly kind: "unreachable"; readonly why: "down" | "key_rejected" | "slow"; readonly maybe_done: boolean; readonly words: string };

export const DEFAULT_WORKSHOP_TIMEOUT_MS = 15_000;

/** Words for a failed call. The error text is read for its kind only and is never copied into the words (it could echo a key). */
export function workshopFailure(error: unknown, options: { readonly write: boolean }): WorkshopOutcome<never> {
  const text = `${(error as { code?: unknown } | null)?.code ?? ""} ${error instanceof Error ? error.message : String(error)}`;
  const tail = options.write ? " Nothing was handed over." : "";
  if (/identity already exists/i.test(text)) return { kind: "already_assigned", words: "This step already has an agent assigned. It is not assigned a second time." };
  if (/\b401\b|unauthenticated|unauthori[sz]ed/i.test(text)) {
    return {
      kind: "unreachable",
      why: "key_rejected",
      maybe_done: false,
      words: /expir/i.test(text) ? `The workshop refused the access key because it has run out. Make a new one in the workshop settings.${tail}` : `The workshop no longer accepts the access key (it was turned off or replaced). Make a new one in the workshop settings.${tail}`,
    };
  }
  if (/__slow__/.test(text)) {
    return { kind: "unreachable", why: "slow", maybe_done: options.write, words: options.write ? "The workshop did not answer in time (it may be down or slow). The work may or may not have been handed over. Try again: the same step is never given out twice." : "The workshop did not answer in time (it may be down or slow)." };
  }
  if (/permission_denied|forbidden|\b403\b/i.test(text)) return { kind: "refused", words: `The workshop did not allow this.${tail}` };
  // The workshop answered but would not start the work. Known reasons get their own words; the rest say so plainly.
  if (/configure a model|select a model route/i.test(text)) return { kind: "refused", words: `The workshop has no AI model set up, so the agent cannot start. Choose a model in the workshop settings, then hand the step off again.${tail}` };
  if (/active expert not found/i.test(text)) return { kind: "refused", words: `The agent named in Horizon's settings is not in the workshop (or it was archived). Check the agent in Horizon's settings.${tail}` };
  if (/failed_precondition|invalid_argument/i.test(text)) return { kind: "refused", words: `The workshop answered but would not start this work.${tail}` };
  return { kind: "unreachable", why: "down", maybe_done: false, words: `The workshop is not answering, so agent work cannot be reached.${tail}` };
}

/** Runs one workshop call with a time limit. */
async function guarded<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("__slow__")), timeoutMs);
  });
  try {
    return await Promise.race([work, limit]);
  } finally {
    clearTimeout(timer);
  }
}

export const assignmentId = (caseId: string, stepId: string): string => `assign:${caseId}:${stepId}`;

/** The CEP world-identity grammar (`world:<name>@sha256:<64 hex>`). A local Execution State Digest never matches it. */
export const CEP_WORLD_REF = /^world:[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*@sha256:[0-9a-f]{64}$/;
const SEMANTIC_REF = /^[A-Za-z0-9_.-]+::[A-Za-z0-9_.-]+$/;
const EPISODE_REF = /^episode:[^:@\s]+:[^:@\s]+:[0-9]+@sha256:[0-9a-f]{64}$/;
const ASSIGNMENT_REF = /^assign:[^:\s]+:[^:\s]+:[0-9]+:[0-9]+$/;
const EXPECTATION_REF = /^(question|threshold):.+$/;

/** Why an exploratory or evaluated handoff cannot be forwarded. Every code is a fixed, testable string. */
export type HandoffRefusalCode = "world_ref_not_cep" | "evaluated_without_episode" | "invalid_provenance";

/**
 * The context Horizon derives from its own case and pinned world. `registryChecked` is true only when
 * Horizon actually checked `worldRef` against its pinned world registry (`loadWorld` at boot); the
 * absence of that check is recorded as `asserted`, never implied to be `verified`. `episodeRef` is the
 * trusted Execution Episode binding, required for evaluated work.
 */
export interface CaseHandoff {
  readonly worldRef: string;
  readonly registryChecked: boolean;
  readonly semanticRef: string;
  readonly caseId: string;
  readonly planItemId: string;
  readonly role: string;
  readonly kind: "evaluated" | "exploratory";
  /** Horizon's own step correlation (`assign:<case>:<step>`); preserved for evidence, never a CEP identity. */
  readonly caseStepCorrelation: string;
  /** The operator session's attribution claim: recorded verbatim, never a refusal. */
  readonly assertedBy: string;
  readonly episodeRef?: string;
  readonly assignmentId?: string;
  readonly expectationRefs?: readonly string[];
  readonly executorProvenance?: "program" | "live" | "injected_fault";
}

export type DerivedHandoff =
  | { readonly kind: "ok"; readonly caseContext: CaseContext; readonly assertedBy: string; readonly worldCorroboration: "verified" | "asserted"; readonly caseStepCorrelation: string }
  | { readonly kind: "refused"; readonly code: HandoffRefusalCode; readonly words: string };

const present = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

/**
 * Build the CEP `CaseContext` Horizon forwards on `expert.converse`, refusing a typed error when
 * evaluated work lacks its trusted Execution Episode binding, when provenance is invalid, or when a
 * local Execution State Digest is presented as a CEP World Reference. Asserted context stays asserted.
 */
export function deriveCaseHandoff(input: CaseHandoff): DerivedHandoff {
  const refuse = (code: HandoffRefusalCode, words: string): DerivedHandoff => ({ kind: "refused", code, words });
  if (!CEP_WORLD_REF.test(String(input.worldRef))) {
    return refuse("world_ref_not_cep", "The world reference is not a CEP world identity (`world:<name>@sha256:<64 hex>`). A local Execution State Digest cannot stand in for the registered world.");
  }
  if (input.kind !== "evaluated" && input.kind !== "exploratory") return refuse("invalid_provenance", "The case kind must be evaluated or exploratory.");
  if (input.kind === "evaluated" && !present(input.episodeRef)) return refuse("evaluated_without_episode", "Evaluated work needs the trusted Execution Episode binding; the context cannot be forwarded without it.");
  if (!present(input.assertedBy)) return refuse("invalid_provenance", "assertedBy must name who asserts the context.");
  if (!present(input.caseStepCorrelation)) return refuse("invalid_provenance", "The Case-Step Correlation is required.");
  if (!SEMANTIC_REF.test(String(input.semanticRef))) return refuse("invalid_provenance", "semanticRef must be namespace::name.");
  if (input.episodeRef !== undefined && !EPISODE_REF.test(input.episodeRef)) return refuse("invalid_provenance", "The Execution Episode binding is malformed.");
  if (input.assignmentId !== undefined && !ASSIGNMENT_REF.test(input.assignmentId)) return refuse("invalid_provenance", "The case assignment reference is malformed.");
  if (input.expectationRefs !== undefined && (!Array.isArray(input.expectationRefs) || !input.expectationRefs.every((ref) => EXPECTATION_REF.test(ref)))) {
    return refuse("invalid_provenance", "Expectation references must be question:/threshold: ids.");
  }
  const caseContext: CaseContext = {
    worldRef: input.worldRef, semanticRef: input.semanticRef, caseId: input.caseId, planItemId: input.planItemId,
    role: input.role, kind: input.kind,
    ...(input.episodeRef !== undefined ? { episodeRef: input.episodeRef } : {}),
    ...(input.assignmentId !== undefined ? { assignmentId: input.assignmentId } : {}),
    ...(input.expectationRefs !== undefined ? { expectationRefs: input.expectationRefs } : {}),
    ...(input.executorProvenance !== undefined ? { executorProvenance: input.executorProvenance } : {}),
  };
  const issues = caseContextIssues(caseContext);
  if (issues.length) return refuse("invalid_provenance", `The case context is not well formed: ${issues.join("; ")}`);
  return { kind: "ok", caseContext, assertedBy: input.assertedBy, worldCorroboration: input.registryChecked ? "verified" : "asserted", caseStepCorrelation: input.caseStepCorrelation };
}

export interface AssignRequest {
  readonly caseId: string;
  readonly stepId: string;
  readonly expertId: string;
  readonly workspaceId: string;
  /** What the agent is asked to do, in the step's own words. */
  readonly message: string;
  /** For a review step: the id of the assignment under review. The workshop then starts the reviewer without the author's memory. */
  readonly reviews?: string;
  readonly timeoutMs?: number;
  /** J-HANDOFF-case-context: the validated CEP context and its provenance, forwarded on the same call. */
  readonly caseContext?: CaseContext;
  readonly assertedBy?: string;
  readonly worldCorroboration?: "verified" | "asserted";
  /** Horizon's own Case-Step Correlation, carried for evidence (never a CEP identity). */
  readonly caseStepCorrelation?: string;
}

/**
 * Hand one step to a workshop agent (`expert.converse`). The assignment id and the request id are both
 * `assign:<caseId>:<stepId>` (CF7: the workshop does not derive the id from the request id), so sending the same step again
 * replays the first answer, and a different request for the same step is refused as "Assignment identity already exists".
 */
export async function assign(access: Access, request: AssignRequest): Promise<WorkshopOutcome<{ readonly assignmentId: string }>> {
  if (access.kind !== "ready") return { kind: "refused", words: access.words };
  const id = assignmentId(request.caseId, request.stepId);
  try {
    const result = await guarded(access.client.invoke("expert.converse", {
      id, requestId: id, expertId: request.expertId, workspaceId: request.workspaceId, message: request.message,
      ...(request.reviews ? { reviews: request.reviews } : {}),
      ...(request.caseContext ? {
        caseContext: request.caseContext,
        ...(request.assertedBy !== undefined ? { assertedBy: request.assertedBy } : {}),
        ...(request.worldCorroboration !== undefined ? { worldCorroboration: request.worldCorroboration } : {}),
        ...(request.caseStepCorrelation !== undefined ? { caseStepCorrelation: request.caseStepCorrelation } : {}),
      } : {}),
    } as unknown as Json), request.timeoutMs ?? DEFAULT_WORKSHOP_TIMEOUT_MS);
    const got = typeof result === "object" && result !== null && !Array.isArray(result) ? (result as { assignmentId?: unknown }).assignmentId : undefined;
    return { kind: "ok", value: { assignmentId: typeof got === "string" ? got : id } };
  } catch (error) {
    return workshopFailure(error, { write: true });
  }
}

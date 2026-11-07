/**
 * The case keeper client (SFWP over the SEA-Forge Unix socket), built on `seaForgeCall`.
 *
 * Every method returns a typed outcome and never throws for an expected state. The outcome carries the words a
 * person should read ("The case keeper is not running..."), so a screen can say the honest thing without guessing:
 *
 * - `ok`: the case keeper answered and the answer had the shape asked for.
 * - `stale`: the case keeper refused because the record changed since the preview (`rejected_as_stale`). Nothing was written.
 * - `refused`: the case keeper answered with an error. Nothing was written.
 * - `unreachable`: no usable answer. For a write, `maybe_written` says the write may have landed; sending the same
 *   `request_id` again replays the first result instead of writing twice.
 *
 * A preview code is the `RecordDigest[]` a card was built from. Digests are read from the case keeper, never computed here
 * (docs/reference/sfwp-protocol-reference.md section 5.2).
 */
import { seaForgeCall, type SeaForgeActor } from "./sea-forge-approvals.ts";

export interface RecordDigest {
  readonly ref: string;
  readonly expected_digest: string;
}
export interface Preconditions {
  readonly policy_bundle_digest?: string;
  readonly records: readonly RecordDigest[];
}

export interface CaseKeeper {
  readonly socketPath: string;
  readonly service: SeaForgeActor;
  /** The person on whose behalf a write is made (the operator). Reads go as the service. */
  readonly operator?: SeaForgeActor;
  readonly timeoutMs?: number;
}

export type UnreachableWhy = "socket_missing" | "connection_refused" | "timeout" | "garbled" | "closed" | "other";

export interface ChangedRecord {
  readonly ref: string;
  readonly expected_digest: string;
  readonly current_digest: string | null;
}

export type Outcome<T> =
  | { readonly kind: "ok"; readonly value: T }
  | { readonly kind: "stale"; readonly changed: readonly ChangedRecord[]; readonly words: string }
  | { readonly kind: "refused"; readonly error_class: string; readonly words: string }
  | { readonly kind: "unreachable"; readonly why: UnreachableWhy; readonly maybe_written: boolean; readonly words: string };

export const STALE_WORDS = "This changed after you looked at it, so nothing was done. Look at the new version and decide again.";

function whyOf(error: Error): UnreachableWhy {
  const message = `${error.message} ${(error as { code?: string }).code ?? ""}`;
  if (/ENOENT|no such file/i.test(message)) return "socket_missing";
  if (/ECONNREFUSED|refused|EACCES|ENOTSOCK/i.test(message)) return "connection_refused";
  if (/in time|timed out|timeout/i.test(message)) return "timeout";
  if (/invalid JSON/i.test(message)) return "garbled";
  if (/closed the connection/i.test(message)) return "closed";
  return "other";
}

function unreachableWords(why: UnreachableWhy, write: boolean): string {
  const tail = write
    ? why === "timeout" || why === "closed" || why === "other"
      ? " The change may or may not have been made. Try again: the same request is never applied twice."
      : " Nothing was changed."
    : " Nothing is shown from before, so this part is blank until it answers.";
  switch (why) {
    case "socket_missing":
      return `The case keeper is not running (its socket is missing).${tail}`;
    case "connection_refused":
      return `The case keeper is not accepting connections.${tail}`;
    case "timeout":
      return `The case keeper did not answer in time.${tail}`;
    case "garbled":
      return `The case keeper sent an answer Horizon could not read.${tail}`;
    case "closed":
      return `The case keeper hung up before it finished answering.${tail}`;
    default:
      return `The case keeper could not be reached.${tail}`;
  }
}

function refusedWords(errorClass: string): string {
  switch (errorClass) {
    case "request_id_reused":
      return "That request number was already used for a different request, so the case keeper refused it. Nothing was changed.";
    case "invalid_decision":
      return "The case keeper does not know that decision. Nothing was changed.";
    case "durable_locator_required":
      return "The request had no request number, so the case keeper refused it. Nothing was changed.";
    default:
      return `The case keeper refused this (${errorClass}). Nothing was changed.`;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function digestOf(value: unknown): RecordDigest | null {
  return isRecord(value) && typeof value.ref === "string" && typeof value.expected_digest === "string" ? { ref: value.ref, expected_digest: value.expected_digest } : null;
}

async function call<T>(keeper: CaseKeeper, request: Record<string, unknown>, write: boolean, read: (reply: Record<string, unknown>) => T | null): Promise<Outcome<T>> {
  let reply: unknown;
  try {
    reply = await seaForgeCall(keeper.socketPath, { ...request, actor: keeper.service, ...(write && keeper.operator ? { on_behalf_of: keeper.operator } : {}) }, keeper.timeoutMs ?? 5_000);
  } catch (error) {
    const why = whyOf(error instanceof Error ? error : new Error(String(error)));
    return { kind: "unreachable", why, maybe_written: write && (why === "timeout" || why === "closed" || why === "other"), words: unreachableWords(why, write) };
  }
  if (!isRecord(reply)) return { kind: "unreachable", why: "garbled", maybe_written: false, words: unreachableWords("garbled", write) };
  if (reply.outcome === "rejected_as_stale") {
    const changed = (Array.isArray(reply.changed_records) ? reply.changed_records : []).flatMap((entry): ChangedRecord[] =>
      isRecord(entry) && typeof entry.ref === "string" ? [{ ref: entry.ref, expected_digest: String(entry.expected_digest ?? ""), current_digest: typeof entry.current_digest === "string" ? entry.current_digest : null }] : [],
    );
    return { kind: "stale", changed, words: STALE_WORDS };
  }
  if (reply.ok === false || typeof reply.error === "string" || typeof reply.error_class === "string") {
    const errorClass = typeof reply.error_class === "string" ? reply.error_class : "error";
    return { kind: "refused", error_class: errorClass, words: refusedWords(errorClass) };
  }
  const value = read(reply);
  // Valid JSON of the wrong shape is not an answer: say so rather than show an empty list.
  if (value === null) return { kind: "unreachable", why: "garbled", maybe_written: write, words: unreachableWords("garbled", write) };
  return { kind: "ok", value };
}

export interface PlanItemLine {
  readonly plan_item_id: string;
  readonly name: string;
  readonly item_kind: string;
}
export interface PreflightValue {
  readonly ok: boolean;
  readonly template_ref: string;
  readonly errors: readonly string[];
  readonly items: readonly PlanItemLine[];
  readonly precondition: RecordDigest | null;
  /** Pins the whole plan a commit would create (ref `plan:<template_ref>`). Null when the plan could not be built. */
  readonly plan_precondition: RecordDigest | null;
}

export function preflight(keeper: CaseKeeper, template_ref: string, params: Readonly<Record<string, string>> = {}): Promise<Outcome<PreflightValue>> {
  return call(keeper, { verb: "case_preflight", template_ref, params }, false, (reply) => {
    if (typeof reply.ok !== "boolean" || typeof reply.template_ref !== "string" || !Array.isArray(reply.items)) return null;
    return {
      ok: reply.ok,
      template_ref: reply.template_ref,
      errors: Array.isArray(reply.errors) ? reply.errors.map(String) : [],
      items: reply.items.flatMap((item): PlanItemLine[] => (isRecord(item) && typeof item.plan_item_id === "string" ? [{ plan_item_id: item.plan_item_id, name: String(item.name ?? ""), item_kind: String(item.item_kind ?? "") }] : [])),
      precondition: digestOf(reply.precondition),
      plan_precondition: digestOf(reply.plan_precondition),
    };
  });
}

export function commit(
  keeper: CaseKeeper,
  request: { readonly template_ref: string; readonly params?: Readonly<Record<string, string>>; readonly request_id: string; readonly preconditions: Preconditions },
): Promise<Outcome<Record<string, unknown>>> {
  return call(keeper, { verb: "case_commit", template_ref: request.template_ref, params: request.params ?? {}, request_id: request.request_id, preconditions: request.preconditions }, true, (reply) => reply);
}

export type DecisionChoice = "approve" | "reject";

export function decide(
  keeper: CaseKeeper,
  request: { readonly case_id: string; readonly approval_id: string; readonly decision: DecisionChoice; readonly note?: string; readonly request_id: string; readonly preconditions: Preconditions },
): Promise<Outcome<Record<string, unknown>>> {
  return call(
    keeper,
    { verb: "approval_decide", case_id: request.case_id, approval_id: request.approval_id, decision: request.decision, ...(request.note ? { note: request.note } : {}), request_id: request.request_id, preconditions: request.preconditions },
    true,
    (reply) => reply,
  );
}

export interface AddItemValue {
  readonly dry_run: boolean;
  readonly case_id: string;
  readonly plan_item_id: string;
  readonly proposed_by: string;
  /** A dry run only: the digest to carry into the real call. */
  readonly plan_precondition: RecordDigest | null;
}

/** `dry_run: true` previews the add and commits nothing; the real call needs `request_id` and, ideally, the preview's digest. */
export function addItem(
  keeper: CaseKeeper,
  request: { readonly case_id: string; readonly item: Readonly<Record<string, unknown>>; readonly request_id?: string; readonly external_ref?: { readonly kind: string; readonly id: string; readonly url?: string }; readonly dry_run: boolean; readonly preconditions?: Preconditions },
): Promise<Outcome<AddItemValue>> {
  const item = request.external_ref ? { ...request.item, external_ref: request.external_ref } : request.item;
  return call(
    keeper,
    { verb: "case_add_item", case_id: request.case_id, item, ...(request.request_id ? { request_id: request.request_id } : {}), dry_run: request.dry_run, ...(request.preconditions ? { preconditions: request.preconditions } : {}) },
    !request.dry_run,
    (reply) =>
      typeof reply.case_id === "string" && typeof reply.plan_item_id === "string"
        ? { dry_run: reply.dry_run === true, case_id: reply.case_id, plan_item_id: reply.plan_item_id, proposed_by: String(reply.proposed_by ?? ""), plan_precondition: digestOf(reply.plan_precondition) }
        : null,
  );
}

export interface CaseLine {
  readonly case_id: string;
  readonly case_state: string;
  readonly summary: string;
  readonly created_at: string;
  readonly closed_at: string | null;
}
export interface CaseListValue {
  readonly cases: readonly CaseLine[];
  /** Case folders that exist but could not be read. Counted, never hidden. */
  readonly unreadable: readonly string[];
}

export function listCases(keeper: CaseKeeper): Promise<Outcome<CaseListValue>> {
  return call(keeper, { verb: "case_list" }, false, (reply) => {
    if (!Array.isArray(reply.cases)) return null;
    const cases = reply.cases.flatMap((entry): CaseLine[] =>
      isRecord(entry) && typeof entry.case_id === "string" && typeof entry.case_state === "string"
        ? [{ case_id: entry.case_id, case_state: entry.case_state, summary: String(entry.summary ?? ""), created_at: String(entry.created_at ?? ""), closed_at: typeof entry.closed_at === "string" ? entry.closed_at : null }]
        : [],
    );
    // A case row that does not have the expected shape is an unreadable case, not an absent one.
    const malformed = reply.cases.length - cases.length;
    const unreadable = [...(Array.isArray(reply.unreadable) ? reply.unreadable.map(String) : []), ...Array.from({ length: malformed }, () => "(unreadable case row)")];
    return { cases, unreadable };
  });
}

/** The `case:<id>` digest a decision preview pins ("nothing happened to this case since I looked"). */
export function caseDigest(keeper: CaseKeeper, case_id: string): Promise<Outcome<{ readonly digest: RecordDigest | null; readonly case_state: string }>> {
  return call(keeper, { verb: "case_get_overview", case_id }, false, (reply) => (typeof reply.case_state === "string" ? { digest: digestOf(reply.digest), case_state: reply.case_state } : null));
}

export interface PendingApproval {
  readonly approval_id: string;
  readonly case_id: string;
  readonly plan_item_id: string;
  readonly requested_at: string;
  readonly expires_at: string;
  readonly expired: boolean;
  /** The `approval:<id>` digest a decision preview pins. Absent when the record could not be resolved. */
  readonly digest: RecordDigest | null;
}

export function approvalList(keeper: CaseKeeper, case_id?: string): Promise<Outcome<{ readonly approvals: readonly PendingApproval[]; readonly unreadable: string | null }>> {
  return call(keeper, { verb: "approval_list", ...(case_id ? { case_id } : {}) }, false, (reply) => {
    if (!Array.isArray(reply.approvals)) return null;
    const approvals = reply.approvals.flatMap((row): PendingApproval[] =>
      isRecord(row) && typeof row.approval_id === "string" && typeof row.case_id === "string"
        ? [{ approval_id: row.approval_id, case_id: row.case_id, plan_item_id: String(row.plan_item_id ?? ""), requested_at: String(row.requested_at ?? ""), expires_at: String(row.expires_at ?? ""), expired: row.expired === true, digest: digestOf(row.digest) }]
        : [],
    );
    return { approvals, unreadable: typeof reply.unreadable === "string" ? reply.unreadable : null };
  });
}

/** A short code for what a preview was built from: the same records give the same code, any change gives another. */
export async function previewCode(parts: readonly (string | RecordDigest)[]): Promise<string> {
  const text = parts.map((part) => (typeof part === "string" ? part : `${part.ref}=${part.expected_digest}`)).join("\n");
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

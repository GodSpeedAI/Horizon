/**
 * The approval inbox (P2.1): a pure presentation of SEA-Forge's `authority_approvals` listing.
 *
 * SEA-Forge owns every fact here: the state, who resolved it, and when it expires. This module only
 * validates rows (a malformed row is counted and never shown), groups them, and decides which
 * decision buttons may be offered. It never approves, rejects, or infers an approval. A decision
 * still goes through SEA-Forge, and SEA-Forge refuses anything it does not allow.
 *
 * A pending approval gets buttons only when a Horizon navigation commit waits on it. An approval with
 * no waiting commit is shown but not decided here: that decision belongs to SEA-Forge's own tooling.
 */

export const APPROVAL_STATES = ["pending", "approved", "rejected", "expired", "used"] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];

const APPROVAL_ID = /^[A-Za-z0-9_.:-]{1,200}$/;

/** One SEA-Forge approval as the listing reports it. Every field is validated before it is used. */
export interface InboxApproval {
  readonly approval_id: string;
  readonly state: ApprovalState;
  readonly requester: string;
  readonly world_ref: string;
  readonly operation_kind: string;
  readonly operation_name: string;
  readonly resource_id: string;
  readonly subject_actor_ref: string;
  readonly request_ref: string;
  readonly expires_at: string;
  readonly resolved_by: string | null;
}

export type DecisionAvailability =
  | { readonly kind: "decidable" }
  | { readonly kind: "not_decidable_here"; readonly reason: string };

export interface InboxItem extends InboxApproval {
  readonly decision: DecisionAvailability;
  /** Pending in SEA-Forge but past its expiry on the clock: shown, never offered for decision. */
  readonly past_expiry: boolean;
}

export interface Inbox {
  readonly waiting: readonly InboxItem[];
  readonly decided: readonly InboxItem[];
  /** Rows that failed validation. They are counted, not shown, so a bad record cannot look like a decision. */
  readonly malformed: number;
}

function text(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** Validate one listing row. Returns null for any row that does not match the SEA-Forge shape. */
export function parseApproval(row: unknown): InboxApproval | null {
  if (typeof row !== "object" || row === null || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  const approvalId = text(r, "approval_id");
  const state = text(r, "state");
  const requester = text(r, "requester");
  const worldRef = text(r, "world_ref");
  const kind = text(r, "operation_kind");
  const name = text(r, "operation_name");
  const resource = text(r, "resource_id");
  const subject = text(r, "subject_actor_ref");
  const requestRef = text(r, "request_ref");
  const expires = text(r, "expires_at");
  if ([approvalId, state, requester, worldRef, kind, name, resource, subject, requestRef, expires].some((v) => v === null)) return null;
  if (!APPROVAL_ID.test(approvalId!)) return null;
  if (!(APPROVAL_STATES as readonly string[]).includes(state!)) return null;
  if (Number.isNaN(Date.parse(expires!))) return null;
  const resolvedRaw = r.resolved_by;
  if (resolvedRaw !== null && (typeof resolvedRaw !== "string" || resolvedRaw === "")) return null;
  return {
    approval_id: approvalId!,
    state: state as ApprovalState,
    requester: requester!,
    world_ref: worldRef!,
    operation_kind: kind!,
    operation_name: name!,
    resource_id: resource!,
    subject_actor_ref: subject!,
    request_ref: requestRef!,
    expires_at: expires!,
    resolved_by: resolvedRaw,
  };
}

/** What the inbox page can show: an honest state for each way the listing can be absent. */
export type InboxReadout =
  | { readonly state: "not_configured" }
  | { readonly state: "unreachable"; readonly message: string }
  | { readonly state: "listed"; readonly inbox: Inbox };

/**
 * Build the inbox. `waitingApprovalIds` holds the approvals a Horizon navigation commit is waiting on.
 * `operatorRef` is the configured operator; it is used only to explain a refusal, never to decide.
 */
export function buildInbox(
  rows: unknown,
  options: { readonly now: Date; readonly waitingApprovalIds: ReadonlySet<string>; readonly operatorRef: string },
): Inbox {
  const parsed: InboxApproval[] = [];
  let malformed = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const approval = parseApproval(row);
    if (approval === null) malformed += 1;
    else parsed.push(approval);
  }
  const items = parsed.map((approval): InboxItem => {
    const pastExpiry = approval.state === "pending" && Date.parse(approval.expires_at) <= options.now.getTime();
    let decision: DecisionAvailability;
    if (approval.state !== "pending") {
      decision = { kind: "not_decidable_here", reason: `already ${approval.state}` };
    } else if (pastExpiry) {
      decision = { kind: "not_decidable_here", reason: "past its expiry time" };
    } else if (approval.requester === options.operatorRef) {
      decision = { kind: "not_decidable_here", reason: "you requested this; another actor must decide it" };
    } else if (!options.waitingApprovalIds.has(approval.approval_id)) {
      decision = { kind: "not_decidable_here", reason: "no Horizon commit waits on it; decide it in SEA-Forge" };
    } else {
      decision = { kind: "decidable" };
    }
    return { ...approval, decision, past_expiry: pastExpiry };
  });
  const waiting = items.filter((item) => item.state === "pending").sort((a, b) => Date.parse(a.expires_at) - Date.parse(b.expires_at));
  const decided = items.filter((item) => item.state !== "pending").sort((a, b) => b.expires_at.localeCompare(a.expires_at));
  return { waiting, decided, malformed };
}

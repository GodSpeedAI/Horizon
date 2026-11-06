/**
 * The approval inbox (P2.1): a pure presentation of SEA-Forge's `authority_approvals` listing.
 *
 * SEA-Forge owns every fact here: the state, who resolved it, and when it expires. This module only
 * receives rows the SDK client validated (an excluded row is counted and never shown), groups them, and decides which
 * decision buttons may be offered. It never approves, rejects, or infers an approval. A decision
 * still goes through SEA-Forge, and SEA-Forge refuses anything it does not allow.
 *
 * A pending approval gets buttons only when a Horizon navigation commit waits on it. An approval with
 * no waiting commit is shown but not decided here: that decision belongs to SEA-Forge's own tooling.
 */

import type { ApprovalStanding } from "@godspeedai/cognate-runtime-bun";

/** One SEA-Forge approval as the listing reports it; the SDK client has already validated every field. */
export type InboxApproval = ApprovalStanding;

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
  /** Rows the SDK client excluded as malformed. They are counted, not shown, so a bad record cannot look like a decision. */
  readonly excluded: number;
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
  rows: readonly ApprovalStanding[],
  excluded: number,
  options: { readonly now: Date; readonly waitingApprovalIds: ReadonlySet<string>; readonly operatorRef: string },
): Inbox {
  const parsed = rows;
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
  return { waiting, decided, excluded };
}

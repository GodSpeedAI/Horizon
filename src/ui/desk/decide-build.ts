/**
 * Builds the decision cards (design 5.5) and their previews (5.6) from what the connected parts report.
 * Pure: no store, no socket. The server passes in what it read; the same input always gives the same cards and the same codes.
 *
 * A preview's `code` is a hash of everything the preview shows plus the versions it pins. If any of it changes while the
 * operator is looking, the code changes, the confirm button turns off ("preview out of date"), and the server refuses an old code.
 */
import { createHash } from "node:crypto";
import type { InboxItem, InboxReadout } from "../../domain/approval-inbox.ts";
import type { WorkspaceMove } from "../workspace/model.ts";
import type { CaseApprovalRow, ChoicePreview, DecideState, DecisionCardData, DecisionPreview, RecordPin } from "./model.ts";

export type CaseApprovals = { readonly kind: "none" } | { readonly kind: "listed"; readonly approvals: readonly CaseApprovalRow[]; readonly unreadable: string | null } | { readonly kind: "notice"; readonly words: string };

export interface DecideInput {
  readonly inbox: InboxReadout;
  readonly moves: readonly WorkspaceMove[];
  readonly caseApprovals: CaseApprovals;
  readonly holds: ReadonlyMap<string, { readonly reason: string; readonly at: string }>;
}

type PreviewBody = Omit<DecisionPreview, "code">;

export function codeOf(body: PreviewBody): string {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 12);
}

const HOLD: ChoicePreview = {
  kind: "can be undone",
  button: "Hold this",
  effects: [{ text: "Nothing changes anywhere. The step keeps waiting and you keep the reason you type.", certainty: "certain" }],
  undo: "Release the hold. The card comes back to Needs you.",
  next: "You can decide later.",
};

function preview(body: Omit<PreviewBody, "hold">): DecisionPreview {
  const full: PreviewBody = { ...body, hold: HOLD };
  return { ...full, code: codeOf(full) };
}

const pins = (records: readonly RecordPin[]): readonly RecordPin[] => records.map((r) => ({ ref: r.ref, expected_digest: r.expected_digest }));

function escalationCard(item: InboxItem, move: WorkspaceMove | undefined): DecisionCardData {
  const decidable = item.decision.kind === "decidable";
  const body: Omit<PreviewBody, "hold"> = {
    touches: [`The move "${item.operation_name}" (${item.operation_kind}) on ${item.resource_id}`, `Asked for by ${item.requester}`, `Answer needed before ${item.expires_at}`],
    who: "Only someone other than the asker may answer. The case keeper refuses an answer from the asker, and checks the move again before it runs.",
    stops_if: item.past_expiry ? "It has already run out of time, so nothing can be done with it." : "The time to answer runs out, or the case keeper's own checks fail when it looks again.",
    limits: `Applies to this one request only. It must be answered before ${item.expires_at}.`,
    accept: decidable
      ? {
          kind: "changes things",
          button: "Accept: allow this move",
          effects: [
            { text: "Your approval is recorded by the case keeper under your name.", certainty: "certain" },
            { text: "The case keeper checks the move again against the rules, then runs it once.", certainty: "follows from the rules" },
            { text: "Whether the move then succeeds is only known afterwards.", certainty: "only known afterwards" },
          ],
          undo: "An approval cannot be taken back, but it is used once. You can reject any later request.",
          next: "The move is committed and its result appears under Work.",
        }
      : null,
    reject: decidable
      ? {
          kind: "changes things",
          button: "Reject: stop this move",
          effects: [
            { text: "Your refusal is recorded by the case keeper under your name.", certainty: "certain" },
            { text: "The move fails and the failure is written down, so it can be seen later.", certainty: "follows from the rules" },
          ],
          undo: "Ask for the move again; that makes a new request.",
          next: "The step stays unfinished until someone asks again.",
        }
      : null,
    records: pins([]),
  };
  return {
    id: `approval:${item.approval_id}`,
    kind: "escalation",
    title: `Allow "${item.operation_name}" to go ahead?`,
    facts: [`Asked by ${item.requester}`, `On ${item.resource_id}`, `Answer before ${item.expires_at}${item.past_expiry ? " (already past)" : ""}`],
    requested_at: move?.at ?? null,
    preview: preview(body),
    held: null,
    blocked: decidable ? null : item.decision.kind === "not_decidable_here" ? `This cannot be decided here: ${item.decision.reason}.` : null,
    reason_for_accept: false,
  };
}

function caseTaskCard(row: CaseApprovalRow): DecisionCardData {
  const records: RecordPin[] = row.digest ? [{ ref: row.digest.ref, expected_digest: row.digest.expected_digest }] : [];
  const usable = records.length > 0 && !row.expired;
  const body: Omit<PreviewBody, "hold"> = {
    touches: [`Step ${row.plan_item_id || "(unnamed)"} of case ${row.case_id}`, `Answer needed before ${row.expires_at}`],
    who: "Whoever the case's rules name. The case keeper refuses an answer from anyone else.",
    stops_if: "The approval changes after you looked at it, or runs out of time. Then nothing is done and you are told so.",
    limits: `This one approval only, before ${row.expires_at}.`,
    accept: usable
      ? {
          kind: "changes things",
          button: "Accept: let the step go on",
          effects: [
            { text: "The case keeper records your approval and lets the step run.", certainty: "certain" },
            { text: "The step's result is only known afterwards.", certainty: "only known afterwards" },
          ],
          undo: "An approval cannot be taken back.",
          next: "The step runs and its result appears under Work.",
        }
      : null,
    reject: usable
      ? {
          kind: "changes things",
          button: "Reject: stop the step",
          effects: [{ text: "The case keeper records your refusal. The step does not run.", certainty: "certain" }],
          undo: "Ask for the step again; that makes a new approval request.",
          next: "The step stays unfinished.",
        }
      : null,
    records: pins(records),
  };
  return {
    id: `case-task:${row.approval_id}`,
    kind: "case_task",
    title: "Let this step go ahead?",
    facts: [`Step ${row.plan_item_id || "(unnamed)"}`, `Case ${row.case_id}`, `Answer before ${row.expires_at}${row.expired ? " (already past)" : ""}`],
    requested_at: row.requested_at || null,
    preview: preview(body),
    held: null,
    blocked: row.expired ? "This approval ran out of time, so it cannot be decided." : records.length === 0 ? "The case keeper did not give a version code for this approval, so a decision cannot be tied to what you see. Try again in a moment." : null,
    reason_for_accept: false,
  };
}

function acceptanceCard(move: WorkspaceMove): DecisionCardData | null {
  if (!move.observable && !move.settleable) return null;
  const finalStep = move.settleable;
  const facts = [`Move ${move.operation_ref}`, `Decided: ${move.decided.text}`, `Recorded: ${move.recorded.text}`, `Observed: ${move.observed.text}`];
  const body: Omit<PreviewBody, "hold"> = {
    touches: [`The move "${move.operation_ref}" (${move.intent_id})`, move.settlement.text],
    who: finalStep ? "The case keeper rules on the evidence. You are asking it to rule now." : "The record keeper watches what was done and passes the evidence to the case keeper.",
    stops_if: finalStep ? "The case keeper refuses to rule, for example because evidence is missing." : "The record keeper cannot be reached. Nothing is recorded then.",
    limits: "This one move only.",
    accept: {
      kind: finalStep ? "cannot be undone" : "changes things",
      button: finalStep ? "Accept: final sign-off" : "Accept: check what happened",
      effects: finalStep
        ? [
            { text: "The case keeper rules on the evidence it has been given.", certainty: "certain" },
            { text: "Its answer is recorded and is final once it settles.", certainty: "certain" },
            { text: "Whether it accepts the result is only known afterwards.", certainty: "only known afterwards" },
          ]
        : [
            { text: "The record keeper reads the committed trace and sends the evidence to the case keeper.", certainty: "certain" },
            { text: "The case keeper has not ruled yet.", certainty: "certain" },
          ],
      undo: finalStep ? "This cannot be undone. A later move can correct it, but the ruling stays in the record." : "The observation stays in the record, but it decides nothing by itself.",
      next: finalStep ? "The result shows as accepted or not accepted." : "You can then ask the case keeper to rule.",
    },
    reject: null,
    records: pins([]),
  };
  return {
    id: `settle:${move.intent_id}:${finalStep ? "rule" : "observe"}`,
    kind: "acceptance",
    title: finalStep ? "Accept this result as final?" : "Check what really happened?",
    facts,
    requested_at: move.at,
    preview: preview(body),
    held: null,
    blocked: null,
    reason_for_accept: true,
  };
}

export function buildDecide(input: DecideInput): DecideState {
  const notices: string[] = [];
  const cards: DecisionCardData[] = [];
  const moveOfApproval = new Map(input.moves.flatMap((m) => (m.approval_id ? [[m.approval_id, m] as const] : [])));
  if (input.inbox.state === "not_configured") notices.push("No approver is set up, so decisions that need an approver cannot be answered here.");
  else if (input.inbox.state === "unreachable") notices.push(`The case keeper did not list the decisions waiting for you, so some may be missing. ${input.inbox.message}`);
  else {
    if (input.inbox.inbox.malformed > 0) notices.push(`${input.inbox.inbox.malformed} entries from the case keeper could not be read and are not shown.`);
    for (const item of input.inbox.inbox.waiting) cards.push(escalationCard(item, moveOfApproval.get(item.approval_id)));
  }
  if (input.caseApprovals.kind === "notice") notices.push(input.caseApprovals.words);
  else if (input.caseApprovals.kind === "listed") {
    if (input.caseApprovals.unreadable) notices.push(`The case keeper could not read its list of approvals (${input.caseApprovals.unreadable}), so some may be missing.`);
    for (const row of input.caseApprovals.approvals) cards.push(caseTaskCard(row));
  }
  for (const move of input.moves) {
    const card = acceptanceCard(move);
    if (card) cards.push(card);
  }
  const withHolds = cards.map((card): DecisionCardData => {
    const hold = input.holds.get(card.id);
    return hold ? { ...card, held: { reason: hold.reason, at: hold.at } } : card;
  });
  // Oldest first (a card with no known time goes last of the waiting ones), then the held cards.
  const age = (c: DecisionCardData): string => c.requested_at ?? "9999";
  const waiting = withHolds.filter((c) => c.held === null).sort((a, b) => (age(a) < age(b) ? -1 : age(a) > age(b) ? 1 : a.id < b.id ? -1 : 1));
  const held = withHolds.filter((c) => c.held !== null).sort((a, b) => (a.held!.at < b.held!.at ? -1 : 1));
  return { notices, cards: [...waiting, ...held] };
}

export const waitingCount = (decide: DecideState): number => decide.cards.filter((c) => c.held === null).length;

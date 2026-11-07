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
import { decidedLine } from "./decision-words.ts";
import { plainWords, type CaseApprovalRow, type ChoicePreview, type DecideState, type DecisionCardData, type DecisionPreview, type RecordPin } from "./model.ts";

export type CaseApprovals = { readonly kind: "none" } | { readonly kind: "listed"; readonly approvals: readonly CaseApprovalRow[]; readonly unreadable: string | null } | { readonly kind: "notice"; readonly words: string };

/** A step that waits for a person: a human task that is running and not yet settled, with the case version it was read at. */
export interface HumanStepInput {
  readonly case_id: string;
  readonly case_title: string;
  readonly plan_item_id: string;
  readonly name: string;
  readonly last_event_at: string | null;
  readonly digest: { readonly ref: string; readonly expected_digest: string } | null;
}
/** A lesson proposed from a review's findings that no person has decided yet. */
export interface LessonInput {
  readonly lesson_id: string;
  readonly text: string;
  readonly source: string | null;
  readonly proposed_by: string;
  readonly proposed_at: string;
}
export interface DecideInput {
  readonly lessons?: readonly LessonInput[];
  readonly humanSteps?: readonly HumanStepInput[];
  /** Notices from reading the steps (the case keeper did not answer). */
  readonly extraNotices?: readonly string[];
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
          next: "The move goes ahead and its result appears under Work.",
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

/**
 * A human step waiting for a person. "Mark done" needs a typed reason. The case keeper's `human_task_complete` takes no
 * preconditions, so the version the card pins (`case:<id>`) is compared by Horizon itself, just before sending (src/app.ts).
 */
function lessonCard(lesson: LessonInput): DecisionCardData {
  const body: Omit<PreviewBody, "hold"> = {
    touches: [`The lesson: "${lesson.text}"`, `Proposed by ${lesson.proposed_by}`, ...(lesson.source ? [`From: ${lesson.source}`] : [])],
    who: "You. A lesson becomes active only when a person accepts it. Notes and agent guesses never become active on their own.",
    stops_if: "Nothing else can make it active. If you do nothing it stays waiting.",
    limits: "This one lesson only.",
    accept: {
      kind: "can be undone",
      button: "Make it active",
      effects: [{ text: "Horizon records the lesson as active, with your name and the time.", certainty: "certain" }],
      undo: "A decided lesson cannot be changed here. Propose it again as a new finding.",
      next: "The lesson is kept as one you accepted.",
    },
    reject: {
      kind: "can be undone",
      button: "Reject it",
      effects: [{ text: "Horizon records the lesson as rejected, with your name and the time. It never becomes active.", certainty: "certain" }],
      undo: "Propose the lesson again as a new finding.",
      next: "The card goes away.",
    },
    records: [],
  };
  return { id: lesson.lesson_id, kind: "lesson", title: `Lesson from a review: ${lesson.text}`, facts: [`Lesson: ${lesson.text}`, `Proposed by ${lesson.proposed_by}`, "Waiting for you to accept or reject it"], requested_at: lesson.proposed_at, preview: preview(body), held: null, blocked: null, reason_for_accept: false };
}

function humanStepCard(step: HumanStepInput): DecisionCardData {
  const records: RecordPin[] = step.digest ? [{ ref: step.digest.ref, expected_digest: step.digest.expected_digest }] : [];
  const body: Omit<PreviewBody, "hold"> = {
    touches: [`The step "${step.name}" in the case "${step.case_title}"`],
    who: "You. This step is waiting for a person, and only a person can mark it done.",
    stops_if: "The case changes after you looked at it. Then nothing is sent and you are told so.",
    limits: "This one step only.",
    accept: records.length === 0
      ? null
      : {
          kind: "changes things",
          button: "Mark done",
          effects: [
            { text: "The case keeper records that you finished this step, with the reason you type.", certainty: "certain" },
            { text: "The next steps that were waiting for it can start.", certainty: "follows from the rules" },
          ],
          undo: "A finished step cannot be un-finished here. Add a new step to redo the work.",
          next: "The case moves on to what comes after this step.",
        },
    reject: null,
    records: pins(records),
  };
  return {
    id: `human:${step.case_id}:${step.plan_item_id}`,
    kind: "human_step",
    title: `${step.name}: ${step.case_title}`,
    facts: [`Step: ${step.name}`, `Case: ${step.case_title}`, "Waiting for you to do it and mark it done"],
    requested_at: step.last_event_at,
    preview: preview(body),
    held: null,
    blocked: records.length === 0 ? "The case keeper did not give a version code for this case, so marking it done cannot be tied to what you see. Try again in a moment." : null,
    reason_for_accept: true,
  };
}

function acceptanceCard(move: WorkspaceMove): DecisionCardData | null {
  if (!move.observable && !move.settleable) return null;
  const finalStep = move.settleable;
  const facts = [`Move ${move.operation_ref}`, `Decided: ${plainWords(move.decided.text)}`, `Recorded: ${plainWords(move.recorded.text)}`, `Observed: ${plainWords(move.observed.text)}`];
  const body: Omit<PreviewBody, "hold"> = {
    touches: [`The move "${move.operation_ref}" (${move.intent_id})`, plainWords(move.settlement.text)],
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
            { text: "The record keeper reads what was done and sends the evidence to the case keeper.", certainty: "certain" },
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
  else if (input.inbox.state === "unreachable") notices.push(plainWords(`The case keeper did not list the decisions waiting for you, so some may be missing. ${input.inbox.message}`));
  else {
    if (input.inbox.inbox.excluded > 0) notices.push(`${input.inbox.inbox.excluded} entries from the case keeper could not be read and are not shown.`);
    for (const item of input.inbox.inbox.waiting) cards.push(escalationCard(item, moveOfApproval.get(item.approval_id)));
  }
  if (input.caseApprovals.kind === "notice") notices.push(plainWords(input.caseApprovals.words));
  else if (input.caseApprovals.kind === "listed") {
    if (input.caseApprovals.unreadable) notices.push(`The case keeper could not read its list of approvals (${plainWords(input.caseApprovals.unreadable)}), so some may be missing.`);
    for (const row of input.caseApprovals.approvals) cards.push(caseTaskCard(row));
  }
  // An older move waits on a decision it cannot name: it is said here and never offered as a card.
  for (const move of input.moves) if (move.approval_identity?.state === "unverified") notices.push(`The move "${move.operation_ref}" waits for a decision, but this older record does not carry a verified request, so it cannot be approved from here.`);
  notices.push(...(input.extraNotices ?? []).map(plainWords));
  for (const step of input.humanSteps ?? []) cards.push(humanStepCard(step));
  for (const lesson of input.lessons ?? []) cards.push(lessonCard(lesson));
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
  const decided = input.inbox.state === "listed" ? input.inbox.inbox.decided.map((item) => decidedLine(item.operation_name, item.requester, item)) : [];
  return { notices, cards: [...waiting, ...held], ...(decided.length > 0 ? { decided } : {}) };
}

export const waitingCount = (decide: DecideState): number => decide.cards.filter((c) => c.held === null).length;

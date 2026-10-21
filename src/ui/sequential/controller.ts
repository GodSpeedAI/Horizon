/**
 * Clack's sequential half of the shared behavioral contract (T08).
 *
 * The controller is pure and renderer-neutral. It turns one validated `horizon.navigation/2`
 * frame into at most one question, and turns the observer's answer into one typed intent. It
 * never decides availability, grants authority or invokes anything: availability is already in
 * the frame, and execution belongs to the capability path (REQ-UI-004, REQ-INT-002).
 *
 * The distinctions that matter downstream are preserved rather than flattened:
 *   - blocked, unknown and conflicted moves stay visible but are not selectable;
 *   - a consequential choice has a review step before its intent exists;
 *   - a stale revision refuses the answer and asks for refresh instead of guessing;
 *   - cancel and back change only this session, never the world;
 *   - known context is shown, not asked for again (REQ-UX-005, REQ-NAV-007).
 */
import {
  planContextSelection,
  type NavigationChoice,
  type NavigationFrame,
  type NavigationResponsibility,
  type ReversibilityClass,
} from "../../domain/navigation.ts";

export const SEQUENTIAL_SCHEMA = "horizon.sequential/1" as const;
export const SEQUENTIAL_INTENT_SCHEMA = "horizon.sequential-intent/1" as const;

export type SequentialIntentKind = "inspect" | "confirm" | "defer" | "reframe" | "disagree";

/** The only thing a renderer may hand back. It is an intent, never an effect. */
export interface SequentialIntent {
  readonly schema: typeof SEQUENTIAL_INTENT_SCHEMA;
  readonly kind: SequentialIntentKind;
  readonly frame_id: string;
  readonly revision: number;
  readonly operation_ref: string;
  readonly actor_ref: string;
  /** True only when the caller explicitly asked for a labelled simulation. */
  readonly simulated: boolean;
}

export interface SequentialContext {
  readonly world_ref: string;
  readonly checkpoint_ref: string | null;
  readonly checkpoint_known: boolean;
  readonly focus_ref: string;
  readonly case_ref: string | null;
  readonly view_mode: NavigationResponsibility;
  /** Resolved context is displayed; only an unresolved field becomes a question. */
  readonly context_questions: readonly string[];
}

export interface SequentialChoice {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly disabled: boolean;
  readonly status: "available" | "blocked" | "unknown" | "conflicted";
  /** Plain language reason, before any gate or raw ref drill-down. */
  readonly reason?: string;
  /** The single next step that would clear the first blocker, when one is known. */
  readonly next_step?: string;
  readonly operation_ref?: string;
  readonly ui_action?: "back";
}

interface PromptBase {
  readonly frame_id: string;
  readonly revision: number;
  readonly current: boolean;
  readonly context: SequentialContext;
}

export interface ChoicePrompt extends PromptBase {
  readonly kind: "choice";
  readonly question: string;
  readonly body: readonly string[];
  readonly options: readonly SequentialChoice[];
  /** The option a resumed or revisited prompt should highlight, when it still applies. */
  readonly initial_choice_id: string | null;
  readonly blocked: readonly { readonly label: string; readonly reason: string; readonly next_step?: string }[];
}

export interface ReviewPrompt extends PromptBase {
  readonly kind: "review";
  readonly question: string;
  readonly operation_ref: string;
  readonly what: string;
  readonly reversibility: ReversibilityClass;
  readonly payment: string;
  readonly expected_evidence: readonly string[];
  readonly escalation: string;
  readonly simulation_note: string | null;
  readonly body: readonly string[];
}

export interface NoticePrompt extends PromptBase {
  readonly kind: "notice";
  readonly tone: "complete" | "cancelled" | "deferred" | "stale" | "error";
  readonly question: string;
  readonly body: readonly string[];
  readonly options: readonly SequentialChoice[];
  readonly initial_choice_id: string | null;
}

export type SequentialPrompt = ChoicePrompt | ReviewPrompt | NoticePrompt;

export interface SequentialError {
  readonly code: "stale_frame" | "unavailable_choice" | "invalid_intent";
  readonly message: string;
}

export interface SequentialSnapshot {
  readonly frame: NavigationFrame;
  readonly selection: string | null;
}

export interface SequentialSession {
  readonly schema: typeof SEQUENTIAL_SCHEMA;
  readonly frame: NavigationFrame;
  /** The newest frame the session has seen, even while an older frame is being inspected. */
  readonly latest_frame: NavigationFrame;
  readonly history: readonly SequentialSnapshot[];
  readonly selection: string | null;
  readonly pending_review: NavigationChoice | null;
  readonly prompt: SequentialPrompt;
  readonly error: SequentialError | null;
  readonly intents: readonly SequentialIntent[];
  readonly simulate_consequences: boolean;
  readonly source: string;
}

export type SequentialCommand =
  | { readonly type: "select"; readonly choice_id: string; readonly frame_id: string; readonly revision: number }
  | { readonly type: "confirm"; readonly frame_id: string; readonly revision: number }
  | { readonly type: "cancel" }
  | { readonly type: "cancel_review" }
  | { readonly type: "back" }
  | { readonly type: "resume" }
  | { readonly type: "refresh" };

export interface SequentialTransition {
  readonly ok: boolean;
  readonly session: SequentialSession;
  /** Non-null only when the observer actually chose. It has not been submitted by this module. */
  readonly intent: SequentialIntent | null;
}

const GATE_PLAIN: Readonly<Record<string, string>> = {
  visibility: "it is not visible to you",
  reach: "it is not reachable from here",
  payment: "it is not affordable",
  authority: "you are not authorized yet",
  capability: "no working capability is available",
  recovery: "there is no safe recovery",
  settlement_access: "its outcome could not be settled",
};

const VIEW_QUESTION: Readonly<Record<NavigationResponsibility, string>> = {
  orient: "Orient to the world",
  inspect: "Inspect the world",
  choose: "Choose what to inspect next",
  commit: "Review the next step",
  observe: "Observe what changed",
  review: "Review the case",
};

function contextOf(frame: NavigationFrame): SequentialContext {
  const selection = planContextSelection(
    ["world_ref", "checkpoint_ref", "focus_ref"],
    {
      world_ref: frame.world_ref,
      checkpoint_ref: frame.checkpoint_ref,
      focus_ref: frame.focus_ref,
    },
  );
  const questionFor: Readonly<Record<string, string>> = {
    world_ref: "Which world should this view use?",
    checkpoint_ref: "Which checkpoint should this view use?",
    focus_ref: "Which object should this view focus on?",
  };
  return Object.freeze({
    world_ref: frame.world_ref,
    checkpoint_ref: frame.checkpoint_ref,
    checkpoint_known: frame.checkpoint_ref !== null,
    focus_ref: frame.focus_ref,
    case_ref: frame.case_ref,
    view_mode: frame.view_mode,
    context_questions: Object.freeze(selection.unresolved.map((field) => questionFor[field] ?? field)),
  });
}

function isConsequential(choice: NavigationChoice): boolean {
  return choice.reversibility !== "read_only";
}

function needsReview(choice: NavigationChoice): boolean {
  return choice.selectable && isConsequential(choice);
}

export function plainReason(choice: NavigationChoice): string | undefined {
  const blocker = choice.blockers[0];
  if (blocker === undefined) return undefined;
  const head = GATE_PLAIN[blocker.gate] ?? "it is blocked";
  return `${head}: ${blocker.reason}`;
}

export function nextStep(choice: NavigationChoice): string | undefined {
  const blocker = choice.blockers.find((entry) => entry.prerequisite_ref !== undefined);
  if (blocker?.prerequisite_ref === undefined) return undefined;
  const head = GATE_PLAIN[blocker.gate] ?? "resolve the blocker";
  return `${head[0]?.toUpperCase() ?? ""}${head.slice(1)} — ${blocker.prerequisite_ref}`;
}

function optionsFor(frame: NavigationFrame, history: readonly SequentialSnapshot[]): SequentialChoice[] {
  const options: SequentialChoice[] = frame.choices.map((choice) => {
    const reason = plainReason(choice);
    const step = nextStep(choice);
    return {
      id: choice.operation_ref,
      label: choice.label,
      ...(choice.selectable
        ? { hint: choice.is_primary ? "recommended" : "available" }
        : { hint: reason ?? choice.status }),
      disabled: !choice.selectable,
      status: choice.status,
      ...(reason === undefined ? {} : { reason }),
      ...(step === undefined ? {} : { next_step: step }),
      operation_ref: choice.operation_ref,
    };
  });
  if (history.length > 0) {
    options.push({
      id: "ui:back",
      label: "Back to the previous decision",
      hint: "keeps your selection",
      disabled: false,
      status: "available",
      ui_action: "back",
    });
  }
  return options;
}

function bodyFor(frame: NavigationFrame): string[] {
  const body: string[] = [];
  body.push(`World ${frame.world_ref} · checkpoint ${frame.checkpoint_ref ?? "unknown"}`);
  body.push(`Focus ${frame.focus_ref}${frame.case_ref === null ? "" : ` · case ${frame.case_ref}`}`);
  body.push(...frame.reasons);
  if (frame.authority.grants_authority === false) {
    body.push("Nothing here grants authority; a choice only records an intent.");
  }
  return body;
}

function choiceQuestion(frame: NavigationFrame): string {
  if (frame.decision === "primary_available") {
    const primary = frame.choices.find((choice) => choice.is_primary);
    return primary === undefined ? VIEW_QUESTION[frame.view_mode] : `Next: ${primary.label}`;
  }
  if (frame.decision === "no_affordance") return "No move is available yet";
  if (frame.decision === "owner_choice") return VIEW_QUESTION.choose;
  return VIEW_QUESTION[frame.view_mode];
}

function promptFor(
  frame: NavigationFrame,
  latest: NavigationFrame,
  history: readonly SequentialSnapshot[],
  selection: string | null,
): SequentialPrompt {
  const context = contextOf(frame);
  const current = frame.frame_id === latest.frame_id && frame.revision === latest.revision;
  const body = bodyFor(frame);
  if (!current) {
    body.push("You are viewing an earlier frame. Resume to act on the current one; its answers would be stale.");
  }
  for (const question of context.context_questions) body.push(`Still needed: ${question}`);
  if (context.context_questions.length === 0) {
    body.push("Context is already known; no context question is needed.");
  }
  const options = optionsFor(frame, history);
  const blocked = frame.choices
    .filter((choice) => !choice.selectable)
    .map((choice) => ({
      label: choice.label,
      reason: plainReason(choice) ?? `${choice.status}`,
      ...(nextStep(choice) === undefined ? {} : { next_step: nextStep(choice) as string }),
    }));
  const initial = selection !== null && options.some((option) => option.id === selection && !option.disabled) ? selection : null;
  return Object.freeze({
    kind: "choice",
    frame_id: frame.frame_id,
    revision: frame.revision,
    current,
    context,
    question: choiceQuestion(frame),
    body: Object.freeze(body),
    options: Object.freeze(options),
    initial_choice_id: initial,
    blocked: Object.freeze(blocked),
  });
}

function reviewFor(frame: NavigationFrame, choice: NavigationChoice, simulate: boolean): ReviewPrompt {
  const payment =
    choice.payment === null
      ? "No payment is estimated."
      : `${choice.payment.estimate} (${choice.payment.provenance})`;
  const escalation =
    choice.escalation === null
      ? "No escalation behaviour is declared."
      : choice.escalation.behavior === "none"
        ? "No escalation is expected."
        : choice.escalation.behavior === "approval"
          ? `Authority may escalate to approval at ${choice.escalation.approval_ref ?? "an approval record"}.`
          : "The escalation path is unknown; treat it as a stop.";
  const simulation = simulate
    ? "SIMULATION — the intent is labelled simulated and must not be presented as a real effect."
    : null;
  const body = [
    `What: ${choice.label}`,
    `Reversibility: ${choice.reversibility}`,
    `Payment: ${payment}`,
    `Expected evidence: ${choice.expected_evidence.length === 0 ? "none declared" : choice.expected_evidence.join(", ")}`,
    `If authority escalates: ${escalation}`,
    ...(choice.next_prerequisite_ref === null ? [] : [`Next prerequisite: ${choice.next_prerequisite_ref}`]),
    "Confirming records an intent; it does not approve or execute the operation.",
  ];
  if (simulation !== null) body.push(simulation);
  return Object.freeze({
    kind: "review",
    frame_id: frame.frame_id,
    revision: frame.revision,
    current: true,
    context: contextOf(frame),
    question: `Confirm ${choice.label}?`,
    operation_ref: choice.operation_ref,
    what: choice.label,
    reversibility: choice.reversibility,
    payment,
    expected_evidence: Object.freeze([...choice.expected_evidence]),
    escalation,
    simulation_note: simulation,
    body: Object.freeze(body),
  });
}

function notice(
  frame: NavigationFrame,
  latest: NavigationFrame,
  tone: NoticePrompt["tone"],
  question: string,
  body: readonly string[],
  history: readonly SequentialSnapshot[],
): NoticePrompt {
  const options: SequentialChoice[] = [
    { id: "ui:resume", label: "Resume the current decision", disabled: false, status: "available" },
  ];
  if (history.length > 0) {
    options.push({ id: "ui:back", label: "Back to the previous decision", disabled: false, status: "available", ui_action: "back" });
  }
  return Object.freeze({
    kind: "notice",
    tone,
    frame_id: frame.frame_id,
    revision: frame.revision,
    current: frame.frame_id === latest.frame_id && frame.revision === latest.revision,
    context: contextOf(frame),
    question,
    body: Object.freeze(body),
    options: Object.freeze(options),
    initial_choice_id: "ui:resume",
  });
}

/** Build a fresh session around one frame. No clock, no I/O, no side effect. */
export function openSequential(
  frame: NavigationFrame,
  options: { readonly simulate_consequences?: boolean; readonly source?: string } = {},
): SequentialSession {
  return Object.freeze({
    schema: SEQUENTIAL_SCHEMA,
    frame,
    latest_frame: frame,
    history: Object.freeze([]),
    selection: null,
    pending_review: null,
    prompt: promptFor(frame, frame, [], null),
    error: null,
    intents: Object.freeze([]),
    simulate_consequences: options.simulate_consequences === true,
    source: options.source ?? "fixture",
  });
}

function intentKindFor(choice: NavigationChoice): SequentialIntentKind {
  if (choice.operation_ref === "horizon.navigation.defer") return "defer";
  if (choice.operation_ref === "horizon.navigation.reframe") return "reframe";
  if (choice.operation_ref === "horizon.navigation.disagree") return "disagree";
  if (isConsequential(choice)) return "confirm";
  return "inspect";
}

function intentFor(session: SequentialSession, choice: NavigationChoice, kind?: SequentialIntentKind): SequentialIntent {
  return Object.freeze({
    schema: SEQUENTIAL_INTENT_SCHEMA,
    kind: kind ?? intentKindFor(choice),
    frame_id: session.frame.frame_id,
    revision: session.frame.revision,
    operation_ref: choice.operation_ref,
    actor_ref: session.frame.observer_ref,
    simulated: session.simulate_consequences && isConsequential(choice),
  });
}

function withError(
  session: SequentialSession,
  code: SequentialError["code"],
  message: string,
): SequentialTransition {
  const prompt = notice(
    session.frame,
    session.latest_frame,
    code === "stale_frame" ? "stale" : "error",
    code === "stale_frame" ? "This view is out of date" : "That answer cannot be used",
    [message, "Refresh the frame before choosing again."],
    session.history,
  );
  return {
    ok: false,
    intent: null,
    session: Object.freeze({
      ...session,
      prompt,
      error: Object.freeze({ code, message }),
      pending_review: null,
    }),
  };
}

function isStale(session: SequentialSession, frameId: string, revision: number): boolean {
  return session.frame.frame_id !== frameId || session.frame.revision !== revision;
}

function notCurrent(session: SequentialSession): boolean {
  return session.frame.frame_id !== session.latest_frame.frame_id || session.frame.revision !== session.latest_frame.revision;
}

/** Apply one observer command. Only `select`, `confirm` and defer-style controls can yield an intent. */
export function applySequential(session: SequentialSession, command: SequentialCommand): SequentialTransition {
  if (command.type === "cancel") {
    return {
      ok: true,
      intent: null,
      session: Object.freeze({
        ...session,
        pending_review: null,
        prompt: notice(session.frame, session.latest_frame, "cancelled", "Decision cancelled", [
          "No choice was sent and nothing changed.",
          "Your frame, focus and selection are still here.",
        ], session.history),
        error: null,
      }),
    };
  }

  if (command.type === "resume") {
    return {
      ok: true,
      intent: null,
      session: Object.freeze({
        ...session,
        frame: session.latest_frame,
        pending_review: null,
        prompt: promptFor(session.latest_frame, session.latest_frame, session.history, session.selection),
        error: null,
      }),
    };
  }

  if (command.type === "back") {
    const previous = session.history.at(-1);
    if (previous === undefined) {
      return withError(session, "invalid_intent", "There is no earlier decision in this session.");
    }
    return {
      ok: true,
      intent: null,
      session: Object.freeze({
        ...session,
        frame: previous.frame,
        history: Object.freeze(session.history.slice(0, -1)),
        selection: previous.selection,
        pending_review: null,
        prompt: promptFor(previous.frame, session.latest_frame, session.history.slice(0, -1), previous.selection),
        error: null,
      }),
    };
  }

  if (command.type === "cancel_review") {
    return {
      ok: true,
      intent: null,
      session: Object.freeze({
        ...session,
        pending_review: null,
        prompt: promptFor(session.frame, session.latest_frame, session.history, session.selection),
        error: null,
      }),
    };
  }

  if (command.type === "refresh") {
    return {
      ok: true,
      intent: null,
      session: Object.freeze({
        ...session,
        frame: session.latest_frame,
        pending_review: null,
        prompt: promptFor(session.latest_frame, session.latest_frame, session.history, session.selection),
        error: null,
      }),
    };
  }

  if (command.type === "confirm") {
    if (isStale(session, command.frame_id, command.revision) || notCurrent(session)) {
      return withError(session, "stale_frame", `Revision ${command.revision} is not the current frame; refresh before confirming.`);
    }
    const pending = session.pending_review;
    if (pending === null) return withError(session, "invalid_intent", "There is no reviewed choice to confirm.");
    const intent = intentFor(session, pending, "confirm");
    return {
      ok: true,
      intent,
      session: Object.freeze({
        ...session,
        pending_review: null,
        selection: pending.operation_ref,
        intents: Object.freeze([...session.intents, intent]),
        prompt: notice(session.frame, session.latest_frame, "complete", "Intent ready", [
          `${pending.label} is ready as a typed ${intent.kind} intent${intent.simulated ? " (simulated)" : ""}.`,
          "A renderer has not executed it; the capability path decides what happens next.",
        ], session.history),
        error: null,
      }),
    };
  }

  // select
  if (isStale(session, command.frame_id, command.revision) || notCurrent(session)) {
    return withError(session, "stale_frame", `Revision ${command.revision} is not the current frame; refresh before choosing.`);
  }
  if (command.choice_id === "ui:back") return applySequential(session, { type: "back" });
  if (command.choice_id === "ui:resume") return applySequential(session, { type: "resume" });

  const choice = session.frame.choices.find((entry) => entry.operation_ref === command.choice_id);
  if (choice === undefined) {
    return withError(session, "unavailable_choice", `${command.choice_id} is not offered by this frame.`);
  }
  if (!choice.selectable) {
    return withError(session, "unavailable_choice", `${choice.label} is ${choice.status}; it cannot be selected.`);
  }

  if (needsReview(choice)) {
    return {
      ok: true,
      intent: null,
      session: Object.freeze({
        ...session,
        selection: choice.operation_ref,
        pending_review: choice,
        prompt: reviewFor(session.frame, choice, session.simulate_consequences),
        error: null,
      }),
    };
  }

  const intent = intentFor(session, choice);
  const tone = intent.kind === "defer" ? "deferred" : "complete";
  const question = intent.kind === "defer" ? "Decision deferred" : "Intent ready";
  return {
    ok: true,
    intent,
    session: Object.freeze({
      ...session,
      selection: choice.operation_ref,
      pending_review: null,
      intents: Object.freeze([...session.intents, intent]),
      prompt: notice(session.frame, session.latest_frame, tone, question, [
        `${choice.label} is ready as a typed ${intent.kind} intent.`,
        "A renderer has not executed it; the capability path decides what happens next.",
      ], session.history),
      error: null,
    }),
  };
}

/**
 * Present a successor frame. A review can never survive a world change: the reviewed revision is
 * pushed into history and the observer is asked again against the new frame.
 */
export function presentSequentialFrame(session: SequentialSession, frame: NavigationFrame): SequentialSession {
  const history = Object.freeze([...session.history, { frame: session.frame, selection: session.selection }]);
  const selection = session.selection;
  const stillOffered = selection !== null && frame.choices.some((choice) => choice.operation_ref === selection && choice.selectable);
  return Object.freeze({
    ...session,
    frame,
    latest_frame: frame,
    history,
    selection: stillOffered ? selection : null,
    pending_review: null,
    prompt: promptFor(frame, frame, history, stillOffered ? selection : null),
    error: null,
  });
}

/** Text for `horizon frame` when standard output is not a terminal. Byte-stable per prompt. */
export function renderSequentialText(prompt: SequentialPrompt): string {
  const lines: string[] = [];
  lines.push(`${prompt.question}`);
  lines.push(`frame=${prompt.frame_id} revision=${prompt.revision}${prompt.current ? "" : " (historical)"}`);
  lines.push(`world=${prompt.context.world_ref} checkpoint=${prompt.context.checkpoint_ref ?? "unknown"} focus=${prompt.context.focus_ref}`);
  for (const line of prompt.body) lines.push(line);
  if (prompt.kind === "review") {
    lines.push(`review=${prompt.operation_ref} reversibility=${prompt.reversibility}`);
  }
  if (prompt.kind !== "review") {
    for (const option of prompt.options) {
      const marker = option.disabled ? "x" : ">";
      const hint = option.hint === undefined ? "" : ` — ${option.hint}`;
      lines.push(`${marker} ${option.label}${hint}`);
    }
  }
  if (prompt.kind === "choice") {
    for (const blocked of prompt.blocked) {
      lines.push(`blocked: ${blocked.label} — ${blocked.reason}${blocked.next_step === undefined ? "" : `; next: ${blocked.next_step}`}`);
    }
  }
  if (prompt.kind === "review") lines.push("confirm: enter submits the typed intent; escape refuses it");
  return `${lines.join("\n")}\n`;
}

/**
 * The desk's view-model (annex B.1). Pure data and pure functions, no Node imports: the server builds a `DeskState`
 * from what the connected parts report, the browser bundle renders it. An agent can never write into this; the status
 * words come only from the parts themselves.
 */
import type { NoteRevision, NoteView } from "../../capabilities/notes.ts";
import type { WorkspaceBlocked, WorkspaceChoice, WorkspaceDebugger, WorkspaceMove, WorkspaceOnboardingStep, WorkspaceRetrieval } from "../workspace/model.ts";

export const NOT_CONNECTED = "Not connected";
export const POLL_MS = 2000;

export type ViewId = "today" | "explore" | "decide" | "work";
export const VIEWS: readonly { readonly id: ViewId; readonly label: string; readonly asks: string }[] = [
  { id: "today", label: "Today", asks: "What am I doing?" },
  { id: "explore", label: "Explore", asks: "What is here?" },
  { id: "decide", label: "Decide", asks: "What needs me?" },
  { id: "work", label: "Work", asks: "What is running and how did it go?" },
];

export interface DeskPart {
  readonly name: string;
  readonly connected: boolean;
  /** The words shown: "Records: connected", or "Records: Not connected". */
  readonly words: string;
}

export interface DeskStatus {
  readonly org: string;
  /** From HORIZON_SETUP; null when no setup is chosen. */
  readonly setup: "testing" | "production" | null;
  /** The rulebook edition, as a code only ("0a10c20d"); the bar adds the words. */
  readonly rules: string;
  readonly openCase: { readonly case_ref: string; readonly purpose: string } | null;
  readonly waiting: number;
  readonly parts: readonly DeskPart[];
  /** Days left on the workshop access key, only when 7 or fewer (or it has run out). */
  readonly keyWarning: string | null;
  readonly presenting: boolean;
}

export interface DeskCase {
  readonly case_ref: string;
  readonly purpose: string;
  readonly opened_at: string;
  /** Where this case is recorded: Horizon's own notebook of cases, or the case keeper. */
  readonly source?: "horizon" | "case keeper";
  /** The case keeper's state words, for cases that come from it. */
  readonly state?: string;
}

export interface ActivityItem {
  readonly id: string;
  readonly at: string;
  readonly source: "Cases";
  readonly text: string;
}

export interface SourceLine {
  readonly name: "Cases" | "Agent work" | "Records";
  readonly connected: boolean;
  readonly words: string;
  readonly href: string | null;
}

// ---- Decide (design 5.5, 5.6) ----
export const CERTAINTIES = ["certain", "follows from the rules", "expected", "unknown", "only known afterwards"] as const;
export type Certainty = (typeof CERTAINTIES)[number];
export interface PreviewEffect {
  readonly text: string;
  readonly certainty: Certainty;
}
export type ChoiceKind = "can be undone" | "changes things" | "cannot be undone";
export interface ChoicePreview {
  readonly kind: ChoiceKind;
  /** The one button label: what pressing it does. */
  readonly button: string;
  readonly effects: readonly PreviewEffect[];
  readonly undo: string;
  readonly next: string;
}
export interface RecordPin {
  readonly ref: string;
  readonly expected_digest: string;
}
/** Everything the operator is shown before a choice. `code` is made from all of it: when any part changes, the code changes. */
export interface DecisionPreview {
  readonly code: string;
  readonly touches: readonly string[];
  readonly who: string;
  readonly stops_if: string;
  readonly limits: string;
  readonly accept: ChoicePreview | null;
  readonly reject: ChoicePreview | null;
  readonly hold: ChoicePreview;
  /** The versions (from the case keeper) this preview was built from. Sent back with the decision so the case keeper can refuse a stale one. */
  readonly records: readonly RecordPin[];
}
/** One approval the case keeper lists (`approval_list`), as the desk reads it. The adapter's `PendingApproval` has this shape. */
export interface CaseApprovalRow {
  readonly approval_id: string;
  readonly case_id: string;
  readonly plan_item_id: string;
  readonly requested_at: string;
  readonly expires_at: string;
  readonly expired: boolean;
  readonly digest: RecordPin | null;
}
export type CardKind = "escalation" | "case_task" | "acceptance" | "human_step";
export interface DecisionCardData {
  readonly id: string;
  readonly kind: CardKind;
  /** The question in plain words, for example "Allow this move to go ahead?" */
  readonly title: string;
  /** Plain facts under the title. */
  readonly facts: readonly string[];
  readonly requested_at: string | null;
  readonly preview: DecisionPreview;
  readonly held: { readonly reason: string; readonly at: string } | null;
  /** Why accepting or rejecting is off, when it is. Hold stays possible. */
  readonly blocked: string | null;
  /** Accepting needs a typed reason (final sign-off and the acceptance check). */
  readonly reason_for_accept: boolean;
}
export interface DecideState {
  /** Problems reaching the parts that list decisions. A notice waits here; it is never a card. */
  readonly notices: readonly string[];
  /** Waiting, oldest first, then held. */
  readonly cards: readonly DecisionCardData[];
}

/** The frame-based "next decision": what can be done next from the shared focus, and what cannot and why. */
export interface NextState {
  readonly state: string;
  readonly state_message: string;
  readonly focus: string;
  readonly choices: readonly WorkspaceChoice[];
  readonly blocked: readonly WorkspaceBlocked[];
}

/** One answer to a debugger question, with the reference material cited beside it (null when no question text was asked). */
export interface InspectionAnswer {
  readonly operations: readonly string[];
  readonly debugger: WorkspaceDebugger;
  readonly retrieval: WorkspaceRetrieval | null;
}

export interface HomeState {
  readonly onboarding: { readonly visible: boolean; readonly skipped: boolean; readonly steps: readonly WorkspaceOnboardingStep[] };
  readonly caseError: string | null;
  readonly moves: readonly WorkspaceMove[];
  readonly receipt: { readonly intent_id: string; readonly found: boolean; readonly move: WorkspaceMove | null } | null;
  readonly assurance: string;
}

export interface DeskState {
  readonly rev: string;
  readonly today: string;
  readonly day: string;
  readonly timezone: string;
  readonly status: DeskStatus;
  readonly days: readonly { readonly day: string; readonly count: number }[];
  readonly cases: readonly DeskCase[];
  readonly tags: readonly { readonly name: string; readonly count: number }[];
  /** Notes placed on `day`, oldest first. */
  readonly notes: readonly NoteView[];
  /** Notes placed on the open case, or an empty list. */
  readonly caseNotes: readonly NoteView[];
  readonly activity: readonly ActivityItem[];
  readonly sources: readonly SourceLine[];
  readonly selected: { readonly note: NoteView; readonly history: readonly NoteRevision[] } | null;
  readonly decide: DecideState;
  readonly home: HomeState;
}

export interface SearchResult {
  readonly q: string;
  readonly day: string | null;
  readonly tag: string | null;
  readonly notes: readonly NoteView[];
  readonly cases: readonly DeskCase[];
  readonly days: readonly { readonly day: string; readonly count: number }[];
  readonly tags: readonly { readonly name: string; readonly count: number }[];
  readonly records: SourceLine;
}

export interface PartsInput {
  readonly rules: boolean;
  readonly cases: boolean;
  readonly records: boolean;
  readonly workshop: { readonly state: "missing" | "empty" | "unsafe" | "ok" | "expiring" | "expired"; readonly days_left: number | null };
}

/** Per-part health in plain words. "Not connected" is the only phrase for a missing part. */
export function partsOf(input: PartsInput): { readonly parts: DeskPart[]; readonly keyWarning: string | null } {
  const part = (name: string, connected: boolean): DeskPart => ({ name, connected, words: `${name}: ${connected ? "connected" : NOT_CONNECTED}` });
  const workshopUp = input.workshop.state === "ok" || input.workshop.state === "expiring";
  let keyWarning: string | null = null;
  if (input.workshop.state === "expired") keyWarning = "The access key for agent work has run out. Make a new one to hand work to agents.";
  else if (input.workshop.state === "empty") keyWarning = "The access key file for agent work is empty. Make a new key to hand work to agents.";
  else if (input.workshop.state === "unsafe") keyWarning = "The access key file for agent work can be read by other people on this computer, so it is not used. Make it private to you.";
  else if (input.workshop.state === "expiring") {
    const days = input.workshop.days_left ?? 0;
    keyWarning = `The access key for agent work runs out in ${days} ${days === 1 ? "day" : "days"}.`;
  }
  return {
    parts: [part("Rules", input.rules), part("Cases", input.cases), part("Records", input.records), part("Agent work", workshopUp), part("Reference library", false)],
    keyWarning,
  };
}

/** What a day shows, source by source (design 6.3). A source that is not connected says so. */
export function sourcesOf(input: { readonly cases: boolean; readonly agentWork: boolean; readonly records: boolean }): SourceLine[] {
  return [
    { name: "Cases", connected: input.cases, words: input.cases ? "Cases: connected" : "Cases not connected — case activity not shown", href: null },
    { name: "Agent work", connected: input.agentWork, words: input.agentWork ? "Agent work: connected" : "Agent work not connected", href: null },
    {
      name: "Records",
      connected: input.records,
      words: input.records ? "Records: connected. Sessions are listed on the comparison page." : "Records not connected — sessions from other AI coding tools not shown",
      href: input.records ? "/workspace/compare" : null,
    },
  ];
}

/** Why a day shows nothing, or null when it shows something. An empty day never just shows nothing. */
export function emptyDayReason(state: DeskState, loaded: boolean): string | null {
  if (!loaded) return "Still loading.";
  if (state.notes.length > 0 || state.activity.length > 0) return null;
  const missing = state.sources.filter((s) => !s.connected).map((s) => s.name);
  if (missing.length > 0) return `Nothing is written here yet, and ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not connected, so their activity cannot be shown.`;
  return "No notes and no activity on this day.";
}

/** One line for an empty Activity list: why there is none. It never repeats the health of each part (that is in the status bar). */
export function activityReason(state: DeskState): string {
  const missing = state.sources.filter((s) => !s.connected).map((s) => s.name);
  if (missing.length > 0) return `No activity to show: ${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} not connected.`;
  return "No activity on this day.";
}

export type ItemKind = "note" | "case" | "day" | "tag" | "activity" | "card";
export interface ListItem {
  readonly id: string;
  readonly kind: ItemKind;
  readonly label: string;
}

const firstLine = (text: string): string => (text.split("\n").find((l) => l.trim() !== "") ?? "").slice(0, 120);

/** The items the keyboard cursor walks in the open view. */
export function itemsOf(view: ViewId, state: DeskState | null, results: SearchResult | null): ListItem[] {
  if (view === "today" && state) {
    return [
      ...state.notes.map((n): ListItem => ({ id: n.note_id, kind: "note", label: firstLine(n.body) })),
      ...state.activity.map((a): ListItem => ({ id: a.id, kind: "activity", label: a.text })),
    ];
  }
  if (view === "explore" && results) {
    return [
      ...results.notes.map((n): ListItem => ({ id: n.note_id, kind: "note", label: firstLine(n.body) })),
      ...results.cases.map((c): ListItem => ({ id: c.case_ref, kind: "case", label: c.purpose })),
      ...results.days.map((d): ListItem => ({ id: `day:${d.day}`, kind: "day", label: d.day })),
      ...results.tags.map((t): ListItem => ({ id: `tag:${t.name}`, kind: "tag", label: t.name })),
    ];
  }
  if (view === "decide" && state) return state.decide.cards.map((c): ListItem => ({ id: c.id, kind: "card", label: c.title }));
  return [];
}

/** Calendar arithmetic on YYYY-MM-DD; never goes past `today`. */
export function shiftDay(day: string, delta: number, today: string): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const moved = new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
  return moved > today ? today : moved;
}

export const isDay = (text: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(text);

/** Matching for Find: used by the server to pick cases, days and tags. */
export function matches(text: string, q: string): boolean {
  return q === "" || text.toLowerCase().includes(q.toLowerCase());
}

/** Find text may carry `#tag` / `tag:x` and `day:YYYY-MM-DD`; the rest is the words to look for. */
export function parseFind(text: string): { readonly q: string; readonly day: string | null; readonly tag: string | null } {
  let day: string | null = null;
  let tag: string | null = null;
  const words: string[] = [];
  for (const word of text.trim().split(/\s+/)) {
    if (/^day:\d{4}-\d{2}-\d{2}$/.test(word)) day = word.slice(4);
    else if (/^tag:.+/.test(word)) tag = word.slice(4).toLowerCase();
    else if (/^#.+/.test(word)) tag = word.slice(1).toLowerCase();
    else if (word !== "") words.push(word);
  }
  return { q: words.join(" "), day, tag };
}

export function dayLabel(day: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
}

export function timeLabel(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso));
}

/**
 * Product names and internal terms never reach the screen (design section 1 and 2). Text that comes from a part is passed through
 * here before it is drawn, so "SEA-Forge is off" reads "the case keeper is off".
 */
export function plainWords(text: string): string {
  return text
    .replace(/SEA-Forge governance is off/g, "the case keeper is off")
    .replace(/RealityTrace is not configured/g, "the record keeper is not set up")
    .replace(/SEA-Forge governs commits and RealityTrace observes them\./g, "The case keeper decides and the record keeper watches.")
    .replace(/\bSEA-Forge\b/g, "the case keeper")
    .replace(/\bRealityTrace\b/g, "the record keeper")
    .replace(/\bCognate-Workbench\b|\bCognate\b/g, "the workshop")
    .replace(/\bSFWP\b/g, "case keeper")
    .replace(/\bgoverned\b/gi, "checked")
    .replace(/\bledger\b/gi, "record")
    .replace(/\bdigest\b/gi, "version code")
    .replace(/\btenant\b/gi, "organization")
    .replace(/\bwitness(es)?\b/gi, "record$1")
    .replace(/\bcommit(s|ted)?\b/gi, (_m, tail: string | undefined) => (tail === "s" ? "steps" : tail === "ted" ? "done" : "step"))
    .replace(/(^|\. )the (case|record) keeper/g, (_m, lead: string, word: string) => `${lead}The ${word} keeper`);
}

/** A case's title in plain words. A file path or a plan file name is never a title: it becomes "Case started <date>". */
export function caseTitle(summary: string, createdAt: string): string {
  const looksLikePath = /[\\/]|\.(json|ya?ml|toml)\b/i.test(summary) || /^execute plan\b/i.test(summary);
  const text = summary.trim();
  if (text === "" || looksLikePath) return `Case started ${createdAt.slice(0, 10) || "(date not recorded)"}`;
  return plainWords(text);
}

/** "local:Yoga7i:testing" is a code; the bar shows the computer's name. Any other organization name is shown as it is. */
export function orgWords(org: string): string {
  const parts = org.split(":");
  return parts[0] === "local" && parts[1] ? `This computer: ${parts[1]}` : org;
}

/** "horizon@0a10c20d" -> "Rulebook edition 0a10c20d". */
export function rulebookWords(rules: string): string {
  const edition = rules.includes("@") ? rules.slice(rules.indexOf("@") + 1) : rules;
  return edition === "" ? `Rulebook: ${NOT_CONNECTED}` : `Rulebook edition ${edition}`;
}

/** How long a card has waited, in words. A card with no known time says so; it is never shown as new. */
export function ageWords(since: string | null, nowMs: number): string {
  if (since === null) return "waiting (start time not recorded)";
  const ms = nowMs - Date.parse(since);
  if (!Number.isFinite(ms)) return "waiting (start time not recorded)";
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 1) return "waiting less than a minute";
  if (minutes < 60) return `waiting ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `waiting ${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.floor(hours / 24);
  return `waiting ${days} days`;
}

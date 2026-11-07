/**
 * The desk's view-model (annex B.1). Pure data and pure functions, no Node imports: the server builds a `DeskState`
 * from what the connected parts report, the browser bundle renders it. An agent can never write into this; the status
 * words come only from the parts themselves.
 */
import type { NoteRevision, NoteView } from "../../capabilities/notes.ts";

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
  readonly workshop: { readonly state: "missing" | "ok" | "expiring" | "expired"; readonly days_left: number | null };
}

/** Per-part health in plain words. "Not connected" is the only phrase for a missing part. */
export function partsOf(input: PartsInput): { readonly parts: DeskPart[]; readonly keyWarning: string | null } {
  const part = (name: string, connected: boolean): DeskPart => ({ name, connected, words: `${name}: ${connected ? "connected" : NOT_CONNECTED}` });
  const workshopUp = input.workshop.state === "ok" || input.workshop.state === "expiring";
  let keyWarning: string | null = null;
  if (input.workshop.state === "expired") keyWarning = "The access key for agent work has run out. Make a new one to hand work to agents.";
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

export type ItemKind = "note" | "case" | "day" | "tag" | "activity";
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

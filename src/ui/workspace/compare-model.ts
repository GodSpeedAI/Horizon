/**
 * The comparison view's data (design 5.7): "what the agent reports" next to "what the independent record shows".
 *
 * Pure. It takes ledger rows (already cut to a day by `ledger-day.ts`) and returns rows. A row with no real data
 * behind it says "not recorded" and one line why; nothing here guesses. The model reuses the surface2 `compare`
 * block's shape (a left and a right label, and dimensions of {label, left, right}) so the page is built from that part.
 */
import type { SurfaceBlock } from "../surface2/grammar.ts";
import { readEvent, journeyOf, type AgentEvent } from "../../economics/model.ts";

export const NOT_RECORDED = "not recorded";
export const SCORE_NOT_RECORDED = "not recorded — scored outside the record";

export const ROW_NAMES = ["expected", "observed", "difference", "rules in force", "allowed by", "record intact", "accepted", "journey score"] as const;
export type CompareRowName = (typeof ROW_NAMES)[number];

export interface CompareRow {
  readonly row: CompareRowName;
  readonly agentReports: string;
  readonly recordShows: string;
  /** Why a side reads "not recorded". Absent when both sides have data. */
  readonly reason?: string;
}

export type Outcome = "matched" | "contradicted" | "not recorded";

export interface SessionSummary {
  /** Where the session came from: the AI-tool copier (`agent`) or the workshop's own record (`workshop`). */
  readonly kind: "agent" | "workshop";
  readonly runtime: string;
  readonly session_id: string;
  readonly first_ts: string | null;
  readonly last_ts: string | null;
  readonly events: number;
  readonly checks: number;
  readonly failed: number;
  readonly outcome: Outcome;
  /** The event a label and the workshop link point at: first failed check, else latest check, else last event. */
  readonly event_id: string;
  readonly record_seq: number | null;
}

export interface Intact {
  readonly intact: boolean;
  readonly records: number | null;
  readonly divergence: string | null;
}

export interface CompareView {
  readonly session: SessionSummary;
  readonly rows: readonly CompareRow[];
  readonly checks: readonly { readonly id: string; readonly passed: boolean; readonly event_id: string }[];
  readonly workshop_link: string | null;
  readonly workshop_link_reason: string | null;
}

/** The surface2 compare block this view fills (type only: the grammar is not changed). */
export type CompareDimensions = Extract<SurfaceBlock, { type: "compare" }>["dimensions"];

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

interface Seen {
  readonly event: AgentEvent;
  readonly ordinal: number | null;
}
interface Cognate {
  readonly session_id: string;
  readonly event_id: string;
  readonly ordinal: number | null;
}

function scan(rows: readonly unknown[]): { events: Seen[]; cognate: Cognate[] } {
  const ordered = rows.filter(isObject).sort((a, b) => (num(a.append_ordinal) ?? 0) - (num(b.append_ordinal) ?? 0));
  const seen = new Set<string>();
  const events: Seen[] = [];
  const cognate: Cognate[] = [];
  for (const row of ordered) {
    if (row.record_kind !== "observation.recorded" || !isObject(row.payload) || !isObject(row.payload.extensions)) continue;
    const { agent_event, cognate: c } = row.payload.extensions;
    if (isObject(agent_event)) {
      const event = readEvent(agent_event);
      if (event && !seen.has(event.event_id)) {
        seen.add(event.event_id);
        events.push({ event, ordinal: num(row.append_ordinal) });
      }
    }
    if (isObject(c) && typeof c.correlationId === "string" && c.correlationId.startsWith("session:") && typeof c.eventId === "string") {
      cognate.push({ session_id: c.correlationId.slice("session:".length), event_id: c.eventId, ordinal: num(row.append_ordinal) });
    }
  }
  return { events, cognate };
}

interface Check {
  readonly id: string;
  readonly passed: boolean;
  readonly event_id: string;
  readonly ordinal: number | null;
  readonly ts: string;
}

/** The newest journey_check per question; the aggregate `journey-score:` event is returned apart and never counted as a check. */
function checksOf(events: readonly Seen[]): { checks: Check[]; score: Seen | null } {
  const latest = new Map<string, Check>();
  let score: Seen | null = null;
  for (const seen of events) {
    const { event } = seen;
    if (event.kind !== "journey_check" || event.exit_code === null || event.payload_ref === null) continue;
    if (event.payload_ref.startsWith("journey-score:")) {
      score = seen;
      continue;
    }
    if (!event.payload_ref.startsWith("journey:")) continue;
    const parsed = journeyOf(event.payload_ref.slice("journey:".length));
    if (!parsed) continue;
    const next: Check = { id: parsed.base, passed: event.exit_code === 0, event_id: event.event_id, ordinal: seen.ordinal, ts: event.ts ?? "" };
    const current = latest.get(parsed.base);
    if (!current || next.ts >= current.ts) latest.set(parsed.base, next);
  }
  return { checks: [...latest.values()].sort((a, b) => a.id.localeCompare(b.id)), score };
}

function summarize(kind: SessionSummary["kind"], runtime: string, session_id: string, events: readonly Seen[], cognate: readonly Cognate[]): SessionSummary {
  const { checks } = checksOf(events);
  const failed = checks.filter((c) => !c.passed);
  const stamps = events.map((e) => e.event.ts).filter((t): t is string => t !== null).sort();
  let event_id = "";
  let record_seq: number | null = null;
  if (failed[0]) ({ event_id, ordinal: record_seq } = { event_id: failed[0].event_id, ordinal: failed[0].ordinal });
  else if (checks.length > 0) {
    const last = [...checks].sort((a, b) => a.ts.localeCompare(b.ts)).at(-1)!;
    event_id = last.event_id;
    record_seq = last.ordinal;
  } else if (cognate.length > 0) {
    const last = cognate.at(-1)!;
    event_id = last.event_id;
    record_seq = last.ordinal;
  } else if (events.length > 0) {
    const last = events.at(-1)!;
    event_id = last.event.event_id;
    record_seq = last.ordinal;
  }
  return {
    kind,
    runtime,
    session_id,
    first_ts: stamps[0] ?? null,
    last_ts: stamps.at(-1) ?? null,
    events: events.length + cognate.length,
    checks: checks.length,
    failed: failed.length,
    outcome: failed.length > 0 ? "contradicted" : checks.length > 0 ? "matched" : "not recorded",
    event_id,
    record_seq,
  };
}

/** Every session in the rows, agent-copier sessions first, each with its outcome. */
export function listSessions(rows: readonly unknown[]): SessionSummary[] {
  const { events, cognate } = scan(rows);
  const bySession = new Map<string, Seen[]>();
  for (const seen of events) {
    const key = `${seen.event.runtime}\u0000${seen.event.native_session_id}`;
    bySession.set(key, [...(bySession.get(key) ?? []), seen]);
  }
  const out: SessionSummary[] = [...bySession.values()].map((list) => summarize("agent", list[0]!.event.runtime, list[0]!.event.native_session_id, list, []));
  const byWorkshop = new Map<string, Cognate[]>();
  for (const c of cognate) byWorkshop.set(c.session_id, [...(byWorkshop.get(c.session_id) ?? []), c]);
  for (const [id, list] of byWorkshop) out.push(summarize("workshop", "workshop", id, [], list));
  return out.sort((a, b) => (b.last_ts ?? "").localeCompare(a.last_ts ?? "") || a.session_id.localeCompare(b.session_id));
}

/** Keeps only what the filter asks for: contradicted sessions (expected-but-not-seen needs a plan, stage 4). */
export function onlyContradicted(sessions: readonly SessionSummary[]): SessionSummary[] {
  return sessions.filter((s) => s.outcome === "contradicted");
}

export function workshopLink(workshopUrl: string | undefined, sessionId: string, eventId: string): string | null {
  if (!workshopUrl || sessionId === "") return null;
  const base = workshopUrl.replace(/\/+$/, "");
  return `${base}/#sessions/${encodeURIComponent(sessionId)}${eventId === "" ? "" : `/${encodeURIComponent(eventId)}`}`;
}

export interface CompareOptions {
  readonly rows: readonly unknown[];
  readonly sessionId: string;
  readonly workshopUrl?: string;
  /** `ledger verify` result for this repo, or null when it could not be run. */
  readonly intact: Intact | null;
}

/** The comparison for one session, or null when the rows hold no such session. */
export function compareSession(options: CompareOptions): CompareView | null {
  const session = listSessions(options.rows).find((s) => s.session_id === options.sessionId);
  if (!session) return null;
  const { events } = scan(options.rows);
  const mine = events.filter((e) => e.event.native_session_id === session.session_id);
  const { checks, score } = checksOf(mine);
  const tools = mine.filter((e) => e.event.kind === "tool_post" || e.event.kind === "tool_fail");
  const toolFail = mine.filter((e) => e.event.kind === "tool_fail" || (e.event.kind === "tool_post" && e.event.exit_code !== null && e.event.exit_code !== 0)).length;

  const rows: CompareRow[] = [];
  rows.push({ row: "expected", agentReports: NOT_RECORDED, recordShows: NOT_RECORDED, reason: "the expectation is not written down in the record before the run yet (case steps arrive in stage 4)" });
  if (checks.length > 0) {
    const passed = checks.filter((c) => c.passed).length;
    rows.push({
      row: "observed",
      agentReports: tools.length > 0 ? `${tools.length} tool results reported, ${toolFail} failed` : NOT_RECORDED,
      recordShows: `${passed} of ${checks.length} declared checks passed${checks.some((c) => !c.passed) ? `; failed: ${checks.filter((c) => !c.passed).map((c) => c.id).join(", ")}` : ""}`,
      ...(tools.length > 0 ? {} : { reason: "the agent's own report is not stored in the record" }),
    });
    rows.push({
      row: "difference",
      agentReports: NOT_RECORDED,
      recordShows: session.outcome,
      reason: "the agent's own claim of success is not stored in the record, so only the record side is shown",
    });
  } else {
    const why = session.kind === "workshop" ? "workshop records carry no declared checks yet" : "no declared check was scored for this session in the record";
    rows.push({ row: "observed", agentReports: NOT_RECORDED, recordShows: NOT_RECORDED, reason: why });
    rows.push({ row: "difference", agentReports: NOT_RECORDED, recordShows: NOT_RECORDED, reason: why });
  }
  rows.push({ row: "rules in force", agentReports: NOT_RECORDED, recordShows: NOT_RECORDED, reason: "no rulebook edition is attached to this record yet (stage 5)" });
  rows.push({ row: "allowed by", agentReports: NOT_RECORDED, recordShows: NOT_RECORDED, reason: "no case keeper decision is linked to this session (stage 4)" });
  const intact = options.intact;
  rows.push(
    intact
      ? {
          row: "record intact",
          agentReports: NOT_RECORDED,
          recordShows: intact.intact ? `yes, checked just now${intact.records === null ? "" : ` (${intact.records} records)`}` : `no — the record does not verify${intact.divergence ? `: ${intact.divergence}` : ""}`,
          reason: "only the record can say this; the agent has no claim to compare",
        }
      : { row: "record intact", agentReports: NOT_RECORDED, recordShows: NOT_RECORDED, reason: "the integrity check could not be run" },
  );
  rows.push({ row: "accepted", agentReports: NOT_RECORDED, recordShows: NOT_RECORDED, reason: "this session was not handed through a case, so no one accepted or rejected it (stage 4)" });
  rows.push({
    row: "journey score",
    agentReports: NOT_RECORDED,
    recordShows: score ? (score.event.exit_code === 0 ? "all observed declared checks passed" : "at least one declared check failed") : SCORE_NOT_RECORDED,
    ...(score ? {} : { reason: "the score is computed outside the record" }),
  });

  const link = session.kind === "workshop" ? workshopLink(options.workshopUrl, session.session_id, session.event_id) : null;
  const linkReason = link ? null : session.kind === "agent" ? "this session was copied from an AI tool's hooks, not run in the workshop" : "the workshop address is not configured";
  return {
    session,
    rows,
    checks: checks.map(({ id, passed, event_id }) => ({ id, passed, event_id })),
    workshop_link: link,
    workshop_link_reason: linkReason,
  };
}

/** The rows as the surface2 `compare` block's dimensions (label, left, right). */
export function toDimensions(view: CompareView): CompareDimensions {
  return view.rows.map((r) => ({ label: r.row, left: r.agentReports, right: r.recordShows })) as CompareDimensions;
}

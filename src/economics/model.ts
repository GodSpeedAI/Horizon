/**
 * Case economics: a pure presentation over what RealityTrace returned (HC-06, INV-13).
 *
 * Horizon is not a RealityTrace evidence database (AGENTS.md section 9). This module takes the rows of
 * `realitytrace ledger export` and `projections export --canonical-json` and arranges them
 * repo -> case -> session. It stores nothing, writes nothing and gates nothing.
 *
 * Rules that make every figure equal the audited data (INV-13):
 *  - one agent event is counted once per `event_id` (a repeated row is not a second event);
 *  - a native cost is `owner = native` tokens only; TE injection and overhead are never added to it;
 *  - an ESTIMATED figure is carried in its own field and never summed into an observed one;
 *  - a case RealityTrace does not know is `null` ("unbound"), never invented;
 *  - every total is the sum of the rows below it, computed by `addTotals`.
 */

export const ECONOMICS_SCHEMA = "horizon.economics/1";

export const BUCKETS = ["input", "output", "cache_read", "cache_write"] as const;
export type Bucket = (typeof BUCKETS)[number];
export const QUALITIES = ["EXACT", "DERIVED", "ESTIMATED", "UNAVAILABLE"] as const;
export type Quality = (typeof QUALITIES)[number];
export const RESIDUAL_KINDS = ["observed_undeclared", "declared_unobserved", "declared_contradicted", "settled_with_debt"] as const;
export const ARMS = ["B", "T", "G", "F"] as const;

export interface TokenSums {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
  total: number;
}

export interface JourneyCounts {
  match: number;
  mismatch: number;
  undefined: number;
}

/** Everything that is summed from session to case to repo. */
export interface Totals {
  /** `owner = native` tokens, by bucket. */
  observed: TokenSums;
  /** Of `observed`, the part whose token_quality is ESTIMATED. Never relabelled as observed. */
  observed_estimated: TokenSums;
  /** `te_overhead` tokens (owner te). */
  te_overhead: TokenSums;
  /** `te_injection` attributed input tokens: an ESTIMATE of attribution, not consumption. */
  te_injection_attributed: number;
  /** Tokens of backfill / conversion owners: shown, never mixed into observed. */
  other_owner: TokenSums;
  usage_events: number;
  tool_post: number;
  tool_fail: number;
  /** Native usage events carrying no token counts (token_quality UNAVAILABLE or null tokens). */
  events_without_tokens: number;
  journeys: Record<string, JourneyCounts>;
  events: number;
}

export interface LessonRow {
  event_id: string;
  /** Attributed input tokens (an estimate of what was injected), or null. */
  attributed_input_tokens: number | null;
  token_quality: Quality | null;
  /** Estimated savings. RealityTrace records none today; Horizon never computes a counterfactual. */
  estimate: null;
  ref: string | null;
}

export interface SessionModel {
  runtime: string;
  native_session_id: string;
  roles: string[];
  arms: string[];
  first_ts: string | null;
  last_ts: string | null;
  totals: Totals;
  /** `te_overhead` as a percent of observed total, or null when nothing was observed. */
  overhead_pct: number | null;
  lessons: LessonRow[];
}

export interface CaseModel {
  /** null = unbound: RealityTrace carries no case for these events. */
  case_id: string | null;
  totals: Totals;
  overhead_pct: number | null;
  sessions: SessionModel[];
}

export interface ResidualSummary {
  total: number;
  by_kind: Record<string, number>;
}

export interface AblationRow {
  arm: string;
  sessions: number;
  observed_total: number;
  events: number;
}

export interface EconomicsModel {
  schema: typeof ECONOMICS_SCHEMA;
  totals: Totals;
  overhead_pct: number | null;
  cases: CaseModel[];
  /** Native usage whose case is unknown. Included in the unbound case above, repeated here so it cannot hide. */
  unattributed_usage: { events: number; observed: TokenSums; observed_estimated: TokenSums };
  residuals: ResidualSummary;
  /** Declared journey questions (base ids) RealityTrace knows. */
  declared_journey_questions: number;
  ablation: { run: boolean; rows: AblationRow[] };
  /** Ledger rows that were agent events (after dedup), repeats ignored, and conflicting repeats. */
  audit: { agent_events: number; duplicate_rows: number; conflicting_rows: number; ignored_rows: number };
}

const zeroTokens = (): TokenSums => ({ input: 0, output: 0, cache_read: 0, cache_write: 0, total: 0 });

export function zeroTotals(): Totals {
  return {
    observed: zeroTokens(),
    observed_estimated: zeroTokens(),
    te_overhead: zeroTokens(),
    te_injection_attributed: 0,
    other_owner: zeroTokens(),
    usage_events: 0,
    tool_post: 0,
    tool_fail: 0,
    events_without_tokens: 0,
    journeys: {},
    events: 0,
  };
}

function addTokens(into: TokenSums, from: TokenSums): void {
  for (const key of BUCKETS) into[key] += from[key];
  into.total += from.total;
}

export function addTotals(into: Totals, from: Totals): void {
  addTokens(into.observed, from.observed);
  addTokens(into.observed_estimated, from.observed_estimated);
  addTokens(into.te_overhead, from.te_overhead);
  addTokens(into.other_owner, from.other_owner);
  into.te_injection_attributed += from.te_injection_attributed;
  into.usage_events += from.usage_events;
  into.tool_post += from.tool_post;
  into.tool_fail += from.tool_fail;
  into.events_without_tokens += from.events_without_tokens;
  into.events += from.events;
  for (const [journey, counts] of Object.entries(from.journeys)) {
    const slot = (into.journeys[journey] ??= { match: 0, mismatch: 0, undefined: 0 });
    slot.match += counts.match;
    slot.mismatch += counts.mismatch;
    slot.undefined += counts.undefined;
  }
}

const overheadPct = (t: Totals): number | null => (t.observed.total > 0 ? (t.te_overhead.total / t.observed.total) * 100 : null);

// ---------------------------------------------------------------------------------------------- reading rows

interface LedgerRow {
  readonly append_ordinal?: unknown;
  readonly record_kind?: unknown;
  readonly payload?: unknown;
}

export interface AgentEvent {
  event_id: string;
  runtime: string;
  native_session_id: string;
  kind: string;
  ts: string | null;
  case_id: string | null;
  role: string | null;
  arm: string | null;
  tokens: { input: number; output: number; cache_write: number; cache_read: number } | null;
  token_quality: Quality | null;
  owner: string;
  attributed_input_tokens: number | null;
  payload_ref: string | null;
  exit_code: number | null;
}

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);
const count = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null);

export function readEvent(raw: Record<string, unknown>): AgentEvent | null {
  const event_id = str(raw.event_id);
  const runtime = str(raw.runtime);
  const native_session_id = str(raw.native_session_id);
  const kind = str(raw.kind);
  const owner = str(raw.owner);
  if (!event_id || !runtime || !native_session_id || !kind || !owner) return null;
  let tokens: AgentEvent["tokens"] = null;
  if (isObject(raw.tokens)) {
    const input = count(raw.tokens.input);
    const output = count(raw.tokens.output);
    const cache_write = count(raw.tokens.cache_write);
    const cache_read = count(raw.tokens.cache_read);
    if (input !== null && output !== null && cache_write !== null && cache_read !== null) tokens = { input, output, cache_write, cache_read };
  }
  const quality = str(raw.token_quality);
  const caseId = str(raw.case_id);
  return {
    event_id,
    runtime,
    native_session_id,
    kind,
    ts: str(raw.ts),
    // "unknown" is the tap's own sentinel for "no case bound"; it is not a case.
    case_id: caseId === null || caseId.toLowerCase() === "unknown" ? null : caseId,
    role: str(raw.role),
    arm: str(raw.arm),
    tokens,
    token_quality: (QUALITIES as readonly string[]).includes(quality ?? "") ? (quality as Quality) : null,
    owner,
    attributed_input_tokens: count(raw.attributed_input_tokens),
    payload_ref: str(raw.payload_ref),
    exit_code: typeof raw.exit_code === "number" && Number.isInteger(raw.exit_code) ? raw.exit_code : null,
  };
}

const sumOf = (tokens: NonNullable<AgentEvent["tokens"]>): TokenSums => ({
  input: tokens.input,
  output: tokens.output,
  cache_read: tokens.cache_read,
  cache_write: tokens.cache_write,
  total: tokens.input + tokens.output + tokens.cache_read + tokens.cache_write,
});

/** `journey:<J>:<field>:<n>[@version]` -> `{ base, journey }`; anything else is not a journey question. */
export function journeyOf(questionId: string): { base: string; journey: string } | null {
  const base = questionId.split("@")[0]!;
  const parts = base.split(":");
  if (parts[0] !== "journey" || parts.length < 3 || !parts[1]) return null;
  return { base, journey: parts[1] };
}

function declaredJourneyQuestions(rows: readonly LedgerRow[]): Map<string, string> {
  const declared = new Map<string, string>();
  for (const row of rows) {
    if (row.record_kind !== "question.declared" || !isObject(row.payload)) continue;
    const representations = row.payload.representations;
    if (!Array.isArray(representations)) continue;
    for (const representation of representations) {
      const content = isObject(representation) ? representation.inline_content : null;
      const id = isObject(content) ? str(content.question_id) : null;
      const journey = id === null ? null : journeyOf(id);
      if (journey) declared.set(journey.base, journey.journey);
    }
  }
  return declared;
}

// ---------------------------------------------------------------------------------------------- the model

export function economicsModel(ledgerRows: readonly unknown[], projectionRows: readonly unknown[] = []): EconomicsModel {
  const rows = ledgerRows.filter(isObject) as LedgerRow[];
  const audit = { agent_events: 0, duplicate_rows: 0, conflicting_rows: 0, ignored_rows: 0 };

  // 1. Agent events, once per event_id (first append wins; a differing repeat is reported, not merged).
  const ordered = [...rows].sort((a, b) => (count(a.append_ordinal) ?? 0) - (count(b.append_ordinal) ?? 0));
  const seen = new Map<string, string>();
  const events: { event: AgentEvent; ordinal: number }[] = [];
  for (const row of ordered) {
    if (row.record_kind !== "observation.recorded" || !isObject(row.payload)) continue;
    const extensions = row.payload.extensions;
    const raw = isObject(extensions) ? extensions.agent_event : undefined;
    if (!isObject(raw)) continue;
    const event = readEvent(raw);
    if (event === null) {
      audit.ignored_rows += 1;
      continue;
    }
    const fingerprint = JSON.stringify(raw);
    const prior = seen.get(event.event_id);
    if (prior !== undefined) {
      if (prior === fingerprint) audit.duplicate_rows += 1;
      else audit.conflicting_rows += 1;
      continue;
    }
    seen.set(event.event_id, fingerprint);
    events.push({ event, ordinal: count(row.append_ordinal) ?? 0 });
  }
  audit.agent_events = events.length;

  // 2. Journey verdicts: the newest journey_check per (session, question). Declared-but-unobserved = undefined.
  const declared = declaredJourneyQuestions(rows);
  const verdicts = new Map<string, Map<string, { key: [string, number]; exit: number; caseId: string | null }>>();
  const sessionKey = (e: AgentEvent) => `${e.runtime}\u0000${e.native_session_id}`;
  for (const { event, ordinal } of events) {
    if (event.kind !== "journey_check" || event.exit_code === null || !event.payload_ref?.startsWith("journey:")) continue;
    const parsed = journeyOf(event.payload_ref.slice("journey:".length));
    if (!parsed) continue;
    const key: [string, number] = [event.ts ?? "", ordinal];
    const perSession = verdicts.get(sessionKey(event)) ?? new Map();
    verdicts.set(sessionKey(event), perSession);
    const current = perSession.get(parsed.base);
    if (!current || key[0] > current.key[0] || (key[0] === current.key[0] && key[1] >= current.key[1])) perSession.set(parsed.base, { key, exit: event.exit_code, caseId: event.case_id });
  }

  // 3. Group: case -> session.
  interface SessionDraft {
    model: SessionModel;
    firstEvent: AgentEvent;
  }
  const cases = new Map<string | null, Map<string, SessionDraft>>();
  const sessionCases = new Map<string, Set<string | null>>();
  for (const { event } of events) {
    const bySession = cases.get(event.case_id) ?? new Map<string, SessionDraft>();
    cases.set(event.case_id, bySession);
    let draft = bySession.get(sessionKey(event));
    if (!draft) {
      draft = {
        firstEvent: event,
        model: { runtime: event.runtime, native_session_id: event.native_session_id, roles: [], arms: [], first_ts: null, last_ts: null, totals: zeroTotals(), overhead_pct: null, lessons: [] },
      };
      bySession.set(sessionKey(event), draft);
    }
    (sessionCases.get(sessionKey(event)) ?? sessionCases.set(sessionKey(event), new Set()).get(sessionKey(event))!).add(event.case_id);
    const session = draft.model;
    const totals = session.totals;
    totals.events += 1;
    if (event.role && !session.roles.includes(event.role)) session.roles.push(event.role);
    if (event.arm && event.arm !== "none" && !session.arms.includes(event.arm)) session.arms.push(event.arm);
    if (event.ts) {
      if (session.first_ts === null || event.ts < session.first_ts) session.first_ts = event.ts;
      if (session.last_ts === null || event.ts > session.last_ts) session.last_ts = event.ts;
    }
    if (event.kind === "tool_post") totals.tool_post += 1;
    if (event.kind === "tool_fail") totals.tool_fail += 1;
    if (event.owner === "native") {
      if (event.kind === "usage") totals.usage_events += 1;
      if (event.tokens) {
        const tokens = sumOf(event.tokens);
        addTokens(totals.observed, tokens);
        if (event.token_quality === "ESTIMATED") addTokens(totals.observed_estimated, tokens);
      } else if (event.kind === "usage") {
        totals.events_without_tokens += 1;
      }
    } else if (event.owner === "te") {
      if (event.kind === "te_overhead" && event.tokens) addTokens(totals.te_overhead, sumOf(event.tokens));
      if (event.kind === "te_injection") {
        totals.te_injection_attributed += event.attributed_input_tokens ?? 0;
        session.lessons.push({ event_id: event.event_id, attributed_input_tokens: event.attributed_input_tokens, token_quality: event.token_quality, estimate: null, ref: event.payload_ref });
      }
    } else if (event.tokens) {
      addTokens(totals.other_owner, sumOf(event.tokens));
    }
  }

  // Journey counts: the newest verdict per (session, question) is filed under the case of that verdict's event.
  // "undefined" (declared, never observed in the session) is added once per session, under the first case the
  // session appears in, so the sums below stay exact.
  for (const [caseId, bySession] of cases) {
    for (const [key, draft] of bySession) {
      const journeys: Record<string, JourneyCounts> = {};
      const slot = (name: string) => (journeys[name] ??= { match: 0, mismatch: 0, undefined: 0 });
      const perSession = verdicts.get(key) ?? new Map();
      for (const [base, verdict] of perSession) {
        if (verdict.caseId === caseId) slot(journeyOf(base)!.journey)[verdict.exit === 0 ? "match" : "mismatch"] += 1;
      }
      if ([...sessionCases.get(key)!][0] === caseId) {
        for (const [base, journey] of declared) if (!perSession.has(base)) slot(journey).undefined += 1;
      }
      draft.model.totals.journeys = journeys;
    }
  }

  // 4. Roll up.
  const caseModels: CaseModel[] = [];
  for (const [caseId, bySession] of cases) {
    const sessions = [...bySession.values()].map((d) => d.model);
    sessions.sort((a, b) => (a.first_ts ?? "").localeCompare(b.first_ts ?? "") || a.runtime.localeCompare(b.runtime) || a.native_session_id.localeCompare(b.native_session_id));
    const totals = zeroTotals();
    for (const session of sessions) {
      session.overhead_pct = overheadPct(session.totals);
      addTotals(totals, session.totals);
    }
    caseModels.push({ case_id: caseId, totals, overhead_pct: overheadPct(totals), sessions });
  }
  // Bound cases by id, the unbound case last.
  caseModels.sort((a, b) => (a.case_id === null ? 1 : 0) - (b.case_id === null ? 1 : 0) || (a.case_id ?? "").localeCompare(b.case_id ?? ""));
  const totals = zeroTotals();
  for (const item of caseModels) addTotals(totals, item.totals);

  // 5. Unattributed usage: the unbound case's native usage, repeated as its own line.
  const unbound = caseModels.find((item) => item.case_id === null);
  const unattributed_usage = {
    events: unbound?.totals.usage_events ?? 0,
    observed: unbound ? { ...unbound.totals.observed } : zeroTokens(),
    observed_estimated: unbound ? { ...unbound.totals.observed_estimated } : zeroTokens(),
  };

  // 6. Residuals from the projection export (rows of sxr_residual are the ones with `residual_kind`).
  const residuals: ResidualSummary = { total: 0, by_kind: Object.fromEntries(RESIDUAL_KINDS.map((kind) => [kind, 0])) };
  const residualSeen = new Set<string>();
  for (const row of projectionRows) {
    if (!isObject(row)) continue;
    const kind = str(row.residual_kind);
    if (kind === null) continue;
    const id = str(row.residual_id) ?? JSON.stringify(row);
    if (residualSeen.has(id)) continue;
    residualSeen.add(id);
    residuals.total += 1;
    residuals.by_kind[kind] = (residuals.by_kind[kind] ?? 0) + 1;
  }

  // 7. Ablation: only when events carry an arm other than none.
  const armSessions = new Map<string, Set<string>>();
  const armTotals = new Map<string, { observed_total: number; events: number }>();
  for (const { event } of events) {
    if (!event.arm || event.arm === "none") continue;
    (armSessions.get(event.arm) ?? armSessions.set(event.arm, new Set()).get(event.arm)!).add(sessionKey(event));
    const slot = armTotals.get(event.arm) ?? { observed_total: 0, events: 0 };
    armTotals.set(event.arm, slot);
    slot.events += 1;
    if (event.owner === "native" && event.tokens) slot.observed_total += sumOf(event.tokens).total;
  }
  const ablationRows: AblationRow[] = [...armSessions.keys()].sort().map((arm) => ({ arm, sessions: armSessions.get(arm)!.size, observed_total: armTotals.get(arm)!.observed_total, events: armTotals.get(arm)!.events }));

  return {
    schema: ECONOMICS_SCHEMA,
    totals,
    overhead_pct: overheadPct(totals),
    cases: caseModels,
    unattributed_usage,
    residuals,
    declared_journey_questions: declared.size,
    ablation: { run: ablationRows.length > 0, rows: ablationRows },
    audit,
  };
}

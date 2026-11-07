/**
 * Seed data for the Horizon TEST setup (technical annex J.2). Nothing is drawn onto a screen: every row is made through a real
 * interface: case-keeper calls, the `realitytrace` CLI (and `RealityTraceObligation`), the Horizon store, and `gh` against the
 * sandbox repository.
 *
 *   bun run scripts/seed.ts                 make the seed (running it twice changes nothing)
 *   bun run scripts/seed.ts --status        print each seeded part and whether it is present
 *   bun run scripts/seed.ts --clear [--yes] show the full setup-clear list, ask, clear the test setup, then set it up empty again
 *
 * Run it through `just seed`, `just seed-status`, `just seed-clear` and `just seed-reset`: they load the test setup's environment.
 *
 * It refuses unless HORIZON_SETUP=testing, the test setup's SETUP.json exists and says `testing`. It never touches production
 * or the personal record. GitHub writes go only to the sandbox repository named in `<root>/github.json`.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { hostname, homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import * as net from "node:net";
import { createInterface } from "node:readline";
import type { DurableStore } from "@godspeedai/cognate-events";
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import { SANDBOX_REPO, argValue, readMarker, setupMapping, setupTenant, type SetupMapping } from "../src/config/setup.ts";
import { configFromDocument, operatorPrincipal } from "../src/config/load.ts";
import { RealityTraceObligation, type DeclaredThreshold } from "../src/adapters/realitytrace-obligation.ts";
import { seaForgeCall } from "../src/adapters/sea-forge-approvals.ts";
import { reasonOf } from "../src/adapters/sea-forge-case.ts";
import { runChild } from "../src/adapters/run-child.ts";
import { saveNote, search, type Who } from "../src/capabilities/notes.ts";
import { listLabels, putLabel } from "../src/capabilities/labels.ts";
import { listSessions } from "../src/ui/workspace/compare-model.ts";
import { reduceRows } from "../src/adapters/ledger-day.ts";
import { intakeFrame, issueRef, requestIdFor, stepIdFor } from "../connectors/github/mapping.ts";
import { gh as ghRun, type GhResult } from "./setup-github.ts";
import { run as setupClear } from "./setup-clear.ts";
import { run as setupInit } from "./setup-init.ts";
import {
  ACTIVITY_QUESTION, CASES, HANDOFF, ISSUE, LABELS, NOTES, OBLIGATIONS, OPERATOR_ACTOR, POLICY, PROPOSAL, RECORD_RUNTIME, SERVICE_ACTOR, SESSIONS, TEMPLATES, UNSEEN_JOURNEY,
  type SeedCase, type SeedSession,
} from "./seed-data/data.ts";

const here = dirname(import.meta.path);
// Fallback only: ignite now writes this rule. This covers cells written before that change.
// The rules the seed needs in the test setup's rules file: the operator adds steps and marks waiting steps done.
const POLICY_RULES: readonly { readonly kind: string; readonly line: string }[] = [
  { kind: "discretionary_task_add", line: "  - { name: operator-adds-steps, verdict: allow, actor_role: operator, operation_kind: discretionary_task_add }" },
  { kind: "human_task_completion", line: "  - { name: operator-finishes-steps, verdict: allow, actor_role: operator, operation_kind: human_task_completion }" },
];
const missingRules = (text: string) => POLICY_RULES.filter((r) => !text.includes(`operation_kind: ${r.kind}`));

/** A refusal: said in words, exit 1, nothing written. */
export class SeedRefused extends Error {
  override readonly name = "SeedRefused";
}

export interface IO {
  out(line: string): void;
  err(line: string): void;
}

// ---------------------------------------------------------------------------------------------------- the ports

export interface KeeperPort {
  /** One SFWP request. `asOperator` sends it as the service on behalf of the operator; otherwise as the service alone. */
  call(request: Record<string, unknown>, options?: { readonly asOperator?: boolean }): Promise<Record<string, unknown>>;
}
export interface TemplatePort {
  /** Names of the seed templates the case keeper can read. */
  present(): string[];
  /** Copies the seed templates where the case keeper reads them. Returns the names newly written. */
  install(): string[];
  /** Whether the test cell's policy lets the operator add steps to a case (`discretionary_task_add`). */
  policyAllowsAdd(): boolean;
  /** Adds that one rule to the test cell's own policy.yaml when it is missing. Returns true when it wrote. */
  allowAdd(): boolean;
}
export interface GithubPort {
  readonly repo: string;
  findIssue(title: string): Promise<{ number: number; url: string } | null>;
  createIssue(title: string, body: string): Promise<{ number: number; url: string }>;
  onBoard(url: string): Promise<boolean>;
  addToBoard(url: string): Promise<void>;
}
export interface LedgerRow {
  readonly append_ordinal?: number;
  readonly ledger_id?: string;
  readonly record_kind?: string;
  readonly payload?: any;
}
export interface AgentEventLine {
  readonly [field: string]: unknown;
}
export interface RecordsPort {
  ledger(): Promise<LedgerRow[]>;
  declareObligation(input: { intentId: string; statement: string; target: string }): Promise<void>;
  runObligation(intentId: string, argv: readonly string[], target: string): Promise<void>;
  declareJourney(questionId: string, title: string): Promise<void>;
  /** The run for a declared question: begins it and its plan once; later calls return the same run. */
  openRun(questionId: string): Promise<string>;
  ingest(runId: string, events: readonly AgentEventLine[]): Promise<void>;
}
export interface Ports {
  readonly keeper: KeeperPort;
  readonly templates: TemplatePort;
  readonly github: GithubPort;
  readonly records: RecordsPort;
  readonly store: DurableStore;
}
export interface Context {
  readonly ports: Ports;
  readonly who: Who;
  readonly timeZone: string;
  readonly now: () => Date;
  readonly io: IO;
}

// ---------------------------------------------------------------------------------------------------- the guard

export interface Guarded {
  readonly mapping: SetupMapping;
}

/** The seed runs only in the test setup. Everything else is refused before anything is read or written. */
export function guard(env: Record<string, string | undefined>): Guarded {
  if (env.HORIZON_SETUP !== "testing") {
    throw new SeedRefused(`the seed runs only in the test setup. HORIZON_SETUP is ${env.HORIZON_SETUP ? JSON.stringify(env.HORIZON_SETUP) : "not set"}. Use "just seed", which loads the test setup.`);
  }
  const mapping = setupMapping("testing", env);
  const marker = readMarker(mapping);
  if (!marker) throw new SeedRefused(`the test setup's marker ${mapping.marker} is missing or unreadable. Run: bun run scripts/setup-init.ts --setup testing`);
  if (marker.name !== "testing") throw new SeedRefused(`${mapping.marker} says "${marker.name}", not "testing".`);
  if (resolve(marker.root) !== resolve(mapping.root)) throw new SeedRefused(`${mapping.marker} names the root ${marker.root}, not ${mapping.root}.`);
  return { mapping };
}

const inside = (root: string, path: string): boolean => {
  const rel = resolve(path).slice(resolve(root).length);
  return resolve(path).startsWith(resolve(root)) && (rel === "" || rel.startsWith("/"));
};

// ---------------------------------------------------------------------------------------------------- small helpers

const isObject = (value: unknown): value is Record<string, any> => value !== null && typeof value === "object" && !Array.isArray(value);

function failed(reply: Record<string, unknown>): string | null {
  if (reply.ok === false || typeof reply.error === "string" || typeof reply.error_class === "string") {
    return `${typeof reply.error_class === "string" ? reply.error_class : "error"}: ${reasonOf(reply) ?? "no reason given"}`;
  }
  return null;
}

async function keeperOk(ctx: Context, request: Record<string, unknown>, asOperator = false): Promise<Record<string, unknown>> {
  let reply: Record<string, unknown>;
  try {
    reply = await ctx.ports.keeper.call(request, { asOperator });
  } catch (error) {
    throw new SeedRefused(`the case keeper could not be reached (${error instanceof Error ? error.message : String(error)}). Is the test setup running?`);
  }
  const why = failed(reply);
  if (why !== null) throw new SeedRefused(`the case keeper refused ${String(request.verb)}${request.request_id ? ` (${String(request.request_id)})` : ""}: ${why}`);
  return reply;
}

interface Step {
  readonly plan_item_id: string;
  readonly execution: string;
  readonly settlement: string;
  readonly name: string;
}

/** Every case with its steps, read only. A seeded case is found by the step its template makes. */
async function casesWithSteps(ctx: Context): Promise<{ case_id: string; steps: Step[] }[]> {
  const listed = await keeperOk(ctx, { verb: "case_list" });
  const out: { case_id: string; steps: Step[] }[] = [];
  for (const row of Array.isArray(listed.cases) ? listed.cases : []) {
    if (!isObject(row) || typeof row.case_id !== "string") continue;
    const horizon = await ctx.ports.keeper.call({ verb: "case_get_horizon", case_id: row.case_id }).catch(() => ({}) as Record<string, unknown>);
    const items = Array.isArray(horizon.items) ? horizon.items : [];
    out.push({
      case_id: row.case_id,
      steps: items.flatMap((item): Step[] => (isObject(item) && typeof item.plan_item_id === "string" ? [{ plan_item_id: item.plan_item_id, execution: String(item.execution ?? ""), settlement: String(item.settlement ?? ""), name: String(item.name ?? "") }] : [])),
    });
  }
  return out;
}

const caseOf = (all: { case_id: string; steps: Step[] }[], seeded: SeedCase) => all.find((c) => c.steps.some((s) => s.plan_item_id === seeded.step_id));

/** The day a number of days back, as an instant at 15:00 UTC (the same local day in the Americas and Europe). Today is `now`. */
export function atDaysAgo(now: Date, daysAgo: number): Date {
  if (daysAgo === 0) return now;
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo, 15, 0, 0));
  return d;
}
const dayOf = (at: Date, timeZone: string): string => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);

// ---------------------------------------------------------------------------------------------------- the parts

export interface Part {
  readonly name: string;
  readonly present: boolean;
  readonly detail: string;
}

async function ensureCase(ctx: Context, seeded: SeedCase): Promise<string> {
  const pre = await keeperOk(ctx, { verb: "case_preflight", template_ref: seeded.template, params: {} });
  if (pre.ok !== true) throw new SeedRefused(`template ${seeded.template} is not valid: ${reasonOf({ errors: pre.errors }) ?? "no reason given"}`);
  const plan = isObject(pre.plan_precondition) ? pre.plan_precondition : null;
  if (!plan || typeof plan.ref !== "string" || typeof plan.expected_digest !== "string") throw new SeedRefused(`template ${seeded.template}: the case keeper gave no plan digest`);
  const done = await keeperOk(
    ctx,
    { verb: "case_commit", template_ref: seeded.template, params: {}, request_id: seeded.request_id, preconditions: { records: [{ ref: plan.ref, expected_digest: plan.expected_digest }] } },
    true,
  );
  if (typeof done.case_id !== "string") throw new SeedRefused(`case_commit for ${seeded.request_id} gave no case id`);
  return done.case_id;
}

async function addStep(ctx: Context, caseId: string, item: Record<string, unknown>, requestId: string, asOperator: boolean): Promise<void> {
  await keeperOk(ctx, { verb: "case_add_item", case_id: caseId, item, policy: POLICY, request_id: requestId }, asOperator);
}

async function seedCases(ctx: Context): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const seeded of CASES) {
    const id = await ensureCase(ctx, seeded);
    ids.set(seeded.key, id);
    ctx.io.out(`  case ${seeded.label}: ${id}`);
  }
  return ids;
}

async function seedGithub(ctx: Context, triageCase: string): Promise<{ url: string; ref: string }> {
  const gh = ctx.ports.github;
  let issue = await gh.findIssue(ISSUE.title);
  if (!issue) issue = await gh.createIssue(ISSUE.title, ISSUE.body);
  ctx.io.out(`  GitHub issue: ${issue.url}`);
  if (!(await gh.onBoard(issue.url))) await gh.addToBoard(issue.url);
  // The same frame the GitHub connector sends, so the connector finding this issue later replays it and adds nothing.
  const { frame } = intakeFrame({ caseId: triageCase, repo: gh.repo, issue: { number: issue.number, title: ISSUE.title, body: ISSUE.body, state: "open", html_url: issue.url, labels: ["horizon"] } });
  await keeperOk(ctx, frame, true);
  return { url: issue.url, ref: issueRef(gh.repo, issue.number) };
}

// ----- records

const ledgerHasQuestion = (rows: readonly LedgerRow[], question: string): boolean =>
  rows.some((r) => r.record_kind === "question.declared" && (r.payload?.representations ?? []).some((x: any) => x?.inline_content?.question_id === question));
const ledgerHasRun = (rows: readonly LedgerRow[], question: string): boolean => rows.some((r) => r.record_kind === "run.started" && (r.payload?.provenance_refs ?? []).includes(`question:${question}`));
const ledgerHasSession = (rows: readonly LedgerRow[], session: string): boolean => rows.some((r) => r.record_kind === "observation.recorded" && r.payload?.extensions?.agent_event?.native_session_id === session);

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");

function eventsFor(session: SeedSession, base: Date): AgentEventLine[] {
  const common = { schema: "agent-event/v1", source: "owner_output", runtime: RECORD_RUNTIME, native_session_id: session.id, case_id: "unknown", unit_id: "unknown", te_session_id: "unknown", role: "user", arm: "none", repo: "seed", worktree: "seed", branch: "main", tokens: null, token_quality: "UNAVAILABLE", owner: "native" };
  const events: AgentEventLine[] = [];
  const stamp = (n: number) => new Date(base.getTime() + n * 60_000).toISOString().replace(/\.\d+Z$/, ".000Z");
  const add = (ref: string, kind: string, n: number, payload_ref: string, exit_code: number) => {
    const ts = stamp(n);
    events.push({ ...common, event_id: sha(`${RECORD_RUNTIME}|${session.id}|${ref}|${kind}`), native_event_ref: ref, kind, ts, observed_at: ts, payload_ref, exit_code });
  };
  session.tools.forEach((tool, i) => add(`tool-${i + 1}`, tool.exit === 0 ? "tool_post" : "tool_fail", i, `seed:tool:${session.id}:${i + 1}:${tool.name}`, tool.exit));
  if (session.question !== null && session.check_exit !== null) add("check-1", "journey_check", session.tools.length, `journey:${session.question}`, session.check_exit);
  return events;
}

async function seedRecords(ctx: Context): Promise<void> {
  const rec = ctx.ports.records;
  let rows = await rec.ledger();
  for (const o of OBLIGATIONS) {
    if (!ledgerHasQuestion(rows, `q-${o.intentId}`)) await rec.declareObligation({ intentId: o.intentId, statement: o.statement, target: o.target });
    rows = await rec.ledger();
    if (o.argv !== null && !ledgerHasRun(rows, `q-${o.intentId}`)) await rec.runObligation(o.intentId, o.argv, o.target);
    rows = await rec.ledger();
    ctx.io.out(`  record ${o.id}: ${o.expect}`);
  }
  const questions = [...SESSIONS.flatMap((s) => (s.question === null ? [] : [{ question: s.question, title: s.title }])), { question: UNSEEN_JOURNEY.question, title: UNSEEN_JOURNEY.title }, { question: ACTIVITY_QUESTION.question, title: ACTIVITY_QUESTION.title }];
  for (const q of questions) {
    if (!ledgerHasQuestion(rows, q.question)) await rec.declareJourney(q.question, q.title);
  }
  rows = await rec.ledger();
  for (const s of SESSIONS) {
    if (!ledgerHasSession(rows, s.id)) {
      const run = await rec.openRun(s.question ?? ACTIVITY_QUESTION.question);
      await rec.ingest(run, eventsFor(s, new Date(atDaysAgo(ctx.now(), s.daysAgo).getTime() - 2 * 3_600_000)));
      rows = await rec.ledger();
    }
    ctx.io.out(`  record ${s.id}: ${s.expect}`);
  }
  ctx.io.out(`  record ${UNSEEN_JOURNEY.question}: expected but not seen`);
}

// ----- notes and labels

function noteBody(text: string, ids: Map<string, string>, day1: string): string {
  return text.replace(/\{case:(\w+)\}/g, (_m, key: string) => ids.get(key) ?? key).replace("{day1}", day1);
}

async function existingSeedNotes(ctx: Context): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const note of await search(ctx.ports.store, ctx.who, { tag: "seed", limit: 1000 })) {
    const first = note.body.split("\n")[0] ?? "";
    found.set(first, note.note_id);
  }
  return found;
}

async function seedNotes(ctx: Context, ids: Map<string, string>): Promise<void> {
  const have = await existingSeedNotes(ctx);
  const day1 = dayOf(atDaysAgo(ctx.now(), 1), ctx.timeZone);
  for (const n of NOTES) {
    if (have.has(n.title)) continue;
    const input = { body: `${n.title}\n${noteBody(n.text, ids, day1)}`, tags: [...n.tags], ...(n.on_case ? { case_ref: ids.get(n.on_case) ?? null } : {}) };
    // The note's day is taken from the time it is saved at, so a back-dated note is saved at that time.
    await saveNote(ctx.ports.store, { ...ctx.who, input, now: atDaysAgo(ctx.now(), n.daysAgo), timeZone: ctx.timeZone });
  }
  ctx.io.out(`  notes: ${NOTES.length} on ${new Set(NOTES.map((n) => n.daysAgo)).size} days`);
}

async function seedLabels(ctx: Context): Promise<void> {
  const sessions = listSessions(reduceRows(await ctx.ports.records.ledger()));
  const current = await listLabels(ctx.ports.store, ctx.who.tenant);
  for (const label of LABELS) {
    const session = sessions.find((s) => s.session_id === label.session);
    if (!session) throw new SeedRefused(`label for ${label.session}: that session is not in the test record`);
    const existing = current.find((c) => c.session_id === session.session_id && c.event_id === session.event_id);
    if (existing && existing.verdict === label.verdict && existing.first_failure === label.first_failure) continue;
    await putLabel(ctx.ports.store, { tenant: ctx.who.tenant, operator: ctx.who.operator, session_id: session.session_id, event_id: session.event_id, record_seq: session.record_seq, verdict: label.verdict, first_failure: label.first_failure, now: ctx.now() });
  }
  ctx.io.out(`  labels: ${LABELS.map((l) => `${l.session}=${l.verdict}`).join(", ")}`);
}

// ---------------------------------------------------------------------------------------------------- seed and status

export async function seed(ctx: Context): Promise<{ cases: Map<string, string>; issue: { url: string; ref: string } }> {
  ctx.io.out("Seeding the test setup:");
  const installed = ctx.ports.templates.install();
  ctx.io.out(`  templates: ${installed.length === 0 ? "already installed" : `installed ${installed.join(", ")}`}`);
  // Adding a step (GitHub issue, hand off, proposal) is a decision the cell's policy must allow for the operator.
  ctx.io.out(`  policy: ${ctx.ports.templates.allowAdd() ? "added the rule that lets the operator add steps (discretionary_task_add) to the test cell's policy.yaml" : "operator may add steps"}`);
  const cases = await seedCases(ctx);
  const triage = cases.get("triage")!;
  const issue = await seedGithub(ctx, triage);
  await addStep(ctx, triage, HANDOFF.item, HANDOFF.request_id, true);
  ctx.io.out(`  hand off step: ${HANDOFF.request_id}`);
  await addStep(ctx, triage, PROPOSAL.item, PROPOSAL.request_id, false);
  ctx.io.out(`  agent proposal step: ${PROPOSAL.request_id}`);
  // An added step stays pending until the case is advanced. The id is fixed, so a second run replays and changes nothing.
  await keeperOk(ctx, { verb: "case_advance", case_id: triage, policy: POLICY, request_id: `advance:seed:${triage}:3` }, true);
  ctx.io.out("  triage case advanced: the added steps are started");
  await seedRecords(ctx);
  await seedNotes(ctx, cases);
  await seedLabels(ctx);
  ctx.io.out("Done. Running it again changes nothing.");
  return { cases, issue };
}

export async function status(ctx: Context): Promise<Part[]> {
  const parts: Part[] = [];
  const add = (name: string, present: boolean, detail = "") => parts.push({ name, present, detail });
  const templates = ctx.ports.templates.present();
  add("policy lets the operator add steps", ctx.ports.templates.policyAllowsAdd(), "discretionary_task_add in the test cell's policy.yaml");
  add("templates", TEMPLATES.every((t) => templates.includes(t)), TEMPLATES.map((t) => `${t}${templates.includes(t) ? "" : " (missing)"}`).join(", "));
  let all: { case_id: string; steps: Step[] }[] = [];
  let keeperError: string | null = null;
  try {
    all = await casesWithSteps(ctx);
  } catch (error) {
    keeperError = error instanceof Error ? error.message : String(error);
  }
  const triage = caseOf(all, CASES[1]!);
  const release = caseOf(all, CASES[0]!);
  for (const [seeded, found] of [[CASES[0]!, release], [CASES[1]!, triage]] as const) add(`case ${seeded.key}`, found !== undefined, found?.case_id ?? keeperError ?? "not found");
  const stepIn = (c: typeof triage, id: string) => c?.steps.find((s) => s.plan_item_id === id);
  const issue = await ctx.ports.github.findIssue(ISSUE.title).catch(() => null);
  add("GitHub issue", issue !== null, issue?.url ?? "not found");
  add("GitHub issue on the test board", issue !== null && (await ctx.ports.github.onBoard(issue.url).catch(() => false)), "");
  const ghStep = issue ? stepIn(triage, stepIdFor(ctx.ports.github.repo, issue.number)) : undefined;
  add("step from the GitHub issue", ghStep !== undefined, issue ? requestIdFor(ctx.ports.github.repo, issue.number) : "needs the issue");
  add("step handed off", stepIn(triage, HANDOFF.item.plan_item_id) !== undefined, HANDOFF.request_id);
  add("step proposed by an agent", stepIn(triage, PROPOSAL.item.plan_item_id) !== undefined, PROPOSAL.request_id);
  const signoff = stepIn(release, CASES[0]!.step_id);
  add("decision waiting for the operator", signoff !== undefined && signoff.execution === "active" && signoff.settlement === "unsettled", signoff ? `${signoff.name} (${signoff.execution}, ${signoff.settlement})` : "not found");

  let rows: LedgerRow[] = [];
  let recordError: string | null = null;
  try {
    rows = await ctx.ports.records.ledger();
  } catch (error) {
    recordError = error instanceof Error ? error.message : String(error);
  }
  for (const o of OBLIGATIONS) {
    const declared = ledgerHasQuestion(rows, `q-${o.intentId}`);
    const ran = ledgerHasRun(rows, `q-${o.intentId}`);
    add(`record ${o.id}`, declared && (o.argv === null ? !ran : ran), `${o.expect}${recordError ? ` (${recordError})` : ""}`);
  }
  for (const s of SESSIONS) add(`record ${s.id}`, ledgerHasSession(rows, s.id), `${s.expect}${recordError ? ` (${recordError})` : ""}`);
  add(`record ${UNSEEN_JOURNEY.question}`, ledgerHasQuestion(rows, UNSEEN_JOURNEY.question) && !ledgerHasRun(rows, UNSEEN_JOURNEY.question), "expected but not seen");

  const notes = await existingSeedNotes(ctx);
  const noteCount = NOTES.filter((n) => notes.has(n.title)).length;
  add("notes", noteCount === NOTES.length, `${noteCount} of ${NOTES.length} on ${new Set(NOTES.map((n) => n.daysAgo)).size} days`);
  const sessions = listSessions(reduceRows(rows));
  const labels = await listLabels(ctx.ports.store, ctx.who.tenant);
  const labelled = LABELS.filter((l) => {
    const session = sessions.find((s) => s.session_id === l.session);
    return session !== undefined && labels.some((x) => x.session_id === session.session_id && x.event_id === session.event_id && x.verdict === l.verdict);
  }).length;
  add("labels", labelled === LABELS.length, `${labelled} of ${LABELS.length}`);
  return parts;
}

export function printStatus(parts: readonly Part[], io: IO): void {
  io.out("Seed status (test setup):");
  for (const p of parts) io.out(`  ${p.present ? "present" : "MISSING"}  ${p.name}${p.detail ? `  ${p.detail}` : ""}`);
  const missing = parts.filter((p) => !p.present).length;
  io.out(missing === 0 ? `All ${parts.length} parts are present.` : `${missing} of ${parts.length} parts are missing. Run: just seed`);
}

// ---------------------------------------------------------------------------------------------------- clear

export interface ClearDeps {
  readonly clear: typeof setupClear;
  readonly init: typeof setupInit;
  /** Something is running from the test setup (the case keeper's socket answers or Horizon's port answers). */
  readonly running: (mapping: SetupMapping, env: Record<string, string | undefined>) => Promise<string[]>;
  /** The line the person typed. */
  readonly ask: (question: string) => Promise<string>;
}

function probe(options: net.NetConnectOpts): Promise<boolean> {
  return new Promise((done) => {
    const socket = net.connect(options);
    const finish = (up: boolean) => {
      socket.destroy();
      done(up);
    };
    socket.setTimeout(700, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

export async function liveRunning(mapping: SetupMapping, env: Record<string, string | undefined>): Promise<string[]> {
  const found: string[] = [];
  const socket = env.SEA_FORGE_SOCKET?.trim() || mapping.socket;
  if (existsSync(socket) && (await probe({ path: socket }))) found.push(`the case keeper (${socket})`);
  if (await probe({ host: "127.0.0.1", port: mapping.horizonPort })) found.push(`Horizon (http://127.0.0.1:${mapping.horizonPort})`);
  if (await probe({ host: "127.0.0.1", port: mapping.workshopPort })) found.push(`the workshop (http://127.0.0.1:${mapping.workshopPort})`);
  return found;
}

const liveAsk = (question: string): Promise<string> =>
  new Promise((done) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      done(answer);
    });
    rl.once("close", () => done(""));
  });

export const liveClearDeps: ClearDeps = { clear: setupClear, init: setupInit, running: liveRunning, ask: liveAsk };

/** Clears the test setup (never production, never the personal record), then sets it up empty again. */
export async function clearTestSetup(args: readonly string[], env: Record<string, string | undefined>, io: IO, deps: ClearDeps = liveClearDeps): Promise<number> {
  let mapping: SetupMapping;
  try {
    ({ mapping } = guard(env));
  } catch (error) {
    io.err(`seed-clear: refused: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  io.out("This is everything setup-clear would delete from the TEST setup:");
  // Without --yes setup-clear only prints the full list. It is always called for the testing setup and nothing else.
  const listed = deps.clear(["--setup", "testing"], env, io.out, io.err);
  if (listed !== 0) {
    io.err("seed-clear: setup-clear refused the list above, so nothing was deleted.");
    return 1;
  }
  const up = await deps.running(mapping, env);
  if (up.length > 0) {
    io.err(`seed-clear: stop the test setup first. Still running: ${up.join("; ")}.`);
    io.err("  Case keeper and Horizon: Ctrl-C the terminal running `ignite` (it stops its children).");
    io.err("  Workshop: cognate-workbench stop, with the test setup's COGNATE_WORKBENCH_HOME.");
    io.err("  Nothing was deleted: files are not removed from under a running service.");
    return 1;
  }
  if (!args.includes("--yes")) {
    const answer = (await deps.ask("Type yes to delete everything listed above and set the test setup up empty again: ")).trim();
    if (answer !== "yes") {
      io.out("Nothing deleted.");
      return 1;
    }
  }
  const cleared = deps.clear(["--setup", "testing", "--yes"], env, io.out, io.err);
  if (cleared !== 0) {
    io.err("seed-clear: the clear did not finish (see above). The test setup may be partly cleared. Fix the cause, then run it again.");
    return 1;
  }
  const made = deps.init(["--setup", "testing"], env, io.out, io.err);
  if (made !== 0) {
    io.err("seed-clear: the setup was cleared but setup-init failed. Run: bun run scripts/setup-init.ts --setup testing");
    return 1;
  }
  io.out("The test setup is cleared and empty again. Run: just seed");
  return 0;
}

// ---------------------------------------------------------------------------------------------------- the live ports

/** The newest provisioned RealityTrace (it knows the agent-event format), else the one on PATH. `REALITYTRACE_BIN` wins. */
export function realityTraceBin(env: Record<string, string | undefined>): string {
  if (env.REALITYTRACE_BIN?.trim()) return env.REALITYTRACE_BIN.trim();
  const base = join(homedir(), ".agents", "opt", "realitytrace");
  try {
    const dirs = readdirSync(base)
      .map((d) => join(base, d, "bin", "realitytrace"))
      .filter((p) => existsSync(p))
      .map((p) => ({ p, t: Bun.file(p).lastModified }))
      .sort((a, b) => b.t - a.t);
    if (dirs[0]) return dirs[0].p;
  } catch {
    // none provisioned
  }
  return Bun.which("realitytrace") ?? "realitytrace";
}

function keeperPort(socketPath: string): KeeperPort {
  return {
    call: (request, options) => seaForgeCall(socketPath, { ...request, actor: SERVICE_ACTOR, ...(options?.asOperator ? { on_behalf_of: OPERATOR_ACTOR } : {}) }, 15_000),
  };
}

function templatePort(cell: string): TemplatePort {
  const dir = join(cell, "templates");
  const source = join(here, "seed-data", "templates");
  const policy = join(cell, POLICY);
  const file = (name: string) => `${name}.yaml`;
  return {
    present: () => TEMPLATES.filter((t) => existsSync(join(dir, file(t)))),
    install() {
      mkdirSync(dir, { recursive: true });
      const written: string[] = [];
      for (const t of TEMPLATES) {
        const from = join(source, file(t));
        const to = join(dir, file(t));
        if (existsSync(to) && readFileSync(to, "utf8") === readFileSync(from, "utf8")) continue;
        copyFileSync(from, to);
        written.push(t);
      }
      return written;
    },
    policyAllowsAdd: () => existsSync(policy) && missingRules(readFileSync(policy, "utf8")).length === 0,
    allowAdd() {
      if (!existsSync(policy)) throw new SeedRefused(`${policy} does not exist. Start the test setup once (ignite writes it), then seed.`);
      const text = readFileSync(policy, "utf8");
      const missing = missingRules(text);
      if (missing.length === 0) return false;
      // The case keeper rereads this file on every decision. It is the test setup's own copy; production is never touched.
      writeFileSync(policy, `${text.endsWith("\n") ? text : `${text}\n`}${missing.map((r) => `${r.line}\n`).join("")}`);
      return true;
    },
  };
}

function githubPort(root: string, env: Record<string, string | undefined>): GithubPort {
  const config = JSON.parse(readFileSync(join(root, "github.json"), "utf8")) as { repo?: string; projectNumber?: number };
  if (config.repo !== SANDBOX_REPO) throw new SeedRefused(`github.json names ${JSON.stringify(config.repo)}; the seed writes only to ${SANDBOX_REPO}.`);
  const repo = config.repo;
  const owner = repo.split("/")[0]!;
  const project = config.projectNumber;
  const gh = (args: string[]): GhResult => ghRun(args, env);
  const must = (r: GhResult, what: string): string => {
    if (r.code !== 0) throw new SeedRefused(`gh ${what} failed: ${r.stderr.trim().split("\n")[0] ?? ""}`);
    return r.stdout;
  };
  return {
    repo,
    async findIssue(title) {
      const rows = JSON.parse(must(gh(["issue", "list", "-R", repo, "--state", "all", "--json", "number,title,url", "--limit", "200"]), "issue list")) as { number: number; title: string; url: string }[];
      const hit = rows.find((r) => r.title === title);
      return hit ? { number: hit.number, url: hit.url } : null;
    },
    async createIssue(title, body) {
      const labels = JSON.parse(must(gh(["label", "list", "-R", repo, "--json", "name", "--limit", "200"]), "label list")) as { name: string }[];
      if (!labels.some((l) => l.name === "horizon")) must(gh(["label", "create", "horizon", "-R", repo, "--color", "0E8A16", "--description", "Taken in by Horizon"]), "label create");
      const url = must(gh(["issue", "create", "-R", repo, "--title", title, "--body", body, "--label", "horizon"]), "issue create").trim().split("\n").pop()!;
      const number = Number(url.split("/").pop());
      if (!Number.isInteger(number)) throw new SeedRefused(`gh issue create printed no issue address: ${url.slice(0, 120)}`);
      return { number, url };
    },
    async onBoard(url) {
      if (project === undefined) return false;
      const list = JSON.parse(must(gh(["project", "item-list", String(project), "--owner", owner, "--format", "json", "--limit", "500"]), "project item-list")) as { items?: { content?: { url?: string } }[] };
      return (list.items ?? []).some((i) => i.content?.url === url);
    },
    async addToBoard(url) {
      if (project === undefined) throw new SeedRefused("github.json has no projectNumber, so the issue cannot be added to the test board.");
      must(gh(["project", "item-add", String(project), "--owner", owner, "--url", url]), "project item-add");
    },
  };
}

function recordsPort(mapping: SetupMapping, env: Record<string, string | undefined>): RecordsPort {
  const dataHome = env.COGNATE_REALITYTRACE_DATA_HOME?.trim() || mapping.horizonRecordData;
  const stateHome = env.COGNATE_REALITYTRACE_STATE_HOME?.trim() || mapping.horizonRecordState;
  for (const p of [dataHome, stateHome]) {
    if (!inside(mapping.root, p)) throw new SeedRefused(`the record folder ${p} is outside the test setup (${mapping.root}), so the seed will not write there.`);
  }
  const bin = realityTraceBin(env);
  const repoDir = join(mapping.cell, "realitytrace", "seed-repo");
  const obligation = new RealityTraceObligation({ bin, dataHome, stateHome, repoDir });
  const rt = async (args: readonly string[], stdin?: string): Promise<any> => {
    const result = await runChild([bin, ...args, "--json"], {
      cwd: repoDir,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "/", XDG_DATA_HOME: dataHome, XDG_STATE_HOME: stateHome },
      ...(stdin === undefined ? {} : { stdin }),
      timeoutMs: 120_000,
      maxBytes: 64 * 1024 * 1024,
    });
    if (result.code !== 0) throw new SeedRefused(`realitytrace ${args.slice(0, 2).join(" ")} failed (exit ${result.code}): ${(result.stderr || result.stdout).trim().slice(0, 300)}`);
    return JSON.parse(result.stdout);
  };
  // `RealityTraceObligation.repo()` looks a repository up by `path`/`root`, but `repo list` names it `filesystem_path`, so in a
  // new process it enrolls the same folder again. The seed finds its own repository first and hands the id to the adapter.
  let adopted = false;
  const repoId = async (): Promise<string> => {
    if (!adopted) {
      adopted = true;
      if (existsSync(join(repoDir, ".git"))) {
        const listed = (await rt(["repo", "list"])) as { repos?: { repo_id: string; filesystem_path?: string }[] };
        const known = (listed.repos ?? []).filter((r) => r.filesystem_path === repoDir).at(-1);
        if (known) (obligation as unknown as { repoId: string | null }).repoId = known.repo_id;
      }
    }
    return obligation.repo();
  };
  const ledger = async (): Promise<LedgerRow[]> => {
    // Reading never enrolls anything: no seed repository yet means nothing is seeded yet.
    if (!existsSync(join(repoDir, ".git"))) return [];
    const repo = await repoId();
    return (await rt(["ledger", "export", "--repo", repo])) as LedgerRow[];
  };
  const withFile = async <T>(content: unknown, body: (path: string) => Promise<T>): Promise<T> => {
    const { mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "horizon-seed-"));
    try {
      const path = join(dir, "doc.json");
      writeFileSync(path, JSON.stringify(content));
      return await body(path);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  return {
    ledger,
    async declareObligation(input) {
      await repoId();
      await obligation.declare({ intentId: input.intentId, statement: input.statement, target: input.target, criteria: { minimum_relevance: "medium", minimum_reliability: "medium" } });
    },
    async runObligation(intentId, argv, target) {
      await repoId();
      const rows = await ledger();
      const row = rows.find((r) => r.record_kind === "threshold.declared" && r.payload?.states?.[0]?.state_id === `t-${intentId}`);
      if (!row || row.ledger_id === undefined || row.append_ordinal === undefined) throw new SeedRefused(`threshold t-${intentId} is not in the record`);
      const threshold: DeclaredThreshold = { question_id: `q-${intentId}`, threshold_id: `t-${intentId}`, position: { ledger_id: row.ledger_id, ordinal: row.append_ordinal } };
      await obligation.run(threshold, argv, [], 30, { target, snapshot: "snapshot:horizon" });
    },
    async declareJourney(questionId, title) {
      const repo = await repoId();
      await withFile({ question_id: questionId, question_form: "is_true", question_type: "verification", target_entities: [], expected_answer_shape: "boolean", title }, (file) => rt(["question", "declare", "--repo", repo, "--file", file]));
      await withFile({ threshold_id: `${questionId}:threshold`, minimum_relevance: "medium", minimum_reliability: "medium" }, (file) => rt(["threshold", "declare", "--repo", repo, "--question", questionId, "--file", file]));
    },
    async openRun(questionId) {
      const repo = await repoId();
      const existing = (await ledger()).find((r) => r.record_kind === "run.started" && (r.payload?.provenance_refs ?? []).includes(`question:${questionId}`));
      const known = existing?.payload?.scope?.run_id;
      if (typeof known === "string") return known;
      const begun = (await rt(["run", "begin", "--repo", repo, "--snapshot", "snapshot:horizon", "--question", questionId, "--threshold", `${questionId}:threshold`])) as { run_id: string };
      await rt(["plan", "create", "--run", begun.run_id, "--verifier", `agent-tap/${RECORD_RUNTIME}`, "--target", `${questionId}:threshold`]);
      return begun.run_id;
    },
    async ingest(runId, events) {
      await rt(["ingest", "--run", runId, "--verifier", `agent-tap/${RECORD_RUNTIME}`, "--stdin-format", "agent-event-v1"], `${events.map((e) => JSON.stringify(e)).join("\n")}\n`);
    },
  };
}

export function livePorts(mapping: SetupMapping, env: Record<string, string | undefined>): { ports: Ports; who: Who; timeZone: string } {
  const configPath = env.HORIZON_CONFIG?.trim() || mapping.config;
  if (!inside(mapping.root, configPath)) throw new SeedRefused(`HORIZON_CONFIG ${configPath} is outside the test setup.`);
  const config = configFromDocument(Bun.TOML.parse(readFileSync(configPath, "utf8")));
  const storePath = env.HORIZON_STORE?.trim() || join(mapping.cell, "app.sqlite");
  if (!inside(mapping.root, storePath)) throw new SeedRefused(`the store ${storePath} is outside the test setup, so the seed will not write there.`);
  if (!existsSync(mapping.cell)) throw new SeedRefused(`${mapping.cell} does not exist. Start the test setup once (docs: start procedure), then seed.`);
  return {
    ports: {
      keeper: keeperPort(env.SEA_FORGE_SOCKET?.trim() || mapping.socket),
      templates: templatePort(mapping.cell),
      github: githubPort(mapping.root, env),
      records: recordsPort(mapping, env),
      store: openSqliteStore({ path: storePath }),
    },
    who: { tenant: setupTenant("testing", hostname()), operator: operatorPrincipal(config).id },
    timeZone: config.ui?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

// ---------------------------------------------------------------------------------------------------- main

export async function main(
  args: readonly string[],
  env: Record<string, string | undefined>,
  io: IO,
  deps: { readonly ports?: (mapping: SetupMapping, env: Record<string, string | undefined>) => { ports: Ports; who: Who; timeZone: string }; readonly clear?: ClearDeps; readonly now?: () => Date } = {},
): Promise<number> {
  if (args.includes("--clear")) return clearTestSetup(args, env, io, deps.clear);
  if (argValue(args, "setup") !== undefined && argValue(args, "setup") !== "testing") {
    io.err("seed: refused: only the test setup can be seeded.");
    return 1;
  }
  try {
    const { mapping } = guard(env);
    const built = (deps.ports ?? livePorts)(mapping, env);
    const ctx: Context = { ...built, now: deps.now ?? (() => new Date()), io };
    if (args.includes("--status")) {
      printStatus(await status(ctx), io);
      return 0;
    }
    await seed(ctx);
    return 0;
  } catch (error) {
    if (error instanceof SeedRefused) {
      io.err(`seed: refused: ${error.message}`);
      return 1;
    }
    io.err(`seed: failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (import.meta.main) process.exit(await main(process.argv.slice(2), process.env, { out: console.log, err: console.error }));

/**
 * The GitHub connector (technical annex, Stage 4). Start:
 *   set -a && eval "$(bun run scripts/setup-env.ts testing --service connector)" && set +a && bun run connectors/github/index.ts
 *
 * In:  an issue labelled `horizon` in the setup's repository becomes a case step through `case_add_item` with
 *      `request_id = github:<owner>/<repo>#<n>` and an `external_ref`. Sending it again replays; it never adds a second step.
 * Out: a case becomes a parent issue (steps as sub-issues, or a task list in its body when github.json has
 *      `subIssues: false`); a step's state goes back to its issue as a label plus a comment; the case goes on one board.
 *      Closing an issue on GitHub never accepts a step: the connector sends no decision of any kind.
 *
 * There is no outbox. Progress is one cursor into the case keeper's events, saved after the GitHub write for that event
 * succeeded. Every write looks first (labels, comment markers, issue text), so doing the same event twice changes nothing.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DurableStore } from "@godspeedai/cognate-events";
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import { seaForgeActorOf } from "../../src/adapters/sea-forge-approvals.ts";
import { argValue, parseSetup, setupMapping } from "../../src/config/setup.ts";
import { ensureBoard, placeIssue, type Board } from "./board.ts";
import { loadCursor, saveCursor } from "./cursor.ts";
import { redact } from "../../src/adapters/redact.ts";
import { killAllChildren } from "../../src/adapters/run-child.ts";
import { GhError, createGh, type GhClient } from "./gh.ts";
import { LockError, acquireLock } from "./lock.ts";
import {
  LABEL_CASE, LABEL_INTAKE, POLICY, STATE_PREFIX, caseMarker, hasLabel, intakeFrame, labelNames, noteMarker, parentBody, parentTitle, parseIssueRef, plainLine, safeId, stateComment,
  stateLabel, stateOf, stepIdFor, stepMarker, subIssueBody, type HorizonItem, type Issue,
} from "./mapping.ts";
import { KeeperError, followEvents, keeperCall, type EventFrame, type Follower, type Keeper } from "./sea-events.ts";

export const LABEL_STEP = "horizon-step";

export interface ConnectorConfig {
  readonly setup: string;
  readonly repo: string;
  readonly subIssues: boolean;
  /** Fixed target case for incoming issues; absent: the newest case that is not finished. */
  readonly caseId?: string;
  /** The organization's board; absent: no board. */
  readonly board?: { readonly org: string; readonly title: string };
  readonly deskUrl?: string;
}

export interface ConnectorStatus {
  /** "connected" or the plain words for what is wrong. The desk shows "GitHub: not connected" when this is not "connected". */
  github: string;
  keeper: string;
  /** "following", or "not connected: <reason>" when the case keeper's events are not arriving. Not cleared by a good GitHub poll. */
  feed: string;
  /** Plain notes about things skipped (a deleted issue, a repeated request). */
  notes: string[];
}

export interface ConnectorDeps {
  readonly gh: GhClient;
  readonly keeper: Keeper;
  readonly store: DurableStore;
  readonly config: ConnectorConfig;
  readonly now?: () => number;
  /** Most entries kept in each of the connector's memory maps (default 5000); the oldest go first. */
  readonly maxTracked?: number;
}

const ACTIVE_CASE = new Set(["active", "awaiting_approval"]);
const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const STEP_MARK = /<!-- horizon:step:([^/\s]+)\/([^\s]+) -->/;

export class Connector {
  readonly status: ConnectorStatus = { github: "connected", keeper: "connected", feed: "starting", notes: [] };
  private readonly now: () => number;
  private board: Board | undefined;
  private readonly placed = new Map<string, string>();
  private readonly seenIssues = new Map<number, string>();
  /** Intakes the case keeper refused: when to try again, and how many times it has refused. */
  private readonly refused = new Map<number, { signature: string; nextAt: number; attempts: number }>();
  /** The last case-keeper event id that brought a step to a state, so polling recovers under the same comment identity. */
  private readonly lastEvt = new Map<string, { evt: string; word: string }>();
  private readonly maxTracked: number;
  private closing = false;
  private failures = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private myLogin: string | undefined;

  constructor(private readonly deps: ConnectorDeps) {
    this.now = deps.now ?? Date.now;
    this.maxTracked = deps.maxTracked ?? 5_000;
  }

  private cap<K, V>(map: Map<K, V>): void {
    while (map.size > this.maxTracked) map.delete(map.keys().next().value as K);
  }

  /**
   * Stop taking work, wait (up to `drainMs`) for the queued writes, kill any `gh` still running, then call `release`
   * (the lock). A replacement connector can then never start while this one's write is in flight.
   */
  async shutdown(options: { readonly drainMs?: number; readonly release?: () => void } = {}): Promise<void> {
    this.closing = true;
    const wait = (ms: number) => new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms));
    const drained = await Promise.race([this.tail.then(() => true), wait(options.drainMs ?? 10_000)]);
    killAllChildren();
    if (!drained) await Promise.race([this.tail, wait(2_000)]);
    options.release?.();
  }

  private get gh(): GhClient {
    return this.deps.gh;
  }
  private get repo(): string {
    return this.deps.config.repo;
  }
  private note(text: string): void {
    if (!this.status.notes.includes(text)) this.status.notes = [...this.status.notes.slice(-19), text];
  }

  /** Every GitHub write for this setup goes through this one queue, one job at a time, in the order asked. */
  private serial<T>(job: () => Promise<T>): Promise<T> {
    if (this.closing) return Promise.reject(new Error("The connector is shutting down and takes no new work."));
    const run = this.tail.then(job, job);
    this.tail = run.catch(() => undefined);
    return run;
  }

  /** What the event feed is doing, in words. A feed that is not following stays visible until it follows again. */
  onFeedState(state: string, words: string): void {
    this.status.feed = state === "following" ? "following" : state === "connecting" ? this.status.feed : words.startsWith("Not connected") ? words.replace(/^Not connected/, "not connected") : `not connected: ${words}`;
  }

  /** Put what a failure means into the status, in words. */
  private describe(error: unknown): void {
    if (error instanceof GhError) this.status.github = error.words;
    else if (error instanceof KeeperError) this.status.keeper = error.words;
    else this.status.github = redact(`Horizon hit an unexpected problem and will try again: ${error instanceof Error ? error.message : String(error)}`).slice(0, 300);
  }

  /** How long to wait before the same work is tried again; also records the failure in the status. */
  waitFor(error: unknown): number {
    this.failures += 1;
    this.describe(error);
    if (error instanceof GhError) {
      if (error.kind === "rate_limited") return Math.min(15 * 60_000, Math.max(1_000, (error.retryAtMs ?? this.now() + 60_000) - this.now()));
      if (error.transient) return Math.min(60_000, 2_000 * 2 ** Math.min(this.failures - 1, 5));
      return 30_000;
    }
    if (error instanceof KeeperError) {
      return Math.min(60_000, 2_000 * 2 ** Math.min(this.failures - 1, 5));
    }
    return 30_000;
  }

  private ok(): void {
    this.failures = 0;
    this.status.github = "connected";
    this.status.keeper = "connected";
  }

  // ---- reads -------------------------------------------------------------------------------------------------------

  private async issuesWith(label: string): Promise<Issue[]> {
    try {
      const rows = await this.gh.list(`repos/${this.repo}/issues?labels=${encodeURIComponent(label)}&state=all`);
      return rows.filter((i: Issue) => i && typeof i.number === "number" && !i.pull_request);
    } catch (error) {
      if (error instanceof GhError && error.kind === "not_found") throw new GhError("not_found", `The repository ${this.repo} was not found on GitHub (404), or this sign-in cannot see it. Nothing was changed.`, { status: 404 });
      throw error;
    }
  }

  /** The login `gh` is signed in as; read once. Only comments by this login can prove a write was Horizon's. */
  private async login(): Promise<string> {
    if (this.myLogin) return this.myLogin;
    const me = await this.gh.api("GET", "user");
    if (typeof me?.login !== "string" || me.login === "") throw new GhError("garbled", "GitHub did not say who Horizon is signed in as, so it cannot tell its own comments from others. Nothing was changed.");
    const login: string = me.login;
    this.myLogin = login;
    return login;
  }

  /** Issues Horizon's own login wrote that carry `marker`, oldest first. A copied marker on someone else's issue proves nothing. */
  private async ownMarked(rows: readonly Issue[], marker: string): Promise<Issue[]> {
    const me = await this.login();
    return rows.filter((i) => i.user?.login === me && (i.body ?? "").includes(marker)).sort((a, b) => a.number - b.number);
  }

  /** Close an issue made twice by a retry, with a plain comment. */
  private async closeDuplicate(number: number): Promise<void> {
    await this.tellIssue(number, `dup:${number}`, "duplicate made by a retry. This issue is closed; the first one carries the case.");
    await this.gh.api("PATCH", `repos/${this.repo}/issues/${number}`, { state: "closed" });
  }

  /** The oldest of several issues with the same marker is kept; the open others are closed. */
  private async keepOldest(matches: readonly Issue[]): Promise<Issue | undefined> {
    const [keep, ...dups] = matches;
    for (const dup of dups) if (dup.state !== "closed") await this.closeDuplicate(dup.number);
    return keep;
  }

  /**
   * Create an issue once. A create that timed out or failed may still land, so it is never simply repeated: afterwards the
   * issues Horizon wrote with this marker are listed (REST list, not search), the oldest is kept and any other is closed.
   */
  private async createIssue(label: string, marker: string, payload: Record<string, unknown>): Promise<Issue> {
    let created: Issue | undefined;
    let failure: unknown;
    try {
      created = (await this.gh.api("POST", `repos/${this.repo}/issues`, payload)) as Issue;
    } catch (error) {
      failure = error;
    }
    let kept: Issue | undefined;
    try {
      kept = await this.keepOldest(await this.ownMarked(await this.issuesWith(label), marker));
    } catch (error) {
      if (failure === undefined) return created!;
      throw failure;
    }
    if (kept) return kept;
    if (failure !== undefined) throw failure;
    return created!;
  }

  private async ownComments(number: number): Promise<string[]> {
    const me = await this.login();
    const comments = await this.gh.list(`repos/${this.repo}/issues/${number}/comments`);
    return comments.filter((c: { user?: { login?: string } }) => c?.user?.login === me).map((c: { body?: string }) => c.body ?? "");
  }

  private async targetCase(): Promise<string | null> {
    if (this.deps.config.caseId) return this.deps.config.caseId;
    const reply = await keeperCall(this.deps.keeper, { verb: "case_list" });
    const cases = asArray<{ case_id?: string; case_state?: string; created_at?: string }>(reply.cases).filter((c) => typeof c.case_id === "string" && ACTIVE_CASE.has(String(c.case_state)));
    cases.sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
    return cases[0]?.case_id ?? null;
  }

  private async horizonOf(caseId: string): Promise<{ items: HorizonItem[]; case_state: string } | null> {
    try {
      const reply = await keeperCall(this.deps.keeper, { verb: "case_get_horizon", case_id: caseId });
      if (!Array.isArray(reply.items)) throw new KeeperError("garbled", "The case keeper sent a case view Horizon could not read.");
      return { items: reply.items as HorizonItem[], case_state: String(reply.case_state ?? "unknown") };
    } catch (error) {
      if (error instanceof KeeperError && error.kind === "refused" && /not_found/.test(error.errorClass ?? "")) return null;
      throw error;
    }
  }

  private async hasStep(caseId: string, number: number): Promise<boolean> {
    const horizon = await this.horizonOf(caseId);
    return horizon?.items.some((i) => i.plan_item_id === stepIdFor(this.repo, number)) ?? false;
  }

  private async summaryOf(caseId: string): Promise<string> {
    const reply = await keeperCall(this.deps.keeper, { verb: "case_list" });
    const row = asArray<{ case_id?: string; summary?: string }>(reply.cases).find((c) => c.case_id === caseId);
    return plainLine(row?.summary, 200, "(untitled case)");
  }

  // ---- in: issues become steps -----------------------------------------------------------------------------------------

  /** One pass over the issues labelled for Horizon, and over the step issues Horizon made. Safe to run any number of times. */
  pollIssues(): Promise<void> {
    return this.serial(async () => {
      try {
        await this.pollOnce();
      } catch (error) {
        this.describe(error);
        throw error;
      }
    });
  }

  private async pollOnce(): Promise<void> {
    const issues = (await this.issuesWith(LABEL_INTAKE)).sort((a, b) => a.number - b.number);
    const open: Issue[] = issues.filter((i) => hasLabel(i, LABEL_INTAKE));
    const caseId = open.length > 0 ? await this.targetCase() : null;
    if (open.length > 0 && !caseId) this.note("No case is open, so issues labelled for Horizon are waiting. They will be added when a case is open.");
    for (const issue of caseId ? open : []) {
      const signature = `${issue.state}|${(issue as { updated_at?: string }).updated_at ?? ""}|${caseId}`;
      if (this.seenIssues.get(issue.number) === signature) continue;
      const before = this.refused.get(issue.number);
      if (before && before.signature === signature && this.now() < before.nextAt) continue;
      // The case keeper remembers every request id, refusals included. After a definite refusal the next try uses a new
      // attempt id; after a timeout or closed socket (not a refusal) the same id is kept. `attempts` counts refusals.
      const { frame, notes } = intakeFrame({ caseId: caseId!, repo: this.repo, issue, attempt: before?.attempts ?? 0 });
      try {
        await keeperCall(this.deps.keeper, frame, true);
        this.refused.delete(issue.number);
      } catch (error) {
        // The same request id with new text, or a duplicate step id, means the step already exists: go on and keep its state in step.
        if (error instanceof KeeperError && error.kind === "refused" && (error.errorClass === "request_id_reused" || (await this.hasStep(caseId!, issue.number)))) {
          this.refused.delete(issue.number);
        } else if (error instanceof KeeperError && error.kind === "refused") {
          // Refused is an answer, not an outage: say so, try again later (not remembered as done), and go on to the next issue.
          this.note(`The case keeper refused issue #${issue.number} (${error.errorClass ?? "error"}). Nothing was changed for it; Horizon will ask again.`);
          const attempts = (before?.attempts ?? 0) + 1;
          this.refused.set(issue.number, { signature, attempts, nextAt: this.now() + Math.min(10 * 60_000, 15_000 * 2 ** (attempts - 1)) });
          this.cap(this.refused);
          continue;
        } else {
          throw error;
        }
      }
      // An added step stays pending until the case is advanced. A failed advance throws, so the issue is not marked seen and the
      // next pass asks again under the same id (the add replays, the advance is tried again).
      await keeperCall(this.deps.keeper, { verb: "case_advance", case_id: caseId, policy: POLICY, request_id: `advance:${String(frame.request_id)}` }, true);
      for (const text of notes) await this.tellIssue(issue.number, `note:${issue.number}:${text.length}`, text);
      const horizon = await this.horizonOf(caseId!);
      const item = horizon?.items.find((i) => i.plan_item_id === stepIdFor(this.repo, issue.number));
      if (item) await this.syncStep(caseId!, item, issue.number, undefined, "poll");
      this.seenIssues.set(issue.number, signature);
    }
    // Issues Horizon made for steps: closing or reopening one has no event in the case keeper, so look for it here.
    const horizons = new Map<string, Awaited<ReturnType<Connector["horizonOf"]>>>();
    const stepRows = await this.issuesWith(LABEL_STEP);
    const me = await this.login();
    for (const issue of stepRows) {
      const signature = `${issue.state}|${(issue as { updated_at?: string }).updated_at ?? ""}`;
      if (this.seenIssues.get(issue.number) === signature) continue;
      if (issue.user?.login !== me) continue;
      const mark = STEP_MARK.exec(issue.body ?? "");
      if (!mark || !safeId(mark[1]!)) continue;
      if (!horizons.has(mark[1]!)) horizons.set(mark[1]!, await this.horizonOf(mark[1]!));
      const item = horizons.get(mark[1]!)?.items.find((i) => i.plan_item_id === mark[2]);
      if (item) await this.syncStep(mark[1]!, item, issue.number, undefined, "poll");
      this.seenIssues.set(issue.number, signature);
    }
    // A full discovery finished: forget what it no longer shows, then hold the rest to the cap.
    const live = new Set<number>([...issues, ...stepRows].map((i) => i.number));
    for (const map of [this.seenIssues, this.refused]) for (const number of [...map.keys()]) if (!live.has(number)) map.delete(number);
    this.cap(this.seenIssues);
    this.ok();
  }

  private async tellIssue(number: number, key: string, text: string): Promise<void> {
    const marker = noteMarker(key);
    if ((await this.ownComments(number)).some((c) => c.includes(marker))) return;
    await this.gh.api("POST", `repos/${this.repo}/issues/${number}/comments`, { body: `Horizon: ${text}\n\n${marker}` });
  }

  // ---- out: a case and its steps show on GitHub ----------------------------------------------------------------------

  /** Handle one event from the case keeper. Throws when a GitHub write failed; the cursor is then not saved. */
  handleEvent(frame: EventFrame): Promise<void> {
    return this.serial(async () => {
      try {
        await this.handleOnce(frame);
      } catch (error) {
        this.describe(error);
        throw error;
      }
    });
  }

  private async handleOnce(frame: EventFrame): Promise<void> {
    if (frame.case_id && (frame.kind.startsWith("case.") || frame.kind.startsWith("approval."))) {
      if (!safeId(frame.case_id)) {
        this.note("An event named a case id Horizon will not write to GitHub; it was skipped.");
      } else {
        await this.syncCaseInner(frame.case_id, frame.cursor);
      }
    }
    await saveCursor(this.deps.store, this.deps.config.setup, frame.cursor);
    this.ok();
  }

  syncCase(caseId: string, evt = "manual"): Promise<void> {
    return this.serial(() => this.syncCaseInner(caseId, evt));
  }

  private async syncCaseInner(caseId: string, evt: string): Promise<void> {
    const horizon = await this.horizonOf(caseId);
    if (!horizon || horizon.items.length === 0) return;
    const summary = await this.summaryOf(caseId);
    const parents = await this.issuesWith(LABEL_CASE);
    const stepIssues = this.deps.config.subIssues ? await this.issuesWith(LABEL_STEP) : [];

    let parent = await this.keepOldest(await this.ownMarked(parents, caseMarker(caseId)));
    const numbers = new Map<string, number>();
    const closed = new Map<string, boolean>();

    const bodyFor = () => parentBody({ caseId, summary, caseState: horizon.case_state, items: horizon.items, subIssues: this.deps.config.subIssues, numberOf: (i) => numbers.get(i.plan_item_id), issueClosed: (i) => closed.get(i.plan_item_id) === true, repo: this.repo });
    for (const item of horizon.items) {
      const ref = item.external_ref?.kind === "github_issue" ? parseIssueRef(item.external_ref.id) : null;
      if (ref && ref.repo === this.repo) numbers.set(item.plan_item_id, ref.number);
      else if (ref) this.note(`Step "${plainLine(item.name, 60)}" is tied to ${item.external_ref!.id}, a repository Horizon does not write to.`);
    }
    if (!parent) {
      parent = await this.createIssue(LABEL_CASE, caseMarker(caseId), { title: parentTitle(summary), body: bodyFor(), labels: [LABEL_CASE] });
    }

    if (this.deps.config.subIssues) {
      for (const item of horizon.items) {
        if (numbers.has(item.plan_item_id)) continue;
        const marker = stepMarker(caseId, item.plan_item_id);
        let step = await this.keepOldest(await this.ownMarked(stepIssues, marker));
        if (!step) {
          step = await this.createIssue(LABEL_STEP, marker, { title: plainLine(item.name, 256), body: subIssueBody({ caseId, item }), labels: [LABEL_STEP] });
        }
        numbers.set(item.plan_item_id, step.number);
      }
    }

    // Every step that has an issue (made here or imported) is attached to the parent and brought in line with the case keeper.
    for (const item of horizon.items) {
      const n = numbers.get(item.plan_item_id);
      if (n === undefined) continue;
      closed.set(item.plan_item_id, (await this.syncStep(caseId, item, n, this.deps.config.subIssues ? parent.number : undefined, evt)) === "closed");
    }

    const body = bodyFor();
    const title = parentTitle(summary);
    if ((parent.body ?? "") !== body || parent.title !== title) await this.gh.api("PATCH", `repos/${this.repo}/issues/${parent.number}`, { title, body });

    if (this.deps.config.board && parent.node_id) {
      const marker = `${horizon.case_state}|${summary}`;
      // Cases whose parent issue is no longer listed are forgotten.
      const listed = new Set<string>([caseId]);
      for (const p of await this.ownMarked(parents, "<!-- horizon:case:")) for (const m of (p.body ?? "").matchAll(/<!-- horizon:case:([^\s]+) -->/g)) listed.add(m[1]!);
      for (const key of [...this.placed.keys()]) if (!listed.has(key)) this.placed.delete(key);
      if (this.placed.get(caseId) !== marker) {
        this.board ??= await ensureBoard(this.gh, this.deps.config.board.org, this.deps.config.board.title);
        await placeIssue(this.gh, this.board, parent.node_id, { case: summary, state: horizon.case_state });
        this.placed.set(caseId, marker);
        this.cap(this.placed);
      }
    }
  }

  /** Attach `issue` under the parent. A refusal counts as success only when GitHub shows the relationship exists. */
  private async attach(issue: Issue, parentNumber: number): Promise<void> {
    const current = (issue as { parent_issue_url?: string }).parent_issue_url;
    if (current) {
      if (!current.endsWith(`/issues/${parentNumber}`)) this.note(`Issue #${issue.number} is already a sub-issue of another issue, so it was left there.`);
      return;
    }
    if (typeof issue.id !== "number") return;
    try {
      await this.gh.api("POST", `repos/${this.repo}/issues/${parentNumber}/sub_issues`, { sub_issue_id: issue.id });
    } catch (error) {
      if (!(error instanceof GhError && error.kind === "invalid")) throw error;
      let exists = false;
      try {
        exists = (await this.gh.list(`repos/${this.repo}/issues/${parentNumber}/sub_issues`)).some((c: { number?: number }) => c.number === issue.number);
      } catch {
        exists = false;
      }
      if (!exists) throw new GhError("invalid", `GitHub did not attach issue #${issue.number} as a sub-issue of #${parentNumber}. The step is not shown under its case yet; Horizon will try again.`, { status: 422 });
    }
  }

  /**
   * Bring one step's issue in line with the case keeper: attach it, set the state label (add and remove only `horizon-state/*`),
   * and on a change post one comment. Looks first, and only trusts markers in comments written by Horizon's own login.
   * Returns "closed" when the issue is closed on GitHub, "deleted" when it is gone.
   */
  private async syncStep(caseId: string, item: HorizonItem, number: number, parentNumber: number | undefined, evt: string): Promise<"open" | "closed" | "deleted"> {
    let issue: Issue;
    try {
      issue = (await this.gh.api("GET", `repos/${this.repo}/issues/${number}`)) as Issue;
    } catch (error) {
      if (error instanceof GhError && error.kind === "not_found") {
        // Deleted on GitHub: the step stays exactly as the case keeper has it. Nothing to write, nothing to wait for.
        this.note(`Issue #${number} was deleted on GitHub. Its step is unchanged in Horizon.`);
        return "deleted";
      }
      throw error;
    }
    const isClosed = issue.state === "closed";
    if (parentNumber !== undefined) await this.attach(issue, parentNumber);
    const state = stateOf(item, isClosed);
    const want = stateLabel(state.word);
    const have = labelNames(issue.labels);
    const current = have.filter((l) => l.startsWith(STATE_PREFIX));
    if (current.length === 1 && current[0] === want) return isClosed ? "closed" : "open";
    // The comment's identity is the state reached and the event that reached it, never the labels found on the way (a half-done
    // earlier try leaves odd labels). Polling reuses the last event id seen for the same state; otherwise it is the issue's edit time.
    const key = `${caseId}/${item.plan_item_id}`;
    let eventId = evt;
    if (evt === "poll") {
      const last = this.lastEvt.get(key);
      eventId = last && last.word === state.word ? last.evt : `u${(issue as { updated_at?: string }).updated_at ?? ""}`;
    } else if (evt !== "manual") {
      this.lastEvt.set(key, { evt, word: state.word });
      this.cap(this.lastEvt);
    }
    const text = stateComment({ caseId, stepId: item.plan_item_id, state, transition: `${state.word}@${eventId}`, ...(this.deps.config.deskUrl ? { deskUrl: `${this.deps.config.deskUrl}#case/${encodeURIComponent(caseId)}` } : {}) });
    const marker = text.slice(text.lastIndexOf("<!--"));
    if (!(await this.ownComments(number)).some((c) => c.includes(marker))) await this.gh.api("POST", `repos/${this.repo}/issues/${number}/comments`, { body: text });
    if (!have.includes(want)) await this.gh.api("POST", `repos/${this.repo}/issues/${number}/labels`, { labels: [want] });
    for (const old of current) if (old !== want) await this.gh.api("DELETE", `repos/${this.repo}/issues/${number}/labels/${encodeURIComponent(old)}`);
    return isClosed ? "closed" : "open";
  }
}

// ---- process ---------------------------------------------------------------------------------------------------------

function writeHeartbeat(path: string, status: ConnectorStatus, nowMs: number): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ at: new Date(nowMs).toISOString(), github: status.github, keeper: status.keeper, feed: status.feed, notes: status.notes })}\n`);
  renameSync(tmp, path);
}

export async function main(env: Record<string, string | undefined> = process.env, args: readonly string[] = process.argv.slice(2)): Promise<number> {
  const setup = parseSetup(env);
  if (!setup) {
    console.error("connector: HORIZON_SETUP is not set; run it with the setup's environment (see scripts/setup-env.ts --service connector)");
    return 2;
  }
  const mapping = setupMapping(setup, env);
  const githubPath = join(mapping.root, "github.json");
  if (!existsSync(githubPath)) {
    console.error(`connector: ${githubPath} is missing; run scripts/setup-github.ts --setup ${setup} first`);
    return 2;
  }
  const github = JSON.parse(readFileSync(githubPath, "utf8")) as { repo?: string; subIssues?: boolean; caseId?: string; deskUrl?: string };
  if (!github.repo) {
    console.error(`connector: ${githubPath} names no repo`);
    return 2;
  }
  mkdirSync(mapping.run, { recursive: true });
  let lock;
  try {
    lock = acquireLock(join(mapping.run, "connector.lock"));
  } catch (error) {
    if (error instanceof LockError) {
      console.error(`connector: ${error.message}`);
      return 1;
    }
    throw error;
  }
  const operatorRef = env.HORIZON_OPERATOR_REF?.trim();
  const socketPath = env.SEA_FORGE_SOCKET?.trim() || mapping.socket;
  const keeper: Keeper = {
    socketPath,
    actor: { actor_id: env.COGNATE_SEA_FORGE_ACTOR?.trim() || "cognate-service", role: "service" },
    ...(operatorRef ? { onBehalfOf: { actor_id: seaForgeActorOf(operatorRef), role: "operator" } } : {}),
  };
  const store = openSqliteStore({ path: join(mapping.run, "connector.sqlite") });
  const connector = new Connector({
    gh: createGh({ env }),
    keeper,
    store,
    config: {
      setup,
      repo: github.repo,
      subIssues: github.subIssues !== false,
      ...(github.caseId ? { caseId: github.caseId } : {}),
      ...(mapping.github ? { board: { org: github.repo.split("/")[0]!, title: mapping.github.board } } : {}),
      ...(github.deskUrl ? { deskUrl: github.deskUrl } : {}),
    },
  });
  const heartbeat = env.HORIZON_CONNECTOR_HEARTBEAT?.trim() || join(mapping.run, "connector.heartbeat");
  const beat = () => writeHeartbeat(heartbeat, connector.status, Date.now());
  beat();
  const beatTimer = setInterval(beat, 5_000);

  const follower: Follower = followEvents({
    keeper,
    from_cursor: await loadCursor(store, setup),
    onEvent: async (frame) => {
      await connector.handleEvent(frame);
    },
    waitMs: (error) => connector.waitFor(error),
    onState: (state, words) => connector.onFeedState(state, words),
  });
  let stopped = false;
  const pollMs = Number(argValue(args, "poll-ms") ?? 30_000);
  const poll = (async () => {
    while (!stopped) {
      let wait = pollMs;
      try {
        await connector.pollIssues();
      } catch (error) {
        wait = Math.max(pollMs, connector.waitFor(error));
      }
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  })();
  console.log(`connector: ${setup} -> ${github.repo}; heartbeat ${heartbeat}`);
  await new Promise<void>((resolve) => {
    for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, resolve);
  });
  stopped = true;
  follower.stop();
  clearInterval(beatTimer);
  // Stop intake, let writes in flight finish (bounded), kill any gh still running, and only then give up the lock.
  await connector.shutdown({ drainMs: 10_000, release: () => lock.release() });
  void poll;
  return 0;
}

if (import.meta.main) process.exit(await main());

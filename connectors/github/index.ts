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
import { GhError, createGh, type GhClient } from "./gh.ts";
import {
  LABEL_CASE, LABEL_INTAKE, STATE_PREFIX, caseMarker, hasLabel, intakeFrame, labelNames, noteMarker, parentBody, parentTitle, parseIssueRef, plainLine, safeId, stateComment,
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
  /** Plain notes about things skipped (a deleted issue, a repeated request). */
  notes: string[];
}

export interface ConnectorDeps {
  readonly gh: GhClient;
  readonly keeper: Keeper;
  readonly store: DurableStore;
  readonly config: ConnectorConfig;
  readonly now?: () => number;
}

const ACTIVE_CASE = new Set(["active", "awaiting_approval"]);
const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export class Connector {
  readonly status: ConnectorStatus = { github: "connected", keeper: "connected", notes: [] };
  private readonly now: () => number;
  private board: Board | undefined;
  private readonly placed = new Map<string, string>();
  private readonly seenIssues = new Map<number, string>();
  private failures = 0;

  constructor(private readonly deps: ConnectorDeps) {
    this.now = deps.now ?? Date.now;
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

  /** Put what a failure means into the status, in words. */
  private describe(error: unknown): void {
    if (error instanceof GhError) this.status.github = error.words;
    else if (error instanceof KeeperError) this.status.keeper = error.words;
    else this.status.github = `Horizon hit an unexpected problem and will try again: ${error instanceof Error ? error.message : String(error)}`.slice(0, 300);
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
    const all: Issue[] = [];
    for (let page = 1; page <= 20; page += 1) {
      let rows: unknown;
      try {
        rows = await this.gh.api("GET", `repos/${this.repo}/issues?labels=${encodeURIComponent(label)}&state=all&per_page=100&page=${page}`);
      } catch (error) {
        if (error instanceof GhError && error.kind === "not_found") throw new GhError("not_found", `The repository ${this.repo} was not found on GitHub (404), or this sign-in cannot see it. Nothing was changed.`, { status: 404 });
        throw error;
      }
      const batch = asArray<Issue>(rows).filter((i) => i && typeof i.number === "number" && !i.pull_request);
      all.push(...batch);
      if (asArray(rows).length < 100) break;
    }
    return all;
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

  private async summaryOf(caseId: string): Promise<string> {
    const reply = await keeperCall(this.deps.keeper, { verb: "case_list" });
    const row = asArray<{ case_id?: string; summary?: string }>(reply.cases).find((c) => c.case_id === caseId);
    return plainLine(row?.summary, 200, "(untitled case)");
  }

  // ---- in: issues become steps -----------------------------------------------------------------------------------------

  /** One pass over the issues labelled for Horizon. Safe to run any number of times. */
  async pollIssues(): Promise<void> {
    try {
      await this.pollOnce();
    } catch (error) {
      this.describe(error);
      throw error;
    }
  }

  private async pollOnce(): Promise<void> {
    const issues = (await this.issuesWith(LABEL_INTAKE)).sort((a, b) => a.number - b.number);
    const open: Issue[] = issues.filter((i) => hasLabel(i, LABEL_INTAKE));
    if (open.length === 0) return this.ok();
    const caseId = await this.targetCase();
    if (!caseId) {
      this.note("No case is open, so issues labelled for Horizon are waiting. They will be added when a case is open.");
      return this.ok();
    }
    for (const issue of open) {
      const signature = `${issue.state}|${(issue as { updated_at?: string }).updated_at ?? ""}|${caseId}`;
      if (this.seenIssues.get(issue.number) === signature) continue;
      const { frame, notes } = intakeFrame({ caseId, repo: this.repo, issue });
      try {
        await keeperCall(this.deps.keeper, frame, true);
      } catch (error) {
        if (error instanceof KeeperError && error.kind === "refused") {
          // Refused is an answer, not an outage: say so and go on to the next issue.
          this.note(`The case keeper refused issue #${issue.number} (${error.errorClass ?? "error"}). Nothing was changed for it.`);
          this.seenIssues.set(issue.number, signature);
          continue;
        }
        throw error;
      }
      for (const text of notes) await this.tellIssue(issue.number, `note:${issue.number}:${text.length}`, text);
      const horizon = await this.horizonOf(caseId);
      const item = horizon?.items.find((i) => i.plan_item_id === stepIdFor(this.repo, issue.number));
      if (item) await this.syncStep(caseId, item, issue.number, undefined);
      this.seenIssues.set(issue.number, signature);
    }
    this.ok();
  }

  private async tellIssue(number: number, key: string, text: string): Promise<void> {
    const comments = asArray<{ body?: string }>(await this.gh.api("GET", `repos/${this.repo}/issues/${number}/comments?per_page=100`));
    const marker = noteMarker(key);
    if (comments.some((c) => (c.body ?? "").includes(marker))) return;
    await this.gh.api("POST", `repos/${this.repo}/issues/${number}/comments`, { body: `Horizon: ${text}\n\n${marker}` });
  }

  // ---- out: a case and its steps show on GitHub ----------------------------------------------------------------------

  /** Handle one event from the case keeper. Throws when a GitHub write failed; the cursor is then not saved. */
  async handleEvent(frame: EventFrame): Promise<void> {
    try {
      await this.handleOnce(frame);
    } catch (error) {
      this.describe(error);
      throw error;
    }
  }

  private async handleOnce(frame: EventFrame): Promise<void> {
    if (frame.case_id && (frame.kind.startsWith("case.") || frame.kind.startsWith("approval."))) {
      if (!safeId(frame.case_id)) {
        this.note("An event named a case id Horizon will not write to GitHub; it was skipped.");
      } else {
        await this.syncCase(frame.case_id);
      }
    }
    await saveCursor(this.deps.store, this.deps.config.setup, frame.cursor);
    this.ok();
  }

  async syncCase(caseId: string): Promise<void> {
    const horizon = await this.horizonOf(caseId);
    if (!horizon || horizon.items.length === 0) return;
    const summary = await this.summaryOf(caseId);
    const parents = await this.issuesWith(LABEL_CASE);
    const stepIssues = this.deps.config.subIssues ? await this.issuesWith(LABEL_STEP) : [];

    let parent = parents.find((p) => (p.body ?? "").includes(caseMarker(caseId)));
    const numbers = new Map<string, number>();
    const closed = new Map<string, boolean>();

    // The parent first, so sub-issues have something to attach to.
    const bodyFor = () => parentBody({ caseId, summary, caseState: horizon.case_state, items: horizon.items, subIssues: this.deps.config.subIssues, numberOf: (i) => numbers.get(i.plan_item_id), issueClosed: (i) => closed.get(i.plan_item_id) === true, repo: this.repo });
    for (const item of horizon.items) {
      const ref = item.external_ref?.kind === "github_issue" ? parseIssueRef(item.external_ref.id) : null;
      if (ref && ref.repo === this.repo) numbers.set(item.plan_item_id, ref.number);
      else if (ref) this.note(`Step "${plainLine(item.name, 60)}" is tied to ${item.external_ref!.id}, a repository Horizon does not write to.`);
    }
    if (!parent) {
      parent = (await this.gh.api("POST", `repos/${this.repo}/issues`, { title: parentTitle(summary), body: bodyFor(), labels: [LABEL_CASE] })) as Issue;
    }

    if (this.deps.config.subIssues) {
      for (const item of horizon.items) {
        if (numbers.has(item.plan_item_id)) continue;
        let step = stepIssues.find((s) => (s.body ?? "").includes(stepMarker(caseId, item.plan_item_id)));
        if (!step) {
          step = (await this.gh.api("POST", `repos/${this.repo}/issues`, { title: plainLine(item.name, 256), body: subIssueBody({ caseId, item }), labels: [LABEL_STEP] })) as Issue;
        }
        numbers.set(item.plan_item_id, step.number);
        if (!(step as { parent_issue_url?: string }).parent_issue_url && typeof step.id === "number") {
          try {
            await this.gh.api("POST", `repos/${this.repo}/issues/${parent.number}/sub_issues`, { sub_issue_id: step.id });
          } catch (error) {
            if (!(error instanceof GhError && error.kind === "invalid")) throw error;
          }
        }
      }
    }

    for (const item of horizon.items) {
      const n = numbers.get(item.plan_item_id);
      if (n === undefined) continue;
      closed.set(item.plan_item_id, (await this.syncStep(caseId, item, n, parent.number)) === "closed");
    }

    const body = bodyFor();
    const title = parentTitle(summary);
    if ((parent.body ?? "") !== body || parent.title !== title) await this.gh.api("PATCH", `repos/${this.repo}/issues/${parent.number}`, { title, body });

    if (this.deps.config.board && parent.node_id) {
      const marker = `${horizon.case_state}|${summary}`;
      if (this.placed.get(caseId) !== marker) {
        this.board ??= await ensureBoard(this.gh, this.deps.config.board.org, this.deps.config.board.title);
        await placeIssue(this.gh, this.board, parent.node_id, { case: summary, state: horizon.case_state });
        this.placed.set(caseId, marker);
      }
    }
  }

  /**
   * Bring one step's issue in line with the case keeper: a state label and, on a change, one comment. Looks first, so
   * a repeated event writes nothing. Returns "closed" when the issue is closed on GitHub, "deleted" when it is gone.
   */
  private async syncStep(caseId: string, item: HorizonItem, number: number, _parent: number | undefined): Promise<"open" | "closed" | "deleted"> {
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
    const state = stateOf(item, isClosed);
    const want = stateLabel(state.word);
    const have = labelNames(issue.labels);
    const current = have.filter((l) => l.startsWith(STATE_PREFIX));
    if (current.length === 1 && current[0] === want) return isClosed ? "closed" : "open";
    const comments = asArray<{ body?: string }>(await this.gh.api("GET", `repos/${this.repo}/issues/${number}/comments?per_page=100`));
    const text = stateComment({ caseId, stepId: item.plan_item_id, state, ...(this.deps.config.deskUrl ? { deskUrl: `${this.deps.config.deskUrl}#case/${encodeURIComponent(caseId)}` } : {}) });
    const marker = text.slice(text.lastIndexOf("<!--"));
    if (!comments.some((c) => (c.body ?? "").includes(marker))) await this.gh.api("POST", `repos/${this.repo}/issues/${number}/comments`, { body: text });
    await this.gh.api("PUT", `repos/${this.repo}/issues/${number}/labels`, { labels: [...have.filter((l) => !l.startsWith(STATE_PREFIX)), want] });
    return isClosed ? "closed" : "open";
  }
}

// ---- process ---------------------------------------------------------------------------------------------------------

function writeHeartbeat(path: string, status: ConnectorStatus, nowMs: number): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ at: new Date(nowMs).toISOString(), github: status.github, keeper: status.keeper, notes: status.notes })}\n`);
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
  void poll;
  return 0;
}

if (import.meta.main) process.exit(await main());

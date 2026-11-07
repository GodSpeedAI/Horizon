// Regression tests for the blind critic's findings on the GitHub connector (report: blind-critic-connector.md).
// Each test name starts with the finding number.
import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveCursor, loadCursor } from "../connectors/github/cursor.ts";
import { followEvents, type EventFrame } from "../connectors/github/sea-events.ts";
import { acquireLock, LockError } from "../connectors/github/lock.ts";
import { ensureBoard } from "../connectors/github/board.ts";
import { createGh } from "../connectors/github/gh.ts";
import { LABEL_CASE, LABEL_INTAKE } from "../connectors/github/mapping.ts";
import { makeRig, waitFor, REPO, type Rig } from "./support/connector-rig.ts";
import { restIssue } from "./support/fake-gh.ts";

let rig: Rig;
const extra: string[] = [];
afterEach(() => {
  rig?.cleanup();
  for (const d of extra.splice(0)) rmSync(d, { recursive: true, force: true });
});
const step = (id: string, name: string, over: Record<string, unknown> = {}) => ({ plan_item_id: id, name, item_kind: "human_task", execution: "pending", settlement: "unsettled", ...over });
const keeperOf = (r: Rig) => ({ socketPath: r.keeper.socketPath, actor: { actor_id: "cognate-service", role: "service" } });

describe("events and the cursor", () => {
  test("1 live events never skip ones the stream dropped", async () => {
    rig = makeRig();
    rig.keeper.addCase("case_1", "x");
    const seen: string[] = [];
    const f = followEvents({ keeper: keeperOf(rig), from_cursor: null, onEvent: async (e: EventFrame) => void seen.push(e.cursor), sweepMs: 60_000, reconnectMs: 50 });
    try {
      await waitFor(() => seen.length === 1);
      await new Promise((r) => setTimeout(r, 100));
      rig.keeper.silence = true;
      const a = rig.keeper.emit("case.trace.a", "case_1");
      const b = rig.keeper.emit("case.trace.b", "case_1");
      rig.keeper.silence = false;
      const c = rig.keeper.emit("case.trace.c", "case_1");
      await waitFor(() => seen.includes(c), 3000).catch(() => {});
      expect(seen.slice(1)).toEqual([a, b, c]);
    } finally {
      f.stop();
    }
  });

  test("4 an older handler cannot rewind the cursor", async () => {
    rig = makeRig();
    await saveCursor(rig.store, "testing", "E0005");
    await saveCursor(rig.store, "testing", "E0003");
    expect(await loadCursor(rig.store, "testing")).toBe("E0005");
  });

  test("9 a stopped event feed shows as not connected, and a good poll does not hide it", async () => {
    rig = makeRig();
    rig.keeper.addCase("case_1", "x");
    const connector = rig.connector();
    const f = followEvents({ keeper: keeperOf(rig), from_cursor: "E_unknown", onEvent: async () => {}, onState: (s, words) => connector.onFeedState(s, words), sweepMs: 60_000 });
    try {
      await waitFor(() => connector.status.feed.startsWith("not connected"));
      expect(connector.status.feed).toContain("saved place");
      await connector.pollIssues();
      expect(connector.status.feed.startsWith("not connected")).toBe(true);
    } finally {
      f.stop();
    }
  });

  test("10 a peer sending bytes without a newline is dropped with words", async () => {
    rig = makeRig();
    const dir = mkdtempSync(join(tmpdir(), "flood-"));
    extra.push(dir);
    const sock = join(dir, "s.sock");
    let closedByUs = false;
    let subscribed = false;
    const server = Bun.listen({ unix: sock, socket: { open() {}, data(s, chunk) { if (chunk.toString().includes("events_subscribe")) { subscribed = true; const t = setInterval(() => { if (s.write(Buffer.alloc(256 * 1024, 120)) < 0 || closedByUs) clearInterval(t); }, 5); setTimeout(() => clearInterval(t), 3000); } else s.write('{"events":[]}\n'); }, close() { if (subscribed) closedByUs = true; } } });
    const states: string[] = [];
    const f = followEvents({ keeper: { socketPath: sock, actor: { actor_id: "a", role: "service" }, timeoutMs: 500 }, from_cursor: null, onEvent: async () => {}, onState: (_s, w) => states.push(w), sweepMs: 60_000, reconnectMs: 5_000, maxLineBytes: 1024 * 1024 });
    try {
      await waitFor(() => states.join(" ").includes("too long"), 4000).catch(() => {});
      expect(states.join(" ")).toContain("too long");
      await waitFor(() => closedByUs, 2000);
    } finally {
      f.stop();
      server.stop(true);
    }
  });

  test("10 a failing handler does not let the queue grow without bound", async () => {
    rig = makeRig();
    rig.keeper.addCase("case_1", "x");
    for (let i = 0; i < 2500; i += 1) rig.keeper.emit("case.trace.n", "case_1");
    const f = followEvents({ keeper: keeperOf(rig), from_cursor: null, onEvent: async () => { throw new Error("down"); }, waitMs: () => 20, maxQueue: 600, pageSize: 500, sweepMs: 50, reconnectMs: 50 });
    try {
      await new Promise((r) => setTimeout(r, 700));
      expect(f.queued()).toBeLessThanOrEqual(1100);
      expect(f.queued()).toBeGreaterThan(0);
    } finally {
      f.stop();
    }
  });
});

describe("one writer", () => {
  test("2 two simultaneous syncs post one comment and make one parent", async () => {
    rig = makeRig();
    rig.keeper.addCase("case_1", "Ship it", [step("s1", "First")]);
    const connector = rig.connector();
    await Promise.all([connector.syncCase("case_1"), connector.syncCase("case_1"), connector.pollIssues()]);
    expect(rig.rest().issues.filter((i) => i.labels.includes(LABEL_CASE))).toHaveLength(1);
    expect(rig.rest().issues).toHaveLength(2);
    expect(rig.rest().issues.find((i) => i.title === "First")!.comments).toHaveLength(1);
  });

  test("2 a second connector for the same setup is refused with a plain message", () => {
    const dir = mkdtempSync(join(tmpdir(), "lock-"));
    extra.push(dir);
    const path = join(dir, "connector.lock");
    const first = acquireLock(path);
    expect(() => acquireLock(path)).toThrow(LockError);
    expect(() => acquireLock(path)).toThrow(/already running/);
    first.release();
    acquireLock(path).release();
    // A lock left by a process that is gone is taken over.
    writeFileSync(path, "999999999\n");
    acquireLock(path).release();
  });
});

describe("comments, labels, discovery", () => {
  const importedStep = (n: number) => step("s1", "Imported", { external_ref: { kind: "github_issue", id: `${REPO}#${n}`, url: `https://github.com/${REPO}/issues/${n}` } });

  test("3 a crash after the comment is recovered even when the issue has 100 comments", async () => {
    rig = makeRig();
    rig.keeper.addCase("case_1", "Ship it", [importedStep(5)]);
    rig.seedIssue(5, { labels: [LABEL_INTAKE], comments: Array.from({ length: 100 }, (_, i) => ({ id: i + 1, body: `old ${i}`, user: { login: "someone" } })) });
    const connector = rig.connector();
    rig.change((s) => (s.failures = [{ match: "labels", times: -1, status: 500 }]));
    await expect(connector.syncCase("case_1")).rejects.toThrow();
    rig.change((s) => (s.failures = []));
    await connector.syncCase("case_1");
    expect(rig.issue(5).comments.filter((c) => c.body.includes("Horizon: this step is now"))).toHaveLength(1);
  });

  test("5 discovery goes to the last page: no missed intake issue, no duplicate parent or board", async () => {
    rig = makeRig();
    rig.change((s) => (s.rest!.pageSize = 3));
    rig.keeper.addCase("case_1", "Ship it", []);
    for (let n = 1; n <= 10; n += 1) rig.seedIssue(n, { title: `Issue ${n}`, labels: [LABEL_INTAKE] });
    const connector = rig.connector();
    await connector.pollIssues();
    expect(rig.keeper.added).toHaveLength(10);
    // The parent sits past the first page; it is found, not recreated.
    rig.keeper.addCase("case_2", "Second", [step("t1", "T")]);
    await connector.syncCase("case_2");
    await connector.syncCase("case_2");
    const parents = rig.rest().issues.filter((i) => i.labels.includes(LABEL_CASE) && i.title === "Second");
    expect(parents).toHaveLength(1);
    // Board past the first page of projects and of fields.
    rig.change((s) => {
      s.rest!.pageSize = 2;
      s.rest!.projects = [1, 2, 3, 4].map((n) => ({ id: `P${n}`, title: `Other ${n}`, fields: [], items: [] }));
      s.rest!.projects.push({ id: "P5", title: "Horizon testing", fields: [{ id: "f1", name: "a" }, { id: "f2", name: "b" }, { id: "f3", name: "Case" }, { id: "f4", name: "State" }], items: [] });
    });
    const board = await ensureBoard(createGh({ env: rig.fake.env() }), "GodSpeedAI", "Horizon testing");
    expect(board).toEqual({ projectId: "P5", caseField: "f3", stateField: "f4" });
    expect(rig.rest().projects).toHaveLength(5);
    expect(rig.rest().projects[4]!.fields).toHaveLength(4);
  });

  test("6 labels are added and removed one at a time, never replaced", async () => {
    rig = makeRig();
    rig.keeper.addCase("case_1", "Ship it", [importedStep(5)]);
    rig.seedIssue(5, { labels: [LABEL_INTAKE, "bug", "horizon-state/waiting"] });
    await rig.connector().syncCase("case_1");
    expect(rig.rest().writes.some((w) => w.method === "PUT" && w.path.endsWith("/labels"))).toBe(false);
    expect(rig.issue(5).labels).toEqual(expect.arrayContaining(["bug", LABEL_INTAKE]));
    rig.keeper.setStep("case_1", "s1", { execution: "active" });
    await rig.connector().syncCase("case_1");
    expect(rig.rest().writes.some((w) => w.method === "PUT" && w.path.endsWith("/labels"))).toBe(false);
    expect(rig.issue(5).labels.sort()).toEqual(["bug", LABEL_INTAKE, "horizon-state/in-progress"].sort());
  });

  test("7 an imported issue becomes a sub-issue of the case parent", async () => {
    rig = makeRig();
    rig.keeper.addCase("case_1", "Ship it", [importedStep(5)]);
    rig.seedIssue(5, { labels: [LABEL_INTAKE] });
    await rig.connector().syncCase("case_1");
    const parent = rig.rest().issues.find((i) => i.labels.includes(LABEL_CASE))!;
    expect(rig.issue(5).parent_issue_url).toContain(`/issues/${parent.number}`);
  });

  test("8 a rejected attachment holds the cursor and says so", async () => {
    rig = makeRig();
    rig.keeper.addCase("case_1", "Ship it", [step("s1", "First")]);
    const event = rig.keeper.events.at(-1)!;
    rig.change((s) => (s.failures = [{ match: "sub_issues", times: -1, status: 422, body: { message: "Validation Failed", errors: ["Sub-issues are disabled for this repository"] } }]));
    const connector = rig.connector();
    await expect(connector.handleEvent(event)).rejects.toThrow();
    expect(await loadCursor(rig.store, "testing")).toBeNull();
    expect(connector.status.github).not.toBe("connected");
    expect(connector.status.github).toContain("sub-issue");
  });

  test("15 a comment by someone else carrying the marker does not count as Horizon's write", async () => {
    rig = makeRig();
    rig.keeper.addCase("case_1", "Ship it", [importedStep(5)]);
    rig.seedIssue(5, { labels: [LABEL_INTAKE] });
    const connector = rig.connector();
    await connector.syncCase("case_1");
    const genuine = rig.issue(5).comments[0]!;
    rig.change((s) => {
      const issue = s.rest!.issues.find((i) => i.number === 5)!;
      issue.comments = [{ id: 1, body: genuine.body, user: { login: "mallory" } }];
      issue.labels = issue.labels.filter((l) => !l.startsWith("horizon-state/"));
    });
    await rig.connector().syncCase("case_1");
    expect(rig.issue(5).comments.filter((c) => c.user?.login === "horizon-bot")).toHaveLength(1);
  });

  test("16 closing a generated step issue is noticed by polling", async () => {
    rig = makeRig();
    rig.keeper.addCase("case_1", "Ship it", [step("s1", "First")]);
    const connector = rig.connector();
    await connector.syncCase("case_1");
    const child = rig.rest().issues.find((i) => i.title === "First")!;
    rig.change((s) => (s.rest!.issues.find((i) => i.number === child.number)!.state = "closed"));
    await connector.pollIssues();
    expect(rig.issue(child.number).labels).toContain("horizon-state/closed-not-accepted");
    expect(rig.keeper.cases[0]!.items[0]!.settlement).toBe("unsettled");
    expect(rig.keeper.verbs.filter((v) => /decide|approve|accept/i.test(String(v.verb)))).toHaveLength(0);
  });

  test("17 returning to an earlier state posts a new comment", async () => {
    rig = makeRig();
    rig.keeper.addCase("case_1", "Ship it", [step("s1", "First", { execution: "enabled" })]);
    const connector = rig.connector();
    const frames = [rig.keeper.events.at(-1)!];
    await connector.handleEvent(frames[0]!);
    rig.keeper.setStep("case_1", "s1", { execution: "active" });
    await connector.handleEvent(rig.keeper.events.at(-1)!);
    rig.keeper.setStep("case_1", "s1", { execution: "enabled" });
    await connector.handleEvent(rig.keeper.events.at(-1)!);
    const child = rig.rest().issues.find((i) => i.title === "First")!;
    expect(child.comments).toHaveLength(3);
    expect(child.comments.at(-1)!.body).toContain("ready to start");
    expect(child.labels).toContain("horizon-state/ready");
  });
});

describe("gh child process", () => {
  function stubGh(script: string) {
    const dir = mkdtempSync(join(tmpdir(), "stubgh-"));
    extra.push(dir);
    writeFileSync(join(dir, "gh"), `#!/bin/sh\n${script}\n`);
    chmodSync(join(dir, "gh"), 0o755);
    return { PATH: `${dir}:${process.env.PATH}`, HOME: process.env.HOME };
  }

  test("11 endless output is cut at the byte cap while streaming", async () => {
    const env = stubGh("exec yes x");
    const started = Date.now();
    const error = await createGh({ env, maxBytes: 1_000_000, timeoutMs: 20_000 }).api("GET", "user").catch((e) => e);
    expect(error).toMatchObject({ kind: "too_large" });
    expect(Date.now() - started).toBeLessThan(5_000);
  }, 15_000);

  test("12 a timeout returns even when a descendant keeps the pipes open, and the group is killed", async () => {
    const env = stubGh(`(sleep 30; echo late) &\nsleep 30`);
    const started = Date.now();
    const error = await createGh({ env, timeoutMs: 200 }).api("GET", "user").catch((e) => e);
    expect(error).toMatchObject({ kind: "timeout" });
    expect(Date.now() - started).toBeLessThan(2_000);
  }, 15_000);

  test("14 a credential in gh's error text is masked", async () => {
    const env = stubGh(`echo "Authorization: Bearer ghp_abcdefghijklmnopqrstuvwxyz0123456789 token=hunter2" >&2; exit 1`);
    const error = (await createGh({ env }).api("GET", "user").catch((e) => e)) as { message: string; options: { detail?: string } };
    expect(JSON.stringify([error.message, error.options])).not.toMatch(/ghp_|hunter2|Bearer gh/);
  });
});

void restIssue;

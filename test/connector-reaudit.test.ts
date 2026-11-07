// Regression tests for the second blind audit of the GitHub connector (ids B1, B2, M1 to M12, m1 as in the dispositions file).
import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireLock, LockError } from "../connectors/github/lock.ts";
import { GhError, createGh, type GhClient } from "../connectors/github/gh.ts";
import { LABEL_CASE, LABEL_INTAKE, caseMarker, stepMarker } from "../connectors/github/mapping.ts";
import { KeeperError, keeperCall } from "../connectors/github/sea-events.ts";
import { redact } from "../src/adapters/redact.ts";
import { runChild } from "../src/adapters/run-child.ts";
import { makeRig, REPO, type Rig } from "./support/connector-rig.ts";

let rig: Rig;
const extra: string[] = [];
afterEach(() => {
  rig?.cleanup();
  for (const d of extra.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = (prefix: string) => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  extra.push(d);
  return d;
};
const step = (id: string, name: string, over: Record<string, unknown> = {}) => ({ plan_item_id: id, name, item_kind: "human_task", execution: "pending", settlement: "unsettled", ...over });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("B1 lock", () => {
  test("B1 an empty lock file is held by a writer that has not written its pid yet, not stale", () => {
    const path = join(tmp("lock-"), "connector.lock");
    writeFileSync(path, "");
    expect(() => acquireLock(path)).toThrow(LockError);
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toBe("");
    writeFileSync(path, "not-a-pid");
    expect(() => acquireLock(path)).toThrow(LockError);
  });

  test("B1 the lock appears with its pid already inside, and leaves no temp file", () => {
    const dir = tmp("lock-");
    const path = join(dir, "connector.lock");
    const lock = acquireLock(path);
    expect(Number(readFileSync(path, "utf8").trim())).toBe(process.pid);
    expect(readdirSync(dir)).toEqual(["connector.lock"]);
    lock.release();
    expect(readdirSync(dir)).toEqual([]);
  });
});

/** A gh whose first matching create times out without being committed; the request then lands late, just before the next create. */
const lateCreate = (label: string) => {
  const late: [string, string, unknown][] = [];
  let failed = false;
  return (real: GhClient): GhClient => ({
    ...real,
    async api(method, path, body) {
      if (method === "POST" && /\/issues$/.test(path)) {
        if (!failed && (body as { labels?: string[] }).labels?.includes(label)) {
          failed = true;
          late.push([method, path, body]);
          throw new GhError("timeout", "GitHub did not answer in time.");
        }
        while (late.length > 0) {
          const [m, p, b] = late.shift()!;
          await real.api(m as "POST", p, b);
        }
      }
      return real.api(method, path, body);
    },
  });
};

describe("B2 issue creation is never blindly repeated", () => {
  test("B2 a parent whose create timed out and then landed is not left twice", async () => {
    rig = makeRig();
    rig.keeper.addCase("case_1", "Ship it", [step("s1", "First")]);
    const connector = rig.connector({ wrapGh: lateCreate(LABEL_CASE) });
    await expect(connector.syncCase("case_1")).rejects.toBeInstanceOf(GhError);
    await connector.syncCase("case_1");
    const parents = rig.rest().issues.filter((i) => i.labels.includes(LABEL_CASE));
    expect(parents.filter((i) => i.state === "open").map((i) => i.number)).toEqual([1]);
    const dup = parents.find((i) => i.number === 2)!;
    expect(dup.state).toBe("closed");
    expect(dup.comments.map((c) => c.body).join("\n")).toContain("duplicate made by a retry");
    // The kept parent is the one that carries the case.
    expect(rig.issue(1).body).toContain(caseMarker("case_1"));
  });

  test("B2 a step whose create timed out and then landed is not left twice", async () => {
    rig = makeRig();
    rig.keeper.addCase("case_1", "Ship it", [step("s1", "First")]);
    const connector = rig.connector({ wrapGh: lateCreate("horizon-step") });
    await expect(connector.syncCase("case_1")).rejects.toBeInstanceOf(GhError);
    await connector.syncCase("case_1");
    const steps = rig.rest().issues.filter((i) => i.title === "First");
    expect(steps.filter((i) => i.state === "open")).toHaveLength(1);
    expect(steps.filter((i) => i.state === "closed")).toHaveLength(1);
    expect(steps.find((i) => i.state === "closed")!.comments.map((c) => c.body).join("\n")).toContain("duplicate made by a retry");
    // The surviving step is the one attached to the parent.
    expect(steps.find((i) => i.state === "open")!.parent_issue_url).toBeDefined();
  });

  test("B2 a create that failed after it committed is found again, not repeated", async () => {
    rig = makeRig();
    rig.keeper.addCase("case_1", "Ship it", [step("s1", "First")]);
    let first = true;
    const connector = rig.connector({
      wrapGh: (real) => ({
        ...real,
        async api(method, path, body) {
          const answer = await real.api(method, path, body);
          if (first && method === "POST" && /\/issues$/.test(path)) {
            first = false;
            throw new GhError("timeout", "GitHub did not answer in time.");
          }
          return answer;
        },
      }),
    });
    await connector.syncCase("case_1").catch(() => undefined);
    await connector.syncCase("case_1");
    expect(rig.rest().issues.filter((i) => i.labels.includes(LABEL_CASE))).toHaveLength(1);
    expect(rig.rest().writes.filter((w) => w.method === "POST" && /issues$/.test(w.path) && (w.body as any).labels?.includes(LABEL_CASE))).toHaveLength(1);
  });
});

describe("M1 shutdown", () => {
  test("M1 shutdown waits for a write in flight before it releases the lock, and takes no new work", async () => {
    rig = makeRig();
    rig.keeper.addCase("case_1", "Ship it", [step("s1", "First")]);
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    let jobDone = false;
    const connector = rig.connector({
      wrapGh: (real) => ({
        ...real,
        async api(method, path, body) {
          if (method === "POST" && /\/issues$/.test(path)) await gate;
          return real.api(method, path, body);
        },
      }),
    });
    const job = connector.syncCase("case_1").then(() => (jobDone = true));
    await sleep(300);
    let releasedWhileJobDone: boolean | undefined;
    const shut = connector.shutdown({ drainMs: 10_000, release: () => (releasedWhileJobDone = jobDone) });
    await sleep(300);
    expect(releasedWhileJobDone).toBeUndefined();
    await expect(connector.syncCase("case_1")).rejects.toThrow(/shutting down|stopped/i);
    open();
    await shut;
    await job;
    expect(releasedWhileJobDone).toBe(true);
  });

  test("M1 shutdown is bounded: a stuck gh is killed, then the lock is released", async () => {
    rig = makeRig();
    const bin = tmp("stuckgh-");
    writeFileSync(join(bin, "gh"), "#!/bin/sh\nsleep 30\n");
    chmodSync(join(bin, "gh"), 0o755);
    const connector = rig.connector({ ghOptions: { env: { PATH: `${bin}:${process.env.PATH}`, HOME: process.env.HOME }, timeoutMs: 25_000 } });
    const job = connector.pollIssues().catch((e) => e);
    await sleep(500);
    const started = Date.now();
    let released = false;
    await connector.shutdown({ drainMs: 300, release: () => (released = true) });
    expect(released).toBe(true);
    expect(Date.now() - started).toBeLessThan(4_000);
    const settled = await Promise.race([job.then(() => true), sleep(4_000).then(() => false)]);
    expect(settled).toBe(true);
  }, 20_000);
});

describe("M2 and m1 comment identity", () => {
  const generated = async () => {
    rig = makeRig();
    rig.keeper.addCase("case_1", "Ship it", [step("s1", "First", { execution: "enabled" })]);
    const connector = rig.connector();
    await connector.handleEvent(rig.keeper.events.at(-1)!);
    return connector;
  };
  const child = () => rig.rest().issues.find((i) => i.title === "First")!;

  test("M2 a failed old-label delete does not make the retry post a second comment", async () => {
    const connector = await generated();
    rig.keeper.setStep("case_1", "s1", { execution: "active" });
    const frame = rig.keeper.events.at(-1)!;
    rig.change((s) => (s.failures = [{ match: "-X DELETE", times: 1, status: 500 }]));
    await expect(connector.handleEvent(frame)).rejects.toBeInstanceOf(GhError);
    await connector.handleEvent(frame);
    expect(child().comments).toHaveLength(2);
    expect(child().labels.filter((l) => l.startsWith("horizon-state/"))).toEqual(["horizon-state/in-progress"]);
  });

  test("M2 polling after a failed old-label delete does not post a second comment either", async () => {
    const connector = await generated();
    rig.keeper.setStep("case_1", "s1", { execution: "active" });
    const frame = rig.keeper.events.at(-1)!;
    rig.change((s) => (s.failures = [{ match: "-X DELETE", times: 1, status: 500 }]));
    await expect(connector.handleEvent(frame)).rejects.toBeInstanceOf(GhError);
    await connector.pollIssues();
    expect(child().comments).toHaveLength(2);
  });

  test("m1 closing, reopening and closing a generated step again comments on each close", async () => {
    rig = makeRig();
    rig.keeper.addCase("case_1", "Ship it", [step("s1", "First")]);
    const connector = rig.connector();
    await connector.syncCase("case_1");
    const n = child().number;
    const flip = async (state: "open" | "closed", at: string) => {
      rig.change((s) => {
        const issue = s.rest!.issues.find((i) => i.number === n)!;
        issue.state = state;
        issue.updated_at = at;
      });
      await connector.pollIssues();
    };
    await flip("closed", "2026-11-07T01:00:00Z");
    await flip("open", "2026-11-07T02:00:00Z");
    await flip("closed", "2026-11-07T03:00:00Z");
    const closes = child().comments.filter((c) => c.body.includes("closed on GitHub"));
    expect(closes).toHaveLength(2);
    expect(child().labels).toContain("horizon-state/closed-not-accepted");
  });
});

describe("M4 only Horizon's own issues are trusted", () => {
  test("M4 a copied case marker on someone else's issue is not adopted as the parent", async () => {
    rig = makeRig();
    rig.keeper.addCase("case_1", "Ship it", [step("s1", "First")]);
    rig.seedIssue(1, { labels: [LABEL_CASE], title: "Mallory", body: `mine\n${caseMarker("case_1")}`, user: { login: "mallory" } });
    await rig.connector().syncCase("case_1");
    expect(rig.issue(1).title).toBe("Mallory");
    expect(rig.issue(1).body).toBe(`mine\n${caseMarker("case_1")}`);
    const own = rig.rest().issues.filter((i) => i.labels.includes(LABEL_CASE) && i.user === undefined);
    expect(own).toHaveLength(1);
    expect(rig.rest().issues.filter((i) => i.parent_issue_url?.endsWith("/issues/1"))).toHaveLength(0);
  });

  test("M4 a copied step marker on someone else's issue is not adopted, in sync or in polling", async () => {
    rig = makeRig();
    rig.keeper.addCase("case_1", "Ship it", [step("s1", "First")]);
    rig.seedIssue(1, { labels: ["horizon-step"], title: "Mallory step", body: `x\n${stepMarker("case_1", "s1")}`, user: { login: "mallory" } });
    const connector = rig.connector();
    await connector.syncCase("case_1");
    await connector.pollIssues();
    expect(rig.issue(1).comments).toHaveLength(0);
    expect(rig.issue(1).labels).toEqual(["horizon-step"]);
    expect(rig.rest().issues.filter((i) => i.title === "First")).toHaveLength(1);
  });
});

describe("M5 to M7 intake", () => {
  const intake = (over: Record<string, unknown> = {}) => rig.seedIssue(5, { labels: [LABEL_INTAKE], title: "Fix the door", ...over });

  test("M5 editing an imported issue's title keeps its state in step", async () => {
    rig = makeRig();
    rig.keeper.addCase("case_1", "Ship it", []);
    intake();
    const connector = rig.connector({ config: { caseId: "case_1" } });
    await connector.pollIssues();
    rig.change((s) => {
      const issue = s.rest!.issues.find((i) => i.number === 5)!;
      issue.title = "Fix the front door";
      issue.state = "closed";
      issue.updated_at = "2026-11-07T05:00:00Z";
    });
    await connector.pollIssues();
    expect(rig.issue(5).labels).toContain("horizon-state/closed-not-accepted");
    expect(rig.keeper.cases[0]!.items[0]!.name).toBe("Fix the door");
  });

  test("M6 a refused intake is tried again on a later poll without any edit to the issue", async () => {
    rig = makeRig();
    intake();
    let t = 1_000_000;
    const connector = rig.connector({ config: { caseId: "case_late" }, now: () => t });
    await connector.pollIssues();
    expect(connector.status.notes.join("\n")).toContain("refused issue #5");
    rig.keeper.addCase("case_late", "Late", []);
    t += 11 * 60_000;
    await connector.pollIssues();
    expect(rig.keeper.added).toHaveLength(1);
    expect(rig.issue(5).labels).toContain("horizon-state/waiting");
  });

  test("M7 a credential in an issue title does not reach the case item", async () => {
    rig = makeRig();
    rig.keeper.addCase("case_1", "Ship it", []);
    intake({ title: "rotate token=abc123def and ghp_abcdefghijklmnopqrstuvwxyz0123456789 today" });
    await rig.connector({ config: { caseId: "case_1" } }).pollIssues();
    const name = rig.keeper.cases[0]!.items[0]!.name;
    expect(name).toContain("rotate");
    expect(name).not.toMatch(/abc123def|ghp_/);
    expect(JSON.stringify(rig.rest().issues.map((i) => [i.title, i.body]).slice(1))).not.toMatch(/abc123def|ghp_/);
  });
});

describe("M8 redaction of quoted credentials", () => {
  test("M8 JSON and quote-wrapped keys are masked", () => {
    const cases = ['{"password":"example-password","token":"example-token"}', "{'token': 'two words here'}", 'token="a b c d"', "password = 'p q r'", '{"Authorization": "Bearer abcdefghijkl"}', '{"api_key":"k-k-k-k"}'];
    for (const probe of cases) {
      const out = redact(`failed: ${probe} (end)`);
      expect(out).not.toMatch(/example-password|example-token|two words|a b c d|p q r|abcdefghijkl|k-k-k-k/);
      expect(out).toContain("[removed]");
    }
    expect(redact('{"name":"plain","count":3}')).toBe('{"name":"plain","count":3}');
  });
});

describe("M9 keeper sockets are capped", () => {
  test("M9 a reply that never ends its line is dropped with words, long before the timeout", async () => {
    const dir = tmp("flood-");
    const socketPath = join(dir, "k.sock");
    let clientClosed = false;
    const server = Bun.listen({
      unix: socketPath,
      socket: {
        data(socket) {
          socket.write("x".repeat(300_000));
        },
        close() {
          clientClosed = true;
        },
      },
    });
    try {
      const started = Date.now();
      const error = (await keeperCall({ socketPath, actor: { actor_id: "a", role: "service" }, timeoutMs: 8_000, maxLineBytes: 100_000 }, { verb: "case_list" }).catch((e) => e)) as KeeperError;
      expect(error).toBeInstanceOf(KeeperError);
      expect(error.words).toMatch(/too long/i);
      expect(Date.now() - started).toBeLessThan(3_000);
      await sleep(200);
      expect(clientClosed).toBe(true);
    } finally {
      server.stop(true);
    }
  });
});

describe("M10 and M11 child processes", () => {
  test("M10 a record keeper that ignores SIGTERM is still stopped at the timeout", async () => {
    const dir = tmp("ignore-term-");
    const bin = join(dir, "keeper.sh");
    const pidFile = join(dir, "pid");
    writeFileSync(bin, `#!/bin/sh\ntrap '' TERM\necho $$ > ${JSON.stringify(pidFile)}\nwhile :; do :; done\n`);
    chmodSync(bin, 0o755);
    const driver = join(dir, "driver.ts");
    writeFileSync(driver, `import { makeSpawnRunner } from ${JSON.stringify(join(import.meta.dir, "../src/adapters/realitytrace-economics.ts"))};\nconst r = makeSpawnRunner(300)(${JSON.stringify(bin)}, [], { PATH: "/usr/bin:/bin" });\nconsole.log("returned", r.status);\n`);
    const proc = Bun.spawn([process.execPath, driver], { stdout: "pipe", stderr: "pipe" });
    const finished = await Promise.race([proc.exited.then(() => true), sleep(5_000).then(() => false)]);
    if (!finished) proc.kill("SIGKILL");
    if (existsSync(pidFile)) {
      try {
        process.kill(Number(readFileSync(pidFile, "utf8").trim()), "SIGKILL");
      } catch {
        // already gone
      }
    }
    expect(finished).toBe(true);
  }, 15_000);

  test("M11 a descendant left behind by a command that exited normally is killed", async () => {
    const dir = tmp("leftover-");
    const pidFile = join(dir, "pid");
    const result = await runChild(["sh", "-c", `sleep 30 >/dev/null 2>&1 &\necho $! > ${JSON.stringify(pidFile)}\necho done`], { timeoutMs: 5_000, maxBytes: 10_000 });
    expect(result.code).toBe(0);
    const pid = Number(readFileSync(pidFile, "utf8").trim());
    let alive = true;
    for (let i = 0; i < 40 && alive; i += 1) {
      try {
        process.kill(pid, 0);
        await sleep(50);
      } catch {
        alive = false;
      }
    }
    if (alive) process.kill(pid, "SIGKILL");
    expect(alive).toBe(false);
  });
});

describe("M12 memory stays bounded", () => {
  const sizes = (c: unknown) => ({ seen: (c as any).seenIssues.size as number, placed: (c as any).placed.size as number });

  test("M12 entries for issues that are no longer discovered are dropped", async () => {
    rig = makeRig();
    rig.keeper.addCase("case_1", "Ship it", []);
    for (const n of [1, 2, 3]) rig.seedIssue(n, { labels: [LABEL_INTAKE] });
    const connector = rig.connector({ config: { caseId: "case_1" } });
    await connector.pollIssues();
    expect(sizes(connector).seen).toBeGreaterThanOrEqual(3);
    rig.change((s) => {
      for (const i of s.rest!.issues) if (i.number !== 1) i.labels = [];
    });
    await connector.pollIssues();
    expect(sizes(connector).seen).toBeLessThan(3);
    expect((connector as any).seenIssues.has(2)).toBe(false);
  });

  test("M12 placed entries for cases that are gone are dropped", async () => {
    rig = makeRig();
    rig.keeper.addCase("case_1", "Ship it", [step("s1", "First")]);
    rig.keeper.addCase("case_2", "Other", [step("s2", "Second")]);
    const connector = rig.connector();
    await connector.syncCase("case_1");
    await connector.syncCase("case_2");
    expect(sizes(connector).placed).toBe(2);
    rig.change((s) => {
      for (const i of s.rest!.issues) if (i.body.includes(caseMarker("case_1"))) i.deleted = true;
    });
    await connector.syncCase("case_2");
    expect((connector as any).placed.has("case_1")).toBe(false);
    expect(sizes(connector).placed).toBe(1);
  });

  test("M12 both maps have a hard cap", async () => {
    rig = makeRig();
    rig.keeper.addCase("case_1", "Ship it", []);
    for (const n of [1, 2, 3, 4, 5, 6]) rig.seedIssue(n, { labels: [LABEL_INTAKE] });
    const connector = rig.connector({ config: { caseId: "case_1" }, maxTracked: 2 });
    await connector.pollIssues();
    expect(sizes(connector).seen).toBeLessThanOrEqual(2);
  });
});

void REPO;

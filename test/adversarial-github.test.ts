// Annex J.1, GitHub row: the connector against the fake `gh` with injected failures. Never real GitHub.
// The rule each test proves: the honest state in plain words, never stale data shown as current, never a lost or
// doubled write, never a leaked key.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCursor } from "../connectors/github/cursor.ts";
import { GhError } from "../connectors/github/gh.ts";
import { BODY_LIMIT, LABEL_CASE, LABEL_INTAKE } from "../connectors/github/mapping.ts";
import { REPO, makeRig, type Rig } from "./support/connector-rig.ts";

let rig: Rig;
afterEach(() => rig?.cleanup());

const step = (id: string, name: string, over: Record<string, unknown> = {}) => ({ plan_item_id: id, name, item_kind: "human_task", execution: "pending", settlement: "unsettled", ...over });
const setup = (items = [step("s1", "Step one")]) => {
  rig = makeRig();
  rig.keeper.addCase("case_1", "Ship it", items);
  return rig.keeper.events.at(-1)!;
};
const decisionVerbs = (r: Rig) => r.keeper.verbs.filter((v) => /decide|approve|accept|settle/i.test(String(v.verb)));
const noGhWrites = (r: Rig) => expect(r.rest().writes).toHaveLength(0);

describe("GitHub: the tool and the sign-in", () => {
  test("gh missing", async () => {
    const event = setup();
    const empty = mkdtempSync(join(tmpdir(), "no-gh-"));
    try {
      rig.seedIssue(1, { labels: [LABEL_INTAKE] });
      const connector = rig.connector({ ghOptions: { env: { PATH: empty, HOME: process.env.HOME } } });
      await expect(connector.pollIssues()).rejects.toMatchObject({ kind: "missing" });
      expect(connector.status.github).toBe("The GitHub command line (`gh`) is not installed, so Horizon cannot reach GitHub.");
      await expect(connector.handleEvent(event)).rejects.toBeInstanceOf(GhError);
      expect(await loadCursor(rig.store, "testing")).toBeNull();
      expect(rig.keeper.added).toHaveLength(0);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  test("not logged in", async () => {
    const event = setup();
    rig.change((s) => (s.failures = [{ match: "api", times: -1, exit: 4, stderr: "To get started with GitHub CLI, please run:  gh auth login" }]));
    const connector = rig.connector();
    await expect(connector.handleEvent(event)).rejects.toMatchObject({ kind: "not_logged_in" });
    expect(connector.status.github).toContain("not signed in to GitHub");
    expect(connector.status.github).toContain("gh auth login");
    expect(await loadCursor(rig.store, "testing")).toBeNull();
    noGhWrites(rig);
    // Signed in again: it carries on, and the event is done once.
    rig.change((s) => (s.failures = []));
    await connector.handleEvent(event);
    expect(connector.status.github).toBe("connected");
    expect(await loadCursor(rig.store, "testing")).toBe(event.cursor);
  });

  test("scope missing", async () => {
    const event = setup();
    // REST says 403 without a rate-limit sign; the board's GraphQL says INSUFFICIENT_SCOPES with a 200.
    rig.change((s) => (s.failures = [{ match: "graphql", times: -1, ok: true, body: { data: null, errors: [{ type: "INSUFFICIENT_SCOPES", message: "Your token has not been granted the required scopes to execute this query. The 'project' scope is required." }] } }]));
    const connector = rig.connector();
    await expect(connector.handleEvent(event)).rejects.toMatchObject({ kind: "scope" });
    expect(connector.status.github).toContain("missing a permission");
    expect(connector.status.github).toContain("gh auth refresh -s project");
    expect(await loadCursor(rig.store, "testing")).toBeNull();
    // The issues themselves were written (they need no project scope) and are not written again on the next try.
    const issuesBefore = rig.rest().issues.length;
    rig.change((s) => (s.failures = []));
    await connector.handleEvent(event);
    expect(rig.rest().issues).toHaveLength(issuesBefore);
    expect(rig.rest().projects).toHaveLength(1);
    expect(await loadCursor(rig.store, "testing")).toBe(event.cursor);
    // A plain REST 403 about a permission reads the same way.
    const again = makeRigWith403();
    await expect(again).resolves.toBe("scope");
  });

  test("rate-limited: 403 plus reset waits and says how long, in words", async () => {
    const event = setup();
    const t0 = 1_700_000_000_000;
    rig.change((s) => (s.failures = [{ match: "POST repos", times: 1, status: 403, headers: { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(t0 / 1000 + 45) }, body: { message: "API rate limit exceeded for user ID 1." } }]));
    const connector = rig.connector({ now: () => t0, ghOptions: { now: () => t0 } });
    const error = await connector.handleEvent(event).catch((e) => e);
    expect(error).toMatchObject({ kind: "rate_limited" });
    expect(connector.status.github).toBe("GitHub says too many requests were made. Horizon is waiting about 45 seconds and will carry on by itself.");
    // The wait is until the reset, not a guess and not a busy loop.
    expect(connector.waitFor(error)).toBe(45_000);
    expect(await loadCursor(rig.store, "testing")).toBeNull();
    noGhWrites(rig);
    // After the wait the same event goes through once.
    await connector.handleEvent(event);
    expect(rig.rest().issues.filter((i) => i.labels.includes(LABEL_CASE))).toHaveLength(1);
    // A longer wait is said in minutes.
    rig.change((s) => (s.failures = [{ match: "GET repos", times: 1, status: 429, headers: { "Retry-After": "300" } }]));
    const second = rig.connector({ now: () => t0, ghOptions: { now: () => t0 } });
    const e2 = await second.pollIssues().catch((e) => e);
    expect(e2).toMatchObject({ kind: "rate_limited" });
    expect(second.status.github).toContain("about 5 minutes");
  });

  test("5xx", async () => {
    const event = setup();
    rig.change((s) => (s.failures = [{ match: "POST repos", times: 2, status: 502 }]));
    const connector = rig.connector();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(connector.handleEvent(event)).rejects.toMatchObject({ kind: "server", transient: true });
      expect(connector.status.github).toBe("GitHub had a problem on its side (5xx). Horizon will try again.");
      expect(await loadCursor(rig.store, "testing")).toBeNull();
    }
    await connector.handleEvent(event);
    // Nothing was doubled by the failed tries.
    expect(rig.rest().issues.filter((i) => i.labels.includes(LABEL_CASE))).toHaveLength(1);
    expect(rig.rest().issues).toHaveLength(2);
  });

  test("404 on the repo", async () => {
    setup();
    rig.change((s) => (s.failures = [{ match: "repos/", times: -1, status: 404 }]));
    const connector = rig.connector();
    const error = await connector.pollIssues().catch((e) => e);
    expect(error).toMatchObject({ kind: "not_found" });
    expect(connector.status.github).toBe(`The repository ${REPO} was not found on GitHub (404), or this sign-in cannot see it. Nothing was changed.`);
    // Not shown as "no issues": nothing was added to the case.
    expect(rig.keeper.added).toHaveLength(0);
    expect(rig.keeper.verbs.some((v) => v.verb === "case_add_item")).toBe(false);
    await expect(connector.syncCase("case_1")).rejects.toMatchObject({ kind: "not_found" });
    noGhWrites(rig);
  });
});

describe("GitHub: issues change under the connector", () => {
  test("an issue deleted on GitHub", async () => {
    const event = setup([step("s1", "Step one", { external_ref: { kind: "github_issue", id: `${REPO}#9`, url: `https://github.com/${REPO}/issues/9` } })]);
    rig.seedIssue(9, { labels: [LABEL_INTAKE], deleted: true });
    const connector = rig.connector();
    await connector.handleEvent(event);
    // The step is exactly as the case keeper had it; GitHub's loss changes nothing there, and the connector says so.
    const item = rig.keeper.cases[0]!.items[0]!;
    expect(item).toMatchObject({ plan_item_id: "s1", settlement: "unsettled", execution: "pending" });
    expect(rig.keeper.cases[0]!.items).toHaveLength(1);
    expect(connector.status.notes.join(" ")).toContain("Issue #9 was deleted on GitHub. Its step is unchanged in Horizon.");
    expect(decisionVerbs(rig)).toHaveLength(0);
    expect(rig.rest().writes.some((w) => w.path.includes("/issues/9"))).toBe(false);
    expect(await loadCursor(rig.store, "testing")).toBe(event.cursor);
  });

  test("an issue closed on GitHub: the step stays not accepted", async () => {
    const event = setup();
    const connector = rig.connector();
    await connector.handleEvent(event);
    const child = rig.rest().issues.find((i) => i.title === "Step one")!;
    rig.change((s) => (s.rest!.issues.find((i) => i.number === child.number)!.state = "closed"));
    rig.keeper.setStep("case_1", "s1", { execution: "active" });
    await connector.syncCase("case_1");
    expect(rig.issue(child.number).labels).toContain("horizon-state/closed-not-accepted");
    expect(rig.issue(child.number).comments.map((c) => c.body).join("\n")).toContain("closed on GitHub, not accepted");
    expect(rig.keeper.cases[0]!.items[0]!.settlement).toBe("unsettled");
    expect(decisionVerbs(rig)).toHaveLength(0);
    // Reopened on GitHub: it goes back to what the case keeper says, still not accepted.
    rig.change((s) => (s.rest!.issues.find((i) => i.number === child.number)!.state = "open"));
    await connector.syncCase("case_1");
    expect(rig.issue(child.number).labels).toContain("horizon-state/in-progress");
  });

  test("the same poll seen 3 times", async () => {
    setup([]);
    rig.seedIssue(3, { title: "Once", labels: [LABEL_INTAKE] });
    const connector = rig.connector();
    await connector.pollIssues();
    const writesAfterFirst = rig.rest().writes.length;
    await connector.pollIssues();
    await connector.pollIssues();
    expect(rig.rest().writes).toHaveLength(writesAfterFirst);
    expect(rig.keeper.added).toHaveLength(1);
    expect(rig.issue(3).comments).toHaveLength(1);
    // A restarted connector (fresh memory) repeats the add and every check, and still changes nothing.
    await rig.connector().pollIssues();
    expect(rig.rest().writes).toHaveLength(writesAfterFirst);
    expect(rig.keeper.cases[0]!.items).toHaveLength(1);
  });
});

describe("GitHub: text is text", () => {
  const nasty = "<script>alert(1)</script> **bold** [click](javascript:alert(1)) <img src=x onerror=alert(2)> @octocat $(touch PWNED) `id`; rm -rf /";

  test("markdown and script injection in the title or body is kept as text", async () => {
    setup();
    const marker = join(rig.dir, "PWNED");
    const title = nasty.replace("PWNED", marker);
    rig.seedIssue(4, { title: `${title}‮\u0007 end`, body: `${nasty}\n\n# heading\n![x](http://evil/x.png)`, labels: [LABEL_INTAKE] });
    const connector = rig.connector();
    await connector.pollIssues();
    // Into the case keeper: the characters typed, minus control and direction-override characters; nothing run.
    const sent = rig.keeper.verbs.find((v) => v.verb === "case_add_item") as any;
    expect(sent.item.name).toBe(`${title} end`.replace(/\s+/g, " "));
    expect(sent.item.name).toContain("<script>alert(1)</script>");
    expect(JSON.stringify(sent)).not.toContain("# heading");
    expect(existsSync(marker)).toBe(false);
    // Out to GitHub: a case whose step is named like that shows the characters, not markup, links or mentions.
    rig.keeper.addCase("case_2", "Summary <b>bold</b> @someone", [step("s9", nasty)]);
    const out = rig.connector({ config: { subIssues: false } });
    await out.syncCase("case_2");
    const parent = rig.rest().issues.find((i) => i.title.startsWith("Summary"))!;
    expect(parent.body).not.toMatch(/<script|<img|<b>/);
    expect(parent.body).toContain("&lt;script&gt;");
    expect(parent.body).not.toContain("](javascript");
    expect(parent.body).toContain("\\[click\\]\\(javascript");
    expect(parent.body).not.toContain("@octocat");
    expect(parent.body).toContain("@​octocat");
    expect(existsSync(marker)).toBe(false);
  });

  test("a body of 1MB or more is not read; the title is used and the issue is told in plain words", async () => {
    setup([]);
    rig.seedIssue(5, { title: "Huge", body: "x".repeat(BODY_LIMIT + 1), labels: [LABEL_INTAKE] });
    const connector = rig.connector();
    await connector.pollIssues();
    const sent = rig.keeper.verbs.find((v) => v.verb === "case_add_item") as any;
    expect(sent.item.name).toBe("Huge");
    expect(JSON.stringify(sent).length).toBeLessThan(2_000);
    const comments = rig.issue(5).comments.map((c) => c.body);
    expect(comments.some((c) => c.includes("1 MB or longer, so Horizon used only the title"))).toBe(true);
    // Told once, not on every poll.
    await rig.connector().pollIssues();
    expect(rig.issue(5).comments.filter((c) => c.body.includes("used only the title"))).toHaveLength(1);
    // An answer from GitHub larger than the cap is refused in words, not read.
    const capped = rig.connector({ ghOptions: { maxBytes: 100_000 } });
    await expect(capped.pollIssues()).rejects.toMatchObject({ kind: "too_large" });
    expect(capped.status.github).toBe("GitHub sent an answer larger than Horizon reads, so it was refused.");
  });

  test("a key in GitHub's own error text never reaches the status or the heartbeat notes", async () => {
    const event = setup();
    const key = "ghp_abcdefghijklmnopqrstuvwxyz0123456789ABCD";
    rig.change((s) => (s.failures = [{ match: "api", times: -1, exit: 1, stderr: `unexpected failure with token ${key}` }]));
    const connector = rig.connector();
    const error = (await connector.handleEvent(event).catch((e) => e)) as GhError;
    const everything = JSON.stringify([connector.status, error.message, error.words, error.options]);
    expect(everything).not.toContain(key);
    expect(everything).not.toContain("ghp_");
  });
});

describe("GitHub: offline, then back", () => {
  test("writes are replayed in order exactly once", async () => {
    const event = setup([step("s1", "First"), step("s2", "Second")]);
    const connector = rig.connector();
    // The link and label writes fail (GitHub drops mid-way), after the issues themselves were made.
    rig.change((s) => (s.failures = [{ match: "PUT repos", times: -1 }, { match: "sub_issues", times: -1 }]));
    await expect(connector.handleEvent(event)).rejects.toMatchObject({ kind: "offline" });
    expect(connector.status.github).toContain("cannot be reached");
    expect(await loadCursor(rig.store, "testing")).toBeNull();
    const madeWhileDown = rig.rest().issues.map((i) => i.title);
    // Back: the same event goes through and finishes the job.
    rig.change((s) => (s.failures = []));
    await connector.handleEvent(event);
    await connector.handleEvent(event);
    expect(rig.rest().issues.map((i) => i.title).slice(0, madeWhileDown.length)).toEqual(madeWhileDown);
    const titles = rig.rest().issues.map((i) => i.title);
    expect(titles).toEqual(["Ship it", "First", "Second"]);
    const children = rig.rest().issues.filter((i) => i.title !== "Ship it");
    for (const child of children) {
      expect(child.parent_issue_url).toContain("/issues/1");
      expect(child.labels).toContain("horizon-state/waiting");
      expect(child.comments).toHaveLength(1);
    }
    const creates = rig.rest().writes.filter((w) => w.method === "POST" && /\/issues$/.test(w.path));
    expect(creates).toHaveLength(3);
    expect(await loadCursor(rig.store, "testing")).toBe(event.cursor);
  });
});

/** A 403 that is a permission problem, not a rate limit. */
async function makeRigWith403(): Promise<string> {
  const other = makeRig();
  try {
    other.keeper.addCase("case_9", "x", [step("s", "y")]);
    other.change((s) => (s.failures = [{ match: "POST repos", times: -1, status: 403, body: { message: "Resource not accessible by personal access token" } }]));
    const error = await other.connector().syncCase("case_9").catch((e) => e);
    return (error as GhError).kind;
  } finally {
    other.cleanup();
  }
}

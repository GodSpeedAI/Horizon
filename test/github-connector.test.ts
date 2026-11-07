// Stage 4: the GitHub connector, against the fake `gh` and a fake case keeper. Never real GitHub.
import { afterEach, describe, expect, test } from "bun:test";
import type { DurableStore } from "@godspeedai/cognate-events";
import { loadCursor } from "../connectors/github/cursor.ts";
import { followEvents } from "../connectors/github/sea-events.ts";
import { LABEL_CASE, LABEL_INTAKE } from "../connectors/github/mapping.ts";
import { REPO, makeRig, waitFor, type Rig } from "./support/connector-rig.ts";

let rig: Rig;
afterEach(() => rig?.cleanup());

const writes = (r: Rig, method: string, pattern: RegExp) => r.rest().writes.filter((w) => w.method === method && pattern.test(w.path));

describe("incoming issues", () => {
  test("the same issue seen three times gives one step", async () => {
    rig = makeRig();
    rig.keeper.addCase("case_1", "Ship the thing");
    rig.seedIssue(1, { title: "Fix the parser", labels: [LABEL_INTAKE] });
    const connector = rig.connector();
    await connector.pollIssues();
    await connector.pollIssues();
    await connector.pollIssues();
    // A restarted connector has no memory of what it sent: it sends again, and the case keeper replays.
    await rig.connector().pollIssues();
    expect(rig.keeper.added).toHaveLength(1);
    expect(rig.keeper.cases[0]!.items).toHaveLength(1);
    const sent = rig.keeper.verbs.filter((v) => v.verb === "case_add_item");
    expect(sent.length).toBeGreaterThanOrEqual(2);
    for (const frame of sent) {
      expect(frame.request_id).toBe(`github:${REPO}#1`);
      expect((frame.item as any).external_ref).toEqual({ kind: "github_issue", id: `${REPO}#1`, url: `https://github.com/${REPO}/issues/1` });
      expect((frame.item as any).name).toBe("Fix the parser");
    }
    // The state went back to the issue as a tag plus one comment, however many times it was seen (the step was started by the advance).
    expect(rig.issue(1).labels).toContain("horizon-state/in-progress");
    expect(rig.issue(1).comments).toHaveLength(1);
  });

  test("an issue closed on GitHub leaves the step unaccepted", async () => {
    rig = makeRig();
    rig.keeper.addCase("case_1", "Ship the thing");
    rig.seedIssue(7, { title: "Closed early", labels: [LABEL_INTAKE], state: "closed" });
    await rig.connector().pollIssues();
    const step = rig.keeper.cases[0]!.items[0]!;
    expect(step.settlement).toBe("unsettled");
    // The connector sent no decision of any kind: only reads and the one add.
    expect(new Set(rig.keeper.verbs.map((v) => v.verb))).toEqual(new Set(["case_list", "case_add_item", "case_advance", "case_get_horizon"]));
    expect(rig.issue(7).labels).toContain("horizon-state/closed-not-accepted");
    expect(rig.issue(7).comments.at(-1)!.body).toContain("closed on GitHub, not accepted");
    // Only the case keeper's own decision changes that, and then the issue says so.
    rig.keeper.setStep("case_1", step.plan_item_id, { settlement: "accepted" });
    await rig.connector().syncCase("case_1");
    expect(rig.issue(7).labels).toContain("horizon-state/accepted");
    expect(rig.issue(7).labels).not.toContain("horizon-state/closed-not-accepted");
  });
});

describe("intake attempts and starting the step", () => {
  test("an imported issue's step is started after it is added", async () => {
    rig = makeRig();
    rig.keeper.addCase("case_1", "Ship the thing");
    rig.seedIssue(3, { title: "Start me", labels: [LABEL_INTAKE] });
    const connector = rig.connector();
    await connector.pollIssues();
    const advance = rig.keeper.verbs.filter((v) => v.verb === "case_advance");
    expect(advance).toHaveLength(1);
    expect(advance[0]).toMatchObject({ case_id: "case_1", request_id: `advance:github:${REPO}#3` });
    expect(rig.keeper.cases[0]!.items[0]!.execution).toBe("active");
    // The advance goes after the add, and a repeat changes nothing.
    const order = rig.keeper.verbs.map((v) => v.verb).filter((v) => v === "case_add_item" || v === "case_advance");
    expect(order.slice(0, 2)).toEqual(["case_add_item", "case_advance"]);
    await rig.connector().pollIssues();
    expect(rig.keeper.added).toHaveLength(1);
  });

  test("a refused intake is retried with the next attempt id and then imported once", async () => {
    rig = makeRig();
    rig.keeper.addCase("case_1", "Ship the thing");
    rig.seedIssue(5, { title: "Needs a policy", labels: [LABEL_INTAKE] });
    rig.keeper.refuseAdds(1);
    let clock = 1_000_000;
    const connector = rig.connector({ now: () => clock });
    await connector.pollIssues();
    expect(rig.keeper.added).toHaveLength(0);
    clock += 60 * 60_000;
    await connector.pollIssues();
    await connector.pollIssues();
    expect(rig.keeper.added).toEqual([`gh_${REPO.replace(/[^A-Za-z0-9]+/g, "_")}_5`]);
    const ids = rig.keeper.verbs.filter((v) => v.verb === "case_add_item").map((v) => v.request_id);
    expect(ids).toEqual([`github:${REPO}#5`, `github:${REPO}#5:a1`]);
    expect(rig.keeper.verbs.filter((v) => v.verb === "case_advance")).toHaveLength(1);
  });

  test("a duplicate step id after a lost reply counts as imported", async () => {
    rig = makeRig();
    const stepId = `gh_${REPO.replace(/[^A-Za-z0-9]+/g, "_")}_6`;
    rig.keeper.addCase("case_1", "Ship the thing", [{ plan_item_id: stepId, name: "Lost reply", item_kind: "human_task", execution: "pending", settlement: "unsettled", external_ref: { kind: "github_issue", id: `${REPO}#6`, url: `https://github.com/${REPO}/issues/6` } }]);
    rig.seedIssue(6, { title: "Lost reply", labels: [LABEL_INTAKE] });
    const connector = rig.connector();
    await connector.pollIssues();
    expect(rig.keeper.added).toHaveLength(0);
    expect(rig.keeper.cases[0]!.items).toHaveLength(1);
    expect(connector.status.notes.join(" ")).not.toContain("refused");
    expect(rig.issue(6).labels.some((l: string) => l.startsWith("horizon-state/"))).toBe(true);
    // Imported, so it is not asked again as a new attempt.
    await connector.pollIssues();
    expect(rig.keeper.verbs.filter((v) => v.verb === "case_add_item")).toHaveLength(1);
  });
});

describe("outgoing state", () => {
  test("GitHub offline then back delivers the waiting updates in order", async () => {
    rig = makeRig();
    const store = rig.store;
    // Offline from the start: every call fails to connect.
    rig.change((s) => (s.failures = [{ match: "api", times: -1 }]));
    for (const id of ["case_a", "case_b", "case_c"]) rig.keeper.addCase(id, `Title ${id}`, [{ plan_item_id: `s_${id}`, name: `Step ${id}`, item_kind: "human_task", execution: "pending", settlement: "unsettled" }]);
    const connector = rig.connector();
    const follower = followEvents({
      keeper: { socketPath: rig.keeper.socketPath, actor: { actor_id: "cognate-service", role: "service" } },
      from_cursor: null,
      onEvent: (frame) => connector.handleEvent(frame),
      waitMs: (error) => connector.waitFor(error) && 30,
      reconnectMs: 50,
      sweepMs: 100,
    });
    try {
      await waitFor(() => connector.status.github.includes("cannot be reached"));
      expect(connector.status.github).toContain("Steps keep working");
      expect(await loadCursor(store, "testing")).toBeNull();
      expect(rig.rest().writes).toHaveLength(0);
      rig.change((s) => (s.failures = []));
      const last = rig.keeper.events.at(-1)!.cursor;
      await waitFor(async () => (await loadCursor(store, "testing")) === last);
      expect(connector.status.github).toBe("connected");
      // Parents were made in the order the events arrived, each exactly once.
      const parents = rig.rest().issues.filter((i) => i.labels.includes(LABEL_CASE)).map((i) => i.title);
      expect(parents).toEqual(["Title case_a", "Title case_b", "Title case_c"]);
      expect(writes(rig, "POST", /^repos\/[^/]+\/[^/]+\/issues$/)).toHaveLength(6);
    } finally {
      follower.stop();
    }
  });

  test("the cursor is saved only after a successful write", async () => {
    rig = makeRig();
    rig.keeper.addCase("case_1", "Ship it", [{ plan_item_id: "s1", name: "Step one", item_kind: "human_task", execution: "active", settlement: "unsettled" }]);
    const event = rig.keeper.events.at(-1)!;
    let writesAtCommit = -1;
    const watched: DurableStore = {
      ...rig.store,
      commit: async (request) => {
        writesAtCommit = rig.rest().writes.length;
        return rig.store.commit(request);
      },
    };
    const connector = rig.connector({ store: watched });
    // GitHub answers 500 to the first write: the event is not done, so the place is not saved.
    rig.change((s) => (s.failures = [{ match: "POST repos", times: 1, status: 500 }]));
    await expect(connector.handleEvent(event)).rejects.toThrow();
    expect(await loadCursor(rig.store, "testing")).toBeNull();
    expect(connector.status.github).toContain("problem on its side");
    // Same event again: it succeeds, and only then is the place saved, after the last write.
    await connector.handleEvent(event);
    expect(await loadCursor(rig.store, "testing")).toBe(event.cursor);
    expect(writesAtCommit).toBe(rig.rest().writes.length);
    expect(writesAtCommit).toBeGreaterThan(0);
    // Doing it a third time changes nothing on GitHub.
    const before = rig.rest().writes.length;
    await connector.handleEvent(event);
    expect(rig.rest().writes.length).toBe(before);
  });

  test("no sub-issues falls back to a task list", async () => {
    rig = makeRig({ subIssues: false });
    rig.keeper.addCase("case_1", "Ship it", [
      { plan_item_id: "s1", name: "First step", item_kind: "human_task", execution: "pending", settlement: "unsettled" },
      { plan_item_id: "s2", name: "Second step", item_kind: "agent_task", execution: "completed", settlement: "accepted" },
    ]);
    const connector = rig.connector({ config: { subIssues: false } });
    await connector.syncCase("case_1");
    const issues = rig.rest().issues;
    expect(issues).toHaveLength(1);
    const body = issues[0]!.body;
    expect(body).toContain("- [ ] First step (waiting to start)");
    expect(body).toContain("- [x] Second step (accepted)");
    expect(rig.rest().writes.some((w) => w.path.endsWith("/sub_issues"))).toBe(false);
    // A step moving updates the task list in place; it does not make a second parent.
    rig.keeper.setStep("case_1", "s1", { settlement: "accepted" });
    await connector.syncCase("case_1");
    expect(rig.rest().issues).toHaveLength(1);
    expect(rig.issue(1).body).toContain("- [x] First step (accepted)");
  });

  test("with sub-issues each step is a sub-issue of the case's parent", async () => {
    rig = makeRig();
    rig.keeper.addCase("case_1", "Ship it", [{ plan_item_id: "s1", name: "First step", item_kind: "human_task", execution: "pending", settlement: "unsettled" }]);
    const connector = rig.connector();
    await connector.syncCase("case_1");
    await connector.syncCase("case_1");
    const [parent, child] = rig.rest().issues;
    expect(parent!.labels).toContain(LABEL_CASE);
    expect(child!.parent_issue_url).toContain(`/issues/${parent!.number}`);
    expect(rig.rest().issues).toHaveLength(2);
    expect(child!.labels).toContain("horizon-state/waiting");
    // One board for the organization, with the Case and State fields, holding the parent.
    const board = rig.rest().projects;
    expect(board).toHaveLength(1);
    expect(board[0]!.fields.map((f) => f.name)).toEqual(["Case", "State"]);
    expect(board[0]!.items[0]!.values).toEqual({ Case: "Ship it", State: "active" });
  });
});

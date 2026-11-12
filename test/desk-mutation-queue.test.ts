/**
 * Design v3, step 1: every panel command runs through one FIFO queue, one at a time, in arrival order. Each proof goes through the
 * application's own entry points. The store is paused (or made to fail) at one commit to the panel answers collection, so the
 * other commands arrive while that one is still in its write.
 */
import { withRevision } from "./support/answer-revision.ts";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PANEL_ANSWERS_COLLECTION } from "../src/capabilities/panel-answers.ts";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { fakeCaseKeeper, type FakeKeeper } from "./support/fake-case-keeper.ts";
import { withRequestId } from "./support/request-body.ts";
import { agentInProcess } from "./support/agent-door.ts";

const keys = { ag_alice: randomBytes(32).toString("hex"), ag_alice2: randomBytes(32).toString("hex") };
const sha = (k: string) => createHash("sha256").update(k).digest("hex");
const writeRegistry = (app: DeskApp) => {
  const entries = [
    { key_id: "ag_alice", name: "Alice", sha256: sha(keys.ag_alice), added: "2026-11-07T09:00:00.000Z" },
    { key_id: "ag_alice2", name: "Alice 2", sha256: sha(keys.ag_alice2), added: "2026-11-07T09:00:00.000Z" },
  ];
  writeFileSync(join(dirname(app.application.loaded.agentKeyPath), "agents.json"), JSON.stringify({ schema: "horizon.agents/1", agents: entries }));
};
const q = (id: string) => ({ id, question: `Which plan for ${id}?`, why_needed: "x", options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }] });
const surface = (id: string) => ({ tool: "show_surface" as const, surface: { id, title: `Panel ${id}`, blocks: [{ type: "callout", id: "c1", tone: "ok", text: "Looks fine" }] } });
const agent = (app: DeskApp, key: string, name: string, body: unknown) =>
  fetch(`${app.base}/agent/panels`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-horizon-agent-name": name }, body: JSON.stringify(withRequestId(body)) });
const person = async (app: DeskApp, body: unknown) => app.post("/desk/panels/op", await withRevision(app, body));
const answer = (panel: string, ask: string) => ({ op: "human.answer", panel, ask, outcome: "answered", value: "a" });
const routeBody = (panel: string, ask: string) => ({ tool: "answer.route", panel_id: panel, ask_id: ask, routed_as: "step handoff_0a49 in Seed" });
/** The route machinery, at the entry point the door calls: the door itself refuses this row at this freeze (R5-01). */
const routeAs = (app: DeskApp, keyId: string, name: string, body: unknown) => agentInProcess(app.application, keyId, name, body);

/** Lets the concurrent commands reach the server (or the queue) before the held write is released. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 200));

type Commit = { readonly records?: readonly { readonly collection: string }[] };
/**
 * Holds the first commit that writes `collection` until `release` is called. With `refuse`, the commit and its retries that
 * write the collection throw instead of writing (recordAnswer retries a failed commit three times).
 */
function gateCommit(app: DeskApp, collection: string, refuse = false) {
  const store = app.application.runtime.runtime.store as unknown as { commit: (intent: Commit) => Promise<unknown> };
  const original = store.commit.bind(store);
  let armed = true;
  let refusals = refuse ? 4 : 0;
  let open!: () => void;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  let hit!: () => void;
  const reached = new Promise<void>((resolve) => {
    hit = resolve;
  });
  store.commit = async (intent) => {
    const touches = (intent.records ?? []).some((r) => r.collection === collection);
    if (touches && armed) {
      armed = false;
      hit();
      await gate;
    }
    if (touches && refusals > 0) {
      refusals -= 1;
      throw new Error("the store refused this write (test)");
    }
    return original(intent);
  };
  return { reached, release: () => open(), restore: () => (store.commit = original) };
}

describe("one queue for panel commands", () => {
  let app: DeskApp;
  beforeAll(async () => {
    app = await startDeskApp();
    writeRegistry(app);
  });
  afterAll(async () => app.stop());

  test("reassign first, then route with the old key: the route is refused and the owner stays changed", async () => {
    expect((await agent(app, keys.ag_alice, "Alice", { tool: "ask_human", panel: "rq1", ask: q("rq1_q") })).status).toBe(200);
    expect((await person(app, answer("rq1", "rq1_q"))).status).toBe(200);
    const gate = gateCommit(app, PANEL_ANSWERS_COLLECTION);
    try {
      const moved = person(app, { op: "human.reassign_owner", panel: "rq1", ask: "rq1_q", from_key_id: "ag_alice", to_key_id: "ag_alice2", confirmed: true });
      await gate.reached;
      const routed = routeAs(app, "ag_alice", "Alice", routeBody("rq1", "rq1_q"));
      await settle();
      gate.release();
      const [moveResponse, routeResponse] = await Promise.all([moved, routed]);
      expect(moveResponse.status).toBe(200);
      expect(routeResponse.status).toBeGreaterThanOrEqual(400);
    } finally {
      gate.restore();
    }
    // The owner has moved: the new key is the one that can say where the answer went.
    expect((await routeAs(app, "ag_alice2", "Alice 2", routeBody("rq1", "rq1_q"))).status).toBe(200);
  });

  test("an answer paused in its store write keeps a panel update made meanwhile", async () => {
    expect((await app.application.applyAgentOp({ tool: "ask_human", panel: "rq2", ask: q("rq2_q"), step: "rq2_step" })).ok).toBe(true);
    const gate = gateCommit(app, PANEL_ANSWERS_COLLECTION);
    try {
      const answered = person(app, answer("rq2", "rq2_q"));
      await gate.reached;
      const put = app.application.applyAgentOp(surface("rq2_other"));
      await settle();
      gate.release();
      const [answerResponse, putResult] = await Promise.all([answered, put]);
      expect(answerResponse.status).toBe(200);
      expect(putResult).toMatchObject({ ok: true });
    } finally {
      gate.restore();
    }
    const state = await app.state();
    expect(state.panels.open.map((p: { id: string }) => p.id)).toEqual(expect.arrayContaining(["rq2", "rq2_other"]));
    expect(state.panels.waiting).toEqual([{ step: "rq2_step", panel: "rq2" }]);
  });

  test("two answers raced at one question: exactly one succeeds", async () => {
    expect((await app.application.applyAgentOp({ tool: "ask_human", panel: "rq3", ask: q("rq3_q") })).ok).toBe(true);
    const [first, second] = await Promise.all([person(app, answer("rq3", "rq3_q")), person(app, answer("rq3", "rq3_q"))]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
  });

  test("a command that fails does not stop the next queued command", async () => {
    expect((await app.application.applyAgentOp({ tool: "ask_human", panel: "rq5", ask: q("rq5_q") })).ok).toBe(true);
    const gate = gateCommit(app, PANEL_ANSWERS_COLLECTION, true);
    try {
      const failed = person(app, answer("rq5", "rq5_q"));
      await gate.reached;
      const next = app.application.applyAgentOp(surface("rq5_next"));
      await settle();
      gate.release();
      const [failedResponse, nextResult] = await Promise.all([failed, next]);
      expect(failedResponse.status).toBe(500);
      expect(nextResult).toMatchObject({ ok: true });
    } finally {
      gate.restore();
    }
    const state = await app.state();
    expect(state.panels.open.map((p: { id: string }) => p.id)).toContain("rq5_next");
    // The failed answer was not stored, so it adds no wait: only the earlier test's answer is waiting.
    expect(state.panels.waiting).toEqual([{ step: "rq2_step", panel: "rq2" }]);
  });
});

describe("step acceptance is one queued command", () => {
  const CASE = "case_20261107T061312Z_820737";
  let keeper: FakeKeeper;
  let app: DeskApp;
  const completed: Record<string, unknown>[] = [];

  beforeAll(async () => {
    keeper = fakeCaseKeeper((r) => {
      switch (r.verb) {
        case "authority_approvals":
          return { json: { ok: true, approvals: [] } };
        case "approval_list":
          return { json: { approvals: [] } };
        case "case_list":
          return { json: { cases: [{ case_id: CASE, case_state: "active", summary: "Ship the checkout fix", created_at: "2026-11-07T06:13:12.793Z" }], unreadable: [] } };
        case "case_get_horizon":
          return { json: { case_id: CASE, case_state: "active", items: [{ plan_item_id: "signoff_release", name: "operator sign-off", item_kind: "human_task", execution: "active", settlement: "unsettled", last_event_at: "2026-11-07T10:00:00Z" }] } };
        case "case_get_overview":
          return { json: { case_id: CASE, case_state: "active", summary: "x", created_at: "t", item_count: 1, stages: [], run_ids: [], settlements: [], digest: { ref: `case:${CASE}`, expected_digest: "sha256:o1" } } };
        case "human_task_complete":
          completed.push(r);
          return { json: { ok: true } };
        default:
          return { json: { ok: false, error_class: "unscripted_verb" } };
      }
    });
    app = await startDeskApp({ approvals: { socketPath: keeper.socketPath, service: { actor_id: "cognate-service", role: "service" }, operator: { actor_id: "actor:operator", role: "operator" }, timeoutMs: 1_500 } });
  });
  afterAll(async () => {
    await app.stop();
    keeper.stop();
  });

  const cardNow = async () => ((await app.get("/desk/decide.json")) as { cards: { id: string; blocked: string | null; preview: { accept: unknown; records: unknown[]; code: string } }[] }).cards[0]!;
  const accept = async () => {
    const card = await cardNow();
    const response = await app.post("/desk/decide", { card_id: card.id, choice: "accept", preview_code: card.preview.code, records: card.preview.records.length > 0 ? card.preview.records : [{ ref: `case:${CASE}`, expected_digest: "sha256:o1" }], reason: "done" });
    return { status: response.status, body: (await response.json()) as Record<string, any> };
  };

  test("an accept sent while an answer is being stored sees the wait that answer creates", async () => {
    expect((await app.application.applyAgentOp({ tool: "ask_human", panel: "release", ask: { id: "q1", question: "Ship it?", why_needed: "Release is waiting", options: [{ option_id: "yes", label: "Yes" }, { option_id: "no", label: "No" }] }, step: "signoff_release" })).ok).toBe(true);
    expect((await cardNow()).blocked).toBeNull();
    const gate = gateCommit(app, PANEL_ANSWERS_COLLECTION);
    try {
      const answered = person(app, { op: "human.answer", panel: "release", ask: "q1", outcome: "answered", value: "yes" });
      await gate.reached;
      const accepted = accept();
      await settle();
      gate.release();
      const [answerResponse, refused] = await Promise.all([answered, accepted]);
      expect(answerResponse.status).toBe(200);
      expect(refused.status).toBe(409);
      expect(refused.body.message).toContain("has not replied yet");
    } finally {
      gate.restore();
    }
    expect(completed).toHaveLength(0);
  });
});

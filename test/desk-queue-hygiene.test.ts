/**
 * Design v3, step 2 (part E): the agent door reads its request body before the command is queued, and step acceptance looks up its
 * card outside the queue. Each proof goes through the application's own entry points. The body is held open by a stream that is
 * released by the test; the case keeper's approval listing is held by a hanging reply.
 */
import { revisionOf } from "./support/answer-revision.ts";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PANEL_ANSWERS_COLLECTION } from "../src/capabilities/panel-answers.ts";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { fakeCaseKeeper, type FakeKeeper } from "./support/fake-case-keeper.ts";
import { withRequestId } from "./support/request-body.ts";

const keys = { ag_alice: randomBytes(32).toString("hex") };
const sha = (k: string) => createHash("sha256").update(k).digest("hex");
const writeRegistry = (app: DeskApp) => {
  const entries = [{ key_id: "ag_alice", name: "Alice", sha256: sha(keys.ag_alice), added: "2026-11-07T09:00:00.000Z" }];
  writeFileSync(join(dirname(app.application.loaded.agentKeyPath), "agents.json"), JSON.stringify({ schema: "horizon.agents/1", agents: entries }));
};
const surface = (id: string) => ({ tool: "show_surface" as const, surface: { id, title: `Panel ${id}`, blocks: [{ type: "callout", id: "c1", tone: "ok", text: "Looks fine" }] } });
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 200));
const q = (id: string) => ({ id, question: `Which plan for ${id}?`, why_needed: "x", options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }] });

type Commit = { readonly records?: readonly { readonly collection: string }[] };
/** Holds the first commit that writes `collection` until `release` is called. */
function gateCommit(app: DeskApp, collection: string) {
  const store = app.application.runtime.runtime.store as unknown as { commit: (intent: Commit) => Promise<unknown> };
  const original = store.commit.bind(store);
  let armed = true;
  let open!: () => void;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  let hit!: () => void;
  const reached = new Promise<void>((resolve) => {
    hit = resolve;
  });
  store.commit = async (intent) => {
    if (armed && (intent.records ?? []).some((r) => r.collection === collection)) {
      armed = false;
      hit();
      await gate;
    }
    return original(intent);
  };
  return { reached, release: () => open(), restore: () => (store.commit = original) };
}
const within = <T>(promise: Promise<T>, ms: number): Promise<"timeout" | T> => Promise.race([promise, new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms))]);

describe("the agent door reads its body before queueing", () => {
  let app: DeskApp;
  beforeAll(async () => {
    app = await startDeskApp();
    writeRegistry(app);
  });
  afterAll(async () => app.stop());

  test("a slow body does not block another queued command, and the held request completes once its body arrives", async () => {
    const encoder = new TextEncoder();
    let finish!: () => void;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"tool":"show_surface","request_id":"held-body-1","surface":'));
        finish = () => {
          controller.enqueue(encoder.encode(JSON.stringify(surface("held_body").surface) + "}"));
          controller.close();
        };
      },
    });
    const held = fetch(`${app.base}/agent/panels`, { method: "POST", headers: { authorization: `Bearer ${keys.ag_alice}`, "content-type": "application/json" }, body, duplex: "half" } as RequestInit);
    await settle();
    // While the body is still open, a panel command goes through the queue and finishes.
    const other = await within(app.application.applyAgentOp(surface("body_free")), 2_000);
    expect(other).not.toBe("timeout");
    expect(other).toMatchObject({ ok: true });
    finish();
    const response = await within(held, 5_000);
    expect(response).not.toBe("timeout");
    expect((response as Response).status).toBe(200);
    expect(((await app.state()) as { panels: { open: { id: string }[] } }).panels.open.map((p) => p.id)).toEqual(expect.arrayContaining(["body_free", "held_body"]));
  });
});

describe("step acceptance looks up its card outside the queue", () => {
  const CASE = "case_20261107T061312Z_820737";
  let keeper: FakeKeeper;
  let app: DeskApp;
  let holdApprovals = false;
  const completed: Record<string, unknown>[] = [];

  beforeAll(async () => {
    keeper = fakeCaseKeeper((r) => {
      switch (r.verb) {
        case "authority_approvals":
          return { json: { ok: true, approvals: [] } };
        case "approval_list":
          if (holdApprovals) {
            holdApprovals = false;
            return { hang: true };
          }
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
  const acceptBody = (card: { id: string; preview: { code: string; records: unknown[] } }) => ({ card_id: card.id, choice: "accept", preview_code: card.preview.code, records: card.preview.records.length > 0 ? card.preview.records : [{ ref: `case:${CASE}`, expected_digest: "sha256:o1" }], reason: "done" });

  test("a slow keeper lookup does not hold the queue: a panel command finishes while the lookup waits", async () => {
    const card = await cardNow();
    holdApprovals = true;
    const accepted = app.post("/desk/decide", acceptBody(card));
    await settle();
    const started = Date.now();
    const put = await within(app.application.applyAgentOp(surface("lookup_free")), 1_000);
    expect(put).not.toBe("timeout");
    expect(put).toMatchObject({ ok: true });
    expect(Date.now() - started).toBeLessThan(1_000);
    const response = await accepted;
    expect(response.status).toBe(200);
  });

  test("a lookup that saw a wait, then the wait was stopped before the decision ran, is refused as stale", async () => {
    expect((await app.application.applyAgentOp({ tool: "ask_human", panel: "stale", ask: { id: "q1", question: "Ship it?", why_needed: "Release is waiting", options: [{ option_id: "yes", label: "Yes" }, { option_id: "no", label: "No" }] }, step: "signoff_release" })).ok).toBe(true);
    expect((await app.application.applyAgentOp({ tool: "ask_human", panel: "other", ask: q("other_q") })).ok).toBe(true);
    expect((await app.post("/desk/panels/op", { op: "human.answer", panel: "stale", ask: "q1", ...(await revisionOf(app, "stale", "q1")), outcome: "answered", value: "yes" })).status).toBe(200);
    const card = await cardNow();
    expect(card.blocked).not.toBeNull();
    const completedBefore = completed.length;
    // Hold the queue with one answer in its store write. The stop is queued behind it, and the accept's lookup (outside the queue)
    // reads the wait before the stop runs. When the queue reaches the accept, the wait is gone.
    const gate = gateCommit(app, PANEL_ANSWERS_COLLECTION);
    try {
      const holding = app.post("/desk/panels/op", { op: "human.answer", panel: "other", ask: "other_q", ...(await revisionOf(app, "other", "other_q")), outcome: "answered", value: "a" });
      await gate.reached;
      const stopping = app.post("/desk/panels/op", { op: "human.stop_waiting", step: "signoff_release" });
      await settle();
      const accepted = app.post("/desk/decide", acceptBody(card));
      await settle();
      gate.release();
      const [holdResponse, stopped, response] = await Promise.all([holding, stopping, accepted]);
      expect(holdResponse.status).toBe(200);
      expect(stopped.status).toBe(200);
      expect(response.status).toBe(409);
      expect(((await response.json()) as { message: string }).message).toBe("The case changed after you looked. Look again, then start.");
    } finally {
      gate.restore();
    }
    expect(completed).toHaveLength(completedBefore);
  });
});

describe("the desk's panel change reads its body before queueing (R3-10)", () => {
  let app: DeskApp;
  beforeAll(async () => {
    app = await startDeskApp();
    writeRegistry(app);
  });
  afterAll(async () => app.stop());

  test("a browser body that never finishes does not block a second valid mutation", async () => {
    const encoder = new TextEncoder();
    let finish!: () => void;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"op":"human.close","request_id":"held-browser-1","id":"'));
        finish = () => {
          controller.enqueue(encoder.encode('x"}'));
          controller.close();
        };
      },
    });
    const held = fetch(`${app.base}/desk/panels/op`, { method: "POST", headers: { "content-type": "application/json" }, body, duplex: "half" } as RequestInit);
    await settle();
    // The unfinished body is held outside the queue, so a valid agent change goes through while it waits.
    const other = await within(app.application.applyAgentOp(surface("browser_free")), 2_000);
    expect(other).not.toBe("timeout");
    expect(other).toMatchObject({ ok: true });
    // The held request is still waiting for its body: it did not finish before the body arrived.
    expect(await within(held, 200)).toBe("timeout");
    finish();
    const response = await within(held, 5_000);
    expect(response).not.toBe("timeout");
    expect(((await app.state()) as { panels: { open: { id: string }[] } }).panels.open.map((p) => p.id)).toContain("browser_free");
  });
});

describe("a route claim's step lookup does not hold the queue (R3-10)", () => {
  const CASE = "case_20261107T061312Z_820737";
  let keeper: FakeKeeper;
  let app: DeskApp;
  let holdCases = false;

  beforeAll(async () => {
    keeper = fakeCaseKeeper((r) => {
      switch (r.verb) {
        case "authority_approvals":
          return { json: { ok: true, approvals: [] } };
        case "approval_list":
          return { json: { approvals: [] } };
        case "case_list":
          if (holdCases) return { hang: true };
          return { json: { cases: [{ case_id: CASE, case_state: "active", summary: "Ship the checkout fix", created_at: "2026-11-07T06:13:12.793Z" }], unreadable: [] } };
        default:
          return { json: { ok: false, error_class: "unscripted_verb" } };
      }
    });
    app = await startDeskApp({ approvals: { socketPath: keeper.socketPath, service: { actor_id: "cognate-service", role: "service" }, operator: { actor_id: "actor:operator", role: "operator" }, timeoutMs: 60_000 } });
    writeRegistry(app);
  });
  afterAll(async () => {
    holdCases = false;
    await app.stop();
    keeper.stop();
  });

  test("a route whose keeper lookup never answers finishes within its limit, and a panel command runs meanwhile", async () => {
    const asked = await fetch(`${app.base}/agent/panels`, {
      method: "POST",
      headers: { authorization: `Bearer ${keys.ag_alice}`, "content-type": "application/json", "x-horizon-agent-name": "Alice" },
      body: JSON.stringify(withRequestId({ tool: "ask_human", panel: "route_lookup", ask: { id: "q1", question: "Ship it?", why_needed: "Release is waiting", resolves: "signoff_release", options: [{ option_id: "yes", label: "Yes" }, { option_id: "no", label: "No" }] } })),
    });
    expect(asked.status).toBe(200);
    expect((await app.post("/desk/panels/op", { op: "human.answer", panel: "route_lookup", ask: "q1", ...(await revisionOf(app, "route_lookup", "q1")), outcome: "answered", value: "yes" })).status).toBe(200);
    holdCases = true;
    const routing = fetch(`${app.base}/agent/panels`, {
      method: "POST",
      headers: { authorization: `Bearer ${keys.ag_alice}`, "content-type": "application/json", "x-horizon-agent-name": "Alice" },
      body: JSON.stringify(withRequestId({ tool: "answer.route", panel_id: "route_lookup", ask_id: "q1", routed_as: "step signoff_release in Seed: triage inbox" })),
    });
    await settle();
    const started = Date.now();
    const put = await within(app.application.applyAgentOp(surface("route_free")), 1_000);
    expect(put).not.toBe("timeout");
    expect(put).toMatchObject({ ok: true });
    expect(Date.now() - started).toBeLessThan(1_000);
    const routed = await within(routing, 6_000);
    holdCases = false;
    expect(routed).not.toBe("timeout");
    const routedBody = await (routed as Response).json();
    expect(routedBody).toMatchObject({ ok: true });
    expect((routed as Response).status).toBe(200);
  }, 15_000);
});

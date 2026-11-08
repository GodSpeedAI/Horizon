/** @jsxImportSource react */
/** Panels from agents (stage 4): mapped to Horizon's blocks, capped at eight, pinned panels stay put, and an unanswered agent holds up acceptance. */
import { revisionOf } from "./support/answer-revision.ts";
import { reducerRevision } from "./support/answer-revision.ts";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import { acceptanceBlocked, listAnswers, recordAnswer, routeAnswer, stopWaiting, PANEL_ANSWERS_COLLECTION } from "../src/capabilities/panel-answers.ts";

// The desk runs panel writes one at a time (panelCommand in app.ts); a test passes the identity queue, since it runs one write at a time.
function Q<T>(command: () => Promise<T>): Promise<T> {
  return command();
}
import { START, type UiState } from "../src/ui/desk/attention.ts";
import { Desk } from "../src/ui/desk/Desk.tsx";
import { MAX_OPEN_PANELS, NO_PANELS, reduceAgent, reduceHuman, type Panels as PanelsState } from "../src/ui/desk/panels-model.ts";
import { PanelCard } from "../src/ui/desk/Panels.tsx";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { deskState } from "./support/desk-fixture.ts";
import { quietIo } from "./support/desk-io.ts";
import { fakeCaseKeeper, type FakeKeeper } from "./support/fake-case-keeper.ts";

const surface = (id: string, over: Record<string, unknown> = {}) => ({ tool: "show_surface" as const, surface: { id, title: `Panel ${id}`, blocks: [{ type: "callout", id: "c1", tone: "ok", text: "Looks fine" }], ...over } });
const must = (r: ReturnType<typeof reduceAgent>): PanelsState => {
  expect(r.result.ok).toBe(true);
  return r.state;
};
const ask = { id: "q1", question: "Ship it?", why_needed: "Release is waiting", options: [{ option_id: "yes", label: "Yes" }, { option_id: "no", label: "No" }] };
const text = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ");

describe("panels from agents", () => {
  test("at most 8 panels open", () => {
    expect(MAX_OPEN_PANELS).toBe(8);
    let state = NO_PANELS;
    for (let i = 1; i <= 12; i += 1) state = must(reduceAgent(state, surface(`p${i}`)));
    expect(state.open).toHaveLength(8);
    // The oldest made room; the newest are open.
    expect(state.open.map((p) => p.id)).toEqual(["p5", "p6", "p7", "p8", "p9", "p10", "p11", "p12"]);
    // A pinned panel is never the one that makes room.
    state = reduceHuman(state, { op: "human.pin", id: "p5", pinned: true }).state;
    state = must(reduceAgent(state, surface("p13")));
    expect(state.open).toHaveLength(8);
    expect(state.open.map((p) => p.id)).toContain("p5");
    expect(state.open.map((p) => p.id)).not.toContain("p6");
    // With every panel pinned, a new one is refused in words and nothing is lost.
    for (const p of state.open) state = reduceHuman(state, { op: "human.pin", id: p.id, pinned: true }).state;
    const refused = reduceAgent(state, surface("p14"));
    expect(refused.result.ok).toBe(false);
    if (!refused.result.ok) expect(refused.result.message).toContain("all of them are pinned");
    expect(refused.state).toBe(state);
    // The person opening one is capped the same way.
    expect(reduceHuman(state, { op: "human.open", template: "workbench" }).result.ok).toBe(false);
  });

  test("a pinned panel keeps its place on update", () => {
    let state = NO_PANELS;
    for (const id of ["a", "b", "c"]) state = must(reduceAgent(state, surface(id)));
    state = reduceHuman(state, { op: "human.pin", id: "b", pinned: true }).state;
    state = must(reduceAgent(state, surface("b", { title: "B, newer", blocks: [{ type: "metric", id: "m1", label: "Open", value: "3" }] })));
    expect(state.open.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(state.open[1]).toMatchObject({ id: "b", title: "B, newer", pinned: true });
    expect(state.open[1]!.blocks[0]).toMatchObject({ kind: "text", label: "Open", text: "3" });
    // An agent cannot remove what the person pinned; it can remove what is not pinned.
    const stopped = reduceAgent(state, { tool: "arrange", action: { op: "surface.remove", id: "b" } });
    expect(stopped.result.ok).toBe(false);
    expect(stopped.state.open.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(reduceAgent(state, { tool: "arrange", action: { op: "surface.remove", id: "a" } }).state.open.map((p) => p.id)).toEqual(["b", "c"]);
    // An answered question stays answered when the agent redraws the panel.
    let asked = must(reduceAgent(NO_PANELS, { tool: "ask_human", panel: "q", ask }));
    asked = reduceHuman(asked, { op: "human.answer", panel: "q", ask: "q1", ...reducerRevision(asked, "q", "q1"), outcome: "answered", value: "yes" }).state;
    asked = must(reduceAgent(asked, surface("q", { blocks: [{ type: "ask", ...ask }] })));
    expect(asked.open[0]!.blocks[0]).toMatchObject({ kind: "question", answered: { outcome: "answered", value: "yes" } });
  });

  test("what an agent sends is mapped to Horizon's blocks and shown as text", () => {
    const state = must(reduceAgent(NO_PANELS, surface("x", { blocks: [{ type: "callout", id: "c", tone: "danger", text: "<script>alert(1)</script>" }, { type: "graph", id: "g" }, { type: "mystery", id: "z" }, { type: "ask", id: "bad", question: "one option", options: [{ option_id: "a", label: "A" }] }] })));
    expect(state.open[0]!.blocks.map((b) => b.kind)).toEqual(["text", "unavailable", "unavailable", "unavailable"]);
    const html = renderToStaticMarkup(<PanelCard panel={{ ...state.open[0]!, pinned: true }} io={quietIo().panels} />);
    expect(html).not.toContain("<script>");
    expect(text(html)).toContain("<script>alert(1)</script>");
    expect(text(html)).toContain("cannot be shown");
  });

  test("a card in the conversation says what is waiting, in plain words; the old list is gone", () => {
    let state = must(reduceAgent(NO_PANELS, { tool: "ask_human", panel: "release", ask, step: "signoff_release" }));
    state = must(reduceAgent(state, surface("notes")));
    const waiting = [{ step: "signoff_release", panel: "release" }];
    const rows = [
      { row_id: "r1", at: "2026-11-07T10:00:00Z", source: "agent" as const, kind: "panel" as const, words: "Ship it?", outcome: "An agent put this up.", status: "waiting" as const, refs: { panel_id: "release" } },
      { row_id: "r2", at: "2026-11-07T10:01:00Z", source: "agent" as const, kind: "panel" as const, words: "notes", outcome: "An agent put this up.", status: "done" as const, refs: { panel_id: "notes" } },
    ];
    const ui: UiState = { ...START, view: "conversation", rows, data: deskState({ panels: { ...state, waiting } }) };
    const html = renderToStaticMarkup(<Desk ui={ui} dispatch={() => undefined} io={quietIo()} nowMs={Date.parse("2026-11-07T12:00:00Z")} />);
    const words = text(html);
    expect(words).not.toContain("From agents");
    expect(words).toContain("Needs you (1)");
    expect(words).toContain("Ship it?");
    expect(words).toContain("Waiting for the agent to reply");
    expect(words).toContain("Stop waiting");
    expect(html).toContain('aria-pressed="false"');
    // The card with no open question folds to its title and summary.
    expect(html).toMatch(/data-panel-id="notes"[^>]*data-folded="yes"/);
    expect(html).toMatch(/data-panel-id="release"[^>]*data-folded="no"/);
  });
});

describe("answers are kept", () => {
  test("an answer is recorded unreplied; a reply or the person's choice clears it", async () => {
    const store = createMemoryStore();
    const now = new Date("2026-11-07T10:00:00Z");
    const a = await recordAnswer(store, { tenant: "t", panel_id: "release", ask: "q1", outcome: "answered", value: "yes", step: "signoff", asked_by_key: "ag_alice", now });
    const b = await recordAnswer(store, { tenant: "t", panel_id: "release", ask: "q2", outcome: "deferred", step: "signoff", now });
    expect([a.n, b.n]).toEqual([1, 2]);
    // "Not yet" is not an answer and waits for nobody (store-design-v2 section 3): it does not block the step.
    // The state is stored once, on the answer; replied and waiting_on are derived from it (they are not stored any more).
    expect((await store.getRecord(PANEL_ANSWERS_COLLECTION, "answer:release:2"))?.value).toMatchObject({ state: "put_off", outcome: null, step: "signoff" });
    expect((await store.getRecord(PANEL_ANSWERS_COLLECTION, "answer:release:2"))?.value).not.toHaveProperty("replied");
    expect((await listAnswers(store, "t", "release"))[1]).toMatchObject({ replied: true, outcome: null, waiting_on: "none", state: "put_off" });
    // q1 is answered and waits for the agent, so the step is blocked; the put-off q2 waits for nobody.
    expect(acceptanceBlocked(await listAnswers(store, "t"), "signoff")).toBe(true);
    expect(acceptanceBlocked(await listAnswers(store, "t"), "another_step")).toBe(false);
    // A later agent call is no reply; only a route that says where it went closes the answer.
    expect((await routeAnswer(store, "t", "release", "q1", "ok", "ag_alice", Q)).ok).toBe(false);
    expect(acceptanceBlocked(await listAnswers(store, "t"), "signoff")).toBe(true);
    expect(await routeAnswer(store, "t", "release", "q1", "step handoff_0a49 in Seed: triage inbox", "ag_alice", Q)).toEqual({ ok: true, closed: 1 });
    expect(acceptanceBlocked(await listAnswers(store, "t"), "signoff")).toBe(false);
    // Nothing waits for the agent about the put-off question, so there is nothing to route.
    expect(await routeAnswer(store, "t", "release", "q2", "no action: put off by the person", "ag_alice", Q)).toMatchObject({ ok: false });
    expect((await listAnswers(store, "t", "release"))[0]).toMatchObject({ replied: true, routed_as: "step handoff_0a49 in Seed: triage inbox" });
    expect(acceptanceBlocked(await listAnswers(store, "t"), "signoff")).toBe(false);
    await recordAnswer(store, { tenant: "t", panel_id: "other", ask: "q", outcome: "answered", value: "no", step: "s2", now });
    expect(await stopWaiting(store, "t", "s2", Q)).toBe(1);
    expect((await listAnswers(store, "t", "other"))[0]).toMatchObject({ replied: true, note: "You chose to stop waiting for the agent." });
    expect(acceptanceBlocked([{ step: "s", replied: false }, { step: "s", replied: true }], "s")).toBe(true);
  });
});

describe("acceptance through the application", () => {
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
    // A real browser could send a stale button; the server decides from its own view of the card.
    const response = await app.post("/desk/decide", { card_id: card.id, choice: "accept", preview_code: card.preview.code, records: card.preview.records.length > 0 ? card.preview.records : [{ ref: `case:${CASE}`, expected_digest: "sha256:o1" }], reason: "done" });
    return { status: response.status, body: (await response.json()) as Record<string, any> };
  };

  test("acceptance is blocked until the agent replies", async () => {
    expect((await cardNow()).blocked).toBeNull();
    // An agent asks about the step; the person answers.
    expect((await app.application.applyAgentOp({ tool: "ask_human", panel: "release", ask, step: "signoff_release" })).ok).toBe(true);
    const answered = await app.post("/desk/panels/op", { op: "human.answer", panel: "release", ask: "q1", ...(await revisionOf(app, "release", "q1")), outcome: "answered", value: "yes" });
    expect(answered.status).toBe(200);
    expect((await app.state()).panels.waiting).toEqual([{ step: "signoff_release", panel: "release" }]);
    // The card turns accept off, in words; the server refuses an accept anyway; nothing reaches the case keeper.
    const blocked = await cardNow();
    expect(blocked.blocked).toContain("has not replied yet");
    expect(blocked.preview.accept).toBeNull();
    const refused = await accept();
    expect(refused.status).toBe(409);
    expect(refused.body.message).toContain("has not replied yet");
    expect(completed).toHaveLength(0);
    // Reading the answer and annotating the panel are not replies. Saying where it went is.
    await app.application.applyAgentOp({ tool: "read_responses" });
    expect((await app.application.applyAgentOp({ tool: "annotate", panel: "release", text: "Thanks, noted." })).ok).toBe(true);
    expect((await cardNow()).blocked).not.toBeNull();
    expect((await app.application.applyAgentOp({ tool: "answer.route", panel_id: "release", ask_id: "q1", routed_as: "no" } as never)).ok).toBe(false);
    expect((await cardNow()).blocked).not.toBeNull();
    expect((await app.application.applyAgentOp({ tool: "answer.route", panel_id: "release", ask_id: "q1", routed_as: "step signoff_release: release approved" } as never)).ok).toBe(true);
    expect((await cardNow()).blocked).toBeNull();
    expect((await app.state()).panels.waiting).toEqual([]);
    const ok = await accept();
    expect(ok.status).toBe(200);
    expect(completed).toHaveLength(1);
  });

  test("the person can stop waiting for an agent that will not reply", async () => {
    await app.application.applyAgentOp({ tool: "ask_human", panel: "release2", ask: { ...ask, id: "q9" }, step: "signoff_release" });
    // Answered (not put off): only an answer waits for the agent. A put-off question does not (store-design-v2 section 3).
    await app.post("/desk/panels/op", { op: "human.answer", panel: "release2", ask: "q9", ...(await revisionOf(app, "release2", "q9")), outcome: "answered", value: "yes" });
    expect((await cardNow()).blocked).not.toBeNull();
    const stopped = await app.post("/desk/panels/op", { op: "human.stop_waiting", step: "signoff_release" });
    expect(stopped.status).toBe(200);
    expect((await cardNow()).blocked).toBeNull();
  });

  test("an answer to a question that is not open, or with no choice, is refused", async () => {
    expect((await app.post("/desk/panels/op", { op: "human.answer", panel: "nope", ask: "q1", ...(await revisionOf(app, "nope", "q1")), outcome: "answered", value: "yes" })).status).toBe(409);
    await app.application.applyAgentOp({ tool: "ask_human", panel: "p3", ask: { ...ask, id: "q3" } });
    expect((await app.post("/desk/panels/op", { op: "human.answer", panel: "p3", ask: "q3", ...(await revisionOf(app, "p3", "q3")), outcome: "answered" })).status).toBe(400);
    expect((await app.post("/desk/panels/op", { op: "human.pin", id: "p3", pinned: true })).status).toBe(200);
    expect((await app.state()).panels.open.find((p: any) => p.id === "p3").pinned).toBe(true);
  });
});

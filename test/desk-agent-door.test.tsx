import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { conversationWaiting, START, type UiState } from "../src/ui/desk/attention.ts";
import { answerEcho } from "../src/ui/desk/conversation-model.ts";
import { Desk } from "../src/ui/desk/Desk.tsx";
import { PanelCard, echoesOf } from "../src/ui/desk/Panels.tsx";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { deskState } from "./support/desk-fixture.ts";
import { quietIo } from "./support/desk-io.ts";

const select = { id: "which_way", question: "Which plan should we use?", why_needed: "Two plans", options: [{ option_id: "plan_a", label: "Plan A" }, { option_id: "plan_b", label: "Plan B" }] };
const multi = { id: "many", input: "multiselect", question: "Which parts?", why_needed: "x", options: [{ option_id: "o1", label: "Part one" }, { option_id: "o2", label: "Part two" }] };

let app: DeskApp;
let key: string;
beforeAll(async () => {
  app = await startDeskApp();
  key = app.application.loaded.launchSecret;
});
afterAll(async () => app.stop());

const door = (path: string, body?: unknown, auth: string | null = `Bearer ${key}`, extra: Record<string, string> = {}) =>
  fetch(`${app.base}${path}`, { method: body === undefined ? "GET" : "POST", headers: { ...(auth === null ? {} : { authorization: auth }), "content-type": "application/json", ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const rows = async (): Promise<any[]> => (await (await fetch(`${app.base}/desk/conversation`)).json()).rows;

describe("the agent door", () => {
  test("no key and a wrong key are refused, and nothing changes", async () => {
    const op = { tool: "ask_human", panel: "nokey", ask: select };
    expect((await door("/agent/panels", op, null)).status).toBe(401);
    expect((await door("/agent/panels", op, "Bearer wrong")).status).toBe(401);
    expect((await door("/agent/panels", op, null, { "x-horizon-source": "page-agent" })).status).toBe(401);
    expect((await door("/agent/panels/catalogue", undefined, null)).status).toBe(401);
    expect((await door("/agent/panels/answers", undefined, "Bearer wrong")).status).toBe(401);
    expect((await app.state()).panels.open.some((p: any) => p.id === "nokey")).toBe(false);
  });

  test("a page agent cannot use the door even with the key", async () => {
    expect((await door("/agent/panels", { tool: "read_responses" }, `Bearer ${key}`, { "x-horizon-source": "page-agent" })).status).toBe(403);
  });

  test("an authenticated put shows in the desk state and the conversation, as the agent", async () => {
    const put = await door("/agent/panels", { tool: "ask_human", panel: "plan", ask: select }, `Bearer ${key}`, { "x-horizon-agent-name": "Builder" });
    expect(put.status).toBe(200);
    expect((await app.state()).panels.open.some((p: any) => p.id === "plan")).toBe(true);
    const row = (await rows()).find((r) => r.kind === "panel" && r.refs.panel_id === "plan");
    expect(row.source).toBe("agent");
    expect(row.agent_name).toBe("Builder");
    expect(row.status).toBe("waiting");
    const cat = await (await door("/agent/panels/catalogue")).json();
    expect(Object.keys(cat.blocks).length).toBeGreaterThan(5);
    expect((await door("/agent/panels", { tool: "show_surface", surface: { id: "show1", blocks: [{ type: "callout", id: "c1", tone: "ok", text: "Fine" }] } })).status).toBe(200);
    expect((await door("/agent/panels", { tool: "annotate", panel: "show1", text: "Noted." })).status).toBe(200);
    expect((await door("/agent/panels", { tool: "arrange", action: { op: "surface.remove", id: "show1" } })).status).toBe(200);
    expect((await app.state()).panels.open.some((p: any) => p.id === "show1")).toBe(false);
  });

  test("the person's operations are refused over the door", async () => {
    for (const body of [{ op: "human.answer", panel: "plan", ask: "which_way", outcome: "answered", value: "plan_a" }, { op: "human.close", id: "plan" }, { op: "human.pin", id: "plan", pinned: true }]) {
      expect((await door("/agent/panels", body)).status).toBe(403);
    }
    expect((await door("/agent/panels", { tool: "nonsense" })).status).toBe(400);
    expect((await app.state()).panels.open.find((p: any) => p.id === "plan").pinned).toBe(false);
  });

  test("one entry per answer: labels, waiting, then done by answer.route; the panel entry is not left waiting", async () => {
    await door("/agent/panels", { tool: "ask_human", panel: "plan2", ask: select });
    await door("/agent/panels", { tool: "ask_human", panel: "plan2", ask: multi });
    expect((await app.post("/desk/panels/op", { op: "human.answer", panel: "plan2", ask: "which_way", outcome: "answered", value: "plan_a" })).status).toBe(200);
    let mine = (await rows()).filter((r) => r.kind === "answer" && r.refs.panel_id === "plan2");
    expect(mine).toHaveLength(1);
    expect(mine[0].words).toBe("You answered: Plan A");
    expect(mine[0].status).toBe("waiting");
    expect(mine[0].outcome).toBe("Waiting for the agent to say where it went");
    // one question is still open, so the panel is still waiting for you
    expect((await rows()).find((r) => r.kind === "panel" && r.refs.panel_id === "plan2").status).toBe("waiting");
    expect((await app.post("/desk/panels/op", { op: "human.answer", panel: "plan2", ask: "many", outcome: "answered", value: ["o1", "o2"] })).status).toBe(200);
    expect((await rows()).find((r) => r.kind === "panel" && r.refs.panel_id === "plan2").status).toBe("done");
    const waiting = await (await door("/agent/panels/answers")).json();
    expect(waiting.responses.filter((a: any) => a.panel_id === "plan2")).toHaveLength(2);
    expect((await door("/agent/panels", { tool: "answer.route", panel_id: "plan2", ask_id: "which_way", routed_as: "no" })).status).toBe(400);
    expect((await door("/agent/panels", { tool: "answer.route", panel_id: "plan2", ask_id: "which_way", routed_as: "step s1 in Seed: triage" })).status).toBe(200);
    mine = (await rows()).filter((r) => r.kind === "answer" && r.refs.panel_id === "plan2" && r.refs.ask_id === "which_way");
    expect(mine).toHaveLength(1);
    expect(mine[0].status).toBe("done");
    expect(mine[0].outcome).toBe("The agent took it to: step s1 in Seed: triage");
    expect(mine[0].words).toBe("You answered: Plan A");
    expect((await door("/agent/panels/answers").then((r) => r.json())).responses.filter((a: any) => a.ask === "which_way")).toHaveLength(0);
    const text = JSON.stringify(await rows());
    expect(text).not.toContain("plan_a");
    expect(text).not.toContain("Your answer to which_way");
  });

  test("withdraw closes the question's entry with the reason", async () => {
    await door("/agent/panels", { tool: "ask_human", panel: "plan3", ask: select });
    expect((await door("/agent/panels", { tool: "ask.withdraw", panel_id: "plan3", ask_id: "which_way", reason: "Found it myself" })).status).toBe(200);
    const row = (await rows()).find((r) => r.kind === "panel" && r.refs.panel_id === "plan3");
    expect(row.status).toBe("done");
    expect(row.outcome).toBe("The agent withdrew this question: Found it myself");
  });
});

describe("answer words", () => {
  const sel = { input: "select", options: select.options };
  test("labels, yes/no, text, not yet, skip", () => {
    expect(answerEcho(sel, "answered", "plan_b")).toBe("You answered: Plan B");
    expect(answerEcho({ input: "multiselect", options: multi.options }, "answered", ["o1", "o2"])).toBe("You answered: Part one, Part two");
    expect(answerEcho({ input: "confirm", options: [] }, "answered", "yes")).toBe("You answered: Yes");
    expect(answerEcho({ input: "confirm", options: [] }, "answered", "no")).toBe("You answered: No");
    expect(answerEcho({ input: "text", options: [] }, "answered", "x".repeat(300)).length).toBeLessThan(150);
    expect(answerEcho(sel, "deferred", null)).toBe("You said not yet.");
    expect(answerEcho(sel, "cancelled", null)).toBe("You skipped this question.");
  });
});

describe("what waits for you, in one number", () => {
  const panel = (answered: unknown) => ({ id: "p", title: "Plan", step: null, pinned: false, notes: [], blocks: [{ kind: "text", id: "t", text: "Summary words", tone: "neutral" }, { kind: "question", id: "q", question: "Which?", why_needed: "", options: select.options, answered, withdrawn: null }] }) as any;
  const row = (kind: string, status: string) => ({ row_id: `r${Math.random()}`, at: "2026-11-06T10:00:00.000Z", source: "you", kind, words: "w", outcome: "o", status, refs: {} }) as any;
  test("open questions, proposals and your previews count; answers waiting for the agent do not; nav, button and header agree", () => {
    const rowsIn = [row("handoff-proposal", "waiting"), row("handoff", "waiting"), row("answer", "waiting"), row("panel", "waiting"), row("note", "done")];
    expect(conversationWaiting(rowsIn, [panel(null)])).toBe(3);
    expect(conversationWaiting(rowsIn, [panel({ outcome: "answered", value: "plan_a", note: null })])).toBe(2);
    const ui: UiState = { ...START, view: "conversation", data: deskState({ panels: { open: [panel(null)], max: 8, waiting: [] } }), rows: rowsIn };
    const html = renderToStaticMarkup(<Desk ui={ui} dispatch={() => undefined} io={quietIo()} nowMs={Date.parse("2026-11-07T12:00:00Z")} />);
    expect(html).toContain("Needs you (3)");
    const today = renderToStaticMarkup(<Desk ui={{ ...ui, view: "today" }} dispatch={() => undefined} io={quietIo()} nowMs={Date.parse("2026-11-07T12:00:00Z")} />);
    expect(today).toContain("Conversation (3)");
    expect(html).toMatch(/data-count="conversation"[^>]*> \(3\)/);
  });
  test("a folded panel keeps the answer echo in its summary line", () => {
    const answered = panel({ outcome: "answered", value: "plan_a", note: null });
    expect(echoesOf(answered)).toEqual(["You answered: Plan A Waiting for the agent to say where it went."]);
    const html = renderToStaticMarkup(<PanelCard panel={answered} io={quietIo().panels} />);
    const summary = /<summary>([\s\S]*?)<\/summary>/.exec(html)![1]!;
    expect(summary).toContain("You answered: Plan A");
    expect(summary).toContain("Waiting for the agent to say where it went");
    const routed = panel({ outcome: "answered", value: "plan_a", note: null, routed_as: "step s1 in Seed" });
    expect(renderToStaticMarkup(<PanelCard panel={routed} io={quietIo().panels} />)).toContain("The agent took it to: step s1 in Seed");
  });
});

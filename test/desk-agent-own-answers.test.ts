import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";

let app: DeskApp;
let key: string;
beforeAll(async () => {
  app = await startDeskApp();
  key = app.application.loaded.agentKey;
});
afterAll(async () => app.stop());

const q = (id: string) => ({ id, question: `Which plan for ${id}?`, why_needed: "x", options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }] });
const as = (name: string, path: string, body?: unknown) =>
  fetch(`${app.base}${path}`, { method: body === undefined ? "GET" : "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-horizon-agent-name": name }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const answers = async (name: string): Promise<any[]> => ((await (await as(name, "/agent/panels/answers")).json()) as any).responses;

describe("an agent reads only the answers to its own questions", () => {
  test("agent B cannot read agent A's answer, and A can", async () => {
    expect((await as("Alice", "/agent/panels", { tool: "ask_human", panel: "alice_panel", ask: q("alice_q") })).status).toBe(200);
    expect((await as("Bob", "/agent/panels", { tool: "ask_human", panel: "bob_panel", ask: q("bob_q") })).status).toBe(200);
    for (const [panel, ask] of [["alice_panel", "alice_q"], ["bob_panel", "bob_q"]] as const) {
      const sent = await fetch(`${app.base}/desk/panels/op`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "human.answer", panel, ask, outcome: "answered", value: "a" }) });
      expect(sent.status).toBe(200);
    }
    expect((await answers("Alice")).map((a) => a.ask)).toEqual(["alice_q"]);
    expect((await answers("Bob")).map((a) => a.ask)).toEqual(["bob_q"]);
    expect((await answers("Carol")).length).toBe(0);
  });

  test("a later put by another agent does not change who asked", async () => {
    await as("Alice", "/agent/panels", { tool: "ask_human", panel: "keep_panel", ask: q("keep_q") });
    await as("Bob", "/agent/panels", { tool: "ask_human", panel: "keep_panel", ask: q("keep_q") });
    await fetch(`${app.base}/desk/panels/op`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "human.answer", panel: "keep_panel", ask: "keep_q", outcome: "answered", value: "b" }) });
    expect((await answers("Alice")).some((a) => a.ask === "keep_q")).toBe(true);
    expect((await answers("Bob")).some((a) => a.ask === "keep_q")).toBe(false);
  });

  test("agent B cannot say where agent A's answer went", async () => {
    const routed = await as("Bob", "/agent/panels", { tool: "answer.route", panel_id: "alice_panel", ask_id: "alice_q", routed_as: "no action: not mine" });
    expect(routed.status).toBeGreaterThanOrEqual(400);
    expect((await answers("Alice")).some((a) => a.ask === "alice_q")).toBe(true);
  });
});

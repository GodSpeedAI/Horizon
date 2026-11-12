/**
 * A question moved to another agent after it was answered (finding R3-11). The move's conversation row used to stay "waiting" after the
 * new owner routed the answer, a permanent false wait. The move is now a completed note naming the panel and the question, and the
 * route clears the wait.
 */
import { revisionOf } from "./support/answer-revision.ts";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";
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
/**
 * A call at the agent door. The door refuses `answer.route` and `ask.withdraw` at this freeze
 * (R5-01), so those two go to the same function the door calls after its checks; everything else
 * still goes over the door's own HTTP route.
 */
const agent = (app: DeskApp, key: string, name: string, body: unknown) => {
  const tool = (body as { readonly tool?: unknown }).tool;
  if (tool === "answer.route" || tool === "ask.withdraw") {
    const keyId = Object.entries(keys).find(([, value]) => value === key)?.[0] ?? key;
    return agentInProcess(app.application, keyId, name, body);
  }
  return fetch(`${app.base}/agent/panels`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-horizon-agent-name": name }, body: JSON.stringify(withRequestId(body)) });
};
const person = (app: DeskApp, body: unknown) => fetch(`${app.base}/desk/panels/op`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(withRequestId(body)) });
const rowsOf = async (app: DeskApp): Promise<any[]> => (await (await fetch(`${app.base}/desk/conversation`)).json()).rows;

describe("a question moved after it was answered leaves no waiting row once it is routed", () => {
  let app: DeskApp;
  beforeAll(async () => {
    app = await startDeskApp();
    writeRegistry(app);
    expect((await agent(app, keys.ag_alice, "Alice", { tool: "ask_human", panel: "rr_panel", ask: q("rr_q") })).status).toBe(200);
    expect((await person(app, { op: "human.answer", panel: "rr_panel", ask: "rr_q", ...(await revisionOf(app, "rr_panel", "rr_q")), outcome: "answered", value: "a" })).status).toBe(200);
  });
  afterAll(async () => app.stop());

  test("answer, reassign, then route: no waiting row remains for the question, and the move is still shown", async () => {
    const moved = await person(app, { op: "human.reassign_owner", panel: "rr_panel", ask: "rr_q", from_key_id: "ag_alice", to_key_id: "ag_alice2", confirmed: true });
    expect(moved.status).toBe(200);
    const routed = await agent(app, keys.ag_alice2, "Alice 2", { tool: "answer.route", panel_id: "rr_panel", ask_id: "rr_q", routed_as: "step handoff_0a49 in Seed" });
    expect(routed.status).toBe(200);

    const rows = await rowsOf(app);
    expect(rows.filter((r) => r.status === "waiting" && JSON.stringify(r).includes("rr_q"))).toEqual([]);
    const note = rows.find((r) => typeof r.words === "string" && r.words.includes("from Alice to Alice 2"));
    expect(note).toMatchObject({ kind: "note", status: "done", refs: { panel_id: "rr_panel", ask_id: "rr_q" } });
  });
});

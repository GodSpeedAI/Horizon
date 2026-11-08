/** Step 2: "Not yet" keeps the question open. The same agent may put the same words again, and the person can still answer. */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";

let app: DeskApp;
const key = randomBytes(32).toString("hex");
beforeAll(async () => {
  app = await startDeskApp();
  const registry = join(dirname(app.application.loaded.agentKeyPath), "agents.json");
  writeFileSync(registry, JSON.stringify({ schema: "horizon.agents/1", agents: [{ key_id: "ag_alice", name: "Alice", sha256: createHash("sha256").update(key).digest("hex"), added: "2026-11-07T09:00:00.000Z" }] }));
});
afterAll(async () => app.stop());

const ask = { id: "deferred_q", question: "Which plan for the deferred case?", why_needed: "x", options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }] };
const agent = (body: unknown) => fetch(`${app.base}/agent/panels`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-horizon-agent-name": "Alice" }, body: JSON.stringify(body) });
const person = (body: unknown) => fetch(`${app.base}/desk/panels/op`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("a question put off can still be answered", () => {
  test("defer, put the same words again, answer: the answer is stored", async () => {
    expect((await agent({ tool: "ask_human", panel: "deferred_panel", ask })).status).toBe(200);
    expect((await person({ op: "human.answer", panel: "deferred_panel", ask: "deferred_q", outcome: "deferred" })).status).toBe(200);
    expect((await agent({ tool: "ask_human", panel: "deferred_panel", ask })).status).toBe(200);
    const answered = await person({ op: "human.answer", panel: "deferred_panel", ask: "deferred_q", outcome: "answered", value: "a" });
    expect(answered.status).toBe(200);
    expect(await answered.json()).toMatchObject({ ok: true });
  });
});

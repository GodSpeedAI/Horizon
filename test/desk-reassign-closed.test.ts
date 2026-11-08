/**
 * Finding R2-4: a question whose panel was closed still belongs to its owner in the panel's own record. Reassigning it moves the answer,
 * the panel record and the conversation row in one commit, so the old owner cannot publish over it or remove it afterwards.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PANELS_COLLECTION } from "../src/capabilities/panel-records.ts";
import { revisionOf } from "./support/answer-revision.ts";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";

const keys = { ag_alice: randomBytes(32).toString("hex"), ag_alice2: randomBytes(32).toString("hex") };
const sha = (k: string) => createHash("sha256").update(k).digest("hex");
const apps: DeskApp[] = [];
const open = async () => {
  const app = await startDeskApp({});
  apps.push(app);
  writeFileSync(join(dirname(app.application.loaded.agentKeyPath), "agents.json"), JSON.stringify({
    schema: "horizon.agents/1",
    agents: [
      { key_id: "ag_alice", name: "Alice", sha256: sha(keys.ag_alice), added: "2026-11-07T09:00:00.000Z" },
      { key_id: "ag_alice2", name: "Alice 2", sha256: sha(keys.ag_alice2), added: "2026-11-07T09:00:00.000Z" },
    ],
  }));
  return app;
};
afterAll(async () => {
  for (const app of apps) await app.stop().catch(() => undefined);
});

const q = { id: "q1", question: "Which plan?", why_needed: "x", options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }] };
let seq = 0;
const rid = (): string => `r2-4-${seq++}`;
const agent = (app: DeskApp, key: string, body: unknown) =>
  fetch(`${app.base}/agent/panels`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-horizon-agent-name": "Alice" }, body: JSON.stringify(({ request_id: rid(), ...(body as object) })) });
const person = (app: DeskApp, body: unknown) => fetch(`${app.base}/desk/panels/op`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(({ request_id: rid(), ...(body as object) })) });
const storedQuestion = async (app: DeskApp) => {
  const row = await app.application.runtime.runtime.store.getRecord(PANELS_COLLECTION, "panel:open_panel");
  return (row?.value as { blocks: { kind: string; id: string; owner_key?: string | null }[] } | undefined)?.blocks.find((b) => b.kind === "question" && b.id === "q1");
};

describe("a closed panel's question moves with its owner", () => {
  test("after a close and a reassign, the old owner cannot republish or remove the question", async () => {
    const app = await open();
    expect((await agent(app, keys.ag_alice, { tool: "ask_human", panel: "open_panel", ask: q })).status).toBe(200);
    const answered = await person(app, { op: "human.answer", panel: "open_panel", ask: "q1", ...(await revisionOf(app, "open_panel", "q1")), outcome: "answered", value: "a" });
    expect(answered.status).toBe(200);
    expect((await person(app, { op: "human.close", id: "open_panel" })).status).toBe(200);
    const moved = await person(app, { op: "human.reassign_owner", panel: "open_panel", ask: "q1", from_key_id: "ag_alice", to_key_id: "ag_alice2", confirmed: true });
    expect(moved.status).toBe(200);
    expect((await storedQuestion(app))?.owner_key).toBe("ag_alice2");

    // Alice republishes the panel without the question, which is now Alice 2's.
    await agent(app, keys.ag_alice, { tool: "show_surface", surface: { id: "open_panel", blocks: [] } });
    expect((await storedQuestion(app))?.owner_key).toBe("ag_alice2");

    // Alice cannot remove it either.
    await agent(app, keys.ag_alice, { tool: "arrange", action: { op: "surface.remove", id: "open_panel" } });
    expect((await storedQuestion(app))?.owner_key).toBe("ag_alice2");
  });
});

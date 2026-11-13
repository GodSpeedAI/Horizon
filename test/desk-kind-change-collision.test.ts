/**
 * Finding R2-1: a question put up as q, then replaced by a text block named q. The retained question used to come back beside the
 * text block, so the panel held two blocks with one id. The put returned 200 and every later board load refused every panel. The put
 * is now refused before anything is stored, and the board still loads after a restart.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { randomBytes, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DUPLICATE_BLOCK_ID } from "../src/ui/desk/panels-model.ts";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { withRequestId } from "./support/request-body.ts";

const key = randomBytes(32).toString("hex");
const sha = (k: string) => createHash("sha256").update(k).digest("hex");
const question = (id: string) => ({ id, question: "Which plan?", why_needed: "x", options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }] });
const agent = (app: DeskApp, body: unknown) =>
  fetch(`${app.base}/agent/panels`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-horizon-agent-name": "Alice" }, body: JSON.stringify(withRequestId(body)) });
const writeRegistry = (app: DeskApp) => {
  const entries = [{ key_id: "ag_alice", name: "Alice", sha256: sha(key), added: "2026-11-07T09:00:00.000Z" }];
  writeFileSync(join(dirname(app.application.loaded.agentKeyPath), "agents.json"), JSON.stringify({ schema: "horizon.agents/1", agents: entries }));
};

const apps: DeskApp[] = [];
const open = async (options: { root?: string } = {}) => {
  const app = await startDeskApp(options);
  apps.push(app);
  return app;
};
afterAll(async () => {
  for (const app of apps) await app.stop().catch(() => undefined);
});

describe("a block cannot change kind into an existing question's id", () => {
  test("a question replaced by a text block of the same id is refused, and the board still loads after a restart", async () => {
    const first = await open();
    writeRegistry(first);
    expect((await agent(first, { tool: "ask_human", panel: "kind1", ask: question("kind1_q") })).status).toBe(200);
    const put = await agent(first, { tool: "show_surface", surface: { id: "kind1", title: "Kind", blocks: [{ type: "callout", id: "kind1_q", tone: "ok", text: "Now text" }] } });
    expect(put.status).toBe(400);
    expect(((await put.json()) as { message: string }).message).toBe(DUPLICATE_BLOCK_ID);
    const before = await first.state();
    expect(before.panels.open.find((p: { id: string }) => p.id === "kind1")?.blocks.map((b: { id: string; kind: string }) => [b.id, b.kind])).toEqual([["kind1_q", "question"]]);
    const root = first.root;
    await first.stop();
    const second = await open({ root });
    const after = await second.state();
    expect(after.panels.open.map((p: { id: string }) => p.id)).toEqual(["kind1"]);
  });
});

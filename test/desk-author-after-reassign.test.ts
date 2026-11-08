/**
 * Finding R2-8: agent A asks, the person moves the question to agent B before it is answered. The answer used to record B as its
 * author. The author fields (asked_by, asked_by_key) now stay with A, and the current owner (owner_key, owner_rev) is B's.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { listAnswers } from "../src/capabilities/panel-answers.ts";
import { moveQuestion, NO_PANELS, reduceAgent, type AskBlock, type Panels } from "../src/ui/desk/panels-model.ts";
import { deskScopeFor, startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { revisionOf } from "./support/answer-revision.ts";
import { withRequestId } from "./support/request-body.ts";

const keys = { ag_alice: randomBytes(32).toString("hex"), ag_alice2: randomBytes(32).toString("hex") };
const sha = (k: string) => createHash("sha256").update(k).digest("hex");
const apps: DeskApp[] = [];
const open = async () => {
  const app = await startDeskApp();
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

const q = (id: string) => ({ id, question: `Which plan for ${id}?`, why_needed: "x", options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }] });
const agent = (app: DeskApp, key: string, name: string, body: unknown) =>
  fetch(`${app.base}/agent/panels`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-horizon-agent-name": name }, body: JSON.stringify(withRequestId(body)) });
const person = (app: DeskApp, body: unknown) => fetch(`${app.base}/desk/panels/op`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(withRequestId(body)) });
const qOf = (s: Panels, panel: string, ask: string): AskBlock => s.open.find((p) => p.id === panel)!.blocks.find((b): b is AskBlock => b.kind === "question" && b.id === ask)!;

describe("the author of a question stays the agent that asked, after a reassignment", () => {
  test("moving a question changes its owner and its owner revision, and not its author", () => {
    const put = reduceAgent(NO_PANELS, { tool: "ask_human", panel: "p", ask: q("q") }, "Alice", "ag_alice").state;
    const moved = moveQuestion(put, "p", "q", "ag_alice2", "Alice 2");
    expect(qOf(moved, "p", "q")).toMatchObject({ asked_by: "Alice", asked_by_key: "ag_alice", owner_key: "ag_alice2", owner_name: "Alice 2", owner_rev: 1 });
  });

  test("a question stored before owners existed is owned by its author", () => {
    const put = reduceAgent(NO_PANELS, { tool: "ask_human", panel: "p", ask: q("q") }, "Alice", "ag_alice").state;
    const legacy: Panels = { ...put, open: put.open.map((p) => ({ ...p, blocks: p.blocks.map((b) => (b.kind === "question" ? { ...b, owner_key: undefined, owner_name: undefined } : b)) })) };
    const again = reduceAgent(legacy, { tool: "ask_human", panel: "p", ask: q("q") }, "Alice", "ag_alice");
    expect(again.result.ok).toBe(true);
    expect(qOf(again.state, "p", "q")).toMatchObject({ asked_by_key: "ag_alice", owner_key: "ag_alice" });
  });

  test("an answer to a question moved to another agent records the agent that asked, as its author", async () => {
    const app = await open();
    expect((await agent(app, keys.ag_alice, "Alice", { tool: "ask_human", panel: "aa", ask: q("aa_q") })).status).toBe(200);
    const moved = await person(app, { op: "human.reassign_owner", panel: "aa", ask: "aa_q", from_key_id: "ag_alice", to_key_id: "ag_alice2", confirmed: true });
    expect(moved.status).toBe(200);
    const board = (await app.state()).panels.open.find((p: { id: string }) => p.id === "aa");
    expect(board.blocks.find((b: { id: string }) => b.id === "aa_q")).toMatchObject({ asked_by: "Alice", asked_by_key: "ag_alice", owner_key: "ag_alice2" });
    const answered = await person(app, { op: "human.answer", panel: "aa", ask: "aa_q", outcome: "answered", value: "a", ...(await revisionOf(app, "aa", "aa_q")) });
    expect(answered.status).toBe(200);
    const rows = await listAnswers(app.application.runtime.runtime.store, deskScopeFor(app), "aa");
    expect(rows.find((r) => r.ask === "aa_q")).toMatchObject({ asked_by: "Alice", asked_by_key: "ag_alice", owner_key: "ag_alice2" });
  });
});

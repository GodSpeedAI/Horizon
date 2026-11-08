/**
 * Step 5: the person moves a waiting question to another registered agent (paired, recent pairing, registered target, second
 * confirm). The old key's late route is refused; the new key's route is accepted and labelled as a claim; the row names both.
 */
import { revisionOf } from "./support/answer-revision.ts";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";

const keys = { ag_alice: randomBytes(32).toString("hex"), ag_alice2: randomBytes(32).toString("hex"), ag_bob: randomBytes(32).toString("hex") };
const sha = (k: string) => createHash("sha256").update(k).digest("hex");
const writeRegistry = (app: DeskApp) => {
  const entries = [
    { key_id: "ag_alice", name: "Alice", sha256: sha(keys.ag_alice), added: "2026-11-07T09:00:00.000Z" },
    { key_id: "ag_alice2", name: "Alice 2", sha256: sha(keys.ag_alice2), added: "2026-11-07T09:00:00.000Z" },
    { key_id: "ag_bob", name: "Bob", sha256: sha(keys.ag_bob), added: "2026-11-07T09:00:00.000Z" },
  ];
  writeFileSync(join(dirname(app.application.loaded.agentKeyPath), "agents.json"), JSON.stringify({ schema: "horizon.agents/1", agents: entries }));
};
const q = (id: string) => ({ id, question: `Which plan for ${id}?`, why_needed: "x", options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }] });
const agent = (app: DeskApp, key: string, name: string, body: unknown) =>
  fetch(`${app.base}/agent/panels`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-horizon-agent-name": name }, body: JSON.stringify(body) });
const person = (app: DeskApp, body: unknown) => fetch(`${app.base}/desk/panels/op`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const rowsOf = async (app: DeskApp): Promise<any[]> => (await (await fetch(`${app.base}/desk/conversation`)).json()).rows;
const move = (app: DeskApp, extra: Record<string, unknown>) => person(app, { op: "human.reassign_owner", panel: "rot_panel", ask: "rot_q", from_key_id: "ag_alice", to_key_id: "ag_alice2", ...extra });

describe("the person moves a waiting question to another agent", () => {
  let app: DeskApp;
  beforeAll(async () => {
    app = await startDeskApp();
    writeRegistry(app);
    expect((await agent(app, keys.ag_alice, "Alice", { tool: "ask_human", panel: "rot_panel", ask: q("rot_q") })).status).toBe(200);
    expect((await person(app, { op: "human.answer", panel: "rot_panel", ask: "rot_q", ...(await revisionOf(app, "rot_panel", "rot_q")), outcome: "answered", value: "a" })).status).toBe(200);
  });
  afterAll(async () => app.stop());

  test("the rotated key cannot route the answer until the owner is moved", async () => {
    const refused = await agent(app, keys.ag_alice2, "Alice 2", { tool: "answer.route", panel_id: "rot_panel", ask_id: "rot_q", routed_as: "step handoff_0a49 in Seed" });
    expect(refused.status).toBeGreaterThanOrEqual(400);
  });

  test("no move without the second confirm; nothing changes", async () => {
    const r = await move(app, {});
    expect(r.status).toBe(409);
    expect((await r.json()).message).toContain("Confirm the change first");
    expect((await agent(app, keys.ag_alice2, "Alice 2", { tool: "answer.route", panel_id: "rot_panel", ask_id: "rot_q", routed_as: "step handoff_0a49 in Seed" })).status).toBeGreaterThanOrEqual(400);
  });

  test("an unregistered target is refused", async () => {
    const r = await move(app, { to_key_id: "ag_ghost", confirmed: true });
    expect(r.status).toBe(409);
    expect((await r.json()).message).toContain("not registered");
  });

  test("the move is accepted with the confirm, and the new key's route is accepted", async () => {
    const r = await move(app, { confirmed: true });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true });
    const routed = await agent(app, keys.ag_alice2, "Alice 2", { tool: "answer.route", panel_id: "rot_panel", ask_id: "rot_q", routed_as: "step handoff_0a49 in Seed" });
    expect(routed.status).toBe(200);
  });

  test("the old key's late route is refused as not the owner", async () => {
    // The answer is already routed by the new owner; a second route is refused for either key. Ask a fresh question to test the old key.
    await agent(app, keys.ag_alice, "Alice", { tool: "ask_human", panel: "late_panel", ask: q("late_q") });
    await person(app, { op: "human.answer", panel: "late_panel", ask: "late_q", ...(await revisionOf(app, "late_panel", "late_q")), outcome: "answered", value: "b" });
    const r = await move(app, { panel: "late_panel", ask: "late_q", confirmed: true, to_key_id: "ag_alice2" });
    expect(r.status).toBe(200);
    const late = await agent(app, keys.ag_alice, "Alice", { tool: "answer.route", panel_id: "late_panel", ask_id: "late_q", routed_as: "step handoff_0a49 in Seed" });
    expect(late.status).toBeGreaterThanOrEqual(400);
    expect(await late.json()).toMatchObject({ ok: false });
  });

  test("the conversation shows the move with both names and a time, and the route is a claim", async () => {
    const rows = await rowsOf(app);
    const moved = rows.find((r) => typeof r.words === "string" && r.words.includes("from Alice to Alice 2"));
    expect(moved).toBeDefined();
    expect(moved.words).toContain("Alice");
    expect(moved.words).toContain("Alice 2");
    expect(typeof moved.at).toBe("string");
    const claim = rows.find((r) => typeof r.outcome === "string" && r.outcome.startsWith("The agent says it took it to:"));
    expect(claim).toBeDefined();
    expect(claim.outcome).toContain("Not checked");
  });
});

describe("a move needs a recent pairing", () => {
  test("a pairing older than 10 minutes is refused, in plain words, and nothing changes", async () => {
    let time = new Date("2026-11-07T10:00:00Z").getTime();
    const app = await startDeskApp({ now: () => new Date(time) });
    try {
      writeRegistry(app);
      expect((await agent(app, keys.ag_alice, "Alice", { tool: "ask_human", panel: "old_panel", ask: q("old_q") })).status).toBe(200);
      expect((await person(app, { op: "human.answer", panel: "old_panel", ask: "old_q", ...(await revisionOf(app, "old_panel", "old_q")), outcome: "answered", value: "a" })).status).toBe(200);
      time += 11 * 60_000;
      const r = await person(app, { op: "human.reassign_owner", panel: "old_panel", ask: "old_q", from_key_id: "ag_alice", to_key_id: "ag_alice2", confirmed: true });
      expect(r.status).toBe(409);
      expect((await r.json()).message).toContain("10 minutes");
      expect((await agent(app, keys.ag_alice2, "Alice 2", { tool: "answer.route", panel_id: "old_panel", ask_id: "old_q", routed_as: "step handoff_0a49 in Seed" })).status).toBeGreaterThanOrEqual(400);
    } finally {
      await app.stop();
    }
  });
});

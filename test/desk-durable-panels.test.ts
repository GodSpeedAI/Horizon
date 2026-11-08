/**
 * Design v3, step 2 (parts A to C): panels and their questions are durable records, the board is a view of them, and a load that
 * fails is an error the desk shows, never an empty board. Each proof goes through the application's own entry points, and the
 * restart tests start a second application on the same store (the same `root`).
 */
import { withRevision } from "./support/answer-revision.ts";
import { afterAll, describe, expect, test } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { BOARD_COLLECTION, PANEL_LOAD_WORDS } from "../src/capabilities/panel-records.ts";
import { ANSWERED_CANNOT_CHANGE } from "../src/ui/desk/panels-model.ts";
import { deskScopeFor, startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { withRequestId } from "./support/request-body.ts";

const keys = { ag_alice: randomBytes(32).toString("hex"), ag_alice2: randomBytes(32).toString("hex") };
const sha = (k: string) => createHash("sha256").update(k).digest("hex");
const writeRegistry = (app: DeskApp) => {
  const entries = [
    { key_id: "ag_alice", name: "Alice", sha256: sha(keys.ag_alice), added: "2026-11-07T09:00:00.000Z" },
    { key_id: "ag_alice2", name: "Alice 2", sha256: sha(keys.ag_alice2), added: "2026-11-07T09:00:00.000Z" },
  ];
  writeFileSync(join(dirname(app.application.loaded.agentKeyPath), "agents.json"), JSON.stringify({ schema: "horizon.agents/1", agents: entries }));
};
const question = (id: string, text = "Which plan?") => ({ id, question: text, why_needed: "x", options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }] });
const agent = (app: DeskApp, key: string, name: string, body: unknown) =>
  fetch(`${app.base}/agent/panels`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-horizon-agent-name": name }, body: JSON.stringify(withRequestId(body)) });
const putQuestion = (app: DeskApp, panel: string, id: string, text?: string) => agent(app, keys.ag_alice, "Alice", { tool: "ask_human", panel, ask: question(id, text) });
const person = async (app: DeskApp, body: unknown) => app.post("/desk/panels/op", await withRevision(app, body));
const answer = (app: DeskApp, panel: string, ask: string, outcome: "answered" | "deferred" = "answered") => person(app, { op: "human.answer", panel, ask, outcome, value: outcome === "answered" ? "a" : undefined });
const blockOf = (state: any, panel: string, ask: string): any => state.panels.open.find((p: { id: string }) => p.id === panel)?.blocks.find((b: { id: string }) => b.id === ask);
const surface = (id: string) => ({ tool: "show_surface", surface: { id, title: `Panel ${id}`, blocks: [{ type: "callout", id: "c1", tone: "ok", text: "Looks fine" }] } });

const apps: DeskApp[] = [];
const open = async (options: { root?: string } = {}) => {
  const app = await startDeskApp(options);
  apps.push(app);
  return app;
};
/** Stops the first desk and starts a second one on the same records. */
const restart = async (app: DeskApp) => {
  const root = app.root;
  await app.stop();
  return open({ root });
};
afterAll(async () => {
  for (const app of apps) await app.stop().catch(() => undefined);
});

describe("a question survives a restart", () => {
  test("its words, its owner and its deferred history survive; another agent cannot recreate it with other words", async () => {
    const first = await open();
    writeRegistry(first);
    expect((await putQuestion(first, "dur1", "dur1_q", "Which plan for the launch?")).status).toBe(200);
    expect((await answer(first, "dur1", "dur1_q", "deferred")).status).toBe(200);
    const second = await restart(first);
    const block = blockOf(await second.state(), "dur1", "dur1_q");
    expect(block).toMatchObject({ question: "Which plan for the launch?", asked_by: "Alice" });
    expect(block.answered).toMatchObject({ outcome: "deferred" });
    const other = await agent(second, keys.ag_alice2, "Alice 2", { tool: "ask_human", panel: "dur1", ask: question("dur1_q", "Something else entirely?") });
    expect(other.status).toBe(400);
    expect(((await other.json()) as { message: string }).message).toBe("That panel belongs to another agent.");
    const surfaced = await agent(second, keys.ag_alice2, "Alice 2", surface("dur1"));
    expect(surfaced.status).toBe(400);
  });
});

describe("an unanswered question survives a restart and can be answered", () => {
  test("the answer goes through after the restart", async () => {
    const first = await open();
    writeRegistry(first);
    expect((await putQuestion(first, "dur2", "dur2_q")).status).toBe(200);
    const second = await restart(first);
    expect(blockOf(await second.state(), "dur2", "dur2_q").answered).toBeNull();
    expect((await answer(second, "dur2", "dur2_q")).status).toBe(200);
    expect(blockOf(await second.state(), "dur2", "dur2_q").answered).toMatchObject({ outcome: "answered", value: "a" });
  });
});

describe("a deferred question survives a restart, reopens, and keeps its history", () => {
  test("an unchanged re-put reopens it after the restart; it can be answered and the earlier answer is kept", async () => {
    const first = await open();
    writeRegistry(first);
    expect((await putQuestion(first, "dur3", "dur3_q")).status).toBe(200);
    expect((await answer(first, "dur3", "dur3_q", "deferred")).status).toBe(200);
    const second = await restart(first);
    expect((await putQuestion(second, "dur3", "dur3_q")).status).toBe(200);
    expect(blockOf(await second.state(), "dur3", "dur3_q").answered).toBeNull();
    expect((await answer(second, "dur3", "dur3_q")).status).toBe(200);
    const block = blockOf(await second.state(), "dur3", "dur3_q");
    expect(block.answered).toMatchObject({ outcome: "answered", value: "a" });
    expect(block.earlier).toEqual([expect.objectContaining({ outcome: "deferred" })]);
  });
});

describe("closing or evicting a panel keeps its record", () => {
  test("a closed panel is not deleted: the same question put again with the same words reopens it", async () => {
    const app = await open();
    writeRegistry(app);
    expect((await putQuestion(app, "dur4a", "dur4a_q")).status).toBe(200);
    expect((await person(app, { op: "human.close", id: "dur4a" })).status).toBe(200);
    expect((await app.state()).panels.open.map((p: { id: string }) => p.id)).not.toContain("dur4a");
    expect((await putQuestion(app, "dur4a", "dur4a_q")).status).toBe(200);
    expect(blockOf(await app.state(), "dur4a", "dur4a_q").answered).toBeNull();
    expect((await answer(app, "dur4a", "dur4a_q")).status).toBe(200);
  });

  test("an evicted panel keeps its answered question; putting it again brings the answer back", async () => {
    const app = await open();
    writeRegistry(app);
    expect((await putQuestion(app, "dur4b", "dur4b_q")).status).toBe(200);
    expect((await answer(app, "dur4b", "dur4b_q")).status).toBe(200);
    for (let i = 1; i <= 8; i += 1) expect((await agent(app, keys.ag_alice, "Alice", surface(`ev_${i}`))).status).toBe(200);
    expect((await app.state()).panels.open.map((p: { id: string }) => p.id)).not.toContain("dur4b");
    expect((await putQuestion(app, "dur4b", "dur4b_q")).status).toBe(200);
    expect(blockOf(await app.state(), "dur4b", "dur4b_q").answered).toMatchObject({ outcome: "answered", value: "a" });
    const changed = await putQuestion(app, "dur4b", "dur4b_q", "A different question now?");
    expect(changed.status).toBe(400);
    expect(((await changed.json()) as { message: string }).message).toBe(ANSWERED_CANNOT_CHANGE);
  });
});

describe("a load that fails is shown as an error, never as an empty desk", () => {
  test("the desk refuses panel changes with plain words and says the panels could not be read", async () => {
    const first = await open();
    writeRegistry(first);
    expect((await putQuestion(first, "dur5", "dur5_q")).status).toBe(200);
    // A board that lists a panel with no record: the load cannot build the board from the records.
    const store = first.application.runtime.runtime.store as unknown as { getRecord: (c: string, id: string) => Promise<{ version: number } | null>; commit: (i: unknown) => Promise<unknown> };
    const tenant = deskScopeFor(first);
    const current = await store.getRecord(BOARD_COLLECTION, `board:${tenant}`);
    await store.commit({ appends: [], records: [{ collection: BOARD_COLLECTION, id: `board:${tenant}`, expectedVersion: current?.version ?? 0, value: { tenant, visible: ["dur5", "ghost"] } }] });
    const second = await restart(first);
    const state = await second.state();
    expect(state.panels.refused).toBe(PANEL_LOAD_WORDS);
    expect(state.panels.open).toEqual([]);
    const pinned = await person(second, { op: "human.pin", id: "dur5", pinned: true });
    expect(pinned.status).toBe(503);
    expect(((await pinned.json()) as { message: string }).message).toBe(PANEL_LOAD_WORDS);
    const put = await agent(second, keys.ag_alice, "Alice", surface("dur5_new"));
    expect(put.status).toBe(503);
  });
});

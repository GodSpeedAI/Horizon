/**
 * Finding R4-4. A preserved legacy answer can have no owner recorded, so the previous owner is null. The person can move such an answer by
 * sending from_key_id null. A named previous owner against a null owner is refused with a clear error, and nothing moves.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import { listAnswers, NO_OWNER_RECORDED, PANEL_ANSWERS_COLLECTION, answerIdOf, planReassign, recordAnswer } from "../src/capabilities/panel-answers.ts";
import { startDeskApp, deskScopeFor, type DeskApp } from "./support/desk-app.ts";
import { withRequestId } from "./support/request-body.ts";

const now = new Date("2026-11-08T09:00:00Z");
const later = new Date("2026-11-08T09:05:00Z");
const who = { tenant: "t", operator: "sam" };

describe("planReassign with an answer that has no owner (R4-4)", () => {
  const ownerless = async () => {
    const store = createMemoryStore();
    await recordAnswer(store, { tenant: "t", panel_id: "p", ask: "q1", outcome: "answered", value: "yes", step: "s1", asked_by: "Legacy", asked_by_key: null, now });
    return store;
  };
  const move = (store: ReturnType<typeof createMemoryStore>, from_key: string | null) =>
    planReassign(store, { tenant: "t", panel_id: "p", ask: "q1", question: "Which plan?", from_key, to_key: "ag_bob", from_name: "no one", to_name: "Bob", paired: true, pairedAgeMs: 1000, targetRegistered: true, confirmed: true, who, now: later });

  test("an outstanding ownerless answer moves with from_key null, and its history names no previous owner", async () => {
    const store = await ownerless();
    const moved = await move(store, null);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    await store.commit({ appends: [], records: moved.records });
    const [after] = await listAnswers(store, "t", "p");
    expect(after?.owner_key).toBe("ag_bob");
    expect(after?.reassignments).toEqual([{ from_key: null, to_key: "ag_bob", from_name: "no one", to_name: "Bob", at: later.toISOString() }]);
  });

  test("a named previous owner against a null owner is refused with the clear error, and nothing is planned", async () => {
    const store = await ownerless();
    expect(await move(store, "ag_alice")).toEqual({ ok: false, message: NO_OWNER_RECORDED });
    const [after] = await listAnswers(store, "t", "p");
    expect(after?.owner_key).toBeNull();
  });
});

describe("the reassign request accepts a null previous owner (R4-4)", () => {
  const keys = { ag_alice: randomBytes(32).toString("hex"), ag_bob: randomBytes(32).toString("hex") };
  const sha = (k: string) => createHash("sha256").update(k).digest("hex");
  const q = (id: string) => ({ id, question: `Which plan for ${id}?`, why_needed: "x", options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }] });
  const agent = (app: DeskApp, key: string, name: string, body: unknown) =>
    fetch(`${app.base}/agent/panels`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-horizon-agent-name": name }, body: JSON.stringify(withRequestId(body)) });
  const person = (app: DeskApp, body: unknown) => fetch(`${app.base}/desk/panels/op`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(withRequestId(body)) });
  const move = (app: DeskApp, extra: Record<string, unknown>) => person(app, { op: "human.reassign_owner", panel: "nl_panel", ask: "nl_q", from_key_id: null, to_key_id: "ag_bob", confirmed: true, ...extra });
  let app: DeskApp;

  beforeAll(async () => {
    app = await startDeskApp();
    const entries = [
      { key_id: "ag_alice", name: "Alice", sha256: sha(keys.ag_alice), added: "2026-11-07T09:00:00.000Z" },
      { key_id: "ag_bob", name: "Bob", sha256: sha(keys.ag_bob), added: "2026-11-07T09:00:00.000Z" },
    ];
    writeFileSync(join(dirname(app.application.loaded.agentKeyPath), "agents.json"), JSON.stringify({ schema: "horizon.agents/1", agents: entries }));
    expect((await agent(app, keys.ag_alice, "Alice", { tool: "ask_human", panel: "nl_panel", ask: q("nl_q") })).status).toBe(200);
    // A legacy answer from before the upgrade: waiting for the agent, with no owner recorded.
    const scope = deskScopeFor(app);
    await app.application.runtime.runtime.store.commit({ appends: [], records: [{ collection: PANEL_ANSWERS_COLLECTION, id: answerIdOf(scope, "nl_panel", 1), expectedVersion: 0, value: { tenant: scope, panel_id: "nl_panel", n: 1, ask: "nl_q", outcome: "answered", value: "a", note: null, at: "2026-11-02T10:00:00.000Z", version: null, routed_as: null, step: "s1", asked_by: "Alice", asked_by_key: null, owner_key: null, fingerprint: null, history: [], state: "waiting_for_agent", finished_by: null, replied: false, waiting_on: "agent" } }] });
  });
  afterAll(async () => app.stop());

  test("a named previous owner against the null owner is refused with the clear error", async () => {
    const r = await move(app, { from_key_id: "ag_alice" });
    expect(r.status).toBe(409);
    expect((await r.json()).message).toBe(NO_OWNER_RECORDED);
  });

  test("a request with no previous owner field at all is still refused as unreadable", async () => {
    const r = await person(app, { op: "human.reassign_owner", panel: "nl_panel", ask: "nl_q", to_key_id: "ag_bob", confirmed: true });
    expect(r.status).toBe(400);
  });

  test("from_key_id null moves the ownerless answer to a registered agent", async () => {
    const r = await move(app, {});
    expect(r.status).toBe(200);
    const [after] = await listAnswers(app.application.runtime.runtime.store, deskScopeFor(app), "nl_panel");
    expect(after?.owner_key).toBe("ag_bob");
  });
});

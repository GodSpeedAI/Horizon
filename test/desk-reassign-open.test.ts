/**
 * Design v3, step 4 (item 6): a question nobody has answered yet can move to another registered agent. It has the same checks as a move of
 * a waiting answer (paired desk, recent pairing, registered target, explicit confirm), and the move, the owner change and the conversation
 * row are one store commit. After the move the old key cannot put, withdraw or route the question, and the new key can. The move survives
 * a restart. The desk is driven through its HTTP entry points; commits are counted by wrapping the store's commit.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PANELS_COLLECTION } from "../src/capabilities/panel-records.ts";
import { CONVERSATION_COLLECTION } from "../src/capabilities/conversation.ts";
import { deskScopeFor, startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { withRequestId } from "./support/request-body.ts";
import { agentInProcess } from "./support/agent-door.ts";
import { panelIdOf } from "../src/capabilities/panel-records.ts";

const keys = { ag_alice: randomBytes(32).toString("hex"), ag_alice2: randomBytes(32).toString("hex") };
const sha = (k: string) => createHash("sha256").update(k).digest("hex");
const apps: DeskApp[] = [];
const open = async (root?: string) => {
  const app = await startDeskApp(root === undefined ? {} : { root });
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
const move = (app: DeskApp, extra: Record<string, unknown>) => person(app, { op: "human.reassign_owner", panel: "open_panel", ask: "open_q", from_key_id: "ag_alice", to_key_id: "ag_alice2", ...extra });
const ownerOf = async (app: DeskApp): Promise<string | null | undefined> => {
  const row = await app.application.runtime.runtime.store.getRecord(PANELS_COLLECTION, panelIdOf(deskScopeFor(app), "open_panel"));
  const block = (row?.value as { blocks: { kind: string; id: string; owner_key?: string | null }[] } | undefined)?.blocks.find((b) => b.kind === "question" && b.id === "open_q");
  return block?.owner_key;
};

/** Counts the store commits an action makes, and the collections each one writes. */
async function commitsOf<T>(app: DeskApp, run: () => Promise<T>): Promise<{ readonly result: T; readonly commits: string[][] }> {
  const store = app.application.runtime.runtime.store as unknown as { commit: (input: { records?: { collection: string }[] }) => Promise<unknown> };
  const real = store.commit.bind(store);
  const commits: string[][] = [];
  store.commit = async (input) => {
    commits.push((input.records ?? []).map((r) => r.collection));
    return real(input);
  };
  try {
    return { result: await run(), commits };
  } finally {
    store.commit = real;
  }
}

describe("a question nobody has answered yet moves to another agent", () => {
  test("the move is refused without the confirm, for an unregistered target, and for a stale owner; nothing changes", async () => {
    const app = await open();
    expect((await agent(app, keys.ag_alice, "Alice", { tool: "ask_human", panel: "open_panel", ask: q("open_q") })).status).toBe(200);
    const noConfirm = await move(app, {});
    expect(noConfirm.status).toBe(409);
    expect((await noConfirm.json() as { message: string }).message).toContain("Confirm the change first");
    const ghost = await move(app, { to_key_id: "ag_ghost", confirmed: true });
    expect(ghost.status).toBe(409);
    expect((await ghost.json() as { message: string }).message).toContain("not registered");
    const stale = await move(app, { from_key_id: "ag_alice2", confirmed: true });
    expect(stale.status).toBe(409);
    expect(await ownerOf(app)).toBe("ag_alice");
  });

  test("the move is one commit: the owner on the question and the conversation row together", async () => {
    const app = await open();
    expect((await agent(app, keys.ag_alice, "Alice", { tool: "ask_human", panel: "open_panel", ask: q("open_q") })).status).toBe(200);
    const { result, commits } = await commitsOf(app, () => move(app, { confirmed: true }));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ok: true, message: "Moved to Alice 2. The question waits for them to answer." });
    expect(commits.filter((c) => c.includes(PANELS_COLLECTION) && c.includes(CONVERSATION_COLLECTION)).length).toBe(1);
    expect(await ownerOf(app)).toBe("ag_alice2");
    const rows = (await (await fetch(`${app.base}/desk/conversation`)).json()).rows as { words: string }[];
    expect(rows.some((r) => r.words.includes("Moved the question") && r.words.includes("from Alice to Alice 2"))).toBe(true);
  });

  test("after the move, the old key cannot withdraw or route the question, and the new key can withdraw it", async () => {
    const app = await open();
    expect((await agent(app, keys.ag_alice, "Alice", { tool: "ask_human", panel: "open_panel", ask: q("open_q") })).status).toBe(200);
    expect((await move(app, { confirmed: true })).status).toBe(200);
    const oldWithdraw = await agent(app, keys.ag_alice, "Alice", { tool: "ask.withdraw", panel_id: "open_panel", ask_id: "open_q", reason: "not needed" });
    expect(oldWithdraw.status).toBeGreaterThanOrEqual(400);
    const oldPut = await agent(app, keys.ag_alice, "Alice", { tool: "ask_human", panel: "open_panel", ask: q("open_q") });
    expect(oldPut.status).toBeGreaterThanOrEqual(400);
    const newWithdraw = await agent(app, keys.ag_alice2, "Alice 2", { tool: "ask.withdraw", panel_id: "open_panel", ask_id: "open_q", reason: "not needed" });
    expect(newWithdraw.status).toBe(200);
    expect(await ownerOf(app)).toBe("ag_alice2");
  });

  test("the moved owner survives a restart", async () => {
    const first = await open();
    const root = first.root;
    expect((await agent(first, keys.ag_alice, "Alice", { tool: "ask_human", panel: "open_panel", ask: q("open_q") })).status).toBe(200);
    expect((await move(first, { confirmed: true })).status).toBe(200);
    await first.stop();
    apps.splice(apps.indexOf(first), 1);
    const second = await open(root);
    expect(await ownerOf(second)).toBe("ag_alice2");
    const again = await move(second, { from_key_id: "ag_alice2", to_key_id: "ag_alice", confirmed: true });
    expect(again.status).toBe(200);
    expect(await ownerOf(second)).toBe("ag_alice");
  });
});

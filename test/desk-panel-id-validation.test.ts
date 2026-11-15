/**
 * Finding R4-5. ask_human checks its panel id the way show_surface checks its id, so an empty id is refused with 400 and nothing is
 * stored (it used to save the question under "panel:" where it never shows). The board order is compared element by element, so an
 * empty board differs from a board holding one empty id.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { startDeskApp, deskScopeFor, type DeskApp } from "./support/desk-app.ts";
import { withRequestId } from "./support/request-body.ts";
import { boardWrites, BOARD_COLLECTION } from "../src/capabilities/panel-records.ts";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import type { Panels } from "../src/ui/desk/panels-model.ts";

const keys = { ag_alice: randomBytes(32).toString("hex") };
const sha = (k: string) => createHash("sha256").update(k).digest("hex");
const ask = { id: "q", question: "Which plan?", why_needed: "x", options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }] };

describe("ask_human refuses an empty or malformed panel id (R4-5)", () => {
  let app: DeskApp;
  beforeAll(async () => {
    app = await startDeskApp();
    const entries = [{ key_id: "ag_alice", name: "Alice", sha256: sha(keys.ag_alice), added: "2026-11-07T09:00:00.000Z" }];
    writeFileSync(join(dirname(app.application.loaded.agentKeyPath), "agents.json"), JSON.stringify({ schema: "horizon.agents/1", agents: entries }));
  });
  afterAll(async () => app.stop());

  test("ask_human with panel \"\" is refused with 400 and nothing is saved", async () => {
    const store = app.application.runtime.runtime.store;
    const tenant = deskScopeFor(app);
    const before = (await store.listRecords("horizon-panels", { tenant })).length;
    const response = await fetch(`${app.base}/agent/panels`, {
      method: "POST",
      headers: { authorization: `Bearer ${keys.ag_alice}`, "content-type": "application/json", "x-horizon-agent-name": "Alice" },
      body: JSON.stringify(withRequestId({ tool: "ask_human", panel: "", ask })),
    });
    expect(response.status).toBe(400);
    expect((await store.listRecords("horizon-panels", { tenant })).length).toBe(before);
    expect((await store.getRecord("horizon-panels", "panel:")) ?? null).toBeNull();
  });

  test("ask_human with a malformed panel id is refused the same way as show_surface refuses it", async () => {
    const result = await app.application.applyAgentOp({ tool: "ask_human", panel: "Bad Id", ask } as unknown as Parameters<typeof app.application.applyAgentOp>[0]);
    expect(result).toMatchObject({ ok: false });
    const shown = await app.application.applyAgentOp({ tool: "show_surface", surface: { id: "Bad Id", blocks: [] } } as unknown as Parameters<typeof app.application.applyAgentOp>[0]);
    expect(shown).toMatchObject({ ok: false });
  });
});

describe("the board order compares element by element (R4-5)", () => {
  const board = (ids: string[]): Panels => ({ open: ids.map((id) => ({ id, title: id, step: null, pinned: false, blocks: [], notes: [], owner_key: null })), max: 5 } as unknown as Panels);

  test("an empty board differs from a board holding one empty id", async () => {
    const store = createMemoryStore();
    const writes = await boardWrites(store, "t", board([]), board([""]));
    expect(writes.some((w) => w.collection === BOARD_COLLECTION)).toBe(true);
  });

  test("the same ids in the same order write no board order", async () => {
    const store = createMemoryStore();
    const writes = await boardWrites(store, "t", board(["a", "b"]), board(["a", "b"]));
    expect(writes.some((w) => w.collection === BOARD_COLLECTION)).toBe(false);
  });
});

/**
 * A panel put is one commit with its conversation row. If the row cannot be written, the put fails in plain words and no panel record
 * is stored, so the desk never shows a panel the conversation does not record.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { CONVERSATION_COLLECTION } from "../src/capabilities/conversation.ts";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";

const apps: DeskApp[] = [];
afterAll(async () => {
  for (const app of apps) await app.stop().catch(() => undefined);
});

const ask = { id: "q", question: "Which?", why_needed: "x", options: [{ option_id: "a", label: "A" }, { option_id: "b", label: "B" }] };

describe("a panel put is one commit with its row", () => {
  test("a failing row write leaves no panel record and returns an error", async () => {
    const app = await startDeskApp();
    apps.push(app);
    const store = app.application.runtime.runtime.store;
    const commit = store.commit.bind(store);
    // Only the conversation row's write fails; the panel's write would succeed on its own.
    store.commit = async (commitInput: Parameters<typeof commit>[0]) => {
      if ((commitInput.records ?? []).some((r) => r.collection === CONVERSATION_COLLECTION)) throw new Error("row write refused");
      return commit(commitInput);
    };
    const put = await app.application.applyAgentOp({ tool: "ask_human", panel: "w-atomic", ask });
    expect(put.ok).toBe(false);
    store.commit = commit;
    expect((await app.state()).panels.open.map((p: { id: string }) => p.id)).not.toContain("w-atomic");
    // Nothing was stored: a desk started again on the same records does not have the panel either.
    await app.stop();
    const again = await startDeskApp({ root: app.root });
    apps.push(again);
    expect((await again.state()).panels.open.map((p: { id: string }) => p.id)).not.toContain("w-atomic");
    // Stop this desk before the next test starts: each desk restores the secret-file env on stop, so they must stop last-in first-out.
    await again.stop();
  });

  test("a put whose row is written is stored with its panel", async () => {
    const app = await startDeskApp();
    apps.push(app);
    const put = await app.application.applyAgentOp({ tool: "ask_human", panel: "w-ok", ask });
    expect(put.ok).toBe(true);
    expect((await app.state()).panels.open.map((p: { id: string }) => p.id)).toContain("w-ok");
    const rows = (await app.get("/desk/conversation")).rows as { kind: string; refs: { panel_id?: string } }[];
    expect(rows.some((r) => r.kind === "panel" && r.refs.panel_id === "w-ok")).toBe(true);
  });
});

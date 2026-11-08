/**
 * Finding R5-4. A question sealed as answered (here by a legacy agreement with no answer record) cannot be withdrawn, even when a
 * republish with the same wording shows it as unanswered on the board. The withdrawal is refused, and nothing is recorded as withdrawn.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { AGREED_COLLECTION, agreedFingerprint, listAnswers } from "../src/capabilities/panel-answers.ts";
import { MIGRATION_COLLECTION } from "../src/capabilities/desk-migrations.ts";
import { PANELS_COLLECTION, panelIdOf } from "../src/capabilities/panel-records.ts";
import { deskScopeFor, startDeskApp, type DeskApp } from "./support/desk-app.ts";

const apps: DeskApp[] = [];
const open = async (root?: string) => {
  const app = await startDeskApp(root === undefined ? {} : { root });
  apps.push(app);
  return app;
};
afterAll(async () => {
  for (const app of apps) await app.stop().catch(() => undefined);
});

const question = { id: "q1", question: "Which plan?", why_needed: "x", options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }] };

/** Makes the marker read as "nothing has run", then restarts the desk on the same store so every migration runs again. */
async function migrateAgain(app: DeskApp): Promise<DeskApp> {
  const store = app.application.runtime.runtime.store;
  const tenant = deskScopeFor(app);
  const current = await store.getRecord(MIGRATION_COLLECTION, `marker:${tenant}`);
  await store.commit({ appends: [], records: [{ collection: MIGRATION_COLLECTION, id: `marker:${tenant}`, expectedVersion: current?.version ?? 0, value: { tenant, version: 0, name: "forgotten", at: "2026-11-01T00:00:00.000Z" } }] });
  const root = app.root;
  await app.stop();
  apps.splice(apps.indexOf(app), 1);
  return open(root);
}

describe("a question sealed as answered cannot be withdrawn after a republish (R5-4)", () => {
  test("a legacy agreement with no answer record: republished, the withdrawal is refused and nothing is recorded as withdrawn", async () => {
    const first = await open();
    const store = first.application.runtime.runtime.store;
    const tenant = first.application.caller.tenant;
    await store.commit({ appends: [], records: [{ collection: AGREED_COLLECTION, id: "agreed:sealed_panel:q1", expectedVersion: 0, value: { tenant, panel_id: "sealed_panel", ask: "q1", fingerprint: agreedFingerprint("sealed_panel", question), at: "2026-11-01T09:00:00.000Z" } }] });
    const app = await migrateAgain(first);
    const key = app.application.loaded.agentKey;

    const put = await fetch(`${app.base}/agent/panels`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ tool: "ask_human", panel: "sealed_panel", ask: question, request_id: "put-r54-1" }) });
    expect(put.status).toBe(200);

    const withdrawn = await fetch(`${app.base}/agent/panels`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ tool: "ask.withdraw", panel_id: "sealed_panel", ask_id: "q1", reason: "No longer needed", request_id: "withdraw-r54-1" }) });
    expect(withdrawn.status).toBeGreaterThanOrEqual(400);
    expect(withdrawn.status).toBeLessThan(500);
    expect((await withdrawn.json()).message).toBe("That question was already answered, so it cannot be withdrawn.");

    // The stored question is not recorded as withdrawn, and no answer record was written.
    const row = await app.application.runtime.runtime.store.getRecord(PANELS_COLLECTION, panelIdOf(deskScopeFor(app), "sealed_panel"));
    const block = (row?.value as unknown as { readonly blocks: readonly { readonly id: string; readonly withdrawn?: unknown }[] } | undefined)?.blocks.find((b) => b.id === "q1");
    expect(block?.withdrawn ?? null).toBeNull();
    expect(await listAnswers(app.application.runtime.runtime.store, deskScopeFor(app), "sealed_panel")).toHaveLength(0);
  });
});

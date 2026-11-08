/**
 * Finding R2-9: an agreement that survives without its answer record still seals the question. The migration gives it a guard, so a
 * republish with the same wording cannot be answered again.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { AGREED_COLLECTION, agreedFingerprint, listAnswers, PANEL_ANSWERS_COLLECTION } from "../src/capabilities/panel-answers.ts";
import { MIGRATION_COLLECTION } from "../src/capabilities/desk-migrations.ts";
import { revisionOf } from "./support/answer-revision.ts";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";

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
  const tenant = app.application.caller.tenant;
  const current = await store.getRecord(MIGRATION_COLLECTION, `marker:${tenant}`);
  await store.commit({ appends: [], records: [{ collection: MIGRATION_COLLECTION, id: `marker:${tenant}`, expectedVersion: current?.version ?? 0, value: { tenant, version: 0, name: "forgotten", at: "2026-11-01T00:00:00.000Z" } }] });
  const root = app.root;
  await app.stop();
  apps.splice(apps.indexOf(app), 1);
  return open(root);
}

describe("an agreement with no answer record seals its question", () => {
  test("after migration, the same question republished with the same wording cannot be answered again", async () => {
    const first = await open();
    const store = first.application.runtime.runtime.store;
    const tenant = first.application.caller.tenant;
    // A legacy agreement on file, with its answer record gone.
    await store.commit({ appends: [], records: [{ collection: AGREED_COLLECTION, id: "agreed:sealed_panel:q1", expectedVersion: 0, value: { tenant, panel_id: "sealed_panel", ask: "q1", fingerprint: agreedFingerprint("sealed_panel", question), at: "2026-11-01T09:00:00.000Z" } }] });
    const app = await migrateAgain(first);

    const put = await fetch(`${app.base}/agent/panels`, { method: "POST", headers: { authorization: `Bearer ${app.application.loaded.agentKey}`, "content-type": "application/json" }, body: JSON.stringify({ tool: "ask_human", panel: "sealed_panel", ask: question, request_id: "put-sealed-1" }) });
    expect(put.status).toBe(200);
    const answered = await app.post("/desk/panels/op", { op: "human.answer", panel: "sealed_panel", ask: "q1", ...(await revisionOf(app, "sealed_panel", "q1")), outcome: "answered", value: "a" });
    expect(answered.status).toBe(409);
    expect((await listAnswers(app.application.runtime.runtime.store, app.application.caller.tenant, "sealed_panel"))).toHaveLength(0);
    // The guard that seals it is in the store.
    expect(await app.application.runtime.runtime.store.getRecord(PANEL_ANSWERS_COLLECTION, "question:sealed_panel:q1")).not.toBeNull();
  });
});

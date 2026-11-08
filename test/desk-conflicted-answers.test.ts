/**
 * Finding R2-10: two stored answers to one question that disagree in value or owner are marked conflicted by the migration, and a
 * route on that question is refused. A route commit finishes only answers its caller owns; one that is not refuses the whole commit.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CONFLICTED_WORDS, listAnswers, PANEL_ANSWERS_COLLECTION } from "../src/capabilities/panel-answers.ts";
import { MIGRATION_COLLECTION } from "../src/capabilities/desk-migrations.ts";
import { deskScopeFor, startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { answerIdOf } from "../src/capabilities/panel-answers.ts";

const keys = { ag_a: randomBytes(32).toString("hex"), ag_b: randomBytes(32).toString("hex") };
const sha = (k: string) => createHash("sha256").update(k).digest("hex");

const apps: DeskApp[] = [];
const open = async (root?: string) => {
  const app = await startDeskApp(root === undefined ? {} : { root });
  apps.push(app);
  writeFileSync(join(dirname(app.application.loaded.agentKeyPath), "agents.json"), JSON.stringify({
    schema: "horizon.agents/1",
    agents: [
      { key_id: "ag_a", name: "Agent A", sha256: sha(keys.ag_a), added: "2026-11-07T09:00:00.000Z" },
      { key_id: "ag_b", name: "Agent B", sha256: sha(keys.ag_b), added: "2026-11-07T09:00:00.000Z" },
    ],
  }));
  return app;
};
afterAll(async () => {
  for (const app of apps) await app.stop().catch(() => undefined);
});

const ROUTED = "step handoff_0a49 in Seed: triage inbox";
const tenantOf = (app: DeskApp) => deskScopeFor(app);
/** The tenant as the legacy records (written before operator scoping) carry it. */
const plainTenantOf = (app: DeskApp) => app.application.caller.tenant;
/** An answer as the desk wrote it before states existed: committed, unrouted, with an owner. */
/** A legacy answer written into the records of the scope, as the desk keeps them after the migration. */
const legacyIn = (scope: string, panel: string, n: number, owner: string, value: string) => ({ ...legacy(scope, panel, n, owner, value), id: answerIdOf(scope, panel, n) });
const legacy = (tenant: string, panel: string, n: number, owner: string, value: string) => ({ collection: PANEL_ANSWERS_COLLECTION, id: `answer:${panel}:${n}`, expectedVersion: 0, value: { tenant, panel_id: panel, n, ask: "q1", outcome: "answered", value, note: null, at: "2026-11-01T09:00:00.000Z", version: null, routed_as: null, step: "s1", asked_by: "Alice", asked_by_key: owner, owner_key: owner, fingerprint: null } });

/** Makes the marker read as "nothing has run", then restarts the desk on the same store so the migrations run again. */
async function migrateAgain(app: DeskApp): Promise<DeskApp> {
  const store = app.application.runtime.runtime.store;
  const current = await store.getRecord(MIGRATION_COLLECTION, `marker:${tenantOf(app)}`);
  await store.commit({ appends: [], records: [{ collection: MIGRATION_COLLECTION, id: `marker:${tenantOf(app)}`, expectedVersion: current?.version ?? 0, value: { tenant: tenantOf(app), version: 0, name: "forgotten", at: "2026-11-01T00:00:00.000Z" } }] });
  const root = app.root;
  await app.stop();
  apps.splice(apps.indexOf(app), 1);
  return open(root);
}
/** A route through the agents' door, as the named agent. */
const route = async (app: DeskApp, who: "ag_a" | "ag_b"): Promise<{ status: number; body: { ok?: boolean; message?: string } }> => {
  const response = await fetch(`${app.base}/agent/panels`, { method: "POST", headers: { authorization: `Bearer ${keys[who]}`, "content-type": "application/json" }, body: JSON.stringify({ tool: "answer.route", panel_id: "p1", ask_id: "q1", routed_as: ROUTED, request_id: crypto.randomUUID() }) });
  return { status: response.status, body: (await response.json()) as { ok?: boolean; message?: string } };
};
const waitingCount = async (app: DeskApp): Promise<number> => (await listAnswers(app.application.runtime.runtime.store, tenantOf(app), "p1")).filter((a) => a.state === "waiting_for_agent").length;

describe("contradictory answers are quarantined", () => {
  test("two legacy answers with different values and owners are marked conflicted, and a route on the question is refused", async () => {
    const first = await open();
    const store = first.application.runtime.runtime.store;
    const tenant = plainTenantOf(first);
    await store.commit({ appends: [], records: [legacy(tenant, "p1", 1, "ag_a", "a"), legacy(tenant, "p1", 2, "ag_b", "b")] });
    const app = await migrateAgain(first);

    const refused = await route(app, "ag_b");
    expect(refused.status).toBe(400);
    expect(refused.body).toMatchObject({ ok: false, message: CONFLICTED_WORDS });
    expect((await route(app, "ag_a")).body).toMatchObject({ ok: false, message: CONFLICTED_WORDS });
    expect(await waitingCount(app)).toBe(2);
  });
});

describe("a route finishes only answers its caller owns", () => {
  test("a route by the latest answer's owner cannot finish an earlier answer owned by someone else", async () => {
    const app = await open();
    const store = app.application.runtime.runtime.store;
    const tenant = tenantOf(app);
    // Written after the migrations ran, so no conflict is marked: the check on the route commit is what must refuse.
    await store.commit({ appends: [], records: [legacyIn(tenant, "p1", 1, "ag_a", "a"), legacyIn(tenant, "p1", 2, "ag_b", "a")] });

    const refused = await route(app, "ag_b");
    expect(refused.status).toBe(400);
    expect(refused.body).toMatchObject({ ok: false });
    expect(await waitingCount(app)).toBe(2);
  });

  test("a route by the owner of every waiting answer finishes them all", async () => {
    const app = await open();
    const store = app.application.runtime.runtime.store;
    const tenant = tenantOf(app);
    await store.commit({ appends: [], records: [legacyIn(tenant, "p1", 1, "ag_a", "a"), legacyIn(tenant, "p1", 2, "ag_a", "a")] });
    const done = await route(app, "ag_a");
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ ok: true });
    expect(await waitingCount(app)).toBe(0);
  });
});

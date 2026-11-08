/**
 * Finding R2-10, surfaced. A question whose stored answers disagree is marked conflicted and refused for routing; the person must be
 * told. The desk state lists it with the words that ask for a decision, and startup logs one line per conflict with ids only.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { CONFLICT_WORDS, conflictLogLines, conflictViews } from "../src/ui/desk/conflict-model.ts";
import { PANEL_ANSWERS_COLLECTION } from "../src/capabilities/panel-answers.ts";
import { MIGRATION_COLLECTION } from "../src/capabilities/desk-migrations.ts";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";

const SECRET = "SECRET-ANSWER-WORDS-91";

describe("the conflict view model", () => {
  test("a conflicted question is an item with the decision words and a stop-waiting action when a step is known", () => {
    const [item] = conflictViews([{ panel: "p1", ask: "q1", question: "Ship it?", step: "s1" }]);
    expect(item).toMatchObject({ panel: "p1", ask: "q1", title: "Ship it?", words: "Two earlier answers to this question disagree. Choose which one stands, or stop waiting.", step: "s1", actions: ["stop_waiting"] });
    expect(item?.words).toBe(CONFLICT_WORDS);
  });

  test("with no step, the item still shows and offers no stop-waiting action", () => {
    const [item] = conflictViews([{ panel: "p1", ask: "q1", question: null, step: null }]);
    expect(item).toMatchObject({ title: "A question", actions: [] });
  });

  test("one log line per conflict, with ids only", () => {
    const lines = conflictLogLines([{ panel: "p1", ask: "q1" }, { panel: "p2", ask: "q9" }]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("p1");
    expect(lines.join("\n")).not.toContain(SECRET);
  });
});

const apps: DeskApp[] = [];
afterAll(async () => {
  for (const app of apps) await app.stop().catch(() => undefined);
});

/** Two committed answers to one question that disagree in value and owner, written as the desk wrote them before states existed. */
const legacy = (tenant: string, panel: string, n: number, owner: string, value: string) => ({ collection: PANEL_ANSWERS_COLLECTION, id: `answer:${panel}:${n}`, expectedVersion: 0, value: { tenant, panel_id: panel, n, ask: "q1", outcome: "answered", value, note: null, at: "2026-11-01T09:00:00.000Z", version: null, routed_as: null, step: "s1", asked_by: "Alice", asked_by_key: owner, owner_key: owner, fingerprint: null } });

/** Makes the marker read as "nothing has run", then starts the desk again on the same records, so the migrations (and the log) run again. */
async function restartWithConflict(): Promise<{ app: DeskApp; errors: string[] }> {
  const first = await startDeskApp();
  apps.push(first);
  const tenant = first.application.caller.tenant;
  const store = first.application.runtime.runtime.store;
  await store.commit({ appends: [], records: [legacy(tenant, "p1", 1, "ag_a", SECRET), legacy(tenant, "p1", 2, "ag_b", "other words")] });
  const marker = await store.getRecord(MIGRATION_COLLECTION, `marker:${tenant}`);
  await store.commit({ appends: [], records: [{ collection: MIGRATION_COLLECTION, id: `marker:${tenant}`, expectedVersion: marker?.version ?? 0, value: { tenant, version: 0, name: "forgotten", at: "2026-11-01T00:00:00.000Z" } }] });
  const root = first.root;
  await first.stop();
  apps.splice(apps.indexOf(first), 1);
  const errors: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { errors.push(args.map(String).join(" ")); };
  try {
    const app = await startDeskApp({ root });
    apps.push(app);
    return { app, errors };
  } finally {
    console.error = original;
  }
}

describe("the desk tells the person about a conflicted question", () => {
  test("the desk state lists the conflict with its step, and startup logs one line per conflict without answer text", async () => {
    const { app, errors } = await restartWithConflict();
    const state = (await app.state()) as { panels?: { conflicts?: { panel: string; ask: string; question: string | null; step: string | null }[] } };
    expect(state.panels?.conflicts).toEqual([{ panel: "p1", ask: "q1", question: null, step: "s1" }]);
    const lines = errors.filter((line) => line.includes("disagree"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("p1");
    expect(errors.join("\n")).not.toContain(SECRET);
    expect(errors.join("\n")).not.toContain("other words");
  });
});

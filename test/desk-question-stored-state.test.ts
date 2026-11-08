/**
 * Design v3, step 4 (item 5): every question has an explicit stored state: waiting for you, put off, waiting for the agent, finished, or
 * withdrawn. The board's `answered` and `withdrawn` are derived from it, never stored. Each state is set through the desk's own entry
 * points, then read back from the records after the desk restarts on the same SQLite file.
 */
import { revisionOf } from "./support/answer-revision.ts";
import { afterAll, describe, expect, test } from "bun:test";
import { PANEL_ANSWERS_COLLECTION } from "../src/capabilities/panel-answers.ts";
import { PANELS_COLLECTION, questionStateOf } from "../src/capabilities/panel-records.ts";
import { MIGRATION_COLLECTION } from "../src/capabilities/desk-migrations.ts";
import { QUESTION_STATES } from "../src/capabilities/question-rules.ts";
import { deskScopeFor, startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { panelIdOf } from "../src/capabilities/panel-records.ts";
import { answerIdOf } from "../src/capabilities/panel-answers.ts";

const apps: DeskApp[] = [];
const open = async (root?: string) => {
  const app = await startDeskApp(root === undefined ? {} : { root });
  apps.push(app);
  return app;
};
const restart = async (app: DeskApp) => {
  const root = app.root;
  await app.stop();
  apps.splice(apps.indexOf(app), 1);
  return open(root);
};
afterAll(async () => {
  for (const app of apps) await app.stop().catch(() => undefined);
});

const askOf = (id: string) => ({ id, question: "Which plan?", why_needed: "x", options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }] });
const tenantOf = (app: DeskApp) => deskScopeFor(app);
const storeOf = (app: DeskApp) => app.application.runtime.runtime.store;

/** One panel per state, each with one question "q", set up through the agent door and the person's answers. */
async function setUpEveryState(app: DeskApp): Promise<void> {
  const put = (panel: string) => app.application.applyAgentOp({ tool: "ask_human", panel, ask: askOf("q") });
  await put("st-waiting");
  await put("st-put-off");
  await app.post("/desk/panels/op", { op: "human.answer", panel: "st-put-off", ask: "q", ...(await revisionOf(app, "st-put-off", "q")), outcome: "deferred" });
  await put("st-agent");
  await app.post("/desk/panels/op", { op: "human.answer", panel: "st-agent", ask: "q", ...(await revisionOf(app, "st-agent", "q")), outcome: "answered", value: "a" });
  await put("st-finished");
  await app.post("/desk/panels/op", { op: "human.answer", panel: "st-finished", ask: "q", ...(await revisionOf(app, "st-finished", "q")), outcome: "answered", value: "b" });
  await app.application.applyAgentOp({ tool: "answer.route", panel_id: "st-finished", ask_id: "q", routed_as: "step handoff_0a49 in Seed: triage inbox" });
  await put("st-withdrawn");
  await app.application.applyAgentOp({ tool: "ask.withdraw", panel_id: "st-withdrawn", ask_id: "q", reason: "no longer needed" });
}

const EXPECTED = {
  "st-waiting": "waiting_for_you",
  "st-put-off": "put_off",
  "st-agent": "waiting_for_agent",
  "st-finished": "finished",
  "st-withdrawn": "withdrawn",
} as const;

async function statesOf(app: DeskApp): Promise<Record<string, string | undefined>> {
  const out: Record<string, string | undefined> = {};
  for (const panel of Object.keys(EXPECTED)) out[panel] = await questionStateOf(storeOf(app), tenantOf(app), panel, "q");
  return out;
}

describe("every question has one stored state, and it survives a restart", () => {
  test("each of the five states is stored, and reads back the same after the desk restarts", async () => {
    const first = await open();
    await setUpEveryState(first);
    expect(await statesOf(first)).toEqual(EXPECTED);
    const second = await restart(first);
    expect(await statesOf(second)).toEqual(EXPECTED);
  });

  test("an unanswered question stores waiting for you on its own panel record", async () => {
    const app = await open();
    await setUpEveryState(app);
    const raw = (await storeOf(app).getRecord(PANELS_COLLECTION, panelIdOf(tenantOf(app), "st-waiting")))!.value as { blocks: { kind: string; id: string; state?: unknown }[] };
    expect(raw.blocks.find((b) => b.kind === "question" && b.id === "q")?.state).toBe("waiting_for_you");
    const withdrawn = (await storeOf(app).getRecord(PANELS_COLLECTION, panelIdOf(tenantOf(app), "st-withdrawn")))!.value as { blocks: { kind: string; id: string; state?: unknown }[] };
    expect(withdrawn.blocks.find((b) => b.kind === "question" && b.id === "q")?.state).toBe("withdrawn");
  });

  test("an answered question stores its state once, on its answer record, and not on its panel", async () => {
    const app = await open();
    await setUpEveryState(app);
    const answer = (await storeOf(app).getRecord(PANEL_ANSWERS_COLLECTION, answerIdOf(tenantOf(app), "st-finished", 1)))!.value as { state?: unknown; finished_by?: unknown; replied?: unknown; waiting_on?: unknown };
    expect(answer.state).toBe("finished");
    expect(answer.finished_by).toBe("reported");
    expect("replied" in answer).toBe(false);
    expect("waiting_on" in answer).toBe(false);
    const panel = (await storeOf(app).getRecord(PANELS_COLLECTION, panelIdOf(tenantOf(app), "st-finished")))!.value as { blocks: { kind: string; id: string; state?: unknown; answered?: unknown }[] };
    const block = panel.blocks.find((b) => b.kind === "question" && b.id === "q")!;
    expect(block.state).toBeUndefined();
    expect(block.answered).toBeUndefined();
  });

  test("the board derives answered and withdrawn from the state, and no board block carries the stored state", async () => {
    const app = await open();
    await setUpEveryState(app);
    const state = await app.state();
    const block = (panel: string) => state.panels.open.find((p: { id: string }) => p.id === panel)?.blocks.find((b: { id: string }) => b.id === "q");
    expect(block("st-waiting").answered).toBeNull();
    expect(block("st-waiting").withdrawn).toBeNull();
    expect(block("st-put-off").answered.outcome).toBe("deferred");
    expect(block("st-agent").answered.outcome).toBe("answered");
    expect(block("st-withdrawn").withdrawn).toBeTruthy();
    for (const panel of Object.keys(EXPECTED)) expect("state" in block(panel)).toBe(false);
  });

  test("a question from before states existed gets its state written once, by the migration", async () => {
    const app = await open();
    await setUpEveryState(app);
    const store = storeOf(app);
    const tenant = tenantOf(app);
    // Strip the stored state from the unanswered question, as a record from before this step would look.
    const row = (await store.getRecord(PANELS_COLLECTION, panelIdOf(tenant, "st-waiting")))!;
    const legacy = { ...(row.value as Record<string, unknown>), blocks: (row.value as { blocks: Record<string, unknown>[] }).blocks.map((b) => (b.kind === "question" ? { ...b, state: undefined } : b)) };
    await store.commit({ appends: [], records: [{ collection: PANELS_COLLECTION, id: panelIdOf(tenant, "st-waiting"), expectedVersion: row.version, value: JSON.parse(JSON.stringify(legacy)) }] });
    const marker = await store.getRecord(MIGRATION_COLLECTION, `marker:${tenant}`);
    await store.commit({ appends: [], records: [{ collection: MIGRATION_COLLECTION, id: `marker:${tenant}`, expectedVersion: marker?.version ?? 0, value: { tenant, version: 0, name: "forgotten", at: "2026-11-01T00:00:00.000Z" } }] });
    const again = await restart(app);
    expect(await questionStateOf(storeOf(again), tenantOf(again), "st-waiting", "q")).toBe("waiting_for_you");
    const raw = (await storeOf(again).getRecord(PANELS_COLLECTION, panelIdOf(tenantOf(again), "st-waiting")))!.value as { blocks: { kind: string; state?: unknown }[] };
    expect(raw.blocks.find((b) => b.kind === "question")?.state).toBe("waiting_for_you");
  });

  test("the five state names are the ones the rules use", () => {
    expect([...QUESTION_STATES]).toEqual(["waiting_for_you", "put_off", "waiting_for_agent", "finished", "withdrawn"]);
  });
});

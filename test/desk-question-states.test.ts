/**
 * Design v3, step 3: each question has one stored state (waiting for you, put off, waiting for the agent, finished, withdrawn) and
 * why it finished; a question id keeps its first wording; and a route, a withdrawal, a move to another agent and a stop of the wait
 * are each one store commit that holds the conversation row. The proofs go through the desk's own HTTP entry points. The restart
 * tests start a second desk on the same records (the same `root`). Commits are counted by wrapping the store's commit.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import { listAnswers, migrateAnswerStates, NOTHING_SENT, PANEL_ANSWERS_COLLECTION, STOPPED_ROW } from "../src/capabilities/panel-answers.ts";
import { compatOf, finishedByOf, SAME_ID_OTHER_WORDS, statusOfLegacy } from "../src/capabilities/question-rules.ts";
import { CONVERSATION_COLLECTION } from "../src/capabilities/conversation.ts";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";

const SAME_ID = "That question id was already used for different wording. Use a new question id.";
const keys = { ag_alice: randomBytes(32).toString("hex"), ag_alice2: randomBytes(32).toString("hex") };
const sha = (k: string) => createHash("sha256").update(k).digest("hex");

const apps: DeskApp[] = [];
const open = async (options: { root?: string } = {}) => {
  const app = await startDeskApp(options);
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
/** Stops the first desk and starts a second one on the same records. */
const restart = async (app: DeskApp) => {
  const root = app.root;
  await app.stop();
  apps.splice(apps.indexOf(app), 1);
  return open({ root });
};
afterAll(async () => {
  for (const app of apps) await app.stop().catch(() => undefined);
});

const question = (id: string, text = "Which plan?", extra: Record<string, unknown> = {}) => ({ id, question: text, why_needed: "x", options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }], ...extra });
const agent = (app: DeskApp, key: string, name: string, body: unknown) =>
  fetch(`${app.base}/agent/panels`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-horizon-agent-name": name }, body: JSON.stringify(body) });
const putAs = (app: DeskApp, panel: string, ask: Record<string, unknown>, key = keys.ag_alice, step?: string) => agent(app, key, "Alice", { tool: "ask_human", panel, ask, ...(step === undefined ? {} : { step }) });
const person = (app: DeskApp, body: unknown) => app.post("/desk/panels/op", body);
const answer = (app: DeskApp, panel: string, ask: string, outcome: "answered" | "deferred" = "answered") => person(app, { op: "human.answer", panel, ask, outcome, value: outcome === "answered" ? "a" : undefined });
const route = (app: DeskApp, panel: string, ask: string, said: string, key = keys.ag_alice) => agent(app, key, "Alice", { tool: "answer.route", panel_id: panel, ask_id: ask, routed_as: said });
const withdraw = (app: DeskApp, panel: string, ask: string, reason = "no longer needed") => agent(app, keys.ag_alice, "Alice", { tool: "ask.withdraw", panel_id: panel, ask_id: ask, reason });
const blockOf = (state: any, panel: string, ask: string): any => state.panels.open.find((p: { id: string }) => p.id === panel)?.blocks.find((b: { id: string }) => b.id === ask);
const rowsOf = async (app: DeskApp): Promise<any[]> => (await (await fetch(`${app.base}/desk/conversation`)).json()).rows;

/** Counts the store commits the action makes, and the collections each one writes. `failOn` makes a commit fail when it writes that collection. */
function recordCommits(app: DeskApp, failOn?: string) {
  const store = app.application.runtime.runtime.store as unknown as { commit: (input: { records?: { collection: string }[] }) => Promise<unknown> };
  const real = store.commit.bind(store);
  const commits: string[][] = [];
  store.commit = async (input) => {
    const cols = (input.records ?? []).map((r) => r.collection);
    if (failOn !== undefined && cols.includes(failOn)) throw new Error("disk full");
    commits.push(cols);
    return real(input);
  };
  return { commits, restore: () => { store.commit = real; } };
}
async function withCommits<T>(app: DeskApp, run: () => Promise<T>, failOn?: string): Promise<{ readonly result: T; readonly commits: string[][] }> {
  const recorder = recordCommits(app, failOn);
  const quiet = console.error;
  console.error = () => undefined;
  try {
    const result = await run();
    return { result, commits: recorder.commits };
  } finally {
    console.error = quiet;
    recorder.restore();
  }
}

describe("a question id keeps its first wording, whatever its state", () => {
  test("unanswered: a changed put under the same id is refused, and nothing changes", async () => {
    const app = await open();
    expect((await putAs(app, "same_u", question("q"))).status).toBe(200);
    const changed = await putAs(app, "same_u", question("q", "Changed?"));
    expect(changed.status).toBe(400);
    expect(((await changed.json()) as any).message).toBe(SAME_ID);
    expect(blockOf(await app.state(), "same_u", "q").question).toBe("Which plan?");
    // The same words are not a change: the question is still there and can be answered.
    expect((await putAs(app, "same_u", question("q"))).status).toBe(200);
    expect((await answer(app, "same_u", "q")).status).toBe(200);
  });

  test("put off: a changed put is refused; the same words reopen the question and keep its history", async () => {
    const app = await open();
    await putAs(app, "same_p", question("q"));
    expect((await answer(app, "same_p", "q", "deferred")).status).toBe(200);
    const changed = await putAs(app, "same_p", question("q", "Now which?"));
    expect(changed.status).toBe(400);
    expect(((await changed.json()) as any).message).toBe(SAME_ID);
    expect(blockOf(await app.state(), "same_p", "q").answered?.outcome).toBe("deferred");
    expect((await putAs(app, "same_p", question("q"))).status).toBe(200);
    const shown = blockOf(await app.state(), "same_p", "q");
    expect(shown.answered).toBeNull();
    expect(shown.earlier?.map((e: { outcome: string }) => e.outcome)).toEqual(["deferred"]);
  });

  test("answered: a changed put is refused with the same words; the identical put keeps the answer", async () => {
    const app = await open();
    await putAs(app, "same_a", question("q"));
    expect((await answer(app, "same_a", "q")).status).toBe(200);
    const changed = await putAs(app, "same_a", question("q", "Different now?"));
    expect(changed.status).toBe(400);
    expect(((await changed.json()) as any).message).toBe(SAME_ID);
    expect((await putAs(app, "same_a", question("q"))).status).toBe(200);
    expect(blockOf(await app.state(), "same_a", "q").answered?.value).toBe("a");
  });
});

describe("each state is stored once and the rest is derived", () => {
  test("the five states, with why a question finished kept apart", async () => {
    const app = await open();
    await putAs(app, "st_wait", question("w"));
    await putAs(app, "st_put", question("p"));
    await answer(app, "st_put", "p", "deferred");
    await putAs(app, "st_agent", question("a"));
    await answer(app, "st_agent", "a");
    await putAs(app, "st_done", question("d"));
    await answer(app, "st_done", "d");
    await route(app, "st_done", "d", "step handoff_0a49 in Seed: triage inbox");
    await putAs(app, "st_stop", question("s"), keys.ag_alice, "stp_stop");
    await answer(app, "st_stop", "s");
    await person(app, { op: "human.stop_waiting", step: "stp_stop" });
    await putAs(app, "st_gone", question("x"));
    expect((await withdraw(app, "st_gone", "x")).status).toBe(200);

    const state = await app.state();
    expect(blockOf(state, "st_wait", "w").answered).toBeNull();
    expect(blockOf(state, "st_wait", "w").withdrawn ?? null).toBeNull();
    expect(blockOf(state, "st_put", "p").answered?.outcome).toBe("deferred");
    expect(blockOf(state, "st_agent", "a").answered?.outcome).toBe("answered");
    expect(blockOf(state, "st_done", "d").answered?.routed_as).toBe("step handoff_0a49 in Seed: triage inbox");
    expect(blockOf(state, "st_stop", "s").answered?.outcome).toBe("answered");
    expect(blockOf(state, "st_gone", "x").withdrawn?.reason).toBe("no longer needed");
    expect(blockOf(state, "st_gone", "x").answered).toBeNull();

    const stored = (panel: string, ask: string) => app.application.runtime.runtime.store.listRecords(PANEL_ANSWERS_COLLECTION, { tenant: app.application.caller.tenant }).then((rows) => rows.find((r) => r.id === `answer:${panel}:1`)?.value as any);
    expect(await stored("st_put", "p")).toMatchObject({ state: "put_off", finished_by: null });
    expect(await stored("st_agent", "a")).toMatchObject({ state: "waiting_for_agent", finished_by: null });
    expect(await stored("st_done", "d")).toMatchObject({ state: "finished", finished_by: "reported" });
    expect(await stored("st_stop", "s")).toMatchObject({ state: "finished", finished_by: "stopped" });
    expect(await stored("st_done", "d")).not.toHaveProperty("replied");
    expect(await stored("st_done", "d")).not.toHaveProperty("waiting_on");
  });

  test("the compatibility fields follow from the state", () => {
    expect(compatOf("waiting_for_agent")).toEqual({ replied: false, waiting_on: "agent" });
    expect(compatOf("finished")).toEqual({ replied: true, waiting_on: "none" });
    expect(compatOf("put_off")).toEqual({ replied: true, waiting_on: "none" });
    expect(compatOf("waiting_for_you")).toEqual({ replied: true, waiting_on: "none" });
    expect(compatOf("withdrawn")).toEqual({ replied: true, waiting_on: "none" });
    expect(finishedByOf("step handoff_0a49 in Seed")).toBe("reported");
    expect(finishedByOf(null)).toBe("stopped");
    expect(finishedByOf("Answered before the upgrade; the owner was not recorded.")).toBe("stopped");
    expect(SAME_ID_OTHER_WORDS).toBe(SAME_ID);
  });
});

describe("each transition is one store commit that holds the conversation row", () => {
  test("a route is one commit: the answer, the row and the panel's row", async () => {
    const app = await open();
    await putAs(app, "tx_route", question("q"));
    await answer(app, "tx_route", "q");
    const { result, commits } = await withCommits(app, () => route(app, "tx_route", "q", "step handoff_0a49 in Seed: triage inbox"));
    expect(result.status).toBe(200);
    expect(commits).toHaveLength(1);
    expect(commits[0]).toContain(PANEL_ANSWERS_COLLECTION);
    expect(commits[0]).toContain(CONVERSATION_COLLECTION);
  });

  test("a route whose row cannot be written changes nothing: the answer still waits, and no row changes", async () => {
    const app = await open();
    await putAs(app, "tx_fail", question("q"));
    await answer(app, "tx_fail", "q");
    const rowsBefore = JSON.stringify(await rowsOf(app));
    const stateBefore = JSON.stringify((await app.state()).panels);
    const refused = await withCommits(app, () => route(app, "tx_fail", "q", "step handoff_0a49 in Seed: triage inbox"), CONVERSATION_COLLECTION);
    expect(refused.result.status).toBe(503);
    expect(((await refused.result.json()) as any).message).toBe(NOTHING_SENT);
    expect(refused.commits).toHaveLength(0);
    expect(JSON.stringify(await rowsOf(app))).toBe(rowsBefore);
    expect(JSON.stringify((await app.state()).panels)).toBe(stateBefore);
    // Still waiting for the agent: the step cannot be accepted, and a later route goes through.
    const waiting = await (await agent(app, keys.ag_alice, "Alice", { tool: "read_responses" })).json();
    expect(waiting.responses.find((r: any) => r.panel_id === "tx_fail")).toMatchObject({ replied: false, state: "waiting_for_agent" });
    expect((await route(app, "tx_fail", "q", "step handoff_0a49 in Seed: triage inbox")).status).toBe(200);
  });

  test("a withdrawal is one commit that holds its row and the withdrawn state", async () => {
    const app = await open();
    await putAs(app, "tx_wd", question("q"));
    const { result, commits } = await withCommits(app, () => withdraw(app, "tx_wd", "q"));
    expect(result.status).toBe(200);
    expect(commits).toHaveLength(1);
    expect(commits[0]).toContain("horizon-panels");
    expect(commits[0]).toContain(CONVERSATION_COLLECTION);
    expect(blockOf(await app.state(), "tx_wd", "q").withdrawn?.reason).toBe("no longer needed");
  });

  test("a move to another agent is one commit that holds its row, the owner and the panel", async () => {
    const app = await open();
    await putAs(app, "tx_mv", question("q"));
    await answer(app, "tx_mv", "q");
    const { result, commits } = await withCommits(app, () => person(app, { op: "human.reassign_owner", panel: "tx_mv", ask: "q", from_key_id: "ag_alice", to_key_id: "ag_alice2", confirmed: true }));
    expect(result.status).toBe(200);
    expect(commits).toHaveLength(1);
    expect(commits[0]).toContain(PANEL_ANSWERS_COLLECTION);
    expect(commits[0]).toContain("horizon-panels");
    expect(commits[0]).toContain(CONVERSATION_COLLECTION);
  });

  test("stopping the wait is one commit that holds the answers and their rows", async () => {
    const app = await open();
    await putAs(app, "tx_stop", question("q"), keys.ag_alice, "tx_step");
    await answer(app, "tx_stop", "q");
    const { result, commits } = await withCommits(app, () => person(app, { op: "human.stop_waiting", step: "tx_step" }));
    expect(result.status).toBe(200);
    expect(commits).toHaveLength(1);
    expect(commits[0]).toContain(PANEL_ANSWERS_COLLECTION);
    expect(commits[0]).toContain(CONVERSATION_COLLECTION);
    const rows = await rowsOf(app);
    expect(rows.some((r) => r.outcome === STOPPED_ROW)).toBe(true);
  });
});

describe("after each transition a restart loads the same state", () => {
  const snapshot = async (app: DeskApp) => JSON.stringify({ panels: (await app.state()).panels, rows: await rowsOf(app) });

  test("answered, then routed", async () => {
    const first = await open();
    await putAs(first, "rs_route", question("q"));
    await answer(first, "rs_route", "q");
    await route(first, "rs_route", "q", "step handoff_0a49 in Seed: triage inbox");
    const before = await snapshot(first);
    const second = await restart(first);
    expect(await snapshot(second)).toBe(before);
  });

  test("withdrawn", async () => {
    const first = await open();
    await putAs(first, "rs_wd", question("q"));
    await withdraw(first, "rs_wd", "q");
    const before = await snapshot(first);
    const second = await restart(first);
    expect(await snapshot(second)).toBe(before);
  });

  test("moved to another agent", async () => {
    const first = await open();
    await putAs(first, "rs_mv", question("q"));
    await answer(first, "rs_mv", "q");
    await person(first, { op: "human.reassign_owner", panel: "rs_mv", ask: "q", from_key_id: "ag_alice", to_key_id: "ag_alice2", confirmed: true });
    const before = await snapshot(first);
    const second = await restart(first);
    expect(await snapshot(second)).toBe(before);
  });

  test("the wait stopped", async () => {
    const first = await open();
    await putAs(first, "rs_stop", question("q"), keys.ag_alice, "rs_step");
    await answer(first, "rs_stop", "q");
    await person(first, { op: "human.stop_waiting", step: "rs_step" });
    const before = await snapshot(first);
    const second = await restart(first);
    expect(await snapshot(second)).toBe(before);
  });

  test("put off, then reopened by the same words", async () => {
    const first = await open();
    await putAs(first, "rs_put", question("q"));
    await answer(first, "rs_put", "q", "deferred");
    await putAs(first, "rs_put", question("q"));
    const before = await snapshot(first);
    const second = await restart(first);
    expect(await snapshot(second)).toBe(before);
  });
});

describe("states of answers written before this step", () => {
  const tenant = "t";
  const legacy = (n: number, panel: string, value: Record<string, unknown>) => ({ collection: PANEL_ANSWERS_COLLECTION, id: `answer:${panel}:${n}`, expectedVersion: 0, value: { tenant, panel_id: panel, n, ask: "q", value: null, note: null, at: "2026-11-07T10:00:00.000Z", step: "s", ...value } });

  test("a legacy record is read once: its state is derived, and the derived copies are dropped", async () => {
    const store = createMemoryStore();
    await store.commit({ appends: [], records: [
      legacy(1, "p", { outcome: "answered", replied: false, waiting_on: "agent", routed_as: null }),
      legacy(2, "p", { outcome: "answered", replied: true, waiting_on: "none", routed_as: "step handoff_0a49 in Seed" }),
      legacy(3, "p", { outcome: null, replied: true, waiting_on: "none", routed_as: null }),
    ] as never });
    expect(await migrateAnswerStates(store, tenant)).toBe(3);
    const rows = await listAnswers(store, tenant, "p");
    expect(rows.map((r) => r.state)).toEqual(["waiting_for_agent", "finished", "put_off"]);
    expect(rows.map((r) => r.replied)).toEqual([false, true, true]);
    expect(rows.map((r) => r.waiting_on)).toEqual(["agent", "none", "none"]);
    expect(rows[1]?.finished_by).toBe("reported");
    const stored = (await store.getRecord(PANEL_ANSWERS_COLLECTION, "answer:p:3"))?.value as Record<string, unknown>;
    expect(stored).not.toHaveProperty("replied");
    expect(stored).not.toHaveProperty("waiting_on");
    expect(stored.state).toBe("put_off");
  });

  test("a second run writes nothing", async () => {
    const store = createMemoryStore();
    await store.commit({ appends: [], records: [legacy(1, "p", { outcome: "answered", replied: false, waiting_on: "agent", routed_as: null })] as never });
    expect(await migrateAnswerStates(store, tenant)).toBe(1);
    expect(await migrateAnswerStates(store, tenant)).toBe(0);
  });

  test("statusOfLegacy keeps a state that is already stored", () => {
    expect(statusOfLegacy({ state: "withdrawn", outcome: null, replied: true })).toBe("withdrawn");
    expect(statusOfLegacy({ outcome: "answered", replied: false })).toBe("waiting_for_agent");
  });
});

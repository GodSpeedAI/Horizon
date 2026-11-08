/**
 * Design v3, section 2 (step 4, item 2): a panel operation carries a request id. The same id with the same body returns the response it
 * got and writes nothing again. The same id with other contents is refused. A lost response after a successful commit causes neither
 * a second answer nor a missing row. Each test goes through the desk's own HTTP entry point; the restart test reopens the desk's SQLite
 * file.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { listAnswers } from "../src/capabilities/panel-answers.ts";
import { CONVERSATION_COLLECTION } from "../src/capabilities/conversation.ts";
import { REUSED_REQUEST_WORDS } from "../src/capabilities/desk-requests.ts";
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

const askOf = (id: string) => ({ id, question: "Which plan?", why_needed: "x", options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }] });
const answer = (app: DeskApp, panel: string, ask: string, requestId: string | undefined, value = "a") =>
  app.post("/desk/panels/op", { op: "human.answer", panel, ask, outcome: "answered", value, ...(requestId === undefined ? {} : { request_id: requestId }) });
const rowsFor = async (app: DeskApp, ask: string): Promise<number> =>
  (await app.application.runtime.runtime.store.listRecords(CONVERSATION_COLLECTION, { tenant: app.application.caller.tenant })).filter((r) => (r.value as { refs?: { ask_id?: string } }).refs?.ask_id === ask).length;

describe("a request id makes a retry safe", () => {
  test("the same id twice gives one answer, the same result, and one row", async () => {
    const app = await open();
    await app.application.applyAgentOp({ tool: "ask_human", panel: "p1", ask: askOf("q1") });
    const first = await answer(app, "p1", "q1", "req-same-1");
    const firstBody = await first.json();
    const second = await answer(app, "p1", "q1", "req-same-1");
    const secondBody = await second.json();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(secondBody).toEqual(firstBody);
    expect((await listAnswers(app.application.runtime.runtime.store, app.application.caller.tenant, "p1")).filter((a) => a.ask === "q1").length).toBe(1);
    expect(await rowsFor(app, "q1")).toBe(1);
  });

  test("a lost response after success: the browser retries and gets the answer it already has", async () => {
    const app = await open();
    await app.application.applyAgentOp({ tool: "ask_human", panel: "p2", ask: askOf("q2") });
    // The first response is read by no one (it was lost); the retry carries the same id and body.
    expect((await answer(app, "p2", "q2", "req-lost-1")).status).toBe(200);
    const retry = await answer(app, "p2", "q2", "req-lost-1");
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ ok: true, message: "Sent. Waiting for the agent to say where it went." });
    expect(await rowsFor(app, "q2")).toBe(1);
    const block = (await app.state()).panels.open.find((p: { id: string }) => p.id === "p2").blocks.find((b: { id: string }) => b.id === "q2");
    expect(block.answered.outcome).toBe("answered");
  });

  test("the same id with different contents is refused, and nothing changes", async () => {
    const app = await open();
    await app.application.applyAgentOp({ tool: "ask_human", panel: "p3", ask: askOf("q3") });
    expect((await answer(app, "p3", "q3", "req-other-1", "a")).status).toBe(200);
    const other = await answer(app, "p3", "q3", "req-other-1", "b");
    const body = (await other.json()) as { ok: boolean; message: string };
    expect(other.status).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.message).toBe("That request id was already used for something else.");
    expect(REUSED_REQUEST_WORDS).toBe(body.message);
    const stored = (await listAnswers(app.application.runtime.runtime.store, app.application.caller.tenant, "p3")).filter((a) => a.ask === "q3");
    expect(stored.length).toBe(1);
    expect(stored[0]!.value).toBe("a");
  });

  test("a request that was refused stores nothing, so its id can be used again", async () => {
    const app = await open();
    await app.application.applyAgentOp({ tool: "ask_human", panel: "p4", ask: askOf("q4") });
    // An answer that is not one of the choices is refused before anything is written (the board refuses it with 409).
    expect((await answer(app, "p4", "q4", "req-retry-1", "zzz")).status).toBe(409);
    expect((await answer(app, "p4", "q4", "req-retry-1", "a")).status).toBe(200);
    expect(await rowsFor(app, "q4")).toBe(1);
  });

  test("an id that cannot be read is refused in plain words", async () => {
    const app = await open();
    await app.application.applyAgentOp({ tool: "ask_human", panel: "p5", ask: askOf("q5") });
    const response = await answer(app, "p5", "q5", "has spaces in it");
    expect(response.status).toBe(400);
    expect((await response.json() as { message: string }).message).toBe("That request id could not be read. Nothing was sent.");
  });

  test("restart: a retry after the desk restarts still returns the original result, from the SQLite file", async () => {
    const first = await open();
    const root = first.root;
    await first.application.applyAgentOp({ tool: "ask_human", panel: "p6", ask: askOf("q6") });
    const original = await (await answer(first, "p6", "q6", "req-restart-1")).json();
    await first.stop();
    apps.splice(apps.indexOf(first), 1);
    const second = await open(root);
    const retry = await answer(second, "p6", "q6", "req-restart-1");
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual(original);
    expect(await rowsFor(second, "q6")).toBe(1);
    const reused = await answer(second, "p6", "q6", "req-restart-1", "b");
    expect(reused.status).toBe(409);
  });
});

describe("the desk words for requests", () => {
  test("the words are plain", () => {
    expect(REUSED_REQUEST_WORDS).not.toMatch(/\b(idempotent|fingerprint|dedup)/i);
  });
});

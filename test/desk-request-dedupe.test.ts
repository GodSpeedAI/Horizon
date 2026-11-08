/**
 * Design v3, section 2: every mutation takes a request id. A retry with the same id returns the stored response and writes nothing; the
 * same id with other contents is refused. A stop-waiting retried after a new wait exists does not close that new wait.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";

let app: DeskApp;
let key: string;
beforeAll(async () => {
  app = await startDeskApp();
  key = app.application.loaded.agentKey;
});
afterAll(async () => app.stop());

const ask = (id: string) => ({ id, question: "Which plan?", why_needed: "x", options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }] });
const waiting = async (): Promise<{ step: string; panel: string }[]> => (await app.state()).panels.waiting;
const stop = (step: string, requestId?: string) => app.post("/desk/panels/op", { op: "human.stop_waiting", step, ...(requestId === undefined ? {} : { request_id: requestId }) });
const door = (body: unknown) => fetch(`${app.base}/agent/panels`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body) });

describe("every mutation is deduplicated by request id", () => {
  test("a stop-waiting retried with the same id after a new wait exists does not close the new wait", async () => {
    await app.application.applyAgentOp({ tool: "ask_human", panel: "dd-a", ask: ask("qa"), step: "step_dd" });
    await app.post("/desk/panels/op", { op: "human.answer", panel: "dd-a", ask: "qa", outcome: "answered", value: "a" });
    const first = await stop("step_dd", "stop-dd-1");
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true, message: "Stopped waiting. The step can be accepted now." });

    // A new wait on the same step.
    await app.application.applyAgentOp({ tool: "ask_human", panel: "dd-b", ask: ask("qb"), step: "step_dd" });
    await app.post("/desk/panels/op", { op: "human.answer", panel: "dd-b", ask: "qb", outcome: "answered", value: "b" });
    expect((await waiting()).some((w) => w.step === "step_dd" && w.panel === "dd-b")).toBe(true);

    // The retry returns the stored response and does not touch the new wait.
    const retry = await stop("step_dd", "stop-dd-1");
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ ok: true, message: "Stopped waiting. The step can be accepted now." });
    expect((await waiting()).some((w) => w.step === "step_dd" && w.panel === "dd-b")).toBe(true);
  });

  test("the same stop-waiting id with a different step is refused, and nothing changes", async () => {
    const other = await stop("step_other", "stop-dd-1");
    expect(other.status).toBe(409);
    expect((await waiting()).some((w) => w.step === "step_dd")).toBe(true);
  });

  test("a pin retried with the same id is stored once; the same id with a different body is refused", async () => {
    await app.application.applyAgentOp({ tool: "ask_human", panel: "dd-pin", ask: ask("qp") });
    const body = { op: "human.pin", id: "dd-pin", pinned: true, request_id: "pin-dd-1" };
    expect((await app.post("/desk/panels/op", body)).status).toBe(200);
    expect((await app.post("/desk/panels/op", body)).status).toBe(200);
    expect((await app.post("/desk/panels/op", { ...body, pinned: false })).status).toBe(409);
    expect((await app.state()).panels.open.find((p: any) => p.id === "dd-pin").pinned).toBe(true);
  });

  test("an agent's put retried with the same request id is not put again", async () => {
    const put = { tool: "ask_human", panel: "dd-agent", ask: ask("qg"), request_id: "put-dd-1" };
    const first = await door(put);
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    const again = await door(put);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(firstBody);
    const other = await door({ ...put, panel: "dd-other" });
    expect(other.status).toBe(409);
    expect((await app.state()).panels.open.map((p: any) => p.id)).not.toContain("dd-other");
  });
});

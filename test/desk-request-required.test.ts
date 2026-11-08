/**
 * Finding R2-11: every person change carries a request id, so a retry of one command returns its stored reply and a later command is
 * never confused with it. A stop with no id is refused and changes nothing. Stop one wait, create another on the same step, retry the
 * original stop with its id: the new wait stays open.
 */
import { revisionOf } from "./support/answer-revision.ts";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";

let app: DeskApp;
beforeAll(async () => {
  app = await startDeskApp();
});
afterAll(async () => app.stop());

const ask = (id: string) => ({ id, question: "Which plan?", why_needed: "x", options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }] });
const waiting = async (): Promise<{ step: string; panel: string }[]> => (await app.state()).panels.waiting;
const rawStop = (body: unknown) => fetch(`${app.base}/desk/panels/op`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("every person change carries a request id", () => {
  test("a stop with no request id is refused and leaves the wait open", async () => {
    await app.application.applyAgentOp({ tool: "ask_human", panel: "rq-a", ask: ask("qa"), step: "step_rq" });
    await rawStop({ op: "human.answer", panel: "rq-a", ask: "qa", ...(await revisionOf(app, "rq-a", "qa")), outcome: "answered", value: "a", request_id: "answer-rq-a" });
    const refused = await rawStop({ op: "human.stop_waiting", step: "step_rq" });
    expect(refused.status).toBe(400);
    expect((await waiting()).some((w) => w.step === "step_rq" && w.panel === "rq-a")).toBe(true);
  });

  test("stop one wait, create another on the same step, retry the original stop with its id: the new wait stays open", async () => {
    const stopFirst = await rawStop({ op: "human.stop_waiting", step: "step_rq", request_id: "stop-rq-1" });
    expect(stopFirst.status).toBe(200);
    expect((await waiting()).some((w) => w.step === "step_rq")).toBe(false);

    await app.application.applyAgentOp({ tool: "ask_human", panel: "rq-b", ask: ask("qb"), step: "step_rq" });
    await rawStop({ op: "human.answer", panel: "rq-b", ask: "qb", ...(await revisionOf(app, "rq-b", "qb")), outcome: "answered", value: "b", request_id: "answer-rq-b" });
    expect((await waiting()).some((w) => w.step === "step_rq" && w.panel === "rq-b")).toBe(true);

    const retry = await rawStop({ op: "human.stop_waiting", step: "step_rq", request_id: "stop-rq-1" });
    expect(retry.status).toBe(200);
    expect((await waiting()).some((w) => w.step === "step_rq" && w.panel === "rq-b")).toBe(true);
  });
});

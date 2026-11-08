/**
 * Finding R2-6: a question keeps the step it is about (its target), and that target is part of its identity and its version. Putting
 * the same wording under another step is a changed question, so it needs a new id, and an answer carrying the old revisions cannot
 * change the step it settles.
 */
import { describe, expect, test } from "bun:test";
import { randomBytes, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { listAnswers } from "../src/capabilities/panel-answers.ts";
import { SAME_ID_OTHER_WORDS } from "../src/capabilities/question-rules.ts";
import { questionVersion } from "../src/ui/surface2/panel-blocks.ts";
import { NO_PANELS, QUESTION_CHANGED, reduceAgent, reduceHuman, type AskBlock, type Panels } from "../src/ui/desk/panels-model.ts";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { withRequestId } from "./support/request-body.ts";

const options = [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }];
const ask = { id: "q", question: "Which plan?", why_needed: "x", options };
const qOf = (s: Panels, panel = "p"): AskBlock => s.open.find((p) => p.id === panel)!.blocks.find((b): b is AskBlock => b.kind === "question" && b.id === "q")!;
const putAt = (state: Panels, panel: string, step: string | undefined, surface = false) =>
  surface
    ? reduceAgent(state, { tool: "show_surface", surface: { id: panel, ...(step === undefined ? {} : { step }), blocks: [{ type: "ask", ...ask }] } }, "Alice", "ag_alice")
    : reduceAgent(state, { tool: "ask_human", panel, ask, ...(step === undefined ? {} : { step }) }, "Alice", "ag_alice");

describe("a question is about one step, and its version follows that step", () => {
  test("a question with no step keeps the version it always had", () => {
    const s = putAt(NO_PANELS, "p", undefined).state;
    expect(qOf(s).version).toBe(questionVersion({ question: "Which plan?", input: "select", options }));
  });

  test("the question records the step it is about", () => {
    const s = putAt(NO_PANELS, "p", "s_old").state;
    expect(qOf(s).target).toBe("s_old");
  });

  test("retargeting an unchanged question under the same id is refused, by ask_human and by show_surface, and nothing changes", () => {
    const first = putAt(NO_PANELS, "p", "s_old").state;
    const byAsk = putAt(first, "p", "s_new");
    expect(byAsk.result).toEqual({ ok: false, code: "SCHEMA", message: SAME_ID_OTHER_WORDS });
    expect(byAsk.state).toBe(first);
    const bySurface = putAt(first, "p", "s_new", true);
    expect(bySurface.result).toEqual({ ok: false, code: "SCHEMA", message: SAME_ID_OTHER_WORDS });
    expect(bySurface.state).toBe(first);
  });

  test("an answer with the old revisions cannot change the target: it settles the step the question was put up for", () => {
    const first = putAt(NO_PANELS, "p", "s_old").state;
    const seen = qOf(first);
    expect(putAt(first, "p", "s_new").result.ok).toBe(false);
    const answered = reduceHuman(first, { op: "human.answer", panel: "p", ask: "q", outcome: "answered", value: "a", version: seen.version!, owner_rev: 0 });
    expect(answered.result.ok).toBe(true);
    expect(qOf(answered.state)).toMatchObject({ target: "s_old", answered: { value: "a" } });
  });

  test("the same wording under another step is a new question with a new version: the old revisions do not answer it", () => {
    const first = putAt(NO_PANELS, "p", "s_old").state;
    const oldVersion = qOf(first).version!;
    const second = putAt(first, "p2", "s_new").state;
    expect(qOf(second, "p2").version).not.toBe(oldVersion);
    const r = reduceHuman(second, { op: "human.answer", panel: "p2", ask: "q", outcome: "answered", value: "a", version: oldVersion, owner_rev: 0 });
    expect(r.result).toEqual({ ok: false, code: "SCHEMA", message: QUESTION_CHANGED });
    expect(r.state).toBe(second);
  });

  test("the same wording under the same step is put again without change: the version is kept", () => {
    const first = putAt(NO_PANELS, "p", "s_old").state;
    const again = putAt(first, "p", "s_old");
    expect(again.result.ok).toBe(true);
    expect(qOf(again.state).version).toBe(qOf(first).version);
  });

  test("a question stored before targets existed is put again without a refusal when its step is unchanged", () => {
    const first = putAt(NO_PANELS, "p", "s_old").state;
    const legacy = { ...first, open: first.open.map((p) => ({ ...p, blocks: p.blocks.map((b) => (b.kind === "question" ? { ...b, target: undefined, version: questionVersion({ question: "Which plan?", input: "select", options }) } : b)) })) } as Panels;
    expect(putAt(legacy, "p", "s_old").result.ok).toBe(true);
    expect(putAt(legacy, "p", "s_new").result.ok).toBe(false);
  });
});

const key = randomBytes(32).toString("hex");
const sha = (k: string) => createHash("sha256").update(k).digest("hex");
describe("the step recorded for an answer is the question's target", () => {
  test("an answer to a question put under step s_old records s_old, through the desk", async () => {
    const app: DeskApp = await startDeskApp();
    try {
      writeFileSync(join(dirname(app.application.loaded.agentKeyPath), "agents.json"), JSON.stringify({ schema: "horizon.agents/1", agents: [{ key_id: "ag_alice", name: "Alice", sha256: sha(key), added: "2026-11-07T09:00:00.000Z" }] }));
      const put = await fetch(`${app.base}/agent/panels`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-horizon-agent-name": "Alice" }, body: JSON.stringify(withRequestId({ tool: "ask_human", panel: "tg", step: "s_old", ask })) });
      expect(put.status).toBe(200);
      const board = (await app.state()).panels.open.find((p: { id: string }) => p.id === "tg");
      const shown = board.blocks.find((b: { id: string }) => b.id === "q");
      const answered = await app.post("/desk/panels/op", { op: "human.answer", panel: "tg", ask: "q", version: shown.version, owner_rev: shown.owner_rev ?? 0, outcome: "answered", value: "a" });
      expect(answered.status).toBe(200);
      const rows = await listAnswers(app.application.runtime.runtime.store, app.application.caller.tenant);
      expect(rows.find((r) => r.panel_id === "tg" && r.ask === "q")?.step).toBe("s_old");
    } finally {
      await app.stop();
    }
  });
});

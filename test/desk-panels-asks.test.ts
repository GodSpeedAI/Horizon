/** Questions in agent panels: open questions are never evicted, withdraw, answers per input kind, and the "where it went" rule. */
import { reducerRevision } from "./support/answer-revision.ts";
import { describe, expect, test } from "bun:test";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import { acceptanceBlocked, answerFor, listAnswers, recordAnswer, routeAnswer } from "../src/capabilities/panel-answers.ts";

// The desk runs panel writes one at a time (panelCommand in app.ts); a test passes the identity queue, since it runs one write at a time.
function Q<T>(command: () => Promise<T>): Promise<T> {
  return command();
}
import { ALL_WAITING, MAX_OPEN_PANELS, NO_PANELS, reduceAgent, reduceHuman, type Panels } from "../src/ui/desk/panels-model.ts";

const two = [{ option_id: "yes", label: "Yes" }, { option_id: "no", label: "No" }];
const askOf = (id: string, over: Record<string, unknown> = {}) => ({ id, question: `Question ${id}?`, why_needed: "needed", options: two, ...over });
const callout = (id: string) => ({ tool: "show_surface" as const, surface: { id, blocks: [{ type: "callout", id: "c", tone: "ok", text: "fine" }] } });
const ok = (r: ReturnType<typeof reduceAgent>): Panels => {
  expect(r.result.ok).toBe(true);
  return r.state;
};

describe("a panel with an open question stays", () => {
  test("the cap of 8 skips panels waiting for an answer", () => {
    let state = NO_PANELS;
    state = ok(reduceAgent(state, { tool: "ask_human", panel: "waits", ask: askOf("q1") }));
    for (let i = 1; i <= 12; i += 1) state = ok(reduceAgent(state, callout(`p${i}`)));
    expect(state.open).toHaveLength(MAX_OPEN_PANELS);
    expect(state.open[0]!.id).toBe("waits");
    expect(state.open.map((p) => p.id)).not.toContain("p1");
    // Once answered (or put off) it can make room again.
    state = reduceHuman(state, { op: "human.answer", panel: "waits", ask: "q1", ...reducerRevision(state, "waits", "q1"), outcome: "deferred" }).state;
    state = ok(reduceAgent(state, callout("p13")));
    expect(state.open.map((p) => p.id)).not.toContain("waits");
  });

  test("when every panel is waiting, a new one is refused in plain words and nothing changes", () => {
    let state = NO_PANELS;
    for (let i = 1; i <= 8; i += 1) state = ok(reduceAgent(state, { tool: "ask_human", panel: `w${i}`, ask: askOf("q1") }));
    const refused = reduceAgent(state, callout("late"));
    expect(refused.result).toEqual({ ok: false, code: "CAP", message: "Eight panels are waiting for answers. Answer or skip one first." });
    expect(ALL_WAITING).toBe("Eight panels are waiting for answers. Answer or skip one first.");
    expect(refused.state).toBe(state);
    expect(reduceAgent(state, { tool: "ask_human", panel: "late", ask: askOf("q1") }).result.ok).toBe(false);
    // Skipping one makes room.
    state = reduceHuman(state, { op: "human.answer", panel: "w3", ask: "q1", ...reducerRevision(state, "w3", "q1"), outcome: "cancelled" }).state;
    expect(reduceAgent(state, callout("late")).result.ok).toBe(true);
  });
});

describe("withdrawing a question", () => {
  const asked = ok(reduceAgent(NO_PANELS, { tool: "ask_human", panel: "p", ask: askOf("q1") }));
  const withdraw = (state: Panels, reason: string) => reduceAgent(state, { tool: "ask.withdraw", panel_id: "p", ask_id: "q1", reason });

  test("it shows the reason, no longer holds the panel, and cannot be answered", () => {
    const state = ok(withdraw(asked, "The release was cancelled."));
    expect(state.open[0]!.blocks[0]).toMatchObject({ kind: "question", withdrawn: { reason: "The release was cancelled." } });
    expect(reduceHuman(state, { op: "human.answer", panel: "p", ask: "q1", ...reducerRevision(state, "p", "q1"), outcome: "answered", value: "yes" }).result.ok).toBe(false);
    // It no longer protects the panel from the cap.
    let full = state;
    for (let i = 1; i <= 8; i += 1) full = ok(reduceAgent(full, callout(`f${i}`)));
    expect(full.open.map((p) => p.id)).not.toContain("p");
    // A redraw by the agent keeps it withdrawn.
    const redrawn = ok(reduceAgent(state, { tool: "show_surface", surface: { id: "p", blocks: [{ type: "ask", ...askOf("q1") }] } }));
    expect(redrawn.open[0]!.blocks[0]).toMatchObject({ withdrawn: { reason: "The release was cancelled." } });
  });
  test("a reason is needed, at most 200 characters; an answered or missing question cannot be withdrawn", () => {
    expect(withdraw(asked, "  ").result.ok).toBe(false);
    expect(withdraw(asked, "x".repeat(201)).result.ok).toBe(false);
    expect(withdraw(asked, "x".repeat(200)).result.ok).toBe(true);
    const answered = reduceHuman(asked, { op: "human.answer", panel: "p", ask: "q1", ...reducerRevision(asked, "p", "q1"), outcome: "answered", value: "no" }).state;
    expect(withdraw(answered, "changed my mind").result.ok).toBe(false);
    expect(reduceAgent(asked, { tool: "ask.withdraw", panel_id: "p", ask_id: "nope", reason: "x" }).result).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});

describe("answers fit the kind of question", () => {
  const answer = (ask: Record<string, unknown>, value: unknown) => {
    const state = ok(reduceAgent(NO_PANELS, { tool: "ask_human", panel: "p", ask }));
    return reduceHuman(state, { op: "human.answer", panel: "p", ask: "q1", ...reducerRevision(state, "p", "q1"), outcome: "answered", value });
  };
  test("confirm is yes or no", () => {
    const confirm = askOf("q1", { input: "confirm", options: undefined });
    expect(answerFor({ input: "confirm", options: [] }, "yes")).toEqual({ ok: true, value: "yes" });
    expect(answerFor({ input: "confirm", options: [] }, false)).toEqual({ ok: true, value: "no" });
    expect(answerFor({ input: "confirm", options: [] }, "maybe").ok).toBe(false);
    expect(answer(confirm, "no").state.open[0]!.blocks[0]).toMatchObject({ answered: { value: "no" } });
    expect(answer(confirm, "maybe").result.ok).toBe(false);
  });
  test("select is one offered option", () => {
    expect(answer(askOf("q1"), "yes").result.ok).toBe(true);
    expect(answer(askOf("q1"), "perhaps").result.ok).toBe(false);
    expect(answer(askOf("q1"), ["yes"]).result.ok).toBe(false);
  });
  test("multiselect is a list of offered ids, at least one", () => {
    const multi = askOf("q1", { input: "multiselect" });
    expect(answer(multi, ["yes", "no"]).state.open[0]!.blocks[0]).toMatchObject({ answered: { value: ["yes", "no"] } });
    expect(answer(multi, []).result.ok).toBe(false);
    expect(answer(multi, ["yes", "other"]).result.ok).toBe(false);
    expect(answer(multi, "yes").result.ok).toBe(false);
  });
  test("text is one trimmed line of 1 to 500 characters", () => {
    const t = askOf("q1", { input: "text", options: undefined });
    expect(answer(t, "  Use the staging key  ").state.open[0]!.blocks[0]).toMatchObject({ answered: { value: "Use the staging key" } });
    expect(answer(t, "   ").result.ok).toBe(false);
    expect(answer(t, "x".repeat(501)).result.ok).toBe(false);
    expect(answer(t, "x".repeat(500)).result.ok).toBe(true);
    expect(answer(t, "two\nlines").result.ok).toBe(false);
  });
  test("Not yet and Skip need no value, for any kind", () => {
    for (const input of ["confirm", "text", "multiselect"]) {
      const state = ok(reduceAgent(NO_PANELS, { tool: "ask_human", panel: "p", ask: askOf("q1", { input, options: input === "multiselect" ? two : undefined }) }));
      expect(reduceHuman(state, { op: "human.answer", panel: "p", ask: "q1", ...reducerRevision(state, "p", "q1"), outcome: "deferred" }).result.ok).toBe(true);
      expect(reduceHuman(state, { op: "human.answer", panel: "p", ask: "q1", ...reducerRevision(state, "p", "q1"), outcome: "cancelled" }).result.ok).toBe(true);
    }
  });
});

describe("the answer stays open until the agent says where it went", () => {
  const now = new Date("2026-11-07T10:00:00Z");
  test("too short is refused; a route closes the answer and releases the step", async () => {
    const store = createMemoryStore();
    await recordAnswer(store, { tenant: "t", panel_id: "p", ask: "q1", outcome: "answered", value: "yes", step: "s1", asked_by_key: "ag_alice", now });
    expect(acceptanceBlocked(await listAnswers(store, "t"), "s1")).toBe(true);
    const short = await routeAnswer(store, "t", "p", "q1", "done", "ag_alice", Q);
    expect(short.ok).toBe(false);
    expect(await routeAnswer(store, "t", "p", "q1", "      ", "ag_alice", Q)).toMatchObject({ ok: false });
    expect(acceptanceBlocked(await listAnswers(store, "t"), "s1")).toBe(true);
    // The wrong question closes nothing.
    expect(await routeAnswer(store, "t", "p", "other", "no action: not for this", "ag_alice", Q)).toMatchObject({ ok: false });
    expect(acceptanceBlocked(await listAnswers(store, "t"), "s1")).toBe(true);
    expect(await routeAnswer(store, "t", "p", "q1", "step handoff_0a49 in Seed: triage inbox", "ag_alice", Q)).toEqual({ ok: true, closed: 1 });
    expect((await listAnswers(store, "t"))[0]).toMatchObject({ replied: true, routed_as: "step handoff_0a49 in Seed: triage inbox" });
    expect(acceptanceBlocked(await listAnswers(store, "t"), "s1")).toBe(false);
    // Closed once: a second route has nothing to close.
    expect(await routeAnswer(store, "t", "p", "q1", "no action: again", "ag_alice", Q)).toMatchObject({ ok: false });
  });
  test("six characters is enough", async () => {
    const store = createMemoryStore();
    await recordAnswer(store, { tenant: "t", panel_id: "p", ask: "q1", outcome: "cancelled", step: null, asked_by_key: "ag_alice", now });
    expect(await routeAnswer(store, "t", "p", "q1", "12345", "ag_alice", Q)).toMatchObject({ ok: false });
    expect(await routeAnswer(store, "t", "p", "q1", "123456", "ag_alice", Q)).toMatchObject({ ok: true });
  });
  test("in the panel, the answered question shows where it went", () => {
    let state = ok(reduceAgent(NO_PANELS, { tool: "ask_human", panel: "p", ask: askOf("q1") }));
    state = reduceHuman(state, { op: "human.answer", panel: "p", ask: "q1", ...reducerRevision(state, "p", "q1"), outcome: "answered", value: "yes" }).state;
    expect(reduceAgent(state, { tool: "answer.route", panel_id: "p", ask_id: "q1", routed_as: "no" }).result.ok).toBe(false);
    state = ok(reduceAgent(state, { tool: "answer.route", panel_id: "p", ask_id: "q1", routed_as: "no action: already shipped" }));
    expect(state.open[0]!.blocks[0]).toMatchObject({ answered: { value: "yes", routed_as: "no action: already shipped" } });
    // Other agent calls change no answer.
    expect(ok(reduceAgent(state, { tool: "annotate", panel: "p", text: "noted" })).open[0]!.blocks[0]).toMatchObject({ answered: { routed_as: "no action: already shipped" } });
  });
});

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { NOT_RECORDED_WORDS } from "../src/app.ts";
import { listAnswers } from "../src/capabilities/panel-answers.ts";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";

let app: DeskApp;
beforeAll(async () => {
  app = await startDeskApp();
});
afterAll(async () => app.stop());

/** A store whose conversation writes fail (everything else is untouched), put in for the length of one call. */
async function withFailingConversation<T>(run: () => Promise<T>): Promise<T> {
  const store = app.application.runtime.runtime.store as unknown as { commit: (input: { records?: { collection: string }[] }) => Promise<unknown> };
  const real = store.commit.bind(store);
  const quiet = console.error;
  console.error = () => undefined;
  store.commit = async (input) => {
    if (input.records?.some((r) => r.collection === "horizon-conversation")) throw new Error("disk full");
    return real(input);
  };
  try {
    return await run();
  } finally {
    store.commit = real;
    console.error = quiet;
  }
}

describe("a move that could not be recorded says so", () => {
  test("a saved note whose row cannot be written still succeeds, with recorded: false and plain words", async () => {
    const response = await withFailingConversation(() => app.post("/desk/note", { body: "Call the supplier" }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.recorded).toBe(false);
    expect(body.recorded_words).toBe("This was done, but it could not be added to the conversation. Check the desk log.");
    expect(NOT_RECORDED_WORDS).toBe(body.recorded_words);
  });

  test("an answer whose conversation row cannot be written is not saved at all, and says so in plain words", async () => {
    await app.application.applyAgentOp({ tool: "ask_human", panel: "rec", ask: { id: "q", question: "Which?", why_needed: "x", options: [{ option_id: "a", label: "A" }, { option_id: "b", label: "B" }] } });
    const response = await withFailingConversation(() => app.post("/desk/panels/op", { op: "human.answer", panel: "rec", ask: "q", outcome: "answered", value: "a" }));
    const body = (await response.json()) as any;
    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.message).toBe("Nothing was sent. Try again.");
    expect(body.recorded).toBeUndefined();
    // Design v3, step 4: the answer and its row are one commit, so nothing is stored and the question still waits for the person.
    const answers = await listAnswers(app.application.runtime.runtime.store, app.application.caller.tenant);
    expect(answers.filter((a) => a.panel_id === "rec" && a.ask === "q")).toEqual([]);
    const state = await app.state();
    const block = state.panels.open.find((p: { id: string }) => p.id === "rec")?.blocks.find((b: { id: string }) => b.id === "q");
    expect(block.answered ?? null).toBeNull();
  });

  test("the same answer goes through once the row can be written, and it is stored with its row", async () => {
    const response = await app.post("/desk/panels/op", { op: "human.answer", panel: "rec", ask: "q", outcome: "answered", value: "a" });
    const body = (await response.json()) as any;
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.recorded).toBeUndefined();
    const rows = (await (await fetch(`${app.base}/desk/conversation`)).json()).rows as { refs?: { ask_id?: string } }[];
    expect(rows.filter((r) => r.refs?.ask_id === "q").length).toBe(1);
  });

  test("when the row is kept, the answer carries no such note", async () => {
    const body = (await (await app.post("/desk/note", { body: "Another note" })).json()) as any;
    expect(body.ok).toBe(true);
    expect(body.recorded).toBeUndefined();
    expect(body.recorded_words).toBeUndefined();
  });
});

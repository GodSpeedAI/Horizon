import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { NOT_RECORDED_WORDS } from "../src/app.ts";
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

  test("an answer to an agent's question says so too", async () => {
    await app.application.applyAgentOp({ tool: "ask_human", panel: "rec", ask: { id: "q", question: "Which?", why_needed: "x", options: [{ option_id: "a", label: "A" }, { option_id: "b", label: "B" }] } });
    const response = await withFailingConversation(() => app.post("/desk/panels/op", { op: "human.answer", panel: "rec", ask: "q", outcome: "answered", value: "a" }));
    const body = (await response.json()) as any;
    expect(response.status).toBe(200);
    expect(body.recorded).toBe(false);
    expect(body.recorded_words).toBe(NOT_RECORDED_WORDS);
  });

  test("when the row is kept, the answer carries no such note", async () => {
    const body = (await (await app.post("/desk/note", { body: "Another note" })).json()) as any;
    expect(body.ok).toBe(true);
    expect(body.recorded).toBeUndefined();
    expect(body.recorded_words).toBeUndefined();
  });
});

import { afterEach, describe, expect, test } from "bun:test";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";

/**
 * An answer the person gave is an agreement to its exact words, options, consequences, input kind and what it resolves. That
 * agreement is kept in the store, so it survives the panel being removed and the desk restarting: an agent cannot recreate the
 * question with different words under the same panel and question id.
 */
const ANSWERED_CANNOT_CHANGE = "That question id was already used for different wording. Use a new question id.";
const apps: DeskApp[] = [];
afterEach(async () => {
  while (apps.length > 0) await apps.pop()!.stop();
});

const question = (text: string, extra: Record<string, unknown> = {}) => ({
  id: "q",
  question: text,
  why_needed: "to route the work",
  options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }],
  resolves: "step_one",
  ...extra,
});
const agent = (app: DeskApp, body: unknown) =>
  fetch(`${app.base}/agent/panels`, { method: "POST", headers: { authorization: `Bearer ${app.application.loaded.agentKey}`, "content-type": "application/json", "x-horizon-agent-name": "Helper" }, body: JSON.stringify(body) });
const putPanel = (app: DeskApp, text: string, extra: Record<string, unknown> = {}) => agent(app, { tool: "ask_human", panel: "p", ask: question(text, extra) });
const answer = (app: DeskApp) =>
  fetch(`${app.base}/desk/panels/op`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "human.answer", panel: "p", ask: "q", outcome: "answered", value: "a" }) });
const removePanel = (app: DeskApp) => agent(app, { tool: "arrange", action: { op: "surface.remove", id: "p" } });

describe("an answered question stays answered after its panel is removed", () => {
  test("the panel removed, an agent recreates the question with different wording: refused", async () => {
    const app = await startDeskApp();
    apps.push(app);
    expect((await putPanel(app, "Which plan?")).status).toBe(200);
    expect((await answer(app)).status).toBe(200);
    expect((await removePanel(app)).status).toBe(200);
    const changed = await putPanel(app, "Which plan now, and at what cost?");
    expect(changed.status).toBe(400);
    expect(((await changed.json()) as any).message).toBe(ANSWERED_CANNOT_CHANGE);
  });

  test("the panel removed, the same question again is let through", async () => {
    const app = await startDeskApp();
    apps.push(app);
    await putPanel(app, "Which plan?");
    await answer(app);
    await removePanel(app);
    expect((await putPanel(app, "Which plan?")).status).toBe(200);
  });

  test("the desk restarted on the same store: a changed question is still refused", async () => {
    const first = await startDeskApp();
    expect((await putPanel(first, "Which plan?")).status).toBe(200);
    expect((await answer(first)).status).toBe(200);
    const root = first.root;
    await first.stop();
    const second = await startDeskApp({ root });
    apps.push(second);
    const changed = await putPanel(second, "A different question");
    expect(changed.status).toBe(400);
    expect(((await changed.json()) as any).message).toBe(ANSWERED_CANNOT_CHANGE);
  });

  test("changing what the answer resolves is refused after the panel is removed too", async () => {
    const app = await startDeskApp();
    apps.push(app);
    await putPanel(app, "Which plan?");
    await answer(app);
    await removePanel(app);
    const moved = await putPanel(app, "Which plan?", { resolves: "step_two" });
    expect(moved.status).toBe(400);
  });
});

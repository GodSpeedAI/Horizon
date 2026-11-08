/** @jsxImportSource react */
import { afterEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CONVERSATION_COLLECTION } from "../src/capabilities/conversation.ts";
import { NOT_RECONCILED_WORDS, RECONCILIATION_COLLECTION } from "../src/capabilities/reconciliation.ts";
import { StatusBar } from "../src/ui/desk/StatusBar.tsx";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { deskState } from "./support/desk-fixture.ts";

const apps: DeskApp[] = [];
afterEach(async () => {
  while (apps.length > 0) await apps.pop()!.stop();
});

const agent = (app: DeskApp, body: unknown) =>
  fetch(`${app.base}/agent/panels`, { method: "POST", headers: { authorization: `Bearer ${app.application.loaded.agentKey}`, "content-type": "application/json", "x-horizon-agent-name": "Helper" }, body: JSON.stringify(body) });

describe("a recording failure reaches the person", () => {
  test("the step is recorded, the gap is kept in the store, and the status line says so", async () => {
    const app = await startDeskApp();
    apps.push(app);
    const question = { id: "q", question: "Which plan?", why_needed: "x", options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }] };
    expect((await agent(app, { tool: "ask_human", panel: "p", ask: question })).status).toBe(200);
    await fetch(`${app.base}/desk/panels/op`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "human.answer", panel: "p", ask: "q", outcome: "answered", value: "a" }) });

    // The conversation store cannot write a row from here on. Other records still write.
    const store = app.application.runtime.runtime.store as unknown as { commit: (input: { records?: { collection: string }[] }) => Promise<unknown> };
    const commit = store.commit.bind(store);
    store.commit = (input) => {
      if (input.records?.some((r) => r.collection === CONVERSATION_COLLECTION)) return Promise.reject(new Error("injected store failure"));
      return commit(input as never);
    };
    const log = console.error;
    console.error = () => undefined;
    let routed: Response;
    try {
      routed = await agent(app, { tool: "answer.route", panel_id: "p", ask_id: "q", routed_as: "step handoff_0a49 in Seed: triage" });
    } finally {
      console.error = log;
      store.commit = commit as typeof store.commit;
    }
    // The route was recorded: the answer is closed, and the person's answer carries the agent's words.
    expect(routed.status).toBe(200);
    const answers = (await (await fetch(`${app.base}/desk/state.json`)).json()) as { status: { reconciliation?: string[] } };
    expect(answers.status.reconciliation).toEqual([NOT_RECONCILED_WORDS]);
    const kept = await app.application.runtime.runtime.store.listRecords(RECONCILIATION_COLLECTION, { tenant: app.application.caller.tenant });
    expect(kept.length).toBe(1);
  });

  test("the status line shows the words", () => {
    const html = renderToStaticMarkup(<StatusBar status={{ ...deskState().status, reconciliation: [NOT_RECONCILED_WORDS] }} onPresenting={() => undefined} />);
    expect(html).toContain("A step was recorded, but the conversation did not record it. Check the desk log.");
  });

  test("with every row recorded there is no warning", async () => {
    const app = await startDeskApp();
    apps.push(app);
    const state = (await (await fetch(`${app.base}/desk/state.json`)).json()) as { status: { reconciliation?: string[] } };
    expect(state.status.reconciliation ?? []).toEqual([]);
  });
});

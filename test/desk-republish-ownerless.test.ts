/**
 * Finding R5-3. A question that exists with no recorded owner and no recorded author is not claimed by an agent that re-publishes it.
 * The re-publish is refused with the decision words, and an answer the person gives to it is not readable by that agent.
 */
import { afterAll, describe, expect, test } from "bun:test";
import type { Json } from "@godspeedai/cognate-events";
import { listAnswers } from "../src/capabilities/panel-answers.ts";
import { PANELS_COLLECTION, panelIdOf } from "../src/capabilities/panel-records.ts";
import { QUESTION_NEEDS_DECISION } from "../src/ui/desk/panels-model.ts";
import { revisionOf } from "./support/answer-revision.ts";
import { deskScopeFor, startDeskApp, type DeskApp } from "./support/desk-app.ts";

const apps: DeskApp[] = [];
const open = async (root?: string) => {
  const app = await startDeskApp(root === undefined ? {} : { root });
  apps.push(app);
  return app;
};
afterAll(async () => {
  for (const app of apps) await app.stop().catch(() => undefined);
});

const question = { id: "q1", question: "Which plan?", why_needed: "x", options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }] };
const agent = (app: DeskApp, body: unknown) =>
  fetch(`${app.base}/agent/panels`, { method: "POST", headers: { authorization: `Bearer ${app.application.loaded.agentKey}`, "content-type": "application/json" }, body: JSON.stringify(body) });

describe("a question with no recorded owner is not claimed by a re-publish (R5-3)", () => {
  test("the re-publish is refused, and the person's answer is not readable by the agent", async () => {
    const first = await open();
    const store = first.application.runtime.runtime.store;
    const scope = deskScopeFor(first);
    expect((await agent(first, { tool: "ask_human", panel: "legacy_panel", ask: question, request_id: "put-r53-0" })).status).toBe(200);
    // The question as a record from before owners holds it: no author and no owner.
    const row = await store.getRecord(PANELS_COLLECTION, panelIdOf(scope, "legacy_panel"));
    if (row === null || row === undefined) throw new Error("the seeded panel is missing");
    const value = row.value as unknown as { readonly blocks: readonly Record<string, unknown>[] };
    const blocks = value.blocks.map((b) => (b.kind === "question" ? { ...b, asked_by: null, asked_by_key: null, owner_key: null, owner_name: null } : b));
    await store.commit({ appends: [], records: [{ collection: PANELS_COLLECTION, id: row.id, expectedVersion: row.version, value: { ...(row.value as unknown as Record<string, Json>), blocks: blocks as unknown as Json } }] });
    await first.stop();
    apps.splice(apps.indexOf(first), 1);

    // After the restart the question is on the board with no owner, and the same agent puts the same wording up again.
    const app = await open(first.root);
    const again = await agent(app, { tool: "ask_human", panel: "legacy_panel", ask: question, request_id: "put-r53-1" });
    expect(again.status).toBe(409);
    expect((await again.json()).message).toBe(QUESTION_NEEDS_DECISION);

    // The person answers it. The answer has no owner, so the agent does not read it.
    const answered = await app.post("/desk/panels/op", { op: "human.answer", panel: "legacy_panel", ask: "q1", ...(await revisionOf(app, "legacy_panel", "q1")), outcome: "answered", value: "a" });
    expect(answered.status).toBe(200);
    const [stored] = await listAnswers(app.application.runtime.runtime.store, deskScopeFor(app), "legacy_panel");
    expect(stored?.owner_key ?? null).toBeNull();
    const read = await (await fetch(`${app.base}/agent/panels/answers`, { headers: { authorization: `Bearer ${app.application.loaded.agentKey}` } })).json();
    expect((read as { responses: { ask: string }[] }).responses.filter((a) => a.ask === "q1")).toHaveLength(0);
  });
});

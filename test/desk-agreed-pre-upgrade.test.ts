import { afterEach, describe, expect, test } from "bun:test";
import type { Json } from "@godspeedai/cognate-events";
import { AGREED_COLLECTION, agreedFingerprint, recordAnswer } from "../src/capabilities/panel-answers.ts";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";

/**
 * An answer written before the upgrade has no fingerprint on its record. Its protection comes from the older agreed-answers store,
 * which is read only (no code writes to it). The agreement's hash there uses the old formula (it includes the panel id), so it
 * must still refuse a changed question. This pins that path with a fixture that looks like a pre-upgrade store.
 */
const ANSWERED_CANNOT_CHANGE = "That question id was already used for different wording. Use a new question id.";
const apps: DeskApp[] = [];
afterEach(async () => {
  while (apps.length > 0) await apps.pop()!.stop();
});

const question = (text: string) => ({
  id: "q",
  question: text,
  why_needed: "to route the work",
  options: [{ option_id: "a", label: "Plan A" }, { option_id: "b", label: "Plan B" }],
  resolves: "step_one",
});
const agent = (app: DeskApp, body: unknown) =>
  fetch(`${app.base}/agent/panels`, { method: "POST", headers: { authorization: `Bearer ${app.application.loaded.agentKey}`, "content-type": "application/json", "x-horizon-agent-name": "Helper" }, body: JSON.stringify(body) });

describe("an answer written before the upgrade keeps its protection through the agreed-answers store", () => {
  test("no fingerprint on the answer, an old agreement on file: a changed question is refused, the same one is let through", async () => {
    const app = await startDeskApp();
    apps.push(app);
    const store = app.application.runtime.runtime.store;
    const { tenant } = app.application.caller;
    const now = new Date("2026-11-06T10:00:00.000Z");
    // The pre-upgrade answer: no fingerprint, no owner.
    await recordAnswer(store, { tenant, panel_id: "p", ask: "q", outcome: "answered", value: "a", step: "step_one", now });
    // The pre-upgrade agreement, with the old hash (panel id included), as the old desk wrote it.
    const old = agreedFingerprint("p", { id: "q", question: "Which plan?", options: [{ option_id: "a", label: "Plan A", consequence: null }, { option_id: "b", label: "Plan B", consequence: null }], input: "select", resolves: "step_one" });
    await store.commit({ appends: [], records: [{ collection: AGREED_COLLECTION, id: "agreed:p:q", expectedVersion: 0, value: { tenant, panel_id: "p", ask: "q", fingerprint: old, at: now.toISOString() } as unknown as { readonly [key: string]: Json } }] });

    const changed = await agent(app, { tool: "ask_human", panel: "p", ask: question("Which plan now, and at what cost?") });
    expect(changed.status).toBe(400);
    expect(((await changed.json()) as { message: string }).message).toBe(ANSWERED_CANNOT_CHANGE);

    const same = await agent(app, { tool: "ask_human", panel: "p", ask: question("Which plan?") });
    expect(same.status).toBe(200);
  });
});

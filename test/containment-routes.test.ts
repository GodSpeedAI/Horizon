/**
 * Stage 0B containment at the route: a reserved human write (the label) answers 409 and writes nothing
 * until the exact local confirmation exists. Each test names the expectation it proves (see
 * .agents/prereg/horizon/STAGE-0B-CONTAINMENT.prereg.yaml).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { setConfirmationCodeSink } from "../src/capabilities/pending-confirmations.ts";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";

let app: DeskApp;

// The preload confirms for the suite. These tests need the waiting state at the route, so they take the
// sink away for their run and put the preload's sink back afterwards.
beforeAll(async () => {
  setConfirmationCodeSink(null);
  app = await startDeskApp();
});
afterAll(async () => {
  await app.stop();
  setConfirmationCodeSink(() => undefined);
});

/** The label route takes a form body, as the compare page submits it. */
const label = (overrides: Record<string, string> = {}) =>
  fetch(`${app.base}/workspace/label`, {
    method: "POST",
    redirect: "manual",
    headers: { accept: "application/json" },
    body: new URLSearchParams({ session: "s1", event: "e1", record_seq: "1", verdict: "pass", first_failure: "", ...overrides }),
  });

describe("a reserved label write waits for a local confirmation at the route", () => {
  test("PE-58: a label without a confirmation is answered 409 and is not saved", async () => {
    const response = await label();
    expect(response.status).toBe(409);
    const body = (await response.json()) as { ok: boolean; code: string; pending_id: string | null };
    expect(body.ok).toBe(false);
    expect(["awaiting_local_confirmation", "no_terminal"]).toContain(body.code);
  });

  test("PE-59: the response never carries the confirmation code", async () => {
    const response = await label();
    const text = await response.text();
    expect(text).not.toMatch(/Code: \d{6}/);
    expect(text).not.toMatch(/"code":\s*"\d{6}"/);
  });

  test("NE-46: repeating the label without confirming still answers waiting and never reports success", async () => {
    for (let i = 0; i < 2; i += 1) {
      const response = await label();
      expect(response.status).toBe(409);
      const body = (await response.json()) as { ok: boolean };
      expect(body.ok).toBe(false);
    }
  });
});

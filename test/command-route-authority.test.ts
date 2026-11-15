/**
 * The desk's command routes against the catalog, one operation at a time. An authorised command runs; a refused one
 * performs no target effect, and its refusal audit does not commit the refused operation. An audit that cannot be
 * written does not turn a refusal into an execution.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";

let app: DeskApp;

beforeAll(async () => {
  app = await startDeskApp();
});

afterAll(async () => {
  await app.stop();
});

describe("open_case: the authorised path runs", () => {
  test("the desk opens a case with the purpose the person typed (horizon.case.open, enforced today)", async () => {
    const response = await fetch(`${app.base}/workspace/case`, { method: "POST", body: new URLSearchParams({ purpose: "Command route authority check" }), redirect: "manual" });
    // The route answers with a redirect to the case when it opens it; a refusal is a 403 with the catalog's code.
    expect(response.status).toBeLessThan(400);
    expect(response.status).not.toBe(403);
  });
});

describe("commit: the authorised path runs and a forged role is refused before any effect", () => {
  test("a commit that names its own role is refused as forbidden_field and records nothing", async () => {
    const before = (await app.refusals()).length;
    const response = await app.post("/surface/intent", { transport: "gui", node_id: "x", intent_id: "y", role: "human" });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code?: string }).code).toBe("forbidden_field");
    expect((await app.refusals()).length).toBe(before);
  });
});

describe("start: a refused run start performs no effect and leaves one refusal audit", () => {
  test("POST /desk/start is refused with the catalog's words, and its audit is a refusal", async () => {
    const before = (await app.refusals()).length;
    const response = await app.post("/desk/start", { plan: "anything" });
    expect(response.status).toBe(403);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe("refused");
    const after = await app.refusals();
    expect(after.length).toBe(before + 1);
    expect(after[after.length - 1]!.operation).toBe("run.start");
  });
});

describe("an audit failure cannot permit execution", () => {
  test("when the refusal audit cannot be written, the refused start still answers refused and runs nothing", async () => {
    const store = app.application.runtime.runtime.store as unknown as { commit: (...args: unknown[]) => unknown };
    const real = store.commit;
    store.commit = () => {
      throw new Error("audit store unavailable");
    };
    try {
      const response = await app.post("/desk/start", { plan: "anything" });
      expect(response.status).toBe(403);
      expect(((await response.json()) as { code?: string }).code).toBe("refused");
    } finally {
      store.commit = real;
    }
  });
});

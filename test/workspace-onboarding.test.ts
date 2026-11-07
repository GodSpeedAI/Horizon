/**
 * First-run cockpit over the real HTTP route: the origin guard, the redirect, cases, the skip choice,
 * the decision receipt and the moves list. State accumulates on one server, so the tests run in the
 * order the operator would reach them: guards and onboarding first, then the first governed commit.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApplication, type HorizonApplication } from "../src/app.ts";
import { readIntentAttempts, readIntentRecords } from "../src/capabilities/navigation-intent.ts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { START } from "../src/ui/desk/attention.ts";
import { Desk } from "../src/ui/desk/Desk.tsx";
import { quietIo } from "./support/desk-io.ts";
import { seedOperationalFixture } from "./support/operational-fixture.ts";
import { writeConfig, horizonDocument } from "./support/config.ts";

let application: HorizonApplication;
let server: ReturnType<HorizonApplication["startServer"]>;
let base: string;

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), "onboarding-"));
  const configPath = await writeConfig(
    join(root, "horizon.toml"),
    horizonDocument({ storePath: join(root, "onboarding.sqlite"), secretPath: join(root, "launch.secret") }),
  );
  application = await createApplication({ configPath });
  await seedOperationalFixture(application.runtime.runtime.store, undefined, application.caller.tenant);
  server = application.startServer(0);
  base = `http://${server.hostname}:${server.port}`;
});
afterAll(async () => {
  await server?.stop(true);
  await application?.close();
});

const FOCUS = "obj:strategy:alpha";

async function post(path: string, fields: Record<string, string>, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: "POST",
    redirect: "manual",
    body: new URLSearchParams(fields),
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
  });
}

/** The page the operator sees: the desk drawn from the state the address asks for (`?receipt=`, `?case_error=`). */
async function page(path = "/workspace"): Promise<string> {
  const query = new URL(path, base).searchParams.toString();
  const data = await (await fetch(`${base}/desk/state.json?${query}`)).json();
  return renderToStaticMarkup(createElement(Desk, { ui: { ...START, data }, dispatch: () => undefined, io: quietIo() }));
}

/** The live surface fields a real GUI form would post for the one bound action. */
async function liveAction(): Promise<Record<string, string>> {
  const data = await application.workspace({ focusRef: FOCUS });
  const action = data.view.actions.find((candidate) => candidate.action_id === "horizon-health");
  if (action === undefined) throw new Error("the fixture no longer offers horizon-health");
  return {
    action_id: action.action_id,
    frame_id: data.frame.frame_id,
    frame_revision: String(data.frame.revision),
    focus: FOCUS,
  };
}

async function storedCount(): Promise<number> {
  const store = application.runtime.runtime.store;
  return (await readIntentRecords(store)).length + (await readIntentAttempts(store)).length;
}

describe("first-run cockpit: request guard and redirect", () => {
  test("GET / redirects to the workspace", async () => {
    const response = await fetch(`${base}/`, { redirect: "manual" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/workspace");
  });

  test("a cross-site POST is refused with 403 and commits nothing", async () => {
    const fields = await liveAction();
    const before = await storedCount();
    const response = await post("/workspace/intent", fields, { origin: "http://evil.example", "sec-fetch-site": "cross-site" });
    expect(response.status).toBe(403);
    expect(await storedCount()).toBe(before);
  });

  test("a POST whose Host is not this cockpit is refused with 403 and commits nothing", async () => {
    const fields = await liveAction();
    const before = await storedCount();
    const response = await post("/workspace/intent", fields, { host: "evil.example:80" });
    expect(response.status).toBe(403);
    expect(await storedCount()).toBe(before);
  });

  test("a same-origin POST is still accepted by the guard", async () => {
    const response = await post("/workspace/onboarding/resume", {}, {
      origin: `http://127.0.0.1:${server.port}`,
      "sec-fetch-site": "same-origin",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/workspace#getting-started");
  });
});

describe("first-run cockpit: case and onboarding", () => {
  test("an empty case is refused inline with a fixed message, not a crash", async () => {
    const response = await post("/workspace/case", { purpose: "   " });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/workspace?case_error=empty#getting-started");
    const markup = await page("/workspace?case_error=empty");
    expect(markup).toContain("The case cannot be blank.");
    expect(markup).toContain('role="alert"');
  });

  test("an oversized case is refused, and the submitted text is not echoed", async () => {
    const response = await post("/workspace/case", { purpose: "x".repeat(201) });
    expect(response.headers.get("location")).toBe("/workspace?case_error=too_long#getting-started");
    expect(await page("/workspace?case_error=too_long")).toContain("Keep the case to 200 characters or fewer.");
  });

  test("a case opened in the cockpit frames the workspace and is stored", async () => {
    const response = await post("/workspace/case", { purpose: "  Ship the first governed move  " });
    expect(response.status).toBe(303);
    const markup = await page();
    expect(markup).toContain("Case: Ship the first governed move");
    const current = await application.workspace({ focusRef: FOCUS });
    expect(current.frame.case_ref).toMatch(/^case:[0-9a-f-]{36}$/);
    expect(current.frame.case_ref).not.toBe(`case:${FOCUS}`);
  });

  test("skip hides the panel, leaves a footer link, and resume brings it back", async () => {
    expect(await page()).toContain('id="getting-started"');
    const skipped = await post("/workspace/onboarding/skip", {});
    expect(skipped.status).toBe(303);
    const hidden = await page();
    expect(hidden).not.toContain('id="getting-started"');
    expect(hidden).toContain('action="/workspace/onboarding/resume"');
    const resumed = await post("/workspace/onboarding/resume", {});
    expect(resumed.headers.get("location")).toBe("/workspace#getting-started");
    expect(await page()).toContain('id="getting-started"');
  });

  test("the ungoverned stack names the missing pieces and the exact fix", async () => {
    const markup = await page();
    expect(markup).toContain("Missing: SEA-Forge governance is off and RealityTrace is not configured.");
    expect(markup).toContain("bun run ignite");
    expect(markup).toContain("Cases: Not connected");
    expect(markup).toContain("Records: Not connected");
    expect(markup).toContain('data-step="stack" data-done="false"');
  });

  test("the approval endpoint answers an unknown approval with 404", async () => {
    const response = await post("/workspace/approval", { approval_id: "approval:none", decision: "approve" });
    expect(response.status).toBe(404);
  });

  test("the page keeps 1px borders, uses no em dash, and sets no side-stripe", async () => {
    const markup = await page();
    expect(markup).not.toMatch(/border-(left|right):\s*[2-9]\d*px/);
    expect(markup).not.toContain("—");
  });
});

describe("first-run cockpit: decision receipt and moves", () => {
  let intentId = "";

  test("a commit redirects to its receipt with three separate claims", async () => {
    const fields = await liveAction();
    const response = await post("/workspace/intent", fields, { origin: `http://127.0.0.1:${server.port}`, "sec-fetch-site": "same-origin" });
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location") ?? "", base);
    intentId = location.searchParams.get("receipt") ?? "";
    expect(intentId).not.toBe("");
    expect(location.hash).toBe("#receipt");

    const markup = await page(`/workspace?receipt=${intentId}`);
    expect(markup).toContain('id="receipt"');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain("Horizon policy only: SEA-Forge is off.");
    expect(markup).toContain("Recorded by Horizon, ");
    expect(markup).toContain("Unavailable: RealityTrace is off.");
    expect(markup).toContain("No expected outcome is named, so SEA-Forge can rule on the evidence but has no outcome to settle.");
    // Ungoverned, nothing can observe or settle the commit, so the action is not offered.
    expect(markup).not.toContain("Go to Decide");
    expect(markup).toContain('data-claim="decided"');
    expect(markup).toContain('data-claim="recorded"');
    expect(markup).toContain('data-claim="observed"');
  });

  test("the first commit ends the panel for good and lists the move", async () => {
    const markup = await page();
    expect(markup).not.toContain('id="getting-started"');
    expect(markup).toContain(`data-intent="${intentId}"`);
    expect(markup).toContain(`receipt=${intentId}#receipt`);
  });

  test("an unknown receipt says so, and never echoes the query text", async () => {
    const markup = await page("/workspace?receipt=%3Cscript%3Ealert(1)%3C%2Fscript%3E");
    expect(markup).toContain("No such commit.");
    expect(markup).not.toContain("<script>alert(1)</script>");
  });
});

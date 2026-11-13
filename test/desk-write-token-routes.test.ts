import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";

let app: DeskApp;
beforeAll(async () => {
  app = await startDeskApp();
});
afterAll(async () => app.stop());

/** Every route the router registers for a state-changing method, read from the router itself (not a hand-kept list). */
function registeredWrites(): string[] {
  const source = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
  const found = new Set<string>();
  for (const match of source.matchAll(/url\.pathname === "([^"]+)" && request\.method === "(POST|PUT|PATCH|DELETE)"/g)) found.add(match[1]!);
  return [...found].filter((path) => !path.startsWith("/agent/panels")).sort();
}

/** The routes that need a paired session. /desk/pair is how a browser gets one, so it is the only write without it. */
const needsSession = (): string[] => registeredWrites().filter((path) => path !== "/desk/pair");

describe("every route that changes something needs a paired session", () => {
  test("the router has the routes the old list missed", () => {
    const routes = registeredWrites();
    for (const path of ["/workspace/intent", "/workspace/case", "/workspace/presenting", "/workspace/label", "/workspace/remote/start", "/workspace/remote/refresh", "/workspace/remote/stop", "/workspace/onboarding/skip", "/workspace/onboarding/resume", "/desk/note", "/desk/draft", "/desk/pair", "/desk/pair/logout"]) expect(routes, path).toContain(path);
  });

  test("each refuses a request with no session cookie, and nothing is changed", async () => {
    for (const path of needsSession()) {
      const json = await fetch(`${app.base}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-test-no-session": "1" }, body: "{}" });
      expect(json.status, `${path} (json)`).toBe(403);
      expect(((await json.json()) as any).outcome, path).toBe("not_paired");
      const form = await fetch(`${app.base}${path}`, { method: "POST", redirect: "manual", headers: { "x-test-no-session": "1" }, body: new URLSearchParams({ on: "1" }) });
      expect(form.status, `${path} (form)`).toBe(403);
    }
  });

  test("each refuses a made-up session cookie", async () => {
    for (const path of needsSession()) {
      const response = await fetch(`${app.base}${path}`, { method: "POST", redirect: "manual", headers: { "content-type": "application/json", cookie: `horizon_desk=${"A".repeat(43)}` }, body: "{}" });
      expect(response.status, path).toBe(403);
    }
  });

  test("other write methods are refused without a session too", async () => {
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      expect((await fetch(`${app.base}/workspace/presenting`, { method, headers: { "x-test-no-session": "1" } })).status, method).toBe(403);
    }
  });

  test("the desk page carries no write token", async () => {
    const page = await (await fetch(`${app.base}/desk`)).text();
    expect(page).not.toContain("horizon-write-token");
    expect(page).not.toContain("horizon_write");
    expect(page).toContain('<div id="root">');
    expect(page).toContain("/desk/app.js");
  });
});

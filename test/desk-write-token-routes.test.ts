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

describe("every route that changes something needs the desk page's token", () => {
  test("the router has the routes the old list missed", () => {
    const routes = registeredWrites();
    for (const path of ["/workspace/intent", "/workspace/case", "/workspace/presenting", "/workspace/label", "/workspace/remote/start", "/workspace/remote/refresh", "/workspace/remote/stop", "/workspace/onboarding/skip", "/workspace/onboarding/resume", "/desk/note", "/desk/draft"]) expect(routes, path).toContain(path);
  });

  test("each refuses a request with no token, and nothing is changed", async () => {
    for (const path of registeredWrites()) {
      const json = await fetch(`${app.base}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-test-no-token": "1" }, body: "{}" });
      expect(json.status, `${path} (json)`).toBe(403);
      const form = await fetch(`${app.base}${path}`, { method: "POST", redirect: "manual", headers: { "x-test-no-token": "1" }, body: new URLSearchParams({ on: "1" }) });
      expect(form.status, `${path} (form)`).toBe(403);
    }
  });

  test("each refuses a wrong token", async () => {
    for (const path of registeredWrites()) {
      const response = await fetch(`${app.base}${path}`, { method: "POST", redirect: "manual", headers: { "content-type": "application/json", "x-horizon-write": "0".repeat(48) }, body: "{}" });
      expect(response.status, path).toBe(403);
    }
  });

  test("other write methods are refused without a token too", async () => {
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      expect((await fetch(`${app.base}/workspace/presenting`, { method, headers: { "x-test-no-token": "1" } })).status, method).toBe(403);
    }
  });

  test("a form post carrying the page's token in a field is let through, and served forms carry that field", async () => {
    const page = await (await fetch(`${app.base}/workspace/remote`)).text();
    expect(page).toContain('name="horizon_write"');
    const token = /name="horizon_write" value="([0-9a-f]+)"/.exec(page)![1]!;
    const response = await fetch(`${app.base}/workspace/presenting`, { method: "POST", redirect: "manual", headers: { "x-test-no-token": "1" }, body: new URLSearchParams({ on: "0", return: "", horizon_write: token }) });
    expect(response.status).toBe(303);
  });
});

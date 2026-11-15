import { afterEach, describe, expect, test } from "bun:test";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";

const apps: DeskApp[] = [];
afterEach(async () => {
  while (apps.length > 0) await apps.pop()!.stop();
});

async function start(): Promise<DeskApp> {
  const app = await startDeskApp();
  apps.push(app);
  return app;
}

describe("GET /health", () => {
  test("an unpaired caller gets only the ok flag, with its status code", async () => {
    const app = await start();
    const response = await fetch(`${app.base}/health`, { headers: { "x-test-no-session": "1" } });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({ ok: true });
    for (const key of ["status", "profile", "operator_ref", "world", "research", "transports", "version"]) {
      expect(body).not.toHaveProperty(key);
    }
  });

  test("a paired caller gets the same ok flag and nothing more (R3-10)", async () => {
    const app = await start();
    const response = await fetch(`${app.base}/health`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    // The probe says one thing to every caller, paired or not: the process is up. It is not a
    // second way in to the deployment profile, the operator reference, the semantic world, the
    // research state or the transports.
    expect(body).toEqual({ ok: true });
    for (const key of ["status", "profile", "operator_ref", "world", "research", "transports", "version"]) {
      expect(body).not.toHaveProperty(key);
    }
  });

  test("the diagnostics read is the paired route that carries the deployment", async () => {
    const app = await start();
    const response = await fetch(`${app.base}/diagnostics`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect(body).toHaveProperty("profile");
    expect(body).toHaveProperty("operator_ref");
    expect(body).toHaveProperty("world");
    expect(body).toHaveProperty("research");
    expect(body).toHaveProperty("transports");
  });

  test("an unpaired caller is refused the diagnostics read", async () => {
    const app = await start();
    const response = await fetch(`${app.base}/diagnostics`, { headers: { "x-test-no-session": "1" } });
    expect(response.status).toBe(401);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.code).toBe("unauthorized");
    expect(JSON.stringify(body)).not.toContain("operator_ref");
  });

  test("POST /health is still refused to an unpaired caller", async () => {
    const app = await start();
    const response = await fetch(`${app.base}/health`, { method: "POST", headers: { "content-type": "application/json", "x-test-no-session": "1" }, body: "{}" });
    expect(response.status).toBe(403);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.code).toBe("forbidden_write");
    expect(JSON.stringify(body)).not.toContain("operator_ref");
  });
});

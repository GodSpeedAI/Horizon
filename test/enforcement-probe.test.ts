/**
 * The reproducible enforcement probe (Stage 0B reconciliation).
 *
 * Every route the catalog names on the desk listener is sent to the running application, once per method, with no
 * session-specific body. The answer is recorded as what the route actually does at this freeze: absent (no handler,
 * 404 or 405), refused (the catalog's refusal words, 403 with code "refused"), or answered (anything else). The
 * probe writes its table to PROBE_OUT when that variable is set, and asserts only that every catalog route was probed.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { parse } from "yaml";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";

type Probe = { readonly route: string; readonly status: number; readonly code: string | null; readonly outcome: "absent" | "refused" | "answered" | "no_answer" };

let app: DeskApp;
const probes: Probe[] = [];

beforeAll(async () => {
  app = await startDeskApp();
});

afterAll(async () => {
  await app.stop();
  if (process.env.PROBE_OUT !== undefined) writeFileSync(process.env.PROBE_OUT, JSON.stringify(probes, null, 1));
});

function catalogRoutes(): string[] {
  const catalog = parse(readFileSync("contracts/identity/v1/operations.yaml", "utf8")) as Record<string, any>;
  const found = new Set<string>();
  for (const rows of Object.values<any[]>(catalog.operations)) for (const row of rows) for (const route of [row.routes].flat()) found.add(String(route));
  for (const entry of catalog.dispatch as any[]) found.add(String(entry.route));
  for (const alias of catalog.route_aliases as any[]) found.add(String(alias.route));
  for (const live of catalog.live_enforcement.rows as any[]) void live;
  return [...found].filter((route) => route.startsWith("GET /") || route.startsWith("POST /")).filter((route) => !route.startsWith("POST /m/") && !route.startsWith("GET /m/")).sort();
}

describe("the desk listener answers each catalog route as it is served", () => {
  test("every desk-listener catalog route is probed once, with its method", async () => {
    for (const route of catalogRoutes()) {
      const [method, path] = route.split(" ") as [string, string];
      let response: Response;
      try {
        response = await fetch(`${app.base}${path}`, {
          method,
          redirect: "manual",
          headers: method === "POST" ? { "content-type": "application/json" } : {},
          body: method === "POST" ? "{}" : undefined,
          signal: AbortSignal.timeout(1500),
        });
      } catch {
        // A stream that never ends answers nothing within the probe's window: recorded, not hidden.
        probes.push({ route, status: 0, code: null, outcome: "no_answer" });
        continue;
      }
      let code: string | null = null;
      try {
        const parsed = (await response.clone().json()) as { code?: unknown; outcome?: unknown };
        code = typeof parsed.code === "string" ? parsed.code : typeof parsed.outcome === "string" ? parsed.outcome : null;
      } catch {
        code = null;
      }
      const outcome: Probe["outcome"] = response.status === 404 || response.status === 405 ? "absent" : response.status === 403 && code === "refused" ? "refused" : "answered";
      probes.push({ route, status: response.status, code, outcome });
    }
    expect(probes.length).toBe(catalogRoutes().length);
  }, 180_000);
});

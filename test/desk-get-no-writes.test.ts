import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { pairTestClient } from "./support/write-token.ts";

const apps: DeskApp[] = [];
afterEach(async () => {
  while (apps.length > 0) await apps.pop()!.stop();
});

/** Calls that change state: a record, a file, a label, a hand off, a start, a decision, a remote change. A GET must not reach any of them. */
const WRITE_CALL =
  /\b(logRow|writeExport|putLabel|setPresenting|openCase|setOnboardingSkipped|saveDraft|discardRow|recordAnswer|routeAnswer|updateRow|stopWaiting|deskSaveNote|deskProposeLesson|deskDecide|deskHandoff|deskPanelOp|deskStart|commitSurfaceIntent|commitNavigationIntent|submitIntent|resolveNavigationApproval|settleNavigationIntent|startObservation|applyAgentOp|addDevice|updateDevice|auditRemote|appendRow)\(|\bremote\.(start|refresh|stop)\(/;

/**
 * Every GET route in the router, with the text of its block. A block runs from its registration line to the next route at the
 * same indentation, so an inner `if` in the block stays inside it.
 */
function getRoutes(): { readonly path: string; readonly block: string }[] {
  const lines = readFileSync(join(import.meta.dir, "..", "src", "app.ts"), "utf8").split("\n");
  const routes: { path: string; block: string }[] = [];
  const registration = /^( {10})if \((.*)\) (\{|return)/;
  lines.forEach((line, index) => {
    const match = registration.exec(line);
    if (match === null || !/request\.method === "GET"/.test(match[2]!)) return;
    const paths = [...match[2]!.matchAll(/url\.pathname === "([^"]+)"/g)].map((m) => m[1]!);
    if (paths.length === 0) return;
    let end = index + 1;
    while (end < lines.length && !/^ {10}(if \(|return new Response\("not found)/.test(lines[end]!)) end += 1;
    const block = lines.slice(index, end).join("\n");
    for (const path of paths) routes.push({ path, block });
  });
  return routes;
}

async function start(): Promise<DeskApp> {
  const app = await startDeskApp();
  apps.push(app);
  return app;
}

describe("no GET changes state", () => {
  test("the router has GET routes, and none of them reaches a write", () => {
    const routes = getRoutes();
    expect(routes.length).toBeGreaterThan(20);
    const writers = routes.filter((route) => WRITE_CALL.test(route.block)).map((route) => route.path);
    expect(writers).toEqual([]);
  });

  test("a find without the record flag records nothing, and a GET find with record=1 records nothing either", async () => {
    const app = await start();
    const cookie = await pairTestClient(app.base);
    const rowsBefore = ((await (await fetch(`${app.base}/desk/conversation`, { headers: { cookie: cookie! } })).json()) as { rows: unknown[] }).rows.length;
    await fetch(`${app.base}/desk/search?q=alpha&record=1`, { headers: { cookie: cookie! } });
    await fetch(`${app.base}/desk/search?q=alpha`, { headers: { cookie: cookie! } });
    const rowsAfter = ((await (await fetch(`${app.base}/desk/conversation`, { headers: { cookie: cookie! } })).json()) as { rows: unknown[] }).rows.length;
    expect(rowsAfter).toBe(rowsBefore);
  });

  test("the find with the record flag is a POST, and it is what records the find", async () => {
    const app = await start();
    const cookie = await pairTestClient(app.base);
    const headers = { "content-type": "application/json", cookie: cookie! };
    const rowsOf = async () => ((await (await fetch(`${app.base}/desk/conversation`, { headers: { cookie: cookie! } })).json()) as { rows: { kind: string }[] }).rows.filter((r) => r.kind === "find").length;
    const before = await rowsOf();
    const plain = await fetch(`${app.base}/desk/search`, { method: "POST", headers, body: JSON.stringify({ q: "alpha" }) });
    expect(plain.status).toBe(200);
    expect(await rowsOf()).toBe(before);
    const recorded = await fetch(`${app.base}/desk/search`, { method: "POST", headers, body: JSON.stringify({ q: "alpha", record: "1" }) });
    expect(recorded.status).toBe(200);
    expect(await rowsOf()).toBe(before + 1);
  });

  test("the export is a POST that needs the session; a GET is not served", async () => {
    const app = await start();
    const cookie = await pairTestClient(app.base);
    const get = await fetch(`${app.base}/workspace/export?kind=labels&standins=1`, { headers: { cookie: cookie! } });
    expect(get.status).not.toBe(200);
    const unpaired = await fetch(`${app.base}/workspace/export`, { method: "POST", body: new URLSearchParams({ kind: "labels", standins: "1" }), headers: { "x-test-no-session": "1" } });
    expect(unpaired.status).toBe(403);
    const paired = await fetch(`${app.base}/workspace/export`, { method: "POST", body: new URLSearchParams({ kind: "labels", standins: "1" }), headers: { cookie: cookie! } });
    expect(paired.status).toBe(200);
    expect(paired.headers.get("content-disposition")).toContain("attachment");
  });
});

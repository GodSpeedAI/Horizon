import { afterEach, describe, expect, test } from "bun:test";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { pairTestClient } from "./support/write-token.ts";

const apps: DeskApp[] = [];
afterEach(async () => {
  while (apps.length > 0) await apps.pop()!.stop();
});

/** Every GET route that shows a person's data, a config, a remote link or a case. None is open to an unpaired browser. */
const HUMAN_READS = [
  "/frame",
  "/surface",
  "/surface/schema",
  "/desk/state.json",
  "/desk/search?q=alpha",
  "/desk/conversation",
  "/desk/draft",
  "/desk/decide.json",
  "/desk/lessons.json",
  "/desk/work.json",
  "/desk/setup-guide",
  "/desk/next.json",
  "/desk/first-move.json",
  "/desk/remote.json",
  "/desk/panels/catalogue",
  "/workspace",
  "/workspace/approvals",
  "/workspace.json",
  "/workspace/economics",
  "/workspace/compare",
  "/workspace/inspect",
  "/workspace/remote",
  "/workspace/remote/status",
];

/** A GET from a browser that has not paired: the test marker tells the test preload to send it as it is. */
const bare = (app: DeskApp, path: string, headers: Record<string, string> = {}) => fetch(`${app.base}${path}`, { headers: { ...headers, "x-test-no-session": "1" } });

async function start(): Promise<DeskApp> {
  const app = await startDeskApp();
  apps.push(app);
  return app;
}

describe("unpaired reads", () => {
  test.each(HUMAN_READS)("an unpaired GET of %s is refused with a 401 in plain words", async (path) => {
    const app = await start();
    const response = await bare(app, path);
    expect(response.status).toBe(401);
    const body = await response.text();
    expect(body).toContain("Pair this browser first.");
    expect(body).not.toContain("horizon.");
  });

  test("the x-horizon-source header grants no read to an unpaired caller", async () => {
    const app = await start();
    for (const path of ["/desk/state.json", "/desk/search?q=alpha", "/desk/conversation", "/workspace.json"]) {
      const response = await bare(app, path, { "x-horizon-source": "page-agent", "x-horizon-agent-name": "Helper" });
      expect(response.status, path).toBe(401);
    }
  });

  test("the agent door's own key is not a session: an unpaired GET of a human read is still refused", async () => {
    const app = await start();
    const response = await bare(app, "/desk/state.json", { authorization: "Bearer not-a-key" });
    expect(response.status).toBe(401);
  });

  test("the page, the session check and the pairing route stay open to a browser that has not paired", async () => {
    const app = await start();
    const page = await bare(app, "/desk");
    expect(page.status).toBe(200);
    const session = await bare(app, "/desk/session");
    expect(session.status).toBe(200);
    expect(await session.json()).toEqual({ paired: false });
    const pair = await bare(app, "/desk/pair");
    expect(pair.status).not.toBe(401);
  });

  test("a paired browser reads the same routes", async () => {
    const app = await start();
    const cookie = await pairTestClient(app.base);
    expect(cookie).not.toBeNull();
    for (const path of ["/desk/state.json", "/desk/conversation", "/workspace.json", "/desk/remote.json"]) {
      const response = await fetch(`${app.base}${path}`, { headers: { cookie: cookie! } });
      expect(response.status, path).toBe(200);
    }
  });
});

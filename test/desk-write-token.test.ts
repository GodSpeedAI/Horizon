import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";

let app: DeskApp;
beforeAll(async () => {
  app = await startDeskApp();
});
afterAll(async () => app.stop());

const WRITES = ["/desk/handoff", "/desk/decide", "/desk/note", "/desk/panels/op", "/desk/conversation/discard", "/desk/start", "/desk/lesson", "/intent", "/surface/intent"];
const send = (path: string, headers: Record<string, string>) => fetch(`${app.base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: "{}" });

describe("the person's writes need a paired session", () => {
  test("a write with no session is refused with plain words, on every human route", async () => {
    for (const path of WRITES) {
      const response = await send(path, { "x-test-no-session": "1" });
      expect(response.status, path).toBe(403);
      expect(((await response.json()) as any).message, path).toContain("not paired with the desk");
    }
  });

  test("a made-up session cookie is refused", async () => {
    for (const path of WRITES) {
      expect((await send(path, { cookie: `horizon_desk=${"B".repeat(43)}`, "x-test-no-session": "1" })).status, path).toBe(403);
    }
  });

  test("a paired client's write gets through to the route", async () => {
    const response = await send("/desk/note", {});
    expect(response.status).not.toBe(403);
  });

  test("the agent header alone is refused, and a session does not turn an agent into the person", async () => {
    const bare = await send("/desk/decide", { "x-horizon-source": "page-agent", "x-test-no-session": "1" });
    expect(bare.status).toBe(403);
    expect(((await bare.json()) as any).outcome).toBe("agent_refused");
    const withSession = await send("/desk/decide", { "x-horizon-source": "page-agent" });
    expect(withSession.status).toBe(403);
    expect(((await withSession.json()) as any).outcome).toBe("agent_refused");
  });

  test("the agent door keeps its own key and does not take the session", async () => {
    expect((await send("/agent/panels", {})).status).toBe(401);
  });
});

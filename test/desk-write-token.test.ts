import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";

let app: DeskApp;
beforeAll(async () => {
  app = await startDeskApp();
});
afterAll(async () => app.stop());

const WRITES = ["/desk/handoff", "/desk/decide", "/desk/note", "/desk/panels/op", "/desk/conversation/discard", "/desk/start", "/desk/lesson", "/intent", "/surface/intent"];
const tokenOfPage = async (): Promise<string> => /name="horizon-write-token" content="([0-9a-f]+)"/.exec(await (await fetch(`${app.base}/desk`)).text())![1]!;
const send = (path: string, headers: Record<string, string>) => fetch(`${app.base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: "{}" });

describe("the person's writes need the desk page's token", () => {
  test("a write with no token is refused with plain words, on every human route", async () => {
    for (const path of WRITES) {
      const response = await send(path, { "x-test-no-token": "1" });
      expect(response.status, path).toBe(403);
      expect(((await response.json()) as any).message, path).toContain("did not come from the desk page");
    }
  });

  test("a wrong or made-up token is refused", async () => {
    for (const path of WRITES) {
      expect((await send(path, { "x-horizon-write": "0".repeat(48) })).status, path).toBe(403);
      expect((await send(path, { "x-horizon-write": "short" })).status, path).toBe(403);
    }
  });

  test("the page carries its token, and a write with it is let through to the route", async () => {
    const token = await tokenOfPage();
    expect(token.length).toBeGreaterThan(30);
    const response = await send("/desk/note", { "x-horizon-write": token });
    expect(response.status).not.toBe(403);
    expect(await tokenOfPage()).toBe(token);
  });

  test("the agent header alone is refused, and the page's token does not turn an agent into the person", async () => {
    const token = await tokenOfPage();
    const bare = await send("/desk/decide", { "x-horizon-source": "page-agent" });
    expect(bare.status).toBe(403);
    expect(((await bare.json()) as any).outcome).toBe("agent_refused");
    const withToken = await send("/desk/decide", { "x-horizon-source": "page-agent", "x-horizon-write": token });
    expect(withToken.status).toBe(403);
    expect(((await withToken.json()) as any).outcome).toBe("agent_refused");
  });

  test("the agent door keeps its own key and does not take the page token", async () => {
    const token = await tokenOfPage();
    expect((await send("/agent/panels", { "x-horizon-write": token })).status).toBe(401);
  });
});

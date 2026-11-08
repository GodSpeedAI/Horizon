import { afterEach, describe, expect, test } from "bun:test";
import { createDeskPairing, LOCK_MS, PAIRING_LIFETIME_MS, SESSION_LIFETIME_MS, WRONG_CODE_WORDS, LOCKED_WORDS, SPENT_CODE_WORDS } from "../src/desk/pairing.ts";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { testCodeFor } from "./support/write-token.ts";

const apps: DeskApp[] = [];
afterEach(async () => {
  while (apps.length > 0) await apps.pop()!.stop();
});

/** A desk with a clock the test moves by hand. Each start prints its own code. */
async function desk(start = "2026-11-06T10:00:00Z") {
  let time = new Date(start).getTime();
  const app = await startDeskApp({ now: () => new Date(time) });
  apps.push(app);
  const code = testCodeFor(app.base)!;
  return { app, code, advance: (ms: number) => (time += ms) };
}

const pair = (app: DeskApp, code: string) =>
  fetch(`${app.base}/desk/pair`, { method: "POST", headers: { "content-type": "application/json", "x-test-no-session": "1" }, body: JSON.stringify({ code }) });

describe("the pairing code", () => {
  test("it is printed once, in plain words, and is not in the page or the desk state", async () => {
    const lines: string[] = [];
    const log = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    let app: DeskApp;
    try {
      app = await startDeskApp();
    } finally {
      console.log = log;
    }
    apps.push(app);
    const printed = lines.filter((line) => line.includes("pairing code"));
    expect(printed.length).toBe(1);
    expect(printed[0]).toMatch(/enter this pairing code: [2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}\. It works once and expires in 10 minutes\./);
    const code = testCodeFor(app.base)!;
    expect(code).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    const page = await (await fetch(`${app.base}/desk`)).text();
    expect(page).not.toContain(code.replace("-", ""));
    expect(page).not.toContain(code);
  });

  test("a correct code pairs and sets an HttpOnly, SameSite=Strict session cookie", async () => {
    const { app, code } = await desk();
    const response = await pair(app, code);
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^horizon_desk=[A-Za-z0-9_-]{40,}; /);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain(`Max-Age=${SESSION_LIFETIME_MS / 1000}`);
    expect(((await response.json()) as any).paired).toBe(true);
  });

  test("the code is accepted with or without its hyphen, in any letter case", async () => {
    const { app, code } = await desk();
    expect((await pair(app, code.replace("-", "").toLowerCase())).status).toBe(200);
  });

  test("a wrong code is refused with plain words", async () => {
    const { app, code } = await desk();
    const wrong = code.startsWith("2") ? `3${code.slice(1)}` : `2${code.slice(1)}`;
    const response = await pair(app, wrong);
    expect(response.status).toBe(403);
    expect(((await response.json()) as any).message).toBe(WRONG_CODE_WORDS);
  });

  test("a used code cannot be reused", async () => {
    const { app, code } = await desk();
    expect((await pair(app, code)).status).toBe(200);
    const again = await pair(app, code);
    expect(again.status).toBe(403);
    expect(((await again.json()) as any).message).toBe(SPENT_CODE_WORDS);
  });

  test("an expired code is refused", async () => {
    const { app, code, advance } = await desk();
    advance(PAIRING_LIFETIME_MS);
    const response = await pair(app, code);
    expect(response.status).toBe(403);
    expect(((await response.json()) as any).message).toBe(SPENT_CODE_WORDS);
  });

  test("five wrong codes lock pairing for a minute, even for the right code", async () => {
    const { app, code, advance } = await desk();
    const wrong = code.startsWith("2") ? "3" : "2";
    for (let i = 0; i < 5; i += 1) {
      const response = await pair(app, `${wrong}${code.slice(1)}`);
      expect(response.status).toBe(403);
      expect(((await response.json()) as any).message).toBe(WRONG_CODE_WORDS);
    }
    const locked = await pair(app, code);
    expect(locked.status).toBe(429);
    expect(((await locked.json()) as any).message).toBe(LOCKED_WORDS);
    advance(LOCK_MS);
    expect((await pair(app, code)).status).toBe(200);
  });

  test("the pairing state keeps a hash, not the code (the object has no code field)", () => {
    const { pairing, code } = createDeskPairing(() => new Date("2026-11-06T10:00:00Z"));
    expect(Object.keys(pairing).sort()).toEqual(["end", "pair", "paired"]);
    expect(JSON.stringify(pairing)).not.toContain(code);
  });
});

describe("the session", () => {
  test("a paired cookie opens writes, and logout ends it", async () => {
    const { app, code } = await desk();
    const cookie = /horizon_desk=[^;]+/.exec((await pair(app, code)).headers.get("set-cookie") ?? "")![0];
    const status = await fetch(`${app.base}/desk/session`, { headers: { cookie } }).then((r) => r.json());
    expect(status).toEqual({ paired: true });
    const write = await fetch(`${app.base}/desk/note`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: "{}" });
    expect(write.status).not.toBe(403);
    const out = await fetch(`${app.base}/desk/pair/logout`, { method: "POST", headers: { cookie } });
    expect(out.headers.get("set-cookie")).toContain("Max-Age=0");
    const after = await fetch(`${app.base}/desk/note`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: "{}" });
    expect(after.status).toBe(403);
  });

  test("a session ends after 12 hours", async () => {
    const { app, code, advance } = await desk();
    const cookie = /horizon_desk=[^;]+/.exec((await pair(app, code)).headers.get("set-cookie") ?? "")![0];
    advance(SESSION_LIFETIME_MS);
    expect(await fetch(`${app.base}/desk/session`, { headers: { cookie } }).then((r) => r.json())).toEqual({ paired: false });
  });

  test("GET /desk has no session data and no token", async () => {
    const { app } = await desk();
    const response = await fetch(`${app.base}/desk`);
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain("horizon-write-token");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

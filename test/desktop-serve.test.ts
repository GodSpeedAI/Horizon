/**
 * `horizon serve --desktop`: the token-gated loopback mode the desktop shell supervises.
 *
 * The server runs as a real child process, the way the shell runs it. Nothing here reads a terminal: the one-time code comes
 * from the ready line on stdout, and the only credential is the session cookie that code buys.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { READY_MARKER, defaultDataDir } from "../src/desktop.ts";

const nativeFetch = globalThis.fetch.bind(globalThis);
// The test preload pairs every request on its own; these requests must arrive exactly as sent.
const raw = (url: string, init: RequestInit = {}) => nativeFetch(url, { redirect: "manual", ...init, headers: { "x-test-no-session": "1", ...(init.headers ?? {}) } });

let data: string;
let child: Bun.Subprocess<"pipe", "pipe", "pipe">;
let origin: string;
let code: string;
let exited: Promise<number>;

async function readyLine(proc: Bun.Subprocess<"pipe", "pipe", "pipe">): Promise<{ url: string; code: string; pid: number }> {
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let seen = "";
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    seen += decoder.decode(value);
    const line = seen.split("\n").find((l) => l.startsWith(`${READY_MARKER} `));
    if (line !== undefined) {
      reader.releaseLock();
      return JSON.parse(line.slice(READY_MARKER.length + 1));
    }
  }
  throw new Error(`no ready line from the server; saw: ${seen.slice(0, 400)}`);
}

beforeAll(async () => {
  data = mkdtempSync(join(tmpdir(), "horizon-desktop-"));
  child = Bun.spawn(["bun", "run", "src/main.ts", "serve", "--desktop", "--port", "0", "--data", data], {
    cwd: join(import.meta.dir, ".."),
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, HORIZON_SETUP: "" },
  });
  exited = child.exited;
  const ready = await readyLine(child);
  origin = ready.url;
  code = ready.code;
}, 90_000);

afterAll(async () => {
  child.kill();
  await exited;
  rmSync(data, { recursive: true, force: true });
});

describe("horizon serve --desktop", () => {
  test("binds loopback on an ephemeral port other than the configured one", () => {
    const url = new URL(origin);
    expect(url.hostname).toBe("127.0.0.1");
    expect(Number(url.port)).toBeGreaterThan(0);
    expect(url.port).not.toBe("4319");
    expect(code).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
  });

  test("health is the only open read, and says only that the process is up", async () => {
    const health = await raw(`${origin}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true });
  });

  test("a request without the session is refused", async () => {
    for (const path of ["/workspace", "/frame", "/desk/state.json", "/diagnostics"]) {
      const response = await raw(`${origin}${path}`);
      expect(response.status).toBe(401);
    }
    const write = await raw(`${origin}/intent`, { method: "POST", body: "{}", headers: { "content-type": "application/json", origin } });
    expect(write.status).toBe(403);
  });

  test("a request that names another host is refused before anything else", async () => {
    const response = await raw(`${origin}/health`, { headers: { host: "evil.example" } });
    expect(response.status).toBe(403);
  });

  const pair = (given: string) =>
    raw(`${origin}/desk/pair`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ code: given }) });

  test("a wrong code sets no session", async () => {
    const response = await pair("AAAA-AAAA");
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  test("there is no second way in: the launch route does not exist", async () => {
    expect((await raw(`${origin}/desk/launch?code=${code}`)).status).toBe(401);
  });

  test("the handed-over code buys a session once; the same code is then spent", async () => {
    const paired = await pair(code);
    expect(paired.status).toBe(200);
    const cookie = /horizon_desk=[A-Za-z0-9_-]+/.exec(paired.headers.get("set-cookie") ?? "")?.[0];
    expect(cookie).toBeDefined();
    expect(paired.headers.get("set-cookie")).toContain("HttpOnly");
    expect(paired.headers.get("set-cookie")).toContain("SameSite=Strict");

    const page = await raw(`${origin}/workspace`, { headers: { cookie: cookie as string } });
    expect(page.status).toBe(200);
    const session = await raw(`${origin}/desk/session`, { headers: { cookie: cookie as string } });
    expect(await session.json()).toEqual({ paired: true });

    const again = await pair(code);
    expect(again.status).toBe(403);
    expect(again.headers.get("set-cookie")).toBeNull();
  });

  test("closing stdin stops the server, as when the shell dies", async () => {
    await child.stdin.end();
    const status = await Promise.race([exited, new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 20_000))]);
    expect(status).toBe(0);
    await expect(raw(`${origin}/health`)).rejects.toThrow();
  }, 30_000);
});

describe("data location", () => {
  test("defaults follow each platform's convention", () => {
    expect(defaultDataDir("linux", { XDG_DATA_HOME: "/x" })).toBe("/x/horizon");
    expect(defaultDataDir("win32", { APPDATA: "C:\\A" })).toContain("Horizon");
    expect(defaultDataDir("darwin", {})).toContain("Application Support");
  });
});

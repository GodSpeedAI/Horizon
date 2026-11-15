/**
 * Headless smoke for a built server binary: start it, wait for health, open a session with the one-time code, read the desk
 * and one real write path, stop it by closing stdin, and require that it exits and its port closes.
 *
 *   bun run scripts/smoke-sidecar.ts <path-to-horizon-server> [<resources-dir>]
 *
 * Exits non-zero on the first failed step and prints each step it passed. It never prints the pairing code or the cookie.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [binaryArg, resourcesArg] = process.argv.slice(2);
if (binaryArg === undefined) throw new Error("usage: smoke-sidecar.ts <horizon-server> [<resources-dir>]");
const binary = resolve(binaryArg);
const resources = resourcesArg === undefined ? undefined : resolve(resourcesArg);
const MARKER = "horizon-desktop-ready";
const data = mkdtempSync(join(tmpdir(), "horizon-smoke-"));
const step = (name: string) => console.log(`ok  ${name}`);
const fail = (message: string): never => {
  console.error(`FAIL ${message}`);
  throw new Error(message);
};

const child = Bun.spawn([binary, "serve", "--desktop", "--port", "0", "--data", data, ...(resources === undefined ? [] : ["--resources", resources])], {
  stdin: "pipe",
  stdout: "pipe",
  stderr: "pipe",
  cwd: tmpdir(),
});
let stderrHead = "";
let stderrTail = "";
void (async () => {
  for await (const chunk of child.stderr) {
    const text = new TextDecoder().decode(chunk);
    if (stderrHead.length < 1500) stderrHead += text;
    stderrTail = (stderrTail + text).slice(-1500);
  }
})();

try {
  const reader = child.stdout.getReader();
  const decoder = new TextDecoder();
  let seen = "";
  let ready: { url: string; code: string } | undefined;
  const deadline = Date.now() + 90_000;
  while (ready === undefined && Date.now() < deadline) {
    const { value, done } = await Promise.race([reader.read(), new Promise<{ value: undefined; done: true }>((r) => setTimeout(() => r({ value: undefined, done: true }), 90_000))]);
    if (done) break;
    seen += decoder.decode(value);
    const line = seen.split("\n").find((l) => l.startsWith(`${MARKER} `));
    if (line !== undefined) ready = JSON.parse(line.slice(MARKER.length + 1));
  }
  if (ready === undefined) fail(`no ready line; stderr head: ${stderrHead.slice(0, 1500)} ... tail: ${stderrTail}`);
  const { url, code } = ready as { url: string; code: string };
  step(`ready on ${url}`);
  void (async () => { for (;;) { const { done } = await reader.read(); if (done) return; } })();

  const call = (path: string, init: RequestInit = {}) => fetch(`${url}${path}`, { redirect: "manual", ...init });
  const health = await call("/health");
  if (health.status !== 200) fail(`health ${health.status}`);
  step("health 200");
  if ((await call("/workspace")).status !== 401) fail("an unpaired read was not refused");
  step("unpaired read refused");
  const launched = await call("/desk/pair", { method: "POST", headers: { origin: url, "content-type": "application/json" }, body: JSON.stringify({ code }) });
  const cookie = /horizon_desk=[A-Za-z0-9_-]+/.exec(launched.headers.get("set-cookie") ?? "")?.[0];
  if (launched.status !== 200 || cookie === undefined) fail(`pair ${launched.status}`);
  step("one-time code opened a session");
  const auth = { cookie: cookie as string };
  for (const path of ["/workspace", "/desk/app.js", "/desk/app.css", "/diagnostics", "/frame"]) {
    const response = await call(path, { headers: auth });
    if (response.status !== 200) fail(`${path} -> ${response.status}`);
    await response.arrayBuffer();
  }
  step("workspace, desk bundle, diagnostics and frame read");
  const note = await call("/desk/note", { method: "POST", headers: { ...auth, origin: url, "content-type": "application/json" }, body: JSON.stringify({ body: "smoke" }) });
  const noteText = await note.text();
  if (note.status >= 500 || /catalog could not be loaded/i.test(noteText)) fail(`write path -> ${note.status} ${noteText.slice(0, 200)}`);
  step(`write path answered ${note.status} (no server fault)`);

  await child.stdin.end();
  const exit = await Promise.race([child.exited, new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 20_000))]);
  if (exit !== 0) fail(`stop: exit ${String(exit)}`);
  step("stopped on stdin close (exit 0)");
  const closed = await fetch(`${url}/health`).then(() => false, () => true);
  if (!closed) fail("port still answering after stop");
  step("port closed");
  console.log("SMOKE PASS");
} catch (error) {
  console.error(String(error));
  child.kill();
  process.exitCode = 1;
} finally {
  rmSync(data, { recursive: true, force: true });
}
// Pending timeout timers from the waits above would otherwise hold the process open.
process.exit(process.exitCode ?? 0);

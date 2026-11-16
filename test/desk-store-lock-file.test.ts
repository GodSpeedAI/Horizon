/**
 * The process-level store lock file (`<store>.lock`), held by the kernel through a per-platform holder child (flock, perl or PowerShell). Two starts in separate processes cannot
 * both hold it; a holder that dies (SIGKILL) releases it; contenders never displace a live holder. The store-record lock is a second
 * check and refuses a second holder in the same process.
 */
import { afterAll, describe, expect, test } from "bun:test";
import type { Subprocess } from "bun";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireDeskLock, acquireStoreLockFile, DeskAlreadyRunning, FlockMissing, lockHolderCommand, releaseDeskLock, releaseStoreLockFile, storeLockPath } from "../src/capabilities/desk-lock.ts";
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";

const dirs: string[] = [];
const newStore = (): { readonly store: string; readonly lock: string } => {
  const dir = mkdtempSync(join(tmpdir(), "desk-store-lock-"));
  dirs.push(dir);
  const store = join(dir, "d.sqlite");
  return { store, lock: storeLockPath(store) };
};
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** A separate process that tries the store lock file (see support/store-lock-holder.ts). */
const HOLDER = join(import.meta.dir, "support", "store-lock-holder.ts");
interface Start {
  readonly proc: Subprocess<"pipe", "pipe", "pipe">;
  /** The helper's first line: HELD, REFUSED or ERROR. */
  readonly first: Promise<string>;
}
function start(store: string): Start {
  const proc = Bun.spawn([process.execPath, HOLDER, store], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  return { proc, first: firstLine(proc.stdout) };
}
async function firstLine(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (!text.includes("\n")) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text.split("\n")[0]!.trim();
}
/** Closes the helper's stdin, so a helper that holds the lock lets it go, and waits for it to exit. */
async function stop(helper: Start): Promise<void> {
  try {
    helper.proc.stdin.end();
  } catch {
    // A helper that has already exited has no stdin left to close.
  }
  await helper.proc.exited;
}

describe("the store lock file", () => {
  test("two acquirers in separate processes: exactly one gets the lock", async () => {
    const { store } = newStore();
    const a = start(store);
    const b = start(store);
    const outcomes = await Promise.all([a.first, b.first]);
    expect([...outcomes].sort()).toEqual(["HELD", "REFUSED"]);
    await stop(outcomes[0] === "HELD" ? a : b);
    await stop(outcomes[0] === "HELD" ? b : a);
  });

  test("a holder killed with SIGKILL releases the lock, and a new start takes it", async () => {
    const { store } = newStore();
    const holder = start(store);
    expect(await holder.first).toBe("HELD");
    holder.proc.kill("SIGKILL");
    await holder.proc.exited;
    // The kernel drops the lock when the flock child sees its stdin close, which is just after the kill. A start in that moment is refused.
    let next: Start | undefined;
    let outcome = "";
    for (let attempt = 0; attempt < 50 && outcome !== "HELD"; attempt += 1) {
      if (next !== undefined) await stop(next);
      next = start(store);
      outcome = await next.first;
      if (outcome !== "HELD") await Bun.sleep(100);
    }
    expect(outcome).toBe("HELD");
    await stop(next!);
  });

  test("three contenders: none of them displaces a live holder", async () => {
    const { store, lock } = newStore();
    const holder = start(store);
    expect(await holder.first).toBe("HELD");
    const inode = statSync(lock).ino;

    // Two more starts contend while the first is alive, and one more after them.
    const contenders = [start(store), start(store)];
    expect(await Promise.all(contenders.map((c) => c.first))).toEqual(["REFUSED", "REFUSED"]);
    const late = start(store);
    expect(await late.first).toBe("REFUSED");

    // The live holder's lock file is the same file (never renamed or replaced), and nothing else sits beside it.
    expect(existsSync(lock)).toBe(true);
    expect(statSync(lock).ino).toBe(inode);
    expect(readdirSync(join(lock, "..")).sort()).toEqual(["d.sqlite.lock"]);
    await stop(holder);
  });

  test("a leftover lock file does not block a start: only the kernel lock decides", async () => {
    const { store, lock } = newStore();
    // A file left by a desk that died, naming a process id: nothing is checked against it.
    await Bun.write(lock, JSON.stringify({ pid: 2147483646, token: "crashed-desk", since: "2026-11-01T00:00:00.000Z" }));
    const held = await acquireStoreLockFile(store);
    await expect(acquireStoreLockFile(store)).rejects.toBeInstanceOf(DeskAlreadyRunning);
    await releaseStoreLockFile(held);
  });

  test("the store record refuses a second holder in the same process, and a release lets the next one take it", async () => {
    const { store } = newStore();
    const db = openSqliteStore({ path: store });
    const first = await acquireDeskLock(db);
    await expect(acquireDeskLock(db)).rejects.toBeInstanceOf(DeskAlreadyRunning);
    await releaseDeskLock(db, first);
    const second = await acquireDeskLock(db);
    expect(second).not.toBe(first);
    await releaseDeskLock(db, second);
    await db.close();
  });

  test("a missing flock command refuses the start with a clear message", async () => {
    const { store, lock } = newStore();
    const saved = process.env.PATH;
    process.env.PATH = "";
    try {
      await expect(acquireStoreLockFile(store)).rejects.toBeInstanceOf(FlockMissing);
    } finally {
      process.env.PATH = saved;
    }
    expect(existsSync(lock)).toBe(false);
  });
});

describe("the lock holder per platform", () => {
  test("linux runs flock, darwin runs perl, win32 runs powershell with the path in the environment", () => {
    const p = "/tmp/x y/d.sqlite.lock";
    expect(lockHolderCommand(p, "linux")).toEqual({ cmd: "flock", args: ["-n", p, "-c", "echo LOCKED; read _"], env: {} });
    const mac = lockHolderCommand(p, "darwin")!;
    expect(mac.cmd).toBe("/usr/bin/perl");
    expect(mac.args[0]).toBe("-e");
    expect(mac.args[1]).toContain("LOCK_NB");
    expect(mac.args[2]).toBe(p);
    const win = lockHolderCommand("C:\\d\\a b.lock", "win32")!;
    expect(win.cmd).toBe("powershell.exe");
    expect(win.args.slice(0, 3)).toEqual(["-NoProfile", "-NonInteractive", "-Command"]);
    expect(win.args[3]).toContain("'None'");
    expect(win.args.join(" ")).not.toContain("a b.lock");
    expect(win.env).toEqual({ HORIZON_LOCK_PATH: "C:\\d\\a b.lock" });
    expect(lockHolderCommand(p, "freebsd")).toBeUndefined();
  });

  test("an unsupported platform refuses with the missing-tool error", async () => {
    const { store } = newStore();
    await expect(acquireStoreLockFile(store, "freebsd")).rejects.toBeInstanceOf(FlockMissing);
  });

  test.skipIf(!existsSync("/usr/bin/perl"))("the darwin perl holder excludes a second start, releases, and drops on kill", async () => {
    const { store } = newStore();
    const first = await acquireStoreLockFile(store, "darwin");
    await expect(acquireStoreLockFile(store, "darwin")).rejects.toBeInstanceOf(DeskAlreadyRunning);
    await releaseStoreLockFile(first);
    const second = await acquireStoreLockFile(store, "darwin");
    second.holder.kill("SIGKILL");
    await new Promise((resolve) => second.holder.once("exit", resolve));
    const third = await acquireStoreLockFile(store, "darwin");
    await releaseStoreLockFile(third);
  });

  test("on this platform: second acquire is refused, release then re-acquire works", async () => {
    const { store } = newStore();
    const first = await acquireStoreLockFile(store);
    await expect(acquireStoreLockFile(store)).rejects.toBeInstanceOf(DeskAlreadyRunning);
    await releaseStoreLockFile(first);
    await releaseStoreLockFile(await acquireStoreLockFile(store));
  });
});

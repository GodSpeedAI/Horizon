/**
 * The single writer for a desk database (design v3, section 2: "Refuse a second server against the same desk database; this design
 * deliberately supports one local writer"). One record in `horizon-desk-lock` holds the token of the desk that owns the store, its
 * process id and the time it started. A desk takes the lock with a compare-and-set commit at startup, and gives it up on close.
 *
 * A lock is held by a desk that is still running: a token that has not been released, held by a process id that is alive. That includes
 * a desk in this process, or a worker in this process, whose tokens this module cannot see. A lock left behind by a process that stopped
 * without releasing it does not block the next start.
 */
import { randomUUID } from "node:crypto";
import { accessSync, constants } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import type { DurableStore } from "@godspeedai/cognate-events";

export const LOCK_COLLECTION = "horizon-desk-lock";
export const LOCK_ID = "desk";
export const ALREADY_RUNNING_WORDS = "Another Horizon desk is already using this database. Stop it first.";

/** Tokens of desks that are open in this process. A second desk in the same process sees them here. */
const openTokens = new Set<string>();

export class DeskAlreadyRunning extends Error {
  constructor() {
    super(ALREADY_RUNNING_WORDS);
    this.name = "DeskAlreadyRunning";
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else, so it is alive.
    return (error as { code?: unknown }).code === "EPERM";
  }
}

/** Takes the store's writer lock, or throws DeskAlreadyRunning. Returns the token that releases it. */
export async function acquireDeskLock(store: DurableStore): Promise<string> {
  const current = await store.getRecord(LOCK_COLLECTION, LOCK_ID);
  if (current !== undefined) {
    const holder = current.value as { readonly token?: unknown; readonly pid?: unknown };
    if (typeof holder.token === "string") {
      // A record that names this process is live too: another worker in this process holds it, and its tokens are not in this
      // module's set. Only a record whose process has gone is stale.
      const live = openTokens.has(holder.token) || (typeof holder.pid === "number" && processAlive(holder.pid));
      if (live) throw new DeskAlreadyRunning();
    }
  }
  const token = randomUUID();
  try {
    // The compare-and-set makes two desks that start together race for the record: one commit wins, the other is refused.
    await store.commit({ appends: [], records: [{ collection: LOCK_COLLECTION, id: LOCK_ID, expectedVersion: current?.version ?? 0, value: { token, pid: process.pid, since: new Date().toISOString() } }] });
  } catch {
    throw new DeskAlreadyRunning();
  }
  openTokens.add(token);
  return token;
}

/** Gives the lock up. Only the desk that holds the token can clear it. */
export async function releaseDeskLock(store: DurableStore, token: string): Promise<void> {
  openTokens.delete(token);
  const current = await store.getRecord(LOCK_COLLECTION, LOCK_ID);
  if (current === undefined || (current.value as { readonly token?: unknown }).token !== token) return;
  await store.commit({ appends: [], records: [{ collection: LOCK_COLLECTION, id: LOCK_ID, expectedVersion: current.version, value: { token: null, pid: null, since: null } }] });
}

/**
 * The process-level lock: a kernel-held advisory lock on `<store>.lock`, taken before the store is opened at all. Opening a store at an
 * older schema migrates it, so a second desk must be refused before that open (R3-4). The store's own record lock (above) stays as a
 * second check.
 *
 * The lock is held by a small child process per platform, for as long as the child's stdin stays open. Linux runs `flock -n` (util-linux);
 * its shell waits on `read`. macOS has no flock command, so it runs `/usr/bin/perl` and perl's flock(2). Windows runs PowerShell, which
 * opens the file with FileShare.None (an exclusive open). Each prints `LOCKED` once it holds the file, and exits non-zero without it when
 * another start holds it. Release closes stdin, so the holder exits and the OS drops the lock. If the desk dies, its end of the pipe
 * closes with it, and the OS drops the lock the same way. Nothing is renamed, unlinked or judged by a process id to decide exclusion, so
 * there is no stale lock to recover.
 */
export const FLOCK_MISSING_WORDS = "Horizon needs the flock command (util-linux) to guard its database, and it is not installed. Install util-linux, then start again.";

/** The words for a missing holder tool on this platform. */
export function lockToolMissingWords(platform: NodeJS.Platform = process.platform): string {
  if (platform === "linux") return FLOCK_MISSING_WORDS;
  if (platform === "darwin") return "Horizon needs /usr/bin/perl to guard its database, and it is not available. Install the Xcode command line tools, then start again.";
  if (platform === "win32") return "Horizon needs powershell.exe to guard its database, and it is not available. Make sure Windows PowerShell is on the PATH, then start again.";
  return `Horizon cannot guard its database on this platform (${platform}): no lock holder is available.`;
}

/** Thrown when the platform's lock holder tool cannot be run. The class keeps its name; the message names the tool for the platform. */
export class FlockMissing extends Error {
  constructor(platform: NodeJS.Platform = process.platform) {
    super(lockToolMissingWords(platform));
    this.name = "FlockMissing";
  }
}

/** The held lock: the path of the lock file, and the holder child that holds it. Keep it open until the desk shuts down. */
export interface StoreLockFile {
  readonly path: string;
  readonly holder: ChildProcessByStdio<Writable, Readable, null>;
}

export function storeLockPath(storePath: string): string {
  return `${storePath}.lock`;
}

export interface HolderCommand {
  readonly cmd: string;
  readonly args: readonly string[];
  /** Extra environment for the holder, merged over this process's. */
  readonly env: Readonly<Record<string, string>>;
}

const PERL_HOLDER = 'use Fcntl qw(:flock); open(my $f, ">>", $ARGV[0]) or exit 2; flock($f, LOCK_EX|LOCK_NB) or exit 1; $|=1; print "LOCKED\\n"; <STDIN>;';
const POWERSHELL_HOLDER =
  "try { $f = [System.IO.File]::Open($env:HORIZON_LOCK_PATH,'OpenOrCreate','ReadWrite','None') } catch { exit 1 }; [Console]::Out.WriteLine('LOCKED'); [Console]::Out.Flush(); [void][Console]::In.ReadLine()";

/** The command that holds the lock file on a platform, or undefined when the platform has no holder. Pure, so it can be tested anywhere. */
export function lockHolderCommand(path: string, platform: NodeJS.Platform = process.platform): HolderCommand | undefined {
  switch (platform) {
    case "linux":
      return { cmd: "flock", args: ["-n", path, "-c", "echo LOCKED; read _"], env: {} };
    case "darwin":
      return { cmd: "/usr/bin/perl", args: ["-e", PERL_HOLDER, path], env: {} };
    case "win32":
      return { cmd: "powershell.exe", args: ["-NoProfile", "-NonInteractive", "-Command", POWERSHELL_HOLDER], env: { HORIZON_LOCK_PATH: path } };
    default:
      return undefined;
  }
}

/** Finds a command on this process's current PATH (the runtime may have cached the PATH it started with). Absolute commands pass through. */
function resolveCommand(cmd: string, platform: NodeJS.Platform): string | undefined {
  const exts = platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD").split(";") : [""];
  const dirs = isAbsolute(cmd) ? [""] : (process.env.PATH ?? "").split(delimiter).filter((d) => d !== "");
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = dir === "" ? cmd : join(dir, cmd + (cmd.toLowerCase().endsWith(ext.toLowerCase()) ? "" : ext));
      try {
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
        // not here; try the next
      }
    }
  }
  return undefined;
}

/** Takes the store's lock file, or throws DeskAlreadyRunning when another start holds it. Call this before the store is opened. */
export async function acquireStoreLockFile(storePath: string, platform: NodeJS.Platform = process.platform): Promise<StoreLockFile> {
  const path = storeLockPath(storePath);
  const command = lockHolderCommand(path, platform);
  if (command === undefined) throw new FlockMissing(platform);
  const resolved = resolveCommand(command.cmd, platform);
  if (resolved === undefined) throw new FlockMissing(platform);
  const holder = spawn(resolved, [...command.args], { stdio: ["pipe", "pipe", "ignore"], env: { ...process.env, ...command.env }, windowsHide: true });
  // A holder that has already exited makes its stdin fail. That is not an error for the start.
  holder.stdin.on("error", () => undefined);
  return new Promise<StoreLockFile>((resolve, reject) => {
    let out = "";
    let settled = false;
    holder.stdout.setEncoding("utf8");
    holder.stdout.on("data", (chunk: string) => {
      out += chunk;
      // The line ends in \n on Linux and macOS and \r\n on Windows.
      if (!settled && /LOCKED\r?\n/.test(out)) {
        settled = true;
        resolve({ path, holder });
      }
    });
    holder.once("error", (error) => {
      if (settled) return;
      settled = true;
      reject((error as { code?: unknown }).code === "ENOENT" ? new FlockMissing(platform) : error);
    });
    // The holder exits non-zero, without printing LOCKED, when another start holds the file. The exit is read one turn late so that a
    // spawn error (ENOENT) that arrives alongside it is reported as a missing tool.
    holder.once("exit", () => {
      setImmediate(() => {
        if (settled) return;
        settled = true;
        reject(new DeskAlreadyRunning());
      });
    });
  });
}

/** Gives the lock up: closes the holder's stdin so flock releases the file, and waits for the holder to exit. */
export function releaseStoreLockFile(lock: StoreLockFile): Promise<void> {
  const { holder } = lock;
  if (holder.exitCode !== null || holder.signalCode !== null) return Promise.resolve();
  return new Promise<void>((resolve) => {
    holder.once("exit", () => resolve());
    holder.stdin.end();
  });
}

/**
 * One connector per setup. The pid file `<root>/run/connector.lock` is never visible half-written: the pid goes into a temp
 * file first, and `link()` puts that file at the lock path in one step that fails if the lock exists. A lock is stale only
 * when it holds a pid and that process is gone; an empty or unreadable lock belongs to a writer that is mid-start, so it is
 * left alone. Without this, two connectors would race to write the same comments and issues.
 */
import { linkSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

export class LockError extends Error {
  override readonly name = "LockError";
}

export interface Lock {
  release(): void;
}

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};

const read = (path: string): string | null => {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return null;
  }
};

export function acquireLock(path: string): Lock {
  const temp = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(temp, `${process.pid}\n`, { flag: "wx" });
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        linkSync(temp, path);
        let released = false;
        return {
          release() {
            if (released) return;
            released = true;
            if (read(path) === String(process.pid)) {
              try {
                unlinkSync(path);
              } catch {
                // already gone
              }
            }
          },
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const held = read(path);
        const pid = held !== null && /^\d+$/.test(held) ? Number(held) : 0;
        if (held === null) continue; // vanished between link and read: try again
        if (pid <= 0) throw new LockError("The GitHub connector's lock file is being written or is unreadable. If no connector is running, delete it and start again.");
        if (alive(pid)) throw new LockError(`The GitHub connector is already running for this setup (process ${pid}). Stop it first; only one may write to GitHub.`);
        // Stale: remove it only if it still names the dead pid, then try the atomic link again.
        if (read(path) === held) {
          try {
            unlinkSync(path);
          } catch {
            // someone else took it over first; try again
          }
        }
      }
    }
    throw new LockError("The GitHub connector could not take its lock file. Check that no other connector is starting.");
  } finally {
    try {
      unlinkSync(temp);
    } catch {
      // already gone
    }
  }
}

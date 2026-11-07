/**
 * One connector per setup. An exclusive pid file (`O_EXCL`) at `<root>/run/connector.lock`; a file left by a process that
 * no longer exists is taken over. Without this, two connectors would race to write the same comments and issues.
 */
import { closeSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";

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

export function acquireLock(path: string): Lock {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const fd = openSync(path, "wx");
      writeSync(fd, `${process.pid}\n`);
      closeSync(fd);
      let released = false;
      return {
        release() {
          if (released) return;
          released = true;
          try {
            if (Number(readFileSync(path, "utf8").trim()) === process.pid) unlinkSync(path);
          } catch {
            // already gone
          }
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const pid = Number((() => { try { return readFileSync(path, "utf8").trim(); } catch { return ""; } })());
      if (Number.isInteger(pid) && pid > 0 && alive(pid)) throw new LockError(`The GitHub connector is already running for this setup (process ${pid}). Stop it first; only one may write to GitHub.`);
      try {
        unlinkSync(path);
      } catch {
        // someone else took it over first; try again
      }
    }
  }
  throw new LockError("The GitHub connector could not take its lock file. Check that no other connector is starting.");
}

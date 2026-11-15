/**
 * A separate process for the store lock tests: it tries the store's lock file and prints one line. HELD means it holds the lock and keeps
 * it until its stdin closes; REFUSED means another start holds it. Used by test/desk-store-lock-file.test.ts.
 */
import { acquireStoreLockFile, DeskAlreadyRunning, releaseStoreLockFile } from "../../src/capabilities/desk-lock.ts";

const store = process.argv[2];
if (store === undefined) throw new Error("usage: store-lock-holder.ts <store path>");
try {
  const lock = await acquireStoreLockFile(store);
  console.log("HELD");
  await Bun.stdin.text(); // returns when the test closes this process's stdin
  await releaseStoreLockFile(lock);
} catch (error) {
  console.log(error instanceof DeskAlreadyRunning ? "REFUSED" : `ERROR ${String(error)}`);
}

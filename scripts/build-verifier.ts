/**
 * Build the vetted `horizon-verify-intent` verifier as one self-contained binary and print its sha256, the
 * digest an operation binding pins (HORIZON-001 1.1.0, REQ-NAV-011).
 *
 *   bun run scripts/build-verifier.ts [--out .horizon/verifiers/horizon-verify-intent]
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const at = process.argv.indexOf("--out");
const out = resolve(at >= 0 && process.argv[at + 1] ? process.argv[at + 1]! : ".horizon/verifiers/horizon-verify-intent");
mkdirSync(dirname(out), { recursive: true });
const built = Bun.spawnSync(["bun", "build", "--compile", "src/verifiers/intent-recorded.ts", "--outfile", out], { stdout: "inherit", stderr: "inherit" });
if (built.exitCode !== 0) process.exit(built.exitCode ?? 1);
const sha256 = createHash("sha256").update(readFileSync(out)).digest("hex");
console.log(JSON.stringify({ artifact: "verifier", path: out, sha256 }));

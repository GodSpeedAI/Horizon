/**
 * INV2 mutation tooth: does the wire scan in check-boundaries.ts reject a hand-written socket client?
 *
 * Copies src/ to a temp directory, requires the clean copy to pass the scan, plants a raw
 * `Bun.connect({ unix: ... })` call (each of the three patterns in turn), and requires the scan to fail
 * on the planted file. Exits non-zero unless every mutant is caught.
 */
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

function scan(copy: string): { code: number; stderr: string } {
  const run = Bun.spawnSync(["bun", "run", join(ROOT, "scripts/check-boundaries.ts"), "--root", copy, "--package", join(ROOT, "package.json")], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  return { code: run.exitCode ?? 1, stderr: run.stderr.toString() };
}

const MUTANTS: readonly { id: string; source: string; file?: string }[] = [
  { id: "raw Bun.connect over a Unix socket", source: 'export const x = Bun.connect({ unix: "/tmp/x.sock", socket: {} });\n' },
  { id: "a Unix-socket address", source: 'export const address = { unix: "/tmp/x.sock" };\n' },
  { id: "a hand-written SFWP message", source: 'export const message = { verb: "authority_request", actor: {} };\n' },
  { id: "a raw Unix-socket call in a nested .tsx file", file: join("ui", "workspace", "deep", "planted-wire.tsx"), source: 'export const x = Bun.connect({ unix: "/tmp/x.sock", socket: {} });\nexport const View = () => null;\n' },
  { id: "the allowed file name in the wrong directory (exceptions are exact paths)", file: join("ui", "sea-forge-wire.ts"), source: 'export const x = Bun.connect({ unix: "/tmp/x.sock", socket: {} });\n' },
];

const failures: string[] = [];
const work = mkdtempSync(join(tmpdir(), "teeth-inv2-"));
try {
  const base = join(work, "clean");
  cpSync(join(ROOT, "src"), join(base, "src"), { recursive: true });
  const control = scan(base);
  if (control.code !== 0) failures.push(`control: the unmutated src/ copy fails the scan:\n${control.stderr}`);
  for (const [index, mutant] of MUTANTS.entries()) {
    const copy = join(work, `mutant-${index}`);
    cpSync(join(ROOT, "src"), join(copy, "src"), { recursive: true });
    const planted = join(copy, "src", mutant.file ?? join("adapters", "planted-wire.ts"));
    mkdirSync(dirname(planted), { recursive: true });
    writeFileSync(planted, mutant.source);
    const result = scan(copy);
    if (result.code === 0 || !result.stderr.includes(planted.slice(copy.length + 1))) failures.push(`NOT CAUGHT: ${mutant.id} (exit ${result.code})`);
    else console.log(`caught: ${mutant.id}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log(`teeth-inv2-mutation: ok (${MUTANTS.length} mutants caught)`);

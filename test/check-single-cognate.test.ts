import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(import.meta.dir, "../scripts/check-single-cognate.ts");
const work = mkdtempSync(join(tmpdir(), "single-cognate-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

function pkg(root: string, rel: string, name: string, version: string): void {
  const dir = join(root, rel);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name, version }));
}
function run(root: string): { code: number; stderr: string } {
  const r = Bun.spawnSync(["bun", "run", SCRIPT, root], { stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode ?? 1, stderr: r.stderr.toString() };
}
function clean(name: string): string {
  const root = join(work, name);
  pkg(root, "node_modules/@godspeedai/cognate-a", "@godspeedai/cognate-a", "0.9.0");
  pkg(root, "node_modules/@godspeedai/cognate-b", "@godspeedai/cognate-b", "0.9.0");
  return root;
}

describe("check-single-cognate", () => {
  test("a clean tree passes", () => {
    expect(run(clean("clean")).code).toBe(0);
  });
  test("a duplicate nested under a scoped cognate package fails", () => {
    const root = clean("scoped");
    pkg(root, "node_modules/@godspeedai/cognate-b/node_modules/@godspeedai/cognate-a", "@godspeedai/cognate-a", "0.9.0");
    const r = run(root);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("@godspeedai/cognate-a installed 2x");
  });
  test("a nested copy at a different version, under an unscoped dependent, fails", () => {
    const root = clean("unscoped");
    pkg(root, "node_modules/other/node_modules/@godspeedai/cognate-a", "@godspeedai/cognate-a", "0.9.1");
    expect(run(root).code).toBe(1);
  });
  test("a duplicate under a scoped non-cognate package fails", () => {
    const root = clean("scoped-other");
    pkg(root, "node_modules/@x/y/node_modules/@godspeedai/cognate-b", "@godspeedai/cognate-b", "0.9.0");
    expect(run(root).code).toBe(1);
  });
});

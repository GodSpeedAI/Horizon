/**
 * Run one deterministic shard of the bun test suite: `bun run scripts/ci-test-shard.ts <index> <count> [-- extra bun test args]`.
 *
 * `--list` prints the shard's files instead of running them. Files are assigned largest first to the least loaded shard
 * (file size stands in for run time), so the split is stable between runs and every file runs in exactly one shard.
 * The file set is bun test's own default discovery pattern.
 */
import { Glob } from "bun";
import { statSync } from "node:fs";

const [indexArg, countArg, ...rest] = process.argv.slice(2);
const index = Number(indexArg);
const count = Number(countArg);
if (!Number.isInteger(index) || !Number.isInteger(count) || count < 1 || index < 1 || index > count) {
  console.error("usage: ci-test-shard.ts <index 1..count> <count> [--list] [-- bun test args]");
  process.exit(2);
}
const list = rest.includes("--list");
const passthrough = rest.includes("--") ? rest.slice(rest.indexOf("--") + 1) : [];

const glob = new Glob("**/*{.test,_test,.spec,_spec}.{ts,tsx,js,jsx,mjs,cjs,mts,cts}");
const skip = /(^|\/)(node_modules|\.git|\.tmp|dist|target)\//;
const files: { path: string; size: number }[] = [];
for (const path of glob.scanSync({ cwd: ".", dot: false })) {
  if (!skip.test(path)) files.push({ path, size: statSync(path).size });
}
files.sort((a, b) => b.size - a.size || (a.path < b.path ? -1 : 1));

const shards = Array.from({ length: count }, () => ({ load: 0, files: [] as string[] }));
for (const f of files) {
  const target = shards.reduce((least, s) => (s.load < least.load ? s : least));
  target.load += f.size;
  target.files.push(f.path);
}
const mine = shards[index - 1]!.files.sort();
if (list) {
  console.log(mine.join("\n"));
  process.exit(0);
}
console.log(`shard ${index}/${count}: ${mine.length} of ${files.length} test files`);
const proc = Bun.spawnSync(["bun", "test", ...passthrough, ...mine.map((p) => (p.startsWith(".") ? p : `./${p}`))], {
  stdio: ["inherit", "inherit", "inherit"],
});
process.exit(proc.exitCode ?? 1);

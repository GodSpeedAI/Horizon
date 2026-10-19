import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface Result {
  readonly exit: number;
  readonly output: string;
}

async function run(command: readonly string[], root = process.cwd()): Promise<Result> {
  const proc = Bun.spawn([...command], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [exit, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { exit, output: `${stdout}${stderr}`.trim() };
}

function tempRoot(name: string): string {
  return mkdtempSync(join(tmpdir(), `horizon-teeth-${name}-`));
}

function copyManifest(root: string): string {
  const path = join(root, "package.json");
  copyFileSync("package.json", path);
  return path;
}

const failures: string[] = [];

function check(id: string, result: Result, needle: string): void {
  const ok = result.exit !== 0 && result.output.includes(needle);
  console.log(`${ok ? "blocked" : "LEAKED"} ${id}: exit=${result.exit}`);
  const diagnostic = result.output.split("\n").filter((line) => /SEMANTIC|RUNTIME|STRUCTURAL|BOUNDARY|forbids|mismatch|missing/.test(line));
  console.log(diagnostic.slice(0, 3).join("\n") || result.output.split("\n").slice(0, 4).join("\n"));
  if (!ok) failures.push(`${id}: expected non-zero exit and "${needle}"`);
}

{
  const root = tempRoot("missing-cognate");
  const manifestPath = copyManifest(root);
  const manifest = JSON.parse(await Bun.file(manifestPath).text()) as { dependencies: Record<string, string> };
  delete manifest.dependencies["@godspeedai/cognate-domainforge"];
  await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  check("missing-cognate-dependency", await run(["bun", "run", join(process.cwd(), "scripts/check-boundaries.ts"), "--root", root, "--package", manifestPath]), "missing required Cognate dependency @godspeedai/cognate-domainforge");
}

{
  check("in-memory-runtime", await run(["bun", "run", "scripts/probe-runtime.ts", "--store", ":memory:"]), "forbids an in-memory runtime");
}

{
  const root = tempRoot("product-model");
  copyManifest(root);
  mkdirSync(join(root, "product-model"), { recursive: true });
  writeFileSync(join(root, "product-model", "process.yaml"), "canonical: product-actualizer\n");
  check("competing-product-model", await run(["bun", "run", join(process.cwd(), "scripts/check-boundaries.ts"), "--root", root]), "competing canonical model/authority store");
}

{
  const root = tempRoot("duplicate-sea");
  copyManifest(root);
  mkdirSync(join(root, ".sea", "interaction"), { recursive: true });
  writeFileSync(join(root, ".sea", "interaction", "interaction-model.sea"), "namespace horizon\n");
  mkdirSync(join(root, "other"), { recursive: true });
  writeFileSync(join(root, "other", "model.sea"), "namespace other\n");
  check("duplicate-semantic-authority", await run(["bun", "run", join(process.cwd(), "scripts/check-boundaries.ts"), "--root", root]), "duplicate semantic authority");
}

{
  check("false-world-ref", await run(["bun", "run", "scripts/probe-world.ts", "--world-ref", "world:horizon@sha256:0000000000000000000000000000000000000000000000000000000000000000"]), "world identity mismatch");
}

if (failures.length > 0) {
  console.error(`\nteeth: ${failures.length} leak(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("\nteeth: all five attacks blocked");

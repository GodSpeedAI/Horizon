import { cpSync, copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface Result {
  readonly exit: number;
  readonly output: string;
}

async function run(command: readonly string[], root = process.cwd()): Promise<Result> {
  // Isolated trees run from a temp directory: keep the pinned world, config and research
  // project but never a stale store file or secret from a previous attack.
  const env = { ...process.env };
  delete env.HORIZON_STORE;
  delete env.HORIZON_CONFIG;
  delete env.HORIZON_SECRET_FILE;
  const proc = Bun.spawn([...command], { cwd: root, env, stdout: "pipe", stderr: "pipe" });
  const [exit, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { exit, output: `${stdout}${stderr}`.trim() };
}

function failedTests(output: string): string[] {
  return output
    .split("\n")
    .filter((line) => line.startsWith("(fail)"))
    .map((line) => line.replace(/^\(fail\) /, "").replace(/ \[[\d.]+ms\]$/, ""));
}

function checkControl(id: string, result: Result): void {
  // Read the summary line: Bun omits per-test "(pass)" lines in some environments (it
  // quiets passing tests when it detects an agent session), but always prints "N pass".
  const passed = Number(result.output.match(/^\s*(\d+) pass$/m)?.[1] ?? 0);
  const ok = result.exit === 0 && passed > 0;
  console.log(`${ok ? "baseline" : "BROKEN"} ${id}: exit=${result.exit}, passed=${passed}`);
  if (!ok) {
    const errors = result.output.split("\n").filter((line) => /Error:|error:|CONFIG:|RESEARCH:|ENOENT/.test(line));
    console.log(errors.slice(0, 4).join("\n") || result.output.split("\n").slice(-8).join("\n"));
    failures.push(`${id}: the control tree must pass before its attack means anything`);
  }
}

function tempRoot(name: string): string {
  return mkdtempSync(join(tmpdir(), `horizon-teeth-${name}-`));
}

function copyManifest(root: string): string {
  const path = join(root, "package.json");
  copyFileSync("package.json", path);
  // The boundary check scans src/ and refuses a root with nothing to scan, so the synthetic root gets a clean src/.
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "placeholder.ts"), "export const placeholder = true;\n");
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
  // A byte-for-byte copy of the full canonical entry *inside* `.sea/` is still a second
  // authority (verdict r2 F6): only the entry's import closure is canonical.
  const root = tempRoot("duplicate-canonical-subtree");
  copyManifest(root);
  cpSync(realpathSync(".sea"), join(root, ".sea"), { recursive: true });
  const control = await run(["bun", "run", join(process.cwd(), "scripts/check-boundaries.ts"), "--root", root]);
  const controlOk = control.exit === 0;
  console.log(`${controlOk ? "baseline" : "BROKEN"} canonical-closure-control: exit=${control.exit}`);
  if (!controlOk) failures.push("canonical-closure-control: the unmodified canonical closure must pass before its attack means anything");
  mkdirSync(join(root, ".sea", "alternative"), { recursive: true });
  copyFileSync(join(root, ".sea", "interaction", "interaction-model.sea"), join(root, ".sea", "alternative", "interaction-model.sea"));
  check("duplicate-canonical-subtree", await run(["bun", "run", join(process.cwd(), "scripts/check-boundaries.ts"), "--root", root]), "duplicate semantic authority at .sea/alternative/interaction-model.sea");
}

{
  check("false-world-ref", await run(["bun", "run", "scripts/probe-world.ts", "--world-ref", "world:horizon@sha256:0000000000000000000000000000000000000000000000000000000000000000"]), "world identity mismatch");
}

/**
 * F1: the structural E2E must fail when the Cognate runtime module is replaced by a
 * memory-only fake. Bun resolves a package by its directory, not by `--preload`, so the
 * attack needs its own dependency tree. The tree is a temporary copy; this repository's
 * `node_modules` is never modified (DEBT D-014).
 *
 * Control first: the same copied tree with the real runtime must pass, otherwise a
 * failing attack would prove nothing about the fake.
 */
async function isolatedTree(): Promise<string> {
  const root = tempRoot("isolated");
  cpSync("node_modules", join(root, "node_modules"), { recursive: true, verbatimSymlinks: true });
  copyFileSync("package.json", join(root, "package.json"));
  copyFileSync("tsconfig.json", join(root, "tsconfig.json"));
  for (const dir of ["src", "test"]) cpSync(dir, join(root, dir), { recursive: true });
  for (const link of ["domain", "config", "research", "cognate.config.ts"]) {
    // Follow the link: `domain/` is an absolute symlink, so copying it verbatim would point
    // back at this repository's tree instead of the isolated copy's.
    cpSync(realpathSync(link), join(root, link), { recursive: true });
  }
  // The configuration points at `.cognate/…`; recreate the directory (never its secrets).
  mkdirSync(join(root, ".cognate"), { recursive: true });
  return root;
}

{
  const root = await isolatedTree();
  try {
    const control = await run(["bun", "test", "test/app.test.ts"], root);
    checkControl("isolated-tree-real-runtime", control);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  const root = await isolatedTree();
  try {
    const target = join(root, "node_modules", "@godspeedai", "cognate-runtime-bun");
    rmSync(target, { recursive: true, force: true });
    cpSync(join(process.cwd(), "scripts", "t04-attacks", "fake-runtime"), target, { recursive: true });
    const attack = await run(["bun", "test", "test/app.test.ts"], root);
    const failed = failedTests(attack.output);
    const ok = attack.exit !== 0 && failed.length > 0;
    console.log(`${ok ? "blocked" : "LEAKED"} fake-runtime-substitution: exit=${attack.exit}, failing=${failed.length}`);
    console.log(failed.slice(0, 4).map((name) => `  fails: ${name}`).join("\n") || attack.output.split("\n").slice(-6).join("\n"));
    if (!ok) failures.push("fake-runtime-substitution: the structural E2E passed against the memory-only fake runtime");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

{
  const root = await isolatedTree();
  try {
    // NE-01: metadata removal must fail closed in the boundary check...
    const manifestPath = join(root, "package.json");
    const manifest = JSON.parse(await Bun.file(manifestPath).text()) as { dependencies: Record<string, string> };
    delete manifest.dependencies["@godspeedai/cognate-domainforge"];
    await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    check(
      "missing-cognate-dependency-metadata",
      await run(["bun", "run", join(process.cwd(), "scripts/check-boundaries.ts"), "--root", root, "--package", manifestPath], root),
      "missing required Cognate dependency @godspeedai/cognate-domainforge",
    );
    // ...and the structural E2E must fail too, although the installed module still resolves:
    // the prereg falsifier is "remove the required Cognate project dependency and the
    // structural E2E still passes" (verdict r2 F1; before revision 3 this arm exited 0).
    const e2e = await run(["bun", "test", "test/app.test.ts"], root);
    const failed = failedTests(e2e.output);
    const ok = e2e.exit !== 0 && failed.some((name) => name.includes("source world -> frame"));
    console.log(`${ok ? "blocked" : "LEAKED"} missing-cognate-dependency-e2e: exit=${e2e.exit}, failing=${failed.length}`);
    if (!ok) failures.push("missing-cognate-dependency-e2e: the structural E2E passed with a required Cognate dependency removed from metadata");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

if (failures.length > 0) {
  console.error(`\nteeth: ${failures.length} leak(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("\nteeth: all attacks blocked");

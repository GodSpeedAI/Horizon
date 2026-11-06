// Asserts exactly one installed copy of each @godspeedai/cognate-* package
// (no nested node_modules duplicates) and that every copy is the same version.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Optional first argument: the project root (default: the current directory). The tests pass a fake tree.
const root = process.argv[2] ?? process.cwd();
const found = new Map<string, string[]>();

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Visit every package directory under one node_modules, scoped or not, and recurse into its own node_modules. */
function walkModules(modules: string): void {
  let entries: string[];
  try {
    entries = readdirSync(modules);
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(modules, e);
    if (!isDir(p)) continue;
    if (e.startsWith("@")) {
      for (const name of readdirSync(p)) visitPackage(join(p, name), `${e}/${name}`);
    } else if (e !== ".bin") {
      visitPackage(p, e);
    }
  }
}

function visitPackage(dir: string, name: string): void {
  if (!isDir(dir)) return;
  if (name.startsWith("@godspeedai/cognate-")) {
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { name: string; version: string };
    found.set(pkg.name, [...(found.get(pkg.name) ?? []), `${pkg.version} @ ${dir}`]);
  }
  walkModules(join(dir, "node_modules"));
}
walkModules(join(root, "node_modules"));

const bad = [...found].filter(([, v]) => v.length !== 1);
if (found.size === 0) {
  console.error("single-cognate: no @godspeedai/cognate-* packages found (vacuous)");
  process.exit(1);
}
if (bad.length > 0) {
  for (const [n, v] of bad) console.error(`single-cognate: ${n} installed ${v.length}x:\n  ${v.join("\n  ")}`);
  process.exit(1);
}
console.log(`single-cognate: ok (${found.size} packages, one copy each)`);

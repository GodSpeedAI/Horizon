// Asserts exactly one installed copy of each @godspeedai/cognate-* package
// (no nested node_modules duplicates) and that every copy is the same version.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const found = new Map<string, string[]>();

function walk(dir: string): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (e === "@godspeedai") {
      for (const name of readdirSync(p)) {
        if (!name.startsWith("cognate-")) continue;
        const pkg = JSON.parse(readFileSync(join(p, name, "package.json"), "utf8")) as { name: string; version: string };
        found.set(pkg.name, [...(found.get(pkg.name) ?? []), `${pkg.version} @ ${join(p, name)}`]);
      }
    } else if (e === "node_modules" || e.startsWith("@")) {
      if (statSync(p).isDirectory()) walk(p);
    } else if (dir.endsWith("node_modules") && statSync(p).isDirectory()) {
      walk(join(p, "node_modules"));
    }
  }
}
walk(join(root, "node_modules"));

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

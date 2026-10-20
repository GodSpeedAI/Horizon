import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { REQUIRED_COGNATE } from "../src/runtime/required-cognate.ts";

const CANONICAL_ENTRY = ".sea/interaction/interaction-model.sea";

const args = process.argv.slice(2);
const rootArg = args.indexOf("--root");
const root = resolve(rootArg >= 0 ? args[rootArg + 1]! : process.cwd());
const packageArg = args.indexOf("--package");
const packagePath = resolve(packageArg >= 0 ? args[packageArg + 1]! : join(root, "package.json"));

const failures: string[] = [];

function fail(message: string): void {
  failures.push(message);
}

function requireCognatePackages(): void {
  let manifest: { dependencies?: Record<string, string> };
  try {
    manifest = JSON.parse(readFileSync(packagePath, "utf8")) as typeof manifest;
  } catch {
    fail(`STRUCTURAL: cannot read package metadata at ${packagePath}`);
    return;
  }
  for (const name of REQUIRED_COGNATE) {
    if (!manifest.dependencies || !(name in manifest.dependencies)) {
      fail(`STRUCTURAL: missing required Cognate dependency ${name}; a mock runtime is not a substitute`);
    }
  }
}

function walk(dir: string, visit: (path: string) => void): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, visit);
    else if (entry.isFile()) visit(path);
  }
}

function rejectCompetingModel(): void {
  const names = new Set(["product-model", "product_model", "actualize-product-model", "product-actualizer"]);
  walk(root, (path) => {
    const rel = relative(root, path);
    if (rel === "node_modules" || rel.startsWith("node_modules/") || rel.startsWith(".git/")) return;
    if (rel.split("/").some((part) => names.has(part))) {
      fail(`BOUNDARY: competing canonical model/authority store at ${rel}`);
    }
    if (rel.startsWith("cockpit/server/")) {
      fail(`BOUNDARY: Product Actualizer server source is not Horizon runtime authority (${rel})`);
    }
  });
  if (existsSync(join(root, "cockpit", "server"))) {
    fail("BOUNDARY: competing canonical model/authority store at cockpit/server");
  }
}

/**
 * The canonical semantic source is the import closure of the entry model, nothing else.
 * Exempting the whole `.sea/` tree let a byte-for-byte copy at `.sea/alternative/` pass
 * (verdict r2 F6), so every `.sea` file outside that closure is a duplicate authority.
 */
function canonicalClosure(): Set<string> {
  const closure = new Set<string>();
  const entry = join(root, CANONICAL_ENTRY);
  if (!existsSync(entry)) return closure;
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.pop()!;
    const rel = relative(root, file).split("\\").join("/");
    if (closure.has(rel)) continue;
    if (!existsSync(file)) {
      fail(`BOUNDARY: canonical model imports a missing file ${rel}`);
      continue;
    }
    closure.add(rel);
    for (const match of readFileSync(file, "utf8").matchAll(/^\s*import\b[^\n]*?\bfrom\s+"([^"]+\.sea)"/gm)) {
      pending.push(resolve(dirname(file), match[1]!));
    }
  }
  return closure;
}

function rejectDuplicateSemanticAuthority(): void {
  const closure = canonicalClosure();
  walk(root, (path) => {
    if (!path.endsWith(".sea")) return;
    const rel = relative(root, path).split("\\").join("/");
    if (rel.startsWith("node_modules/") || rel.startsWith(".git/") || rel.startsWith(".cognate/")) return;
    if (rel.startsWith(".agents/") || rel.startsWith(".tmp/") || rel.startsWith("research/.venv/")) return;
    if (closure.has(rel)) return;
    fail(`BOUNDARY: duplicate semantic authority at ${rel}; the canonical model is the import closure of ${CANONICAL_ENTRY}`);
  });
}

function requireCanonicalDomainLink(): void {
  const domain = join(root, "domain");
  if (!existsSync(domain) && failures.length === 0 && root === resolve(process.cwd())) {
    fail("BOUNDARY: domain/ is missing; it must link to .sea/interaction");
    return;
  }
  if (!existsSync(domain)) return;
  const stat = lstatSync(domain);
  if (!stat.isSymbolicLink()) {
    fail("BOUNDARY: domain/ must be a symlink to .sea/interaction, not a copied semantic tree");
    return;
  }
  const target = realpathSync(domain);
  const expected = realpathSync(join(root, ".sea", "interaction"));
  if (target !== expected) fail(`BOUNDARY: domain/ points to ${target}, expected ${expected}`);
}

function rejectImports(): void {
  const forbidden = /(?:product-actualizer|product-model|cockpit\/server)/;
  for (const dir of ["src", "test"]) {
    walk(join(root, dir), (path) => {
      if (!/\.(ts|tsx|js|mjs)$/.test(path)) return;
      const text = readFileSync(path, "utf8");
      if (forbidden.test(text)) fail(`BOUNDARY: forbidden import or authority reference in ${relative(root, path)}`);
    });
  }
}

function enforceDirection(): void {
  const rules: readonly { dir: string; forbidden: RegExp }[] = [
    { dir: "src/domain", forbidden: /from\s+["'][^"']*\.\.\/(adapters|runtime|capabilities)/ },
    { dir: "src/ui", forbidden: /from\s+["'][^"']*\.\.\/(adapters|runtime)/ },
    { dir: "src/config", forbidden: /from\s+["'][^"']*\.\.\/(adapters|runtime)/ },
  ];
  for (const rule of rules) {
    walk(join(root, rule.dir), (path) => {
      if (!path.endsWith(".ts")) return;
      if (rule.forbidden.test(readFileSync(path, "utf8"))) {
        fail(`BOUNDARY: ${rule.dir} may not depend on a higher adapter/runtime layer (${relative(root, path)})`);
      }
    });
  }
}

requireCognatePackages();
rejectCompetingModel();
rejectDuplicateSemanticAuthority();
requireCanonicalDomainLink();
rejectImports();
enforceDirection();

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log(`boundaries: ok (${relative(process.cwd(), root) || "."})`);

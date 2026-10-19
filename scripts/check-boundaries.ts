import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const REQUIRED_COGNATE = [
  "@godspeedai/cognate-cli",
  "@godspeedai/cognate-domainforge",
  "@godspeedai/cognate-runtime-bun",
  "@godspeedai/cognate-projections",
  "@godspeedai/cognate-kernel-api",
];

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

function rejectDuplicateSemanticAuthority(): void {
  walk(root, (path) => {
    if (!path.endsWith(".sea")) return;
    const rel = relative(root, path).split("\\").join("/");
    if (rel.startsWith("node_modules/") || rel.startsWith(".git/") || rel.startsWith(".cognate/")) return;
    if (rel.startsWith(".agents/") || rel.startsWith(".tmp/") || rel.startsWith("research/.venv/")) return;
    if (rel.startsWith(".sea/")) return;
    fail(`BOUNDARY: duplicate semantic authority at ${rel}; canonical model lives under .sea/`);
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

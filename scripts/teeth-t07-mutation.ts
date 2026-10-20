/**
 * T07 mutation teeth: do the negative tests reject a violating controller?
 *
 * `check-t07-prereg-coverage` proves only that each registered expectation is named by a test.
 * This script proves strength for the mutations below: it breaks one property in a throwaway copy
 * of the tree, runs the *named* test, and requires that test to fail by assertion. A compile error
 * or a missing test does not count as a caught mutant.
 *
 * What a passing run means: these eleven hypotheses survived. It is P2 evidence, not a claim that
 * every arbitrary violation would be detected.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const SOURCE = "src/domain/navigation.ts";
const POSITIVE = "test/navigation-controller.test.ts";
const NEGATIVE = "test/navigation-negative.test.ts";

interface Mutant {
  readonly id: string;
  readonly expectation: string;
  readonly testFile: string;
  readonly title: string;
  readonly find: string;
  readonly replace: string;
}

const MUTANTS: readonly Mutant[] = [
  {
    id: "M1 conflicts and failures collapse into available",
    expectation: "PE-01",
    testFile: POSITIVE,
    title: "PE-01",
    find: 'conflicts.length > 0 ? "conflicted" : blockers.some((blocker) => blocker.severity === "blocked") ? "blocked" : blockers.length > 0 ? "unknown" : "available";',
    replace: '"available";',
  },
  {
    id: "M2 an optional-only case is forced to produce a primary",
    expectation: "NE-02",
    testFile: NEGATIVE,
    title: "NE-02",
    find: "const primary = validate ? (availableMoves[0] ?? null) : null;",
    replace: "const primary = availableMoves[0] ?? null;",
  },
  {
    id: "M3 unknown authority is treated as available",
    expectation: "NE-04",
    testFile: NEGATIVE,
    title: "NE-04",
    find: '} else if (outcome === "unreachable" || outcome === "unknown") {',
    replace: "} else if (false) {",
  },
  {
    id: "M4 a blocked gate may drop its material reason",
    expectation: "NE-03",
    testFile: NEGATIVE,
    title: "NE-03",
    find: 'if (verdict !== "pass" && (typeof entry["reason"] !== "string" || (entry["reason"] as string).trim() === "")) {',
    replace: "if (false) {",
  },
  {
    id: "M5 requires_approval is treated as a pass",
    expectation: "NE-05",
    testFile: NEGATIVE,
    title: "NE-05",
    find: '} else if (outcome === "requires_approval") {',
    replace: "} else if (false) {",
  },
  {
    id: "M6 non-canonical gate keys are accepted",
    expectation: "NE-06",
    testFile: NEGATIVE,
    title: "NE-06",
    find: "if (extra.length > 0) fail(`gates carry non-canonical keys: ${extra.join(\", \")}`);",
    replace: "if (false) fail(`gates carry non-canonical keys: ${extra.join(\", \")}`);",
  },
  {
    id: "M7 a case may omit its world anchor",
    expectation: "NE-07",
    testFile: NEGATIVE,
    title: "NE-07",
    find: 'nonEmpty(record["world_ref"], "world_ref");',
    replace: 'void record["world_ref"];',
  },
  {
    id: "M8 settlement becomes required without an authorized judgment",
    expectation: "NE-08",
    testFile: NEGATIVE,
    title: "NE-08",
    find: "const shouldSettleNow = settlementReachable && validate && authorized;",
    replace: "const shouldSettleNow = settlementReachable && validate;",
  },
  {
    id: "M9 a blocked choice becomes selectable",
    expectation: "NE-09",
    testFile: NEGATIVE,
    title: "NE-09",
    find: "if (!choice.selectable) {",
    replace: "if (false) {",
  },
  {
    id: "M10 a frame is returned unfrozen",
    expectation: "NE-10",
    testFile: NEGATIVE,
    title: "NE-10",
    find: "return deepFreezeFrame(frame);",
    replace: "return frame;",
  },
  {
    id: "M11 a stale frame revision is accepted",
    expectation: "NE-11",
    testFile: NEGATIVE,
    title: "NE-11",
    find: "if (revision !== frame.revision) {",
    replace: "if (false) {",
  },
];

function copyTree(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t07-mutation-"));
  for (const entry of ["src", "test", "package.json", "tsconfig.json", "node_modules"]) {
    const from = path.join(ROOT, entry);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(dir, entry), { recursive: true, verbatimSymlinks: true });
  }
  fs.cpSync(fs.realpathSync(path.join(ROOT, "domain")), path.join(dir, "domain"), { recursive: true });
  return dir;
}

function applyMutant(dir: string, mutant: Mutant): string | null {
  const target = path.join(dir, SOURCE);
  const source = fs.readFileSync(target, "utf8");
  if (!source.includes(mutant.find)) return `the mutation site no longer exists in ${SOURCE} — the tooth is stale`;
  fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
  return null;
}

function runTest(dir: string, testFile: string, title: string): { readonly passed: boolean; readonly output: string } {
  const result = Bun.spawnSync(["bun", "test", testFile, "-t", title, "--timeout", "60000"], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = `${result.stdout.toString()}${result.stderr.toString()}`;
  return { passed: result.exitCode === 0 && /(^|\s)[1-9]\d* pass/.test(output), output };
}

function isAssertionFailure(output: string): boolean {
  return /error: expect\(|\(fail\)/.test(output) && !/SyntaxError|Cannot find|Unhandled error|Expected ";"|TS\d{4}/.test(output);
}

let failures = 0;
const report = (line: string): void => console.log(`  ${line}`);

const baseline = new Map<string, boolean>();
function baselinePasses(dir: string, testFile: string, title: string): boolean {
  const key = `${testFile}#${title}`;
  const cached = baseline.get(key);
  if (cached !== undefined) return cached;
  const result = runTest(dir, testFile, title);
  baseline.set(key, result.passed);
  if (!result.passed) report(`FAIL baseline ${key}\n${result.output}`);
  return result.passed;
}

for (const mutant of MUTANTS) {
  const dir = copyTree();
  try {
    if (!baselinePasses(dir, mutant.testFile, mutant.title)) {
      failures += 1;
      report(`FAIL ${mutant.expectation} (${mutant.id}): baseline does not pass, so the mutant is not evidence`);
      continue;
    }
    const problem = applyMutant(dir, mutant);
    if (problem !== null) {
      failures += 1;
      report(`FAIL ${mutant.expectation} (${mutant.id}): ${problem}`);
      continue;
    }
    const result = runTest(dir, mutant.testFile, mutant.title);
    if (result.passed) {
      failures += 1;
      report(`FAIL ${mutant.expectation} (${mutant.id}): the named test still passed against the mutation`);
    } else if (!isAssertionFailure(result.output)) {
      failures += 1;
      report(`FAIL ${mutant.expectation} (${mutant.id}): mutated run failed without an assertion\n${result.output}`);
    } else {
      report(`ok   ${mutant.expectation} (${mutant.id}): ${mutant.title} failed by assertion`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log(failures === 0 ? `teeth-t07-mutation: ok — ${MUTANTS.length} mutants caught` : `teeth-t07-mutation: FAIL — ${failures} problem(s)`);
process.exit(failures === 0 ? 0 : 1);

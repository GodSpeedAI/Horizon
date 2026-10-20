/**
 * T06 mutation teeth: do the negative tests *reject a violating implementation*?
 *
 * The T05 lesson (in this repository, not in theory): a test that names an id and an anchor can
 * still pass against an implementation that violates the property. `check-t06-prereg-coverage`
 * proves linkage only. This script proves strength for the specific mutations below: it breaks one
 * property, runs the *named* test, and requires that test to fail.
 *
 * Each mutant runs in a throwaway copy of `src/`, `test/` and the trusted context, so nothing is
 * written to the real tree. A mutant only counts when the baseline passes and the mutated tree
 * fails *by assertion* — a compile error would also exit non-zero, and is reported separately.
 *
 * What a passing run means: these hypotheses survived. It does not mean an arbitrary violating
 * implementation would be caught. That is P2 evidence, and no more.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const MARKER = "// MUTATED: teeth-t06-mutation";

interface Mutant {
  readonly id: string;
  /** The prereg property the mutant breaks. */
  readonly property: string;
  /** The expectation whose test must catch it. */
  readonly expectation: string;
  /** The test file that claims the expectation; the mutant must be caught in that file. */
  readonly testFile: string;
  readonly file: string;
  readonly find: string;
  readonly replace: string;
}

const QUERY = "src/adapters/operational-objects.ts";
const NEGATIVE = "test/operational-objects-negative.test.ts";
const POSITIVE = "test/operational-objects.test.ts";

const MUTANTS: readonly Mutant[] = [
  {
    id: "M1 a denied scope answers with an empty set instead of denying",
    property: "A denied observer is disclosed nothing, and never receives an empty set that implies the absence of objects (NE-01).",
    expectation: "NE-01",
    testFile: NEGATIVE,
    file: QUERY,
    find: 'return { ok: false, status: "denied", code: "scope", reason: "the observer\'s scope covers none of the requested object types", checkpoint_ref: checkpoint, observer_state: state };',
    // The classic collapse: treat "you may see nothing" as "there is nothing".
    replace: 'return { ok: true, status: "empty", items: [], checkpoint_ref: checkpoint, observer_state: state, degraded: [] };',
  },
  {
    id: "M2 an unavailable source is reported as an empty result",
    property: "A source that is down is `unavailable`, never `empty` (NE-02, PE-07).",
    expectation: "NE-02",
    testFile: NEGATIVE,
    file: QUERY,
    find: 'return { ok: false, status: "unavailable", code: "scope", reason: `source ${source.source} is unavailable: ${source.reason}`, checkpoint_ref: checkpoint, observer_state: state };',
    replace: 'return { ok: true, status: "empty", items: [], checkpoint_ref: checkpoint, observer_state: state, degraded: [] };',
  },
  {
    id: "M3 traversal accepts a missing bound and proceeds unbounded",
    property: "An unbounded traversal is refused before any work (NE-03, PE-06).",
    expectation: "NE-03",
    testFile: NEGATIVE,
    file: QUERY,
    find: '  if (missing.length > 0) {',
    // The default that the prereg forbids: assume a bound instead of requiring one.
    replace: '  if (false) {',
  },
  {
    id: "M4 the recorder accepts a dangling link endpoint",
    property: "A link whose endpoint is not a projected object is refused at record time (NE-04).",
    expectation: "NE-04",
    testFile: NEGATIVE,
    file: QUERY,
    find: '      throw new OperationalObjectError("dangling", `link endpoint ${endpoint} is not a projected object`);',
    replace: '      continue;',
  },
  {
    id: "M5 a mismatched checkpoint is answered from the current state",
    property: "A query at a checkpoint that is not the projection state is refused, not answered (NE-05).",
    expectation: "NE-05",
    testFile: NEGATIVE,
    file: QUERY,
    find: '  if (options.checkpoint_ref !== undefined && options.checkpoint_ref !== checkpoint) {',
    replace: '  if (false) {',
  },
  {
    id: "M6 the recorder accepts a semantic import edge as an operational link",
    property: "The operational link set refuses an import edge by kind (NE-06).",
    expectation: "NE-06",
    testFile: NEGATIVE,
    file: QUERY,
    find: '  if (!world.relations.has(link.relation_type)) {',
    replace: '  if (false) {',
  },
  {
    id: "M7 an object may be recorded into a world it was not validated against",
    property: "A record whose world does not match the declared world is refused (NE-07).",
    expectation: "NE-07",
    testFile: NEGATIVE,
    file: QUERY,
    find: '  if (world.world_ref !== worldRef) {',
    replace: '  if (false) {',
  },
  {
    id: "M8 object queries return store order instead of `object_ref` order",
    property: "Results are ordered by `object_ref`, so the same events produce the same sequence (NE-09, PE-06).",
    expectation: "NE-09",
    testFile: NEGATIVE,
    file: QUERY,
    find: '  const items = [...filtered].sort((left, right) => (left.object_ref < right.object_ref ? -1 : left.object_ref > right.object_ref ? 1 : 0));',
    // Store order is not `object_ref` order in general (keys are prefixed and, for another store,
    // may be returned in another order). Returning it unsorted is the defect NE-09 forbids.
    replace: '  const items = [...filtered].reverse();',
  },
];

function copyTree(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t06-mutation-"));
  for (const entry of ["src", "test", "package.json", "tsconfig.json", "node_modules"]) {
    const from = path.join(ROOT, entry);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(dir, entry), { recursive: true, verbatimSymlinks: true });
  }
  // `domain` is a symlink to `.sea/interaction` in the real tree. Copying it verbatim would leave a
  // dangling link in the temp tree, so the semantic world is copied resolved.
  fs.cpSync(fs.realpathSync(path.join(ROOT, "domain")), path.join(dir, "domain"), { recursive: true });
  return dir;
}

/** Apply one mutant. Returns null on success, or the reason it could not be applied. */
function applyMutant(dir: string, mutant: Mutant): string | null {
  const target = path.join(dir, mutant.file);
  const source = fs.readFileSync(target, "utf8");
  if (!source.includes(mutant.find)) return `the mutation site no longer exists in ${mutant.file} — the tooth is stale`;
  fs.writeFileSync(target, `${source.replace(mutant.find, mutant.replace)}\n${MARKER}\n`);
  return null;
}

/** Run one test file filtered to a title fragment; zero matches must not count as a pass. */
function runTest(dir: string, testFile: string, titleFragment: string): { readonly passed: boolean; readonly output: string } {
  const result = Bun.spawnSync(["bun", "test", testFile, "-t", titleFragment, "--timeout", "60000"], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = `${result.stdout.toString()}${result.stderr.toString()}`;
  return { passed: result.exitCode === 0 && /(^|\s)[1-9]\d* pass/.test(output), output };
}

/** An assertion failure is evidence; a compile error or crash is not. */
function isAssertionFailure(output: string): boolean {
  return /error: expect\(|\(fail\)/.test(output) && !/SyntaxError|Cannot find|Unhandled error|Expected ";"|TS\d{4}/.test(output);
}

let failures = 0;
const report = (line: string): void => console.log(`  ${line}`);

for (const mutant of MUTANTS) {
  const dir = copyTree();
  try {
    const baseline = runTest(dir, mutant.testFile, mutant.expectation);
    if (!baseline.passed) {
      failures += 1;
      report(`FAIL ${mutant.id}: baseline for '${mutant.expectation}' does not pass in the copy, so the tooth distinguishes nothing`);
      continue;
    }
    const problem = applyMutant(dir, mutant);
    if (problem !== null) {
      failures += 1;
      report(`FAIL ${mutant.id}: ${problem}`);
      continue;
    }
    const mutated = runTest(dir, mutant.testFile, mutant.expectation);
    if (mutated.passed) {
      failures += 1;
      report(`FAIL ${mutant.id}: '${mutant.expectation}' still passes with ${mutant.property} violated — the test does not detect it`);
    } else if (!isAssertionFailure(mutated.output)) {
      failures += 1;
      report(`FAIL ${mutant.id}: the mutated tree failed without a failed assertion, so the tooth proves nothing`);
      report(
        mutated.output
          .split("\n")
          .filter((line) => /error/i.test(line))
          .slice(0, 3)
          .map((line) => `       ${line.trim()}`)
          .join("\n"),
      );
    } else {
      report(`ok   ${mutant.id} → caught by the ${mutant.expectation} test`);
      if (process.argv.includes("--verbose")) {
        report(
          mutated.output
            .split("\n")
            .filter((line) => /error: expect|Expected|Received/.test(line))
            .slice(0, 4)
            .map((line) => `       ${line.trim()}`)
            .join("\n"),
        );
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log(
  failures === 0
    ? `teeth-t06-mutation: ok (${MUTANTS.length} mutants, each caught by a failing assertion in the test that claims the property)`
    : `teeth-t06-mutation: ${failures} failure(s)`,
);
process.exit(failures === 0 ? 0 : 1);


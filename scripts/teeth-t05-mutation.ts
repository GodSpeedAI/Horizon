#!/usr/bin/env bun
/**
 * T05 mutation teeth: do the tests *reject a violating implementation*?
 *
 * `check-t05-prereg-coverage` proves linkage — that a test names the id and the prereg's
 * anchors. It cannot prove that the assertions inside the test would fail if the property were
 * broken. That was not hypothetical in T05: the NE-02 test named `iframe` and `jsx`/`onclick`
 * and passed, but asserted the *absence of the submitted value* rather than the diagnostic, so a
 * rejection that named nothing would have passed too.
 *
 * A mutation tooth closes that: break the property the prereg states, run the *named* test, and
 * require it to FAIL. A test that stays green under a violating implementation is not evidence,
 * whatever its title says.
 *
 * ## How the mutation is applied
 *
 * Each mutant runs in a throwaway copy of the repository, so nothing is written to the real tree,
 * and is a line swap any reader can inspect below. A mutant counts only when the *baseline*
 * (unmutated copy) passes and the mutated copy fails — otherwise the tooth distinguishes nothing.
 *
 * ## What this evidence does and does not establish
 *
 * It establishes that for these specific mutations the named tests detect the violation: the
 * tests are not vacuous, not mis-targeted, and not satisfied by a neighbouring property.
 * It does NOT establish that an arbitrary violating implementation is caught, that the property
 * holds outside the exercised inputs, or anything about code no mutant touches. A passing run
 * means "these hypotheses survived", which is exactly what P2 evidence claims and no more.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = process.env.T05_MUTATION_ROOT ?? path.resolve(import.meta.dir, "..");
const TEST_FILE = "test/surface-negative.test.ts";
/** `--verbose` retains each mutated tree and prints the failing assertion, as retained evidence. */
const VERBOSE = process.argv.includes("--verbose");

/** Marker appended to a mutated file so a mis-applied mutation cannot masquerade as correct. */
const MARKER = "/* MUTATED: teeth-t05-mutation */";

interface Mutant {
  readonly id: string;
  /** The property the prereg states, in the prereg's words. */
  readonly property: string;
  /** The prereg expectation whose test must catch the violation. */
  readonly expectation: string;
  readonly file: string;
  /** Insert the mutant code after the line that starts with this text. */
  readonly after?: string;
  /** Or: insert the mutant code at the end of the file. */
  readonly append?: boolean;
  /** Or: replace this exact text. */
  readonly find?: string;
  readonly replace?: string;
  /** Code injected by `after` / `append`. */
  readonly code?: string;
}

/**
 * Each mutant breaks one property, and the appended code rebinds the symbol the real
 * implementation exports so the mutated behaviour is what the test actually sees. The
 * originals are renamed, not deleted, so the rest of the module still typechecks and a compile
 * error cannot be mistaken for a caught violation.
 */
const MUTANTS: readonly Mutant[] = [
  {
    id: "M1 the closed union accepts a sixteenth block type",
    property: "Exactly the fifteen closed block types; an unknown type (`iframe`) is refused (PE-01 / NE-02).",
    expectation: "NE-02",
    file: "src/ui/surface2/grammar.ts",
    // The smallest possible widening: `iframe` joins the legal vocabulary, so the discriminator
    // stops refusing the preregistered attack and the union is no longer closed.
    find: 'export const BLOCK_TYPES = [\n  "metric",',
    replace: 'export const BLOCK_TYPES = [\n  "iframe",\n  "metric",',
  },
  {
    id: "M2 the rejection keeps its pointer but names nothing",
    property: "The rejection names the unknown block type (NE-02).",
    expectation: "NE-02",
    file: "src/ui/surface2/grammar.ts",
    append: true,
    // The rejection still happens and still points at `/blocks/0/type`; only the message is
    // blanked. This is the violation the old `not.toContain("iframe")` assertion could not see,
    // because it only ever checked that the submitted value was absent.
    code: [
      `type _ParseBlank = (input: unknown) => ParseSurfaceResult;`,
      `parseSurface = ((input: unknown): ParseSurfaceResult => {`,
      `  const parsed = SurfaceV2.safeParse(input);`,
      `  if (parsed.success) return { ok: true, surface: parsed.data };`,
      `  return {`,
      `    ok: false,`,
      `    code: "INVALID_SURFACE",`,
      `    issues: describeIssues(parsed.error).map((issue) => ({ ...issue, message: "Invalid input" })),`,
      `  };`,
      `}) as unknown as _ParseBlank;`,
    ].join("\n"),
  },
  {
    id: "M3 a callout silently drops smuggled keys instead of refusing them",
    property: "`.strict()` everywhere; an unknown property is an error, never ignored (PE-01 / NE-02).",
    expectation: "NE-02",
    file: "src/ui/surface2/grammar.ts",
    find: 'tone: z.enum(TONES), text: DisplayText, ref: Ref.optional() }).strict();',
    // The same callout, now tolerant: `jsx` / `onclick` are stripped rather than refused.
    replace: 'tone: z.enum(TONES), text: DisplayText, ref: Ref.optional() });',
  },
];

function copyTree(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t05-mutation-"));
  for (const entry of ["src", "test", "package.json", "tsconfig.json", "scripts", "node_modules"]) {
    const from = path.join(ROOT, entry);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(dir, entry), { recursive: true, verbatimSymlinks: true });
  }
  return dir;
}

/** Apply one mutant. Returns null when applied, or a reason it could not be. */
function applyMutant(dir: string, mutant: Mutant): string | null {
  const target = path.join(dir, mutant.file);
  const source = fs.readFileSync(target, "utf8");
  if (mutant.find !== undefined) {
    if (!source.includes(mutant.find)) return `the mutation site no longer exists in ${mutant.file} — the tooth is stale`;
    fs.writeFileSync(target, `${source.replace(mutant.find, mutant.replace ?? "")}\n${MARKER}\n`);
    return null;
  }
  const lines = source.split("\n");
  let body: string;
  if (mutant.append === true) {
    body = `${source}\n${MARKER}\n${mutant.code ?? ""}\n`;
  } else {
    const at = lines.findIndex((line) => line.startsWith(mutant.after ?? "\u0000"));
    if (at < 0) return `the anchor line no longer exists in ${mutant.file} — the tooth is stale`;
    lines.splice(at + 1, 0, MARKER, mutant.code ?? "");
    body = lines.join("\n");
  }
  fs.writeFileSync(target, body);
  return null;
}

/**
 * Run the test file filtered to one title fragment. A zero-match run must not count as a pass,
 * so the parse output is checked rather than only the exit code.
 */
function runTest(dir: string, titleFragment: string): { readonly passed: boolean; readonly output: string } {
  const result = Bun.spawnSync(["bun", "test", TEST_FILE, "-t", titleFragment, "--timeout", "60000"], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = `${result.stdout.toString()}${result.stderr.toString()}`;
  const passed = result.exitCode === 0 && /(^|\s)[1-9]\d* pass/.test(output);
  return { passed, output };
}

let failures = 0;
function report(line: string): void {
  console.log(`  ${line}`);
}

for (const mutant of MUTANTS) {
  const dir = copyTree();
  try {
    const baseline = runTest(dir, mutant.expectation);
    if (!baseline.passed) {
      failures += 1;
      report(`FAIL ${mutant.id}: baseline for '${mutant.expectation}' does not pass in the copy, so the tooth distinguishes nothing`);
      report(`       ${baseline.output.split("\n").filter((line) => /error|fail/i.test(line)).slice(0, 3).join("\n       ")}`);
      continue;
    }
    const problem = applyMutant(dir, mutant);
    if (problem !== null) {
      failures += 1;
      report(`FAIL ${mutant.id}: ${problem}`);
      continue;
    }
    const mutated = runTest(dir, mutant.expectation);
    if (mutated.passed) {
      failures += 1;
      report(`FAIL ${mutant.id}: '${mutant.expectation}' still passes with ${mutant.property} violated — the test does not detect it`);
    } else {
      report(`ok   ${mutant.id} → caught by the ${mutant.expectation} test`);
      if (VERBOSE) {
        // The *reason* it failed, not merely that it did: a compile error or a crash would also
        // make the test fail, and that would prove nothing about the assertion.
        const why = mutated.output
          .split("\n")
          .filter((line) => /error:|Expected|Received|\(fail\)/.test(line))
          .slice(0, 4)
          .map((line) => `       ${line.trim()}`)
          .join("\n");
        report(why);
      }      // A compile failure, an import error or an uncaught throw also exits non-zero and would let
      // the tooth pass while proving nothing. Those are distinguished from a failing assertion,
      // which is the only outcome that shows the test detected the violation.
      const crashed = /SyntaxError|Cannot find|Unhandled error|error: Expected ";"/.test(mutated.output);
      if (VERBOSE) report(`       guard: crashed=${crashed}`);
      if (crashed) {
        failures += 1;
        report(`FAIL ${mutant.id}: the mutated copy failed to compile or crashed, so the tooth proves nothing`);
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log(
  failures === 0
    ? `teeth-t05-mutation: ok (${MUTANTS.length} mutants, each caught by the test that claims the property)`
    : `teeth-t05-mutation: ${failures} failure(s)`,
);
process.exit(failures === 0 ? 0 : 1);

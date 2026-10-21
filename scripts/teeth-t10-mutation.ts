/**
 * T10 mutation teeth: do the negative tests reject a violating debugger?
 *
 * The teeth suite passing against the real code proves only that the code currently agrees with
 * it. This script breaks one protected property at a time in a throwaway copy of the tree, runs the
 * *named* tooth, and requires that tooth to fail by assertion. A compile error, a crash, or a
 * missing test does not count as a caught mutant — those would be noise, not detection.
 *
 * What a passing run means: these ten hypotheses were caught. It is P2 evidence for strength, not a
 * claim that every arbitrary violation would be detected.
 *
 * Bounded on purpose: each mutant runs one named test under a memory cap, so a runner is never
 * handed a whole-suite bill.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const TEST_FILE = "test/retrieval-debugger-teeth.test.ts";

interface Mutant {
  readonly id: string;
  readonly expectation: string;
  /** Files to mutate, as [path, find, replace] triples. */
  readonly edits: readonly (readonly [string, string, string])[];
}

const MUTANTS: readonly Mutant[] = [
  {
    id: "M1 retrieved text is promoted out of the untrusted class",
    expectation: "NE-01",
    edits: [["src/ui/workspace/inspect.ts", 'class: "untrusted_reference" as const,', 'class: "recorded" as const,']],
  },
  {
    id: "M2 a proposal is presented as recorded authority",
    expectation: "NE-02",
    edits: [["src/domain/debugger.ts", 'value("authority", "possibility", "derived", "counterfactual:authority")', 'value("authority", "available", "derived", "counterfactual:authority")']],
  },
  {
    id: "M3 an empty replay selection is reported as a pass",
    expectation: "NE-07",
    edits: [["src/domain/debugger.ts", 'values.push(value("outcome", "not-selected", "derived", "replay:rule:empty-selection"));', 'values.push(value("outcome", "pass", "derived", "replay:rule:empty-selection"));']],
  },
  {
    id: "M4 a failing expectation is reported as a pass",
    expectation: "NE-07",
    edits: [["src/domain/debugger.ts", 'failing.length === 0 ? "pass" : "fail"', '"pass"']],
  },
  {
    id: "M5 the node cap truncates silently instead of stating the fold",
    expectation: "NE-06",
    edits: [["src/domain/debugger.ts", 'values.push(value("folded", `${folded} reachable node(s) folded beyond max_nodes=${nodes}`, "derived", "impact:node-cap"));', ""]],
  },
  {
    id: "M6 an undeclared relation type is traversed anyway",
    expectation: "NE-06",
    edits: [["src/domain/debugger.ts", "if (typeof relation !== \"string\" || !declared.has(relation)) {", "if (false) {"]],
  },
  {
    id: "M7 an unbounded traversal is allowed to default",
    expectation: "NE-06",
    edits: [["src/domain/debugger.ts", "if (depth === undefined || nodes === undefined) {", "if (false) {"]],
  },
  {
    id: "M8 the adapter silently drops the operation's own arguments",
    expectation: "NE-02",
    edits: [["src/ui/workspace/inspect.ts", "const extra = (request.arguments ?? {}) as Record<string, unknown>;", "const extra = {} as Record<string, unknown>;"]],
  },
  {
    id: "M9 an unreadable checkpoint is reported as readable with no rows",
    expectation: "NE-08",
    edits: [["src/app.ts", "if (!read.ok) return { ok: false };", "if (!read.ok) return { ok: true, objects: [], links: [] };"]],
  },
  {
    id: "M10 a cross-checkpoint read is labelled as the current checkpoint",
    expectation: "NE-08",
    edits: [["src/ui/workspace/inspect.ts", "compared_checkpoint: answer.scope.comparison ?? answer.scope.checkpoint_ref,", "compared_checkpoint: answer.scope.checkpoint_ref,"]],
  },
  {
    // The prereg's own NE-09 attack: put a direct Context Kernel client back into the tree.
    id: "M11 the debugger surface imports the Context Kernel client directly",
    expectation: "NE-09",
    edits: [["src/ui/workspace/inspect.ts", 'import { runDebugger,', 'import { createContextKernelAdapter } from "../../adapters/context-kernel.ts";\nimport { runDebugger,']],
  },
];

function copyTree(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t10-mutation-"));
  for (const entry of ["src", "test", "package.json", "tsconfig.json", "node_modules"]) {
    const from = path.join(ROOT, entry);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(dir, entry), { recursive: true, verbatimSymlinks: true });
  }
  // The pinned semantic world is read from disk; without it every test fails at boot.
  const world = path.join(ROOT, "domain");
  if (fs.existsSync(world)) fs.cpSync(fs.realpathSync(world), path.join(dir, "domain"), { recursive: true });
  for (const entry of ["config"]) {
    const from = path.join(ROOT, entry);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(dir, entry), { recursive: true, verbatimSymlinks: true });
  }
  return dir;
}

function applyMutant(dir: string, mutant: Mutant): string | null {
  for (const [file, find, replace] of mutant.edits) {
    const target = path.join(dir, file);
    const source = fs.readFileSync(target, "utf8");
    if (!source.includes(find)) return `the mutation site no longer exists in ${file} — the tooth is stale`;
    fs.writeFileSync(target, source.replace(find, replace));
  }
  return null;
}

function runTest(dir: string, title: string): { readonly passed: boolean; readonly output: string } {
  const result = Bun.spawnSync(["bun", "test", TEST_FILE, "-t", title, "--timeout", "60000"], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = `${result.stdout.toString()}${result.stderr.toString()}`;
  // Bun prints `   1 pass` / `   0 fail`; match word boundaries, not "0 filter".
  const passed = Number(/(\d+) pass/.exec(output)?.[1] ?? "0");
  const failed = Number(/(\d+) fail/.exec(output)?.[1] ?? "0");
  return { passed: result.exitCode === 0 && passed > 0 && failed === 0, output };
}

/** A caught mutant fails by assertion; a crash or a compile error is not detection. */
function isAssertionFailure(output: string): boolean {
  return /error: expect\(/.test(output) && !/SyntaxError|Cannot find|Unhandled error|Expected ";"/.test(output);
}

/** NE-06 and PE-14 share a test; run the titled tooth and require the assertion to be the failure. */
function titleFor(expectation: string): string {
  return expectation;
}

let failures = 0;
const report = (line: string): void => console.log(`  ${line}`);
const baselines = new Map<string, boolean>();

function baselinePasses(dir: string, title: string): boolean {
  const cached = baselines.get(title);
  if (cached !== undefined) return cached;
  const result = runTest(dir, title);
  baselines.set(title, result.passed);
  if (!result.passed) report(`FAIL baseline ${title}\n${result.output.slice(-2000)}`);
  return result.passed;
}

for (const mutant of MUTANTS) {
  const dir = copyTree();
  try {
    const title = titleFor(mutant.expectation);
    if (!baselinePasses(dir, title)) {
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
    const result = runTest(dir, title);
    if (result.passed) {
      failures += 1;
      report(`FAIL ${mutant.expectation} (${mutant.id}): the tooth passed against a broken debugger`);
    } else if (!isAssertionFailure(result.output)) {
      failures += 1;
      report(`FAIL ${mutant.expectation} (${mutant.id}): failed without an assertion — not evidence\n${result.output.slice(-1500)}`);
    } else {
      report(`ok   ${mutant.expectation} (${mutant.id}): caught`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (failures === 0) console.log(`teeth-t10-mutation: ok — ${MUTANTS.length} mutants caught`);
else console.log(`teeth-t10-mutation: FAIL — ${failures} problem(s)`);
process.exit(failures === 0 ? 0 : 1);

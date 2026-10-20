#!/usr/bin/env bun
/**
 * T05 prereg-coverage teeth: the coverage check must reject a drifted test map, not merely
 * pass today.
 *
 * The check earned its place by catching a real drift — a test named `NE-02` asserting a
 * different attack than the prereg's. A check that found that once but cannot find it again is
 * theatre, so each tooth plants a drift in a throwaway tree and asserts the check names it.
 * `ACCEPT` shows the negative space: a correctly retitled test passes, so the check is not
 * simply rejecting everything.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkPreregCoverage } from "./check-t05-prereg-coverage.ts";

const ROOT = path.resolve(import.meta.dir, "..");

let failures = 0;

function report(line: string): void {
  console.log(`  ${line}`);
}

/**
 * Build the matcher for a tooth's expected message.
 *
 * A regex *literal* cannot carry an apostrophe (it would be read as the end of a string), and
 * the messages under test quote test titles. Constructing the pattern keeps the expectation
 * readable and unescaped, and a typo fails loudly here rather than silently matching nothing.
 */
function matcher(pattern: string): RegExp {
  return new RegExp(pattern);
}

/** A throwaway tree carrying the real prereg, justfile and one test file we control. */
function plant(testSource: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t05-coverage-tooth-"));
  for (const relative of [".agents/prereg/horizon/T05.prereg.yaml", "justfile"]) {
    fs.mkdirSync(path.dirname(path.join(dir, relative)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, relative), path.join(dir, relative));
  }
  fs.mkdirSync(path.join(dir, "test"), { recursive: true });
  fs.writeFileSync(path.join(dir, "test/surface-negative.test.ts"), testSource);
  return dir;
}

interface Tooth {
  readonly id: string;
  /**
   * The drift, applied to the repository's real test map. A tooth must replay the *editing
   * act* a human would make — retitling the test, deleting it, deleting a gate — because
   * appending a second title does not drift anything: the check asks whether *a* test names
   * the id, and the real one still does.
   */
  readonly mutate: (source: string, justfile?: never) => string;
  readonly expect: RegExp;
  /** A planted tree the check should accept: the negative space of the rule. */
  readonly accept?: boolean;
}

const TEETH: readonly Tooth[] = [
  {
    // The exact drift T05 shipped: the title claims NE-02, and the test asserts something
    // real, but not the preregistered `iframe` / `jsx` / `onclick` attack.
    id: "NE-C1 the shipped NE-02 mislabel is caught when reintroduced",
    mutate: (source) =>
      source.replace(
        /test\("NE-02[^"]*"/,
        'test("NE-02 rejects an agent-supplied value dressed as a boundary fact"',
      ),
    expect: matcher("NE-02: test 'NE-02 rejects an agent-supplied value dressed as a boundary fact' does not name the prereg attack"),
  },
  {
    // The other half of the shipped drift: NE-03 had no test at all, at any point.
    id: "NE-C2 a preregistered id with no test is rejected",
    mutate: (source) => source.replace(/test\("NE-03[^"]*"/, 'test("an unauthorized action is refused"'),
    expect: matcher("NE-03: no test or tooth names this id"),
  },
  {
    // A renamed id anywhere: the label no longer matches the expectation it claimed.
    id: "NE-C3 renaming an id so it names no expectation is rejected",
    // NE-09 is named by exactly one test, so renaming it must leave the id unattached.
    mutate: (source) => source.replace(/test\("NE-09[^"]*"/, 'test("transports agree"'),
    expect: matcher("NE-09: no test or tooth names this id"),
  },
  {
    // The gate proof is checked, not assumed: a renamed gate target fails the claim.
    id: "NE-C4 a renamed gate target is rejected",
    mutate: (source) => source,
    expect: matcher("PE-07: gate target '(gate-t05|verify)' is not defined"),
  },
  {
    // Negative space: the repository's real map is accepted, so the check rejects drift and
    // not everything.
    id: "NE-C0 the repository's real test map is accepted",
    mutate: (source) => source,
    expect: matcher("T05 prereg coverage: ok"),
    accept: true,
  },
];

for (const tooth of TEETH) {
  const real = fs.readFileSync(path.join(ROOT, "test/surface-negative.test.ts"), "utf8");
  const mutated = tooth.mutate(real);
  // A mutation that silently no-ops would make the tooth pass vacuously.
  if (tooth.accept !== true && mutated === real && !tooth.id.startsWith("NE-C4")) {
    failures += 1;
    report(`FAIL ${tooth.id}: the mutation changed nothing; the tooth is stale`);
    continue;
  }
  const dir = plant(mutated);
  try {
    if (tooth.id.startsWith("NE-C4")) {
      const file = path.join(dir, "justfile");
      fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/^gate-t05:/m, "gate-t05-renamed:"));
    }
    const result = checkPreregCoverage(dir);
    const matched = result.messages.some((message) => tooth.expect.test(message));
    const pass = tooth.accept === true ? result.ok : !result.ok && matched;
    if (!pass) {
      failures += 1;
      report(`FAIL ${tooth.id}: ${result.ok ? "accepted" : `wrong reason: ${result.messages.filter((m) => m.trim().startsWith("FAIL ")).join("; ")}`}`);
    } else {
      report(`ok   ${tooth.id}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log(failures === 0 ? `teeth-t05-coverage: ok (${TEETH.length} teeth)` : `teeth-t05-coverage: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);

#!/usr/bin/env bun
/**
 * Shape-check teeth: `check-prereg-shape` must reject the T05 defect, not merely pass T06.
 *
 * Each tooth plants a defect in a throwaway copy of the T06 prereg and asserts the check names it.
 * `ACCEPT` is the negative space: the real file passes, so the check is not rejecting everything.
 *
 * NE-S3 is the important one. It plants the *exact* T05 shape — the expectation blocks written on
 * indented lines beneath a folded `confirmation_condition` — into a file that is otherwise valid.
 * If the check cannot see that, it cannot protect the next task from repeating the defect.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkPreregShape } from "./check-prereg-shape.ts";

const ROOT = path.resolve(import.meta.dir, "..");
const PREREG = ".agents/prereg/horizon/T06.prereg.yaml";

interface Tooth {
  readonly id: string;
  readonly mutate: (source: string) => string;
  readonly expect: RegExp;
  readonly accept?: boolean;
}

const TEETH: readonly Tooth[] = [
  {
    // The exact T05 defect: move PE-10's block into the folded scalar.
    id: "NE-S1 the T05 folded-scalar defect is rejected",
    mutate: (source) => {
      const block = [
        "  confirmation_condition: >-",
        "    T06 is P2.",
        "",
        "    - id: PE-10",
        "      expectation: >-",
        "        Observer state is preserved.",
        "",
      ].join("\n");
      return source
        .replace(/  confirmation_condition: >-\n(?:\s{4}.*\n)+/, block)
        .replace(/\n    - id: PE-10\n      expectation: >-\n(?:\s{6}.*\n)+/, "\n");
    },
    expect: /PE-10 appear on `- id:` lines inside a block scalar/,
  },
  {
    // A section that is prose at all: every member is invisible to a parser.
    id: "NE-S2 a sequence section replaced by a string is rejected",
    mutate: (source) => source.replace(/\n  positive_expectations:\n(?:.*\n)*?(?=\n  negative_expectations:)/, "\n  positive_expectations: >-\n    All ten expectations are described here.\n"),
    expect: /positive_expectations` is a string, not a sequence/,
  },
  {
    // A typo'd section name is an absent section pretending to be an empty one.
    id: "NE-S3 a typo'd section key is rejected",
    mutate: (source) => source.replace("  negative_expectations:", "  negative_expectation:"),
    expect: /unknown top-level key `negative_expectation`/,
  },
  {
    // Duplicate ids make a test's claim ambiguous.
    id: "NE-S4 a duplicate id is rejected",
    mutate: (source) => source.replace("    - id: PE-02", "    - id: PE-01"),
    expect: /positive_expectations declares PE-01 twice/,
  },
  {
    // An id referenced by the falsifier but never registered.
    id: "NE-S5 a referenced-but-unregistered id is rejected",
    mutate: (source) => source.replace("  falsifier: >-\n", "  falsifier: >-\n    See PE-11. "),
    expect: /PE-11 are referenced in the document but are not registered members/,
  },
  {
    // Negative space.
    id: "NE-S0 the real T06 preregistration is accepted",
    mutate: (source) => source,
    expect: /prereg shape: ok/,
    accept: true,
  },
];

let failures = 0;
for (const tooth of TEETH) {
  const real = fs.readFileSync(path.join(ROOT, PREREG), "utf8");
  const mutated = tooth.mutate(real);
  if (tooth.accept !== true && mutated === real) {
    failures += 1;
    console.log(`  FAIL ${tooth.id}: the mutation changed nothing; the tooth is stale`);
    continue;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t06-shape-tooth-"));
  try {
    fs.mkdirSync(path.join(dir, path.dirname(PREREG)), { recursive: true });
    fs.writeFileSync(path.join(dir, PREREG), mutated);
    const result = checkPreregShape(PREREG, dir, { quiet: true });
    const matched = result.messages.some((message) => tooth.expect.test(message));
    const pass = tooth.accept === true ? result.ok : !result.ok && matched;
    if (!pass) {
      failures += 1;
      console.log(`  FAIL ${tooth.id}: ${result.ok ? "accepted" : `wrong reason: ${result.messages.filter((m) => m.includes("FAIL")).join("; ")}`}`);
    } else {
      console.log(`  ok   ${tooth.id}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log(failures === 0 ? `teeth-t06-shape: ok (${TEETH.length} teeth)` : `teeth-t06-shape: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);

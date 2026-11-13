#!/usr/bin/env bun
/**
 * The round-3 remediation unit's prereg → test linkage.
 *
 * The task preregistration's coverage check (scripts/check-t23-prereg-coverage.ts) and the two
 * earlier unit checks are left as recorded. This unit is a separate preregistration file with its
 * own expectation ids, so it needs its own check: every expectation it registers must be named by
 * exactly one test title in the unit's test file, and every expectation id a title in that file
 * names must be registered here. A title that names an id nobody registered is a prediction that
 * no check proves.
 *
 * The link is necessary but not sufficient: it proves an expectation is exercised, not that the
 * assertion inside rejects a violating implementation. The mutation teeth are what prove that,
 * and they live in the test file itself: where a check can be made to fail by a small mutation of
 * the contract, the mutation is made in a throwaway tree and the check is required to notice.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { checkPreregShape } from "./check-prereg-shape.ts";

const PREREG = ".agents/prereg/horizon/STAGE-0A-REMEDIATION-2.prereg.yaml";
const TEST_FILES = ["test/identity-remediation-2.test.ts"];

interface CoverageResult {
  readonly ok: boolean;
  readonly registered: number;
  readonly linked: number;
  readonly failures: readonly string[];
}

export function checkRemediation2PreregCoverage(root: string = process.cwd()): CoverageResult {
  const failures: string[] = [];
  const ok = (message: string): void => console.log(`  ok   ${message}`);
  const fail = (message: string): void => {
    failures.push(message);
    console.log(`  FAIL ${message}`);
  };
  const shape = checkPreregShape(PREREG, root, { quiet: true });
  for (const message of shape.messages) console.log(message);
  if (!shape.ok) return { ok: false, registered: 0, linked: 0, failures: ["prereg shape failed"] };
  const document = Bun.YAML.parse(readFileSync(path.join(root, PREREG), "utf8")) as {
    preregistration: Record<string, unknown>;
  };
  const registered: string[] = [];
  for (const section of ["positive_expectations", "negative_expectations"] as const) {
    const entries = document.preregistration[section];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const id = (entry as Record<string, unknown>)["id"];
      if (typeof id === "string") registered.push(id);
    }
  }
  const titles: string[] = [];
  for (const file of TEST_FILES) {
    const target = path.join(root, file);
    if (!existsSync(target)) {
      fail(`${file}: does not exist`);
      continue;
    }
    for (const match of readFileSync(target, "utf8").matchAll(/\btest\(\s*"([^"]+)"/g)) {
      titles.push(match[1] as string);
    }
  }
  let linked = 0;
  for (const id of registered) {
    const named = titles.filter((title) => new RegExp(`\\b${id}\\b`).test(title));
    if (named.length === 1) {
      linked += 1;
      ok(`${id}: named by exactly one test title`);
    } else if (named.length === 0) {
      fail(`${id}: no test title names this expectation`);
    } else {
      fail(`${id}: ${named.length} test titles name this expectation (expected one)`);
    }
  }
  const known = new Set(registered);
  for (const title of titles) {
    for (const match of title.matchAll(/\b(PE|NE)-(\d+)\b/g)) {
      const id = `${match[1]}-${match[2]}`;
      if (!known.has(id)) {
        fail(`test title names ${id}, which this unit's prereg does not register: ${title}`);
      }
    }
  }
  if (failures.length === 0) {
    console.log(`check-stage0a-remediation-2-prereg-coverage: ok — ${linked} expectations linked to named tests`);
  }
  return { ok: failures.length === 0, registered: registered.length, linked, failures };
}

if (import.meta.main) {
  const result = checkRemediation2PreregCoverage();
  process.exit(result.ok ? 0 : 1);
}

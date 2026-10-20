#!/usr/bin/env bun
/**
 * T07 prereg → test *linkage*.
 *
 * The shape check runs first: a preregistration whose expectations a parser cannot see would make
 * any count meaningless (DEC-T05-09). This check then requires that every registered expectation
 * id is named by a test title in the declared files. It does not prove the assertions inside reject
 * a violating controller — `teeth-t07-mutation` does that.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { checkPreregShape } from "./check-prereg-shape.ts";

const PREREG = ".agents/prereg/horizon/T07.prereg.yaml";
const TEST_FILES = ["test/navigation-controller.test.ts", "test/navigation-negative.test.ts"];

interface CoverageResult {
  readonly ok: boolean;
  readonly registered: number;
  readonly failures: readonly string[];
}

export function checkPreregCoverage(root: string = process.cwd()): CoverageResult {
  const failures: string[] = [];
  const ok = (message: string): void => console.log(`  ok   ${message}`);
  const fail = (message: string): void => {
    failures.push(message);
    console.log(`  FAIL ${message}`);
  };

  const shape = checkPreregShape(PREREG, root, { quiet: true });
  for (const message of shape.messages) console.log(message);
  if (!shape.ok) return { ok: false, registered: 0, failures: ["prereg shape failed"] };

  const preregPath = path.join(root, PREREG);
  const document = Bun.YAML.parse(readFileSync(preregPath, "utf8")) as { preregistration: Record<string, unknown> };
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
    const source = readFileSync(target, "utf8");
    for (const match of source.matchAll(/\btest\(\s*"([^"]+)"/g)) titles.push(match[1] as string);
  }

  for (const id of registered) {
    const named = titles.filter((title) => new RegExp(`\\b${id}\\b`).test(title));
    if (named.length === 1) ok(`${id}: named by exactly one test title`);
    else if (named.length === 0) fail(`${id}: no test title names this expectation`);
    else fail(`${id}: ${named.length} test titles name this expectation (expected one)`);
  }

  const known = new Set(registered);
  for (const title of titles) {
    for (const match of title.matchAll(/\b(PE|NE)-(\d+)\b/g)) {
      const id = `${match[1]}-${match[2]}`;
      if (!known.has(id)) fail(`test title names ${id}, which the prereg does not register: ${title}`);
    }
  }

  if (failures.length === 0) console.log(`check-t07-prereg-coverage: ok — ${registered.length} expectations linked to named tests`);
  return { ok: failures.length === 0, registered: registered.length, failures };
}

if (import.meta.main) {
  const result = checkPreregCoverage();
  process.exit(result.ok ? 0 : 1);
}

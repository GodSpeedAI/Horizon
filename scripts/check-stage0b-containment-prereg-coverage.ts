#!/usr/bin/env bun
/**
 * The Stage 0B containment unit's prereg → test linkage.
 *
 * Every expectation the unit registers must be named by exactly one test title across the unit's
 * test files, and every expectation id a title names must be registered here. The link proves an
 * expectation is exercised, not that its assertion rejects a violating implementation; the mutation
 * teeth in scripts/teeth-t23-mutation.ts prove that.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { checkPreregShape } from "./check-prereg-shape.ts";

const PREREG = ".agents/prereg/horizon/STAGE-0B-CONTAINMENT.prereg.yaml";
const TEST_FILES = ["test/pending-confirmations.test.ts", "test/containment-routes.test.ts"];

interface CoverageResult {
  readonly ok: boolean;
  readonly registered: number;
  readonly linked: number;
  readonly failures: readonly string[];
}

export function checkStage0bContainmentPreregCoverage(root: string = process.cwd()): CoverageResult {
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
      if (!known.has(id)) fail(`test title names ${id}, which this unit's prereg does not register: ${title}`);
    }
  }
  if (failures.length === 0) {
    console.log(`check-stage0b-containment-prereg-coverage: ok — ${linked} expectations linked to named tests`);
  }
  return { ok: failures.length === 0, registered: registered.length, linked, failures };
}

if (import.meta.main) {
  const result = checkStage0bContainmentPreregCoverage();
  process.exit(result.ok ? 0 : 1);
}

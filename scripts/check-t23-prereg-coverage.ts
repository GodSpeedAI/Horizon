#!/usr/bin/env bun
/**
 * T23 prereg → test *linkage*, and the task's settlement-target check.
 *
 * The shape check runs first: a preregistration whose expectations a parser cannot see would make
 * any count meaningless (DEC-T05-09). This check then requires that every Stage 0A expectation is
 * named by exactly one test title in the declared files. It does not prove the assertions inside
 * reject a violating implementation — the negative expectations are proved by the assertions
 * themselves, and the mutation teeth come with the later stages.
 *
 * Expectations for later stages are registered now and reported OPEN. They are not waived: a
 * later stage that ships without its expectations being exercised cannot claim the task settled.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { checkPreregShape } from "./check-prereg-shape.ts";

const PREREG = ".agents/prereg/horizon/T23.prereg.yaml";
const TEST_FILES = ["test/identity-contract.test.ts", "test/identity-records.test.ts"];
const STAGE_UNDER_TEST = "0A";

interface CoverageResult {
  readonly ok: boolean;
  readonly registered: number;
  readonly linked: number;
  readonly open: readonly string[];
  readonly failures: readonly string[];
}

export function checkPreregCoverage(root: string = process.cwd()): CoverageResult {
  const failures: string[] = [];
  const open: string[] = [];
  const ok = (message: string): void => console.log(`  ok   ${message}`);
  const fail = (message: string): void => {
    failures.push(message);
    console.log(`  FAIL ${message}`);
  };

  const shape = checkPreregShape(PREREG, root, { quiet: true });
  for (const message of shape.messages) console.log(message);
  if (!shape.ok) return { ok: false, registered: 0, linked: 0, open: [], failures: ["prereg shape failed"] };

  const preregPath = path.join(root, PREREG);
  const document = Bun.YAML.parse(readFileSync(preregPath, "utf8")) as { preregistration: Record<string, unknown> };
  const registered: string[] = [];
  const stages = new Map<string, string>();
  for (const section of ["positive_expectations", "negative_expectations"] as const) {
    const entries = document.preregistration[section];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const id = (entry as Record<string, unknown>)["id"];
      if (typeof id !== "string") continue;
      registered.push(id);
      const stage = (entry as Record<string, unknown>)["stage"];
      stages.set(id, typeof stage === "string" ? stage : STAGE_UNDER_TEST);
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

  let linked = 0;
  for (const id of registered) {
    const stage = stages.get(id) ?? STAGE_UNDER_TEST;
    const named = titles.filter((title) => new RegExp(`\\b${id}\\b`).test(title));
    if (stage !== STAGE_UNDER_TEST) {
      if (named.length === 0) {
        open.push(`${id} (stage ${stage})`);
        console.log(`  open ${id}: stage ${stage} is registered and not yet exercised`);
      } else {
        fail(`${id}: registered for stage ${stage} but a Stage ${STAGE_UNDER_TEST} test title names it`);
      }
      continue;
    }
    if (named.length === 1) {
      linked += 1;
      ok(`${id}: named by exactly one test title`);
    } else if (named.length === 0) fail(`${id}: no test title names this expectation`);
    else fail(`${id}: ${named.length} test titles name this expectation (expected one)`);
  }

  const known = new Set(registered);
  for (const title of titles) {
    for (const match of title.matchAll(/\b(PE|NE)-(\d+)\b/g)) {
      const id = `${match[1]}-${match[2]}`;
      if (!known.has(id)) fail(`test title names ${id}, which the prereg does not register: ${title}`);
    }
  }

  // The task's settlement target must be named, and must not be claimed as settled by Stage 0A.
  const targets = document.preregistration["settlement_targets"] as Record<string, unknown> | undefined;
  if (targets === undefined || typeof targets !== "object") {
    fail(`${PREREG}: no settlement_targets block`);
  } else {
    if (targets["task"] !== "T23") fail(`${PREREG}: settlement_targets.task must be T23`);
    const requirements = targets["requirements"];
    if (!Array.isArray(requirements) || requirements.length === 0) {
      fail(`${PREREG}: settlement_targets names no requirement`);
    } else {
      for (const requirement of requirements) {
        const id = (requirement as Record<string, unknown>)["id"];
        const status = (requirement as Record<string, unknown>)["status"];
        if (typeof id !== "string" || !id.startsWith("REQ-")) fail(`${PREREG}: settlement target has no requirement id`);
        if (status !== "open") fail(`${PREREG}: settlement target ${String(id)} must be open until its stage settles it`);
      }
    }
  }
  const settles = document.preregistration["settles"];
  if (!Array.isArray(settles) || settles.length !== 0) {
    fail(`${PREREG}: Stage 0A settles no requirement; \`settles\` must be empty`);
  }

  if (failures.length === 0) {
    console.log(
      `check-t23-prereg-coverage: ok — ${linked} Stage ${STAGE_UNDER_TEST} expectations linked to named tests, ${open.length} later-stage expectations open`,
    );
  }
  return { ok: failures.length === 0, registered: registered.length, linked, open, failures };
}

if (import.meta.main) {
  const result = checkPreregCoverage();
  process.exit(result.ok ? 0 : 1);
}

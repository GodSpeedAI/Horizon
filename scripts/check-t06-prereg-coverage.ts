#!/usr/bin/env bun
/**
 * T06 prereg → test *linkage*.
 *
 * Same contract as the T05 checker, and the same stated limit: this proves that each registered
 * expectation is named by a test whose title also names the prereg's backticked anchors. It does
 * NOT prove that the assertions inside reject a violating implementation — that is
 * `teeth-t06-mutation.ts`'s job, and the summary line printed here says "linkage" for that reason.
 *
 * The prereg is read with a real YAML parser, and a shape failure is a hard failure before any
 * linkage is claimed: a coverage number computed over a section a parser cannot see is worse than
 * no number at all (DEC-T05-09).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { checkPreregShape } from "./check-prereg-shape.ts";

const PREREG = ".agents/prereg/horizon/T06.prereg.yaml";
const TEST_FILES = ["test/operational-objects.test.ts", "test/operational-objects-negative.test.ts"];
const TEETH_FILES = ["scripts/teeth-t06-mutation.ts"];

/** Anchors too generic to prove anything by appearing in a title. */
const IGNORED_ANCHORS = new Set(["true", "false", "null", "undefined", "string", "number"]);

/**
 * Anchors a test title may honestly name in a different vocabulary. Each is a one-way mapping
 * from the prereg literal to the words the title uses, listed so the substitution is reviewable.
 * Substituting a vocabulary is legitimate; substituting a different *property* is not.
 */
const TITLE_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  "no-match": ["no match"],
  "checkpoint_ref": ["checkpoint"],
  "integration_level": ["integration"],
  rebuild_required: ["rebuild"],
};

/**
 * Expectations proven by a gate rather than a test. Every binding is verified against the
 * justfile, so it is a checked claim rather than an exemption.
 */
const GATE_PROVEN: Readonly<Record<string, { readonly targets: readonly string[]; readonly needs: readonly string[] }>> = {};

interface Expectation {
  readonly id: string;
  readonly text: string;
}

export interface CoverageResult {
  readonly ok: boolean;
  readonly registered: number;
  readonly failures: readonly string[];
}

const failures: string[] = [];

function ok(message: string): void {
  console.log(`  ok   ${message}`);
}

function fail(message: string): void {
  failures.push(message);
  console.log(`  FAIL ${message}`);
}

/** Registered members only: the parser decides what an expectation is, not a line pattern. */
export function registeredExpectations(source: string): Expectation[] {
  const prereg = (Bun.YAML.parse(source) as { preregistration?: Record<string, unknown> }).preregistration ?? {};
  const found: Expectation[] = [];
  for (const section of ["positive_expectations", "negative_expectations"] as const) {
    const entries = prereg[section];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const record = entry as Record<string, unknown>;
      const id = typeof record["id"] === "string" ? record["id"] : undefined;
      if (id === undefined) continue;
      // All three text fields, so an anchor stated in `expected` is still required in the title.
      const text = ["expectation", "attack", "expected"].map((field) => record[field]).filter((value): value is string => typeof value === "string").join(" ");
      found.push({ id, text });
    }
  }
  return found;
}

function anchorsOf(text: string): string[] {
  const kept: string[] = [];
  for (const match of text.matchAll(/`([^`]+)`/g)) {
    const anchor = (match[1] ?? "").trim();
    if (anchor === "" || IGNORED_ANCHORS.has(anchor.toLowerCase())) continue;
    if (!kept.includes(anchor)) kept.push(anchor);
  }
  return kept;
}

function covers(title: string, anchor: string): boolean {
  if (title.includes(anchor)) return true;
  return (TITLE_SYNONYMS[anchor] ?? []).some((alias) => title.includes(alias));
}

function gateProof(id: string, binding: { readonly targets: readonly string[]; readonly needs: readonly string[] }, justfile: string): void {
  const lines = justfile.split("\n");
  for (const target of binding.targets) {
    const header = lines.findIndex((line) => new RegExp(`^${target}\\s*:`).test(line));
    if (header < 0) {
      fail(`${id}: gate target '${target}' is not defined in the justfile`);
      continue;
    }
    const recipe: string[] = [];
    for (let cursor = header + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor] ?? "";
      if (line.trim() !== "" && !line.startsWith(" ") && !line.startsWith("\t")) break;
      recipe.push(line);
    }
    const body = recipe.join("\n");
    const missing = binding.needs.filter((need) => !body.includes(need));
    if (missing.length > 0) fail(`${id}: target '${target}' does not invoke [${missing.join(", ")}]`);
    else ok(`${id}: proven by 'just ${target}'`);
  }
}

export function checkPreregCoverage(root: string = process.cwd()): CoverageResult {
  failures.length = 0;

  // Shape first: a coverage number over a section a parser cannot see would be the T05 defect
  // wearing a green tick.
  const shape = checkPreregShape(PREREG, root, { quiet: true });
  if (!shape.ok) {
    for (const message of shape.messages.filter((line) => line.includes("FAIL"))) fail(message.trim().replace(/^FAIL\s+/, ""));
    return { ok: false, registered: 0, failures: [...failures] };
  }

  const at = (relative: string): string => path.join(root, relative);
  const expected = registeredExpectations(readFileSync(at(PREREG), "utf8"));
  if (expected.length === 0) {
    fail(`${PREREG}: no registered expectations — nothing can be covered`);
    return { ok: false, registered: 0, failures: [...failures] };
  }

  const sources = [...TEST_FILES, ...TEETH_FILES]
    .filter((file) => existsSync(at(file)))
    .map((file) => readFileSync(at(file), "utf8"))
    .join("\n");
  const titles = [...sources.matchAll(/(?:test|it)\(\s*"([^"]+)"/g)].map((match) => match[1] as string);
  const justfile = readFileSync(at("justfile"), "utf8");

  for (const expectation of expected) {
    const gate = GATE_PROVEN[expectation.id];
    if (gate !== undefined) {
      gateProof(expectation.id, gate, justfile);
      continue;
    }
    const naming = titles.filter((title) => title.includes(expectation.id));
    if (naming.length === 0) {
      fail(`${expectation.id}: no test or tooth names this id`);
      continue;
    }
    const anchors = anchorsOf(expectation.text);
    if (anchors.length === 0) {
      ok(`${expectation.id}: covered by a test that names the id (the prereg states no literal anchors to re-check)`);
      continue;
    }
    const uncovered = anchors.filter((anchor) => !naming.some((title) => covers(title.toLowerCase(), anchor.toLowerCase())));
    if (uncovered.length > 0) {
      fail(
        `${expectation.id}: test '${naming[0]}' does not name the prereg property — missing [${uncovered.join(", ")}]. ` +
          `Either assert those properties in that test or retitle it (a title is a claim about what the test proves).`,
      );
      continue;
    }
    ok(`${expectation.id}: a test names the id and [${anchors.join(", ")}]`);
  }

  return { ok: failures.length === 0, registered: expected.length, failures: [...failures] };
}

if (import.meta.main) {
  const result = checkPreregCoverage();
  if (!result.ok) {
    console.error(`\nT06 prereg coverage: FAIL (${failures.length})`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`\nT06 prereg linkage: ok (${result.registered} registered expectations, each named by a test that names its anchors)`);
  console.log("  NOTE: linkage only. Whether the assertions reject a violating implementation is");
  console.log("        proven separately by `bun run scripts/teeth-t06-mutation.ts`.");
}


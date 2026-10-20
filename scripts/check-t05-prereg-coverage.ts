#!/usr/bin/env bun
/**
 * T05 prereg → test coverage.
 *
 * The claim T05 settles is not "there are ten tests named NE-01…NE-10". It is that each
 * preregistered expectation was *demonstrated*. A test title is a claim about what the test
 * proves, so it can drift from the prereg while the gate stays green — as it did in T05, where
 * the test named `NE-02` asserted provenance laundering and the preregistered `iframe` /
 * `jsx` / `onclick` attack went untested until it was noticed by reading the file.
 *
 * This check closes that gap structurally rather than by review:
 *
 *   1. Every expectation id in the frozen prereg has a test whose name contains the id.
 *   2. The test name also names the *anchors* the prereg states — the backticked literals in
 *      the attack/expectation text (`iframe`, `jsx`, `onclick`, `javascript:...`, …). A
 *      retitled test therefore cannot quietly claim an id whose attack it does not cover.
 *   3. Extra tests are allowed and unchecked: this proves coverage, not minimality.
 *
 * Anchors are read from the prereg at run time, so amending the prereg in a future task adds
 * required anchors automatically. The prereg is frozen after this task, which is exactly why
 * the anchors are extracted rather than hand-copied into the check.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const PREREG = ".agents/prereg/horizon/T05.prereg.yaml";
const TEST_FILES = ["test/surface-negative.test.ts"];
/** Teeth that carry the cross-transport and route-level halves of a prereg attack. */
const TEETH_FILES = ["scripts/teeth-t05-equivalence.ts"];

/** Anchors too generic to prove anything by appearing in a title. */
const IGNORED_ANCHORS = new Set(["true", "false", "null", "undefined", "string", "number"]);

/**
 * Anchors a test title may honestly name in a different vocabulary than the prereg's.
 *
 * The prereg was written before the implementation settled its names: NE-05 says
 * `view.move` where the closed union has only `horizon.navigate.*`; NE-07 says "record an
 * agent op as `human`" and no test can usefully restate that sentence. Substituting a
 * vocabulary is legitimate; substituting a *different attack* is not, and is what this
 * check exists to catch. Each alias is a one-way mapping from the prereg literal to the
 * name the test title uses, and is listed here so the substitution is reviewable.
 */
const TITLE_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  "view.move": ["layout op", "navigate"],
  "view.pin": ["layout op", "pin"],
  "surface.put": ["layout op", "pin"],
  human: ["attribution", "attributed"],
  "file:../../etc/passwd": ["file:"],
  "horizon:<source>": ["horizon"],
  "semantic:<ref>": ["semantic"],
  "horizon.surface/2": ["surface schema", "schema"],
  "horizon.gui-view/1": ["gui-view"],
  "(state, op) -> {state, result}": ["pure", "reducer"],
  acting_for: ["on_behalf_of", "attribution"],
};

/**
 * Expectations whose proof is a *gate*, not a test: PE-07 says `just gate-t05` and
 * `just verify` exit 0, and PE-08 says the donor/licence check passes. Neither can be a
 * `test("…")`. Each is bound to the targets that actually prove it, and the binding is
 * verified — the target must exist in the justfile and the check script it names must be
 * invoked — so this is a checked claim rather than an exemption.
 */
const GATE_PROVEN: Readonly<Record<string, { readonly targets: readonly string[]; readonly needs: readonly string[] }>> = {
  "PE-07": { targets: ["gate-t05", "verify"], needs: [] },
  "PE-08": { targets: ["check-t05"], needs: ["check-t05-boundaries.ts"] },
};

interface Expectation {
  readonly id: string;
  readonly text: string;
}

export interface CoverageResult {
  readonly ok: boolean;
  /** Every line the check emitted, `ok` and `FAIL`, so a tooth can assert *why* it failed. */
  readonly messages: readonly string[];
}

const failures: string[] = [];
const messages: string[] = [];

function ok(message: string): void {
  messages.push(`  ok   ${message}`);
  console.log(`  ok   ${message}`);
}

function fail(message: string): void {
  failures.push(message);
  messages.push(`  FAIL ${message}`);
  console.log(`  FAIL ${message}`);
}


/**
 * Pull `id` / attack-or-expectation pairs out of the prereg without a YAML dependency.
 *
 * The prereg is authored in one consistent shape (`- id: NE-0N` followed by `attack:` or
 * `expectation:`), and that shape is asserted elsewhere. Reading it this way keeps this check
 * free of a parser whose own version could change under us; if the shape ever changes, the
 * "no expectations parsed" guard fails loudly instead of passing on an empty set.
 */
function expectations(source: string): Expectation[] {
  const found: Expectation[] = [];
  const lines = source.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const idMatch = /^\s*-\s+id:\s*([A-Z]+-\d+)\s*$/.exec(lines[index] ?? "");
    if (idMatch === null) continue;
    const id = idMatch[1] as string;
    let text = "";
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor] ?? "";
      if (/^\s*-\s+id:/.test(line)) break;
      const field = /^\s+(attack|expectation):\s*(.*)$/.exec(line);
      if (field === null) continue;
      const parts = [field[2] ?? ""];
      // A `>-` block: take the indented continuation lines.
      for (let further = cursor + 1; further < lines.length; further += 1) {
        const next = lines[further] ?? "";
        if (next.trim() === "" || /^\s*-\s+id:/.test(next) || /^\s{0,4}[a-z_]+:/.test(next)) break;
        parts.push(next.trim());
      }
      text = parts.join(" ");
      break;
    }
    found.push({ id, text });
  }
  return found;
}

/** The backticked literals a test title must name to claim this expectation. */
function anchorsOf(text: string): string[] {
  const anchors = [...text.matchAll(/`([^`]+)`/g)].map((match) => (match[1] ?? "").trim()).filter(Boolean);
  const kept: string[] = [];
  for (const anchor of anchors) {
    if (IGNORED_ANCHORS.has(anchor.toLowerCase())) continue;
    if (!kept.includes(anchor)) kept.push(anchor);
  }
  return kept;
}

/** A title covers an anchor if it contains it, its distinctive stem, or a listed synonym. */
function covers(title: string, anchor: string): boolean {
  if (title.includes(anchor)) return true;
  if ((TITLE_SYNONYMS[anchor] ?? []).some((alias) => title.includes(alias))) return true;
  // `file:../../etc/passwd` → `file:`; `javascript:...` → `javascript`; `horizon.<source>` → `horizon`.
  const stem = anchor.replace(/\.\.\.$/, "").replace(/\/.*$/, "").replace(/<[^>]*>/g, "").replace(/[:.]$/, "");
  return stem.length >= 3 && title.includes(stem);
}

/**
 * Verify a gate proof: the target exists in the justfile, and every script it names as
 * `needs` is invoked from that target's recipe. A renamed or deleted target fails here
 * instead of leaving an expectation quietly unattached.
 */
function gateProof(id: string, binding: { readonly targets: readonly string[]; readonly needs: readonly string[] }, justfile: string): void {
  const lines = justfile.split("\n");
  for (const target of binding.targets) {
    const header = lines.findIndex((line) => new RegExp(`^${target}\\s*:`).test(line));
    if (header < 0) {
      fail(`${id}: gate target '${target}' is not defined in the justfile`);
      continue;
    }
    // A recipe ends at the first line with no leading indentation.
    const recipe: string[] = [];
    for (let cursor = header + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor] ?? "";
      if (line.trim() !== "" && !line.startsWith(" ") && !line.startsWith("\t")) break;
      recipe.push(line);
    }
    const body = recipe.join("\n");
    for (const need of binding.needs) {
      if (!body.includes(need)) fail(`${id}: target '${target}' does not invoke ${need}`);
    }
    if (binding.needs.length === 0) ok(`${id}: proven by 'just ${target}' (target exists)`);
    else ok(`${id}: proven by 'just ${target}', which invokes [${binding.needs.join(", ")}]`);
  }
}

/**
 * Check one tree. Parameterised by root so the teeth can plant a drift in a throwaway copy
 * and assert this function names it; `main` calls it on the real tree.
 */
export function checkPreregCoverage(root: string = process.cwd()): CoverageResult {
  failures.length = 0;
  messages.length = 0;
  const at = (relative: string): string => path.join(root, relative);
  const prereg = readFileSync(at(PREREG), "utf8");
  const expected = expectations(prereg);
  if (expected.length === 0) {
    fail(`${PREREG}: no expectations parsed — the file shape changed, so this check cannot prove anything`);
  }

  const sources = [...TEST_FILES, ...TEETH_FILES].filter((file) => existsSync(at(file))).map((file) => readFileSync(at(file), "utf8")).join("\n");
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
    const anchorList = anchorsOf(expectation.text);
    if (anchorList.length === 0) {
      ok(`${expectation.id}: covered by '${naming[0]}' (no literal anchors to re-check)`);
      continue;
    }
    const uncovered = anchorList.filter((anchor) => !naming.some((title) => covers(title.toLowerCase(), anchor.toLowerCase())));
    if (uncovered.length > 0) {
      fail(
        `${expectation.id}: test '${naming[0]}' does not name the prereg attack — missing [${uncovered.join(", ")}]. ` +
          `Either assert those attacks in that test or retitle it (a title is a claim about what the test proves).`,
      );
      continue;
    }
    const shown = naming.find((title) => anchorList.every((anchor) => covers(title.toLowerCase(), anchor.toLowerCase()))) ?? (naming[0] as string);
    ok(`${expectation.id}: '${shown.length > 70 ? `${shown.slice(0, 70)}…` : shown}' names [${anchorList.join(", ")}]`);
  }

  // A copy: the module buffers are reused by the next call, so handing them out by reference
  // would make a caller read the following run's messages.
  return { ok: failures.length === 0, messages: [...messages] };
}

if (import.meta.main) {
  const result = checkPreregCoverage();
  if (!result.ok) {
    console.error(`\nT05 prereg coverage: FAIL (${failures.length})`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`\nT05 prereg coverage: ok (each preregistered expectation is named by a test that names its attack)`);
}


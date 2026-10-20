#!/usr/bin/env bun
/**
 * T05 prereg → test *linkage*.
 *
 * ## What this check proves, exactly
 *
 * It proves **linkage**, not strength:
 *
 *   1. Every expectation id the frozen prereg declares has a test whose name contains the id.
 *   2. That test's name also names the *anchors* the prereg states — the backticked literals in
 *      the attack/expectation text (`iframe`, `jsx`, `onclick`, …).
 *   3. The prereg is read with a real YAML parser, and every `PE-`/`NE-` id the file mentions
 *      anywhere must appear as a structured member of `positive_expectations` or
 *      `negative_expectations`. An id that exists only as prose in a scalar is not a
 *      registered expectation, and is reported rather than silently counted.
 *
 * ## What it does NOT prove
 *
 * A title is a claim. This check cannot tell whether the assertions *inside* the test reject a
 * violating implementation — a test that names `NE-02` and `iframe` in its title but asserts
 * nothing about either passes here. It also cannot see a test whose title is accurate while
 * its assertions check something adjacent (the failure mode that motivated this check: NE-02
 * asserted the *absence* of the submitted value rather than the diagnostic).
 *
 * That half is covered separately, by `teeth-t05-mutation.ts`, which mutates the implementation
 * and requires the named test to *fail*. Overstating this file's results is the exact error it
 * was written to catch, so the summary line it prints says "linkage", not "verified".
 *
 * Anchors are read from the prereg at run time, so amending the prereg in a future task adds
 * required anchors automatically.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

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

/** Sidecar that recovers expectations the frozen file declares only as scalar text. */
const INTERPRETATION = ".agents/prereg/horizon/T05.prereg.interpretation.yaml";

interface Expectation {
  readonly id: string;
  readonly text: string;
}

export interface CoverageResult {
  readonly ok: boolean;
  /** Expectations the check actually examined: parsed members plus recovered ones. */
  readonly registered: number;
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
 * Read the prereg with a real YAML parser and return every registered expectation.
 *
 * This replaces an earlier hand-rolled line scanner. The scanner mattered: the frozen T05
 * file's `confirmation_condition` folded scalar swallows the `PE-06` / `PE-07` / `PE-08`
 * `- id:` lines as *text*, so a parser sees five positive expectations where the author
 * registered eight. The scanner counted all eight by reading lines; the parser does not. Both
 * behaviours are wrong to trust silently, so this function does three things:
 *
 *   - enumerates ids from the parsed structure (the authoritative set), and
 *   - finds ids that appear anywhere else in the document as `<PE|NE>-NN` text, and
 *   - returns both, so `checkPreregCoverage` can insist they agree.
 *
 * The frozen artifact is never edited; a disagreement is reported.
 */
export function parsePrereg(source: string): {
  readonly registered: Expectation[];
  readonly unregistered: string[];
  readonly parseError: string | null;
} {
  let document: unknown;
  try {
    document = Bun.YAML.parse(source);
  } catch (error) {
    return { registered: [], unregistered: [], parseError: (error as Error).message };
  }
  const prereg = (document as { preregistration?: Record<string, unknown> } | null)?.preregistration;
  if (prereg === undefined || prereg === null) {
    return { registered: [], unregistered: [], parseError: "no `preregistration` mapping at the document root" };
  }

  const registered: Expectation[] = [];
  for (const section of ["positive_expectations", "negative_expectations"] as const) {
    const entries = prereg[section];
    if (entries === undefined) continue;
    if (!Array.isArray(entries)) {
      return { registered: [], unregistered: [], parseError: `preregistration.${section} is not a sequence` };
    }
    for (const entry of entries) {
      if (typeof entry !== "object" || entry === null) continue;
      const record = entry as Record<string, unknown>;
      const id = typeof record["id"] === "string" ? record["id"] : undefined;
      if (id === undefined) continue;
      const text = (record["attack"] ?? record["expectation"] ?? "") as string;
      registered.push({ id, text: typeof text === "string" ? text : "" });
    }
  }

  const ids = new Set(registered.map((expectation) => expectation.id));
  const unregistered: string[] = [];
  for (const match of source.matchAll(/\b((?:PE|NE)-\d+)\b/g)) {
    const id = match[1] as string;
    if (!ids.has(id) && !unregistered.includes(id)) unregistered.push(id);
  }
  return { registered, unregistered, parseError: null };
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
 * Try to recover one unregistered id from the interpretation sidecar.
 *
 * Returns `"ok"` and appends the expectation when the sidecar restates it, and a reason string
 * otherwise. Every condition is checked, because an interpretation that has drifted from the
 * artifact it interprets is worse than none: the frozen file's hash must match the hash the
 * sidecar quotes, the id must be present in the sidecar as a *non-member* recovered from a named
 * section, and the sidecar must carry the expectation text.
 */
function recoverFromInterpretation(root: string, id: string, into: Expectation[]): string {
  const file = path.join(root, INTERPRETATION);
  if (!existsSync(file)) return `${INTERPRETATION} does not exist`;
  const source = readFileSync(file, "utf8");
  const frozenHash = createHash("sha256").update(readFileSync(path.join(root, PREREG))).digest("hex");
  let sidecar: unknown;
  try {
    sidecar = Bun.YAML.parse(source);
  } catch (error) {
    return `${INTERPRETATION} does not parse: ${(error as Error).message}`;
  }
  const interpretation = (sidecar as { interpretation?: Record<string, unknown> } | null)?.interpretation;
  if (interpretation === undefined || interpretation === null) return `${INTERPRETATION} has no interpretation mapping`;
  if (interpretation["of_sha256"] !== frozenHash) {
    return `${INTERPRETATION} interprets sha256 ${String(interpretation["of_sha256"])}, but the frozen file is ${frozenHash}`;
  }
  const positive = (interpretation["registered_expectations"] as { positive?: unknown } | undefined)?.positive;
  const entries = Array.isArray(positive) ? positive : [];
  const entry = entries.find((candidate) => (candidate as { id?: unknown }).id === id) as
    | { member?: unknown; recovered_from?: unknown; expectation?: unknown }
    | undefined;
  if (entry === undefined) return `${INTERPRETATION} does not recover it`;
  if (entry.member !== false) return `${INTERPRETATION} lists it without member: false, so it claims to be structural`;
  if (typeof entry.recovered_from !== "string" || entry.recovered_from === "") {
    return `${INTERPRETATION} does not say which scalar swallowed it`;
  }
  if (typeof entry.expectation !== "string" || entry.expectation.trim() === "") {
    return `${INTERPRETATION} recovers it without restating the expectation text`;
  }
  into.push({ id, text: entry.expectation });
  ok(`${id}: registered in the frozen file only as text (${entry.recovered_from}); recovered by ${INTERPRETATION}`);
  return "ok";
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
  const parsed = parsePrereg(prereg);
  const expected = [...parsed.registered];

  // Recover expectations the frozen file declares only as scalar text, but *only* through the
  // sidecar that quotes the frozen hash. Recovery is a separate, labelled verdict — never
  // silently merged into the parsed set, which is exactly how PE-06/07/08 came to look covered.
  const unregistered: string[] = [];
  if (parsed.parseError !== null) {
    fail(`${PREREG}: could not be parsed as YAML — ${parsed.parseError}`);
  }
  for (const id of parsed.unregistered) {
    const recovered = recoverFromInterpretation(root, id, expected);
    if (recovered === "ok") continue;
    unregistered.push(id);
    fail(
      `${PREREG}: ${id} appears as text but is not a registered member of ` +
        `positive_expectations/negative_expectations, and ${recovered}. A YAML parser cannot ` +
        `see it, so it is not covered by this check.`,
    );
  }
  if (parsed.parseError === null && expected.length === 0) {
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
  return { ok: failures.length === 0, registered: expected.length, messages: [...messages] };
}

if (import.meta.main) {
  const result = checkPreregCoverage();
  if (!result.ok) {
    console.error(`\nT05 prereg coverage: FAIL (${failures.length})`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`\nT05 prereg linkage: ok (${result.registered} registered expectations, each named by a test that names its anchors)`);
  console.log("  NOTE: linkage only. Whether the assertions reject a violating implementation is");
  console.log("        proven separately by `bun run scripts/teeth-t05-mutation.ts`.");
}


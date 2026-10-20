#!/usr/bin/env bun
/**
 * Preregistration shape check (T06 →).
 *
 * T05's frozen preregistration declared eight positive expectations but registered five: the
 * `PE-06` / `PE-07` / `PE-08` blocks were indented inside the folded `confirmation_condition`
 * scalar and were absorbed as text (DEC-T05-09). Both ways of reading that file were wrong, and
 * both were wrong in the builder's favour: a regex line scan counted all eight, while a strict
 * parser would have silently dropped three predictions.
 *
 * This check exists so a new preregistration cannot repeat it. For a file passed on the command
 * line it requires that the document parses as YAML; that `positive_expectations` and
 * `negative_expectations` are sequences of uniquely-id'd members with text; that no `- id:` line
 * sits inside a block scalar; and that every id token in the document resolves to a member.
 *
 * Unlike T05's coverage check, this one does not guess: it parses, and it fails closed.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT_KEYS = new Set([
  "id",
  "task",
  "title",
  "recorded_at",
  "recorded_before_artifacts",
  "claim",
  "upstream_pins",
  "settles",
  "positive_expectations",
  "negative_expectations",
  "falsifier",
  "known_confounds",
  "evidence_plan",
  "redesign_trigger",
  "confirmation_condition",
  "notes",
]);

export interface ShapeResult {
  readonly ok: boolean;
  readonly messages: readonly string[];
  readonly positive: number;
  readonly negative: number;
  /** Suppress the console echo (teeth inspect `messages` instead of reading stdout). */
  readonly quiet?: boolean;
}

/**
 * Ids a block scalar swallowed: a `- id: PE-06` line that is indented deeper than the key whose
 * value opens the scalar. Detected from the source text rather than from the parse, because the
 * parse is exactly what loses them.
 */
export function idsInsideScalars(source: string): string[] {
  const swallowed: string[] = [];
  let scalarIndent = -1;
  for (const line of source.split("\n")) {
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();
    if (scalarIndent >= 0) {
      if (trimmed !== "" && indent <= scalarIndent) {
        scalarIndent = -1;
      } else {
        const match = /^-\s+id:\s*((?:PE|NE)-\d+)/.exec(trimmed);
        if (match?.[1] !== undefined) swallowed.push(match[1]);
        continue;
      }
    }
    if (/^[A-Za-z_]+:\s*[>|][-+]?\s*$/.test(trimmed)) scalarIndent = indent;
  }
  return swallowed;
}

export function checkPreregShape(file: string, root = process.cwd(), options: { readonly quiet?: boolean } = {}): ShapeResult {
  const messages: string[] = [];
  const failures: string[] = [];
  const ok = (message: string): void => void messages.push(`  ok   ${message}`);
  const fail = (message: string): void => {
    failures.push(message);
    messages.push(`  FAIL ${message}`);
  };

  const target = path.isAbsolute(file) ? file : path.join(root, file);
  if (!existsSync(target)) {
    fail(`${file}: does not exist`);
    return { ok: false, messages, positive: 0, negative: 0 };
  }
  const source = readFileSync(target, "utf8");

  let document: unknown;
  try {
    document = Bun.YAML.parse(source);
  } catch (error) {
    fail(`${file}: does not parse as YAML — ${(error as Error).message}`);
    return { ok: false, messages, positive: 0, negative: 0 };
  }
  const prereg = (document as { preregistration?: Record<string, unknown> } | null)?.preregistration;
  if (prereg === undefined || prereg === null || typeof prereg !== "object") {
    fail(`${file}: no \`preregistration\` mapping at the document root`);
    return { ok: false, messages, positive: 0, negative: 0 };
  }

  for (const key of Object.keys(prereg)) {
    if (!ROOT_KEYS.has(key)) fail(`${file}: unknown top-level key \`${key}\` — a typo here would read as an absent section`);
  }
  if (typeof prereg["falsifier"] !== "string" || (prereg["falsifier"] as string).trim() === "") {
    fail(`${file}: \`falsifier\` must be a non-empty string`);
  }

  const collect = (section: string, prefix: "PE" | "NE"): string[] => {
    const value = prereg[section];
    if (value === undefined) {
      fail(`${file}: \`${section}\` is missing`);
      return [];
    }
    if (typeof value === "string") {
      // The exact T05 shape: a section that reads as prose absorbs its members.
      fail(`${file}: \`${section}\` is a string, not a sequence — its members were swallowed by a block scalar`);
      return [];
    }
    if (!Array.isArray(value)) {
      fail(`${file}: \`${section}\` is not a sequence`);
      return [];
    }
    const ids: string[] = [];
    for (const [index, entry] of value.entries()) {
      if (typeof entry !== "object" || entry === null) {
        fail(`${file}: ${section}[${index}] is not a mapping`);
        continue;
      }
      const record = entry as Record<string, unknown>;
      const id = record["id"];
      if (typeof id !== "string" || !new RegExp(`^${prefix}-\\d+$`).test(id)) {
        fail(`${file}: ${section}[${index}] has no valid \`${prefix}-NN\` id (got ${JSON.stringify(id)})`);
        continue;
      }
      if (ids.includes(id)) fail(`${file}: ${section} declares ${id} twice`);
      ids.push(id);
      // A positive expectation states an `expectation`; a negative one may state `attack` +
      // `expected`. Either way some text must be present.
      const hasText = ["expectation", "attack", "expected"].some((field) => typeof record[field] === "string" && (record[field] as string).trim() !== "");
      if (!hasText) fail(`${file}: ${id} states no expectation/attack/expected text`);
    }
    return ids;
  };

  const positive = collect("positive_expectations", "PE");
  const negative = collect("negative_expectations", "NE");

  // The T05 defect, checked directly rather than inferred from the parse.
  const swallowed = idsInsideScalars(source);
  if (swallowed.length > 0) {
    fail(`${file}: ${swallowed.join(", ")} appear on \`- id:\` lines inside a block scalar — a YAML parser cannot see them as members`);
  }

  const registered = new Set([...positive, ...negative]);
  const tokens = new Set([...source.matchAll(/\b((?:PE|NE)-\d+)\b/g)].map((match) => match[1] as string));
  const dangling = [...tokens].filter((token) => !registered.has(token));
  if (dangling.length > 0) {
    fail(`${file}: ${dangling.join(", ")} are referenced in the document but are not registered members`);
  }

  if (positive.length === 0 && negative.length === 0) fail(`${file}: registers no expectations at all`);
  if (failures.length === 0) {
    ok(`${file}: ${positive.length} positive + ${negative.length} negative expectations are structural members`);
    ok(`${file}: no id is declared only as text, and every id token resolves to a member`);
  }

  if (options.quiet !== true) for (const message of messages) console.log(message);
  return { ok: failures.length === 0, messages, positive: positive.length, negative: negative.length };
}

if (import.meta.main) {
  const file = process.argv[2];
  if (file === undefined) {
    console.error("usage: check-prereg-shape <prereg.yaml>");
    process.exit(2);
  }
  const result = checkPreregShape(file);
  console.log(result.ok ? "prereg shape: ok" : "prereg shape: FAIL");
  process.exit(result.ok ? 0 : 1);
}


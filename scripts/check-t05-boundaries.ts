/**
 * T05 boundary: one grammar, one binder, one reducer, one projection.
 *
 * Horizon's UI authority is only real if nothing grows beside it. This check is mechanical
 * and structural — imports, declarations and sinks, not behaviour — because what it defends
 * is *topology*, and topology is visible in imports:
 *
 *   1. Only `src/ui/surface2/` may name the closed grammar's vocabulary.
 *   2. Route code consumes the projection; it never binds or reduces for itself.
 *   3. `src/ui/surface2/` is a pure island: no Cognate, no Bun runtime, no renderer, no
 *      dynamic code, no raw markup handle, no authority store.
 *   4. `renderText`/`renderHtml` exist only inside the authority AND consume the projection.
 */
import fs from "node:fs";
import path from "node:path";

export interface BoundaryResult {
  readonly ok: boolean;
  readonly failures: readonly string[];
  /** Files actually inspected, so a vacuous pass is visible in the log. */
  readonly inspected: readonly string[];
}

const UI_AUTHORITY = "src/ui/surface2";

/**
 * The one route-facing seam. It composes a frame into a document and projects it for a
 * transport; every other consumer reads the projection, never the binder or the reducer.
 * Naming it here (rather than letting it grow grammar of its own) is why the check can
 * allow it while still rejecting a second one.
 */
const SEAM = "src/ui/surface.ts";

/**
 * The schema version this task settles, spelled once. A second declaration anywhere outside
 * the authority duplicating this exact string is a second grammar, whatever it is named.
 *
 * The terminator is assembled from a character code, for the same reason: what the check
 * forbids must not have to be written down to be detected.
 */
const SCHEMA_VERSION = "horizon.surface" + "/" + "2";
const END_OF_LITERAL = "(?:[" + String.fromCharCode(34, 39) + "]|$)";

/**
 * A literal that *is* the schema version. The scanner reports literal bodies, so the pattern is
 * anchored to the whole body: `"horizon.surface/2"` claims and `"the horizon.surface/2 panel"`
 * only mentions. `String.fromCharCode` supplies the version, because a rule whose source
 * contains the string it hunts would match its own source and could not certify anything.
 */
const schemaClaim = new RegExp("^" + SCHEMA_VERSION + "$");

/**
 * A regex literal that *is* the source-expression pattern: the `semantic:`-prefixed matcher
 * that turns a source string into a world reference. A copy of it anywhere outside the
 * authority is a second binder by other means, which is why the check looks for the pattern's
 * shape rather than for the variable it happens to be stored in.
 */
const SOURCE_PATTERN = "semantic:";
const sourceClaim = new RegExp("^/\\^" + SOURCE_PATTERN + "[^/\\n]*/$");

/**
 * A "set claim" about block kinds, independent of how it is spelled: three or more comma
 * separated entries inside brackets (`["metric", "callout", "table"]`) or a map from block
 * kind to something (`Record<SurfaceBlockKind, string>`). `BLOCK_TYPE_NAMES` below matches
 * the first shape, which is how the check can notice the grammar itself growing.
 */
const BLOCK_KIND_SET = String.raw`\[(?:[^\]\n]*,){2,}[^\]\n]*\]`;

/**
 * A record *of block kinds* is a map from block kind to something. A generic
 * `Record<string, number>` is a lookup table that happens to be a record, and flagging it
 * would make the rule about records rather than about the vocabulary. The key has to name
 * this vocabulary — `Record<BlockKind, …>`, `Record<SurfaceBlockKind, …>` — because a
 * `ReductionKind` is the reducer's own closed set, and Horizon keeps its vocabularies apart.
 */
const BLOCK_KIND_RECORD = String.raw`Record<\s*(?:\w+\.)*\w*BlockKind\b[^>\n]*>`;

/**
 * A block-kind *type alias* ({@link BLOCK_KIND_ALIAS}) is the same claim in type position:
 * a closed set declared for the type checker instead of for a value. A generic
 * `type Kind = string` is not a closed set, hence the `Kind` in the alias name.
 */
const BLOCK_KIND_ALIAS = String.raw`type\s+\w*Kind\s*=`;

/**
 * Every shape above, combined. Built from named constants rather than written inline, so the
 * check never has to quote the shape it forbids and cannot drift from it.
 */
const listedKinds = new RegExp(`${BLOCK_KIND_SET}|${BLOCK_KIND_ALIAS}`);

/** The record claim, matched against code: it is a type annotation, not a quoted value. */
const BLOCK_KIND_RECORD_PATTERN = new RegExp(BLOCK_KIND_RECORD);

/**
 * How many distinct kinds appearing as whole literals make a *list* rather than a selection.
 * One is a choice (a seam naming the block it composes) and a second is still a choice; the
 * third is a second grammar, and that is the claim worth rejecting.
 */
const LISTED_VOCABULARY = 3;

/**
 * The closed vocabulary, duplicated here *on purpose*: a boundary check that imported the
 * vocabulary from the grammar could not notice the grammar growing a sixteenth block.
 */
const BLOCK_TYPE_NAMES: readonly string[] = [
  "metric",
  "callout",
  "table",
  "tree",
  "timeline",
  "graph",
  "chart",
  "compare",
  "media",
  "document",
  "entity",
  "preflight",
  "progress",
  "ask",
  "form",
];

/**
 * A vocabulary word is a closed-set *token*, so the claim worth catching is a quoted one: an
 * unquoted `compare` in a responsibility union is ordinary English, and a rule that flagged it
 * would push authors to rename honest code rather than to remove a duplicate grammar.
 *
 * The claim patterns need the quote characters as a character class, and writing that class
 * out would spell the same literal quotes the scanner has to reason about. The set comes from
 * character codes, so this file never contains a quote it must classify.
 */
const QUOTE_CHARS = String.fromCharCode(34, 39, 96);

function walk(dir: string, root: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "test") continue;
      walk(full, root, out);
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      out.push(path.relative(root, full));
    }
  }
  return out;
}

function importsOf(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/(?:from\s+|import\s*\()\s*["']([^"']+)["']/g)) {
    const specifier = match[1];
    if (specifier !== undefined) found.push(specifier);
  }
  return found;
}

/**
 * Executable markup and dynamic-code handles, as patterns over code only. A renderer that
 * assigns markup, inserts it, or constructs a function has decided to be the authority
 * itself. Each one names the call or assignment it detects: a bare word would also match
 * an identifier, and prose that merely names the risk is not the risk.
 */
const SINK: Readonly<Record<string, RegExp>> = {
  assignment: /\binnerHTML\s*=/,
  adjacent: /\binsertAdjacentHTML\s*\(/,
  element: /\bdangerouslySetInnerHTML\b/,
  evaluator: /\beval\s*\(/,
  constructor: /\bnew\s+Function\s*\(/
};

/**
 * Per-file outcome of the character scanner.
 */
interface Scan {
  /** Comments and literal text removed: what the code itself says. */
  readonly code: string;
  /**
   * Whole string literals, and whole regex literals, in source order: what the file *says* in
   * a literal. A claim has to be the whole of one, so a body is reported unquoted and complete —
   * reporting `horizon.surface/2` from inside a longer sentence would let a passing mention
   * read as a declaration.
   */
  readonly text: string;
  /** Regex literals only, quoted exactly as written, so a pattern can be recognised by shape. */
  readonly regexLiterals: readonly string[];
  /**
   * Whole string literals that *are* a vocabulary word. A claim is the entire literal, not a
   * word appearing inside one: a message that mentions a block kind in passing describes the
   * surface instead of declaring it, and a rule that could not tell the two apart would be
   * unfollowable for whoever has to write the message.
   */
  readonly blockNames: readonly string[];
  /** True when the scanner consumed every character, i.e. the file did not end mid-literal. */
  readonly closed: boolean;
}

/**
 * One pass over the source that separates it into three streams at once: comments (out),
 * code (out), and literal text (kept for `text`, blanked for `code`).
 *
 * A character scanner replaces the earlier regex stack for one reason: the vocabulary rule and
 * the literal rule contradicted each other, and no ordering of the two could pass a file the
 * check *permitted*. Regex stripping reads a lone apostrophe in a message — the one in
 * "what the caller last saw" — as an opening quote and swallows the rest of the file. A rule
 * whose blind spot depends on prose cannot certify a boundary, and a comment claiming its own
 * blindness does not fix it.
 *
 * A claim is a **whole** literal, so `text` holds each literal's body, one per line, and never
 * the sentence it appeared in. Regex literals are recognised too — a `/` in operand position
 * opens one — because the source-expression grammar lives in a regex literal, and a scanner
 * that ignored regexes could not see a second copy of it.
 */
function scan(source: string): Scan {
  const code: string[] = [];
  const text: string[] = [];
  const regexLiterals: string[] = [];
  const blockNames = new Set<string>();
  const length = source.length;
  let index = 0;

  /** Prior non-space character in the code stream, or the empty string at the start. */
  const previousSignificant = (): string => {
    for (let back = code.length - 1; back >= 0; back -= 1) {
      const char = code[back] ?? "";
      if (!/\s/.test(char)) return char;
    }
    return "";
  };

  /**
   * Read one literal, returning the text after its opening quote and stopping where the quote
   * closed. An *unterminated* literal ends at the newline: a quote that never closes is almost
   * always prose (an apostrophe in a message), and letting it run to end of file would blind
   * the scanner to every sink after it. `terminated` only has to be honest.
   */
  const readQuoted = (open: string): { body: string; terminated: boolean } => {
    index += 1;
    let body = "";
    while (index < length) {
      const char = source[index] ?? "";
      if (char === "\\") {
        body += source.slice(index, index + 2);
        index += 2;
        continue;
      }
      if (char === open) {
        index += 1;
        return { body, terminated: true };
      }
      if (char === "\n") return { body, terminated: false };
      body += char;
      index += 1;
    }
    return { body, terminated: false };
  };

  /** Read one regex literal, returning its body with delimiters, exactly as written. */
  const readRegex = (): { body: string; terminated: boolean } => {
    index += 1;
    let body = "/";
    let inClass = false;
    while (index < length) {
      const char = source[index] ?? "";
      if (char === "\\") {
        body += source.slice(index, index + 2);
        index += 2;
        continue;
      }
      if (char === "\n") return { body, terminated: false };
      body += char;
      index += 1;
      if (char === "[") inClass = true;
      else if (char === "]") inClass = false;
      else if (char === "/" && !inClass) {
        while (index < length && /[a-z]/.test(source[index] ?? "")) {
          body += source[index] ?? "";
          index += 1;
        }
        return { body, terminated: true };
      }
    }
    return { body, terminated: false };
  };

  while (index < length) {
    const char = source[index] ?? "";
    const next = source[index + 1] ?? "";

    if (char === "/" && next === "/") {
      while (index < length && source[index] !== "\n") index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      const close = source.indexOf("*/", index + 2);
      index = close === -1 ? length : close + 2;
      code.push(" ");
      continue;
    }
    if (char === "/") {
      const before = previousSignificant();
      const opensRegex = before === "" || "(,=:[!&|?{};+-*%<>~^".includes(before);
      if (opensRegex) {
        const { body, terminated } = readRegex();
        if (terminated && body.length > 2) {
          regexLiterals.push(body);
          text.push(body);
        }
        code.push("/");
        continue;
      }
    }
    if (QUOTE_CHARS.includes(char)) {
      const { body, terminated } = readQuoted(char);
      // Only a closed literal can be a claim; an unterminated one is prose recovery.
      if (terminated) {
        text.push(body);
        const whole = body.trim();
        if (BLOCK_TYPE_NAMES.includes(whole)) blockNames.add(whole);
      }
      code.push(`${char}${char}`);
      continue;
    }
    code.push(char);
    index += 1;
  }

  return { code: code.join(""), text: text.join("\n"), regexLiterals, blockNames: [...blockNames], closed: index >= length };
}


export function checkT05Boundaries(root: string): BoundaryResult {
  const failures: string[] = [];
  const files = walk(root, root);
  const sources = new Map<string, string>();
  for (const file of files) sources.set(file, fs.readFileSync(path.join(root, file), "utf8"));
  // The check and its teeth describe the violations they look for; scanning them would make
  // the check fail on its own documentation.
  const scannable = (file: string): boolean => !file.startsWith("scripts/") && !file.startsWith("test/");

  for (const [file, source] of sources) {
    if (!scannable(file)) continue;
    const isAuthority = file.startsWith(`${UI_AUTHORITY}/`);
    const { code, text, regexLiterals, blockNames, closed } = scan(source);
    // An unclosed scan means the file ended inside a literal, so nothing after that point was
    // classified. Reporting it keeps a scanner bug from being read as a clean file.
    if (!closed) failures.push(`${file}: scan did not close; source ended inside a literal`);

    if (!isAuthority) {
      // A second grammar announces itself as a second copy of the closed vocabulary, and it
      // can do that three ways: re-stating the schema, re-stating the source-expression
      // grammar, or listing block kinds. *Stating one of them as a set is the claim.* A
      // single kind named where a block is composed is a selection from the closed set: the
      // frame owns that choice, and forbidding it would only push the seam toward stringing
      // blocks together at runtime, which is less inspectable than the literal it replaces.
      if (schemaClaim.test(text)) {
        failures.push(`${file}: re-declares the surface schema version outside ${UI_AUTHORITY}`);
      }
      // A list claim is literal text; a record or alias claim is *syntax*, so it is read from
      // `code`. Searching `text` would only ever see the parts that happen to sit inside a
      // string, and `Record<BlockKind, string>` is a type, not a string.
      if (listedKinds.test(text)) failures.push(`${file}: re-declares the block vocabulary outside ${UI_AUTHORITY}`);
      if (BLOCK_KIND_RECORD_PATTERN.test(code)) {
        failures.push(`${file}: models a block-kind record outside ${UI_AUTHORITY}`);
      }
      if (blockNames.length >= LISTED_VOCABULARY) {
        failures.push(`${file}: lists block types (${blockNames.join(", ")}) outside ${UI_AUTHORITY}`);
      }
      if (regexLiterals.some((literal) => sourceClaim.test(literal))) {
        failures.push(`${file}: re-declares a source-expression pattern outside ${UI_AUTHORITY}`);
      }
      // Routes consume the projection; binding and reducing are authority, not transport.
      // `src/ui/surface.ts` is the named seam that is allowed to compose and project for a
      // route; any other route file importing the binder or reducer directly is divergence.
      if (file !== SEAM && /surface2\/(binder|reducer)/.test(text)) {
        failures.push(`${file}: imports the binder/reducer directly; routes must consume the projection`);
      }
      if (/export function (renderText|renderHtml)\(/.test(code)) {
        failures.push(`${file}: renderer outside ${UI_AUTHORITY}`);
      }
    } else {
      for (const specifier of importsOf(source)) {
        if (specifier.startsWith("@godspeedai/")) failures.push(`${file}: ${UI_AUTHORITY} MUST NOT import Cognate (${specifier})`);
        if (specifier === "bun" || specifier.startsWith("bun:")) failures.push(`${file}: ${UI_AUTHORITY} MUST NOT import the Bun runtime`);
        if (/^(react|react-dom|preact|solid-js)/.test(specifier)) failures.push(`${file}: ${UI_AUTHORITY} MUST NOT import a renderer (${specifier})`);
      }
      for (const [handle, pattern] of Object.entries(SINK) as readonly [string, RegExp][]) {
        if (pattern.test(code)) failures.push(`${file}: executable markup or dynamic code (${handle}) inside ${UI_AUTHORITY}`);
      }
      // A declaration, not a use: the type annotation `innerHTML: string` is a shape, while
      // `html:` assigned a literal is a model that fabricates markup.
      if (/\bhtml\s*(?::\s*[\w<>[\]]+)?\s*=\s*[`"']/.test(code)) failures.push(`${file}: fabricates markup in a model inside ${UI_AUTHORITY}`);
      // Reducers stay pure: a store owning mutable authority is the competing model this task
      // exists to prevent, wherever in the tree it is declared.
      if (/\b(ProjectionStore|AuthorityStore|CockpitModelStore)\b/.test(code)) failures.push(`${file}: competing authority store inside ${UI_AUTHORITY}`);
    }
  }

  // The shared renderers must exist and must consume the one projection, otherwise a
  // transport could quietly render its own surface.
  const renderers = [...sources].filter(
    ([file, source]) => scannable(file) && /export function (renderText|renderHtml)\(/.test(scan(source).code),
  );
  for (const [file, source] of renderers) {
    if (!/\.\/project|surface2\/project/.test(source)) failures.push(`${file}: renderer does not consume the single projection`);
  }
  if (renderers.length === 0) failures.push(`${UI_AUTHORITY}: no shared renderer found; text/HTML routes would diverge`);

  return { ok: failures.length === 0, failures, inspected: [...sources.keys()] };
}

if (import.meta.main) {
  const root = path.resolve(import.meta.dir, "..");
  const result = checkT05Boundaries(root);
  for (const file of result.inspected) console.log(`inspected ${file}`);
  for (const failure of result.failures) console.log(`FAIL ${failure}`);
  console.log(result.ok ? `T05 boundaries: ok (${result.inspected.length} files)` : `T05 boundaries: ${result.failures.length} failure(s)`);
  process.exit(result.ok ? 0 : 1);
}

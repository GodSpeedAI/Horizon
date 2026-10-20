/**
 * T05 teeth: the boundary check must reject a competing authority, not merely pass today.
 *
 * A green check that cannot fail proves nothing, so each tooth plants a small violation in a
 * throwaway tree and asserts the check catches it, then asserts the real tree still passes.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkT05Boundaries } from "./check-t05-boundaries.ts";

const ROOT = path.resolve(import.meta.dir, "..");

interface Tooth {
  readonly id: string;
  readonly files: Readonly<Record<string, string>>;
  readonly expect: RegExp;
  /**
   * A tooth asserting the *limit* of a rule. Without one, a check that rejected everything
   * would pass every other tooth and be worthless; the pair is what shows the rule has an
   * inside as well as an outside.
   */
  readonly accept?: boolean;
}

const realRender = `import { projectSurface } from "./project";\nexport function renderText(view: unknown): string {\n  void projectSurface;\n  return String(view);\n}\n`;

const TEETH: readonly Tooth[] = [
  {
    id: "NE-B1 second schema version outside the authority",
    files: { "src/ui/other/surface.ts": `export const schema = "horizon.surface/2";\n` },
    expect: /re-declares the surface schema version/,
  },
  {
    id: "NE-B2 second block vocabulary outside the authority",
    files: { "src/ui/other/blocks.ts": `export const types = ["metric", "callout", "table"];\n` },
    expect: /re-declares the block vocabulary|lists block types/,
  },
  {
    id: "NE-B2c a block-kind record is a vocabulary copy",
    files: {
      "src/ui/other/map.ts": `export const labels: Record<BlockKind, string> = { callout: "Note" };\n`,
    },
    // A record is caught as itself: it re-states the set through the block-kind type, which is
    // a different act from writing the set out, so the message has to be its own. Folding it
    // into the list message would hide which claim was found and invite a fix to the wrong line.
    expect: /models a block-kind record/,
  },
  {
    id: "NE-B2d a record keyed by the block-kind type is the claim; keyed by string is not",
    files: {
      "src/ui/other/labels.ts": `export const labels: Record<string, string> = { metric: "Measure", callout: "Note", table: "Rows" };\n`,
    },
    expect: /models a block-kind record/,
    accept: true,
  },
  {
    id: "NE-B2b one or two named kinds are still a selection, not a scrape",
    files: {
      "src/ui/other/one.ts": `export interface Card { readonly kind: "entity"; }\nexport const a = "table";\n`,
    },
    expect: /never-expected/, // deliberately unmatched: this tooth asserts *acceptance*
    accept: true,
  },
  {
    id: "NE-B3 second source-expression pattern outside the authority",
    files: { "src/ui/other/sources.ts": `export const SEMANTIC = /^semantic:[A-Za-z]+$/;\n` },
    expect: /re-declares a source-expression pattern/,
  },
  {
    id: "NE-B4 route importing the binder directly",
    files: { "src/cli.ts": `import { bindSource } from "./ui/surface2/binder.ts";\nexport const x = bindSource;\n` },
    expect: /imports the binder\/reducer directly/,
  },
  {
    id: "NE-B5 authority importing Cognate",
    files: { "src/ui/surface2/leak.ts": `import type { Caller } from "@godspeedai/cognate-runtime-api";\nexport type C = Caller;\n` },
    expect: /MUST NOT import Cognate/,
  },
  {
    id: "NE-B6 authority emitting dynamic code",
    files: { "src/ui/surface2/run.ts": `export const run = (src: string) => new Function(src);\n` },
    expect: /executable markup or dynamic code \(constructor\) inside src\/ui\/surface2/,
  },
  {
    id: "NE-B7 renderer outside the authority",
    files: { "src/ui/render-own.ts": `import { projectSurface } from "./surface2/project";\nexport function renderHtml(v: string): string {\n  void projectSurface;\n  return v;\n}\n` },
    expect: /renderer outside src\/ui\/surface2/,
  },
  {
    id: "NE-B8 competing authority store",
    files: { "src/ui/surface2/ProjectionStore.ts": `export class ProjectionStore { readonly items: unknown[] = []; }\n` },
    expect: /competing authority store/,
  },
];

function plant(files: Readonly<Record<string, string>>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t05-tooth-"));
  fs.mkdirSync(path.join(dir, "src/ui/surface2"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src/ui/surface2/render.ts"), realRender);
  // A planted tree isolates ONE violation. The attribution rule (PE-08) reads two root files,
  // so they are carried over as-is; otherwise every planted tree would also be an "absent
  // NOTICE" tree and the acceptance teeth could never tell an unrelated failure from the one
  // they name. The attribution rule gets its own teeth below.
  for (const relative of ["NOTICE", "docs/donors.md"]) {
    const source = path.join(ROOT, relative);
    if (!fs.existsSync(source)) continue;
    const target = path.join(dir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(dir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return dir;
}

let failures = 0;
const report = (line: string): void => console.log(line);

// 1. The real tree passes, and the check inspected the authority rather than nothing.
const real = checkT05Boundaries(ROOT);
const inspectedAuthority = real.inspected.filter((file) => file.startsWith("src/ui/surface2/"));
if (!real.ok) {
  failures += 1;
  report(`FAIL NE-B0 real tree rejected: ${real.failures.join("; ")}`);
} else if (inspectedAuthority.length < 5) {
  failures += 1;
  report(`FAIL NE-B0 check inspected only ${inspectedAuthority.length} authority files`);
} else {
  report(`ok   NE-B0 real tree passes (${real.inspected.length} files, ${inspectedAuthority.length} in the authority)`);
}

// 2. Each planted violation is caught by the rule that is supposed to catch it.
for (const tooth of TEETH) {
  const dir = plant(tooth.files);
  try {
    const result = checkT05Boundaries(dir);
    const caught = result.failures.some((failure) => tooth.expect.test(failure));
    if (tooth.accept === true) {
      if (!result.ok) {
        failures += 1;
        report(`FAIL ${tooth.id}: rejected (${result.failures.join("; ")})`);
      } else {
        report(`ok   ${tooth.id}`);
      }
      continue;
    }
    if (result.ok || !caught) {
      failures += 1;
      report(`FAIL ${tooth.id}: ${result.ok ? "accepted" : `wrong reason: ${result.failures.join("; ")}`}`);
    } else {
      report(`ok   ${tooth.id}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// 3. Prose must not trip the scanning rules. Two halves, because the scanner now serves both:
//    a comment that merely describes a sink, and a message whose apostrophe used to make the
//    regex stripper swallow the file. The truth lives in a throwaway tree so the teeth are
//    asserting behaviour, not reading the check's own internals.
const PROSE = [
  "// never use innerHTML here; eval( is banned",
  "/** a reducer must not call new Function(src) */",
  'export const notice = "what the caller last saw was' + 't the surface";',
  "export const safe = notice.length;",
].join("\n");
const proseDir = plant({ "src/ui/surface2/note.ts": `${PROSE}\n` });
try {
  const result = checkT05Boundaries(proseDir);
  if (!result.ok) {
    failures += 1;
    report(`FAIL NE-B9 comment amplification: prose tripped the scanner (${result.failures.join("; ")})`);
  } else {
    report("ok   NE-B9 prose in comments and messages is not flagged");
  }
} finally {
  fs.rmSync(proseDir, { recursive: true, force: true });
}

// 4. The same scanner must still see a real sink next to that prose, or NE-B9 could be passed
//    by a scanner that had simply stopped looking.
const sinkNote = [PROSE, "export const leak = (el: { innerHTML: string }) => { el.innerHTML = \"x\"; return el; };", ""].join("\n");
const proseSinkDir = plant({ "src/ui/surface2/note.ts": sinkNote });
try {
  const result = checkT05Boundaries(proseSinkDir);
  if (result.ok || !result.failures.some((failure) => /executable markup or dynamic code/.test(failure))) {
    failures += 1;
    report("FAIL NE-B9b a real sink beside prose went unnoticed");
  } else {
    report("ok   NE-B9b a real sink beside prose is still caught");
  }
} finally {
  fs.rmSync(proseSinkDir, { recursive: true, force: true });
}

// 5. The attribution rule (PE-08) must bite. Two lists that are supposed to agree drift into
//    looking maintained; so each way they can disagree is a tooth, and a donor section that
//    states no license or no borrowed material is not a record.
const ATTR_TEETH: readonly { readonly id: string; readonly mutate: (dir: string) => void; readonly expect: RegExp }[] = [
  {
    id: "NE-B10 NOTICE absent is rejected, not assumed present",
    mutate: (dir) => fs.rmSync(path.join(dir, "NOTICE"), { force: true }),
    expect: /NOTICE: missing at the repository root/,
  },
  {
    id: "NE-B11 a donor dropped from NOTICE is drift",
    mutate: (dir) => {
      const file = path.join(dir, "NOTICE");
      const text = fs.readFileSync(file, "utf8");
      // Rename the banner's donor so it no longer matches docs/donors.md. Picking the name from
      // docs/donors.md keeps the tooth honest if the donor set changes.
      const donor = /^## (.+)$/m.exec(fs.readFileSync(path.join(dir, "docs/donors.md"), "utf8"))?.[1];
      if (!donor) throw new Error("no donor heading to drift");
      fs.writeFileSync(file, text.replace(new RegExp(`^${donor}:`, "m"), "SomeOtherProject:"));
    },
    expect: /does not name donor/,
  },
  {
    id: "NE-B12 an extra donor in NOTICE is drift",
    mutate: (dir) => {
      const file = path.join(dir, "NOTICE");
      const text = fs.readFileSync(file, "utf8");
      fs.writeFileSync(file, `${text}\n==============================================================================\nUnrecorded Donor: https://example.invalid/donor\n\nLicense: Apache-2.0\nSource commit: deadbeef\nBorrowed: nothing\n`);
    },
    expect: /does not record donor .*named in NOTICE/,
  },
  {
    id: "NE-B13 a donor section without a license is not a record",
    mutate: (dir) => {
      const file = path.join(dir, "NOTICE");
      fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/^License:/m, "Licence:"));
    },
    expect: /records no License line/,
  },
];
for (const tooth of ATTR_TEETH) {
  const dir = plant({});
  try {
    tooth.mutate(dir);
    const result = checkT05Boundaries(dir);
    if (result.ok || !result.failures.some((failure) => tooth.expect.test(failure))) {
      failures += 1;
      report(`FAIL ${tooth.id}: ${result.ok ? "accepted" : `wrong reason: ${result.failures.join("; ")}`}`);
    } else {
      report(`ok   ${tooth.id}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log(failures === 0 ? `teeth-t05: ok (${TEETH.length + ATTR_TEETH.length + 3} checks)` : `teeth-t05: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);

/** The read-only FDE adapters: absent source is "not connected", a source that fails its schema is "invalid", nothing is written. */
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { readCaseRecords, readRealityTrace, readWorldPin } from "../src/adapters/fde-read.ts";
import { SchemaRegistry } from "../src/adapters/fde-schema.ts";
import { readFdeSources } from "../src/adapters/fde-sources.ts";
import { fdeDebuggerValues } from "../src/adapters/fde-view.ts";
import { runDebugger } from "../src/domain/debugger.ts";

const ROOT = join(import.meta.dir, "..");
const FX = join(import.meta.dir, "fixtures/fde");
const CASE = join(FX, "sf/evaluated-settled/cases/case-0001");
const COMPARE = join(FX, "rt/contradicted/compare.json");
const OBSERVED = join(FX, "rt/contradicted/observed.json");
const PIN = join(FX, "pin/promoted.json");
const scratch = (): string => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "fde-read-"));

describe("vendored contracts", () => {
  test("contracts/fde files match their DIGESTS", () => {
    const manifest = readFileSync(join(ROOT, "contracts/fde/DIGESTS"), "utf8").trim().split("\n");
    expect(manifest.length).toBe(4);
    for (const line of manifest) {
      const [digest, name] = line.split("  ");
      expect(createHash("sha256").update(readFileSync(join(ROOT, "contracts/fde", name!))).digest("hex")).toBe(digest!);
    }
  });
  test("the validator throws on a keyword it does not implement instead of skipping it", () => {
    const registry = new SchemaRegistry();
    registry.add({ $id: "urn:t", type: "object", uniqueItems: true });
    expect(() => registry.validate("urn:t", {})).toThrow("unsupported schema keyword");
  });
});

describe("case records", () => {
  test("a settled episode reads with freeze, anchor and settlement", () => {
    const read = readCaseRecords(CASE);
    expect(read.state).toBe("ok");
    if (read.state !== "ok") return;
    const e = read.data[0]!;
    expect(e.plan_item_id).toBe("item-03");
    expect(e.anchor.state).toBe("published");
    expect(e.settlement?.result).toBe("S");
    expect(e.settlement?.settling_actor).toBe("verifier-1");
  });
  test("a missing case directory is not connected", () => {
    expect(readCaseRecords(join(FX, "no-such-case")).state).toBe("not_connected");
  });
  test("a directory where the ledger should be is not connected, not empty", () => {
    const dir = scratch();
    try {
      cpSync(CASE, dir, { recursive: true });
      rmSync(join(dir, "field-records.jsonl"));
      cpSync(CASE, join(dir, "field-records.jsonl"), { recursive: true }); // now a directory
      expect(readCaseRecords(dir).state).toBe("not_connected");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test("a record that fails case-record-append.v1 makes the whole source invalid", () => {
    const dir = scratch();
    try {
      cpSync(CASE, dir, { recursive: true });
      const lines = readFileSync(join(dir, "field-records.jsonl"), "utf8").trimEnd().split("\n").map((l) => JSON.parse(l));
      lines[1].payload.result = "X";
      writeFileSync(join(dir, "field-records.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
      const read = readCaseRecords(dir);
      expect(read.state).toBe("invalid");
      if (read.state === "invalid") expect(read.violations.join(" ")).toContain("result");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test("a ledger line that is not JSON is invalid", () => {
    const dir = scratch();
    try {
      writeFileSync(join(dir, "field-records.jsonl"), "{not json}\n");
      expect(readCaseRecords(dir).state).toBe("invalid");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("RealityTrace structure", () => {
  test("residuals keep the producer's class, basis and world stamp", () => {
    const read = readRealityTrace(COMPARE, OBSERVED);
    expect(read.state).toBe("ok");
    if (read.state !== "ok") return;
    expect(read.data.residuals.map((r) => [r.class, r.basis])).toEqual([["contradicted", "structural_violated"]]);
    expect(read.data.tail_verification.status).toBe("unverified");
    expect(read.data.representation_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
  test("a missing result is not connected; a missing derive output is not connected", () => {
    expect(readRealityTrace(join(FX, "rt/none.json")).state).toBe("not_connected");
    expect(readRealityTrace(COMPARE, join(FX, "rt/none.json")).state).toBe("not_connected");
  });
  test("a residual outside residual.v1 (unknown class) is invalid, not displayed", () => {
    const dir = scratch();
    try {
      const doc = JSON.parse(readFileSync(COMPARE, "utf8"));
      doc.residuals.structural[0].class = "passed";
      writeFileSync(join(dir, "c.json"), JSON.stringify(doc));
      const read = readRealityTrace(join(dir, "c.json"));
      expect(read.state).toBe("invalid");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test("a derive output for another representation is invalid", () => {
    const dir = scratch();
    try {
      const other = JSON.parse(readFileSync(join(FX, "rt/insufficient-silent-source/observed.json"), "utf8"));
      writeFileSync(join(dir, "o.json"), JSON.stringify(other));
      expect(readRealityTrace(COMPARE, join(dir, "o.json")).state).toBe("invalid");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("world pin", () => {
  test("reads the current pin and history", () => {
    const read = readWorldPin(PIN);
    expect(read.state).toBe("ok");
    if (read.state === "ok") expect(read.data.history[0]?.kind).toBe("promoted");
  });
  test("absent is not connected; a malformed world_ref is invalid", () => {
    expect(readWorldPin(join(FX, "pin/none.json")).state).toBe("not_connected");
    const dir = scratch();
    try {
      const doc = JSON.parse(readFileSync(PIN, "utf8"));
      doc.current = "world:sop";
      writeFileSync(join(dir, "p.json"), JSON.stringify(doc));
      expect(readWorldPin(join(dir, "p.json")).state).toBe("invalid");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("read-only", () => {
  test("reading changes no file under the fixture tree and the adapters import no writer", () => {
    const snapshot = (): string => {
      const out: string[] = [];
      const walk = (dir: string): void => { for (const name of readdirSync(dir).sort()) { const p = join(dir, name); const s = statSync(p); if (s.isDirectory()) walk(p); else out.push(`${p}:${s.size}:${s.mtimeMs}`); } };
      walk(FX);
      return out.join("\n");
    };
    const before = snapshot();
    readFdeSources({ caseDir: CASE, comparePath: COMPARE, derivePath: OBSERVED, pinPath: PIN });
    expect(snapshot()).toBe(before);
    for (const file of ["fde-read.ts", "fde-sources.ts", "fde-view.ts", "fde-schema.ts"]) {
      const text = readFileSync(join(ROOT, "src/adapters", file), "utf8");
      expect(text).not.toMatch(/writeFile|appendFile|mkdir|unlink|rmSync|renameSync|createWriteStream|fetch\(|spawn/);
    }
  });
});

describe("debugger feed", () => {
  test("absent sources arrive as unknown values, never as empty or zero", () => {
    const values = fdeDebuggerValues(readFdeSources({}), "episode:x:y:1@sha256:" + "0".repeat(64));
    expect(values.length).toBe(3);
    for (const v of values) { expect(v.class).toBe("unknown"); expect(v.value).toBe("not connected"); expect(v.missing_source).toBeDefined(); }
  });
  test("an invalid source arrives as unknown with the words 'invalid source'", () => {
    const dir = scratch();
    try {
      writeFileSync(join(dir, "c.json"), "{}");
      const values = fdeDebuggerValues(readFdeSources({ comparePath: join(dir, "c.json") }), "e");
      expect(values.find((v) => v.key === "residuals")?.value).toBe("invalid source");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test("connected sources give recorded values with their source record", () => {
    const sources = readFdeSources({ caseDir: CASE, comparePath: COMPARE, pinPath: PIN });
    const episode = sources.case.state === "ok" ? sources.case.data[0]!.episode_ref : "";
    const values = fdeDebuggerValues(sources, episode);
    expect(values.find((v) => v.key === "residual.0.class")).toMatchObject({ value: "contradicted", class: "recorded" });
    expect(values.find((v) => v.key === "settlement.result")).toMatchObject({ value: "S", class: "recorded", source: "case-record/rec-0002" });
  });
});

describe("debugger why", () => {
  const frame = { observer_ref: "o", tenant_ref: "t", world_ref: "w", checkpoint_ref: null, focus_ref: "obj:none", case_ref: null, frame_id: "f", frame_revision: 1 } as never;
  const base = { frame, objects: [], links: [], lineage: [], declared_relations: [] };
  test("why about the episode answers from the FDE values, settles nothing and grants no authority", () => {
    const sources = readFdeSources({ caseDir: CASE, comparePath: COMPARE, pinPath: PIN });
    const ref = sources.case.state === "ok" ? sources.case.data[0]!.episode_ref : "";
    const answer = runDebugger({ ...base, fde: { episode_ref: ref, values: fdeDebuggerValues(sources, ref) } }, { operation: "why", target_ref: ref });
    expect(answer.status).toBe("ok");
    expect(answer.values.find((v) => v.key === "residual.0.class")?.value).toBe("contradicted");
    expect(answer.settles).toBe(false);
    expect(answer.authority.grants_authority).toBe(false);
  });
  test("without an FDE source why is unchanged: the focus is unknown, not an FDE answer", () => {
    const answer = runDebugger(base, { operation: "why", target_ref: "episode:a:b:1@sha256:" + "0".repeat(64) });
    expect(answer.values[0]?.class).toBe("unknown");
  });
});

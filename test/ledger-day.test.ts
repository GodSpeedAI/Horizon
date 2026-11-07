import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { filterDay, readLedgerDay, cachePath } from "../src/adapters/ledger-day.ts";
import { READ_ONLY_COMMANDS, recordReader, type Runner } from "../src/adapters/realitytrace-economics.ts";
import { observation, questionDeclared } from "./support/economics-fixture.ts";

// 2026-11-06 23:30 in New York is 2026-11-07T04:30Z; 2026-11-06 12:00 NY is 17:00Z.
const rows = [
  questionDeclared(1, "journey:J01:desired_state:1"),
  observation(2, { name: "late", ts: "2026-11-07T04:30:00Z" }),
  observation(3, { name: "noon", ts: "2026-11-06T17:00:00Z" }),
  observation(4, { name: "next", ts: "2026-11-07T17:00:00Z" }),
];

function runner(state: { count: number; calls: string[] }): Runner {
  return (_bin, args) => {
    state.calls.push(args.slice(0, 2).join(" "));
    if (args[0] === "ledger" && args[1] === "verify") return { status: 0, stdout: JSON.stringify({ ok: true, verified_count: state.count, first_divergence: null }), stderr: "" };
    if (args[0] === "ledger" && args[1] === "export") return { status: 0, stdout: JSON.stringify(rows.slice(0, state.count)), stderr: "" };
    return { status: 1, stdout: "", stderr: "unexpected" };
  };
}

describe("ledger day", () => {
  test("day filter keeps only events of the chosen local date", () => {
    const names = (day: string) => filterDay(rows, day, "America/New_York").map((r) => (r as { append_ordinal: number }).append_ordinal);
    expect(names("2026-11-06")).toEqual([1, 2, 3]);
    expect(names("2026-11-07")).toEqual([1, 4]);
    expect(names("2026-11-08")).toEqual([1]);
  });

  test("cache is keyed by last record number and refreshes when it moves", () => {
    const dir = mkdtempSync(join(tmpdir(), "ledger-day-"));
    const state = { count: 3, calls: [] as string[] };
    const reader = recordReader({}, "rt", runner(state));
    const read = () => readLedgerDay(reader, { repoId: "R1", day: "2026-11-06", timeZone: "America/New_York", cacheDir: dir });
    const first = read();
    expect(first.ok && first.from_cache).toBe(false);
    expect(existsSync(cachePath(dir, "R1"))).toBe(true);
    expect(JSON.parse(readFileSync(cachePath(dir, "R1"), "utf8")).last_record).toBe(3);
    const second = read();
    expect(second.ok && second.from_cache).toBe(true);
    expect(state.calls.filter((c) => c === "ledger export")).toHaveLength(1);
    state.count = 4;
    const third = read();
    expect(third.ok && third.from_cache).toBe(false);
    expect(state.calls.filter((c) => c === "ledger export")).toHaveLength(2);
    expect(JSON.parse(readFileSync(cachePath(dir, "R1"), "utf8")).last_record).toBe(4);
  });

  test("ledger export is read through the allow-list only", () => {
    const state = { count: 3, calls: [] as string[] };
    const reader = recordReader({}, "rt", runner(state));
    reader.repos();
    reader.verify("R1");
    reader.ledger("R1");
    for (const call of state.calls) expect(READ_ONLY_COMMANDS.some(([a, b]) => call === `${a} ${b}`)).toBe(true);
    // A write command is never reachable: the runner is not called for it.
    const spy: string[] = [];
    const guarded = recordReader({}, "rt", (_b, args) => (spy.push(args.join(" ")), { status: 0, stdout: "{}", stderr: "" }));
    guarded.verify("R1");
    expect(spy.every((c) => c.startsWith("ledger verify") || c.startsWith("ledger export") || c.startsWith("repo list"))).toBe(true);
    expect(READ_ONLY_COMMANDS.some(([a, b]) => (a as string) === "ingest" || (b as string) === "ingest")).toBe(false);
  });
});

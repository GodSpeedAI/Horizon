import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run as scanRun } from "../scripts/presenting-scan.ts";
import { measure, percentile, delaysOf } from "../scripts/measure-timings.ts";
import { parseSessions, summarizePage } from "../scripts/walkthrough-capture.ts";
import type { RecordReader } from "../src/adapters/realitytrace-economics.ts";
import { observation } from "./support/economics-fixture.ts";

describe("stage 1 scripts", () => {
  test("presenting-scan fails on a real name and passes when only stand-ins appear", () => {
    const dir = mkdtempSync(join(tmpdir(), "scan-"));
    writeFileSync(join(dir, "a.html"), "<p>Project ABCD did the work</p>");
    writeFileSync(join(dir, "notes.md"), "SecretApp is mentioned in the author's notes, which are skipped");
    const quiet = () => {};
    expect(scanRun(["--dir", dir, "--setup", "testing"], {}, quiet, quiet, ["SecretApp"])).toBe(0);
    writeFileSync(join(dir, "b.json"), '{"path":"/x/secretapp"}');
    expect(scanRun(["--dir", dir, "--setup", "testing"], {}, quiet, quiet, ["SecretApp"])).toBe(1);
    expect(scanRun(["--setup", "testing"], {}, quiet, quiet, [])).toBe(2);
  });

  test("walkthrough helpers read the page they saved", () => {
    expect(parseSessions("matched=a,contradicted=b")).toEqual([{ name: "matched", session: "a" }, { name: "contradicted", session: "b" }]);
    expect(() => parseSessions("oops")).toThrow();
    const html = '<span data-presenting="on"></span><h2 id="cmp-h">Session <span class="pill" data-outcome="matched">matched</span></h2><p data-current-label="pass">';
    expect(summarizePage(html)).toEqual({ outcome: "matched", labelled: true, presenting: true });
  });

  test("measure-timings reports the fields and a delay from observed_at minus ts", () => {
    const withDelay = (ordinal: number, ts: string, observed: string) => {
      const row = observation(ordinal, { name: `e${ordinal}`, ts }) as { payload: { extensions: { agent_event: Record<string, unknown> } } };
      row.payload.extensions.agent_event.observed_at = observed;
      return row;
    };
    const rows = [withDelay(1, "2026-10-30T10:00:00Z", "2026-10-30T10:00:01Z"), withDelay(2, "2026-10-30T10:01:00Z", "2026-10-30T10:01:03Z")];
    expect(delaysOf(rows)).toEqual([1000, 3000]);
    expect(percentile([1000, 3000], 50)).toBe(1000);
    const reader: RecordReader = { repos: () => ({ ok: true, repos: [] }), ledger: () => ({ ok: true, rows }), verify: () => ({ ok: true, intact: true, records: 2, divergence: null }) };
    const result = measure(reader, "R1", "UTC");
    if ("error" in result) throw new Error(result.error);
    expect(result).toMatchObject({ repo: "R1", day: "2026-10-30", delay: { n: 2, median_ms: 1000, p95_ms: 3000, threshold_ms: 2000 } });
    expect(result.ledger_bytes).toBeGreaterThan(0);
  });
});

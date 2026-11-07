// Annex J.1, record keeper row: the two RealityTrace adapters against a fake `realitytrace` script.
// The rule each test proves: the honest state in plain words, never stale data shown as current, never a lost or
// doubled write, never a leaked key.
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RealityTraceError, RealityTraceObligation } from "../src/adapters/realitytrace-obligation.ts";
import { makeSpawnRunner, realityTraceEconomics, recordReader } from "../src/adapters/realitytrace-economics.ts";
import { agentEvent, sampleLedger, tok } from "./support/economics-fixture.ts";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) {
    try {
      chmodSync(join(d, "data"), 0o700);
    } catch {
      // already gone or never made
    }
    rmSync(d, { recursive: true, force: true });
  }
});

/** A fake `realitytrace`: `script` is a shell body that sees $1 $2 as the subcommand. */
function fake(script: string) {
  const dir = mkdtempSync(join(tmpdir(), "horizon-rtk-"));
  dirs.push(dir);
  mkdirSync(join(dir, "data"));
  mkdirSync(join(dir, "state"));
  const bin = join(dir, "realitytrace");
  writeFileSync(bin, `#!/bin/sh\n${script}\n`);
  chmodSync(bin, 0o755);
  const paths = { data_home: join(dir, "data"), state_home: join(dir, "state") };
  return {
    dir,
    bin,
    ...paths,
    econ: (timeoutMs?: number, exists: (p: string) => boolean = () => true) => realityTraceEconomics({ realitytrace_bin: bin, ...paths }, timeoutMs ? makeSpawnRunner(timeoutMs) : undefined, exists),
    reader: (timeoutMs?: number) => recordReader(paths, bin, timeoutMs ? makeSpawnRunner(timeoutMs) : undefined),
    obligation: (timeoutMs?: number) => new RealityTraceObligation({ bin, dataHome: paths.data_home, stateHome: paths.state_home, repoDir: join(dir, "repo"), ...(timeoutMs ? { timeoutMs } : {}) }),
  };
}

const REPOS = `{"repos":[{"repo_id":"R1","filesystem_path":"/tmp","state":"enrolled"}]}`;
const withLedger = (ledger: string, extra = "") => `case "$1 $2" in
  "repo list") echo '${REPOS}';;
  "ledger export")
${ledger}
  ;;
  "projections export") echo '[]';;
  ${extra}
esac`;
const ledgerJson = (rows: unknown[]) => `cat <<'EOF_LEDGER'\n${JSON.stringify(rows)}\nEOF_LEDGER`;

describe("record keeper: the program itself", () => {
  test("binary missing", async () => {
    const f = fake("true");
    rmSync(f.bin);
    const read = f.econ().read();
    expect(read.state).toBe("unavailable");
    expect((read as { message: string }).message).toContain("the record keeper program was not found");
    expect(f.reader().repos()).toMatchObject({ ok: false });
    await expect(f.obligation().repo()).rejects.toBeInstanceOf(RealityTraceError);
    await expect(f.obligation().declare({ intentId: "i", statement: "s", target: "t", criteria: { minimum_relevance: "low", minimum_reliability: "low" } })).rejects.toThrow(/realitytrace/);
  });

  test("non-zero exit", async () => {
    const f = fake(`echo "store is locked by another process" >&2; exit 3`);
    const read = f.econ().read();
    expect(read).toMatchObject({ state: "unavailable" });
    expect((read as { message: string }).message).toContain("failed (exit 3): store is locked by another process");
    expect(f.reader().ledger("R1")).toEqual({ ok: false, message: "realitytrace ledger export failed (exit 3): store is locked by another process" });
    await expect(f.obligation().repo()).rejects.toThrow("failed (exit 3): store is locked by another process");
  });

  test("timeout: a hung program is stopped and the wait is said in words", async () => {
    const f = fake(`echo $$ > "$0.pid"; exec sleep 30`);
    const started = Date.now();
    const read = f.econ(400).read();
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(read.state).toBe("unavailable");
    expect((read as { message: string }).message).toContain("did not answer in time and was stopped");
    const pid = Number(readFileSync(`${f.bin}.pid`, "utf8").trim());
    expect(() => process.kill(pid, 0)).toThrow();
    // The writer side: the same, and the child is gone.
    const g = fake(`echo $$ > "$0.pid"; exec sleep 30`);
    await expect(g.obligation(400).declare({ intentId: "i", statement: "s", target: "t", criteria: { minimum_relevance: "low", minimum_reliability: "low" } })).rejects.toThrow(/timed out after/);
    expect(() => process.kill(Number(readFileSync(`${g.bin}.pid`, "utf8").trim()), 0)).toThrow();
  });

  test("output that is not JSON", async () => {
    const f = fake(`echo "Welcome to realitytrace 9.9! (banner, not data)"`);
    expect(f.econ().read()).toEqual({ state: "unavailable", message: "realitytrace repo list printed no JSON" });
    expect(f.reader().repos()).toEqual({ ok: false, message: "realitytrace repo list printed no JSON" });
    await expect(f.obligation().repo()).rejects.toThrow("printed no JSON");
  });

  test("valid JSON of the wrong shape is not an empty record", async () => {
    // repo list answers a bare list: not "no repositories".
    const a = fake(`echo '["R1","R2"]'`);
    expect(a.econ().read()).toMatchObject({ state: "unavailable" });
    expect((a.econ().read() as { message: string }).message).toContain("shape Horizon does not know");
    expect(a.reader().repos()).toMatchObject({ ok: false });
    // ledger export answers an object with no list of rows: that repository carries an error, not "no activity".
    const b = fake(withLedger(`echo '{"status":"ok","note":"no rows key"}'`));
    const read = b.econ().read();
    expect(read).toMatchObject({ state: "empty" });
    const repo = (read as unknown as { repos: { error: string | null; model: unknown }[] }).repos[0]!;
    expect(repo.model).toBeNull();
    expect(repo.error).toContain("shape Horizon does not know");
    expect((read as { skipped: { without_agent_activity: number } }).skipped.without_agent_activity).toBe(0);
    expect(b.reader().ledger("R1")).toMatchObject({ ok: false });
    // rows that are not records at all are not counted as activity either.
    const c = fake(withLedger(ledgerJson([1, "two", null, [3]])));
    expect(c.econ().read()).toMatchObject({ state: "empty", skipped: { without_agent_activity: 1 } });
    // the writer side: an answer missing what it needs is refused, not guessed.
    const d = fake(`case "$1 $2" in "repo list") echo '{"repos":[]}';; "repo enroll") echo '{"repo_id":"R1"}';; *) echo '{}';; esac`);
    await expect(d.obligation().declare({ intentId: "i", statement: "s", target: "t", criteria: { minimum_relevance: "low", minimum_reliability: "low" } })).rejects.toThrow("returned no ledger position");
  });
});

describe("record keeper: enrolling", () => {
  test("an existing repo is found by its filesystem path, not enrolled again", async () => {
    const f = fake(`case "$1 $2" in
  "repo list") echo '{"repos":[{"repo_id":"R7","filesystem_path":"'"$(dirname "$0")"'/repo","state":"enrolled"}]}';;
  "repo enroll") echo enrolled >> "$0.enrolled"; echo '{"repo_id":"R9"}';;
  *) echo '{}';;
esac`);
    expect(await f.obligation().repo()).toBe("R7");
    expect(await f.obligation().repo()).toBe("R7");
    expect(existsSync(`${f.bin}.enrolled`)).toBe(false);
  });
});

describe("record keeper: the record", () => {
  test("a truncated ledger is reported, never shown as the record", () => {
    const whole = JSON.stringify(sampleLedger());
    const f = fake(withLedger(`printf '%s' '${whole.slice(0, Math.floor(whole.length / 2)).replace(/'/g, "")}'`));
    const read = f.econ().read();
    const repo = (read as unknown as { repos: { error: string | null; model: unknown }[] }).repos[0]!;
    expect(repo.model).toBeNull();
    expect(repo.error).toBe("realitytrace ledger export printed no JSON");
    expect(f.reader().ledger("R1")).toEqual({ ok: false, message: "realitytrace ledger export printed no JSON" });
    // And a verify that was cut off says so too.
    const g = fake(`printf '{"ok":tr'`);
    expect(g.reader().verify("R1")).toEqual({ ok: false, message: "realitytrace ledger verify printed no JSON" });
  });

  test("a broken chain (one row edited) is reported as not intact, with where", () => {
    const f = fake(`case "$1 $2" in "ledger verify") echo '{"ok":false,"verified_count":41,"first_divergence":{"append_ordinal":42,"expected":"aa","found":"bb"}}';; esac`);
    const verdict = f.reader().verify("R1");
    expect(verdict).toMatchObject({ ok: true, intact: false, records: 41 });
    expect((verdict as { divergence: string }).divergence).toContain('"append_ordinal":42');
    // An intact chain says so and counts its records; a missing "ok" is never read as intact.
    const g = fake(`echo '{"verified_count":10}'`);
    expect(g.reader().verify("R1")).toMatchObject({ ok: true, intact: false });
    const h = fake(`echo '{"ok":true,"verified_count":10}'`);
    expect(h.reader().verify("R1")).toEqual({ ok: true, intact: true, records: 10, divergence: null });
  });

  test("50MB output is read whole or refused in words, and never hangs or crashes", () => {
    // About 50 MB (1.2M rows of 42 bytes) of valid JSON rows that are not agent events.
    const f = fake(withLedger(`printf '['; yes '{"record_kind":"filler.row","payload":{}},' | head -n 1200000; printf '{"record_kind":"filler.row"}]'`));
    const started = Date.now();
    const read = f.econ().read();
    expect(Date.now() - started).toBeLessThan(60_000);
    // Read in full: the repository has no agent activity, and that is counted, not hidden.
    expect(read).toMatchObject({ state: "empty", skipped: { without_agent_activity: 1 } });
    // Output larger than the reader allows is refused in words (here the cap is exercised through the runner result).
    const refused = realityTraceEconomics({ realitytrace_bin: "x" }, () => ({ status: null, stdout: "", stderr: "", error: "spawnSync x ENOBUFS" }));
    const message = (refused.read() as { message: string }).message;
    expect(message).toContain("answer was too large to read");
  }, 120_000);

  test("an unknown record kind is ignored, not guessed at, and does not hide the known rows", () => {
    const rows = [...sampleLedger().slice(0, 6), { append_ordinal: 99, record_kind: "future.kind.v9", ledger_id: "L1", entry_hash: "x", payload: { anything: true, extensions: { agent_event: agentEvent({ name: "ghost", tokens: tok(7777, 0) }) } } }, { append_ordinal: 100, record_kind: 42, payload: "weird" }];
    const f = fake(withLedger(ledgerJson(rows)));
    const read = f.econ().read();
    expect(read.state).toBe("ok");
    const model = (read as unknown as { repos: { model: { audit: { agent_events: number } } }[] }).repos[0]!.model;
    // Only observation rows count: the unknown kind's embedded event is not taken as fact.
    expect(model.audit.agent_events).toBe(2);
    expect(JSON.stringify(model)).not.toContain("7777");
  });

  test("record dir not readable", () => {
    const f = fake(`cat "$XDG_DATA_HOME/ledger.json" 2>"$XDG_STATE_HOME/err" || { cat "$XDG_STATE_HOME/err" >&2; exit 1; }`);
    writeFileSync(join(f.data_home, "ledger.json"), "[]");
    chmodSync(f.data_home, 0o000);
    try {
      const read = f.econ().read();
      expect(read.state).toBe("unavailable");
      expect((read as { message: string }).message).toContain("failed (exit 1)");
      expect((read as { message: string }).message).toContain("Permission denied");
      expect(f.reader().repos()).toMatchObject({ ok: false });
    } finally {
      chmodSync(f.data_home, 0o700);
    }
  });

  test("a key in the program's error text is cut off at a short brief, not passed through whole", () => {
    const key = "x".repeat(600);
    const f = fake(`echo "${key}" >&2; exit 1`);
    const read = f.econ().read();
    expect((read as { message: string }).message.length).toBeLessThan(400);
  });
});

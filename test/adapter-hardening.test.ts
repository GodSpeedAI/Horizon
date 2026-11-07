// Regression tests for the blind critic's findings on the RealityTrace adapters (#11 to #14, #18) and the redaction helper.
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { redact } from "../src/adapters/redact.ts";
import { RealityTraceObligation } from "../src/adapters/realitytrace-obligation.ts";
import { realityTraceEconomics, recordReader } from "../src/adapters/realitytrace-economics.ts";

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
function fake(script: string, over: { timeoutMs?: number; maxBytes?: number } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "horizon-adapt-"));
  dirs.push(dir);
  mkdirSync(join(dir, "d"));
  mkdirSync(join(dir, "s"));
  const bin = join(dir, "realitytrace");
  writeFileSync(bin, `#!/bin/sh\n${script}\n`);
  chmodSync(bin, 0o755);
  return { dir, bin, obligation: () => new RealityTraceObligation({ bin, dataHome: join(dir, "d"), stateHome: join(dir, "s"), repoDir: join(dir, "repo"), ...over }) };
}
const input = { intentId: "i", statement: "s", target: "t", criteria: { minimum_relevance: "low", minimum_reliability: "low" } };
const PROBES = ["Authorization: Bearer abc.def.ghi", "wbs1.AAAAAAAAAAAAAAAAAAAA", "ghp_abcdefghijklmnopqrstuvwxyz0123456789", "gho_abcdefghijklmnopqrstuvwxyz0123456789", "github_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz", "token=hunter2", "password=hunter3"];

describe("redaction", () => {
  test("14 the helper masks every credential shape", () => {
    for (const probe of PROBES) {
      const out = redact(`failed: ${probe} (end)`);
      expect(out).not.toMatch(/abc\.def|AAAAAAAA|ghp_|gho_|github_pat_|hunter/);
      expect(out).toContain("failed:");
    }
    expect(redact("plain words stay")).toBe("plain words stay");
  });

  test("14 economics and obligation errors do not carry credentials", async () => {
    const f = fake(`echo "boom ${PROBES.join(" ")}" >&2; exit 1`);
    const econ = realityTraceEconomics({ realitytrace_bin: f.bin, data_home: join(f.dir, "d") }).read() as { message: string };
    const reader = recordReader({}, f.bin).repos() as { message: string };
    const thrown = await f.obligation().repo().then(() => "", (e) => String(e.message));
    for (const text of [econ.message, reader.message, thrown]) expect(text).not.toMatch(/abc\.def|AAAAAAAA|ghp_|gho_|github_pat_|hunter/);
    expect(thrown).toContain("boom");
  });
});

describe("obligation child process", () => {
  test("11 endless output is cut at the byte cap", async () => {
    const f = fake("exec yes x", { maxBytes: 1_000_000, timeoutMs: 20_000 });
    const started = Date.now();
    await expect(f.obligation().repo()).rejects.toThrow(/too large/);
    expect(Date.now() - started).toBeLessThan(5_000);
  }, 15_000);

  test("12 a timeout returns although a descendant keeps the pipes open", async () => {
    const f = fake(`(sleep 30) &\nsleep 30`, { timeoutMs: 200 });
    const started = Date.now();
    await expect(f.obligation().repo()).rejects.toThrow(/timed out/);
    expect(Date.now() - started).toBeLessThan(2_000);
  }, 15_000);

  test("13 repository set-up ignores commit hooks and checks the git exit codes", async () => {
    const f = fake(`case "$1 $2" in "repo list") echo '{"repos":[]}';; "repo enroll") echo '{"repo_id":"R1"}';; esac`);
    const hooks = join(f.dir, "hooks");
    mkdirSync(hooks);
    writeFileSync(join(hooks, "pre-commit"), "#!/bin/sh\nsleep 3\n");
    chmodSync(join(hooks, "pre-commit"), 0o755);
    const gitconfig = join(f.dir, "gitconfig");
    writeFileSync(gitconfig, `[core]\n\thooksPath = ${hooks}\n`);
    const before = { ...process.env };
    process.env.GIT_CONFIG_GLOBAL = gitconfig;
    try {
      const started = Date.now();
      expect(await f.obligation().repo()).toBe("R1");
      expect(Date.now() - started).toBeLessThan(2_500);
    } finally {
      process.env.GIT_CONFIG_GLOBAL = before.GIT_CONFIG_GLOBAL as string;
      if (before.GIT_CONFIG_GLOBAL === undefined) delete process.env.GIT_CONFIG_GLOBAL;
    }
    // A git that fails is an error in words, not a silent half-made repository.
    const g = fake(`echo '{"repos":[]}'`);
    const stub = mkdtempSync(join(tmpdir(), "stubgit-"));
    dirs.push(stub);
    writeFileSync(join(stub, "git"), "#!/bin/sh\necho 'fatal: nope' >&2\nexit 128\n");
    chmodSync(join(stub, "git"), 0o755);
    const path = process.env.PATH;
    process.env.PATH = `${stub}:${path}`;
    try {
      await expect(g.obligation().repo()).rejects.toThrow(/git .* failed/);
    } finally {
      process.env.PATH = path;
    }
  }, 20_000);
});

describe("projection shape", () => {
  test("18 a projection export of an unsupported shape reads as unavailable, not empty", () => {
    const f = fake(`case "$1 $2" in
  "repo list") echo '{"repos":[{"repo_id":"R1","state":"enrolled"}]}';;
  "ledger export") echo '[{"append_ordinal":1,"record_kind":"observation.recorded","payload":{"extensions":{"agent_event":{"event_id":"e","runtime":"claude","native_session_id":"s","kind":"usage","owner":"native"}}}}]';;
  "projections export") echo '{"unexpected":true}';;
esac`);
    const read = realityTraceEconomics({ realitytrace_bin: f.bin }).read() as unknown as { repos: { error: string | null }[] };
    expect(read.repos[0]!.error).toContain("unavailable: unexpected answer from the record keeper");
  });
});

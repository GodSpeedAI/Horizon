// The installer installs only what the stage digest and hashes bind (M1-M3 of the PR #18 review).
// Runs the real script with --verify-only (snapshot + digest + tree checks; no root, no install steps) on a small stage.
import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { stageDigest, stageRuntime } from "../scripts/gateway-setup.ts";

const SCRIPT = resolve(import.meta.dir, "../scripts/install-sea-forge-gateway.sh");
const dirs: string[] = [];
const tmp = (p: string) => {
  const d = mkdtempSync(join(tmpdir(), `gwi-${p}-`));
  dirs.push(d);
  return d;
};
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const sha = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");

/** A minimal stage with the same shape `gateway-setup.ts stage` writes. */
function makeStage(): string {
  const repo = tmp("repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  mkdirSync(join(repo, "node_modules", "pkg"), { recursive: true });
  mkdirSync(join(repo, "node_modules", ".bin"), { recursive: true });
  writeFileSync(join(repo, "src", "main.ts"), "export const a = 1;\n");
  writeFileSync(join(repo, "node_modules", "pkg", "cli.js"), "console.log(1);\n");
  symlinkSync("../pkg/cli.js", join(repo, "node_modules", ".bin", "pkg"));
  const stage = join(tmp("stage"), "bundle");
  mkdirSync(join(stage, "units"), { recursive: true });
  mkdirSync(join(stage, "config"), { recursive: true });
  const { manifest, symlinkManifest } = stageRuntime(repo, join(stage, "runtime"), ["src", "node_modules"]);
  writeFileSync(join(stage, "runtime-manifest.sha256"), manifest);
  writeFileSync(join(stage, "runtime-symlinks.tsv"), symlinkManifest);
  writeFileSync(join(stage, "plan.tsv"), "account\tsvc\tgateway\n");
  writeFileSync(join(stage, "status.json"), "{}\n");
  writeFileSync(join(stage, "units", "godspeed-sea-forge.service"), "[Service]\n");
  writeFileSync(join(stage, "units", "godspeed-horizon.service"), "[Service]\n");
  writeFileSync(join(stage, "config", "server.yaml.in"), "{}\n");
  writeFileSync(join(stage, "config", "policy.yaml"), "{}\n");
  return stage;
}

const bin = join(tmp("bin"), "server");
writeFileSync(bin, "fake gateway\n");
const bun = join(tmp("bun"), "bun");
writeFileSync(bun, "fake bun\n");

function verify(stage: string, opts: { digest?: string; extra?: string[]; env?: Record<string, string> } = {}) {
  const digest = opts.digest ?? stageDigest(stage);
  const r = Bun.spawnSync(
    ["bash", SCRIPT, "--verify-only", "--stage", stage, "--binary", bin, "--sha256", sha(readFileSync(bin)), "--bun", bun, "--bun-sha256", sha(readFileSync(bun)), "--expect-stage-sha256", digest, ...(opts.extra ?? [])],
    { env: { ...process.env, TMPDIR: tmpdir(), ...opts.env } },
  );
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

describe("installer verifies a snapshot of the stage", () => {
  test("g. a clean stage passes, and the shell digest equals the TypeScript digest", () => {
    const stage = makeStage();
    const r = verify(stage);
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(r.out).toContain(`digest ${stageDigest(stage)}`);
  });

  test("a. a digest mismatch refuses", () => {
    const r = verify(makeStage(), { digest: "0".repeat(64) });
    expect(r.code).toBe(1);
    expect(r.err).toContain("does not match the staged bundle digest");
  });

  test("b. an extra unlisted file in runtime/ refuses", () => {
    const stage = makeStage();
    writeFileSync(join(stage, "runtime", "src", "extra.ts"), "evil\n");
    const r = verify(stage);
    expect(r.code).toBe(1);
    expect(r.err).toContain("differ from the manifest");
    expect(r.err).toContain("src/extra.ts");
  });

  test("c. an extra symlink refuses", () => {
    const stage = makeStage();
    symlinkSync("main.ts", join(stage, "runtime", "src", "alias.ts"));
    const r = verify(stage);
    expect(r.code).toBe(1);
    expect(r.err).toContain("symlinks differ");
  });

  test("d. a changed symlink target refuses", () => {
    const stage = makeStage();
    const link = join(stage, "runtime", "node_modules", ".bin", "pkg");
    rmSync(link);
    symlinkSync("../../src/main.ts", link); // still inside the tree, but not the approved target
    const r = verify(stage);
    expect(r.code).toBe(1);
    expect(r.err).toContain("symlinks differ");
  });

  test("e. an absolute or escaping symlink refuses even when the list names it", () => {
    for (const target of ["/etc/passwd", "../../../outside"]) {
      const stage = makeStage();
      symlinkSync(target, join(stage, "runtime", "src", "bad"));
      appendFileSync(join(stage, "runtime-symlinks.tsv"), `symlink\t${target}\tsrc/bad\n`);
      const r = verify(stage, { digest: stageDigest(stage) }); // digest approved, so only the tree rule can refuse
      expect(r.code).toBe(1);
      expect(r.err).toMatch(/absolute symlink|escapes the runtime tree/);
    }
  });

  test("f. a staged file modified after the digest refuses (runtime file, unit, config, plan)", () => {
    for (const file of ["runtime/src/main.ts", "units/godspeed-horizon.service", "config/policy.yaml", "plan.tsv", "runtime-symlinks.tsv"]) {
      const stage = makeStage();
      const digest = stageDigest(stage);
      appendFileSync(join(stage, file), "tamper\n");
      const r = verify(stage, { digest });
      expect(r.code).toBe(1);
      // staged files fail the digest; a runtime file is bound by its manifest hash
      expect(r.err).toMatch(file.startsWith("runtime/") ? /differs from its manifest hash/ : /does not match the staged bundle digest/);
    }
  });

  test("an extra file or symlink outside runtime/ changes the digest, and a fifo or symlink there refuses", () => {
    const stage = makeStage();
    const digest = stageDigest(stage);
    writeFileSync(join(stage, "config", "other.yaml"), "x\n");
    expect(verify(stage, { digest }).code).toBe(1);
    expect(stageDigest(stage)).not.toBe(digest);
    rmSync(join(stage, "config", "other.yaml"));
    symlinkSync("policy.yaml", join(stage, "config", "link.yaml"));
    const r = verify(stage, { digest });
    expect(r.code).toBe(1);
    expect(r.err).toContain("non-regular entry in the stage");
  });

  test("a fifo in runtime/ refuses", () => {
    const stage = makeStage();
    expect(Bun.spawnSync(["mkfifo", join(stage, "runtime", "src", "pipe")]).exitCode).toBe(0);
    const r = verify(stage);
    expect(r.code).toBe(1);
    expect(r.err).toContain("non-regular entry");
  });

  test("a symlinked --binary is refused (pass the resolved path)", () => {
    const stage = makeStage();
    const link = join(tmp("lnk"), "server");
    symlinkSync(bin, link);
    const r = Bun.spawnSync(["bash", SCRIPT, "--verify-only", "--stage", stage, "--binary", link, "--sha256", sha(readFileSync(bin)), "--expect-stage-sha256", stageDigest(stage)]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.toString()).toContain("is a symlink");
  });

  test("h. changes to the original stage and binary after the snapshot do not affect what is verified", () => {
    const stage = makeStage();
    const b = join(tmp("race"), "server");
    writeFileSync(b, "approved\n");
    const hook = join(tmp("hook"), "hook.sh");
    // Runs right after the snapshot: the "agent" corrupts the original runtime file, the plan and the binary.
    writeFileSync(hook, `echo evil >> "${stage}/runtime/src/main.ts"\necho evil >> "${stage}/plan.tsv"\necho evil >> "${b}"\ntouch "${stage}/runtime/src/new.ts"\n`);
    const digest = stageDigest(stage);
    const r = Bun.spawnSync(
      ["bash", SCRIPT, "--verify-only", "--stage", stage, "--binary", b, "--sha256", sha("approved\n"), "--expect-stage-sha256", digest],
      { env: { ...process.env, INSTALLER_TEST_MODE: "1", INSTALLER_TEST_HOOK_AFTER_SNAPSHOT: hook } },
    );
    expect(r.stderr.toString()).toBe("");
    expect(r.exitCode).toBe(0);
    expect(readFileSync(join(stage, "plan.tsv"), "utf8")).toContain("evil"); // the hook really ran
    expect(readFileSync(b, "utf8")).toContain("evil");
    // and a fresh run (no snapshot race) now refuses, so the pass above came from the snapshot
    expect(verify(stage, { digest }).code).toBe(1);
  });

  test("the test hook is ignored without INSTALLER_TEST_MODE", () => {
    const stage = makeStage();
    const hook = join(tmp("hook2"), "hook.sh");
    writeFileSync(hook, `echo evil >> "${stage}/plan.tsv"\n`);
    const r = verify(stage, { env: { INSTALLER_TEST_HOOK_AFTER_SNAPSHOT: hook } });
    expect(r.code).toBe(0);
    expect(readFileSync(join(stage, "plan.tsv"), "utf8")).not.toContain("evil");
  });

  test("the snapshot directory is removed on exit, also on refusal", () => {
    const t = tmp("snaptmp");
    verify(makeStage(), { env: { TMPDIR: t } });
    verify(makeStage(), { digest: "0".repeat(64), env: { TMPDIR: t } });
    expect(readdirSync(t)).toEqual([]);
  });

  test("a symlink in the stage outside runtime/ is refused, not followed", () => {
    const stage = makeStage();
    const digest = stageDigest(stage);
    symlinkSync("/etc/hostname", join(stage, "units", "x.service"));
    expect(verify(stage, { digest }).err).toContain("non-regular entry in the stage");
  });
});

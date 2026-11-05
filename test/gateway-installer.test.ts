// The installer installs only what the stage digest and hashes bind (M1-M3 of the PR #18 review).
// Runs the real script with --verify-only (snapshot + digest + tree checks; no root, no install steps) on a small stage.
import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
  mkdirSync(join(repo, "domain"), { recursive: true });
  writeFileSync(join(repo, "domain", "w.sea"), "world\n");
  writeFileSync(join(repo, "src", "main.ts"), "export const a = 1;\n");
  writeFileSync(join(repo, "node_modules", "pkg", "cli.js"), "console.log(1);\n");
  symlinkSync("../pkg/cli.js", join(repo, "node_modules", ".bin", "pkg"));
  const stage = join(tmp("stage"), "bundle");
  mkdirSync(join(stage, "units"), { recursive: true });
  mkdirSync(join(stage, "config"), { recursive: true });
  const { manifest, symlinkManifest } = stageRuntime(repo, join(stage, "runtime"), ["src", "node_modules", "domain"]);
  writeFileSync(join(stage, "runtime-manifest.sha256"), manifest);
  writeFileSync(join(stage, "runtime-symlinks.tsv"), symlinkManifest);
  writeFileSync(
    join(stage, "plan.tsv"),
    [
      "account\tsvc\tgateway",
      "worlds\troot\tsock\t/x/worlds\truntime/domain",
      "deploy-tree\troot\troot\t/x/tree",
      "config-file\troot\tsock\t0640\t/x/server.yaml\tconfig/server.yaml.in",
      "config-file\troot\tsock\t0640\t/x/policy.yaml\tconfig/policy.yaml",
      "generated\troot\tsock\t0640\tstatus.json\t/x/status.json",
      "generated\troot\troot\t0644\tunits/godspeed-sea-forge.service\t/x/a.service",
      "generated\troot\troot\t0644\tunits/godspeed-horizon.service\t/x/b.service",
      "socket\t/x/s.sock",
    ].join("\n") + "\n",
  );
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
  // ---- round 2 -------------------------------------------------------------------------------------
  test("an extra directory in runtime/ refuses, and so does a missing one", () => {
    const stage = makeStage();
    mkdirSync(join(stage, "runtime", "src", "extra-dir"));
    let r = verify(stage);
    expect(r.code).toBe(1);
    expect(r.err).toContain("directories differ");
    expect(r.err).toContain("extra-dir");
    const stage2 = makeStage();
    mkdirSync(join(stage2, "runtime", "empty"));
    appendFileSync(join(stage2, "runtime-symlinks.tsv"), "dir\tempty\n");
    const digest = stageDigest(stage2);
    rmSync(join(stage2, "runtime", "empty"), { recursive: true });
    r = verify(stage2, { digest });
    expect(r.code).toBe(1);
    expect(r.err).toContain("directories differ");
  });

  test("a tab or newline in a runtime path or in a link target refuses", () => {
    for (const name of ["a\tb", "a\nb", "a\\b"]) {
      const stage = makeStage();
      writeFileSync(join(stage, "runtime", "src", name), "x\n");
      const r = verify(stage);
      expect(r.code).toBe(1);
      expect(r.err).toContain("newline, carriage return, tab or backslash");
      const stage2 = makeStage();
      mkdirSync(join(stage2, "runtime", "src", name));
      expect(verify(stage2).err).toContain("newline, carriage return, tab or backslash");
    }
    for (const target of ["main.ts\textra", "main.ts\nextra", "ma\\in.ts"]) {
      const stage = makeStage();
      symlinkSync(target, join(stage, "runtime", "src", "lnk"));
      const r = verify(stage);
      expect(r.code).toBe(1);
      expect(r.err).toContain("newline, carriage return, tab or backslash");
    }
  });

  test("a missing config/policy.yaml (or any plan source) makes --verify-only refuse", () => {
    for (const f of ["config/policy.yaml", "config/server.yaml.in", "status.json", "units/godspeed-horizon.service"]) {
      const stage = makeStage();
      rmSync(join(stage, f));
      const r = verify(stage); // the digest is recomputed over the truncated bundle, so only the plan check can refuse
      expect(r.code).toBe(1);
      // units and status.json are also caught by the early "is it staged" check; the config files only by the plan check
      expect(r.err).toMatch(new RegExp(`staged ${f.replace(/\./g, "\\.")} is missing or not a regular file|no staged bundle`));
    }
    const stage = makeStage();
    rmSync(join(stage, "runtime", "domain"), { recursive: true });
    // the manifest and list still name it, so this refuses on the tree; either way it must not pass
    expect(verify(stage).code).toBe(1);
  });

  test("a plan row with an unknown step or a plan source outside the stage refuses", () => {
    const stage = makeStage();
    appendFileSync(join(stage, "plan.tsv"), "generated\troot\troot\t0644\t../escape\t/x/e\n");
    expect(verify(stage).err).toContain("not a plain relative path");
    const stage2 = makeStage();
    appendFileSync(join(stage2, "plan.tsv"), "frobnicate\tx\n");
    expect(verify(stage2).err).toContain("unknown plan step");
  });

  test("a symlinked stage root is refused", () => {
    const stage = makeStage();
    const link = join(tmp("stagelnk"), "link");
    symlinkSync(stage, link);
    const r = verify(link, { digest: stageDigest(stage) });
    expect(r.code).toBe(1);
    expect(r.err).toContain("symlinked stage root is refused");
    expect(verify(link + "/", { digest: stageDigest(stage) }).code).toBe(1); // a trailing slash does not hide it
  });

  test("a fifo given as --binary is refused without hanging", () => {
    const stage = makeStage();
    const fifo = join(tmp("fifo"), "server");
    expect(Bun.spawnSync(["mkfifo", fifo]).exitCode).toBe(0);
    const r = Bun.spawnSync(["bash", SCRIPT, "--verify-only", "--stage", stage, "--binary", fifo, "--sha256", "0".repeat(64), "--expect-stage-sha256", stageDigest(stage)], { timeout: 15000 });
    expect(r.exitCode).toBe(1);
    expect(r.stderr.toString()).toContain("is not a regular file");
  });

  test("a binary hash mismatch does not print the actual hash", () => {
    const stage = makeStage();
    const r = Bun.spawnSync(["bash", SCRIPT, "--verify-only", "--stage", stage, "--binary", bin, "--sha256", "0".repeat(64), "--expect-stage-sha256", stageDigest(stage)]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr.toString()).toContain("does not match the approved sha256");
    expect(r.stderr.toString()).not.toContain(sha(readFileSync(bin)));
  });

  test("--verify-only with --authorize-privileged is refused", () => {
    const r = verify(makeStage(), { extra: ["--authorize-privileged"] });
    expect(r.code).toBe(2);
    expect(r.err).toContain("--verify-only cannot be combined with --authorize-privileged");
  });

  test("the test seam is refused when INSTALLER_TEST_MODE is set with --authorize-privileged", () => {
    const stage = makeStage();
    const hook = join(tmp("hook3"), "hook.sh");
    writeFileSync(hook, `echo evil >> "${stage}/plan.tsv"\n`);
    const r = Bun.spawnSync(["bash", SCRIPT, "--authorize-privileged", "--stage", stage, "--expect-stage-sha256", stageDigest(stage)], {
      env: { ...process.env, INSTALLER_TEST_MODE: "1", INSTALLER_TEST_HOOK_AFTER_SNAPSHOT: hook },
    });
    expect(r.exitCode).toBe(2);
    expect(r.stderr.toString()).toContain("INSTALLER_TEST_MODE cannot be combined with --authorize-privileged");
    expect(readFileSync(join(stage, "plan.tsv"), "utf8")).not.toContain("evil");
  });

  test("the hook receives only the original stage path, with TMPDIR unset and SNAP not exported", () => {
    const stage = makeStage();
    const out = join(tmp("hookout"), "seen");
    const hook = join(tmp("hook4"), "hook.sh");
    writeFileSync(hook, `printf '%s|%s|%s' "$1" "\${TMPDIR-unset}" "\${SNAP-unset}" > "${out}"\n`);
    const r = Bun.spawnSync(["bash", SCRIPT, "--verify-only", "--stage", stage, "--expect-stage-sha256", stageDigest(stage)], {
      env: { ...process.env, TMPDIR: tmpdir(), SNAP: "x", INSTALLER_TEST_MODE: "1", INSTALLER_TEST_HOOK_AFTER_SNAPSHOT: hook },
    });
    expect(r.exitCode).toBe(0);
    expect(readFileSync(out, "utf8")).toBe(`${stage}|unset|unset`);
  });

  test("root refuses HORIZON_GATEWAY_* and requires --stage (static: not testable without root)", () => {
    const text = readFileSync(SCRIPT, "utf8");
    expect(text).toContain("compgen -e | grep -q '^HORIZON_GATEWAY_'");
    expect(text).toContain("pass --stage DIR explicitly when running as root");
  });

  test("static: STAGE_SRC, BINARY_SRC and BUN_SRC never appear in an install step after the snapshot", () => {
    const lines = readFileSync(SCRIPT, "utf8").split("\n");
    const end = lines.findIndex((l) => l.startsWith("# SNAPSHOT-END"));
    expect(end).toBeGreaterThan(0);
    const message = /^\s*(say|refuse|echo|printf)\b|\brefuse "|_NOTE=|^\s*#|^\s*local /;
    for (const [i, l] of lines.entries()) {
      if (i <= end || !/\b(STAGE_SRC|BINARY_SRC|BUN_SRC)\b/.test(l)) continue;
      expect({ line: i + 1, text: l, ok: message.test(l) || /^\s+--(bun|stage|binary)/.test(l) }).toMatchObject({ ok: true });
    }
  });

  test("the sudo command is shell-quoted", () => {
    const stage = join(tmp("q"), "st $(touch pwned) age");
    const real = makeStage();
    Bun.spawnSync(["cp", "-a", real, stage]);
    const r = Bun.spawnSync(["bash", SCRIPT, "--dry-run", "--stage", stage], { env: { ...process.env, TMPDIR: tmpdir() } });
    expect(r.exitCode).toBe(0);
    const out = r.stdout.toString();
    expect(out).toContain("st\\ \\$\\(touch\\ pwned\\)\\ age");
    expect(out).not.toMatch(/--stage \/\S*st \$\(touch/);
  });
});

describe("deployed copy is verified again after the copy", () => {
  const deploy = (stage: string, dst: string, path?: string) =>
    Bun.spawnSync(["bash", SCRIPT, "--verify-only", "--stage", stage, "--expect-stage-sha256", stageDigest(stage)], {
      env: { ...process.env, TMPDIR: tmpdir(), INSTALLER_TEST_MODE: "1", INSTALLER_TEST_DEPLOY_DST: dst, ...(path ? { PATH: path } : {}) },
    });

  test("a clean copy is deployed and matches", () => {
    const dst = join(tmp("dst"), "tree");
    const r = deploy(makeStage(), dst);
    expect(r.stderr.toString()).toContain("");
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(dst, "src", "main.ts"))).toBe(true);
    expect(existsSync(`${dst}.manifest.sha256`)).toBe(true);
  });

  test("a copy that differs from the manifest after cp is refused and removed", () => {
    // a cp wrapper that corrupts the new tree after the real copy: only the post-copy verify_tree can catch it
    const wrap = tmp("wrap");
    const cp = Bun.spawnSync(["which", "cp"]).stdout.toString().trim();
    for (const [i, inject] of [`touch "$last/src/injected.ts"`, `mkdir "$last/src/injected-dir"`].entries()) {
      writeFileSync(join(wrap, "cp"), `#!/bin/bash\n${cp} "$@" || exit $?\nlast="\${@: -1}"\ncase "$last" in *.new-*) ${inject} ;; esac\n`, { mode: 0o755 });
      const dst = join(tmp(`dst${i}`), "tree");
      const r = deploy(makeStage(), dst, `${wrap}:${process.env.PATH}`);
      expect(r.exitCode).toBe(1);
      expect(r.stderr.toString()).toContain("copied runtime tree does not match the manifest");
      expect(existsSync(dst)).toBe(false);
      expect(readdirSync(join(dst, "..")).filter((n) => n.includes(".new-"))).toEqual([]);
    }
  });
});

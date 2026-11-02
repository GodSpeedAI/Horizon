import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { userInfo, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  DEFAULT_GATEWAY_ACCOUNT,
  DEFAULT_RUNTIME_ACCOUNT,
  DEFAULT_SOCKET_GROUP,
  UNIT_GATEWAY,
  UNIT_RUNTIME,
  buildPlan,
  decideBinaryPlacement,
  excludeReason,
  renderPlanTsv,
  resolveLayout,
  stageRuntime,
  statusRecord,
  unitFiles,
  validateLayout,
  worldIdentity,
  type GatewayLayout,
  type WorldIdentity,
} from "../scripts/gateway-setup.ts";
import { sidecarName } from "../scripts/gateway-identity.ts";

const repoRoot = resolve(import.meta.dir, "..");
const scratch: string[] = [];
const tempDir = (label: string) => {
  const d = mkdtempSync(join(tmpdir(), `gateway-${label}-`));
  scratch.push(d);
  return d;
};
afterAll(() => {
  for (const d of scratch) rmSync(d, { recursive: true, force: true });
});

// The pinned world identity, read the way ignite reads it, and the cognate ref the runtime is given.
const WORLD: WorldIdentity = await worldIdentity(repoRoot);

// Fake account names: nothing here is a real user, and none is derived from the process.
const FAKE = {
  HORIZON_GATEWAY_ACCOUNT: "acct-gw-fake",
  HORIZON_RUNTIME_ACCOUNT: "acct-rt-fake",
  HORIZON_GATEWAY_SOCKET_GROUP: "grp-fake-sock",
  HORIZON_OPERATOR_ACCOUNT: "op-fake",
};
const layoutFor = (root: string, extra: Record<string, string> = {}, development = false): GatewayLayout =>
  resolveLayout({ ...FAKE, HORIZON_GATEWAY_ROOT: root, ...extra }, { development, world: WORLD });

describe("resolveLayout defaults", () => {
  test("product-name defaults, and no default contains the launching login", () => {
    const l = resolveLayout({}, { world: WORLD });
    expect(l.gatewayAccount).toBe(DEFAULT_GATEWAY_ACCOUNT);
    expect(l.runtimeAccount).toBe(DEFAULT_RUNTIME_ACCOUNT);
    expect(l.socketGroup).toBe(DEFAULT_SOCKET_GROUP);
    expect(l.operatorAccount).toBeNull();
    expect(l.root).toBe("");
    expect(validateLayout(l)).toEqual([]);
    const me = userInfo().username;
    expect(JSON.stringify(l)).not.toContain(me);
  });

  test("environment overrides every name and path", () => {
    const l = layoutFor("/tmp/x", { HORIZON_GATEWAY_STATE_DIR: "/state/alt" });
    expect(l.gatewayAccount).toBe("acct-gw-fake");
    expect(l.gatewayStateDir).toBe("/state/alt");
    expect(l.binPath).toBe(`${l.binDir}/sea-forge-server`);
  });

  test("bun is copied to a root-owned directory outside /home by default", () => {
    const l = layoutFor("/tmp/x");
    expect(l.bunPath).toBe("/usr/local/lib/godspeed-horizon/bin/bun");
  });
});

describe("plan generation (pure, fake accounts and a temporary root)", () => {
  const root = "/tmp/gateway-root-fixture";
  const layout = layoutFor(root);
  const rows = buildPlan(layout);
  const socketGroupMembers = rows.filter((r) => r[0] === "member" && r[2] === FAKE.HORIZON_GATEWAY_SOCKET_GROUP).map((r) => r[1]);

  test("the layout is valid and the plan is non-empty", () => {
    expect(validateLayout(layout)).toEqual([]);
    expect(rows.length).toBeGreaterThan(10);
  });

  test("the operator account is in neither group and not in the socket group", () => {
    expect(socketGroupMembers.sort()).toEqual([FAKE.HORIZON_GATEWAY_ACCOUNT, FAKE.HORIZON_RUNTIME_ACCOUNT].sort());
    expect(rows.some((r) => r.includes(FAKE.HORIZON_OPERATOR_ACCOUNT))).toBe(false);
  });

  test("every path in the plan is under the configured root", () => {
    for (const r of rows) {
      for (const field of r.slice(1)) {
        if (field.startsWith("/")) expect(field.startsWith(`${root}/`)).toBe(true);
      }
    }
  });

  test("the socket directory is owned by the gateway, group socket, 0750, and never group-writable", () => {
    const dir = rows.find((r) => r[0] === "dir" && r[4] === `${root}${layout.socketDir}`);
    expect(dir).toBeDefined();
    expect(dir![1]).toBe(FAKE.HORIZON_GATEWAY_ACCOUNT);
    expect(dir![2]).toBe(FAKE.HORIZON_GATEWAY_SOCKET_GROUP);
    expect(dir![3]).toBe("0750");
    expect(Number.parseInt(dir![3]!, 8) & 0o020).toBe(0);
  });

  test("the runtime state directory is private (0700) and owned by the runtime account", () => {
    const rt = rows.find((r) => r[0] === "dir" && r[4] === `${root}${layout.runtimeStateDir}`);
    expect(rt?.slice(1, 4)).toEqual([FAKE.HORIZON_RUNTIME_ACCOUNT, FAKE.HORIZON_RUNTIME_ACCOUNT, "0700"]);
  });

  test("rendered plan and units contain no login name of the process", () => {
    const text = renderPlanTsv(rows) + Object.values(unitFiles(layout)).join("\n") + JSON.stringify(statusRecord(layout));
    expect(text).not.toContain(userInfo().username);
  });
});

describe("config lives under the gateway root (SEA_FORGE_ROOT)", () => {
  const root = "/tmp/gateway-config-fixture";
  const layout = layoutFor(root);
  const rows = buildPlan(layout);
  const gwDir = rows.find((r) => r[0] === "dir" && r[4] === `${root}${layout.gatewayStateDir}`);
  const configRows = rows.filter((r) => r[0] === "config-file");

  test("the gateway root is the gateway state directory, owned by the gateway, sticky so root-owned files in it cannot be removed or renamed by the gateway", () => {
    expect(gwDir?.slice(1, 4)).toEqual([FAKE.HORIZON_GATEWAY_ACCOUNT, FAKE.HORIZON_GATEWAY_ACCOUNT, "1700"]);
    expect(Number.parseInt(gwDir![3]!, 8) & 0o1000).not.toBe(0);
  });

  test("server.yaml and policy.yaml are root-owned, group socket, 0640, directly inside SEA_FORGE_ROOT", () => {
    const paths = configRows.map((r) => r[4]);
    expect(paths).toEqual([`${root}${layout.gatewayStateDir}/server.yaml`, `${root}${layout.gatewayStateDir}/policy.yaml`]);
    for (const r of configRows) expect(r.slice(1, 4)).toEqual(["root", FAKE.HORIZON_GATEWAY_SOCKET_GROUP, "0640"]);
  });

  test("no separate config directory is created in the plan", () => {
    expect(rows.some((r) => r.some((f) => f.includes(`/etc/${DEFAULT_GATEWAY_ACCOUNT}`)))).toBe(false);
  });

  test("the gateway unit points SEA_FORGE_ROOT at the gateway root and sets no separate config directory", () => {
    const gw = unitFiles(layout)[UNIT_GATEWAY]!;
    expect(gw).toContain(`Environment=SEA_FORGE_ROOT=${layout.gatewayStateDir}`);
    expect(gw).not.toContain("SEA_FORGE_CONFIG_DIR");
  });

  test("the config files are written by the installer, not by the gateway", () => {
    for (const r of configRows) expect(r[0]).toBe("config-file");
    expect(configRows.every((r) => r[1] === "root")).toBe(true);
  });
});

describe("runtime world reference and RealityTrace (as ignite.ts computes them)", () => {
  const layout = layoutFor("/tmp/world-root");
  const rt = unitFiles(layout)[UNIT_RUNTIME]!;

  test("the pinned world_ref in config/horizon.toml equals the one in the justfile", () => {
    const toml = (Bun.TOML.parse(readFileSync(join(repoRoot, "config", "horizon.toml"), "utf8")) as { world_ref: string }).world_ref;
    const just = /^world_ref := "([^"]+)"/m.exec(readFileSync(join(repoRoot, "justfile"), "utf8"))?.[1];
    expect(toml).toBe(WORLD.pinned);
    expect(just).toBe(WORLD.pinned);
  });

  test("the cognate world ref is what the semantic loader reports for the pinned world", () => {
    expect(WORLD.cognate).toMatch(/^world:[a-z0-9-]+@sha256:[0-9a-f]{64}$/);
  });

  test("the runtime unit carries COGNATE_WORLD_REF, the value ignite passes", () => {
    expect(rt).toContain(`Environment=COGNATE_WORLD_REF=${WORLD.cognate}`);
    expect(rt).toContain("Environment=COGNATE_GOVERNANCE=sea-forge");
  });

  test("the runtime unit carries the RealityTrace binary and homes under the runtime state directory", () => {
    expect(rt).toContain(`Environment=COGNATE_REALITYTRACE_BIN=${layout.realityTraceBin}`);
    expect(rt).toContain(`Environment=COGNATE_REALITYTRACE_DATA_HOME=${layout.runtimeStateDir}/realitytrace/data`);
    expect(rt).toContain(`Environment=COGNATE_REALITYTRACE_STATE_HOME=${layout.runtimeStateDir}/realitytrace/state`);
  });
});

describe("bun is copied to a root-owned location and the unit runs that copy", () => {
  const layout = layoutFor("/tmp/bun-root");
  const rows = buildPlan(layout);
  const rt = unitFiles(layout)[UNIT_RUNTIME]!;

  test("ExecStart points at the root-owned copy, not a path under /home", () => {
    expect(rt).toContain(`ExecStart=${layout.bunPath} run src/main.ts`);
    expect(layout.bunPath.startsWith("/home/")).toBe(false);
  });

  test("the plan has a place-bun step: root:root 0755 at the copy, verified by sha256 in the installer", () => {
    const place = rows.find((r) => r[0] === "place-bun");
    expect(place?.slice(1)).toEqual(["root", "root", "0755", `/tmp/bun-root${layout.bunPath}`]);
    expect(rows.some((r) => r[0] === "require-exec")).toBe(false);
  });

  test("a bun under /home is refused by validation", () => {
    expect(validateLayout(layoutFor("/tmp/r", { HORIZON_BUN_PATH: "/home/someone/.local/bin/bun" })).join("\n")).toContain("ProtectHome");
  });
});

describe("development uses the identical split", () => {
  test("the development plan and units equal production; only the status marker differs", () => {
    const prod = layoutFor("/tmp/dev-root");
    const dev = layoutFor("/tmp/dev-root", {}, true);
    expect(buildPlan(dev)).toEqual(buildPlan(prod));
    expect(unitFiles(dev)).toEqual(unitFiles(prod));
    expect(statusRecord(dev).environment).toBe("development");
    expect(statusRecord(prod).environment).toBe("production");
    expect(statusRecord(dev).mode).toBe("governed");
  });
});

describe("validation refuses unsafe layouts", () => {
  test("operator in a service group, same gateway and runtime, path with spaces", () => {
    expect(validateLayout(layoutFor("/tmp/r", { HORIZON_OPERATOR_ACCOUNT: "acct-gw-fake" })).join("\n")).toContain("must not be the gateway");
    expect(validateLayout(layoutFor("/tmp/r", { HORIZON_RUNTIME_ACCOUNT: "acct-gw-fake" })).join("\n")).toContain("separate accounts");
    expect(validateLayout(layoutFor("/tmp/r", { HORIZON_GATEWAY_STATE_DIR: "/var/has space" })).join("\n")).toContain("not usable");
  });

  test("a RealityTrace binary under /home is refused", () => {
    expect(validateLayout(layoutFor("/tmp/r", { HORIZON_REALITYTRACE_BIN: "/home/someone/.cargo/bin/realitytrace" })).join("\n")).toContain("ProtectHome");
  });
});

describe("unit files", () => {
  const layout = layoutFor("/tmp/unit-root");
  const units = unitFiles(layout);
  const gw = units[UNIT_GATEWAY]!;
  const rt = units[UNIT_RUNTIME]!;

  test("the gateway unit runs as the configured account with the hardening set", () => {
    expect(gw).toContain(`User=${FAKE.HORIZON_GATEWAY_ACCOUNT}`);
    expect(gw).toContain("NoNewPrivileges=yes");
    expect(gw).toContain("ProtectSystem=strict");
    expect(gw).toContain("ProtectHome=yes");
    expect(gw).toContain("PrivateTmp=yes");
    expect(gw).toContain(`ExecStart=${layout.binPath}`);
    expect(gw).toContain(`ReadWritePaths=${layout.gatewayStateDir} ${layout.socketDir}`);
  });

  test("the runtime unit runs as the runtime account, requires the gateway, and is governed", () => {
    expect(rt).toContain(`User=${FAKE.HORIZON_RUNTIME_ACCOUNT}`);
    expect(rt).toContain(`Requires=${UNIT_GATEWAY}`);
    expect(rt).toContain(`After=${UNIT_GATEWAY}`);
    expect(rt).toContain("HORIZON_APPROVAL_ASSURANCE=governed");
    expect(rt).toContain(`ReadWritePaths=${layout.runtimeStateDir}`);
    expect(rt).toContain("NoNewPrivileges=yes");
  });

  test("no unit names the operator account", () => {
    expect(gw + rt).not.toContain(FAKE.HORIZON_OPERATOR_ACCOUNT);
    expect(gw + rt).not.toContain(userInfo().username);
  });
});

describe("binary placement decisions", () => {
  const src = "a".repeat(64);
  test("install when absent, keep when identical, refuse when different", () => {
    expect(decideBinaryPlacement({ sourceSha256: src, existingSha256: null, replace: false })).toBe("install");
    expect(decideBinaryPlacement({ sourceSha256: src, existingSha256: src, replace: false })).toBe("keep");
    expect(decideBinaryPlacement({ sourceSha256: src, existingSha256: "b".repeat(64), replace: false })).toBe("refuse");
  });
  test("replace only with an explicit flag", () => {
    expect(decideBinaryPlacement({ sourceSha256: src, existingSha256: "b".repeat(64), replace: true })).toBe("replace");
  });
  test("sidecar names keep the old file and carry a UTC timestamp", () => {
    expect(sidecarName("/x/sea-forge-server", new Date("2026-11-02T10:11:12Z"))).toBe("/x/sea-forge-server.generated-20261102T101112Z");
  });
});

describe("staging", () => {
  const repo = tempDir("repo");
  mkdirSync(join(repo, "src", "nested"), { recursive: true });
  mkdirSync(join(repo, ".git"), { recursive: true });
  mkdirSync(join(repo, ".agents"), { recursive: true });
  mkdirSync(join(repo, "src", "scratch"), { recursive: true });
  mkdirSync(join(repo, "config"), { recursive: true });
  writeFileSync(join(repo, "src", "main.ts"), "export const a = 1;\n");
  writeFileSync(join(repo, "src", "nested", "util.ts"), "export const b = 2;\n");
  writeFileSync(join(repo, "src", ".env"), "TOKEN=should-not-ship\n");
  writeFileSync(join(repo, "src", "scratch", "x.ts"), "scratch\n");
  writeFileSync(join(repo, ".git", "HEAD"), "ref\n");
  writeFileSync(join(repo, ".agents", "note.md"), "note\n");
  writeFileSync(join(repo, "config", "local-operator.secret"), "hunter2\n");
  writeFileSync(join(repo, "config", "horizon.toml"), "[app]\n");
  writeFileSync(join(repo, "package.json"), "{}\n");
  const dest = join(tempDir("stage"), "runtime");
  const { result, manifest } = stageRuntime(repo, dest, ["src", "config", "package.json"]);

  test("excludes .git, .agents, scratch and secret-looking files", () => {
    expect(existsSync(join(dest, ".git"))).toBe(false);
    expect(existsSync(join(dest, "src", "scratch"))).toBe(false);
    expect(existsSync(join(dest, "src", ".env"))).toBe(false);
    expect(existsSync(join(dest, "config", "local-operator.secret"))).toBe(false);
    expect(existsSync(join(dest, "config", "horizon.toml"))).toBe(true);
    expect(result.excluded.length).toBe(3);
    expect(excludeReason("src/.env")).not.toBeNull();
    expect(excludeReason(".agents/x")).not.toBeNull();
  });

  test("the manifest lists every shipped file with its sha256 and nothing excluded", () => {
    const lines = manifest.trim().split("\n");
    expect(lines.length).toBe(result.files.length);
    for (const line of lines) {
      const m = /^([0-9a-f]{64})  (.+)$/.exec(line);
      expect(m).not.toBeNull();
      const bytes = readFileSync(join(dest, m![2]!));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(m![1] ?? "");
    }
    expect(manifest).not.toContain(".env");
    expect(manifest).not.toContain(".git/");
  });

  test("modes are root-deployable: directories 0755, files 0644", () => {
    for (const f of result.files) expect(statSync(join(dest, f)).mode & 0o777).toBe(0o644);
    for (const d of ["src", "src/nested", "config"]) expect(statSync(join(dest, d)).mode & 0o777).toBe(0o755);
  });
});

describe("installer (shell) against a temporary root", () => {
  const root = tempDir("root");
  const stage = join(tempDir("stage-root"), "bundle");
  const bin = join(tempDir("bin"), "sea-forge-server");
  writeFileSync(bin, "fake gateway binary\n");
  const sha = createHash("sha256").update(readFileSync(bin)).digest("hex");
  const bunBin = join(tempDir("bunbin"), "bun");
  writeFileSync(bunBin, "fake bun binary\n");
  const bunSha = createHash("sha256").update(readFileSync(bunBin)).digest("hex");
  const env = { ...process.env, HORIZON_GATEWAY_ROOT: root, ...FAKE, HORIZON_OPERATOR_ACCOUNT: "" };

  const run = async (args: string[], e: Record<string, string | undefined> = env) => {
    const p = Bun.spawn(["bash", resolve(repoRoot, "scripts/install-sea-forge-gateway.sh"), ...args], {
      env: e as Record<string, string>,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
    return { code: await p.exited, out, err };
  };

  test("stage then dry-run: plan printed, no change, digest matches the TypeScript stage", async () => {
    const st = Bun.spawn(["bun", "run", resolve(repoRoot, "scripts/gateway-setup.ts"), "stage", "--stage", stage, "--repo", repoRoot], {
      env: { ...env, HORIZON_GATEWAY_STAGE: stage } as Record<string, string>,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await st.exited).toBe(0);
    const stdout = await new Response(st.stdout).text();
    const tsDigest = /bundle digest: ([0-9a-f]{64})/.exec(stdout)?.[1];
    expect(tsDigest).toBeDefined();

    const dry = await run(["--dry-run", "--stage", stage, "--binary", bin, "--sha256", sha, "--bun", bunBin, "--bun-sha256", bunSha]);
    expect(dry.code).toBe(0);
    expect(dry.out).toContain(`stage digest: ${tsDigest}`);
    expect(dry.out).toContain("no changes made");
    expect(dry.out).toContain("sudo ");
    expect(dry.out).toContain("owner runs this step");
    expect(existsSync(join(root, "opt"))).toBe(false);
    expect(existsSync(join(root, "etc"))).toBe(false);
  }, 120_000); // the stage loads the semantic world, which can exceed bun's 5 s default

  test("the staged runtime tree and unit files contain no excluded names and carry the world ref", () => {
    expect(existsSync(join(stage, "runtime", ".git"))).toBe(false);
    expect(existsSync(join(stage, "runtime", ".agents"))).toBe(false);
    const unit = readFileSync(join(stage, "units", UNIT_RUNTIME), "utf8");
    expect(unit).not.toContain(userInfo().username);
    expect(unit).toMatch(/Environment=COGNATE_WORLD_REF=world:horizon@sha256:[0-9a-f]{64}\n/);
    expect(unit).toContain("ExecStart=/usr/local/lib/godspeed-horizon/bin/bun run src/main.ts");
  });

  test("checksum mismatch is refused in dry-run and in authorized mode", async () => {
    const wrong = "0".repeat(64);
    const dry = await run(["--dry-run", "--stage", stage, "--binary", bin, "--sha256", wrong]);
    expect(dry.code).toBe(1);
    expect(dry.err).toContain("not copied");
    const apply = await run(["--authorize-privileged", "--stage", stage, "--binary", bin, "--sha256", wrong, "--expect-stage-sha256", "x"]);
    expect(apply.code).toBe(1);
    expect(existsSync(join(root, "usr"))).toBe(false);
  });

  test("a bun checksum mismatch is refused before anything is copied", async () => {
    const dry = await run(["--dry-run", "--stage", stage, "--binary", bin, "--sha256", sha, "--bun", bunBin, "--bun-sha256", "0".repeat(64)]);
    expect(dry.code).toBe(1);
    expect(dry.err).toContain("bun");
    expect(dry.err).toContain("not copied");
  });

  test("authorized mode is refused without root and without the staged digest, changing nothing", async () => {
    if (process.getuid?.() === 0) return; // only meaningful for a non-root test run
    const r = await run(["--authorize-privileged", "--stage", stage, "--binary", bin, "--sha256", sha, "--expect-stage-sha256", "0".repeat(64)]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("must run as root");
    expect(existsSync(join(root, "opt"))).toBe(false);
  });

  test("a stage whose runtime tree was edited after staging is refused", async () => {
    const copy = join(tempDir("tamper"), "bundle");
    rmSync(copy, { recursive: true, force: true });
    mkdirSync(copy, { recursive: true });
    for (const f of ["plan.tsv", "runtime-manifest.sha256", "status.json"]) writeFileSync(join(copy, f), readFileSync(join(stage, f)));
    mkdirSync(join(copy, "units"));
    for (const f of readdirSync(join(stage, "units"))) writeFileSync(join(copy, "units", f), readFileSync(join(stage, "units", f)));
    const { cpSync } = await import("node:fs");
    cpSync(join(stage, "runtime"), join(copy, "runtime"), { recursive: true });
    writeFileSync(join(copy, "runtime", "package.json"), "{\"evil\":true}\n");
    const r = await run(["--dry-run", "--stage", copy, "--binary", bin, "--sha256", sha]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("does not match its manifest");
  });
});

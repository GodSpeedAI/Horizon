import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { seaForgeActorOf } from "../src/adapters/sea-forge-approvals.ts";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { userInfo, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  DEFAULT_GATEWAY_ACCOUNT,
  DEFAULT_RUNTIME_ACCOUNT,
  DEFAULT_SOCKET_GROUP,
  UNIT_GATEWAY,
  UNIT_RUNTIME,
  UID_PLACEHOLDER,
  buildPlan,
  decideBinaryPlacement,
  navigationCommitId,
  operatorRefFromConfig,
  renderPolicyYaml,
  SOCKET_GID_PLACEHOLDER,
  renderServerYaml,
  serverConfig,
  validateServerConfig,
  worldFiles,
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
import { planConfigWrite, sidecarName } from "../scripts/gateway-identity.ts";

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
// The operator actor the gateway is generated for: read from config/horizon.toml, never a constant here.
const OPERATOR = operatorRefFromConfig(repoRoot);

// Fake account names: nothing here is a real user, and none is derived from the process.
const FAKE = {
  HORIZON_GATEWAY_ACCOUNT: "acct-gw-fake",
  HORIZON_RUNTIME_ACCOUNT: "acct-rt-fake",
  HORIZON_GATEWAY_SOCKET_GROUP: "grp-fake-sock",
  HORIZON_OPERATOR_ACCOUNT: "op-fake",
};
const layoutFor = (root: string, extra: Record<string, string> = {}, development = false): GatewayLayout =>
  resolveLayout({ ...FAKE, HORIZON_GATEWAY_ROOT: root, ...extra }, { development, world: WORLD, operatorRef: OPERATOR });

describe("operator identity: one value from config, shared by the unit and server.yaml", () => {
  test("the runtime unit and the gateway's delegable actor carry the configured ref", () => {
    const l = layoutFor("/tmp/op-root");
    expect(unitFiles(l)[UNIT_RUNTIME]).toContain(`Environment=COGNATE_SEA_FORGE_OPERATOR=${OPERATOR}\n`);
    const bound = seaForgeActorOf(OPERATOR);
    expect(serverConfig(l, [], 4242).gateway.delegable_actors).toEqual([bound]);
    expect(serverConfig(l, [], 4242).identity.bindings.find((b) => b.actor_id === bound)?.uid).toBeUndefined();
  });
  test("the principal is actor:<id>, and the gateway binds the bare id", () => {
    expect(OPERATOR).toBe("actor:operator");
    expect(seaForgeActorOf(OPERATOR)).toBe("operator");
  });
  test("a ref the gateway cannot accept is refused when staging, not in SEA-Forge", () => {
    const dir = mkdtempSync(join(tmpdir(), "op-ref-"));
    try {
      mkdirSync(join(dir, "config"));
      writeFileSync(join(dir, "config", "horizon.toml"), '[identity]\noperator_ref = "operator"\n');
      expect(() => operatorRefFromConfig(dir)).toThrow(/must be actor:<id>/);
      writeFileSync(join(dir, "config", "horizon.toml"), '[identity]\noperator_ref = "actor:has space"\n');
      expect(() => operatorRefFromConfig(dir)).toThrow(/gateway's rule/);
      writeFileSync(join(dir, "config", "horizon.toml"), "[identity]\nsource = \"os_session\"\n");
      expect(() => operatorRefFromConfig(dir)).toThrow(/no identity.operator_ref/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("socket group: the gateway's server.yaml names the runtime's group by gid, rendered at install", () => {
  test("the staged server.yaml carries the placeholder, and the validator accepts it", () => {
    const l = layoutFor("/tmp/sock-root");
    const files = worldFiles(join(repoRoot, "domain"));
    const cfg = serverConfig(l, files, 4242);
    expect(cfg.socket_gid).toBe(SOCKET_GID_PLACEHOLDER);
    expect(renderServerYaml(cfg)).toContain(`"socket_gid": "${SOCKET_GID_PLACEHOLDER}"`);
    expect(validateServerConfig(cfg)).toEqual([]);
  });
  test("a root gid is refused, and a numeric non-root gid is accepted", () => {
    const l = layoutFor("/tmp/sock-root");
    const files = worldFiles(join(repoRoot, "domain"));
    expect(validateServerConfig({ ...serverConfig(l, files, 4242), socket_gid: 0 }).join("|")).toMatch(/not root/);
    expect(validateServerConfig({ ...serverConfig(l, files, 4242), socket_gid: 1002 })).toEqual([]);
  });
});

describe("resolveLayout defaults", () => {
  test("product-name defaults, and no default contains the launching login", () => {
    const l = resolveLayout({}, { world: WORLD, operatorRef: OPERATOR });
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

  test("the gateway root is the gateway state directory, owned by the gateway, at the 0711 the gateway's own hardening enforces", () => {
    expect(gwDir?.slice(1, 4)).toEqual([FAKE.HORIZON_GATEWAY_ACCOUNT, FAKE.HORIZON_GATEWAY_ACCOUNT, "711"]);
    expect(Number.parseInt(gwDir![3]!, 8)).toBe(0o711);
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
    expect(gw).toContain(`ReadOnlyPaths=${layout.gatewayStateDir}/server.yaml ${layout.gatewayStateDir}/policy.yaml`);
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
    mkdirSync(join(copy, "config"));
    for (const f of ["server.yaml.in", "policy.yaml"]) writeFileSync(join(copy, "config", f), readFileSync(join(stage, "config", f)));
    const { cpSync } = await import("node:fs");
    cpSync(join(stage, "runtime"), join(copy, "runtime"), { recursive: true });
    writeFileSync(join(copy, "runtime", "package.json"), "{\"evil\":true}\n");
    const r = await run(["--dry-run", "--stage", copy, "--binary", bin, "--sha256", sha]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("does not match its manifest");
  }, 120_000); // copies the staged runtime tree, which carries node_modules (hundreds of MB)
});

describe("server.yaml and policy.yaml (rendered from the runtime account's uid, never a constant)", () => {
  const root = "/tmp/gateway-server-fixture";
  const layout = layoutFor(root);
  const files = worldFiles(join(repoRoot, "domain"));
  const render = (uid: number | typeof UID_PLACEHOLDER) => renderServerYaml(serverConfig(layout, files, uid));

  test("the rendered file carries the uid given as input, in both the binding and the gateway", () => {
    for (const uid of [4242, 5151]) {
      const cfg = JSON.parse(render(uid));
      expect(cfg.identity.bindings[0]).toEqual({ uid, actor_id: "cognate-service", roles: ["service"] });
      expect(cfg.gateway.uid).toBe(uid);
      expect(render(uid)).not.toContain(`"uid": ${uid === 4242 ? 5151 : 4242}`);
    }
  });

  test("the staged template, with the placeholder replaced the way the installer's sed does, equals the TypeScript render", () => {
    const template = render(UID_PLACEHOLDER);
    expect(template).toContain(`"${UID_PLACEHOLDER}"`);
    const sed = Bun.spawnSync(["sed", `s/"${UID_PLACEHOLDER}"/4242/g`], { stdin: Buffer.from(template) });
    expect(sed.stdout.toString()).toBe(render(4242));
  });

  test("the operator is bound with its role and no uid; only the operator is delegable", () => {
    const cfg = JSON.parse(render(4242));
    expect(cfg.identity.bindings[1]).toEqual({ actor_id: "operator", roles: ["operator"] });
    expect("uid" in cfg.identity.bindings[1]).toBe(false);
    expect(cfg.gateway.delegable_actors).toEqual(["operator"]);
    expect(cfg.gateway.actor).toBe("cognate-service");
    expect(validateServerConfig(serverConfig(layout, files, 4242))).toEqual([]);
  });

  test("the file never contains the test runner's own uid, the username, or ignite's unbound sentinel", () => {
    const text = render(4242);
    const own = process.getuid?.();
    if (own !== undefined && own !== 4242) expect(text).not.toContain(`"uid": ${own}`);
    expect(text).not.toContain(userInfo().username);
    expect(text).not.toContain("4294967000");
  });

  test("keys match the ones scripts/ignite.ts writes for a cell", () => {
    const ignite = readFileSync(join(repoRoot, "scripts", "ignite.ts"), "utf8");
    const keys = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { keys.add(k); walk(x); }
    };
    walk(JSON.parse(render(4242)));
    // socket_gid is a gateway-only key (the runtime group's gid, rendered at install). The cell generator never writes it.
    keys.delete("socket_gid");
    for (const k of keys) expect(ignite.includes(`${k}:`) || ignite.includes(`${k},`) || ignite.includes(`${k} `)).toBe(true);
  });

  test("the cell policy ignite writes lets the operator and agents add steps", () => {
    const ignite = readFileSync(join(repoRoot, "scripts", "ignite.ts"), "utf8");
    expect(ignite).toContain("{ name: operator-adds-steps, verdict: allow, actor_role: operator, operation_kind: discretionary_task_add }");
    expect(ignite).toContain("{ name: operator-finishes-steps, verdict: allow, actor_role: operator, operation_kind: human_task_completion }");
    expect(ignite).toContain("{ name: agents-propose-steps, verdict: allow, actor_role: service, operation_kind: discretionary_task_add }");
    expect(ignite).toContain("proposed steps still need a person to finish them");
  });

  test("validation refuses a duplicate uid, a uid on the operator, an unbound or duplicate delegable actor, the gateway as delegable, and root", () => {
    const base = () => JSON.parse(render(4242)) as ReturnType<typeof serverConfig>;
    const dupUid = base();
    dupUid.identity.bindings[1]!.uid = 4242;
    expect(validateServerConfig(dupUid).join("|")).toMatch(/more than one actor/);
    const opUid = base();
    opUid.identity.bindings[1]!.uid = 5151;
    expect(validateServerConfig(opUid).join("|")).toMatch(/operator actor must be bound with no uid/);
    const selfDelegable = base();
    selfDelegable.gateway.delegable_actors = ["cognate-service"];
    expect(validateServerConfig(selfDelegable).join("|")).toMatch(/must not be delegable/);
    const dupDelegable = base();
    dupDelegable.gateway.delegable_actors = ["operator", "operator"];
    expect(validateServerConfig(dupDelegable).join("|")).toMatch(/duplicate/);
    const unbound = base();
    unbound.gateway.delegable_actors = ["operator", "ghost"];
    expect(validateServerConfig(unbound).join("|")).toMatch(/no binding/);
    const rootUid = base();
    rootUid.identity.bindings[0]!.uid = 0;
    rootUid.gateway.uid = 0;
    expect(validateServerConfig(rootUid).join("|")).toMatch(/not root/);
    expect(validateServerConfig(JSON.parse(render(UID_PLACEHOLDER))).join("|")).toMatch(/not root/);
  });

  test("the world entry is among its files, and the policy names the commit resource", async () => {
    expect(files).toContain("interaction-model.sea");
    const policy = renderPolicyYaml(await navigationCommitId());
    expect(policy).toContain("actor_role: operator");
    expect(policy).toContain(await navigationCommitId());
    expect(() => renderPolicyYaml('bad"id')).toThrow();
  });

  test("the plan renders server.yaml and policy.yaml from templates and copies the worlds, with gateway-owned realitytrace homes", () => {
    const rows = buildPlan(layout);
    const cfg = rows.filter((r) => r[0] === "config-file");
    expect(cfg.map((r) => r[5])).toEqual(["config/server.yaml.in", "config/policy.yaml"]);
    expect(rows.some((r) => r[0] === "worlds" && r[4] === "runtime/domain")).toBe(true);
    expect(rows.filter((r) => r[0] === "dir" && (r[4] ?? "").includes("/realitytrace/")).length).toBe(2);
  });

  test("an existing authoritative file is never overwritten: identical is kept, differing gets a timestamped sidecar", () => {
    const dir = tempDir("authoritative");
    const path = join(dir, "server.yaml");
    const rendered = render(4242);
    expect(planConfigWrite(null, rendered).action).toBe("write");
    writeFileSync(path, rendered);
    expect(planConfigWrite(readFileSync(path, "utf8"), rendered).action).toBe("keep");
    const hand = rendered.replace("4242", "7777");
    writeFileSync(path, hand);
    const plan = planConfigWrite(readFileSync(path, "utf8"), rendered);
    expect(plan.action).toBe("sidecar");
    const side = sidecarName(path, new Date("2026-11-02T10:00:00Z"));
    writeFileSync(side, rendered);
    expect(side).toMatch(/server\.yaml\.generated-20261102T100000Z$/);
    expect(readFileSync(path, "utf8")).toBe(hand);
  });

  test("the development flag changes the status marker only, not the rendered identity", () => {
    const dev = layoutFor(root, {}, true);
    expect(renderServerYaml(serverConfig(dev, files, 4242))).toBe(render(4242));
    expect(statusRecord(dev).environment).toBe("development");
  });
});

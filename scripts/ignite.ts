/**
 * `bun run ignite`: start a governed Horizon cockpit on this machine.
 *
 * One cell directory holds everything the run owns: the SEA-Forge configuration, its policy, a copy
 * of Horizon's world, the RealityTrace homes, the Horizon store and the per-launch secret. The cell
 * is created on first run and reused afterwards, so a restart keeps cases, commits and evidence.
 * The policy file is written once and then belongs to the operator.
 *
 * The wiring is the one test/J02-live.test.ts proves: this uid is the Horizon service and the
 * SEA-Forge gateway; the operator has no uid and acts only through the gateway (on_behalf_of).
 * Missing prerequisites stop the launch with the step that fixes them; nothing degrades silently.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { loadWorld } from "../src/adapters/semantic.ts";
import { NAVIGATION_INTENT_COMMIT } from "../src/capabilities/navigation-intent.ts";
import { REMOTE_DEFAULT_PORT, publicOriginOf } from "../src/remote/settings.ts";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
if (args.includes("--help")) {
  console.log(`usage: bun run ignite [--cell DIR] [--approve-commits] [--remote [PUBLIC_URL]] [--remote-port N]

  --cell DIR          cell directory (default: $XDG_DATA_HOME/horizon/cell)
  --approve-commits   on first run, write a policy where every commit needs your approval
  --remote [URL]      make phone remote control available: a loopback listener on 127.0.0.1:4320,
                      or, with URL (https://host), a public origin your tunnel serves. Nothing is
                      started until you press Start in the cockpit's panel, and no tunnel is started.
  --remote-port N     the loopback port for the phone listener (default 4320)

  SEA_FORGE_SERVER_BIN and REALITYTRACE_BIN override the binaries found on PATH.`);
  process.exit(0);
}

const repo = resolve(import.meta.dir, "..");
const dataHome = process.env.XDG_DATA_HOME?.trim() || join(homedir(), ".local", "share");
const cell = resolve(opt("cell") ?? join(dataHome, "horizon", "cell"));
// --remote [PUBLIC_URL]: the settings the cockpit panel's Start uses. The listener itself stays off until then.
const remoteFlag = args.indexOf("--remote");
const remoteArg = remoteFlag === -1 ? undefined : args[remoteFlag + 1];
const remote = remoteFlag === -1 ? null : {
  port: opt("remote-port") ?? String(REMOTE_DEFAULT_PORT),
  publicUrl: remoteArg !== undefined && !remoteArg.startsWith("--") ? publicOriginOf(remoteArg) : null,
};

function fail(what: string, fix: string): never {
  console.error(`ignite: ${what}\n  fix: ${fix}`);
  process.exit(1);
}

function which(bin: string): string | undefined {
  const found = spawnSync("sh", ["-c", `command -v "${bin}"`], { encoding: "utf8" });
  return found.status === 0 ? found.stdout.trim() : undefined;
}

// 1. Prerequisites, each with its fix.
if (process.platform !== "linux") fail(`unsupported platform '${process.platform}'`, "run on Linux or WSL2 (see docs/IGNITION.md)");
if (typeof process.getuid !== "function") fail("no POSIX uid available", "run on Linux or WSL2");
const server = process.env.SEA_FORGE_SERVER_BIN?.trim() || which("sea-forge-server");
if (!server) fail("sea-forge-server not found", "install the SEA-Forge release (docs/IGNITION.md step 2) or set SEA_FORGE_SERVER_BIN");
const rt = process.env.REALITYTRACE_BIN?.trim() || which("realitytrace");
if (!rt) fail("realitytrace not found", "cargo install realitytrace --locked (docs/IGNITION.md step 3) or set REALITYTRACE_BIN");
if (!existsSync(join(repo, "node_modules"))) fail("dependencies are not installed", "run `just setup` in the Horizon checkout");

// 2. The cell.
const seaFiles = (root: string, dir = root, out: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "validation" || e.name === "__pycache__") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) seaFiles(root, p, out);
    else if (e.isFile() && e.name.endsWith(".sea")) out.push(relative(root, p).split("\\").join("/"));
  }
  return out;
};
mkdirSync(cell, { recursive: true, mode: 0o700 });
// The world copy always matches this checkout's pinned world.
rmSync(join(cell, "worlds"), { recursive: true, force: true });
const domain = join(repo, "domain");
const files = seaFiles(domain);
for (const f of files) {
  mkdirSync(dirname(join(cell, "worlds", f)), { recursive: true });
  writeFileSync(join(cell, "worlds", f), readFileSync(join(domain, f)));
}

const policyPath = join(cell, "policy.yaml");
if (!existsSync(policyPath)) {
  const approve = args.includes("--approve-commits");
  writeFileSync(
    policyPath,
    `# SEA-Forge policy for this Horizon cell. Written once by \`bun run ignite\`; yours to edit.
# SEA-Forge rereads it on every decision, so edits apply without a restart.
version: "0.1"
rules:
  - name: navigation-commit
    verdict: allow
${approve ? "    requires_approval: true\n" : ""}    actor_role: service
    operation_kind: cognate_capability
    resources: ["${NAVIGATION_INTENT_COMMIT.id}"]
  - { name: horizon-capabilities, verdict: allow, actor_role: service, operation_kind: cognate_capability }
  - { name: horizon-actions, verdict: allow, actor_role: service, operation_kind: cognate_action }
  - { name: operator-approves, verdict: allow, actor_role: operator, operation_kind: approval_resolution }
  - { name: evidence, verdict: allow, actor_role: service, operation_kind: evidence_mutation }
  - { name: settlement, verdict: allow, actor_role: service, operation_kind: settlement_declaration }
`,
  );
}

const uid = process.getuid();
const UNBOUND_UID = 4_294_967_000; // the operator never connects directly; it acts through the gateway
// A Unix socket path is limited to ~100 bytes: keep it in the cell when it fits, else in the runtime dir.
const cellSocket = join(cell, "sea-forge.sock");
const socket =
  Buffer.byteLength(cellSocket) <= 95
    ? cellSocket
    : join(process.env.XDG_RUNTIME_DIR?.trim() || tmpdir(), `horizon-${createHash("sha256").update(cell).digest("hex").slice(0, 12)}.sock`);
const rtData = join(cell, "realitytrace", "data");
const rtState = join(cell, "realitytrace", "state");
writeFileSync(
  join(cell, "server.yaml"),
  JSON.stringify(
    {
      socket_path: socket,
      root: cell,
      identity: { bindings: [{ uid, actor_id: "cognate-service", roles: ["service"] }, { uid: UNBOUND_UID, actor_id: "operator", roles: ["operator"] }] },
      gateway: { uid, actor: "cognate-service", delegable_actors: ["operator"] },
      cep_authority: {
        enabled: true,
        policy: "policy.yaml",
        worlds: [{ name: "horizon", base: "worlds", entry: "interaction-model.sea", files }],
        realitytrace: { bin: rt, data_home: rtData, state_home: rtState, require_corroboration: true },
      },
    },
    null,
    2,
  ),
);

// 3. SEA-Forge, then the cockpit.
if (existsSync(socket)) {
  const probe = spawnSync("sh", ["-c", `command -v ss >/dev/null && ss -xl | grep -qF "${socket}"`]);
  if (probe.status === 0) fail(`a SEA-Forge server is already listening on ${socket}`, "stop the other `bun run ignite`, or pass --cell with a different directory");
  rmSync(socket, { force: true });
}
const logPath = join(cell, "sea-forge.log");
const sf = spawn(server, [], {
  env: { ...process.env, SEA_FORGE_ROOT: cell, SEA_FORGE_SOCKET: socket },
  stdio: ["ignore", openSync(logPath, "a"), openSync(logPath, "a")],
});
const children = [sf];
const stopAll = () => {
  for (const c of children.reverse()) if (c.exitCode === null) c.kill("SIGTERM");
};
process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);
sf.on("exit", (code) => {
  if (code !== 0 && code !== null) {
    console.error(`ignite: sea-forge-server exited with code ${code}; see ${logPath}`);
    stopAll();
    process.exit(1);
  }
});
const deadline = Date.now() + 30_000;
while (!existsSync(socket)) {
  if (Date.now() > deadline) {
    stopAll();
    fail("SEA-Forge did not open its socket within 30s", `read ${logPath}`);
  }
  await Bun.sleep(100);
}

// Read world_ref without loadConfig, which would also write a launch secret.
const configPath = resolve(repo, process.env.HORIZON_CONFIG ?? "config/horizon.toml");
const world = loadWorld((Bun.TOML.parse(readFileSync(configPath, "utf8")) as { world_ref: string }).world_ref);
console.log(`ignite: cell ${cell}`);
console.log(`ignite: SEA-Forge ${server} (log ${logPath})`);
console.log(`ignite: RealityTrace ${rt}`);
if (remote !== null) {
  const cockpitPort = (Bun.TOML.parse(readFileSync(configPath, "utf8")) as { port?: number }).port ?? 4319;
  console.log(`ignite: phone remote available: ${remote.publicUrl ?? `listener 127.0.0.1:${remote.port}, this machine only`}`);
  console.log(`ignite: start it from http://127.0.0.1:${cockpitPort}/workspace/remote`);
}
const cockpit = spawn("bun", ["run", "src/main.ts"], {
  cwd: repo,
  stdio: "inherit",
  env: {
    ...process.env,
    HORIZON_STORE: join(cell, "app.sqlite"),
    HORIZON_SECRET_FILE: join(cell, "local-operator.secret"),
    COGNATE_GOVERNANCE: "sea-forge",
    COGNATE_SEA_FORGE_SOCKET: socket,
    COGNATE_WORLD_REF: world.cognateWorldRef,
    COGNATE_SEA_FORGE_OPERATOR: "operator",
    COGNATE_REALITYTRACE_BIN: rt,
    COGNATE_REALITYTRACE_DATA_HOME: rtData,
    COGNATE_REALITYTRACE_STATE_HOME: rtState,
    ...(remote === null ? {} : { HORIZON_REMOTE_PORT: remote.port, ...(remote.publicUrl === null ? {} : { HORIZON_REMOTE_PUBLIC_URL: remote.publicUrl }) }),
  },
});
children.push(cockpit);
cockpit.on("exit", (code) => {
  stopAll();
  process.exit(code ?? 0);
});

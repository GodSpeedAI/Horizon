/**
 * Two-account setup for the SEA-Forge gateway and the Horizon runtime: pure plan rules, unit files,
 * and unprivileged staging. `bun run scripts/gateway-setup.ts stage` writes a staging directory that the
 * root installer (scripts/install-sea-forge-gateway.sh) reads. Nothing here touches the live system.
 *
 * Accounts: the SEA-Forge gateway account, the Horizon runtime account, and the operator's own login.
 * The operator must be in neither group and must have no path to the socket or the deployed tree.
 * Every name and path comes from configuration (env), with product-name defaults; nothing is derived
 * from the launching user. `HORIZON_GATEWAY_ROOT` prefixes filesystem operations only, for tests.
 */
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PRODUCT = "godspeed";
export const DEFAULT_GATEWAY_ACCOUNT = `${PRODUCT}-sea-forge`;
export const DEFAULT_RUNTIME_ACCOUNT = `${PRODUCT}-horizon`;
export const DEFAULT_SOCKET_GROUP = `${PRODUCT}-sock`;
export const UNIT_GATEWAY = `${PRODUCT}-sea-forge.service`;
export const UNIT_RUNTIME = `${PRODUCT}-horizon.service`;
/** Top-level entries of the repository that the deployed runtime tree needs. */
export const RUNTIME_ENTRIES = ["src", "domain", "config", "package.json", "bun.lock", "tsconfig.json", "node_modules"];

export type Environment = "production" | "development";

/** Logical paths are as the system sees them; `root` is prepended only for filesystem operations. */
export interface GatewayLayout {
  root: string;
  environment: Environment;
  gatewayAccount: string;
  runtimeAccount: string;
  socketGroup: string;
  operatorAccount: string | null;
  socketDir: string;
  socketPath: string;
  configDir: string;
  gatewayStateDir: string;
  runtimeStateDir: string;
  binDir: string;
  binPath: string;
  runtimeTree: string;
  unitDir: string;
  bunPath: string;
}

/** One privileged step. Fields are tab-separated in plan.tsv; paths are physical (root applied). */
export type PlanRow = string[];

/** Explicit configuration: env overrides, product-name defaults. Nothing is derived from the launching user. */
export function resolveLayout(env: Record<string, string | undefined>, options: { development?: boolean } = {}): GatewayLayout {
  const pick = (v: string | undefined) => (v?.trim() ? v.trim() : undefined);
  const socketDir = pick(env.HORIZON_GATEWAY_SOCKET_DIR) ?? `/run/${DEFAULT_GATEWAY_ACCOUNT}`;
  const binDir = pick(env.HORIZON_GATEWAY_BIN_DIR) ?? `/usr/local/lib/${DEFAULT_GATEWAY_ACCOUNT}/bin`;
  return {
    root: (pick(env.HORIZON_GATEWAY_ROOT) ?? "").replace(/\/+$/, ""),
    environment: options.development ? "development" : "production",
    gatewayAccount: pick(env.HORIZON_GATEWAY_ACCOUNT) ?? DEFAULT_GATEWAY_ACCOUNT,
    runtimeAccount: pick(env.HORIZON_RUNTIME_ACCOUNT) ?? DEFAULT_RUNTIME_ACCOUNT,
    socketGroup: pick(env.HORIZON_GATEWAY_SOCKET_GROUP) ?? DEFAULT_SOCKET_GROUP,
    operatorAccount: pick(env.HORIZON_OPERATOR_ACCOUNT) ?? null,
    socketDir,
    socketPath: pick(env.HORIZON_GATEWAY_SOCKET) ?? `${socketDir}/sea-forge.sock`,
    configDir: pick(env.HORIZON_GATEWAY_CONFIG_DIR) ?? `/etc/${DEFAULT_GATEWAY_ACCOUNT}`,
    gatewayStateDir: pick(env.HORIZON_GATEWAY_STATE_DIR) ?? `/var/lib/${DEFAULT_GATEWAY_ACCOUNT}`,
    runtimeStateDir: pick(env.HORIZON_RUNTIME_STATE_DIR) ?? `/var/lib/${DEFAULT_RUNTIME_ACCOUNT}`,
    binDir,
    binPath: `${binDir}/sea-forge-server`,
    runtimeTree: pick(env.HORIZON_RUNTIME_TREE) ?? `/opt/${DEFAULT_RUNTIME_ACCOUNT}`,
    unitDir: pick(env.HORIZON_UNIT_DIR) ?? "/etc/systemd/system",
    bunPath: pick(env.HORIZON_BUN_PATH) ?? "/usr/local/bin/bun",
  };
}

const ACCOUNT_RE = /^[a-z_][a-z0-9_-]{0,31}$/;
const BAD_PATH_CHARS = /[\s"'%\\]/; // systemd specifiers and quoting would change the unit meaning

const inside = (child: string, parent: string) => child === parent || child.startsWith(`${parent}/`);

/** Every rule the plan depends on. Empty result means the layout may be planned. */
export function validateLayout(l: GatewayLayout): string[] {
  const errors: string[] = [];
  const accounts: [string, string][] = [
    ["gateway account", l.gatewayAccount],
    ["runtime account", l.runtimeAccount],
    ["socket group", l.socketGroup],
  ];
  for (const [label, name] of accounts) if (!ACCOUNT_RE.test(name)) errors.push(`${label} '${name}' is not a valid system name`);
  if (l.gatewayAccount === l.runtimeAccount) errors.push("the gateway and the runtime must be separate accounts");
  if (l.operatorAccount !== null && [l.gatewayAccount, l.runtimeAccount, l.socketGroup].includes(l.operatorAccount)) {
    errors.push(`operator account '${l.operatorAccount}' must not be the gateway, the runtime, or in the socket group`);
  }
  if (l.root !== "" && (!isAbsolute(l.root) || BAD_PATH_CHARS.test(l.root))) errors.push(`HORIZON_GATEWAY_ROOT '${l.root}' must be an absolute path without spaces`);
  const paths: [string, string][] = [
    ["socket directory", l.socketDir],
    ["socket path", l.socketPath],
    ["config directory", l.configDir],
    ["gateway state directory", l.gatewayStateDir],
    ["runtime state directory", l.runtimeStateDir],
    ["binary directory", l.binDir],
    ["runtime tree", l.runtimeTree],
    ["unit directory", l.unitDir],
    ["bun", l.bunPath],
  ];
  for (const [label, p] of paths) {
    if (!isAbsolute(p)) errors.push(`${label} '${p}' must be absolute`);
    else if (p === "/" || BAD_PATH_CHARS.test(p)) errors.push(`${label} '${p}' is not usable (root, spaces, quotes or systemd specifiers)`);
    else if (normalize(p) !== p || p.split("/").includes("..")) errors.push(`${label} '${p}' must be normalized`);
  }
  if (!l.socketPath.startsWith(`${l.socketDir}/`)) errors.push("the socket path must be inside the socket directory");
  if (inside(l.runtimeTree, l.runtimeStateDir) || inside(l.runtimeStateDir, l.runtimeTree)) errors.push("the runtime tree and its state directory must not overlap");
  if (inside(l.runtimeTree, l.configDir) || inside(l.runtimeTree, l.socketDir)) errors.push("the runtime tree must not sit inside the socket or config directory");
  if (/^\/(home|root)(\/|$)/.test(l.bunPath)) errors.push(`bun '${l.bunPath}' is under /home or /root; the runtime unit uses ProtectHome=yes, so install bun outside them`);
  const stateDirs = [l.socketDir, l.configDir, l.gatewayStateDir, l.runtimeStateDir, l.binDir];
  if (new Set(stateDirs).size !== stateDirs.length) errors.push("socket, config, state and binary directories must be distinct");
  return errors;
}

const phys = (l: GatewayLayout, p: string) => `${l.root}${p}`;

/** The complete privileged plan, in execution order. Pure: no filesystem access. */
export function buildPlan(l: GatewayLayout): PlanRow[] {
  const sock = l.socketGroup;
  const gw = l.gatewayAccount;
  const rt = l.runtimeAccount;
  const rows: PlanRow[] = [
    ["account", gw, "gateway"],
    ["account", rt, "runtime"],
    ["group", sock],
    ["member", gw, sock],
    ["member", rt, sock],
    ["dir", "root", "root", "0755", phys(l, dirname(l.binDir))],
    ["dir", "root", "root", "0755", phys(l, l.binDir)],
    ["dir", gw, sock, "0750", phys(l, l.socketDir)],
    ["dir", "root", sock, "0750", phys(l, l.configDir)],
    ["dir", gw, gw, "0700", phys(l, l.gatewayStateDir)],
    ["dir", rt, rt, "0700", phys(l, l.runtimeStateDir)],
    ["require-exec", phys(l, l.bunPath)],
    ["place-binary", "root", "root", "0755", phys(l, l.binPath)],
    ["deploy-tree", "root", "root", phys(l, l.runtimeTree)],
    ["fixmode", "root", sock, "0640", phys(l, `${l.configDir}/server.yaml`)],
    ["fixmode", "root", sock, "0640", phys(l, `${l.configDir}/policy.yaml`)],
    ["generated", "root", sock, "0640", "status.json", phys(l, `${l.configDir}/status.json`)],
    ["generated", "root", "root", "0644", `units/${UNIT_GATEWAY}`, phys(l, `${l.unitDir}/${UNIT_GATEWAY}`)],
    ["generated", "root", "root", "0644", `units/${UNIT_RUNTIME}`, phys(l, `${l.unitDir}/${UNIT_RUNTIME}`)],
    ["socket", phys(l, l.socketPath)],
  ];
  return rows;
}

export function renderPlanTsv(rows: PlanRow[]): string {
  return `${rows.map((r) => r.join("\t")).join("\n")}\n`;
}

/** Systemd units. Accounts, paths and the bun binary come from the layout; nothing is hardcoded. */
export function unitFiles(l: GatewayLayout): Record<string, string> {
  const sock = l.socketGroup;
  const gateway = [
    "# Generated by scripts/gateway-setup.ts. Regenerate with `just gateway-stage`; do not edit.",
    "[Unit]",
    "Description=SEA-Forge gateway (governance authority)",
    `Before=${UNIT_RUNTIME}`,
    "",
    "[Service]",
    "Type=simple",
    `User=${l.gatewayAccount}`,
    `Group=${l.gatewayAccount}`,
    `SupplementaryGroups=${sock}`,
    `ExecStart=${l.binPath}`,
    `WorkingDirectory=${l.gatewayStateDir}`,
    `Environment=SEA_FORGE_ROOT=${l.gatewayStateDir}`,
    `Environment=SEA_FORGE_SOCKET=${l.socketPath}`,
    `Environment=SEA_FORGE_CONFIG_DIR=${l.configDir}`,
    "UMask=0007",
    "Restart=on-failure",
    "NoNewPrivileges=yes",
    "ProtectSystem=strict",
    "ProtectHome=yes",
    "PrivateTmp=yes",
    `ReadWritePaths=${l.gatewayStateDir} ${l.socketDir}`,
    "",
    "[Install]",
    "WantedBy=multi-user.target",
    "",
  ].join("\n");
  const runtime = [
    "# Generated by scripts/gateway-setup.ts. Regenerate with `just gateway-stage`; do not edit.",
    "[Unit]",
    "Description=Horizon cockpit (governed runtime)",
    `Requires=${UNIT_GATEWAY}`,
    `After=${UNIT_GATEWAY}`,
    "",
    "[Service]",
    "Type=simple",
    `User=${l.runtimeAccount}`,
    `Group=${l.runtimeAccount}`,
    `SupplementaryGroups=${sock}`,
    `WorkingDirectory=${l.runtimeTree}`,
    `ExecStart=${l.bunPath} run src/main.ts`,
    "Environment=HORIZON_APPROVAL_ASSURANCE=governed",
    `Environment=HORIZON_STORE=${l.runtimeStateDir}/app.sqlite`,
    `Environment=HORIZON_SECRET_FILE=${l.runtimeStateDir}/local-operator.secret`,
    "Environment=COGNATE_GOVERNANCE=sea-forge",
    `Environment=COGNATE_SEA_FORGE_SOCKET=${l.socketPath}`,
    "Environment=COGNATE_SEA_FORGE_OPERATOR=operator",
    "UMask=0027",
    "Restart=on-failure",
    "NoNewPrivileges=yes",
    "ProtectSystem=strict",
    "ProtectHome=yes",
    "PrivateTmp=yes",
    `ReadWritePaths=${l.runtimeStateDir}`,
    "",
    "[Install]",
    "WantedBy=multi-user.target",
    "",
  ].join("\n");
  return { [UNIT_GATEWAY]: gateway, [UNIT_RUNTIME]: runtime };
}

export function statusRecord(l: GatewayLayout) {
  return {
    mode: "governed",
    environment: l.environment,
    approvals: "isolated",
    gateway_account: l.gatewayAccount,
    runtime_account: l.runtimeAccount,
    socket_group: l.socketGroup,
    note:
      l.environment === "development"
        ? "development: the production two-account split on this machine; marked development"
        : "gateway and runtime run as separate service accounts",
  };
}

/** Binary placement: install when absent, keep when identical, replace only when asked (old kept as a sidecar). */
export function decideBinaryPlacement(input: { sourceSha256: string; existingSha256: string | null; replace: boolean }): "install" | "keep" | "replace" | "refuse" {
  if (input.existingSha256 === null) return "install";
  if (input.existingSha256 === input.sourceSha256) return "keep";
  return input.replace ? "replace" : "refuse";
}

// ---- staging -------------------------------------------------------------------------------------

const SEGMENT_EXCLUDES = new Set([".git", ".agents", ".tmp", "scratch", ".cognate"]);
const SECRET_NAME = /secret|credential|password|private[-_.]?key|^\.env(\.|$)|\.(key|pem|p12|pfx|db|sqlite3?|sqlite3?-wal|sqlite3?-shm)$|^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i;

/** Why a repository-relative path must not reach the deployed tree, or null when it may. */
export function excludeReason(rel: string): string | null {
  const parts = rel.split("/");
  if (parts[0] === "tmp") return "scratch directory tmp";
  for (const p of parts) if (SEGMENT_EXCLUDES.has(p)) return `excluded directory ${p}`;
  if (SECRET_NAME.test(parts[parts.length - 1] ?? "")) return "secret-looking name";
  return null;
}

export interface StageResult {
  files: string[];
  excluded: string[];
  symlinks: number;
}

function copyTree(src: string, dst: string, rel: string, out: StageResult): void {
  const entries = readdirSync(join(src, rel), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const ent of entries) {
    const r = rel === "" ? ent.name : `${rel}/${ent.name}`;
    const reason = excludeReason(r);
    if (reason !== null) {
      out.excluded.push(`${r} (${reason})`);
      continue;
    }
    const from = join(src, r);
    const to = join(dst, r);
    if (ent.isSymbolicLink()) {
      symlinkSync(readlinkSync(from), to);
      out.symlinks++;
    } else if (ent.isDirectory()) {
      mkdirSync(to, { mode: 0o755, recursive: true });
      chmodSync(to, 0o755);
      copyTree(src, dst, r, out);
    } else if (ent.isFile()) {
      copyFileSync(from, to);
      chmodSync(to, 0o644);
      out.files.push(r);
    }
  }
}

export function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Copy the runtime entries of `repo` into `dest` with root-owned modes (0755 dirs, 0644 files), skipping
 * .git, .agents, .tmp, scratch and secret-looking files, and return the sha256sum-format manifest text.
 */
export function stageRuntime(repo: string, dest: string, entries: string[] = RUNTIME_ENTRIES): { result: StageResult; manifest: string } {
  const result: StageResult = { files: [], excluded: [], symlinks: 0 };
  mkdirSync(dest, { recursive: true, mode: 0o755 });
  chmodSync(dest, 0o755);
  for (const entry of entries) {
    const from = join(repo, entry);
    if (!existsSync(from)) throw new Error(`runtime entry missing from repository: ${entry}`);
    const reason = excludeReason(entry);
    if (reason !== null) {
      result.excluded.push(`${entry} (${reason})`);
      continue;
    }
    if (statSync(from).isDirectory()) {
      mkdirSync(join(dest, entry), { mode: 0o755, recursive: true });
      chmodSync(join(dest, entry), 0o755);
      copyTree(repo, dest, entry, result);
    } else {
      copyFileSync(from, join(dest, entry));
      chmodSync(join(dest, entry), 0o644);
      result.files.push(entry);
    }
  }
  result.files.sort();
  const manifest = result.files.map((f) => `${sha256(readFileSync(join(dest, f)))}  ${f}`).join("\n") + "\n";
  return { result, manifest };
}

/** Digest over the staged bundle, in the order the installer checks it. Must match the shell digest. */
export function stageDigest(stage: string): string {
  const parts = [
    join(stage, "plan.tsv"),
    join(stage, "runtime-manifest.sha256"),
    join(stage, "units", UNIT_GATEWAY),
    join(stage, "units", UNIT_RUNTIME),
    join(stage, "status.json"),
  ];
  return sha256(Buffer.concat(parts.map((p) => readFileSync(p))));
}

export function defaultStageDir(env: Record<string, string | undefined> = process.env): string {
  return env.HORIZON_GATEWAY_STAGE?.trim() || join(env.XDG_CACHE_HOME?.trim() || join(homedir(), ".cache"), PRODUCT, "gateway-stage");
}

function stage(args: string[]): number {
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const stageDir = resolve(flag("--stage") ?? defaultStageDir());
  const repo = resolve(flag("--repo") ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
  const development = args.includes("--development");
  const layout = resolveLayout(process.env, { development });
  const errors = validateLayout(layout);
  if (errors.length > 0) {
    for (const e of errors) console.error(`gateway-stage: ${e}`);
    return 1;
  }
  for (const f of ["plan.tsv", "runtime-manifest.sha256", "status.json"]) rmSync(join(stageDir, f), { force: true });
  rmSync(join(stageDir, "runtime"), { recursive: true, force: true });
  mkdirSync(join(stageDir, "units"), { recursive: true });
  writeFileSync(join(stageDir, "plan.tsv"), renderPlanTsv(buildPlan(layout)));
  const { result, manifest } = stageRuntime(repo, join(stageDir, "runtime"));
  writeFileSync(join(stageDir, "runtime-manifest.sha256"), manifest);
  for (const [name, text] of Object.entries(unitFiles(layout))) writeFileSync(join(stageDir, "units", name), text);
  writeFileSync(join(stageDir, "status.json"), `${JSON.stringify(statusRecord(layout), null, 2)}\n`);
  console.log(`gateway-stage: ${layout.environment} bundle in ${stageDir}`);
  console.log(`  runtime tree: ${result.files.length} files hashed, ${result.symlinks} symlinks copied, ${result.excluded.length} excluded`);
  for (const e of result.excluded.slice(0, 20)) console.log(`    excluded ${e}`);
  console.log(`  bundle digest: ${stageDigest(stageDir)}`);
  console.log("next (privileged, you run it): see `just gateway-install <sea-forge-server path> <sha256>`");
  return 0;
}

if (import.meta.main) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "stage") process.exit(stage(rest));
  console.error("usage: bun run scripts/gateway-setup.ts stage [--stage DIR] [--repo DIR] [--development]");
  process.exit(2);
}

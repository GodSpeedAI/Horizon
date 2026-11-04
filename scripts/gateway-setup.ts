/**
 * Two-account setup for the SEA-Forge gateway and the Horizon runtime: pure plan rules, unit files,
 * and unprivileged staging. `bun run scripts/gateway-setup.ts stage` writes a staging directory that the
 * root installer (scripts/install-sea-forge-gateway.sh) reads. Nothing here touches the live system.
 *
 * Accounts: the SEA-Forge gateway account, the Horizon runtime account, and the operator's own login.
 * The operator must be in neither group and must have no path to the socket or the deployed tree.
 * Every name and path comes from configuration (env), with product-name defaults; nothing is derived
 * from the launching user. `HORIZON_GATEWAY_ROOT` prefixes filesystem operations only, for tests.
 *
 * Config: sea-forge-server reads `<SEA_FORGE_ROOT>/server.yaml`, so the gateway root IS the gateway state
 * directory. Its config files (server.yaml, policy.yaml) are root-owned 0640 inside it; the directory is
 * owned by the gateway at 0711 (the mode the gateway's own hardening enforces: traverse-only for others).
 * The gateway can write its own state there, and it cannot write a root-owned file. It CAN replace one by
 * rename or unlink, because a directory's owner may remove any entry in it, sticky or not. Config integrity
 * against the gateway therefore rests on the file ownership and mode, not on the directory. Runtime world identity and RealityTrace settings are the ones
 * scripts/ignite.ts passes to the cockpit, read from config/horizon.toml and the semantic loader.
 */
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { seaForgeActorOf } from "../src/adapters/sea-forge-approvals.ts";

export const PRODUCT = "godspeed";
export const DEFAULT_GATEWAY_ACCOUNT = `${PRODUCT}-sea-forge`;
export const DEFAULT_RUNTIME_ACCOUNT = `${PRODUCT}-horizon`;
export const DEFAULT_SOCKET_GROUP = `${PRODUCT}-sock`;
export const UNIT_GATEWAY = `${PRODUCT}-sea-forge.service`;
export const UNIT_RUNTIME = `${PRODUCT}-horizon.service`;
/** Top-level entries of the repository that the deployed runtime tree needs. */
export const RUNTIME_ENTRIES = ["src", "domain", "config", "package.json", "bun.lock", "tsconfig.json", "node_modules"];
const WORLD_REF_RE = /^world:[a-z0-9-]+@sha256:[0-9a-f]{64}$/;

export type Environment = "production" | "development";

/** The pinned world (config/horizon.toml) and the cognate ref the runtime is given (as ignite.ts computes it). */
export interface WorldIdentity {
  pinned: string;
  cognate: string;
}

/** Logical paths are as the system sees them; `root` is prepended only for filesystem operations. */
export interface GatewayLayout {
  root: string;
  environment: Environment;
  gatewayAccount: string;
  runtimeAccount: string;
  socketGroup: string;
  operatorAccount: string | null;
  /** The operator principal ref (`actor:<id>`), from config. server.yaml uses its SEA-Forge actor id. */
  operatorRef: string;
  socketDir: string;
  socketPath: string;
  /** Gateway root: SEA_FORGE_ROOT, holds server.yaml and policy.yaml (root-owned) and the gateway's own state. */
  gatewayStateDir: string;
  runtimeStateDir: string;
  binDir: string;
  binPath: string;
  runtimeTree: string;
  unitDir: string;
  bunPath: string;
  realityTraceBin: string;
  world: WorldIdentity;
}

/** One privileged step. Fields are tab-separated in plan.tsv; paths are physical (root applied). */
export type PlanRow = string[];

/** Explicit configuration: env overrides, product-name defaults. Nothing is derived from the launching user. */
export function resolveLayout(
  env: Record<string, string | undefined>,
  options: { development?: boolean; world: WorldIdentity; operatorRef: string },
): GatewayLayout {
  const pick = (v: string | undefined) => (v?.trim() ? v.trim() : undefined);
  const socketDir = pick(env.HORIZON_GATEWAY_SOCKET_DIR) ?? `/run/${DEFAULT_GATEWAY_ACCOUNT}`;
  const binDir = pick(env.HORIZON_GATEWAY_BIN_DIR) ?? `/usr/local/lib/${DEFAULT_GATEWAY_ACCOUNT}/bin`;
  const runtimeBinDir = `/usr/local/lib/${DEFAULT_RUNTIME_ACCOUNT}/bin`;
  return {
    root: (pick(env.HORIZON_GATEWAY_ROOT) ?? "").replace(/\/+$/, ""),
    environment: options.development ? "development" : "production",
    gatewayAccount: pick(env.HORIZON_GATEWAY_ACCOUNT) ?? DEFAULT_GATEWAY_ACCOUNT,
    runtimeAccount: pick(env.HORIZON_RUNTIME_ACCOUNT) ?? DEFAULT_RUNTIME_ACCOUNT,
    socketGroup: pick(env.HORIZON_GATEWAY_SOCKET_GROUP) ?? DEFAULT_SOCKET_GROUP,
    operatorAccount: pick(env.HORIZON_OPERATOR_ACCOUNT) ?? null,
    socketDir,
    socketPath: pick(env.HORIZON_GATEWAY_SOCKET) ?? `${socketDir}/sea-forge.sock`,
    gatewayStateDir: pick(env.HORIZON_GATEWAY_STATE_DIR) ?? `/var/lib/${DEFAULT_GATEWAY_ACCOUNT}`,
    runtimeStateDir: pick(env.HORIZON_RUNTIME_STATE_DIR) ?? `/var/lib/${DEFAULT_RUNTIME_ACCOUNT}`,
    binDir,
    binPath: `${binDir}/sea-forge-server`,
    runtimeTree: pick(env.HORIZON_RUNTIME_TREE) ?? `/opt/${DEFAULT_RUNTIME_ACCOUNT}`,
    unitDir: pick(env.HORIZON_UNIT_DIR) ?? "/etc/systemd/system",
    bunPath: pick(env.HORIZON_BUN_PATH) ?? `${runtimeBinDir}/bun`,
    realityTraceBin: pick(env.HORIZON_REALITYTRACE_BIN) ?? `${runtimeBinDir}/realitytrace`,
    world: options.world,
    operatorRef: options.operatorRef,
  };
}

/** Read the pinned world_ref from config/horizon.toml, then ask the semantic loader for the cognate ref ignite passes. */
export async function worldIdentity(repo: string): Promise<WorldIdentity> {
  const config = Bun.TOML.parse(readFileSync(join(repo, "config", "horizon.toml"), "utf8")) as { world_ref?: unknown };
  if (typeof config.world_ref !== "string") throw new Error("config/horizon.toml has no world_ref");
  const { loadWorld } = await import("../src/adapters/semantic.ts");
  const loaded = loadWorld(config.world_ref, join(repo, "domain"));
  return { pinned: config.world_ref, cognate: loaded.cognateWorldRef };
}

/**
 * The operator's principal ref, from `identity.operator_ref` in config/horizon.toml. It goes to the runtime
 * unit (COGNATE_SEA_FORGE_OPERATOR, which must equal the runtime's operator ref) and, mapped through
 * seaForgeActorOf, to server.yaml (the operator binding and delegable actor). One source, one mapping.
 */
export function operatorRefFromConfig(repo: string): string {
  const config = Bun.TOML.parse(readFileSync(join(repo, "config", "horizon.toml"), "utf8")) as { identity?: { operator_ref?: unknown } };
  const ref = config.identity?.operator_ref;
  if (typeof ref !== "string" || ref === "") throw new Error("config/horizon.toml has no identity.operator_ref");
  seaForgeActorOf(ref); // throws if the gateway could not bind it
  return ref;
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
  if (!WORLD_REF_RE.test(l.world.pinned)) errors.push(`pinned world_ref '${l.world.pinned}' must be world:<name>@sha256:<64 hex>`);
  if (!WORLD_REF_RE.test(l.world.cognate)) errors.push(`cognate world ref '${l.world.cognate}' must be world:<name>@sha256:<64 hex>`);
  const paths: [string, string][] = [
    ["socket directory", l.socketDir],
    ["socket path", l.socketPath],
    ["gateway state directory", l.gatewayStateDir],
    ["runtime state directory", l.runtimeStateDir],
    ["binary directory", l.binDir],
    ["runtime tree", l.runtimeTree],
    ["unit directory", l.unitDir],
    ["bun", l.bunPath],
    ["RealityTrace binary", l.realityTraceBin],
  ];
  for (const [label, p] of paths) {
    if (!isAbsolute(p)) errors.push(`${label} '${p}' must be absolute`);
    else if (p === "/" || BAD_PATH_CHARS.test(p)) errors.push(`${label} '${p}' is not usable (root, spaces, quotes or systemd specifiers)`);
    else if (normalize(p) !== p || p.split("/").includes("..")) errors.push(`${label} '${p}' must be normalized`);
  }
  if (!l.socketPath.startsWith(`${l.socketDir}/`)) errors.push("the socket path must be inside the socket directory");
  if (inside(l.runtimeTree, l.runtimeStateDir) || inside(l.runtimeStateDir, l.runtimeTree)) errors.push("the runtime tree and its state directory must not overlap");
  if (inside(l.runtimeTree, l.gatewayStateDir) || inside(l.runtimeTree, l.socketDir)) errors.push("the runtime tree must not sit inside the socket or gateway state directory");
  for (const [label, p] of [
    ["bun", l.bunPath],
    ["RealityTrace binary", l.realityTraceBin],
  ] as const) {
    if (/^\/(home|root)(\/|$)/.test(p)) errors.push(`${label} '${p}' is under /home or /root; the runtime unit uses ProtectHome=yes, so install it outside them`);
  }
  const stateDirs = [l.socketDir, l.gatewayStateDir, l.runtimeStateDir, l.binDir];
  if (new Set(stateDirs).size !== stateDirs.length) errors.push("socket, gateway state and binary directories must be distinct");
  return errors;
}

const phys = (l: GatewayLayout, p: string) => `${l.root}${p}`;

/** The complete privileged plan, in execution order. Pure: no filesystem access. */
export function buildPlan(l: GatewayLayout): PlanRow[] {
  const sock = l.socketGroup;
  const gw = l.gatewayAccount;
  const rt = l.runtimeAccount;
  const runtimeBinDirs = [...new Set([dirname(l.bunPath), dirname(l.realityTraceBin)])];
  const rows: PlanRow[] = [
    ["account", gw, "gateway"],
    ["account", rt, "runtime"],
    ["group", sock],
    ["member", gw, sock],
    ["member", rt, sock],
    ["dir", "root", "root", "0755", phys(l, dirname(l.binDir))],
    ["dir", "root", "root", "0755", phys(l, l.binDir)],
    ...runtimeBinDirs.map((d) => ["dir", "root", "root", "0755", phys(l, d)]),
    ["dir", gw, sock, "0750", phys(l, l.socketDir)],
    // Gateway root: owner gateway, 0711 as the gateway's own hardening enforces. Config files below are root-owned 0640;
    // the gateway can still replace them by rename (directory owner), which the sticky bit would not prevent.
    ["dir", gw, gw, "711", phys(l, l.gatewayStateDir)],
    ["dir", gw, gw, "0700", phys(l, `${l.gatewayStateDir}/realitytrace/data`)],
    ["dir", gw, gw, "0700", phys(l, `${l.gatewayStateDir}/realitytrace/state`)],
    // Root-owned copy of the pinned world, read by the gateway through the socket group (cep_authority base).
    ["worlds", "root", sock, phys(l, `${l.gatewayStateDir}/worlds`), "runtime/domain"],
    ["dir", rt, rt, "0700", phys(l, l.runtimeStateDir)],
    ["place-bun", "root", "root", "0755", phys(l, l.bunPath)],
    ["optional-exec", phys(l, l.realityTraceBin)],
    ["place-binary", "root", "root", "0755", phys(l, l.binPath)],
    ["deploy-tree", "root", "root", phys(l, l.runtimeTree)],
    // Rendered by the installer after the runtime account exists (server.yaml takes its uid from `id -u`).
    ["config-file", "root", sock, "0640", phys(l, `${l.gatewayStateDir}/server.yaml`), "config/server.yaml.in"],
    ["config-file", "root", sock, "0640", phys(l, `${l.gatewayStateDir}/policy.yaml`), "config/policy.yaml"],
    ["generated", "root", sock, "0640", "status.json", phys(l, `${l.gatewayStateDir}/status.json`)],
    ["generated", "root", "root", "0644", `units/${UNIT_GATEWAY}`, phys(l, `${l.unitDir}/${UNIT_GATEWAY}`)],
    ["generated", "root", "root", "0644", `units/${UNIT_RUNTIME}`, phys(l, `${l.unitDir}/${UNIT_RUNTIME}`)],
    ["socket", phys(l, l.socketPath)],
  ];
  return rows;
}

export function renderPlanTsv(rows: PlanRow[]): string {
  return `${rows.map((r) => r.join("\t")).join("\n")}\n`;
}

/** Systemd units. Accounts, paths, the bun copy and the world identity come from the layout; nothing is hardcoded. */
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
    "# The socket directory sits on /run, which is emptied at every boot, and the sandbox below cannot be set up while\n",
    "# it is missing. Recreate it before each start with the owner, group and mode the plan's `dir` row gives it. The\n",
    "# `+` runs only this command outside the sandbox; the server itself never does.",
    `ExecStartPre=+/usr/bin/install -d -o ${l.gatewayAccount} -g ${sock} -m 0750 ${l.socketDir}`,
    `ExecStart=${l.binPath}`,
    `WorkingDirectory=${l.gatewayStateDir}`,
    `Environment=SEA_FORGE_ROOT=${l.gatewayStateDir}`,
    `Environment=SEA_FORGE_SOCKET=${l.socketPath}`,
    "UMask=0007",
    "Restart=on-failure",
    "NoNewPrivileges=yes",
    "ProtectSystem=strict",
    "ProtectHome=yes",
    "PrivateTmp=yes",
    `ReadWritePaths=${l.gatewayStateDir} ${l.socketDir}`,
    "# The gateway owns its state directory, so it could otherwise replace these files by rename. A read-only bind\n",
    "# mount on each file blocks that: a mount point cannot be renamed or unlinked.",
    `ReadOnlyPaths=${l.gatewayStateDir}/server.yaml ${l.gatewayStateDir}/policy.yaml`,
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
    `Environment=COGNATE_SEA_FORGE_OPERATOR=${l.operatorRef}`,
    `Environment=COGNATE_WORLD_REF=${l.world.cognate}`,
    `Environment=COGNATE_REALITYTRACE_BIN=${l.realityTraceBin}`,
    `Environment=COGNATE_REALITYTRACE_DATA_HOME=${l.runtimeStateDir}/realitytrace/data`,
    `Environment=COGNATE_REALITYTRACE_STATE_HOME=${l.runtimeStateDir}/realitytrace/state`,
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

// ---- server.yaml and policy.yaml: the gateway root's config, authoritative once placed ---------------

/** Stands in for the runtime account's uid in the staged template; the installer substitutes `id -u <account>`. */
export const UID_PLACEHOLDER = "__RUNTIME_UID__";
/** Stands in for the socket group's gid in the staged template; the installer substitutes `getent group`. */
export const SOCKET_GID_PLACEHOLDER = "__SOCKET_GID__";
export const SERVICE_ACTOR = "cognate-service";
/** The operator actor id used when no config value is given. Production reads identity.operator_ref instead. */
export const DEFAULT_OPERATOR_ACTOR = "operator";
const ACTOR_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_UID = 4_294_967_294; // 4294967295 is the "unset" sentinel in several tools; no wildcard is expressible

export interface ServerBinding {
  uid?: number | string;
  actor_id: string;
  roles: string[];
}

/** The keys scripts/ignite.ts writes for a cell (identity, gateway, cep_authority), with the gateway's identities. */
export interface ServerConfig {
  socket_path: string;
  /** Group allowed to connect to the socket (a numeric gid, rendered at install). Absent means owner-only. */
  socket_gid?: number | string;
  root: string;
  identity: { bindings: ServerBinding[] };
  gateway: { uid: number | string; actor: string; delegable_actors: string[] };
  cep_authority: {
    enabled: boolean;
    policy: string;
    worlds: { name: string; base: string; entry: string; files: string[] }[];
    realitytrace: { bin: string; data_home: string; state_home: string; require_corroboration: boolean };
  };
}

/** Repository .sea files under `dir`, as ignite lists them (validation and __pycache__ skipped). */
export function worldFiles(dir: string, rel = ""): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(dir, rel), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (e.name === "validation" || e.name === "__pycache__") continue;
    const r = rel === "" ? e.name : `${rel}/${e.name}`;
    if (e.isDirectory()) out.push(...worldFiles(dir, r));
    else if (e.isFile() && e.name.endsWith(".sea")) out.push(r);
  }
  return out;
}

/** Same keys and nesting as ignite's cell server.yaml. The runtime uid is a value from the caller, never a constant. */
export function serverConfig(l: GatewayLayout, files: string[], runtimeUid: number | typeof UID_PLACEHOLDER): ServerConfig {
  return {
    socket_path: l.socketPath,
    // Rendered at install from the socket group's gid (install-sea-forge-gateway.sh). The runtime account reaches the socket through this group.
    socket_gid: SOCKET_GID_PLACEHOLDER,
    root: l.gatewayStateDir,
    identity: {
      bindings: [
        { uid: runtimeUid, actor_id: SERVICE_ACTOR, roles: ["service"] },
        // The operator has no uid: it acts only through the gateway (on_behalf_of).
        { actor_id: seaForgeActorOf(l.operatorRef), roles: ["operator"] },
      ],
    },
    gateway: { uid: runtimeUid, actor: SERVICE_ACTOR, delegable_actors: [seaForgeActorOf(l.operatorRef)] },
    cep_authority: {
      enabled: true,
      policy: "policy.yaml",
      worlds: [{ name: "horizon", base: "worlds", entry: "interaction-model.sea", files }],
      realitytrace: {
        bin: l.realityTraceBin,
        data_home: `${l.gatewayStateDir}/realitytrace/data`,
        state_home: `${l.gatewayStateDir}/realitytrace/state`,
        require_corroboration: true,
      },
    },
  };
}

export function renderServerYaml(c: ServerConfig): string {
  return `${JSON.stringify(c, null, 2)}\n`;
}

/** Binding rules from sea-rs config.rs and identity.rs, plus the gateway's own delegation rules. Empty means valid. */
export function validateServerConfig(c: ServerConfig): string[] {
  const errors: string[] = [];
  if (c.socket_gid !== undefined && c.socket_gid !== SOCKET_GID_PLACEHOLDER && (typeof c.socket_gid !== "number" || c.socket_gid === 0 || !Number.isInteger(c.socket_gid))) {
    errors.push("socket_gid must be the socket group's numeric gid, not root");
  }
  const uids = new Set<number>();
  const actors = new Map<string, ServerBinding>();
  for (const b of c.identity.bindings) {
    if (!ACTOR_RE.test(b.actor_id)) errors.push("an actor_id is not a valid identifier");
    if (actors.has(b.actor_id)) errors.push(`actor '${b.actor_id}' has more than one binding`);
    actors.set(b.actor_id, b);
    if (b.uid !== undefined) {
      if (typeof b.uid !== "number" || !Number.isInteger(b.uid) || b.uid < 1 || b.uid > MAX_UID) {
        errors.push(`uid for actor '${b.actor_id}' must be one unsigned integer uid, not root and not a wildcard`);
      } else if (uids.has(b.uid)) {
        errors.push(`uid is bound to more than one actor (actor '${b.actor_id}')`);
      } else uids.add(b.uid);
    }
    if (b.roles.length === 0) errors.push(`actor '${b.actor_id}' has no roles`);
  }
  const gw = c.gateway;
  if (gw.delegable_actors.length === 0) errors.push("no operator actor is delegable");
  for (const a of gw.delegable_actors) {
    const op = actors.get(a);
    if (!op || op.uid !== undefined) errors.push(`operator actor must be bound with no uid (actor '${a}')`);
  }
  const gwBinding = actors.get(gw.actor);
  if (!gwBinding || gwBinding.uid === undefined || gwBinding.uid !== gw.uid) errors.push("gateway uid must be bound to the gateway actor in identity.bindings");
  if (new Set(gw.delegable_actors).size !== gw.delegable_actors.length) errors.push("gateway.delegable_actors has a duplicate");
  for (const a of gw.delegable_actors) {
    if (a === gw.actor) errors.push("the gateway actor must not be delegable");
    const b = actors.get(a);
    if (!b) errors.push(`delegable actor '${a}' has no binding`);
    else if (b.roles.length === 0) errors.push(`delegable actor '${a}' has no roles`);
  }
  for (const w of c.cep_authority.worlds) if (!w.files.includes(w.entry)) errors.push(`world entry '${w.entry}' is not among its files`);
  return errors;
}

/** The commit-intent resource the policy names, read from the same constant ignite uses. */
export async function navigationCommitId(): Promise<string> {
  const { NAVIGATION_INTENT_COMMIT } = await import("../src/capabilities/navigation-intent.ts");
  return NAVIGATION_INTENT_COMMIT.id;
}

/**
 * policy.yaml for the gateway root. The external settlement gate is part of the rendered policy, not an option: an
 * external declaration must be approved by an operator. The operator owns the placed file after placement.
 */
export function renderPolicyYaml(commitResourceId: string): string {
  if (!/^[A-Za-z0-9._:/-]+$/.test(commitResourceId)) throw new Error("commit resource id has characters the policy cannot quote");
  return `# SEA-Forge policy for the gateway root. Placed once by scripts/install-sea-forge-gateway.sh; yours to edit.
# SEA-Forge rereads it on every decision, so edits apply without a restart.
version: "0.1"
rules:
  - name: navigation-commit
    verdict: allow
    actor_role: service
    operation_kind: cognate_capability
    resources: ["${commitResourceId}"]
  - { name: horizon-capabilities, verdict: allow, actor_role: service, operation_kind: cognate_capability }
  - { name: horizon-actions, verdict: allow, actor_role: service, operation_kind: cognate_action }
  - { name: operator-approves, verdict: allow, actor_role: operator, operation_kind: approval_resolution }
  - { name: evidence, verdict: allow, actor_role: service, operation_kind: evidence_mutation }
  # External settlement declarations (SWE_SEED and artifact transitions) stop at Escalate until an operator other
  # than the requester approves them. Matched by settlement_authority_class, so local declarations are unaffected.
  - name: settlement-external-approval
    verdict: allow
    requires_approval: true
    actor_role: service
    operation_kind: settlement_declaration
    boundary_constraints:
      settlement_authority_class: [external]
  - name: settlement-external-approval-operator
    verdict: allow
    requires_approval: true
    actor_role: operator
    operation_kind: settlement_declaration
    boundary_constraints:
      settlement_authority_class: [external]
  - { name: settlement, verdict: allow, actor_role: service, operation_kind: settlement_declaration }
`;
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
    join(stage, "config", "server.yaml.in"),
    join(stage, "config", "policy.yaml"),
  ];
  return sha256(Buffer.concat(parts.map((p) => readFileSync(p))));
}

export function defaultStageDir(env: Record<string, string | undefined> = process.env): string {
  return env.HORIZON_GATEWAY_STAGE?.trim() || join(env.XDG_CACHE_HOME?.trim() || join(homedir(), ".cache"), PRODUCT, "gateway-stage");
}

async function stage(args: string[]): Promise<number> {
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const stageDir = resolve(flag("--stage") ?? defaultStageDir());
  const repo = resolve(flag("--repo") ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
  const development = args.includes("--development");
  let world: WorldIdentity;
  let operatorRef: string;
  try {
    world = await worldIdentity(repo);
    operatorRef = operatorRefFromConfig(repo);
  } catch (error) {
    console.error(`gateway-stage: cannot establish the world or operator identity: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  const layout = resolveLayout(process.env, { development, world, operatorRef });
  const errors = validateLayout(layout);
  if (errors.length > 0) {
    for (const e of errors) console.error(`gateway-stage: ${e}`);
    return 1;
  }
  for (const f of ["plan.tsv", "runtime-manifest.sha256", "status.json"]) rmSync(join(stageDir, f), { force: true });
  rmSync(join(stageDir, "runtime"), { recursive: true, force: true });
  rmSync(join(stageDir, "config"), { recursive: true, force: true });
  mkdirSync(join(stageDir, "units"), { recursive: true });
  mkdirSync(join(stageDir, "config"), { recursive: true });
  // Templates only: the installer renders server.yaml with the runtime account's uid, and places policy.yaml.
  const files = worldFiles(join(repo, "domain"));
  writeFileSync(join(stageDir, "config", "server.yaml.in"), renderServerYaml(serverConfig(layout, files, UID_PLACEHOLDER)));
  writeFileSync(join(stageDir, "config", "policy.yaml"), renderPolicyYaml(await navigationCommitId()));
  writeFileSync(join(stageDir, "plan.tsv"), renderPlanTsv(buildPlan(layout)));
  const { result, manifest } = stageRuntime(repo, join(stageDir, "runtime"));
  writeFileSync(join(stageDir, "runtime-manifest.sha256"), manifest);
  for (const [name, text] of Object.entries(unitFiles(layout))) writeFileSync(join(stageDir, "units", name), text);
  writeFileSync(join(stageDir, "status.json"), `${JSON.stringify(statusRecord(layout), null, 2)}\n`);
  console.log(`gateway-stage: ${layout.environment} bundle in ${stageDir}`);
  console.log(`  runtime tree: ${result.files.length} files hashed, ${result.symlinks} symlinks copied, ${result.excluded.length} excluded`);
  for (const e of result.excluded.slice(0, 20)) console.log(`    excluded ${e}`);
  console.log(`  world: pinned ${world.pinned.slice(0, 22)}..., cognate ref carried by the runtime unit`);
  console.log(`  bundle digest: ${stageDigest(stageDir)}`);
  console.log("next (privileged, you run it): see `just gateway-install <sea-forge-server> <sha256> <bun> <bun-sha256>`");
  return 0;
}

if (import.meta.main) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "stage") {
    stage(rest).then((code) => process.exit(code));
  } else {
    console.error("usage: bun run scripts/gateway-setup.ts stage [--stage DIR] [--repo DIR] [--development]");
    process.exit(2);
  }
}

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The one table that maps a setup name to its root, ports and environment (technical annex §C).
 * `HORIZON_SETUP` unset means "no setup": nothing here is consulted and Horizon behaves as before.
 */
export const SETUP_NAMES = ["testing", "production"] as const;
export type SetupName = (typeof SETUP_NAMES)[number];
export type SetupService = "workbench" | "horizon" | "connector";
export const SETUP_SERVICES: readonly SetupService[] = ["workbench", "horizon", "connector"];

export type SetupEnvSource = Record<string, string | undefined>;

export interface SetupMarker {
  readonly name: string;
  readonly root: string;
  readonly createdAt: string;
}

export interface SetupMapping {
  readonly name: SetupName;
  readonly root: string;
  readonly marker: string;
  readonly horizonPort: number;
  readonly phonePort: number;
  readonly workshopPort: number;
  /** The workshop's database instance (pg0). It lives outside the setup folder, so the clear drops it by name. */
  readonly workshopDatabase: string;
  readonly cell: string;
  readonly workbench: string;
  readonly secrets: string;
  readonly exports: string;
  readonly run: string;
  readonly config: string;
  readonly socket: string;
  readonly sxrData: string;
  readonly sxrState: string;
  readonly horizonRecordData: string;
  readonly horizonRecordState: string;
  readonly workbenchKey: string;
  readonly presentingKey: string;
  /** GitHub sandbox repository and board; production names are chosen by the operator at ship time. */
  readonly github?: { readonly repo: string; readonly board: string };
}

export const SANDBOX_REPO = "GodSpeedAI/horizon-sandbox";
export const TESTING_BOARD = "Horizon testing";
export const SEA_FORGE_SERVER_BIN_DEFAULT = "/home/sprime01/projects/sea-rs/target/release/sea-forge-server";

/** `HORIZON_SETUPS_BASE` exists so tests and rehearsals never touch the real `~/.horizon`. */
export function setupsBase(env: SetupEnvSource = process.env): string {
  const override = env.HORIZON_SETUPS_BASE?.trim();
  return override ? override : join(homedir(), ".horizon", "setups");
}

/** Unset or empty: no setup (undefined). Anything but `testing` or `production` is refused. */
export function parseSetup(env: SetupEnvSource = process.env): SetupName | undefined {
  const raw = env.HORIZON_SETUP;
  if (raw === undefined || raw === "") return undefined;
  if (!(SETUP_NAMES as readonly string[]).includes(raw)) {
    throw new Error(`HORIZON_SETUP must be testing or production, got ${JSON.stringify(raw)}`);
  }
  return raw as SetupName;
}

export function setupMapping(name: SetupName, env: SetupEnvSource = process.env): SetupMapping {
  const root = join(setupsBase(env), name);
  const testing = name === "testing";
  const cell = join(root, "cell");
  const workbench = join(root, "workbench");
  const secrets = join(root, "secrets");
  return {
    name,
    root,
    marker: join(root, "SETUP.json"),
    horizonPort: testing ? 4339 : 4319,
    phonePort: testing ? 4340 : 4320,
    workshopPort: testing ? 3190 : 3180,
    workshopDatabase: `horizon-${name}`,
    cell,
    workbench,
    secrets,
    exports: join(root, "exports"),
    run: join(root, "run"),
    config: join(root, "horizon.toml"),
    socket: join(cell, "sea-forge.sock"),
    sxrData: join(workbench, "sxr-data"),
    sxrState: join(workbench, "sxr-state"),
    horizonRecordData: join(cell, "realitytrace", "data"),
    horizonRecordState: join(cell, "realitytrace", "state"),
    workbenchKey: join(secrets, "workbench.key"),
    presentingKey: join(secrets, "presenting.key"),
    ...(testing ? { github: { repo: SANDBOX_REPO, board: TESTING_BOARD } } : {}),
  };
}

/** Org id: `local:<hostname>:testing` for testing, `local:<hostname>` (unchanged) for production. */
export function setupTenant(name: SetupName | undefined, host: string): string {
  return name === "testing" ? `local:${host}:testing` : `local:${host}`;
}

/** Record sources Horizon reads (`[[records.sources]]`): personal (no paths), workshop, horizon. */
export function recordSources(mapping: SetupMapping) {
  return [
    { name: "personal", kind: "personal" as const },
    { name: "workshop", kind: "workshop" as const, data_home: mapping.sxrData, state_home: mapping.sxrState },
    { name: "horizon", kind: "horizon" as const, data_home: mapping.horizonRecordData, state_home: mapping.horizonRecordState },
  ];
}

/** `KEY=VALUE` environment for one service (or all of them), used by `eval "$(setup-env.ts ...)"`. */
export function setupEnv(name: SetupName, service?: SetupService, env: SetupEnvSource = process.env): Record<string, string> {
  const m = setupMapping(name, env);
  const common: Record<string, string> = {
    HORIZON_SETUP: name,
    ...(env.HORIZON_SETUPS_BASE?.trim() ? { HORIZON_SETUPS_BASE: env.HORIZON_SETUPS_BASE.trim() } : {}),
  };
  const workbench: Record<string, string> = {
    COGNATE_WORKBENCH_HOME: m.workbench,
    PORT: String(m.workshopPort),
    COGNATE_PG0_NAME: m.workshopDatabase,
    ...(Bun.which("realitytrace") ? { SXR_BIN: Bun.which("realitytrace")! } : {}),
  };
  const horizon: Record<string, string> = {
    HORIZON_CONFIG: m.config,
    SEA_FORGE_ROOT: m.cell,
    SEA_FORGE_SOCKET: m.socket,
    SEA_FORGE_SERVER_BIN: env.SEA_FORGE_SERVER_BIN?.trim() || SEA_FORGE_SERVER_BIN_DEFAULT,
    COGNATE_REALITYTRACE_DATA_HOME: m.horizonRecordData,
    COGNATE_REALITYTRACE_STATE_HOME: m.horizonRecordState,
  };
  const connector: Record<string, string> = {
    HORIZON_CONFIG: m.config,
    HORIZON_CONNECTOR_HEARTBEAT: join(m.run, "connector.heartbeat"),
  };
  const byService = { workbench, horizon, connector };
  const chosen = service ? byService[service] : { ...workbench, ...horizon, ...connector };
  return { ...common, ...chosen };
}

/** The marker contents for a setup root. */
export function markerFor(mapping: SetupMapping, createdAt = new Date().toISOString()): SetupMarker {
  return { name: mapping.name, root: mapping.root, createdAt };
}

/** Reads `<root>/SETUP.json`; undefined when it is absent or unreadable. */
export function readMarker(mapping: SetupMapping): SetupMarker | undefined {
  try {
    const doc = JSON.parse(readFileSync(mapping.marker, "utf8")) as Partial<SetupMarker>;
    if (typeof doc.name !== "string" || typeof doc.root !== "string" || typeof doc.createdAt !== "string") return undefined;
    return { name: doc.name, root: doc.root, createdAt: doc.createdAt };
  } catch {
    return undefined;
  }
}

/** Value of `--name <value>` in argv, or undefined. */
export function argValue(args: readonly string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
}

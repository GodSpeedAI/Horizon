/**
 * `horizon serve`: the headless server verb, and the one the desktop shell supervises.
 *
 * It adds no behaviour of its own. It chooses where the read-only resource tree and the writable
 * data live (a compiled binary has no checkout around it), reads `--port`, and in `--desktop` mode
 * reports where it listens on stdout and exits when its stdin closes, so a shell that dies cannot
 * leave it running. The server, its routes and its pairing are `createApplication().startServer()`.
 */
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

/** The line the shell waits for. One JSON object after the marker; the code is single-use and never logged by the server. */
export const READY_MARKER = "horizon-desktop-ready";

export interface ServePlan {
  /** `--port`; undefined keeps the configured port, 0 asks the OS for a free one. */
  readonly port: number | undefined;
  readonly desktop: boolean;
}

function valueOf(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`horizon serve: --${name} needs a value`);
  return value;
}

/** Where the data lives when `--data` and HORIZON_DATA_DIR are both absent. */
export function defaultDataDir(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): string {
  if (platform === "win32") return join(env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Horizon");
  if (platform === "darwin") return join(homedir(), "Library", "Application Support", "Horizon");
  return join(env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "horizon");
}

/** Env paths a user may set relative to where they ran the command; they must not move when the working directory does. */
const PATH_ENV = ["HORIZON_CONFIG", "HORIZON_STORE", "HORIZON_SECRET_FILE", "HORIZON_AGENT_KEY_FILE"] as const;

/**
 * Runs before the application opens. Resolves the resource tree (`--resources`, HORIZON_RESOURCE_ROOT, or a `horizon-resources`
 * folder beside the binary) and the data directory, points the HORIZON_* paths the user left unset at them, and enters the
 * resource tree, whose files are only read. From a checkout, with none of those given, nothing changes.
 */
export function prepareServe(args: readonly string[], env: NodeJS.ProcessEnv = process.env): ServePlan {
  const portText = valueOf(args, "port");
  let port: number | undefined;
  if (portText !== undefined) {
    port = Number(portText);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`horizon serve: --port must be an integer between 0 and 65535, got '${portText}'`);
  }
  const beside = join(dirname(process.execPath), "horizon-resources");
  const named = valueOf(args, "resources") ?? env.HORIZON_RESOURCE_ROOT?.trim();
  const resources = named ? resolve(named) : existsSync(join(beside, "config", "horizon.toml")) ? beside : undefined;
  const dataFlag = valueOf(args, "data") ?? env.HORIZON_DATA_DIR?.trim();
  if (resources !== undefined || dataFlag) {
    for (const key of PATH_ENV) {
      const value = env[key];
      if (value && !isAbsolute(value)) env[key] = resolve(value);
    }
    const data = resolve(dataFlag || defaultDataDir());
    mkdirSync(data, { recursive: true });
    env.HORIZON_STORE ??= join(data, "app.sqlite");
    env.HORIZON_SECRET_FILE ??= join(data, "local-operator.secret");
    env.HORIZON_AGENT_KEY_FILE ??= join(data, "agent.key");
  }
  if (resources !== undefined) {
    if (!existsSync(join(resources, "config", "horizon.toml"))) throw new Error(`horizon serve: ${resources} is not a Horizon resource tree (no config/horizon.toml)`);
    env.HORIZON_RESOURCE_ROOT = resources;
    env.HORIZON_CONFIG ??= join(resources, "config", "horizon.toml");
    process.chdir(resources);
  }
  return { port, desktop: args.includes("--desktop") };
}

/** Tells the shell where the server listens and the one-time code that opens a session. Stdout is a pipe only the shell holds. */
export function announceReady(handoff: { readonly origin: string; readonly code: string }): void {
  process.stdout.write(`${READY_MARKER} ${JSON.stringify({ url: handoff.origin, code: handoff.code, pid: process.pid })}\n`);
}

/** Calls `onClose` when stdin ends, which is when the process that holds the other end exits for any reason. */
export function exitWhenStdinCloses(onClose: () => void): void {
  process.stdin.on("end", onClose);
  process.stdin.on("close", onClose);
  process.stdin.on("error", onClose);
  process.stdin.resume();
}

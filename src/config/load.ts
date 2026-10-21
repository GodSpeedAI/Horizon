import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname, userInfo } from "node:os";
import { dirname, resolve } from "node:path";
import type {
  ContextKernelConfig,
  DeploymentProfile,
  HorizonConfig,
  IdentityConfig,
  LoadedConfig,
  SecretsConfig,
  TransportConfig,
} from "./types.ts";

export class ConfigError extends Error {
  override readonly name = "ConfigError";
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);
const PROFILES = new Set<DeploymentProfile>(["local_operator", "shared_remote"]);

function bounded(message: string): never {
  throw new ConfigError(`CONFIG: ${message}`);
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    bounded(`${field} must be a table`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    bounded(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function asPort(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 65535) {
    bounded(`${field} must be an integer port between 0 and 65535`);
  }
  return value;
}

function asStringList(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((v) => typeof v === "string" && v.length > 0)) {
    bounded(`${field} must be a non-empty list of strings`);
  }
  return value as string[];
}

/** `research_source` is optional; an absent binding is an empty command, not a malformed one. */
function asOptionalCommand(value: unknown, field: string): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string" && v.length > 0)) {
    bounded(`${field} must be a list of strings when present; omit it to disable research`);
  }
  return value as string[];
}

/**
 * The Context Kernel binding is optional as a whole. When present it must be complete: a command
 * without a corpus (or the reverse) is a malformed binding, not a half-working one.
 */
function asContextKernel(value: unknown): ContextKernelConfig | undefined {
  if (value === undefined) return undefined;
  const doc = asRecord(value, "context_kernel");
  const command = asStringList(doc.command, "context_kernel.command");
  const corpus = asString(doc.corpus_id, "context_kernel.corpus_id");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(corpus)) {
    bounded("context_kernel.corpus_id must be an opaque corpus id, not a path");
  }
  return { command, corpus_id: corpus };
}

export function configFromDocument(document: unknown): HorizonConfig {
  const doc = asRecord(document, "config");
  const profile = asString(doc.deployment_profile, "deployment_profile") as DeploymentProfile;
  if (!PROFILES.has(profile)) bounded(`deployment_profile must be local_operator or shared_remote, got ${profile}`);

  const bindHost = asString(doc.bind_host, "bind_host");
  if (profile === "local_operator" && !LOOPBACK.has(bindHost)) {
    bounded(`local_operator bind_host must be loopback, got ${bindHost}`);
  }

  const identityDoc = asRecord(doc.identity, "identity");
  const identitySource = asString(identityDoc.source, "identity.source");
  if (identitySource !== "os_session" && identitySource !== "identity_provider") {
    bounded("identity.source must be os_session or identity_provider");
  }
  const identity: IdentityConfig = {
    source: identitySource,
    operator_prefix: asString(identityDoc.operator_prefix, "identity.operator_prefix"),
    agent_prefix: asString(identityDoc.agent_prefix, "identity.agent_prefix"),
    ...(identityDoc.identity_provider === undefined
      ? {}
      : { identity_provider: asString(identityDoc.identity_provider, "identity.identity_provider") }),
  };

  if (profile === "shared_remote" && !identity.identity_provider) {
    bounded("shared_remote requires identity.identity_provider; refusing to start without a real IdP");
  }
  if (profile === "local_operator" && identity.source !== "os_session") {
    bounded("local_operator requires identity.source = os_session");
  }

  const secretsDoc = asRecord(doc.secrets, "secrets");
  const secretsMode = asString(secretsDoc.mode, "secrets.mode");
  if (secretsMode !== "per_launch") bounded("secrets.mode must be per_launch");
  const secrets: SecretsConfig = {
    mode: secretsMode,
    path: asString(secretsDoc.path, "secrets.path"),
  };

  const transportsDoc = asRecord(doc.transports, "transports");
  const transports: TransportConfig = {
    connect: asString(transportsDoc.connect, "transports.connect") as TransportConfig["connect"],
    http: asString(transportsDoc.http, "transports.http") as TransportConfig["http"],
    gui: asString(transportsDoc.gui, "transports.gui") as TransportConfig["gui"],
  };
  for (const [name, value] of Object.entries(transports)) {
    if (value !== "loopback") bounded(`transports.${name} must be loopback`);
  }

  const contextKernel = asContextKernel(doc.context_kernel);

  return {
    deployment_profile: profile,
    bind_host: bindHost,
    port: asPort(doc.port, "port"),
    world_alias: asString(doc.world_alias, "world_alias"),
    world_ref: asString(doc.world_ref, "world_ref"),
    runtime_store: asString(doc.runtime_store, "runtime_store"),
    research_command: asOptionalCommand(doc.research_command, "research_command"),
    ...(contextKernel === undefined ? {} : { context_kernel: contextKernel }),
    identity,
    secrets,
    transports,
  };
}

function writeLaunchSecret(path: string): string {
  const secret = randomBytes(32).toString("hex");
  const full = resolve(path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, `${secret}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(full, 0o600);
  if (!existsSync(full)) bounded(`could not create per-launch secret at ${full}`);
  return secret;
}

export function operatorPrincipal(config: HorizonConfig): { readonly id: string; readonly kind: "user" } {
  if (config.identity.source !== "os_session") {
    bounded("operator identity is not available from an OS session");
  }
  const info = userInfo();
  return { id: `${config.identity.operator_prefix}${info.username}:${info.uid}`, kind: "user" };
}

export function agentPrincipal(config: HorizonConfig, agentId: string): { readonly id: string; readonly kind: "agent" } {
  if (!agentId || agentId.startsWith(config.identity.operator_prefix)) {
    bounded("agent principal id must be a distinct agent identity");
  }
  return { id: `${config.identity.agent_prefix}${agentId}`, kind: "agent" };
}

export function assertAgentPrincipal(config: HorizonConfig, caller: { readonly actor: { readonly id: string; readonly kind: string } }, agentId: string): void {
  const expected = agentPrincipal(config, agentId);
  if (caller.actor.id !== expected.id || caller.actor.kind !== "agent") {
    bounded("agent action requires the matching agent principal, never the operator principal");
  }
}

export function loadConfig(path = process.env.HORIZON_CONFIG ?? "config/horizon.toml"): LoadedConfig {
  let document: unknown;
  try {
    document = Bun.TOML.parse(readText(path));
  } catch (error) {
    bounded(`cannot read config ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const config = configFromDocument(document);
  const store = process.env.HORIZON_STORE;
  const withStore = store ? { ...config, runtime_store: store } : config;
  const secretPath = process.env.HORIZON_SECRET_FILE ?? withStore.secrets.path;
  const launchSecret = writeLaunchSecret(secretPath);
  return {
    config: withStore,
    operator: {
      principal: operatorPrincipal(withStore),
      tenant: `local:${hostname()}`,
    },
    launchSecret,
    secretPath: resolve(secretPath),
  };
}

function readText(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    bounded(`cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

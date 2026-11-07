import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, resolve } from "node:path";
import { assertVerifierTemplate } from "../domain/expectation.ts";
import { assertAllowance, assertPaymentEntry } from "../domain/payment.ts";
import { REVERSIBILITY_CLASSES } from "../domain/navigation.ts";
import { OBSERVER_ACTOR_REF } from "../ui/surface2/grammar.ts";
import type {
  ContextKernelConfig,
  DeploymentProfile,
  EconomicsConfig,
  HorizonConfig,
  IdentityConfig,
  LoadedConfig,
  OperationBindingConfig,
  OperatorsConfig,
  RecordSource,
  RecordsConfig,
  SecretsConfig,
  SettlementConfig,
  TransportConfig,
  UiConfig,
  WorkshopConfig,
} from "./types.ts";
import { parseSetup, setupMapping, setupTenant } from "./setup.ts";

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

/** Run a domain validator, reporting its refusal as a config error naming the field. */
function validated<T>(field: string, check: () => T): T {
  try {
    return check();
  } catch (error) {
    return bounded(`${field}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function asList(value: unknown, field: string): readonly unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) bounded(`${field} must be a list of tables`);
  return value as unknown[];
}

function asOperations(value: unknown): readonly OperationBindingConfig[] {
  const seen = new Set<string>();
  return asList(value, "operations").map((raw, index) => {
    const field = `operations[${index}]`;
    const doc = asRecord(raw, field);
    const operationRef = asString(doc.operation_ref, `${field}.operation_ref`);
    if (operationRef === "horizon.health" || operationRef === "horizon.research.health") bounded(`${field}: ${operationRef} is a structural move and cannot be rebound`);
    if (seen.has(operationRef)) bounded(`${field}: duplicate binding for ${operationRef}`);
    seen.add(operationRef);
    const reversibility = asString(doc.reversibility, `${field}.reversibility`);
    if (!(REVERSIBILITY_CLASSES as readonly string[]).includes(reversibility)) bounded(`${field}.reversibility must be one of ${REVERSIBILITY_CLASSES.join(", ")}`);
    if (doc.settlement !== undefined && doc.settlement !== "required") bounded(`${field}.settlement may only be "required"`);
    const payment = asList(doc.payment, `${field}.payment`).map((entry, n) => validated(`${field}.payment[${n}]`, () => assertPaymentEntry(entry)));
    let verifier;
    const paths: Record<string, string> = {};
    if (doc.verifier !== undefined) {
      const verifierDoc = asRecord(doc.verifier, `${field}.verifier`);
      verifier = validated(`${field}.verifier`, () => assertVerifierTemplate(verifierDoc));
      for (const [n, artifact] of asList(verifierDoc.artifacts, `${field}.verifier.artifacts`).entries()) {
        const artifactDoc = asRecord(artifact, `${field}.verifier.artifacts[${n}]`);
        paths[asString(artifactDoc.name, `${field}.verifier.artifacts[${n}].name`)] = asString(artifactDoc.path, `${field}.verifier.artifacts[${n}].path`);
      }
    }
    return {
      operation_ref: operationRef,
      label: asString(doc.label, `${field}.label`),
      reversibility: reversibility as OperationBindingConfig["reversibility"],
      ...(doc.settlement === "required" ? { settlement: "required" as const } : {}),
      payment,
      ...(verifier ? { verifier } : {}),
      verifier_paths: paths,
    };
  });
}

function asSettlement(value: unknown): SettlementConfig | undefined {
  if (value === undefined) return undefined;
  const doc = asRecord(value, "settlement");
  const grace = doc.close_grace_s ?? 30;
  if (typeof grace !== "number" || !Number.isInteger(grace) || grace < 0 || grace > 3600) bounded("settlement.close_grace_s must be an integer from 0 to 3600");
  const snapshot = doc.snapshot_dir;
  if (snapshot !== undefined && (typeof snapshot !== "string" || snapshot.trim() === "")) bounded("settlement.snapshot_dir must be a non-empty string");
  return { launcher: asStringList(doc.launcher, "settlement.launcher"), close_grace_s: grace, ...(snapshot === undefined ? {} : { snapshot_dir: snapshot as string }) };
}

function asOperators(value: unknown): OperatorsConfig {
  const doc = asRecord(value, "operators");
  const actorsDoc = asRecord(doc.actors, "operators.actors");
  const actors: Record<string, string> = {};
  for (const [operator, actor] of Object.entries(actorsDoc)) actors[operator] = asString(actor, `operators.actors.${operator}`);
  if (Object.keys(actors).length === 0) bounded("operators.actors must map at least one operator to an actor");
  return {
    actors,
    ...(doc.desktop_operator === undefined ? {} : { desktop_operator: asString(doc.desktop_operator, "operators.desktop_operator") }),
    ...(doc.delegable_actors === undefined ? {} : { delegable_actors: asStringList(doc.delegable_actors, "operators.delegable_actors") }),
  };
}

function asEconomics(value: unknown): EconomicsConfig | undefined {
  if (value === undefined) return undefined;
  const doc = asRecord(value, "economics");
  return {
    realitytrace_bin: asString(doc.realitytrace_bin, "economics.realitytrace_bin"),
    ...(doc.data_home === undefined ? {} : { data_home: asString(doc.data_home, "economics.data_home") }),
    ...(doc.state_home === undefined ? {} : { state_home: asString(doc.state_home, "economics.state_home") }),
  };
}

const RECORD_KINDS = new Set<RecordSource["kind"]>(["personal", "workshop", "horizon"]);

function asRecords(value: unknown): RecordsConfig | undefined {
  if (value === undefined) return undefined;
  const doc = asRecord(value, "records");
  const names = new Set<string>();
  const sources = asList(doc.sources, "records.sources").map((raw, index) => {
    const field = `records.sources[${index}]`;
    const source = asRecord(raw, field);
    const name = asString(source.name, `${field}.name`);
    if (names.has(name)) bounded(`${field}: duplicate record source ${name}`);
    names.add(name);
    const kind = asString(source.kind, `${field}.kind`) as RecordSource["kind"];
    if (!RECORD_KINDS.has(kind)) bounded(`${field}.kind must be personal, workshop or horizon`);
    if (kind === "personal" && (source.data_home !== undefined || source.state_home !== undefined)) {
      bounded(`${field}: the personal record has no paths; it uses RealityTrace's default location`);
    }
    return {
      name,
      kind,
      ...(source.data_home === undefined ? {} : { data_home: asString(source.data_home, `${field}.data_home`) }),
      ...(source.state_home === undefined ? {} : { state_home: asString(source.state_home, `${field}.state_home`) }),
    };
  });
  return { sources };
}

function asWorkshop(value: unknown): WorkshopConfig | undefined {
  if (value === undefined) return undefined;
  const doc = asRecord(value, "workshop");
  return {
    url: asString(doc.url, "workshop.url"),
    key_path: asString(doc.key_path, "workshop.key_path"),
    ...(doc.expert_id === undefined ? {} : { expert_id: asString(doc.expert_id, "workshop.expert_id") }),
    ...(doc.workspace_id === undefined ? {} : { workspace_id: asString(doc.workspace_id, "workshop.workspace_id") }),
  };
}

function asUi(value: unknown): UiConfig | undefined {
  if (value === undefined) return undefined;
  return { timezone: asString(asRecord(value, "ui").timezone, "ui.timezone") };
}

/** Environment override of `[economics]` (HORIZON_ECONOMICS_REALITYTRACE_BIN / _DATA_HOME / _STATE_HOME). */
export function economicsFromEnv(env: Record<string, string | undefined>, fromFile?: EconomicsConfig): EconomicsConfig | undefined {
  const bin = env.HORIZON_ECONOMICS_REALITYTRACE_BIN?.trim();
  if (!bin) return fromFile;
  const data = env.HORIZON_ECONOMICS_DATA_HOME?.trim();
  const state = env.HORIZON_ECONOMICS_STATE_HOME?.trim();
  return { realitytrace_bin: bin, ...(data ? { data_home: data } : fromFile?.data_home ? { data_home: fromFile.data_home } : {}), ...(state ? { state_home: state } : fromFile?.state_home ? { state_home: fromFile.state_home } : {}) };
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
    operator_ref: identityDoc.operator_ref === undefined ? DEFAULT_OPERATOR_REF : asString(identityDoc.operator_ref, "identity.operator_ref"),
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
    operations: asOperations(doc.operations),
    capacity: asList(doc.capacity, "capacity").map((entry, index) => validated(`capacity[${index}]`, () => assertAllowance(entry))),
    ...(doc.settlement === undefined ? {} : { settlement: asSettlement(doc.settlement)! }),
    ...(doc.economics === undefined ? {} : { economics: asEconomics(doc.economics)! }),
    ...(doc.operators === undefined ? {} : { operators: asOperators(doc.operators) }),
    ...(doc.records === undefined ? {} : { records: asRecords(doc.records)! }),
    ...(doc.workshop === undefined ? {} : { workshop: asWorkshop(doc.workshop)! }),
    ...(doc.ui === undefined ? {} : { ui: asUi(doc.ui)! }),
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

/** The single-operator development default for the local operator's ref. */
export const DEFAULT_OPERATOR_REF = "actor:operator";

/**
 * A human operator ref must be a Cognate `actor:` principal. The OS account is never a valid
 * source: an `os:` ref would name the service account that runs the runtime, not the person.
 */
export function assertOperatorRef(value: string, source: string): string {
  if (value.length === 0) bounded(`${source} must not be empty`);
  if (!value.startsWith("actor:") || !OBSERVER_ACTOR_REF.test(value)) {
    bounded(`${source} must be an actor:<id> ref (got ${JSON.stringify(value)}); the OS account is never the operator`);
  }
  return value;
}

/**
 * The local operator's principal. Its id is the configured ref (HORIZON_OPERATOR_REF, else
 * `identity.operator_ref`), validated at startup. The OS account is not read here.
 */
export function operatorPrincipal(config: HorizonConfig): { readonly id: string; readonly kind: "user" } {
  if (config.identity.source !== "os_session") {
    bounded("operator identity is not available from an OS session");
  }
  return { id: assertOperatorRef(config.identity.operator_ref, "operator identity"), kind: "user" };
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
  const setup = readSetup();
  let document: unknown;
  try {
    document = Bun.TOML.parse(readText(path));
  } catch (error) {
    bounded(`cannot read config ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const config = configFromDocument(document);
  const store = process.env.HORIZON_STORE;
  const operatorEnv = process.env.HORIZON_OPERATOR_REF;
  const identityWithOperator = operatorEnv === undefined
    ? config.identity
    : { ...config.identity, operator_ref: assertOperatorRef(operatorEnv, "HORIZON_OPERATOR_REF") };
  const withStore = { ...(store ? { ...config, runtime_store: store } : config), identity: identityWithOperator };
  const secretPath = process.env.HORIZON_SECRET_FILE ?? withStore.secrets.path;
  const launchSecret = writeLaunchSecret(secretPath);
  return {
    config: withStore,
    operator: {
      principal: operatorPrincipal(withStore),
      tenant: setupTenant(setup, hostname()),
    },
    launchSecret,
    secretPath: resolve(secretPath),
    ...(setup === undefined ? {} : { setup }),
  };
}

/** `HORIZON_SETUP`: refuses unknown names, and a named setup whose `SETUP.json` marker is missing. */
function readSetup() {
  let setup;
  try {
    setup = parseSetup(process.env);
  } catch (error) {
    bounded(error instanceof Error ? error.message : String(error));
  }
  if (setup !== undefined) {
    const { marker } = setupMapping(setup, process.env);
    if (!existsSync(marker)) bounded(`HORIZON_SETUP=${setup} but ${marker} is missing; run bun run scripts/setup-init.ts --setup ${setup}`);
  }
  return setup;
}

function readText(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    bounded(`cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

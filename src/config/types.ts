import type { VerifierTemplate } from "../domain/expectation.ts";
import type { SetupName } from "./setup.ts";
import type { CapacityAllowance, PaymentEntry } from "../domain/payment.ts";

export type DeploymentProfile = "local_operator" | "shared_remote";

export interface IdentityConfig {
  readonly source: "os_session" | "identity_provider";
  readonly operator_prefix: string;
  readonly agent_prefix: string;
  /**
   * The local human operator's durable ref (`actor:<id>`), the principal every local session and
   * approval is attributed to. Configured here, overridable at startup by HORIZON_OPERATOR_REF.
   * Never derived from the OS account, so it survives a change of service account or UID.
   */
  readonly operator_ref: string;
  readonly identity_provider?: string;
}

export interface SecretsConfig {
  readonly mode: "per_launch";
  readonly path: string;
}

export interface TransportConfig {
  readonly connect: "loopback";
  readonly http: "loopback";
  readonly gui: "loopback";
}

export interface ContextKernelConfig {
  /** argv for the Context Kernel stdio server, e.g. `["context-kernal", "serve", ...]`. */
  readonly command: readonly string[];
  /** Corpus the debugger queries. An opaque id, never a path. */
  readonly corpus_id: string;
}

/**
 * Case economics (HC-06): an optional, read-only binding to a RealityTrace store that holds agent events.
 * It is NOT the obligation store: that one has its own data home. Absent means the view says how to enable it.
 */
export interface EconomicsConfig {
  /** The `realitytrace` binary. Only `repo list`, `ledger export` and `projections export` are ever run. */
  readonly realitytrace_bin: string;
  /** XDG_DATA_HOME of the store to read (the agent tap's). Absent: RealityTrace's own default location. */
  readonly data_home?: string;
  readonly state_home?: string;
}

/** One record store Horizon reads (`[[records.sources]]`). `personal` has no paths: RealityTrace's own default location, read-only. */
export interface RecordSource {
  readonly name: string;
  readonly kind: "personal" | "workshop" | "horizon";
  readonly data_home?: string;
  readonly state_home?: string;
}

export interface RecordsConfig {
  readonly sources: readonly RecordSource[];
}

/** Where the workshop (Cognate Workbench) listens and where its Horizon key file lives. */
export interface WorkshopConfig {
  readonly url: string;
  readonly key_path: string;
}

export interface UiConfig {
  readonly timezone: string;
}

export interface HorizonConfig {
  readonly deployment_profile: DeploymentProfile;
  readonly bind_host: string;
  readonly port: number;
  readonly world_alias: string;
  readonly world_ref: string;
  readonly runtime_store: string;
  readonly research_command: readonly string[];
  /**
   * Absent when no Context Kernel is bound. Absence is `absent`, never `unavailable`: Horizon must
   * not report "the server is down" about a server nobody configured (REQ-STACK-005).
   */
  readonly context_kernel?: ContextKernelConfig;
  readonly identity: IdentityConfig;
  readonly secrets: SecretsConfig;
  readonly transports: TransportConfig;
  /** HORIZON-001 1.1.0: operator-owned capability bindings for operations beyond the structural moves. */
  readonly operations: readonly OperationBindingConfig[];
  /** REQ-NAV-009: allowances per (currency, unit); absent means no capacity is configured. */
  readonly capacity: readonly CapacityAllowance[];
  /** REQ-NAV-011/012: how verifiers are confined and how late a closure may be recorded. Absent: no settlement. */
  readonly settlement?: SettlementConfig;
  /** HC-06: where case economics are read from. Absent: the economics view shows an honest "not configured". */
  readonly economics?: EconomicsConfig;
  /** Operator-to-SEA-Forge-actor mapping for remote and desktop sessions. Absent: the single-operator development default. */
  readonly operators?: OperatorsConfig;
  /** Setup stage 0: the record stores Horizon reads. Absent: none configured. */
  readonly records?: RecordsConfig;
  readonly workshop?: WorkshopConfig;
  readonly ui?: UiConfig;
}

/**
 * Which SEA-Forge actor each durable operator acts as. The only source of a session's SEA-Forge actor:
 * never a request field, header or cookie. Validated at startup against the identity store.
 */
export interface OperatorsConfig {
  /** The durable operator the cockpit's own (desktop) session approves pairing for. */
  readonly desktop_operator?: string;
  /** Actors the gateway may present `on_behalf_of`; every mapped actor must be listed. */
  readonly delegable_actors?: readonly string[];
  /** Durable operator id to SEA-Forge actor id. */
  readonly actors: Readonly<Record<string, string>>;
}

/** One operation's reviewed, versioned capability binding (SPEC-CR-002 §1, §4). */
export interface OperationBindingConfig {
  readonly operation_ref: string;
  readonly label: string;
  readonly reversibility: "read_only" | "reversible" | "compensable" | "irreversible" | "unknown";
  /** `required` makes even a read_only operation require operational settlement. */
  readonly settlement?: "required";
  /** Declared bounds (and optional predictions); coverage is judged by the payment gate, not at load. */
  readonly payment: readonly PaymentEntry[];
  readonly verifier?: VerifierTemplate;
  /** Where each pinned artifact lives on this host, by artifact name. */
  readonly verifier_paths: Readonly<Record<string, string>>;
}

export interface SettlementConfig {
  /** The confinement prefix every verifier runs under (e.g. an attested bubblewrap with a read-only view, no network). */
  readonly launcher: readonly string[];
  readonly close_grace_s: number;
  /**
   * Directory holding the verifier's read-only snapshot of the store (`app.sqlite` inside it). The launcher mounts
   * this, not the live store's directory. Absent: `verifier-snapshot` beside the live store's directory.
   */
  readonly snapshot_dir?: string;
}

export interface LoadedConfig {
  readonly config: HorizonConfig;
  readonly operator: {
    readonly principal: { readonly id: string; readonly kind: "user" };
    readonly tenant: string;
  };
  readonly launchSecret: string;
  readonly secretPath: string;
  /** `HORIZON_SETUP`; undefined when unset (Horizon behaves as before). */
  readonly setup?: SetupName;
}

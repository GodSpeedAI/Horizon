export type DeploymentProfile = "local_operator" | "shared_remote";

export interface IdentityConfig {
  readonly source: "os_session" | "identity_provider";
  readonly operator_prefix: string;
  readonly agent_prefix: string;
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

export interface HorizonConfig {
  readonly deployment_profile: DeploymentProfile;
  readonly bind_host: string;
  readonly port: number;
  readonly world_alias: string;
  readonly world_ref: string;
  readonly runtime_store: string;
  readonly research_command: readonly string[];
  readonly identity: IdentityConfig;
  readonly secrets: SecretsConfig;
  readonly transports: TransportConfig;
}

export interface LoadedConfig {
  readonly config: HorizonConfig;
  readonly operator: {
    readonly principal: { readonly id: string; readonly kind: "user" };
    readonly tenant: string;
  };
  readonly launchSecret: string;
  readonly secretPath: string;
}

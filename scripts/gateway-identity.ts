/**
 * Pure rules for the SEA-Forge gateway identity used by `bun run ignite`.
 *
 * The gateway is a dedicated, separately provisioned service account. It is configured, never derived
 * from the process that launches Horizon. The SEA-Forge actor `operator` stays a logical actor id and a
 * backward-compatible single-operator development default; it is not a Linux name.
 * The OS principal read by src/config/load.ts is diagnostics only and plays no part here.
 */

export const DEFAULT_GATEWAY_ACCOUNT = "godspeed-sea-forge";
export const UNISOLATED_MODE = "unisolated-development";
export type GatewayMode = "governed" | typeof UNISOLATED_MODE;

export interface GatewaySettings {
  account: string;
  /** Expected owner account name of the socket; defaults to the gateway account. */
  socketOwner: string;
  mode: GatewayMode;
}

/** Explicit configuration: env overrides the cell file, which overrides the product default. */
export function resolveGatewaySettings(
  env: Record<string, string | undefined>,
  cellConfig: { account?: string; socket_owner?: string; mode?: string } = {},
  unisolatedFlag = false,
): GatewaySettings {
  const pick = (v: string | undefined) => (v?.trim() ? v.trim() : undefined);
  const account = pick(env.HORIZON_GATEWAY_ACCOUNT) ?? pick(cellConfig.account) ?? DEFAULT_GATEWAY_ACCOUNT;
  const socketOwner = pick(env.HORIZON_GATEWAY_SOCKET_OWNER) ?? pick(cellConfig.socket_owner) ?? account;
  const requested = pick(env.HORIZON_GATEWAY_MODE) ?? pick(cellConfig.mode);
  const mode: GatewayMode = unisolatedFlag || requested === UNISOLATED_MODE ? UNISOLATED_MODE : "governed";
  return { account, socketOwner, mode };
}

/** What the OS reported about an account name; uid is null when the account does not exist. */
export interface AccountFact {
  name: string;
  uid: number | null;
}

export interface GatewayFacts {
  gateway: AccountFact;
  /** The owner of the socket, resolved to an account, or null when the socket does not exist yet. */
  socketOwner: AccountFact | null;
  /** Used for the comparison only; never written to configuration. */
  currentUid: number;
}

export interface GatewayVerdict {
  ok: boolean;
  mode: GatewayMode;
  insecure: boolean;
  errors: string[];
}

export function validateGateway(settings: GatewaySettings, facts: GatewayFacts): GatewayVerdict {
  if (settings.mode === UNISOLATED_MODE) {
    return { ok: true, mode: UNISOLATED_MODE, insecure: true, errors: [] };
  }
  const errors: string[] = [];
  const { gateway } = facts;
  if (gateway.uid === null) {
    errors.push(`gateway account '${gateway.name}' does not exist (run scripts/install-sea-forge-gateway.sh to see the setup plan)`);
  } else {
    if (gateway.uid === 0) errors.push(`gateway account '${gateway.name}' is root; the gateway must be an unprivileged service account`);
    if (gateway.uid === facts.currentUid) {
      errors.push(`gateway account '${gateway.name}' is the account running Horizon and the coding agents; the operator must not be the gateway`);
    }
  }
  if (facts.socketOwner === null) {
    errors.push(`gateway socket does not exist; the gateway service account '${settings.socketOwner}' must start SEA-Forge`);
  } else if (facts.socketOwner.name !== settings.socketOwner || (gateway.uid !== null && facts.socketOwner.uid !== gateway.uid)) {
    errors.push(`gateway socket is owned by '${facts.socketOwner.name}', expected '${settings.socketOwner}'`);
  }
  return { ok: errors.length === 0, mode: "governed", insecure: false, errors };
}

export function refusalMessage(v: GatewayVerdict): string {
  return [
    "governed mode refused to start:",
    ...v.errors.map((e) => `  - ${e}`),
    `  To run without isolation for development only, ask for it explicitly: --unisolated-development (or HORIZON_GATEWAY_MODE=${UNISOLATED_MODE}). Approvals are then marked INSECURE.`,
  ].join("\n");
}

export interface StatusRecord {
  mode: GatewayMode;
  approvals: "INSECURE" | "isolated";
  gateway_account: string | null;
  note: string;
}

export function statusFor(v: GatewayVerdict, settings: GatewaySettings): StatusRecord {
  return v.insecure
    ? { mode: v.mode, approvals: "INSECURE", gateway_account: null, note: "governed approvals are INSECURE: the gateway shares the operator's account (unisolated-development)" }
    : { mode: v.mode, approvals: "isolated", gateway_account: settings.account, note: "gateway runs as a separate service account" };
}

export type ConfigPlan =
  | { action: "write" }
  | { action: "keep" }
  | { action: "sidecar"; summary: string };

/** Never overwrite an authoritative file: write when absent, keep when identical, else sidecar + summary. */
export function planConfigWrite(existing: string | null, next: string): ConfigPlan {
  if (existing === null) return { action: "write" };
  if (existing === next) return { action: "keep" };
  const a = existing.split("\n");
  const b = next.split("\n");
  const sa = new Set(a);
  const sb = new Set(b);
  const removed = a.filter((l) => !sb.has(l));
  const added = b.filter((l) => !sa.has(l));
  const lines = [...removed.map((l) => `- ${l.trim()}`), ...added.map((l) => `+ ${l.trim()}`)];
  return { action: "sidecar", summary: `${removed.length} line(s) differ in the existing file, ${added.length} in the generated one\n${lines.join("\n")}` };
}

export function sidecarName(path: string, now: Date): string {
  return `${path}.generated-${now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}`;
}

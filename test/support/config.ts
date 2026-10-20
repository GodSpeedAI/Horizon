/**
 * Test support: write the same `horizon.toml` an operator writes, so tests exercise
 * `loadConfig` → `config.runtime_store` → `assertStoreBoundary` instead of overriding the
 * store path inside the application (the defect the T04 verdict called F5).
 */
export const PINNED_WORLD_REF =
  "world:horizon@sha256:6c18d6a608bd9d83e6aa354d5a8cc804009ca208562021c1736ee429412309f0";

export const RESEARCH_COMMAND = ["uv", "run", "--project", "research", "python", "-m", "horizon_research.contract"];

export function horizonDocument(options: {
  readonly storePath: string;
  readonly researchCommand?: readonly string[];
  readonly secretPath: string;
  readonly worldRef?: string;
}): Record<string, unknown> {
  return {
    deployment_profile: "local_operator",
    bind_host: "127.0.0.1",
    port: 0,
    world_alias: "horizon",
    world_ref: options.worldRef ?? PINNED_WORLD_REF,
    runtime_store: options.storePath,
    research_command: [...(options.researchCommand ?? RESEARCH_COMMAND)],
    identity: { source: "os_session", operator_prefix: "os:", agent_prefix: "agent:" },
    secrets: { mode: "per_launch", path: options.secretPath },
    transports: { connect: "loopback", http: "loopback", gui: "loopback" },
  };
}

export function toToml(document: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(document)) {
    if (value && typeof value === "object" && !Array.isArray(value)) continue;
    lines.push(`${key} = ${JSON.stringify(value)}`);
  }
  for (const [key, value] of Object.entries(document)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    lines.push(`\n[${key}]`);
    for (const [inner, innerValue] of Object.entries(value)) lines.push(`${inner} = ${JSON.stringify(innerValue)}`);
  }
  return lines.join("\n");
}

export async function writeConfig(path: string, document: Record<string, unknown>): Promise<string> {
  await Bun.write(path, `${toToml(document)}\n`);
  return path;
}

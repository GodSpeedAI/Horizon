/**
 * Test support: write the same `horizon.toml` an operator writes, so tests exercise
 * `loadConfig` → `config.runtime_store` → `assertStoreBoundary` instead of overriding the
 * store path inside the application (the defect the T04 verdict called F5).
 */
export const PINNED_WORLD_REF =
  "world:horizon@sha256:701d6211e7ef60ebb35d100cd8968561a4982daec7162107e91937e3929af290";

export const RESEARCH_COMMAND = ["uv", "run", "--project", "research", "python", "-m", "horizon_research.contract"];

export function horizonDocument(options: {
  readonly storePath: string;
  readonly researchCommand?: readonly string[];
  readonly secretPath: string;
  readonly worldRef?: string;
  /** Omit entirely to leave Context Kernel unbound (`absent`); a list binds it. */
  readonly contextKernelCommand?: readonly string[];
  readonly corpusId?: string;
}): Record<string, unknown> {
  return {
    deployment_profile: "local_operator",
    bind_host: "127.0.0.1",
    port: 0,
    world_alias: "horizon",
    world_ref: options.worldRef ?? PINNED_WORLD_REF,
    runtime_store: options.storePath,
    research_command: [...(options.researchCommand ?? RESEARCH_COMMAND)],
    ...(options.contextKernelCommand === undefined
      ? {}
      : { context_kernel: { command: [...options.contextKernelCommand], corpus_id: options.corpusId ?? "horizon" } }),
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

import { describe, expect, test } from "bun:test";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  agentPrincipal,
  assertAgentPrincipal,
  configFromDocument,
  loadConfig,
  operatorPrincipal,
} from "../src/config/load.ts";

function fixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    deployment_profile: "local_operator",
    bind_host: "127.0.0.1",
    port: 4319,
    world_alias: "horizon",
    world_ref:
      "world:horizon@sha256:0a10c20d22ee11a184165005a553390e7a45ce0b858773e2220e442eb0cf9d2b",
    runtime_store: ".cognate/app.sqlite",
    research_command: ["uv", "run", "--project", "research", "python", "-m", "horizon_research.contract"],
    identity: { source: "os_session", operator_prefix: "os:", agent_prefix: "agent:" },
    secrets: { mode: "per_launch", path: ".cognate/local-operator.secret" },
    transports: { connect: "loopback", http: "loopback", gui: "loopback" },
    ...overrides,
  };
}

describe("local_operator configuration", () => {
  test("accepts a loopback local operator", () => {
    const config = configFromDocument(fixture());
    expect(config.deployment_profile).toBe("local_operator");
    expect(config.bind_host).toBe("127.0.0.1");
  });

  test("refuses a non-loopback bind", () => {
    expect(() => configFromDocument(fixture({ bind_host: "0.0.0.0" }))).toThrow("must be loopback");
  });

  test("refuses shared_remote without a real identity provider", () => {
    expect(() =>
      configFromDocument(
        fixture({
          deployment_profile: "shared_remote",
          bind_host: "0.0.0.0",
          identity: { source: "identity_provider", operator_prefix: "idp:", agent_prefix: "agent:" },
        }),
      ),
    ).toThrow("requires identity.identity_provider");
  });

  test("keeps operator and agent principals distinct", () => {
    const config = configFromDocument(fixture());
    const operator = operatorPrincipal(config);
    const agent = agentPrincipal(config, "horizon.health");
    expect(operator.kind).toBe("user");
    expect(agent.kind).toBe("agent");
    expect(agent.id).not.toBe(operator.id);
    expect(() => assertAgentPrincipal(config, { actor: operator }, "horizon.health")).toThrow("never the operator");
  });

  test("issues a fresh 0600 secret on every launch", async () => {
    const root = mkdtempSync(join(tmpdir(), "horizon-config-"));
    const secretPath = join(root, "launch.secret");
    const configPath = join(root, "horizon.toml");
    const document = fixture({
      secrets: { mode: "per_launch", path: secretPath },
      runtime_store: join(root, "app.sqlite"),
    });
    await Bun.write(configPath, `${toToml(document)}\n`);
    const first = loadConfig(configPath);
    const second = loadConfig(configPath);
    expect(first.launchSecret).not.toBe(second.launchSecret);
    expect(statSync(secretPath).mode & 0o777).toBe(0o600);
  });
});

function toToml(document: Record<string, unknown>): string {
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

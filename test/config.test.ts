import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { horizonDocument, writeConfig } from "./support/config.ts";
import {
  agentPrincipal,
  assertAgentPrincipal,
  configFromDocument,
  loadConfig,
  operatorPrincipal,
} from "../src/config/load.ts";

// Every loadConfig here writes the agent key somewhere: point the default at a temp dir so tests never touch .cognate/.
const agentKeyRoot = mkdtempSync(join(tmpdir(), "horizon-agent-key-default-"));
// Every test here starts with the secret-file env cleared, so a desk test that left HORIZON_SECRET_FILE set cannot redirect the secret.
let savedAgentKeyFile: string | undefined;
let savedSecretFile: string | undefined;
beforeEach(() => {
  savedAgentKeyFile = process.env.HORIZON_AGENT_KEY_FILE;
  savedSecretFile = process.env.HORIZON_SECRET_FILE;
  delete process.env.HORIZON_SECRET_FILE;
  process.env.HORIZON_AGENT_KEY_FILE = join(agentKeyRoot, "agent.key");
});
afterEach(() => {
  if (savedAgentKeyFile === undefined) delete process.env.HORIZON_AGENT_KEY_FILE;
  else process.env.HORIZON_AGENT_KEY_FILE = savedAgentKeyFile;
  if (savedSecretFile === undefined) delete process.env.HORIZON_SECRET_FILE;
  else process.env.HORIZON_SECRET_FILE = savedSecretFile;
});

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

describe("the agent key is stable across loads", () => {
  const configFor = (root: string): string => {
    const configPath = join(root, "horizon.toml");
    writeFileSync(configPath, `${toToml(fixture({ secrets: { mode: "per_launch", path: join(root, "launch.secret") }, runtime_store: join(root, "app.sqlite") }))}\n`);
    return configPath;
  };

  test("the key file is created 0600 with 64 hex characters", () => {
    const root = mkdtempSync(join(tmpdir(), "horizon-agent-key-"));
    const keyPath = join(root, "secrets", "agent.key");
    process.env.HORIZON_AGENT_KEY_FILE = keyPath;
    const loaded = loadConfig(configFor(root));
    expect(loaded.agentKeyPath).toBe(keyPath);
    expect(statSync(keyPath).mode & 0o777).toBe(0o600);
    expect(loaded.agentKey).toMatch(/^[0-9a-f]{64}$/);
    expect(loaded.agentKey).not.toBe(loaded.launchSecret);
  });

  test("a second load returns the same key and does not rewrite the file", async () => {
    const root = mkdtempSync(join(tmpdir(), "horizon-agent-key-"));
    const keyPath = join(root, "agent.key");
    process.env.HORIZON_AGENT_KEY_FILE = keyPath;
    const configPath = configFor(root);
    const first = loadConfig(configPath);
    const before = statSync(keyPath).mtimeMs;
    const contentBefore = readFileSync(keyPath, "utf8");
    await Bun.sleep(20);
    const second = loadConfig(configPath);
    expect(second.agentKey).toBe(first.agentKey);
    expect(readFileSync(keyPath, "utf8")).toBe(contentBefore);
    expect(statSync(keyPath).mtimeMs).toBe(before);
    expect(first.launchSecret).not.toBe(second.launchSecret);
  });

  test("HORIZON_AGENT_KEY_FILE overrides the default path", () => {
    const root = mkdtempSync(join(tmpdir(), "horizon-agent-key-"));
    const override = join(root, "custom", "door.key");
    process.env.HORIZON_AGENT_KEY_FILE = override;
    const loaded = loadConfig(configFor(root));
    expect(loaded.agentKeyPath).toBe(override);
    expect(existsSync(override)).toBe(true);
    expect(readFileSync(override, "utf8").trim()).toBe(loaded.agentKey);
  });

  test("an invalid key file is replaced with a new valid key", () => {
    const root = mkdtempSync(join(tmpdir(), "horizon-agent-key-"));
    const keyPath = join(root, "agent.key");
    mkdirSync(root, { recursive: true });
    writeFileSync(keyPath, "not-a-key\n");
    process.env.HORIZON_AGENT_KEY_FILE = keyPath;
    const loaded = loadConfig(configFor(root));
    expect(loaded.agentKey).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync(keyPath, "utf8").trim()).toBe(loaded.agentKey);
    expect(statSync(keyPath).mode & 0o777).toBe(0o600);
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

/** The local operator's identity is configured; the OS account (the runtime's service user) never is. */
describe("local operator identity is configured, not the OS account", () => {
  const withOperatorEnv = (value: string | undefined, run: () => void) => {
    const before = process.env.HORIZON_OPERATOR_REF;
    if (value === undefined) delete process.env.HORIZON_OPERATOR_REF;
    else process.env.HORIZON_OPERATOR_REF = value;
    try {
      run();
    } finally {
      if (before === undefined) delete process.env.HORIZON_OPERATOR_REF;
      else process.env.HORIZON_OPERATOR_REF = before;
    }
  };
  let configPath = "";
  beforeAll(async () => {
    const root = mkdtempSync(join(tmpdir(), "horizon-operator-"));
    configPath = await writeConfig(join(root, "horizon.toml"), horizonDocument({ storePath: join(root, "app.sqlite"), secretPath: join(root, "launch.secret") }));
  });
  const load = () => loadConfig(configPath);
  const osRef = () => {
    const info = userInfo();
    return `os:${info.username}:${info.uid}`;
  };

  test("defaults to the configured actor ref when the environment is unset", () => {
    withOperatorEnv(undefined, () => {
      const loaded = load();
      expect(loaded.operator.principal.id).toBe("actor:operator");
      expect(loaded.operator.principal.id).not.toBe(osRef());
    });
  });

  test("HORIZON_OPERATOR_REF overrides the configured default", () => {
    withOperatorEnv("actor:cockpit-owner", () => {
      expect(load().operator.principal.id).toBe("actor:cockpit-owner");
    });
  });

  test("startup refuses an empty, OS-shaped, or malformed HORIZON_OPERATOR_REF", () => {
    for (const bad of ["", "   ", "operator", "actor:", "actor:has space", osRef(), `os:${userInfo().username}`]) {
      withOperatorEnv(bad, () => {
        expect(() => load()).toThrow(/HORIZON_OPERATOR_REF/);
      });
    }
  });

  test("the OS account name and UID never appear in the operator principal", () => {
    withOperatorEnv(undefined, () => {
      const id = load().operator.principal.id;
      expect(id).not.toContain(`:${userInfo().uid}`);
      expect(id.startsWith("os:")).toBe(false);
    });
  });
});


describe("a read-only load never creates or rotates the agent key", () => {
  const configFor = (root: string): string => {
    const configPath = join(root, "horizon.toml");
    writeFileSync(configPath, `${toToml(fixture({ secrets: { mode: "per_launch", path: join(root, "launch.secret") }, runtime_store: join(root, "app.sqlite") }))}\n`);
    return configPath;
  };

  test("an absent agent key is refused and no file is created", () => {
    const root = mkdtempSync(join(tmpdir(), "horizon-agent-key-ro-"));
    const keyPath = join(root, "secrets", "agent.key");
    process.env.HORIZON_AGENT_KEY_FILE = keyPath;
    writeFileSync(join(root, "launch.secret"), `${"a".repeat(64)}\n`);
    expect(() => loadConfig(configFor(root), { readOnly: true })).toThrow("no valid agent key");
    expect(existsSync(keyPath)).toBe(false);
  });

  test("an invalid agent key is refused and its bytes are left unchanged", () => {
    const root = mkdtempSync(join(tmpdir(), "horizon-agent-key-ro-"));
    const keyPath = join(root, "agent.key");
    process.env.HORIZON_AGENT_KEY_FILE = keyPath;
    writeFileSync(join(root, "launch.secret"), `${"a".repeat(64)}\n`);
    writeFileSync(keyPath, "not-a-key\n", { mode: 0o600 });
    const before = readFileSync(keyPath);
    expect(() => loadConfig(configFor(root), { readOnly: true })).toThrow("no valid agent key");
    expect(readFileSync(keyPath).equals(before)).toBe(true);
  });

  test("a valid agent key is read and its bytes are left unchanged", () => {
    const root = mkdtempSync(join(tmpdir(), "horizon-agent-key-ro-"));
    const keyPath = join(root, "agent.key");
    process.env.HORIZON_AGENT_KEY_FILE = keyPath;
    writeFileSync(join(root, "launch.secret"), `${"a".repeat(64)}\n`);
    const key = "b".repeat(64);
    writeFileSync(keyPath, `${key}\n`, { mode: 0o600 });
    const before = readFileSync(keyPath);
    const loaded = loadConfig(configFor(root), { readOnly: true });
    expect(loaded.agentKey).toBe(key);
    expect(readFileSync(keyPath).equals(before)).toBe(true);
  });
});

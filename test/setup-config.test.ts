import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { horizonDocument, writeConfig } from "./support/config.ts";
import { loadConfig } from "../src/config/load.ts";
import { SETUP_SERVICES, parseSetup, setupEnv, setupMapping } from "../src/config/setup.ts";

const KEYS = ["HORIZON_SETUP", "HORIZON_SETUPS_BASE", "HORIZON_STORE", "HORIZON_SECRET_FILE", "HORIZON_OPERATOR_REF"] as const;

describe("setup configuration", () => {
  let base: string;
  let configPath: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(async () => {
    for (const key of KEYS) saved[key] = process.env[key];
    for (const key of KEYS) delete process.env[key];
    base = mkdtempSync(join(tmpdir(), "horizon-setup-config-"));
    process.env.HORIZON_SETUPS_BASE = join(base, "setups");
    process.env.HORIZON_SECRET_FILE = join(base, "launch.secret");
    configPath = await writeConfig(join(base, "horizon.toml"), horizonDocument({ storePath: join(base, "app.sqlite"), secretPath: join(base, "unused.secret") }));
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  function markSetup(name: "testing" | "production"): void {
    const m = setupMapping(name, process.env);
    mkdirSync(m.root, { recursive: true });
    writeFileSync(m.marker, JSON.stringify({ name, root: m.root, createdAt: new Date().toISOString() }));
  }

  test("HORIZON_SETUP accepts testing and production only", () => {
    expect(parseSetup({})).toBeUndefined();
    expect(parseSetup({ HORIZON_SETUP: "testing" })).toBe("testing");
    expect(parseSetup({ HORIZON_SETUP: "production" })).toBe("production");
    expect(() => parseSetup({ HORIZON_SETUP: "staging" })).toThrow("testing or production");
    process.env.HORIZON_SETUP = "staging";
    expect(() => loadConfig(configPath)).toThrow("testing or production");
    process.env.HORIZON_SETUP = "testing";
    expect(() => loadConfig(configPath)).toThrow("is missing");
  });

  test("testing setup gives org id local:<hostname>:testing and production keeps local:<hostname>", () => {
    expect(loadConfig(configPath).operator.tenant).toBe(`local:${hostname()}`);
    expect(loadConfig(configPath).setup).toBeUndefined();
    markSetup("testing");
    markSetup("production");
    process.env.HORIZON_SETUP = "testing";
    expect(loadConfig(configPath).operator.tenant).toBe(`local:${hostname()}:testing`);
    process.env.HORIZON_SETUP = "production";
    expect(loadConfig(configPath).operator.tenant).toBe(`local:${hostname()}`);
  });

  test("HORIZON_STORE overrides config/horizon.toml runtime_store", () => {
    const override = join(base, "override.sqlite");
    expect(loadConfig(configPath).config.runtime_store).toBe(join(base, "app.sqlite"));
    process.env.HORIZON_STORE = override;
    expect(loadConfig(configPath).config.runtime_store).toBe(override);
    markSetup("testing");
    process.env.HORIZON_SETUP = "testing";
    expect(loadConfig(configPath).config.runtime_store).toBe(override);
  });

  test("records, workshop and ui sections load, and are absent when not written", async () => {
    expect(loadConfig(configPath).config.records).toBeUndefined();
    const text = `${await Bun.file(configPath).text()}
[[records.sources]]
name = "personal"
kind = "personal"

[[records.sources]]
name = "workshop"
kind = "workshop"
data_home = "/x/data"
state_home = "/x/state"

[workshop]
url = "http://127.0.0.1:3190"
key_path = "/x/workbench.key"

[ui]
timezone = "UTC"
`;
    writeFileSync(configPath, text);
    const { config } = loadConfig(configPath);
    expect(config.records?.sources.map((s) => s.name)).toEqual(["personal", "workshop"]);
    expect(config.workshop?.url).toBe("http://127.0.0.1:3190");
    expect(config.ui?.timezone).toBe("UTC");
    writeFileSync(configPath, text.replace('kind = "personal"', 'kind = "personal"\ndata_home = "/nope"'));
    expect(() => loadConfig(configPath)).toThrow("personal record has no paths");
  });

  test("setup env maps every service to paths under the setup root", () => {
    for (const name of ["testing", "production"] as const) {
      const m = setupMapping(name, process.env);
      expect(m.root).toBe(join(base, "setups", name));
      for (const service of SETUP_SERVICES) {
        const env = setupEnv(name, service, process.env);
        expect(env.HORIZON_SETUP).toBe(name);
        for (const [key, value] of Object.entries(env)) {
          if (/HOME$|ROOT$|SOCKET$|CONFIG$|HEARTBEAT$/.test(key) && key !== "SEA_FORGE_SERVER_BIN") {
            expect(value.startsWith(`${m.root}/`)).toBe(true);
          }
        }
      }
    }
    const testing = setupEnv("testing", "workbench", process.env);
    expect(testing.PORT).toBe("3190");
    expect(setupEnv("production", "workbench", process.env).PORT).toBe("3180");
    const horizon = setupEnv("testing", "horizon", process.env);
    expect(horizon.COGNATE_REALITYTRACE_DATA_HOME).toBe(join(base, "setups", "testing", "cell", "realitytrace", "data"));
    expect(horizon.SEA_FORGE_ROOT).toBe(join(base, "setups", "testing", "cell"));
  });
});

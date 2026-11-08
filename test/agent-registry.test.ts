import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addAgentKey, DEFAULT_AGENT_KEY_ID, keyHash, ownerOfKey, readRegistry } from "../src/desk/agent-keys.ts";

const temp = (): { dir: string; path: string } => {
  const dir = mkdtempSync(join(tmpdir(), "agents-"));
  return { dir, path: join(dir, "agents.json") };
};
const DEFAULT = "f".repeat(64);

describe("the agent registry", () => {
  test("a new key is returned to its caller, and the registry keeps only its hash", () => {
    const { path } = temp();
    const made = addAgentKey(path, "Helper");
    const text = readFileSync(path, "utf8");
    expect(text).not.toContain(made.key);
    expect(text).toContain(keyHash(made.key));
    expect(readRegistry(path)).toHaveLength(1);
  });

  test("the key that was added identifies its agent, and nothing else does", () => {
    const { path } = temp();
    const made = addAgentKey(path, "Helper");
    expect(ownerOfKey(made.key, DEFAULT, path)).toEqual({ key_id: made.key_id, name: "Helper" });
    expect(ownerOfKey("0".repeat(64), DEFAULT, path)).toBeNull();
    expect(ownerOfKey("", DEFAULT, path)).toBeNull();
  });

  test("the setup's default key is the default agent", () => {
    const { path } = temp();
    expect(ownerOfKey(DEFAULT, DEFAULT, path)).toEqual({ key_id: DEFAULT_AGENT_KEY_ID, name: "Default agent" });
  });

  test("two agents get two key ids and two keys", () => {
    const { path } = temp();
    const a = addAgentKey(path, "Alpha");
    const b = addAgentKey(path, "Bravo");
    expect(a.key_id).not.toBe(b.key_id);
    expect(a.key).not.toBe(b.key);
    expect(ownerOfKey(a.key, DEFAULT, path)?.key_id).toBe(a.key_id);
    expect(ownerOfKey(b.key, DEFAULT, path)?.key_id).toBe(b.key_id);
  });

  test("a name is used once, and a name that is not plain text is refused", () => {
    const { path } = temp();
    addAgentKey(path, "Helper");
    expect(() => addAgentKey(path, "helper")).toThrow("already in the registry");
    expect(() => addAgentKey(path, "")).toThrow("plain characters");
    expect(() => addAgentKey(path, "bad\nname")).toThrow("plain characters");
    expect(() => addAgentKey(path, "Default agent")).toThrow("setup's own agent");
  });

  test("a damaged registry is refused, not read as empty; the default key still works", () => {
    const { path } = temp();
    writeFileSync(path, "{\"schema\":\"something else\"}");
    expect(() => addAgentKey(path, "Helper")).toThrow("is not a horizon.agents/1 file");
    expect(ownerOfKey(DEFAULT, DEFAULT, path)?.key_id).toBe(DEFAULT_AGENT_KEY_ID);
    expect(ownerOfKey("1".repeat(64), DEFAULT, path)).toBeNull();
  });
});

describe("scripts/agent-key.ts add", () => {
  test("prints the key once, stores only its hash, and refuses a second use of the name", async () => {
    const { dir } = temp();
    const env: Record<string, string> = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "HORIZON_SETUP") as [string, string][]);
    env.HORIZON_AGENT_KEY_FILE = join(dir, "agent.key");
    const run = async (name: string) => {
      const proc = Bun.spawn(["bun", "run", "scripts/agent-key.ts", "add", name], { env, stdout: "pipe", stderr: "pipe", cwd: process.cwd() });
      const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
      return { out, err, code };
    };
    const first = await run("Scripted");
    expect(first.code).toBe(0);
    const keyLines = first.out.split("\n").filter((line) => /^[0-9a-f]{64}$/.test(line));
    expect(keyLines).toHaveLength(1);
    const text = readFileSync(join(dir, "agents.json"), "utf8");
    expect(text).not.toContain(keyLines[0]!);
    expect(text).toContain(keyHash(keyLines[0]!));
    const again = await run("Scripted");
    expect(again.code).toBe(1);
    expect(again.out).not.toMatch(/[0-9a-f]{64}/);
  }, 60_000);
});

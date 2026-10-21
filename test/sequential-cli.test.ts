/**
 * `horizon frame --json` is the agent/script half of the same sequential contract. The command
 * must come from the application's real store and world, not from a renderer-owned fixture, and
 * it must expose the typed prompt without executing anything.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { horizonDocument, writeConfig } from "./support/config.ts";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("T08 frame command", () => {
  test("prints the shared frame and one prompt as JSON, with no side effect", async () => {
    const root = mkdtempSync(join(tmpdir(), "t08-cli-"));
    roots.push(root);
    const configPath = await writeConfig(
      join(root, "horizon.toml"),
      horizonDocument({ storePath: join(root, "app.sqlite"), secretPath: join(root, "launch.secret") }),
    );
    const proc = Bun.spawn(["bun", "run", "src/main.ts", "frame", "--json"], {
      cwd: process.cwd(),
      env: { ...process.env, HORIZON_CONFIG: configPath },
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const code = await proc.exited;
    expect(code).toBe(0);
    expect(stderr).toBe("");
    const output = JSON.parse(stdout) as {
      schema: string;
      source: string;
      intent_schema: string;
      frame: { schema: string; frame_id: string; revision: number; authority: { grants_authority: boolean }; choices: unknown[] };
      prompt: { kind: string; frame_id: string; revision: number; question: string; options: unknown[] };
    };
    expect(output.schema).toBe("horizon.frame/1");
    expect(output.source).toBe("operational-projection");
    expect(output.intent_schema).toBe("horizon.sequential-intent/1");
    expect(output.frame.schema).toBe("horizon.navigation/2");
    expect(output.frame.authority.grants_authority).toBe(false);
    expect(output.prompt.kind).toBe("choice");
    expect(output.prompt.frame_id).toBe(output.frame.frame_id);
    expect(output.prompt.revision).toBe(output.frame.revision);
    expect(output.prompt.question.length).toBeGreaterThan(0);
    expect(output.prompt.options.length).toBeGreaterThan(0);
  }, 30_000);

  test("prints stable text when a terminal is not wanted", async () => {
    const root = mkdtempSync(join(tmpdir(), "t08-cli-text-"));
    roots.push(root);
    const configPath = await writeConfig(
      join(root, "horizon.toml"),
      horizonDocument({ storePath: join(root, "app.sqlite"), secretPath: join(root, "launch.secret") }),
    );
    const proc = Bun.spawn(["bun", "run", "src/main.ts", "frame", "--text"], {
      cwd: process.cwd(),
      env: { ...process.env, HORIZON_CONFIG: configPath },
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const code = await proc.exited;
    expect(code).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("frame=");
    expect(stdout).toContain("world=");
    expect(stdout).not.toContain("\"schema\"");
  }, 30_000);
});

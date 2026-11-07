import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");
const REGISTRATION_HOME = "src/ui/desk/webmcp.ts";

function sourceFiles(dir: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const entry of readdirSync(dir, { recursive: true })) {
    const path = join(dir, String(entry));
    if (!/\.(ts|tsx)$/.test(path)) continue;
    files.set(relative(ROOT, path).split("\\").join("/"), readFileSync(path, "utf8"));
  }
  return files;
}

describe("WebMCP architecture", () => {
  test("src/ has source files to check", () => {
    expect(sourceFiles(SRC).size).toBeGreaterThan(20);
  });

  test("registerTool( appears only in the desk's one registration file", () => {
    const hits = [...sourceFiles(SRC).entries()]
      .filter(([, content]) => content.includes("registerTool("))
      .map(([path]) => path);
    expect(hits).toEqual([REGISTRATION_HOME]);
  });

  test("the stale navigator.modelContext API is never referenced under src/", () => {
    for (const [path, content] of sourceFiles(SRC)) {
      expect(content.includes("navigator.modelContext"), `stale WebMCP API referenced in ${path}`).toBe(false);
    }
  });
});

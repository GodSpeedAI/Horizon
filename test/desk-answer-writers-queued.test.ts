/**
 * A grep-check that no path writes answer records outside the desk's queue. The writers in panel-answers.ts are exported for the
 * desk's queued commands and for tests; production code reaches them only from inside panelCommand (app.ts) or through the
 * migration runner, which runs each migration as one queued command.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(import.meta.dir, "..", "src");
const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? files(path) : path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : [];
});
const sources = new Map(files(SRC).map((path) => [relative(SRC, path), readFileSync(path, "utf8")] as const));
const app = sources.get("app.ts")!;

/** The name of the function whose body contains `index` (the last `async function` or `function` header before it). */
const enclosingFunction = (text: string, index: number): string => {
  const headers = [...text.slice(0, index).matchAll(/\n\s*(?:async )?function (\w+)/g)];
  return headers.at(-1)?.[1] ?? "";
};

describe("no path writes answer records outside the desk queue", () => {
  test("recordAnswer is called only from the queued deskPanelOpNow, and deskPanelOp runs it through panelCommand", () => {
    for (const [path, text] of sources) {
      if (path === "capabilities/panel-answers.ts") continue;
      if (text.includes("recordAnswer(")) expect(path).toBe("app.ts");
    }
    const calls = [...app.matchAll(/await recordAnswer\(/g)].map((m) => m.index!);
    expect(calls.length).toBe(1);
    expect(enclosingFunction(app, calls[0]!)).toBe("deskPanelOpNow");
    expect(app).toContain("return panelCommand(() => deskPanelOpNow(request));");
  });

  test("the answer-record migrations run only through the desk's migration runner, with the queue passed in", () => {
    for (const [path, text] of sources) {
      if (path === "capabilities/panel-answers.ts" || path === "capabilities/desk-migrations.ts") continue;
      expect(/\bmigrate(AnswerStates|PreUpgradeAnswers)\(/.test(text)).toBe(false);
    }
    expect(sources.get("capabilities/desk-migrations.ts")).toContain("await queue(");
    expect(app).toMatch(/runDeskMigrations\(runtime\.runtime\.store, caller\.tenant, clock\(\), panelCommand, /);
  });

  test("rememberAgreed, the unqueued agreement writer, is gone from production code", () => {
    for (const text of sources.values()) expect(text.includes("rememberAgreed")).toBe(false);
  });
});

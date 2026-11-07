/**
 * Test support: a fake `gh` executable. `installFakeGh(dir)` writes `<dir>/bin/gh` (put `<dir>/bin` first on PATH)
 * and `<dir>/state.json`. Every call is recorded in the state's `calls`; `failOn` makes any call whose arguments
 * contain one of its substrings exit 1. The tests never reach real GitHub.
 */
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface FakeGhState {
  calls: string[][];
  failOn: string[];
  scopes: string[];
  issues: { id: string; number: number; title: string }[];
  projects: { id: string; number: number; title: string }[];
  /** Issue creation numbers continue from here. */
  nextNumber: number;
}

export interface FakeGh {
  readonly bin: string;
  readonly statePath: string;
  /** PATH and FAKE_GH_STATE to merge into an environment. */
  env(base?: Record<string, string | undefined>): Record<string, string>;
  state(): FakeGhState;
  update(change: (state: FakeGhState) => void): void;
  calls(): string[][];
}

export function installFakeGh(dir: string, seed: Partial<FakeGhState> = {}): FakeGh {
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  const statePath = join(dir, "gh-state.json");
  const initial: FakeGhState = { calls: [], failOn: [], scopes: ["repo", "project"], issues: [], projects: [], nextNumber: 1, ...seed };
  writeFileSync(statePath, JSON.stringify(initial));
  const script = join(bin, "gh");
  writeFileSync(script, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(import.meta.path)} "$@"\n`);
  chmodSync(script, 0o755);
  const read = () => JSON.parse(readFileSync(statePath, "utf8")) as FakeGhState;
  return {
    bin,
    statePath,
    env: (base = process.env) => ({ ...(base as Record<string, string>), PATH: `${bin}:${base.PATH ?? ""}`, FAKE_GH_STATE: statePath }),
    state: read,
    update(change) {
      const state = read();
      change(state);
      writeFileSync(statePath, JSON.stringify(state));
    },
    calls: () => read().calls,
  };
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

function fakeMain(args: string[]): number {
  const statePath = process.env.FAKE_GH_STATE;
  if (!statePath) {
    console.error("fake gh: FAKE_GH_STATE is not set");
    return 3;
  }
  const state = JSON.parse(readFileSync(statePath, "utf8")) as FakeGhState;
  state.calls.push(args);
  const save = () => writeFileSync(statePath, JSON.stringify(state));
  const joined = args.join(" ");
  if (state.failOn.some((needle) => joined.includes(needle))) {
    save();
    console.error(`fake gh: failing on demand: ${joined}`);
    return 1;
  }
  const [a, b] = args;
  let out = "";
  if (a === "auth" && b === "status") {
    out = `github.com\n  - Token scopes: ${state.scopes.map((s) => `'${s}'`).join(", ")}\n`;
  } else if (a === "repo" && b === "view") {
    out = JSON.stringify({ name: "horizon-sandbox" });
  } else if (a === "project" && b === "list") {
    out = JSON.stringify({ projects: state.projects, totalCount: state.projects.length });
  } else if (a === "project" && b === "create") {
    const number = state.projects.length + 1;
    const project = { id: `PVT_${number}`, number, title: flag(args, "--title") ?? "" };
    state.projects.push(project);
    out = JSON.stringify(project);
  } else if (a === "project" && b === "item-list") {
    out = JSON.stringify({ items: [] });
  } else if (a === "issue" && b === "list") {
    out = JSON.stringify(state.issues);
  } else if (a === "issue" && b === "create") {
    const number = state.nextNumber++;
    state.issues.push({ id: `I_${number}`, number, title: flag(args, "--title") ?? "" });
    out = `https://github.com/${flag(args, "-R")}/issues/${number}\n`;
  } else if (a === "api" && args.includes("graphql")) {
    const query = flag(args, "-f") ?? "";
    const issue = /issueId: "([^"]+)"/.exec(query)?.[1];
    const project = /projectId: "([^"]+)"/.exec(query)?.[1];
    if (issue) state.issues = state.issues.filter((i) => i.id !== issue);
    if (project) state.projects = state.projects.filter((p) => p.id !== project);
    out = "{}";
  } else if (a === "api" && /\/issues\/\d+$/.test(args[1] ?? "")) {
    out = `${9000 + Number(args[1]!.split("/").pop())}\n`;
  } else if (a === "api" && args.some((x) => x.endsWith("/sub_issues"))) {
    out = "{}";
  } else {
    save();
    console.error(`fake gh: unsupported call: ${joined}`);
    return 2;
  }
  save();
  process.stdout.write(out);
  return 0;
}

if (import.meta.main) process.exit(fakeMain(process.argv.slice(2)));

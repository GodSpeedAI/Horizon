import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, test } from "bun:test";
import { run as runClear } from "../scripts/setup-clear.ts";
import { run as runCheckEmpty } from "../scripts/setup-check-empty.ts";
import { fakeCaseKeeper, type FakeReply } from "./support/fake-case-keeper.ts";
import { run as runEnv } from "../scripts/setup-env.ts";
import { run as runGithub } from "../scripts/setup-github.ts";
import { run as runHealth } from "../scripts/setup-health.ts";
import { run as runInit } from "../scripts/setup-init.ts";
import { setupMapping } from "../src/config/setup.ts";
import { installFakeGh, type FakeGh } from "./support/fake-gh.ts";

type Env = Record<string, string | undefined>;

/** Everything below runs against a fresh temporary base; the real ~/.horizon is never named. */
let tmp: string;
let env: Env;
let gh: FakeGh;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "horizon-setup-scripts-"));
  gh = installFakeGh(join(tmp, "fake"));
  const rtBin = join(tmp, "fake", "bin", "realitytrace");
  writeFileSync(
    rtBin,
    '#!/bin/sh\nif [ -n "$XDG_DATA_HOME" ] && [ -e "$XDG_DATA_HOME/has-repo" ]; then echo \'{"repos":[{"id":"r"}]}\'; else echo \'{"repos":[]}\'; fi\n',
  );
  chmodSync(rtBin, 0o755);
  env = { ...gh.env(process.env), HORIZON_SETUPS_BASE: join(tmp, "setups"), REALITYTRACE_BIN: rtBin };
  delete env.HORIZON_SETUP;
});

function capture<T extends (a: string[], e: Env, o: (l: string) => void, r: (l: string) => void) => number | Promise<number>>(fn: T, args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = fn(args, env, (l) => out.push(l), (l) => err.push(l));
  return Promise.resolve(code).then((c) => ({ code: c, out: out.join("\n"), err: err.join("\n") }));
}

function treeHash(root: string): string {
  const hash = createHash("sha256");
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      const stat = lstatSync(full);
      hash.update(`${full}:${stat.mode}:${stat.size}\n`);
      if (stat.isDirectory()) walk(full);
      else if (stat.isFile()) hash.update(readFileSync(full));
    }
  };
  walk(root);
  return hash.digest("hex");
}

const testing = () => setupMapping("testing", env);
const production = () => setupMapping("production", env);

describe("setup-init", () => {
  test("setup-init creates marker, directories and a 32-byte presenting key once", async () => {
    const first = await capture(runInit, ["--setup", "testing"]);
    expect(first.code).toBe(0);
    const m = testing();
    const marker = JSON.parse(readFileSync(m.marker, "utf8"));
    expect(marker).toMatchObject({ name: "testing", root: m.root });
    expect(typeof marker.createdAt).toBe("string");
    for (const dir of [m.cell, m.workbench, m.secrets, m.exports, m.run]) expect(statSync(dir).isDirectory()).toBe(true);
    const key = readFileSync(m.presentingKey);
    expect(key.length).toBe(32);
    expect(statSync(m.presentingKey).mode & 0o777).toBe(0o600);
    const toml = readFileSync(m.config, "utf8");
    expect(toml).toContain("port = 4339");
    expect(toml).toContain("[[records.sources]]");
    expect(toml).toContain("[workshop]");
    expect(toml).toContain("[ui]");

    await capture(runInit, ["--setup", "testing"]);
    expect(readFileSync(m.presentingKey).equals(key)).toBe(true);
    expect(JSON.parse(readFileSync(m.marker, "utf8")).createdAt).toBe(marker.createdAt);
  });

  test("setup-env prints shell-quoted KEY=VALUE lines", async () => {
    const result = await capture(runEnv, ["testing", "--service", "workbench"]);
    expect(result.code).toBe(0);
    expect(result.out).toContain(`COGNATE_WORKBENCH_HOME='${testing().workbench}'`);
    expect((await capture(runEnv, ["staging"])).code).toBe(2);
  });
});

describe("setup-clear", () => {
  async function seededTesting() {
    await capture(runInit, ["--setup", "testing"]);
    gh.update((s) => {
      s.issues.push({ id: "I_1", number: 1, title: "one" }, { id: "I_2", number: 2, title: "two" });
      s.projects.push({ id: "PVT_1", number: 1, title: "Horizon testing" }, { id: "PVT_9", number: 9, title: "someone else" });
    });
  }

  test("setup-clear lists everything and deletes nothing without --yes", async () => {
    await seededTesting();
    const result = await capture(runClear, ["--setup", "testing"]);
    expect(result.code).toBe(0);
    expect(result.out).toContain(testing().marker);
    expect(result.out).toContain("#1 one");
    expect(result.out).toContain('Board "Horizon testing": 1');
    expect(result.out).toContain("Nothing deleted");
    expect(existsSync(testing().root)).toBe(true);
    expect(gh.state().issues.length).toBe(2);
    expect(gh.calls().some((c) => c.includes("graphql"))).toBe(false);
  });

  test("setup-clear --yes deletes the folder, sandbox issues and the board, never a repository", async () => {
    await seededTesting();
    const result = await capture(runClear, ["--setup", "testing", "--yes"]);
    expect(result.code).toBe(0);
    expect(existsSync(testing().root)).toBe(false);
    expect(gh.state().issues).toEqual([]);
    expect(gh.state().projects.map((p) => p.title)).toEqual(["someone else"]);
    const calls = gh.calls().map((c) => c.join(" "));
    expect(calls.some((c) => /repo delete|delete_repo|deleteRepository/.test(c))).toBe(false);
    expect(calls.every((c) => !c.startsWith("repo ") || c.startsWith("repo view"))).toBe(true);
  });

  test("setup-clear refuses production", async () => {
    await capture(runInit, ["--setup", "production"]);
    const result = await capture(runClear, ["--setup", "production", "--yes"]);
    expect(result.code).toBe(1);
    expect(result.err).toContain("production");
    expect(existsSync(production().root)).toBe(true);
    expect(gh.calls()).toEqual([]);
  });

  test("setup-clear refuses a missing marker", async () => {
    await capture(runInit, ["--setup", "testing"]);
    rmSync(testing().marker);
    const result = await capture(runClear, ["--setup", "testing", "--yes"]);
    expect(result.code).toBe(1);
    expect(result.err).toContain("SETUP.json");
    expect(existsSync(testing().root)).toBe(true);
    expect(gh.calls()).toEqual([]);
  });

  test("setup-clear removes a link that points outside the root, never what it points at", async () => {
    await capture(runInit, ["--setup", "testing"]);
    const outside = join(tmp, "outside");
    mkdirSync(outside);
    writeFileSync(join(outside, "keep.txt"), "keep");
    symlinkSync(outside, join(testing().exports, "escape"));
    symlinkSync(join(outside, "keep.txt"), join(testing().exports, "file-link"));
    symlinkSync(join(tmp, "gone"), join(testing().exports, "broken-link"));
    const listed = await capture(runClear, ["--setup", "testing"]);
    expect(listed.out).toContain("escape (link; only the link is removed)");
    expect(existsSync(testing().root)).toBe(true);
    const result = await capture(runClear, ["--setup", "testing", "--yes"]);
    expect(result.code).toBe(0);
    expect(existsSync(testing().root)).toBe(false);
    expect(readdirSync(outside)).toEqual(["keep.txt"]);
    expect(readFileSync(join(outside, "keep.txt"), "utf8")).toBe("keep");
  });

  test("setup-clear refuses a root that is itself a symlink out of the setups folder", async () => {
    const elsewhere = join(tmp, "elsewhere");
    mkdirSync(elsewhere);
    mkdirSync(join(tmp, "setups"), { recursive: true });
    symlinkSync(elsewhere, testing().root);
    writeFileSync(join(elsewhere, "SETUP.json"), JSON.stringify({ name: "testing", root: testing().root, createdAt: "x" }));
    const result = await capture(runClear, ["--setup", "testing", "--yes"]);
    expect(result.code).toBe(1);
    expect(existsSync(join(elsewhere, "SETUP.json"))).toBe(true);
  });

  test("setup-clear leaves production paths byte-identical", async () => {
    await capture(runInit, ["--setup", "production"]);
    await seededTesting();
    const personal = join(tmp, "personal-record");
    mkdirSync(personal);
    writeFileSync(join(personal, "ledger"), "untouched");
    const before = treeHash(production().root);
    await capture(runClear, ["--setup", "production", "--yes"]);
    await capture(runClear, ["--setup", "testing"]);
    await capture(runClear, ["--setup", "testing", "--yes"]);
    expect(treeHash(production().root)).toBe(before);
    expect(readFileSync(join(personal, "ledger"), "utf8")).toBe("untouched");
  });
});

describe("setup-github", () => {
  test("creates the board and issues, links sub-issues and writes github.json", async () => {
    await capture(runInit, ["--setup", "testing"]);
    const first = await capture(runGithub, ["--setup", "testing"]);
    expect(first.code).toBe(0);
    const doc = JSON.parse(readFileSync(join(testing().root, "github.json"), "utf8"));
    expect(doc).toEqual({ repo: "GodSpeedAI/horizon-sandbox", projectNumber: 1, subIssues: true });
    await capture(runGithub, ["--setup", "testing"]);
    expect(gh.state().issues.length).toBe(2);
    expect(gh.state().projects.length).toBe(1);
    const touched = gh.calls().flatMap((c) => c.filter((x) => x.includes("horizon-sandbox")));
    expect(touched.length).toBeGreaterThan(0);
    expect(touched.every((x) => x.includes("GodSpeedAI/horizon-sandbox"))).toBe(true);
  });

  test("refuses without the project scope and records subIssues false when linking fails", async () => {
    await capture(runInit, ["--setup", "testing"]);
    gh.update((s) => (s.scopes = ["repo"]));
    expect((await capture(runGithub, ["--setup", "testing"])).code).toBe(1);
    gh.update((s) => ((s.scopes = ["repo", "project"]), (s.failOn = ["sub_issues"])));
    expect((await capture(runGithub, ["--setup", "testing"])).code).toBe(0);
    expect(JSON.parse(readFileSync(join(testing().root, "github.json"), "utf8")).subIssues).toBe(false);
  });
});

describe("setup-check-empty", () => {
  function store(collection: string): void {
    const db = new Database(join(production().cell, "app.sqlite"));
    db.run("CREATE TABLE IF NOT EXISTS records (collection TEXT NOT NULL, id TEXT NOT NULL, version INTEGER NOT NULL, value TEXT NOT NULL, PRIMARY KEY (collection, id))");
    db.run("INSERT INTO records VALUES (?, 'x', 1, '{}')", [collection]);
    db.close();
  }

  test("setup-check-empty passes on a fresh production and fails when a note, case, label or record exists", async () => {
    await capture(runInit, ["--setup", "production"]);
    const fresh = await capture(runCheckEmpty, ["--setup", "production", "--exclude", "personal"]);
    expect(fresh.code).toBe(0);
    expect(fresh.out).not.toContain("FAIL");

    for (const collection of ["horizon-notes", "horizon-cases", "horizon-labels"]) {
      store(collection);
      const result = await capture(runCheckEmpty, ["--setup", "production", "--exclude", "personal"]);
      expect(result.code).toBe(1);
      expect(result.out).toContain(`FAIL ${collection}: 1`);
      const db = new Database(join(production().cell, "app.sqlite"));
      db.run("DELETE FROM records");
      db.close();
    }

    writeFileSync(production().socket, "");
    expect((await capture(runCheckEmpty, ["--setup", "production", "--exclude", "personal"])).code).toBe(1);
    rmSync(production().socket);

    mkdirSync(production().horizonRecordData, { recursive: true });
    writeFileSync(join(production().horizonRecordData, "has-repo"), "");
    const record = await capture(runCheckEmpty, ["--setup", "production", "--exclude", "personal"]);
    expect(record.code).toBe(1);
    expect(record.out).toContain("record repositories in horizon");
  });

  test("a live case keeper is asked (case_list): an empty one passes, one with a case fails, one that cannot answer fails safe", async () => {
    await capture(runInit, ["--setup", "production"]);
    let reply: FakeReply = { json: { cases: [], unreadable: [] } };
    const keeper = fakeCaseKeeper(() => reply, production().socket);
    try {
      const empty = await capture(runCheckEmpty, ["--setup", "production", "--exclude", "personal"]);
      expect(empty.code).toBe(0);
      expect(empty.out).toContain("ok   SEA-Forge cases: 0");
      expect(keeper.received[0]).toMatchObject({ verb: "case_list" });
      reply = { json: { cases: [{ case_id: "case_1", case_state: "active", summary: "x", created_at: "t" }], unreadable: [] } };
      const one = await capture(runCheckEmpty, ["--setup", "production", "--exclude", "personal"]);
      expect(one.code).toBe(1);
      expect(one.out).toContain("FAIL SEA-Forge cases: 1");
      reply = { json: { cases: [], unreadable: ["case_bad"] } };
      expect((await capture(runCheckEmpty, ["--setup", "production", "--exclude", "personal"])).out).toContain("FAIL SEA-Forge cases: 1");
      reply = { raw: "garbage\n" };
      const garbled = await capture(runCheckEmpty, ["--setup", "production", "--exclude", "personal"]);
      expect(garbled.code).toBe(1);
      expect(garbled.out).toContain("not answered");
    } finally {
      keeper.stop();
    }
  });

  test("the personal record is skipped only when excluded by name", async () => {
    await capture(runInit, ["--setup", "production"]);
    expect((await capture(runCheckEmpty, ["--setup", "production", "--exclude", "personal"])).out).not.toContain("in personal");
    expect((await capture(runCheckEmpty, ["--setup", "production"])).out).toContain("in personal");
    expect((await capture(runCheckEmpty, ["--setup", "production", "--exclude", "workshop"])).code).toBe(2);
  });
});

describe("setup-health", () => {
  test("--only records passes when every source answers and fails when one does not", async () => {
    await capture(runInit, ["--setup", "testing"]);
    const ok = await capture(runHealth, ["--setup", "testing", "--only", "records"]);
    expect(ok.code).toBe(0);
    expect(ok.out).toContain("personal, workshop, horizon");
    env.REALITYTRACE_BIN = join(tmp, "missing-realitytrace");
    const bad = await capture(runHealth, ["--setup", "testing", "--only", "records"]);
    expect(bad.code).toBe(1);
    expect((await capture(runHealth, ["--setup", "testing", "--only", "nonsuch"])).code).toBe(2);
  });

  test("--only seaforge needs the socket to answer case_list", async () => {
    await capture(runInit, ["--setup", "testing"]);
    const socket = testing().socket;
    const none = await capture(runHealth, ["--setup", "testing", "--only", "seaforge"]);
    expect(none.code).toBe(1);
    expect(none.out).toContain("did not answer case_list");
    const keeper = fakeCaseKeeper((request) => (request.verb === "case_list" ? { json: { cases: [{ case_id: "c1", case_state: "active" }] } } : { json: { error: "no" } }), socket);
    try {
      const ok = await capture(runHealth, ["--setup", "testing", "--only", "seaforge"]);
      expect(ok.code).toBe(0);
      expect(ok.out).toContain("1 case");
      expect(keeper.received.map((r) => r.verb)).toContain("case_list");
    } finally {
      keeper.stop();
    }
    const odd = fakeCaseKeeper(() => ({ json: { ok: true } }), socket);
    try {
      expect((await capture(runHealth, ["--setup", "testing", "--only", "seaforge"])).code).toBe(1);
    } finally {
      odd.stop();
    }
  });

  test("--only connector needs a heartbeat file touched in the last 30 s", async () => {
    await capture(runInit, ["--setup", "testing"]);
    const beat = join(setupMapping("testing", env).run, "connector.heartbeat");
    const none = await capture(runHealth, ["--setup", "testing", "--only", "connector"]);
    expect(none.code).toBe(1);
    expect(none.out).toContain("does not exist");
    mkdirSync(join(beat, ".."), { recursive: true });
    writeFileSync(beat, "{}");
    expect((await capture(runHealth, ["--setup", "testing", "--only", "connector"])).code).toBe(0);
    const old = new Date(Date.now() - 60_000);
    utimesSync(beat, old, old);
    const stale = await capture(runHealth, ["--setup", "testing", "--only", "connector"]);
    expect(stale.code).toBe(1);
    expect(stale.out).toContain("limit 30 s");
  });
});

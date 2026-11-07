import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApplication, type HorizonApplication } from "../src/app.ts";
import type { RecordReader } from "../src/adapters/realitytrace-economics.ts";
import { applyStandIns, standIn, standInMap } from "../src/ui/workspace/presenting.ts";
import { horizonDocument, writeConfig } from "./support/config.ts";
import { observation, questionDeclared } from "./support/economics-fixture.ts";

const KEY = Buffer.from("k".repeat(32));
const SECRET_NAME = "SecretClientApp";
const REPO_PATH = `/home/someone/projects/${SECRET_NAME}`;

describe("stand-ins", () => {
  test("stand-in is Project plus 4 base32 chars of the HMAC", () => {
    expect(standIn(KEY, "Alpha")).toMatch(/^Project [A-Z2-7]{4}$/);
  });
  test("stand-in is stable", () => {
    expect(standIn(KEY, "Alpha")).toBe(standIn(KEY, "Alpha"));
    expect(standIn(KEY, "Alpha")).not.toBe(standIn(KEY, "Beta"));
  });
  test("another key gives another stand-in", () => {
    const other = Buffer.from("z".repeat(32));
    const names = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"];
    expect(names.some((n) => standIn(KEY, n) !== standIn(other, n))).toBe(true);
  });
  test("colliding stand-ins extend", () => {
    // Find two names whose 4-character stand-ins collide (a 20-bit space: found within a few thousand tries).
    const seen = new Map<string, string>();
    let pair: [string, string] | null = null;
    for (let i = 0; i < 20000 && pair === null; i += 1) {
      const label = standIn(KEY, `n${i}`);
      const prior = seen.get(label);
      if (prior !== undefined) pair = [prior, `n${i}`];
      else seen.set(label, `n${i}`);
    }
    expect(pair).not.toBeNull();
    const map = standInMap(KEY, pair!);
    const [a, b] = [map.get(pair![0])!, map.get(pair![1])!];
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan("Project XXXX".length);
    expect(b.length).toBeGreaterThan("Project XXXX".length);
    expect(a.startsWith(standIn(KEY, pair![0], 4))).toBe(true);
    expect(JSON.stringify(applyStandIns({ x: `${pair![0]} and ${pair![1]}` }, KEY, pair!))).not.toContain(pair![0]);
  });
});

const rows = [
  questionDeclared(1, "journey:J01:desired_state:1"),
  observation(2, { name: "p1", sid: "sess-A", kind: "journey_check", exit_code: 1, payload_ref: "journey:journey:J01:desired_state:1", ts: "2026-10-30T15:00:00Z" }),
  observation(3, { name: "p2", sid: "sess-A", kind: "tool_post", exit_code: 0, ts: "2026-10-30T15:01:00Z" }),
];
const fakeReader: RecordReader = {
  repos: () => ({ ok: true, repos: [{ repo_id: "R1", path: REPO_PATH }] }),
  ledger: () => ({ ok: true, rows }),
  verify: () => ({ ok: true, intact: true, records: 3, divergence: null }),
};

describe("presenting on the comparison page and exports", () => {
  let application: HorizonApplication;
  let server: ReturnType<HorizonApplication["startServer"]>;
  let base: string;
  let deskRoot: string;
  const COMPARE = "/workspace/compare?source=personal&repo=R1&day=2026-10-30&session=sess-A";

  beforeAll(async () => {
    const root = mkdtempSync(join(tmpdir(), "presenting-"));
    deskRoot = join(root, "desk");
    const document = {
      ...horizonDocument({ storePath: join(root, "p.sqlite"), secretPath: join(root, "launch.secret") }),
      records: { sources: [{ name: "personal", kind: "personal" }] },
      ui: { timezone: "UTC" },
    };
    const configPath = await writeConfig(join(root, "horizon.toml"), document);
    application = await createApplication({ configPath, recordReader: () => fakeReader, deskRoot, now: () => new Date("2026-10-30T20:00:00Z") });
    server = application.startServer(0);
    base = `http://${server.hostname}:${server.port}`;
  });
  afterAll(async () => {
    await server?.stop(true);
    await application?.close();
  });

  const post = (path: string, fields: Record<string, string>) =>
    fetch(`${base}${path}`, { method: "POST", redirect: "manual", body: new URLSearchParams(fields), headers: { "content-type": "application/x-www-form-urlencoded" } });
  const presenting = (on: boolean) => post("/workspace/presenting", { on: on ? "1" : "0", return: "" });

  test("compare page text has no real project or repository name", async () => {
    await presenting(false);
    const plain = await (await fetch(`${base}${COMPARE}`)).text();
    expect(plain).toContain(SECRET_NAME);
    expect(plain).toContain("What the agent reports");
    await presenting(true);
    const hidden = await (await fetch(`${base}${COMPARE}`)).text();
    expect(hidden).not.toContain(SECRET_NAME);
    expect(hidden).not.toContain("/home/someone");
    expect(hidden).toMatch(/Project [A-Z2-7]{4}/);
    expect(hidden).toContain('data-presenting="on"');
  });

  test("export with Presenting on uses stand-ins", async () => {
    await post("/workspace/label", { session: "sess-A", event: "x1", verdict: "fail", first_failure: `${SECRET_NAME} did not build`, return: "" });
    await presenting(true);
    const res = await fetch(`${base}/workspace/export?kind=labels`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(SECRET_NAME);
    expect(text).toMatch(/Project [A-Z2-7]{4}/);
    const cmp = await (await fetch(`${base}/workspace/export?kind=comparison&source=personal&repo=R1&day=2026-10-30&session=sess-A&standins=0`)).text();
    expect(cmp).not.toContain(SECRET_NAME);
    const files = readdirSync(join(deskRoot, "exports"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(readFileSync(join(deskRoot, "exports", file), "utf8")).not.toContain(SECRET_NAME);
  });

  test("export with Presenting off needs an explicit choice and defaults to stand-ins", async () => {
    await presenting(false);
    expect((await fetch(`${base}/workspace/export?kind=labels`)).status).toBe(400);
    const one = await (await fetch(`${base}/workspace/export?kind=labels&standins=1`)).text();
    expect(one).not.toContain(SECRET_NAME);
    const zero = await (await fetch(`${base}/workspace/export?kind=labels&standins=0`)).text();
    expect(zero).toContain(SECRET_NAME);
    // The page offers standins=1 as the default link.
    const page = await (await fetch(`${base}${COMPARE}`)).text();
    expect(page).toContain("kind=labels&amp;standins=1");
  });
});

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApplication, type HorizonApplication } from "../src/app.ts";
import type { RecordReader } from "../src/adapters/realitytrace-economics.ts";
import { applyStandIns, standIn, standInMap } from "../src/ui/workspace/presenting.ts";
import { buildExport, chooseStandIns } from "../src/exports/export.ts";
import type { RunLabel } from "../src/capabilities/labels.ts";
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
  /** An export is a POST of a form (the person's button), so the test sends the fields the same way. */
  const exportOf = (query: string) => fetch(`${base}/workspace/export`, { method: "POST", body: new URLSearchParams(query) });
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

  test("an export is refused at this freeze, and no file is written", async () => {
    await post("/workspace/label", { session: "sess-A", event: "x1", verdict: "fail", first_failure: `${SECRET_NAME} did not build`, return: "" });
    await presenting(true);
    const res = await exportOf("kind=labels");
    // Writing a labelled copy of the record is a P3 effect: the row has no pending record, no
    // protected confirmation, no authority decision and no separation-of-duty check at this
    // freeze, so the refusal comes before anything is built and before any file is written (R5-01).
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code?: string }).code).toBe("refused");
    expect(existsSync(join(deskRoot, "exports"))).toBe(false);
  });

  test("the export body hides project names while Presenting is on, and keeps them when it is off", () => {
    // The export body itself, built by the same function the refused route would call.
    const labels: RunLabel[] = [
      { tenant: "local", session_id: "sess-A", event_id: "x1", record_seq: null, verdict: "fail", first_failure: `${SECRET_NAME} did not build`, operator: "operator", created_at: "2026-10-30T15:00:00Z" },
    ];
    const base = { kind: "labels" as const, labels, comparison: null, key: KEY, names: [SECRET_NAME], now: new Date("2026-10-30T20:00:00Z") };
    const shown = buildExport({ ...base, standins: true });
    expect(shown.body).not.toContain(SECRET_NAME);
    expect(shown.body).toMatch(/Project [A-Z2-7]{4}/);
    expect(shown.name).toContain("-standins");
    const plain = buildExport({ ...base, standins: false });
    expect(plain.body).toContain(SECRET_NAME);
    expect(plain.name).not.toContain("-standins");
  });

  test("with Presenting off an export needs an explicit choice, and the page offers stand-ins", async () => {
    // The choice rule the refused route applies before it builds anything: Presenting on always
    // stands in; off needs the person to say which, and the form offers 1 (hide the names).
    expect(chooseStandIns(true, null)).toEqual({ ok: true, standins: true });
    expect(chooseStandIns(true, "0")).toEqual({ ok: true, standins: true });
    expect(chooseStandIns(false, null)).toMatchObject({ ok: false, status: 400 });
    expect(chooseStandIns(false, "1")).toEqual({ ok: true, standins: true });
    expect(chooseStandIns(false, "0")).toEqual({ ok: true, standins: false });
    await presenting(false);
    expect((await exportOf("kind=labels")).status).toBe(403);
    // The page offers the export as a POST form with standins=1 as the default, and no GET link to the export.
    const page = await (await fetch(`${base}${COMPARE}`)).text();
    expect(page).toContain('action="/workspace/export"');
    expect(page).toContain('name="standins" value="1"');
    expect(page).not.toContain('href="/workspace/export');
  });
});

import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SnapshotRefusal, takeSnapshot } from "../src/settlement/snapshot.ts";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function setup() {
  const root = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "hz-snap-"));
  dirs.push(root);
  const live = join(root, "live", "app.sqlite");
  mkdirSync(join(root, "live"));
  const db = new Database(live);
  db.run("PRAGMA journal_mode = WAL");
  db.run("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
  db.run("INSERT INTO t (v) VALUES ('a')");
  return { root, live, db, snap: join(root, "snap") };
}

describe("takeSnapshot", () => {
  test("a WAL source yields a standalone readable rollback-journal copy", () => {
    const { live, db, snap } = setup();
    const out = takeSnapshot(live, snap);
    const copy = new Database(out, { readonly: true });
    expect(copy.query("PRAGMA journal_mode").get()).toEqual({ journal_mode: "delete" });
    expect(copy.query("SELECT v FROM t").all()).toEqual([{ v: "a" }]);
    copy.close();
    expect(readdirSync(snap)).toEqual(["app.sqlite"]);
    db.close();
  });

  test("taken while another connection holds a write transaction, it shows only committed state", () => {
    const { live, db, snap } = setup();
    db.run("BEGIN");
    db.run("INSERT INTO t (v) VALUES ('uncommitted')");
    const out = takeSnapshot(live, snap);
    db.run("COMMIT");
    const copy = new Database(out, { readonly: true });
    expect(copy.query("SELECT v FROM t").all()).toEqual([{ v: "a" }]);
    copy.close();
    db.close();
  });

  test("replacing is atomic: the target stays readable and no temp file remains", () => {
    const { live, db, snap } = setup();
    const out = takeSnapshot(live, snap);
    const held = new Database(out, { readonly: true });
    db.run("INSERT INTO t (v) VALUES ('b')");
    takeSnapshot(live, snap);
    expect(held.query("SELECT count(*) AS n FROM t").get()).toEqual({ n: 1 });
    const fresh = new Database(out, { readonly: true });
    expect(fresh.query("SELECT count(*) AS n FROM t").get()).toEqual({ n: 2 });
    held.close(); fresh.close(); db.close();
    expect(readdirSync(snap)).toEqual(["app.sqlite"]);
  });

  test("a missing live store refuses and leaves no snapshot", () => {
    const { root, snap } = setup();
    expect(() => takeSnapshot(join(root, "live", "absent.sqlite"), snap)).toThrow(SnapshotRefusal);
    expect(existsSync(join(snap, "app.sqlite"))).toBe(false);
  });

  test("a snapshot directory equal to the live store's directory refuses", () => {
    const { root, live } = setup();
    expect(() => takeSnapshot(live, join(root, "live"))).toThrow(/live store's directory/);
  });
});

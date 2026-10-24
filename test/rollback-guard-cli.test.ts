// SPEC-CR-002 "Rollback" operator witness: the rollback guard script's process exit codes (0 allowed, 2 refused,
// 1 usage or missing store) are proven by spawning the real script, not only by calling rollbackVerdict.
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import type { DurableStore, Json } from "@godspeedai/cognate-events";
import { openSqliteStore } from "@godspeedai/cognate-store-sqlite";
import { markStore } from "../src/capabilities/capacity-ledger.ts";

const ROOT = join(import.meta.dir, "..");
const SCRIPT = "scripts/rollback-guard.ts";
const NOW = new Date("2026-10-23T12:00:00.000Z");
const INTENT = { intent_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", frame_id: "frame-1", frame_revision: 1, actor_ref: "observer:operator", operation_ref: "horizon.write" };
const storePath = () => join(mkdtempSync(join(tmpdir(), "horizon-guard-cli-")), "store.sqlite");

let sequence = 0;
/** A commit run as Cognate records it: a `run.started` event naming the agent and input, plus the runs record. */
async function startRun(store: DurableStore, input: Json): Promise<void> {
  const runId = `run-test-${++sequence}`;
  await store.commit({
    appends: [{
      streamId: `run-${runId}`,
      expectedVersion: 0,
      events: [{
        eventId: crypto.randomUUID(),
        eventType: "run.started",
        schemaVersion: 1,
        occurredAt: NOW.toISOString(),
        tenant: "local",
        correlationId: runId,
        causationId: null,
        runId,
        scopeId: "s",
        componentId: "cognate",
        payload: { input },
        metadata: { agent: "horizon.navigation.commit" },
      }],
    }],
    records: [{ collection: "runs", id: runId, expectedVersion: 0, value: { tenant: "local" } }],
  });
}

const runGuard = (args: readonly string[]) => spawnSync("bun", ["run", SCRIPT, ...args], { cwd: ROOT, encoding: "utf8" });

describe("rollback guard script exit codes", () => {
  test("a v1 store exits 0 and reports that 1.0.1 may open it", async () => {
    const path = storePath();
    const store = openSqliteStore({ path });
    await startRun(store, { intent: INTENT });
    await store.close();
    const result = runGuard([path]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("1.0.1 may open it");
  });

  test("a marked store exits 2 and names the marker, the refusal, and the rollback procedure", async () => {
    const path = storePath();
    const store = openSqliteStore({ path });
    await markStore(store);
    await store.close();
    const result = runGuard([path]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("refusing to start 1.0.1");
    expect(result.stderr).toContain("the store is marked horizon.contract_version = 2");
    expect(result.stderr).toContain("SPEC-CR-002 Rollback");
  });

  test("a store holding only a v2 pending commit run input (no marker) exits 2 with its reason", async () => {
    const path = storePath();
    const store = openSqliteStore({ path });
    await startRun(store, { intent: INTENT, contract_version: 2 });
    await store.close();
    const result = runGuard([path]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("1 pending commit run input(s) carry contract_version 2 or later");
  });

  test("a nonexistent store path exits 1 without creating the file; no argument exits 1", () => {
    const path = storePath();
    const missing = runGuard([path]);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("usage:");
    expect(existsSync(path)).toBe(false);
    const noArgument = runGuard([]);
    expect(noArgument.status).toBe(1);
    expect(noArgument.stderr).toContain("usage:");
  });
});

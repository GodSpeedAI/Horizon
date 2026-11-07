import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectWorkshop, keyState } from "../src/adapters/workshop.ts";
import { buildExport } from "../src/exports/export.ts";
import { putLabel, listLabels } from "../src/capabilities/labels.ts";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import { compareSession } from "../src/ui/workspace/compare-model.ts";
import { sampleLedger } from "./support/economics-fixture.ts";

const TOKEN = "wbs1.THIS-IS-A-TEST-SECRET-TOKEN-0123456789";

describe("workshop key secrecy", () => {
  const logs: string[] = [];
  const originals = { log: console.log, error: console.error, warn: console.warn };
  afterEach(() => Object.assign(console, originals));

  test("workshop key never appears in logs, records or exports", async () => {
    console.log = (...a: unknown[]) => void logs.push(a.join(" "));
    console.error = (...a: unknown[]) => void logs.push(a.join(" "));
    console.warn = (...a: unknown[]) => void logs.push(a.join(" "));
    const dir = mkdtempSync(join(tmpdir(), "wkey-"));
    const keyPath = join(dir, "workbench.key");
    writeFileSync(keyPath, `${TOKEN}\n`, { mode: 0o600 });
    writeFileSync(`${keyPath}.json`, JSON.stringify({ sessionId: "s", expiresAt: "2099-01-01T00:00:00Z" }));
    const seen: string[] = [];
    const stub = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (req) => (seen.push(req.headers.get("authorization") ?? ""), new Response("unauthenticated", { status: 401 })) });
    const config = { url: `http://127.0.0.1:${stub.port}`, key_path: keyPath };

    // State and connection never expose the token.
    const state = keyState(config, new Date("2026-11-06T00:00:00Z"));
    expect(state.state).toBe("ok");
    expect(JSON.stringify(state)).not.toContain(TOKEN);
    const connection = connectWorkshop(config, { actor: { id: "operator", kind: "user" }, tenant: "t" } as never);
    expect(connection).not.toBeNull();
    expect(JSON.stringify(Object.keys(connection!))).not.toContain(TOKEN);
    // The failing call (the stub answers 401) must not echo the bearer in its error.
    const failure = await Promise.race([
      connection!.service.readProjection({ actor: { id: "operator", kind: "user" }, tenant: "t" } as never, { name: "settings" }).then(() => "ok", (e: unknown) => String(e)),
      Bun.sleep(3000).then(() => "timeout"),
    ]);
    stub.stop(true);
    expect(seen.some((h) => h === `Bearer ${TOKEN}`)).toBe(true);
    expect(String(failure)).not.toContain(TOKEN);

    // Records and exports are built without any path to the key.
    const store = createMemoryStore();
    await putLabel(store, { tenant: "t", operator: "op", session_id: "s", event_id: "e", verdict: "pass", now: new Date() });
    const labels = await listLabels(store, "t");
    const exported = buildExport({ kind: "labels", labels, comparison: null, standins: true, key: Buffer.alloc(32), names: [], now: new Date() });
    const cmp = buildExport({ kind: "comparison", labels, comparison: compareSession({ rows: sampleLedger(), sessionId: "s1", workshopUrl: "http://x", intact: null }), standins: false, key: Buffer.alloc(32), names: [], now: new Date() });
    for (const text of [JSON.stringify(labels), exported.body, cmp.body, ...logs]) expect(text).not.toContain(TOKEN);

    // The key file is the only place it lives; the companion file holds no secret.
    expect(readFileSync(`${keyPath}.json`, "utf8")).not.toContain(TOKEN);
    expect(readdirSync(dir).sort()).toEqual(["workbench.key", "workbench.key.json"]);
    expect(statSync(keyPath).mode & 0o777).toBe(0o600);
  });

  test("a missing key means no connection, and an expiring key is flagged", () => {
    const dir = mkdtempSync(join(tmpdir(), "wkey-"));
    const config = { url: "http://127.0.0.1:1", key_path: join(dir, "none.key") };
    expect(keyState(config).state).toBe("missing");
    expect(connectWorkshop(config, { actor: { id: "o", kind: "user" }, tenant: "t" } as never)).toBeNull();
    writeFileSync(config.key_path, TOKEN);
    writeFileSync(`${config.key_path}.json`, JSON.stringify({ sessionId: "s", expiresAt: "2026-11-10T00:00:00Z" }));
    expect(keyState(config, new Date("2026-11-06T00:00:00Z")).state).toBe("expiring");
    writeFileSync(`${config.key_path}.json`, JSON.stringify({ sessionId: "s", expiresAt: "2026-11-01T00:00:00Z" }));
    expect(keyState(config, new Date("2026-11-06T00:00:00Z")).state).toBe("expired");
  });
});

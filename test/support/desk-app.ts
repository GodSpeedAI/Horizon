import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApplication, type HorizonApplication } from "../../src/app.ts";
import type { RecordReader, EconomicsSource } from "../../src/adapters/realitytrace-economics.ts";
import type { ApprovalAuthority } from "../../src/adapters/sea-forge-config.ts";
import type { Access } from "../../src/adapters/workshop.ts";
import { horizonDocument, writeConfig } from "./config.ts";
import { deskScopeOf } from "../../src/capabilities/panel-records.ts";
import { refusalsFor, type RefusalAudit } from "../../src/capabilities/refusals.ts";

export interface DeskApp {
  readonly application: HorizonApplication;
  readonly base: string;
  readonly stop: () => Promise<void>;
  readonly post: (path: string, body: unknown) => Promise<Response>;
  readonly state: (query?: string) => Promise<any>;
  readonly get: (path: string) => Promise<any>;
  /** The refusals the catalog's frozen rows left behind: one audit per refused attempt, and no target effect. */
  readonly refusals: () => Promise<readonly RefusalAudit[]>;
  /** The directory this desk keeps its store, config and agent key in. Start again with `root` to restart on the same records. */
  readonly root: string;
}

/** A panel change body with a request id: the caller's own, or a fresh one. Other paths and string bodies pass unchanged. */
function withRequestId(path: string, body: unknown): unknown {
  const changes = path === "/desk/panels/op" || path === "/agent/panels";
  if (!changes || typeof body !== "object" || body === null || Array.isArray(body) || "request_id" in body) return body;
  return { ...body, request_id: crypto.randomUUID() };
}

export async function startDeskApp(options: { readonly repoPath?: string; readonly now?: () => Date; readonly approvals?: ApprovalAuthority; readonly economics?: EconomicsSource; readonly reader?: RecordReader; readonly workshop?: () => Access; readonly root?: string; /** A promise the record migration waits for (a test holds it pending). */ readonly migrationHold?: Promise<unknown>; /** Default true: the call returns once the records are migrated, so a test can change them at once. */ readonly awaitMigration?: boolean; /** Open read-only, as the CLI surface path does. */ readonly readOnly?: boolean } = {}): Promise<DeskApp> {
  const root = options.root ?? mkdtempSync(join(tmpdir(), "desk-"));
  const reader: RecordReader = options.reader ?? {
    repos: () => ({ ok: true, repos: options.repoPath ? [{ repo_id: "R1", path: options.repoPath }] : [] }),
    ledger: () => ({ ok: true, rows: [] }),
    verify: () => ({ ok: true, intact: true, records: 0, divergence: null }),
  };
  const document = { ...horizonDocument({ storePath: join(root, "d.sqlite"), secretPath: join(root, "launch.secret") }), records: { sources: [{ name: "personal", kind: "personal" }] }, ui: { timezone: "UTC" } };
  const configPath = await writeConfig(join(root, "horizon.toml"), document);
  // Secret files live in this test's temp root: never .cognate/ or ~/.horizon. Restored in stop().
  const saved = { agentKey: process.env.HORIZON_AGENT_KEY_FILE, secret: process.env.HORIZON_SECRET_FILE };
  process.env.HORIZON_AGENT_KEY_FILE = join(root, "agent.key");
  process.env.HORIZON_SECRET_FILE = join(root, "launch.secret");
  const restore = () => {
    if (saved.agentKey === undefined) delete process.env.HORIZON_AGENT_KEY_FILE;
    else process.env.HORIZON_AGENT_KEY_FILE = saved.agentKey;
    if (saved.secret === undefined) delete process.env.HORIZON_SECRET_FILE;
    else process.env.HORIZON_SECRET_FILE = saved.secret;
  };
  let application: HorizonApplication;
  try {
    application = await createApplication({ configPath, recordReader: () => reader, deskRoot: join(root, "desk"), ...(options.approvals ? { approvals: options.approvals } : {}), ...(options.economics ? { economics: options.economics } : {}), ...(options.workshop ? { workshop: options.workshop } : {}), ...(options.migrationHold ? { migrationHold: options.migrationHold } : {}), ...(options.readOnly ? { readOnly: true } : {}), now: options.now ?? (() => new Date("2026-11-06T10:00:00Z")) });
  } catch (error) {
    restore();
    throw error;
  }
  if (options.awaitMigration !== false) await application.migrated;
  const server = application.startServer(0);
  const base = `http://${server.hostname}:${server.port}`;
  return {
    application,
    base,
    root,
    stop: async () => {
      try {
        await server.stop(true);
        await application.close();
      } finally {
        restore();
      }
    },
    // Every panel change carries a request id (R2-11). A body without one gets a fresh id, so a test that does not care about retries
    // need not name one; a test that retries passes its own id.
    post: (path, body) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(withRequestId(path, body)) }),
    get: async (path) => (await fetch(`${base}${path}`)).json(),
    refusals: () => refusalsFor(application.runtime.runtime.store, application.caller.tenant),
    state: async (query = "") => (await fetch(`${base}/desk/state.json?${query}`)).json(),
  };
}

/**
 * The scope this desk keys its panel records by: the tenant and the operator (R4-1). Panel records, board order, answers, guards and
 * receipts are read with this, never with the tenant alone.
 */
export const deskScopeFor = (app: { readonly application: HorizonApplication }): string => deskScopeOf(app.application.caller.tenant, app.application.caller.actor.id);

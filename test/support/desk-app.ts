import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApplication, type HorizonApplication } from "../../src/app.ts";
import type { RecordReader, EconomicsSource } from "../../src/adapters/realitytrace-economics.ts";
import type { ApprovalAuthority } from "../../src/adapters/sea-forge-approvals.ts";
import type { Access } from "../../src/adapters/workshop.ts";
import { horizonDocument, writeConfig } from "./config.ts";

export interface DeskApp {
  readonly application: HorizonApplication;
  readonly base: string;
  readonly stop: () => Promise<void>;
  readonly post: (path: string, body: unknown) => Promise<Response>;
  readonly state: (query?: string) => Promise<any>;
  readonly get: (path: string) => Promise<any>;
}

export async function startDeskApp(options: { readonly repoPath?: string; readonly now?: () => Date; readonly approvals?: ApprovalAuthority; readonly economics?: EconomicsSource; readonly reader?: RecordReader; readonly workshop?: () => Access } = {}): Promise<DeskApp> {
  const root = mkdtempSync(join(tmpdir(), "desk-"));
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
    application = await createApplication({ configPath, recordReader: () => reader, deskRoot: join(root, "desk"), ...(options.approvals ? { approvals: options.approvals } : {}), ...(options.economics ? { economics: options.economics } : {}), ...(options.workshop ? { workshop: options.workshop } : {}), now: options.now ?? (() => new Date("2026-11-06T10:00:00Z")) });
  } catch (error) {
    restore();
    throw error;
  }
  const server = application.startServer(0);
  const base = `http://${server.hostname}:${server.port}`;
  return {
    application,
    base,
    stop: async () => {
      await server.stop(true);
      await application.close();
      restore();
    },
    post: (path, body) => fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }),
    get: async (path) => (await fetch(`${base}${path}`)).json(),
    state: async (query = "") => (await fetch(`${base}/desk/state.json?${query}`)).json(),
  };
}

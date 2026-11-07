// Shared live rig for the J02 revision 2 gates (test/J02r2-live.test.ts) and the settlement benchmark
// (test/bench/settlement.bench.ts): a real sea-forge-server governing Horizon's world with RealityTrace corroboration,
// Horizon bound to it, and the vetted verifier confined by an attested bubblewrap. Moved verbatim from the gate; the
// only addition is the server pid (for RSS) and an optional steering-attention allowance.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { governanceFromEnv } from "@godspeedai/cognate-runtime-bun";
import { createApplication, type HorizonApplication } from "../../src/app.ts";
import { loadWorld } from "../../src/adapters/semantic.ts";
import { seaForgeCall } from "./sea-forge-raw.ts";
import { approvalAuthority } from "../../src/adapters/sea-forge-config.ts";
import { NAVIGATION_INTENT_COMMIT } from "../../src/capabilities/navigation-intent.ts";
import { readPending } from "../../src/capabilities/pending-intent.ts";
import { CURRENCIES, type Currency } from "../../src/domain/payment.ts";
import { PINNED_WORLD_REF, horizonDocument, writeConfig } from "./config.ts";

export const BIN = process.env.SEA_FORGE_SERVER_BIN;
export const RT = process.env.REALITYTRACE_BIN;
export const BWRAP = process.env.HORIZON_BWRAP;

export const RECORD = "horizon.intent.record";
export const WRONG_TENANT = "horizon.intent.record.elsewhere";
export const EXEMPT = "horizon.intent.note";
export const WINDOW_S = 20;
export const GRACE_S = 2;

const cleanups: (() => void)[] = [];
/** Runs (and clears) the teardown registered by cells and the verifier build, last registered first. */
export function runCleanups(): void {
  for (const c of cleanups.reverse()) c();
  cleanups.length = 0;
}

let verifier: { bin: string; sha256: string } | undefined;
/** Builds the vetted verifier once per process, into a temp dir removed by runCleanups. */
export function ensureVerifier(): { bin: string; sha256: string } {
  if (verifier) return verifier;
  const dir = mkdtempSync(join(tmpdir(), "horizon-j02r2-bin-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, "horizon-verify-intent");
  const built = spawnSync("bun", ["run", "scripts/build-verifier.ts", "--out", bin], { encoding: "utf8" });
  if (built.status !== 0) throw new Error(built.stderr);
  verifier = { bin, sha256: JSON.parse(built.stdout.trim().split("\n").pop()!).sha256 };
  return verifier;
}

function seaFiles(root: string, dir = root, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "validation" || e.name === "__pycache__") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) seaFiles(root, p, out);
    else if (e.isFile() && e.name.endsWith(".sea")) out.push(relative(root, p).split("\\").join("/"));
  }
  return out;
}

export const policy = (commit: "allow" | "deny" | "escalate") => `version: "0.1"
rules:
  - name: navigation-commit
    verdict: ${commit === "deny" ? "deny" : "allow"}
${commit === "escalate" ? "    requires_approval: true\n" : ""}    actor_role: service
    operation_kind: cognate_capability
    resources: ["${NAVIGATION_INTENT_COMMIT.id}"]
  - { name: horizon-capabilities, verdict: allow, actor_role: service, operation_kind: cognate_capability }
  - { name: horizon-actions, verdict: allow, actor_role: service, operation_kind: cognate_action }
  - { name: operator-approves, verdict: allow, actor_role: operator, operation_kind: approval_resolution }
  - { name: evidence, verdict: allow, actor_role: service, operation_kind: evidence_mutation }
  - { name: settlement, verdict: allow, actor_role: service, operation_kind: settlement_declaration }
`;

async function until(ok: () => boolean | Promise<boolean>, what: string, ms = 30_000): Promise<void> {
  const end = Date.now() + ms;
  while (!(await ok())) {
    if (Date.now() > end) throw new Error(`timed out: ${what}`);
    await Bun.sleep(100);
  }
}

const bounds = (overrides: Partial<Record<Currency, number>> = {}, source = "binding:horizon.intent.record@1") =>
  CURRENCIES.map((currency) => ({ currency, unit: currency === "steering_attention" ? "decisions" : "units", amount: overrides[currency] ?? 0, basis: "declared_bound", source_ref: source }));

export interface Cell {
  readonly root: string;
  readonly socket: string;
  readonly storeDir: string;
  readonly rt: { bin: string; dataHome: string; stateHome: string; repoDir: string };
  /** The sea-forge-server process (for its RSS). */
  readonly serverPid: number;
  app: HorizonApplication;
  readonly reopen: () => Promise<HorizonApplication>;
}

/** A real cell: sea-forge-server governing Horizon's world with RealityTrace corroboration, and Horizon bound to it. */
export async function cell(commit: "allow" | "deny" | "escalate", options: { computeAllowance?: number; steeringAllowance?: number } = {}): Promise<Cell> {
  const verifierBin = ensureVerifier();
  const root = mkdtempSync(join(tmpdir(), "horizon-j02r2-"));
  const socket = join(tmpdir(), `horizon-j02r2-${process.pid}-${randomUUID().slice(0, 8)}.sock`);
  cleanups.push(() => rmSync(root, { recursive: true, force: true }), () => rmSync(socket, { force: true }));
  const files = seaFiles("domain");
  for (const f of files) {
    mkdirSync(dirname(join(root, "worlds", f)), { recursive: true });
    writeFileSync(join(root, "worlds", f), readFileSync(join("domain", f)));
  }
  writeFileSync(join(root, "policy.yaml"), policy(commit));
  const uid = process.getuid!();
  const rt = { bin: RT!, dataHome: join(root, "rt-data"), stateHome: join(root, "rt-state"), repoDir: join(root, "rt-repo") };
  writeFileSync(join(root, "server.yaml"), JSON.stringify({
    socket_path: socket,
    root,
    identity: { bindings: [{ uid, actor_id: "cognate-service", roles: ["service"] }, { uid: 4_294_967_000, actor_id: "operator", roles: ["operator"] }] },
    gateway: { uid, actor: "cognate-service", delegable_actors: ["operator"] },
    cep_authority: {
      enabled: true, policy: "policy.yaml", worlds: [{ name: "horizon", base: "worlds", entry: "interaction-model.sea", files }],
      realitytrace: { bin: rt.bin, data_home: rt.dataHome, state_home: rt.stateHome, require_corroboration: true },
    },
  }));
  const server = Bun.spawn([BIN!], { env: { ...process.env, SEA_FORGE_ROOT: root, SEA_FORGE_SOCKET: socket }, stdout: "ignore", stderr: process.env.HZ_SF_LOG ? Bun.file(process.env.HZ_SF_LOG) : "ignore" });
  cleanups.push(() => server.kill());
  await until(() => existsSync(socket), "sea-forge-server socket");

  const storeDir = join(root, "store");
  mkdirSync(storeDir);
  // The verifier reads a read-only snapshot of the store, so the launcher mounts the snapshot directory only.
  const snapshotDir = join(root, "verifier-snapshot");
  mkdirSync(snapshotDir);
  const store = join(snapshotDir, "app.sqlite");
  const liveStore = join(storeDir, "app.sqlite");
  const verifier = (tenantLiteral: string) => ({
    template_id: "horizon.intent-recorded",
    version: "1",
    kind: "command",
    read_only: true,
    argv: [{ artifact: "verifier" }, { literal: "--store" }, { literal: store }, { literal: "--tenant" }, { literal: tenantLiteral }, { literal: "--intent" }, { effect_identity: true }],
    artifacts: [{ name: "verifier", sha256: verifierBin.sha256, path: verifierBin.bin }],
  });
  const launcher = [
    BWRAP!, "--unshare-all", "--die-with-parent", "--new-session",
    "--ro-bind", "/usr", "/usr", "--ro-bind-try", "/lib", "/lib", "--ro-bind-try", "/lib64", "/lib64",
    "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp",
    "--ro-bind", snapshotDir, snapshotDir, "--ro-bind", verifierBin.bin, verifierBin.bin, "--chdir", "/",
  ];
  const doc = {
    ...horizonDocument({ storePath: liveStore, secretPath: join(root, "launch.secret") }),
    operations: [
      { operation_ref: RECORD, label: "Record a navigation intent", reversibility: "reversible", payment: bounds({ compute: 1, steering_attention: 1 }), verifier: verifier(TENANT_PLACEHOLDER) },
      { operation_ref: WRONG_TENANT, label: "Record, checked under another tenant", reversibility: "reversible", payment: bounds({}, "binding:elsewhere@1"), verifier: verifier("tenant-that-is-not-this-one") },
      { operation_ref: EXEMPT, label: "Note (read only)", reversibility: "read_only", payment: bounds({}, "binding:note@1") },
    ],
    capacity: [
      { currency: "compute", unit: "units", allowance: options.computeAllowance ?? 10, period: "none" },
      { currency: "steering_attention", unit: "decisions", allowance: options.steeringAllowance ?? 20, period: "day" },
    ],
    settlement: { launcher, close_grace_s: GRACE_S, snapshot_dir: snapshotDir },
  };
  const governance = governanceFromEnv({ COGNATE_GOVERNANCE: "sea-forge", COGNATE_SEA_FORGE_SOCKET: socket, COGNATE_WORLD_REF: loadWorld(PINNED_WORLD_REF).cognateWorldRef });
  const open = async () => {
    // The tenant is per host; resolve it from a first app so the verifier template names the real one.
    const configPath = await writeConfig(join(root, "horizon.toml"), JSON.parse(JSON.stringify(doc).replaceAll(TENANT_PLACEHOLDER, tenantOf())));
    const app = await createApplication({ configPath, governance, approvals: approvalAuthority({ socketPath: socket, operatorId: "actor:operator" }), realityTrace: rt, seaForgeSocket: socket });
    cleanups.push(() => void app.close());
    return app;
  };
  return { root, socket, storeDir, rt, serverPid: server.pid, app: await open(), reopen: open };
}

const TENANT_PLACEHOLDER = "__TENANT__";
const tenantOf = () => `local:${require("node:os").hostname()}`;

export const expectation = (overrides: Record<string, unknown> = {}) => ({
  modality: "obligation",
  statement: "the navigation intent record exists in the Horizon store",
  refuted_by: "the vetted verifier exits non-zero",
  irrelevant: ["the frame's other choices"],
  unaccounted: ["store replication"],
  verifier: { template_ref: "horizon.intent-recorded@1" },
  window_s: WINDOW_S,
  ...overrides,
});

export function rtRows(c: Cell): { ledger_id: string; append_ordinal: number; record_kind: string; payload: any }[] {
  const env = { PATH: process.env.PATH, XDG_DATA_HOME: c.rt.dataHome, XDG_STATE_HOME: c.rt.stateHome };
  const listed = spawnSync(RT!, ["repo", "list", "--json"], { cwd: c.root, env, encoding: "utf8" });
  const repos = (JSON.parse(listed.stdout).repos ?? []) as { repo_id: string }[];
  return repos.flatMap((repo) => JSON.parse(spawnSync(RT!, ["ledger", "export", "--repo", repo.repo_id, "--json"], { cwd: c.root, env, encoding: "utf8" }).stdout));
}

/** SEA-Forge's own settlement packet for the operation (a settled operation replays it, never re-judges). */
export async function seaForgeSettlement(c: Cell, operationId: string): Promise<Record<string, any>> {
  return seaForgeCall(c.socket, { verb: "authority_settle", operation_id: operationId, request_id: `test:${operationId}`, actor: { actor_id: "cognate-service", role: "service" } }, 30_000);
}

/**
 * Wait until SEA-Forge's closure (C) is recorded on the pending operation, or it reached a terminal state.
 * Observes the pending record instead of sleeping a fixed pad past window close.
 */
export async function awaitClosureRecorded(c: Cell, intentId: string, timeoutMs = 30_000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const pending = (await readPending(c.app.runtime.runtime.store, c.app.caller.tenant, intentId))?.pending;
    if (!pending || pending.closure || pending.terminal) return pending;
    if (Date.now() > until) throw new Error(`closure not recorded for ${intentId} within ${timeoutMs} ms`);
    await Bun.sleep(25);
  }
}

export async function settleAfterClose(c: Cell, intentId: string) {
  await awaitClosureRecorded(c, intentId);
  return c.app.settleNavigationIntent(intentId);
}

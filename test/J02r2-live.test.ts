// J02 revision 2 live gate (HORIZON-001 1.1.0, SPEC-CR-002 "Independent evaluation required"): payment and IS7
// settlement of committed navigation intents, against a real sea-forge-server and a real RealityTrace, with the
// vetted verifier confined by an attested bubblewrap. Every check reads an owner's record: RealityTrace's ledger
// export, SEA-Forge's own settlement packet (read back from SEA-Forge), or the Horizon store. Horizon's view of
// itself does not count.
// Opt-in: SEA_FORGE_SERVER_BIN (with authority claims, authority_closure and obligation settlement),
// REALITYTRACE_BIN (with RT-1 completed_at) and HORIZON_BWRAP (an attested bubblewrap >= 0.12). Cognate must carry
// authority claims (GodSpeedAI/Cognate#65); without them SEA-Forge records no obligation and this gate fails.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { governanceFromEnv } from "@godspeedai/cognate-runtime-bun";
import { createApplication, type HorizonApplication } from "../src/app.ts";
import { loadWorld } from "../src/adapters/semantic.ts";
import { approvalAuthority, seaForgeCall } from "../src/adapters/sea-forge-approvals.ts";
import { INTENT_INDEX_COLLECTION, NAVIGATION_INTENT_COMMIT, readIntentRecords } from "../src/capabilities/navigation-intent.ts";
import { readLedger } from "../src/capabilities/capacity-ledger.ts";
import { readPending } from "../src/capabilities/pending-intent.ts";
import { CURRENCIES, type Currency } from "../src/domain/payment.ts";
import { applySequential, openSequential, renderSequentialText } from "../src/ui/sequential/controller.ts";
import { PINNED_WORLD_REF, horizonDocument, writeConfig } from "./support/config.ts";

const BIN = process.env.SEA_FORGE_SERVER_BIN;
const RT = process.env.REALITYTRACE_BIN;
const BWRAP = process.env.HORIZON_BWRAP;
const live = BIN && RT && BWRAP ? test : test.skip;
const cleanups: (() => void)[] = [];
afterAll(() => {
  for (const c of cleanups.reverse()) c();
});

const RECORD = "horizon.intent.record";
const WRONG_TENANT = "horizon.intent.record.elsewhere";
const EXEMPT = "horizon.intent.note";
const WINDOW_S = 20;
const GRACE_S = 2;

let verifierBin = "";
let verifierSha = "";
beforeAll(() => {
  if (!BIN || !RT || !BWRAP) return;
  const dir = mkdtempSync(join(tmpdir(), "horizon-j02r2-bin-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  verifierBin = join(dir, "horizon-verify-intent");
  const built = spawnSync("bun", ["run", "scripts/build-verifier.ts", "--out", verifierBin], { encoding: "utf8" });
  if (built.status !== 0) throw new Error(built.stderr);
  verifierSha = JSON.parse(built.stdout.trim().split("\n").pop()!).sha256;
}, 120_000);

function seaFiles(root: string, dir = root, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "validation" || e.name === "__pycache__") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) seaFiles(root, p, out);
    else if (e.isFile() && e.name.endsWith(".sea")) out.push(relative(root, p).split("\\").join("/"));
  }
  return out;
}

const policy = (commit: "allow" | "deny" | "escalate") => `version: "0.1"
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

interface Cell {
  readonly root: string;
  readonly socket: string;
  readonly storeDir: string;
  readonly rt: { bin: string; dataHome: string; stateHome: string; repoDir: string };
  app: HorizonApplication;
  readonly reopen: () => Promise<HorizonApplication>;
}

/** A real cell: sea-forge-server governing Horizon's world with RealityTrace corroboration, and Horizon bound to it. */
async function cell(commit: "allow" | "deny" | "escalate", options: { computeAllowance?: number } = {}): Promise<Cell> {
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
  const store = join(storeDir, "app.sqlite");
  const verifier = (tenantLiteral: string) => ({
    template_id: "horizon.intent-recorded",
    version: "1",
    kind: "command",
    read_only: true,
    argv: [{ artifact: "verifier" }, { literal: "--store" }, { literal: store }, { literal: "--tenant" }, { literal: tenantLiteral }, { literal: "--intent" }, { effect_identity: true }],
    artifacts: [{ name: "verifier", sha256: verifierSha, path: verifierBin }],
  });
  const launcher = [
    BWRAP!, "--unshare-all", "--die-with-parent", "--new-session",
    "--ro-bind", "/usr", "/usr", "--ro-bind-try", "/lib", "/lib", "--ro-bind-try", "/lib64", "/lib64",
    "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp",
    "--ro-bind", storeDir, storeDir, "--ro-bind", verifierBin, verifierBin, "--chdir", "/",
  ];
  const doc = {
    ...horizonDocument({ storePath: store, secretPath: join(root, "launch.secret") }),
    operations: [
      { operation_ref: RECORD, label: "Record a navigation intent", reversibility: "reversible", payment: bounds({ compute: 1, steering_attention: 1 }), verifier: verifier(TENANT_PLACEHOLDER) },
      { operation_ref: WRONG_TENANT, label: "Record, checked under another tenant", reversibility: "reversible", payment: bounds({}, "binding:elsewhere@1"), verifier: verifier("tenant-that-is-not-this-one") },
      { operation_ref: EXEMPT, label: "Note (read only)", reversibility: "read_only", payment: bounds({}, "binding:note@1") },
    ],
    capacity: [
      { currency: "compute", unit: "units", allowance: options.computeAllowance ?? 10, period: "none" },
      { currency: "steering_attention", unit: "decisions", allowance: 20, period: "day" },
    ],
    settlement: { launcher, close_grace_s: GRACE_S },
  };
  const governance = governanceFromEnv({ COGNATE_GOVERNANCE: "sea-forge", COGNATE_SEA_FORGE_SOCKET: socket, COGNATE_WORLD_REF: loadWorld(PINNED_WORLD_REF).cognateWorldRef });
  const open = async () => {
    // The tenant is per host; resolve it from a first app so the verifier template names the real one.
    const configPath = await writeConfig(join(root, "horizon.toml"), JSON.parse(JSON.stringify(doc).replaceAll(TENANT_PLACEHOLDER, tenantOf())));
    const app = await createApplication({ configPath, governance, approvals: approvalAuthority({ socketPath: socket, operatorId: "operator" }), realityTrace: rt, seaForgeSocket: socket });
    cleanups.push(() => void app.close());
    return app;
  };
  return { root, socket, storeDir, rt, app: await open(), reopen: open };
}

const TENANT_PLACEHOLDER = "__TENANT__";
const tenantOf = () => `local:${require("node:os").hostname()}`;

const expectation = (overrides: Record<string, unknown> = {}) => ({
  modality: "obligation",
  statement: "the navigation intent record exists in the Horizon store",
  refuted_by: "the vetted verifier exits non-zero",
  irrelevant: ["the frame's other choices"],
  unaccounted: ["store replication"],
  verifier: { template_ref: "horizon.intent-recorded@1" },
  window_s: WINDOW_S,
  ...overrides,
});

function rtRows(c: Cell): { ledger_id: string; append_ordinal: number; record_kind: string; payload: any }[] {
  const env = { PATH: process.env.PATH, XDG_DATA_HOME: c.rt.dataHome, XDG_STATE_HOME: c.rt.stateHome };
  const listed = spawnSync(RT!, ["repo", "list", "--json"], { cwd: c.root, env, encoding: "utf8" });
  const repos = (JSON.parse(listed.stdout).repos ?? []) as { repo_id: string }[];
  return repos.flatMap((repo) => JSON.parse(spawnSync(RT!, ["ledger", "export", "--repo", repo.repo_id, "--json"], { cwd: c.root, env, encoding: "utf8" }).stdout));
}

/** SEA-Forge's own settlement packet for the operation (a settled operation replays it, never re-judges). */
async function seaForgeSettlement(c: Cell, operationId: string): Promise<Record<string, any>> {
  return seaForgeCall(c.socket, { verb: "authority_settle", operation_id: operationId, request_id: `test:${operationId}`, actor: { actor_id: "cognate-service", role: "service" } }, 30_000);
}

async function settleAfterClose(c: Cell, intentId: string) {
  const pending = (await readPending(c.app.runtime.runtime.store, c.app.caller.tenant, intentId))!.pending;
  const wait = Date.parse(pending.window!.closes_at) - Date.now() + 500;
  if (wait > 0) await Bun.sleep(wait);
  return c.app.settleNavigationIntent(intentId);
}

describe("J02 revision 2 (live)", () => {
  live("causal order across owners, and a supported obligation settles", async () => {
    const c = await cell("allow");
    const commit = await c.app.commitNavigationIntent({ operationRef: RECORD, expectation: expectation() });
    const id = commit.intent.intent_id;
    const pending = (await readPending(c.app.runtime.runtime.store, c.app.caller.tenant, id))!.pending;

    // Window open: settlement is pending, never settled early.
    expect((await c.app.settleNavigationIntent(id)).settlement_reference.status).toBe("pending");

    const settlement = await settleAfterClose(c, id);
    expect(settlement.settlement_reference).toMatchObject({ status: "settled", final: true, epistemic_status: "supported" });

    // RealityTrace's ledger: threshold at T, then discrimination (B > T, did not observe), then verification (> B, observed).
    const rows = rtRows(c);
    const threshold = rows.find((r) => r.record_kind === "threshold.declared" && r.payload.states?.[0]?.state_id === pending.threshold!.threshold_id)!;
    expect(threshold.append_ordinal).toBe(pending.threshold!.position.ordinal);
    const after = (await readPending(c.app.runtime.runtime.store, c.app.caller.tenant, id))!.pending;
    const obs = (o: string) => rows.find((r) => r.record_kind === "observation.recorded" && r.payload.observations[0].observation_id === o)!;
    const discrimination = obs(after.discrimination!.observation_id);
    const verification = obs(after.verifications![0]!.observation_id);
    expect(discrimination.append_ordinal).toBeGreaterThan(threshold.append_ordinal);
    expect(discrimination.payload.representations[0].inline_content.exit_code).toBe(1);
    expect(verification.append_ordinal).toBeGreaterThan(discrimination.append_ordinal);
    expect(verification.payload.representations[0].inline_content.exit_code).toBe(0);
    expect(verification.payload.representations[0].inline_content.invocation.launcher[0]).toBe(BWRAP);

    // SEA-Forge's own record: the claims it froze equal RealityTrace's records and the expectation digest.
    const packet = await seaForgeSettlement(c, after.operation_id!);
    expect(packet.ok).toBe(true);
    const basis = packet.envelope.settlements[0].threshold_basis;
    expect(basis.expectation_digest).toBe(pending.expectation_digest);
    expect(basis.threshold).toEqual({ id: threshold.payload.states[0].state_id, ledger_id: threshold.ledger_id, position: threshold.append_ordinal });
    expect(basis.closure.b).toBe(discrimination.append_ordinal);
    expect(basis.closure.c).toBeGreaterThanOrEqual(verification.append_ordinal);
    expect(packet.envelope.extensions["godspeed.settlement_packet"]).toMatchObject({ modality: "obligation", epistemic_status: "supported", overall_status: "settled", final: true });

    // Horizon store: the effect exists, and the reservation became consumption.
    expect((await readIntentRecords(c.app.runtime.runtime.store)).map((r) => r.record.intent_id)).toContain(id);
    const { ledger } = await readLedger(c.app.runtime.runtime.store, c.app.caller.tenant, []);
    expect(ledger.reservations.map((r) => r.intent_id)).not.toContain(id);
    expect(ledger.consumptions.map((r) => r.intent_id)).toContain(id);
  }, 240_000);

  live("a verifier checking the wrong tenant contradicts the statement: rejected", async () => {
    const c = await cell("allow");
    const commit = await c.app.commitNavigationIntent({ operationRef: WRONG_TENANT, expectation: expectation() });
    const settlement = await settleAfterClose(c, commit.intent.intent_id);
    expect(settlement.settlement_reference).toMatchObject({ status: "rejected", final: true, epistemic_status: "contradicted" });
  }, 240_000);

  live("an expectation already true before acting: the operation is not executed and nothing changes", async () => {
    const c = await cell("allow");
    const id = randomUUID();
    // The effect already exists for this intent id (as if the operation had happened outside Horizon).
    await c.app.runtime.runtime.store.commit({ appends: [], records: [{ collection: INTENT_INDEX_COLLECTION, id: `${c.app.caller.tenant}/${id}`, expectedVersion: 0, value: { event_id: "outside", intent_id: id, frame_id: "f", frame_revision: 0, actor_ref: "x", operation_ref: RECORD } }] });
    const before = (await readIntentRecords(c.app.runtime.runtime.store)).length;
    await expect(c.app.commitNavigationIntent({ operationRef: RECORD, intentId: id, expectation: expectation() })).rejects.toThrow(/already holds before acting/);
    expect((await readIntentRecords(c.app.runtime.runtime.store)).length).toBe(before);
    expect((await readPending(c.app.runtime.runtime.store, c.app.caller.tenant, id))!.pending.terminal).toMatchObject({ outcome: "refused", reason: "expected outcome already holds before acting" });
    const { ledger } = await readLedger(c.app.runtime.runtime.store, c.app.caller.tenant, []);
    expect(ledger.consumptions.map((r) => r.intent_id)).toContain(id);
  }, 240_000);

  live("a denied intent and an unaffordable intent produce no verifier run and no effect", async () => {
    const denied = await cell("deny");
    await expect(denied.app.commitNavigationIntent({ operationRef: RECORD, expectation: expectation() })).rejects.toThrow();
    expect(rtRows(denied).filter((r) => r.record_kind === "observation.recorded" && r.payload.representations?.[0]?.inline_content?.verifier_id === "command")).toHaveLength(0);
    expect(await readIntentRecords(denied.app.runtime.runtime.store)).toHaveLength(0);

    const poor = await cell("allow", { computeAllowance: 0 });
    await expect(poor.app.commitNavigationIntent({ operationRef: RECORD, expectation: expectation() })).rejects.toThrow(/payment is blocked: compute: declares 1 units, 0 available/);
    expect(rtRows(poor).filter((r) => r.record_kind === "question.declared")).toHaveLength(0);
    expect(await readIntentRecords(poor.app.runtime.runtime.store)).toHaveLength(0);
  }, 240_000);

  live("an approval that arrives after the window closes is refused and executes nothing", async () => {
    const c = await cell("escalate");
    const error = await c.app.commitNavigationIntent({ operationRef: RECORD, expectation: expectation({ window_s: 6 }) }).then(() => null, (e: unknown) => e as { approvalId?: string; intent?: { intent_id: string } });
    expect(error?.approvalId).toMatch(/^apr-/);
    await Bun.sleep(7_000);
    await expect(c.app.resolveNavigationApproval({ approvalId: error!.approvalId!, resolution: "approved" })).rejects.toThrow(/window expired/);
    expect(await readIntentRecords(c.app.runtime.runtime.store)).toHaveLength(0);
    expect((await readPending(c.app.runtime.runtime.store, c.app.caller.tenant, error!.intent!.intent_id))!.pending.terminal).toMatchObject({ outcome: "refused", reason: "window expired" });
  }, 240_000);

  live("Horizon stopped across the deadline: the late closure cannot prove C on time, so unresolved and rejected", async () => {
    const c = await cell("allow");
    const commit = await c.app.commitNavigationIntent({ operationRef: RECORD, expectation: expectation({ window_s: 10 }) });
    const id = commit.intent.intent_id;
    const pending = (await readPending(c.app.runtime.runtime.store, c.app.caller.tenant, id))!.pending;
    await c.app.close();
    await Bun.sleep(Math.max(0, Date.parse(pending.window!.closes_at) - Date.now()) + (GRACE_S + 2) * 1000);
    c.app = await c.reopen();
    const settlement = await c.app.settleNavigationIntent(id);
    expect(settlement.settlement_reference).toMatchObject({ status: "rejected", final: true, epistemic_status: "unresolved" });
  }, 240_000);

  live("REQ-NAV-010: observed steering attention equals SEA-Forge's recorded decisions, beside the declared bound in the frame and the Clack render", async () => {
    const c = await cell("escalate");
    const waiting = await c.app.commitNavigationIntent({ operationRef: RECORD, expectation: expectation() }).then(() => null, (e: unknown) => e as { approvalId?: string });
    expect(waiting?.approvalId).toMatch(/^apr-/);
    const committed = await c.app.resolveNavigationApproval({ approvalId: waiting!.approvalId!, resolution: "approved" });
    // SEA-Forge's own record of human authority decisions for that approval.
    const listed = await seaForgeCall(c.socket, { verb: "authority_approvals", actor: { actor_id: "cognate-service", role: "service" } }, 15_000);
    const decided = (listed.approvals as { approval_id: string; resolved_by: unknown }[]).filter((a) => a.approval_id === waiting!.approvalId && a.resolved_by);
    expect(decided).toHaveLength(1);
    const observed = (await readPending(c.app.runtime.runtime.store, c.app.caller.tenant, committed.intent.intent_id))!.pending.observed;
    expect(observed).toEqual([{ currency: "steering_attention", unit: "decisions", amount: decided.length, source_ref: "sea-forge:authority_approvals" }]);
    // The frame projection carries it beside the declared bound ...
    const frame = await c.app.navigationFrame();
    const choice = frame.choices.find((ch) => ch.operation_ref === RECORD)!;
    expect(choice.payment?.observed).toEqual(observed!);
    expect(choice.payment?.entries.find((entry) => entry.currency === "steering_attention")).toMatchObject({ amount: 1, unit: "decisions", basis: "declared_bound" });
    // ... and so does the Clack render of the move's review.
    const reviewed = applySequential(openSequential(frame), { type: "select", choice_id: RECORD, frame_id: frame.frame_id, revision: frame.revision });
    expect(reviewed.session.prompt.kind).toBe("review");
    const text = renderSequentialText(reviewed.session.prompt);
    expect(text).toContain("steering_attention declared 1 decisions, observed 1 decisions (sea-forge:authority_approvals)");
  }, 240_000);

  live("an exempt read_only intent settles not_required without an expectation", async () => {
    const c = await cell("allow");
    const commit = await c.app.commitNavigationIntent({ operationRef: EXEMPT });
    expect((await c.app.settleNavigationIntent(commit.intent.intent_id)).settlement_reference).toMatchObject({ status: "not_required", final: true });
  }, 240_000);
});

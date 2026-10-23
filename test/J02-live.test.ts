// J02 live (readiness P04): Horizon's navigation commit is decided by a real SEA-Forge server.
// Horizon never grants authority itself (AGENTS.md §9); a mocked SEA-Forge would prove nothing (§7).
//   allow    -> the intent is committed exactly once;
//   deny     -> SEA-Forge refuses it: no record, and the refused attempt is audited;
//   offline  -> SEA-Forge unreachable: the commit fails closed, no record;
//   escalate -> the commit waits on a SEA-Forge approval; the requester cannot approve itself; the
//               operator's approval (on_behalf_of) commits it exactly once; a rejection commits nothing.
// The world SEA-Forge registers is Horizon's own `domain/` source set; an unknown world would refuse the
// allow case, so it passing proves both sides derive the same world_ref.
// Opt-in: SEA_FORGE_SERVER_BIN (a sea-forge-server with the policy `resources` filter).
import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { randomUUID } from "node:crypto";
import { governanceFromEnv } from "@godspeedai/cognate-runtime-bun";
import { AwaitingAuthorityError, createApplication, type HorizonApplication } from "../src/app.ts";
import { loadWorld } from "../src/adapters/semantic.ts";
import { approvalAuthority, seaForgeCall } from "../src/adapters/sea-forge-approvals.ts";
import { NAVIGATION_INTENT_COMMIT, readIntentAttempts, readIntentRecords } from "../src/capabilities/navigation-intent.ts";
import { PINNED_WORLD_REF, horizonDocument, writeConfig } from "./support/config.ts";

const BIN = process.env.SEA_FORGE_SERVER_BIN;
const liveTest = BIN ? test : test.skip;
const cleanups: (() => void)[] = [];
afterAll(() => { for (const c of cleanups.reverse()) c(); });

function seaFiles(root: string, dir = root, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "validation" || e.name === "__pycache__") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) seaFiles(root, p, out);
    else if (e.isFile() && e.name.endsWith(".sea")) out.push(relative(root, p).split("\\").join("/"));
  }
  return out;
}

type Commit = "allow" | "deny" | "escalate";
const policy = (commit: Commit) => `version: "0.1"
rules:
  - name: navigation-commit
    verdict: ${commit === "deny" ? "deny" : "allow"}
${commit === "escalate" ? "    requires_approval: true\n" : ""}    actor_role: service
    operation_kind: cognate_capability
    resources: ["${NAVIGATION_INTENT_COMMIT.id}"]
  - { name: horizon-capabilities, verdict: allow, actor_role: service, operation_kind: cognate_capability }
  - { name: horizon-actions, verdict: allow, actor_role: service, operation_kind: cognate_action }
  - { name: operator-approves, verdict: allow, actor_role: operator, operation_kind: approval_resolution }
`;

async function until(ok: () => boolean, what: string, ms = 30_000): Promise<void> {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`timed out: ${what}`);
    await Bun.sleep(50);
  }
}

/** A real sea-forge-server governing Horizon's own world. One uid = one actor: this process is the
 * service and the gateway; the operator has no uid and is reached only through on_behalf_of. */
async function seaForge(commit: Commit) {
  const root = mkdtempSync(join(tmpdir(), "horizon-j02-"));
  const socket = join(tmpdir(), `horizon-j02-${process.pid}-${randomUUID().slice(0, 8)}.sock`);
  cleanups.push(() => rmSync(root, { recursive: true, force: true }), () => rmSync(socket, { force: true }));
  const files = seaFiles("domain");
  for (const f of files) {
    mkdirSync(dirname(join(root, "worlds", f)), { recursive: true });
    writeFileSync(join(root, "worlds", f), readFileSync(join("domain", f)));
  }
  writeFileSync(join(root, "policy.yaml"), policy(commit));
  const uid = process.getuid!();
  writeFileSync(join(root, "server.yaml"), JSON.stringify({
    socket_path: socket,
    root,
    identity: { bindings: [{ uid, actor_id: "cognate-service", roles: ["service"] }, { actor_id: "operator", roles: ["operator"] }] },
    gateway: { uid, actor: "cognate-service", delegable_actors: ["operator"] },
    cep_authority: { enabled: true, policy: "policy.yaml", worlds: [{ name: "horizon", base: "worlds", entry: "interaction-model.sea", files }] },
  }));
  const server = Bun.spawn([BIN!], { env: { ...process.env, SEA_FORGE_ROOT: root, SEA_FORGE_SOCKET: socket }, stdout: "ignore", stderr: process.env.HZ_SF_LOG ? Bun.file(process.env.HZ_SF_LOG) : "ignore" });
  cleanups.push(() => server.kill());
  await until(() => existsSync(socket), "sea-forge-server socket");

  const governance = governanceFromEnv({ COGNATE_GOVERNANCE: "sea-forge", COGNATE_SEA_FORGE_SOCKET: socket, COGNATE_WORLD_REF: loadWorld(PINNED_WORLD_REF).cognateWorldRef });
  expect(governance.mode).toBe("sea-forge");
  const configPath = await writeConfig(join(root, "horizon.toml"), horizonDocument({ storePath: join(root, "app.sqlite"), secretPath: join(root, "launch.secret") }));
  const app: HorizonApplication = await createApplication({ configPath, governance, approvals: approvalAuthority({ socketPath: socket, operatorId: "operator" }) });
  cleanups.push(() => void app.close?.());
  const records = async () => (await readIntentRecords(app.runtime.runtime.store)).map((r) => r.record.intent_id);
  const attempts = async () => readIntentAttempts(app.runtime.runtime.store);
  return { root, socket, server, app, records, attempts };
}

const failure = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as Error);

liveTest("J02: SEA-Forge, not Horizon, decides whether a navigation intent is committed", async () => {
  const { root, socket, server, app, records, attempts } = await seaForge("allow");

  // allow: committed exactly once.
  const allowed = await app.commitNavigationIntent({ operationRef: "horizon.health" });
  expect(await records()).toEqual([allowed.intent.intent_id]);

  // deny: SEA-Forge refuses this capability; Horizon's own policy would have allowed it.
  writeFileSync(join(root, "policy.yaml"), policy("deny"));
  const denied = await failure(app.commitNavigationIntent({ operationRef: "horizon.health" }));
  expect(denied, "SEA-Forge denied the commit, so Horizon must not commit it").not.toBeNull();
  expect(await records()).toEqual([allowed.intent.intent_id]);
  const refused = (await attempts()).filter((a) => a.outcome === "refused");
  expect(refused.length).toBeGreaterThanOrEqual(1);
  expect(JSON.stringify(refused.at(-1))).toMatch(/deny|denied|SEA-Forge|authority/i);

  // offline: no authority, no commit.
  writeFileSync(join(root, "policy.yaml"), policy("allow"));
  server.kill();
  await server.exited;
  rmSync(socket, { force: true });
  const offline = await failure(app.commitNavigationIntent({ operationRef: "horizon.health" }));
  expect(offline, "with SEA-Forge unreachable the commit must fail closed").not.toBeNull();
  expect(await records()).toEqual([allowed.intent.intent_id]);
}, 120_000);

liveTest("J02 IS3-IS5: an escalated commit waits; only the operator's approval at SEA-Forge commits it, once", async () => {
  const { socket, app, records, attempts } = await seaForge("escalate");

  // escalate: the commit waits on a SEA-Forge approval, and nothing is committed.
  const waiting = await failure(app.commitNavigationIntent({ operationRef: "horizon.health" }));
  expect(waiting).toBeInstanceOf(AwaitingAuthorityError);
  const { approvalId, intent } = waiting as AwaitingAuthorityError;
  expect(approvalId).toMatch(/^apr-/);
  expect(await records()).toEqual([]);
  expect((await attempts()).at(-1)).toMatchObject({ intent_id: intent.intent_id, outcome: "awaiting_authority" });

  // The requester (the service identity) cannot approve its own escalation.
  const self = await seaForgeCall(socket, {
    verb: "authority_approval", approval_id: approvalId, resolution: "approved", request_id: `self-${approvalId}`,
    actor: { actor_id: "cognate-service", role: "service" },
  });
  expect(self.error_class).toBe("cep_approval_refused");
  expect(await records()).toEqual([]);

  // The operator approves through SEA-Forge; SEA-Forge revalidates and the intent is committed once.
  const committed = await app.resolveNavigationApproval({ approvalId, resolution: "approved" });
  expect(committed.intent.intent_id).toBe(intent.intent_id);
  expect(await records()).toEqual([intent.intent_id]);
  const approvals = await seaForgeCall(socket, { verb: "authority_approvals" });
  expect((approvals.approvals as { approval_id: string; state: string }[]).find((a) => a.approval_id === approvalId)?.state).toBe("used");

  // One approval, one effect: neither a second resolution nor a resubmission writes another record.
  expect(await failure(app.resolveNavigationApproval({ approvalId, resolution: "approved" }))).not.toBeNull();
  expect((await app.submitIntent(intent)).eventId).toBe(committed.eventId);
  expect(await records()).toEqual([intent.intent_id]);

  // The same id with a different intent is duplicate_intent on the governed path too, and audited.
  const frame = app.frames.current()!;
  app.frames.issue({ ...frame, frame_id: "frame-j02-duplicate", revision: frame.revision + 1 });
  const duplicate = (await failure(app.submitIntent({ ...intent, frame_id: "frame-j02-duplicate", frame_revision: frame.revision + 1 }))) as Error & { code?: string };
  expect(duplicate?.code).toBe("already_exists");
  expect(duplicate?.message).toContain("duplicate_intent");
  expect((await attempts()).at(-1)).toMatchObject({ intent_id: intent.intent_id, outcome: "refused" });
  expect(await records()).toEqual([intent.intent_id]);

  // An approval made at SEA-Forge directly, not through Horizon, still resumes the commit (Horizon polls
  // SEA-Forge) and is audited by the run itself; answering it again through Horizon is refused.
  const direct = (await failure(app.commitNavigationIntent({ operationRef: "horizon.health" }))) as AwaitingAuthorityError;
  expect(direct).toBeInstanceOf(AwaitingAuthorityError);
  const approvedAtSeaForge = await seaForgeCall(socket, {
    verb: "authority_approval", approval_id: direct.approvalId, resolution: "approved", request_id: `direct-${direct.approvalId}`,
    actor: { actor_id: "cognate-service", role: "service" }, on_behalf_of: { actor_id: "operator", role: "operator" },
  });
  expect(approvedAtSeaForge.ok).toBe(true);
  const deadline = Date.now() + 20_000;
  while (!(await records()).includes(direct.intent.intent_id)) {
    if (Date.now() > deadline) throw new Error("the commit approved at SEA-Forge did not resume");
    await Bun.sleep(100);
  }
  expect(await records()).toEqual([intent.intent_id, direct.intent.intent_id]);
  expect((await attempts()).filter((a) => a.intent_id === direct.intent.intent_id).map((a) => a.outcome)).toEqual(["awaiting_authority", "accepted"]);
  expect(await failure(app.resolveNavigationApproval({ approvalId: direct.approvalId, resolution: "rejected" }))).not.toBeNull();
  expect(await records()).toEqual([intent.intent_id, direct.intent.intent_id]);

  // A rejected escalation commits nothing, and the refusal is audited.
  const second = (await failure(app.commitNavigationIntent({ operationRef: "horizon.health" }))) as AwaitingAuthorityError;
  expect(second).toBeInstanceOf(AwaitingAuthorityError);
  const rejected = await failure(app.resolveNavigationApproval({ approvalId: second.approvalId, resolution: "rejected" }));
  expect(rejected).not.toBeNull();
  expect(await records()).toEqual([intent.intent_id, direct.intent.intent_id]);
  expect((await attempts()).at(-1)).toMatchObject({ intent_id: second.intent.intent_id, outcome: "refused" });
}, 120_000);

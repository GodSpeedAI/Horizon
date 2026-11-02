/**
 * Durable operator sessions and the mapped SEA-Forge actor, through the real phone routes.
 *
 * Every test here is a refusal: the request is refused with a clear error and nothing is committed.
 * SEA-Forge is a scripted wire (the `delegationSend` seam) that records what Horizon sends, so the
 * actor the gateway presents on behalf of the human is observable. The wire is not an authority
 * claim: live containment of the OS-isolated gateway is a separate deployment gate.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import { buildAuthorityRequest, interpretDecision, type GovernanceAuthority } from "@godspeedai/cognate-runtime-bun";
import { createIdentityService, SESSIONS } from "@godspeed/identity";
import { createApplication, type HorizonApplication } from "../src/app.ts";
import { approvalAuthority } from "../src/adapters/sea-forge-approvals.ts";
import { delegatingAuthority } from "../src/adapters/delegating-authority.ts";
import { loadWorld } from "../src/adapters/semantic.ts";
import { readIntentAttempts, readIntentRecords } from "../src/capabilities/navigation-intent.ts";
import { identityStoreOf } from "../src/remote/identity-store.ts";
import { OperatorActors, OperatorMappingError, resolveOperatorsConfig, validateOperatorActors } from "../src/remote/operators.ts";
import { seedOperationalFixture } from "./support/operational-fixture.ts";
import { horizonDocument, PINNED_WORLD_REF, writeConfig } from "./support/config.ts";
import { SoftwareAuthenticator } from "./support/remote-authenticator.ts";

const MAPPED = "sea-actor-alice";
const SERVICE = "cognate-service";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";

interface Seen {
  readonly verb: string;
  readonly operation: string;
  readonly resource: string;
  readonly subject: string;
  readonly actor: unknown;
  readonly onBehalfOf: unknown;
}

/** A scripted SEA-Forge: records every request and answers with a well-formed decision for it. */
function scriptedWire(world: string) {
  const seen: Seen[] = [];
  let escalate = false;
  const send = async (request: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const envelope = request.envelope as { envelope_id: string; authority: { subject_actor_ref: string }[]; extensions: Record<string, Record<string, unknown>> };
    const profile = envelope.extensions["godspeed.authority_request"]!;
    seen.push({
      verb: String(request.verb),
      operation: String(profile.operation_name),
      resource: String(profile.resource_id),
      subject: envelope.authority[0]!.subject_actor_ref,
      actor: request.actor,
      onBehalfOf: request.on_behalf_of ?? null,
    });
    const commits = profile.operation_kind === "capability" && String(profile.resource_id).includes("navigation") && String(profile.resource_id).includes("commit");
    const decision = escalate && commits && profile.approval_id === undefined ? "escalate" : "allow";
    const operationId = String(profile.operation_id);
    return {
      ok: true,
      envelope: {
        envelope_id: `env-authority_decision-${operationId}`,
        envelope_kind: "authority_decision",
        scope: { world_ref: world },
        lineage_refs: [envelope.envelope_id],
        extensions: {
          "cep.profile": { profile_id: "godspeed.authority_decision", profile_version: "1.0.0" },
          "godspeed.authority_decision": {
            request_ref: envelope.envelope_id,
            operation_id: operationId,
            decision,
            decision_id: `dec-${operationId}`,
            ledger_entry: `ledger-${operationId}`,
            ...(decision === "escalate" ? { approval_id: `apr-${operationId}`, approval_expires_at: new Date(Date.now() + 600_000).toISOString() } : {}),
          },
        },
      },
    };
  };
  const inner: GovernanceAuthority = {
    async decide(operation, worldRef, approval) {
      const sent = buildAuthorityRequest(operation, worldRef, new Date(), approval);
      return interpretDecision(await send({ verb: "authority_request", envelope: sent.envelope, request_id: sent.operationId, actor: { actor_id: SERVICE, role: "service" } }), sent, worldRef, approval);
    },
  };
  return { seen, send, inner, escalateCommits: (on: boolean) => void (escalate = on) };
}

interface Rig {
  readonly app: HorizonApplication;
  readonly wire: ReturnType<typeof scriptedWire>;
  readonly base: () => string;
  readonly close: () => Promise<void>;
}

let savedPort: string | undefined;

async function rig(name: string): Promise<Rig> {
  savedPort = process.env.HORIZON_REMOTE_PORT;
  process.env.HORIZON_REMOTE_PORT = "0";
  const root = mkdtempSync(join(tmpdir(), `${name}-`));
  const world = loadWorld(PINNED_WORLD_REF).cognateWorldRef;
  const wire = scriptedWire(world);
  const configPath = await writeConfig(join(root, "horizon.toml"), horizonDocument({ storePath: join(root, "s.sqlite"), secretPath: join(root, "launch.secret") }));
  const app = await createApplication({
    configPath,
    governance: { mode: "sea-forge", authority: wire.inner, worldRef: world },
    approvals: approvalAuthority({ socketPath: join(root, "none.sock"), operatorId: "operator" }),
    realityTrace: null,
    operators: { desktop_operator: "operator", delegable_actors: [MAPPED, "operator"], actors: { operator: MAPPED } },
    delegationSend: wire.send,
  });
  await seedOperationalFixture(app.runtime.runtime.store, undefined, app.caller.tenant);
  await app.remote.start();
  return {
    app,
    wire,
    base: () => app.remote.origin,
    close: async () => {
      await app.remote.stop().catch(() => undefined);
      await app.close();
      if (savedPort === undefined) delete process.env.HORIZON_REMOTE_PORT;
      else process.env.HORIZON_REMOTE_PORT = savedPort;
    },
  };
}

class Phone {
  cookie = "";
  constructor(private readonly r: Rig) {}
  request(path: string, init: RequestInit = {}, headers: Record<string, string> = {}): Promise<Response> {
    const merged: Record<string, string> = { origin: this.r.base(), ...(init.headers as Record<string, string> | undefined), ...headers };
    if (this.cookie !== "") merged.cookie = this.cookie;
    return fetch(`${this.r.base()}${path}`, { redirect: "manual", ...init, headers: merged });
  }
  post(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
    return this.request(path, { method: "POST", body: JSON.stringify(body) }, { "content-type": "application/json", ...headers });
  }
  async pair(device: SoftwareAuthenticator): Promise<Response> {
    const link = this.r.app.remote.pairingLink();
    if (link === null) throw new Error("no pairing link");
    const secret = new URLSearchParams(link.split("#")[1] ?? "").get("p");
    const redeemed = await this.post("/m/api/pair/redeem", { secret });
    expect(redeemed.status).toBe(200);
    const { ticket, options } = (await redeemed.json()) as { ticket: string; options: { challenge: string; rp: { id: string } } };
    const credential = await device.register({ challenge: options.challenge, origin: this.r.base(), rpId: options.rp.id });
    const response = await this.post("/m/api/pair/finish", { ticket, credential }, { "user-agent": IPHONE_UA });
    const cookie = /__Host-hz_remote=[^;]+/.exec(response.headers.get("set-cookie") ?? "")?.[0];
    if (cookie !== undefined) this.cookie = cookie;
    return response;
  }
  async signIn(device: SoftwareAuthenticator): Promise<Response> {
    const first = await this.post("/m/api/auth/options", {});
    if (first.status !== 200) return first;
    const { ticket, options } = (await first.json()) as { ticket: string; options: { challenge: string; rpId: string } };
    const credential = await device.assert({ challenge: options.challenge, origin: this.r.base(), rpId: options.rpId });
    return this.post("/m/api/auth/finish", { ticket, credential });
  }
  async commit(extra: Record<string, unknown> = {}, headers: Record<string, string> = {}, commandId: string = randomUUID()): Promise<Response> {
    const state = (await (await this.request("/m/api/state")).json()) as { frame: { frame_id: string; revision: number }; actions: { action_id: string }[] };
    return this.commitWith(state, extra, headers, commandId);
  }
  commitWith(state: { frame: { frame_id: string; revision: number }; actions: { action_id: string }[] }, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}, commandId: string = randomUUID()): Promise<Response> {
    const action = state.actions.find((candidate) => candidate.action_id === "horizon-health");
    if (action === undefined) throw new Error("horizon-health is not offered");
    return this.post("/m/api/command", { command_id: commandId, kind: "commit", frame_id: state.frame.frame_id, frame_revision: state.frame.revision, action_id: action.action_id, ...extra }, headers);
  }
}

const intents = async (app: HorizonApplication) => (await readIntentRecords(app.runtime.runtime.store)).length;
const commitDecisions = (wire: ReturnType<typeof scriptedWire>) => wire.seen.filter((entry) => entry.operation === "invoke" && entry.resource.includes("commit") && entry.resource.includes("navigation"));

describe("an unpaired phone, forged actors, and the mapped actor", () => {
  let r: Rig;
  let phone: Phone;
  let device: SoftwareAuthenticator;
  beforeAll(async () => {
    r = await rig("sessions-a");
    phone = new Phone(r);
    device = await new SoftwareAuthenticator().generate();
  }, 60_000);
  afterAll(async () => void (await r?.close()));

  test("unpaired phone: no sign-in options, no session, no commit", async () => {
    const options = await phone.post("/m/api/auth/options", {});
    expect(options.status).toBe(404);
    expect(((await options.json()) as { code: string }).code).toBe("not_paired");
    const bare = await phone.commit.call(phone, {}).catch((error: unknown) => error);
    expect(bare).toBeInstanceOf(Error); // no session: the state read is refused, so no commit can even be formed
    const forgedToken = `idt1.${"A".repeat(43)}`;
    phone.cookie = `__Host-hz_remote=${forgedToken}`;
    const refused = await phone.post("/m/api/command", { command_id: randomUUID(), kind: "commit", frame_id: "f", frame_revision: 1, action_id: "horizon-health" });
    expect(refused.status).toBe(401);
    expect(((await refused.json()) as { code: string }).code).toBe("not_signed_in");
    phone.cookie = "";
    expect(await intents(r.app)).toBe(0);
    expect(r.wire.seen.length).toBe(0);
  });

  test("a pairing link enrols a passkey for the existing operator only: it creates no operator and grants no role", async () => {
    const response = await phone.pair(device);
    expect(response.status).toBe(200);
    const operators = (await identityStoreOf(r.app.runtime.runtime.store).listRecords("identity.operators", {})).map((row) => (row.value as { operatorId: string }).operatorId);
    expect(operators).toEqual(["operator"]);
    const devices = await r.app.identity.listDevices((await identityStoreOf(r.app.runtime.runtime.store).listRecords("identity.operators", {}))[0]!.value.tenant as string, "operator");
    expect(devices.length).toBe(1);
    expect(devices[0]!.operatorId).toBe("operator");
  });

  test("a forged actor in the body is refused, a forged header is ignored, and the mapped actor is the one SEA-Forge hears", async () => {
    for (const field of ["actor", "actor_id", "on_behalf_of", "operator", "role"]) {
      const response = await phone.commit({ [field]: "mallory" });
      expect(response.status).toBe(400);
      expect(((await response.json()) as { code: string }).code).toBe("forbidden_field");
    }
    expect(await intents(r.app)).toBe(0);
    expect(commitDecisions(r.wire).length).toBe(0);

    const accepted = await phone.commit({}, { "x-actor": "mallory", "x-on-behalf-of": "mallory", "x-operator": "mallory", "x-forwarded-user": "mallory" });
    expect(accepted.status).toBe(200);
    expect(await intents(r.app)).toBe(1);
    const delegated = r.wire.seen.filter((entry) => entry.onBehalfOf !== null);
    expect(delegated.length).toBeGreaterThan(0);
    for (const entry of delegated) {
      expect(entry.onBehalfOf).toEqual({ actor_id: MAPPED, role: "operator" });
      expect(entry.actor).toEqual({ actor_id: SERVICE, role: "service" });
    }
    expect(commitDecisions(r.wire).every((entry) => (entry.onBehalfOf as { actor_id: string } | null)?.actor_id === MAPPED)).toBe(true);
    expect(JSON.stringify(r.wire.seen)).not.toContain("mallory");
    // The Caller of the commit is the durable operator, not the server operator.
    const attempt = (await readIntentAttempts(r.app.runtime.runtime.store)).at(-1);
    expect(attempt?.caller_ref).toBe("operator");
    expect(attempt?.caller_ref).not.toBe(r.app.caller.actor.id);
  });

  test("a revoked session cannot read or commit", async () => {
    const before = await intents(r.app);
    const seen = r.wire.seen.length;
    const state = (await (await phone.request("/m/api/state")).json()) as { frame: { frame_id: string; revision: number }; actions: { action_id: string }[] };
    const token = phone.cookie.split("=")[1]!;
    const resolved = await r.app.identity.resolveSession(token);
    expect(resolved).toBeDefined();
    await r.app.identity.revokeSession(resolved!.session.sid, "test revocation");
    const refused = await phone.commitWith(state);
    expect(refused.status).toBe(401);
    expect(((await refused.json()) as { code: string }).code).toBe("not_signed_in");
    expect((await phone.request("/m/api/state")).status).toBe(401);
    expect(await intents(r.app)).toBe(before);
    expect(r.wire.seen.length).toBe(seen);
    // The token is stored only as a hash.
    const rows = await identityStoreOf(r.app.runtime.runtime.store).listRecords(SESSIONS, {});
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  test("a revoked device cannot authenticate", async () => {
    const tenant = (await identityStoreOf(r.app.runtime.runtime.store).listRecords("identity.operators", {}))[0]!.value.tenant as string;
    const [active] = (await r.app.identity.listDevices(tenant, "operator")).filter((candidate) => candidate.revokedAt === null);
    await r.app.identity.revokeDevice(active!.id, "lost phone");
    const response = await phone.signIn(device);
    expect(response.status).toBe(401);
    expect(((await response.json()) as { message: string }).message).toContain("revoked");
    expect((await phone.request("/m/api/state")).status).toBe(401);
  });

  test("replacing the device revokes the old one and its session; the old passkey is refused", async () => {
    await r.app.remote.refresh();
    const second = await new SoftwareAuthenticator().generate();
    const oldCookie = phone.cookie;
    expect((await phone.pair(second)).status).toBe(200);
    const replacement = phone.cookie;
    expect(replacement).not.toBe(oldCookie);
    const tenant = (await identityStoreOf(r.app.runtime.runtime.store).listRecords("identity.operators", {}))[0]!.value.tenant as string;
    const devices = await r.app.identity.listDevices(tenant, "operator");
    expect(devices.filter((candidate) => candidate.revokedAt === null).length).toBe(1);
    expect(devices.length).toBeGreaterThanOrEqual(2);
    phone.cookie = oldCookie;
    expect((await phone.request("/m/api/state")).status).toBe(401);
    phone.cookie = "";
    expect((await phone.signIn(device)).status).toBe(401);
    phone.cookie = replacement;
    expect((await phone.request("/m/api/state")).status).toBe(200);
  });

  test("an expired session cannot commit", async () => {
    const before = await intents(r.app);
    const state = (await (await phone.request("/m/api/state")).json()) as { frame: { frame_id: string; revision: number }; actions: { action_id: string }[] };
    const store = identityStoreOf(r.app.runtime.runtime.store);
    const resolved = await r.app.identity.resolveSession(phone.cookie.split("=")[1]!);
    const row = await store.getRecord(SESSIONS, resolved!.session.sid);
    await store.commit({ appends: [], records: [{ collection: SESSIONS, id: row!.id, expectedVersion: row!.version, value: { ...row!.value, expiresAt: new Date(Date.now() - 1000).toISOString() } }] });
    const refused = await phone.commitWith(state);
    expect(refused.status).toBe(401);
    expect(await intents(r.app)).toBe(before);
  });
});

describe("double submission and concurrent commits write one commit", () => {
  let r: Rig;
  let phone: Phone;
  beforeAll(async () => {
    r = await rig("sessions-b");
    phone = new Phone(r);
    expect((await phone.pair(await new SoftwareAuthenticator().generate())).status).toBe(200);
  }, 60_000);
  afterAll(async () => void (await r?.close()));

  test("the same command id submitted twice at once is one commit and one answer", async () => {
    const state = (await (await phone.request("/m/api/state")).json()) as { frame: { frame_id: string; revision: number }; actions: { action_id: string }[] };
    const id = randomUUID();
    const [first, second] = await Promise.all([phone.commitWith(state, {}, {}, id), phone.commitWith(state, {}, {}, id)]);
    expect(first.status).toBe(200);
    expect(await second.text()).toBe(await first.text());
    expect(await intents(r.app)).toBe(1);
    expect(commitDecisions(r.wire).length).toBe(1);
  });

  test("two different commands on one frame, sent together, commit once: the second finds the surface moved", async () => {
    const before = await intents(r.app);
    const state = (await (await phone.request("/m/api/state")).json()) as { frame: { frame_id: string; revision: number }; actions: { action_id: string }[] };
    const [one, two] = await Promise.all([phone.commitWith(state), phone.commitWith(state)]);
    const statuses = [one.status, two.status].sort();
    expect(statuses).toEqual([200, 409]);
    const refused = (await (one.status === 409 ? one : two).json()) as { outcome: { code: string } };
    expect(refused.outcome.code).toBe("stale_surface");
    expect(await intents(r.app)).toBe(before + 1);
  });
});

describe("an operator's own escalation", () => {
  let r: Rig;
  let phone: Phone;
  beforeAll(async () => {
    r = await rig("sessions-c");
    phone = new Phone(r);
    expect((await phone.pair(await new SoftwareAuthenticator().generate())).status).toBe(200);
  }, 60_000);
  afterAll(async () => void (await r?.close()));

  test("the requester cannot approve their own escalation: refused before SEA-Forge is asked, and nothing commits", async () => {
    r.wire.escalateCommits(true);
    const waiting = await phone.commit();
    expect(waiting.status).toBe(200);
    const body = (await waiting.json()) as { outcome: { state: string; intent_id: string } };
    expect(body.outcome.state).toBe("waiting");
    const state = (await (await phone.request("/m/api/state")).json()) as { decisions: { approval_id: string }[] };
    const approvalId = state.decisions[0]?.approval_id;
    expect(approvalId).toMatch(/^apr-/);
    expect(await intents(r.app)).toBe(0);
    const approve = await phone.post("/m/api/command", { command_id: randomUUID(), kind: "approve", approval_id: approvalId });
    expect(approve.status).toBe(409);
    const refusal = (await approve.json()) as { outcome: { code: string; message: string } };
    expect(refusal.outcome.code).toBe("own_escalation");
    expect(await intents(r.app)).toBe(0);
    expect(r.wire.seen.some((entry) => entry.verb === "authority_approval")).toBe(false);
  });
});

describe("an operator with no mapping, and the gateway identity", () => {
  let r: Rig;
  beforeAll(async () => {
    r = await rig("sessions-d");
  }, 60_000);
  afterAll(async () => void (await r?.close()));

  test("an unconfigured operator cannot commit, and nothing is written or sent", async () => {
    await r.app.identity.registerOperator({ tenant: "unused", operatorId: "ghost" });
    const ghost = { tenant: r.app.caller.tenant, actor: { id: "ghost", kind: "user" as const } };
    const refusal = await r.app.commitForSession("horizon-health", randomUUID(), ghost);
    expect(refusal).toMatchObject({ ok: false, code: "no_actor_mapping" });
    expect((refusal as { message: string }).message).toContain("no SEA-Forge actor is configured");
    expect(await intents(r.app)).toBe(0);
    expect((await readIntentAttempts(r.app.runtime.runtime.store)).length).toBe(0);
    expect(r.wire.seen.length).toBe(0);
  });

  test("the authority itself refuses an unmapped session operator and never falls back to the server operator", async () => {
    const sent: unknown[] = [];
    let called = 0;
    const authority = delegatingAuthority(
      { decide: async () => ((called += 1), { disposition: "allow" as const, reason: "inner" }) },
      { service: { actor_id: SERVICE, role: "service" }, actors: () => new OperatorActors(new Map([["operator", MAPPED]]), "operator"), serverPrincipalId: "os:server:1", send: async (request) => (sent.push(request), {}) },
    );
    const decision = await authority.decide({ kind: "action", action: "thread.state.read" as never, caller: { tenant: "t", actor: { id: "ghost", kind: "user" } }, resource: "r" }, "world:x");
    expect(decision.disposition).toBe("unknown");
    expect(decision.reason).toContain("no SEA-Forge actor");
    expect(sent).toEqual([]);
    expect(called).toBe(0);
  });

  test("the gateway service identity cannot be used as the operator", async () => {
    const service = { tenant: r.app.caller.tenant, actor: { id: SERVICE, kind: "user" as const } };
    expect(await r.app.commitForSession("horizon-health", randomUUID(), service)).toMatchObject({ ok: false, code: "no_actor_mapping" });
    // The server operator's own Caller is not a session either.
    expect(await r.app.commitForSession("horizon-health", randomUUID(), r.app.caller)).toMatchObject({ ok: false, code: "no_actor_mapping" });
    expect(await intents(r.app)).toBe(0);
    // And the mapping refuses it at startup, as the operator or as the target actor.
    const identity = createIdentityService(createMemoryStore());
    await identity.registerOperator({ tenant: "t1", operatorId: SERVICE });
    await identity.registerOperator({ tenant: "t1", operatorId: "operator" });
    const context = { identity, tenant: "t1", serviceActorId: SERVICE };
    await expect(validateOperatorActors(resolveOperatorsConfig({ desktop_operator: SERVICE, delegable_actors: [SERVICE], actors: { [SERVICE]: SERVICE } }), context)).rejects.toThrow(OperatorMappingError);
    await expect(validateOperatorActors(resolveOperatorsConfig({ desktop_operator: "operator", delegable_actors: [SERVICE], actors: { operator: SERVICE } }), context)).rejects.toThrow("gateway service identity");
  });

  test("startup validation: the operator must exist and be active, and the actor must be a delegation target", async () => {
    const identity = createIdentityService(createMemoryStore());
    const context = { identity, tenant: "t1", serviceActorId: SERVICE };
    const config = resolveOperatorsConfig({ desktop_operator: "operator", delegable_actors: ["a"], actors: { operator: "a" } });
    await expect(validateOperatorActors(config, context)).rejects.toThrow("not provisioned");
    await identity.registerOperator({ tenant: "t1", operatorId: "operator" });
    await expect(validateOperatorActors(resolveOperatorsConfig({ desktop_operator: "operator", delegable_actors: ["b"], actors: { operator: "a" } }), context)).rejects.toThrow("delegation target");
    await identity.revokeAll("t1", "operator", "suspended", "suspended");
    await expect(validateOperatorActors(config, context)).rejects.toThrow("not active");
  });
});

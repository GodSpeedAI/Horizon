/**
 * Durable operator sessions and the mapped SEA-Forge actor, through the real phone routes.
 *
 * Every test here is a refusal: the request is refused with a clear error and nothing is committed.
 * SEA-Forge is a scripted wire (the `delegationClient` seam) that records what Horizon sends, so the
 * actor the gateway presents on behalf of the human is observable. The wire is not an authority
 * claim: live containment of the OS-isolated gateway is a separate deployment gate.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createMemoryStore } from "@godspeedai/cognate-store-memory";
import { buildAuthorityRequest, interpretDecision, type GovernanceAuthority, type SeaForgeAuthority } from "@godspeedai/cognate-runtime-bun";
import { createIdentityService, DEVICES, OPERATORS, SESSIONS } from "@godspeed/identity";
import { createApplication, type HorizonApplication } from "../src/app.ts";
import { approvalAuthority } from "../src/adapters/sea-forge-config.ts";
import { delegatingAuthority } from "../src/adapters/delegating-authority.ts";
import { loadWorld } from "../src/adapters/semantic.ts";
import { readIntentAttempts, readIntentRecords } from "../src/capabilities/navigation-intent.ts";
import { CASE_COLLECTION, latestCase } from "../src/capabilities/workspace-records.ts";
import { identityStoreOf } from "../src/remote/identity-store.ts";
import { OperatorActors, OperatorMappingError, resolveOperatorsConfig, validateOperatorActors } from "../src/remote/operators.ts";
import { seedOperationalFixture } from "./support/operational-fixture.ts";
import { horizonDocument, PINNED_WORLD_REF, writeConfig } from "./support/config.ts";
import { SoftwareAuthenticator } from "./support/remote-authenticator.ts";
import { TestOperatorChannel } from "./support/operator-channel.ts";

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
  /** The typed gateway client's `decide`: records the call's arguments and returns the scripted decision. */
  const client: Pick<SeaForgeAuthority, "decide"> = {
    async decide(operation, worldRef, approval, _carry, delegation) {
      const sent = buildAuthorityRequest(operation, worldRef, new Date(), approval);
      const request = { verb: "authority_request", envelope: sent.envelope, request_id: sent.operationId, actor: { actor_id: SERVICE, role: "service" }, ...(delegation ? { on_behalf_of: { actor_id: delegation.onBehalfOf.actor_id, role: delegation.onBehalfOf.role } } : {}) };
      return interpretDecision(await send(request), sent, worldRef, approval);
    },
  };
  return { seen, send, client, inner, escalateCommits: (on: boolean) => void (escalate = on) };
}

interface Rig {
  readonly app: HorizonApplication;
  readonly wire: ReturnType<typeof scriptedWire>;
  readonly base: () => string;
  readonly channel: TestOperatorChannel;
  readonly close: () => Promise<void>;
}

let savedPort: string | undefined;

async function rig(name: string): Promise<Rig> {
  savedPort = process.env.HORIZON_REMOTE_PORT;
  process.env.HORIZON_REMOTE_PORT = "0";
  const root = mkdtempSync(join(tmpdir(), `${name}-`));
  const world = loadWorld(PINNED_WORLD_REF).cognateWorldRef;
  const wire = scriptedWire(world);
  const channel = new TestOperatorChannel();
  const configPath = await writeConfig(join(root, "horizon.toml"), horizonDocument({ storePath: join(root, "s.sqlite"), secretPath: join(root, "launch.secret") }));
  const app = await createApplication({
    configPath,
    governance: { mode: "sea-forge", authority: wire.inner, worldRef: world },
    approvals: approvalAuthority({ socketPath: join(root, "none.sock"), operatorId: "actor:operator" }),
    realityTrace: null,
    operators: { desktop_operator: "operator", delegable_actors: [MAPPED, "operator"], actors: { operator: MAPPED } },
    delegationClient: wire.client,
    unpublishedAuthorityForTests: true,
    operatorChannel: channel,
  });
  await seedOperationalFixture(app.runtime.runtime.store, undefined, app.caller.tenant);
  await app.remote.start();
  return {
    app,
    wire,
    base: () => app.remote.origin,
    channel,
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
    const finished = await this.post("/m/api/pair/finish", { ticket, credential }, { "user-agent": IPHONE_UA });
    // The enrolment waits for the operator: type the code the desk showed on its terminal, then retry.
    const response = finished.status === 202 ? await this.authorize(finished) : finished;
    const cookie = /__Host-hz_remote=[^;]+/.exec(response.headers.get("set-cookie") ?? "")?.[0];
    if (cookie !== undefined) this.cookie = cookie;
    return response;
  }
  async authorize(waiting: Response): Promise<Response> {
    const { pending_id: pendingId } = (await waiting.json()) as { pending_id: string };
    await this.r.channel.type(this.r.channel.codeFor(pendingId));
    return this.post("/m/api/pair/await", { pending_id: pendingId });
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
    const operators = (await identityStoreOf(r.app.runtime.runtime.store).listRecords(OPERATORS, {})).map((row) => (row.value as { operatorId: string }).operatorId);
    expect(operators).toEqual(["operator"]);
    const devices = await r.app.identity.listDevices((await identityStoreOf(r.app.runtime.runtime.store).listRecords(OPERATORS, {}))[0]!.value.tenant as string, "operator");
    expect(devices.length).toBe(1);
    expect(devices[0]!.operatorId).toBe("operator");
  });

  test("a forged actor in the body is refused, a forged header is ignored, and a device is never turned into the operator", async () => {
    for (const field of ["actor", "actor_id", "on_behalf_of", "operator", "role"]) {
      const response = await phone.commit({ [field]: "mallory" });
      expect(response.status).toBe(400);
      expect(((await response.json()) as { code: string }).code).toBe("forbidden_field");
    }
    expect(await intents(r.app)).toBe(0);
    expect(commitDecisions(r.wire).length).toBe(0);

    // A header cannot name the person either. The commit itself is refused at this freeze: a
    // device credential proves which device is at the route, never which person is holding it,
    // and there is no device-attributed delegation from the operator, so the commit is not run
    // under a borrowed identity (R5-03). SEA-Forge hears nothing, and no intent is recorded.
    const refused = await phone.commit({}, { "x-actor": "mallory", "x-on-behalf-of": "mallory", "x-operator": "mallory", "x-forwarded-user": "mallory" });
    expect(refused.status).toBe(403);
    const outcome = (await refused.json()) as { accepted: boolean; outcome: { state: string; code: string; message: string } };
    expect(outcome.accepted).toBe(false);
    expect(outcome.outcome).toMatchObject({ state: "refused", code: "refused" });
    expect(outcome.outcome.message).toContain("refused at this release");
    expect(outcome.outcome.message).toContain("delegation");
    expect(await intents(r.app)).toBe(0);
    expect(commitDecisions(r.wire).length).toBe(0);
    expect(JSON.stringify(r.wire.seen)).not.toContain("mallory");

    // What the device *can* do is its own row: opening a case records the device as the caller
    // and the operator its enrolment belongs to beside it, as attribution rather than a
    // substitution. The two are separate fields, and neither is the server operator.
    const identityTenant = (await identityStoreOf(r.app.runtime.runtime.store).listRecords(OPERATORS, {}))[0]!.value.tenant as string;
    const devices = await r.app.identity.listDevices(identityTenant, "operator");
    const deviceId = devices[0]!.id;
    const opened = await phone.post("/m/api/command", { command_id: randomUUID(), kind: "open_case", purpose: "From the phone, as the phone" });
    expect(opened.status).toBe(200);
    const openedCase = await latestCase(r.app.runtime.runtime.store, r.app.caller.tenant);
    expect(openedCase?.purpose).toBe("From the phone, as the phone");
    expect(openedCase?.operator).toBe(`device:${deviceId}`);
    expect(openedCase?.attributed_operator).toBe("operator");
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
    const tenant = (await identityStoreOf(r.app.runtime.runtime.store).listRecords(OPERATORS, {}))[0]!.value.tenant as string;
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
    const tenant = (await identityStoreOf(r.app.runtime.runtime.store).listRecords(OPERATORS, {}))[0]!.value.tenant as string;
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

  test("the same command id submitted twice at once is one command and one answer", async () => {
    // The case command is the device row that runs at this freeze; the same command id answered
    // twice is one command, not two cases.
    const countCases = async (): Promise<number> => (await r.app.runtime.runtime.store.listRecords(CASE_COLLECTION, { tenant: r.app.caller.tenant })).length;
    const before = await countCases();
    const id = randomUUID();
    const body = { command_id: id, kind: "open_case", purpose: "Sent twice at once" };
    const [first, second] = await Promise.all([phone.post("/m/api/command", body), phone.post("/m/api/command", body)]);
    expect(first.status).toBe(200);
    expect(await second.text()).toBe(await first.text());
    expect(await countCases()).toBe(before + 1);
  });

  test("two different commits on one frame are both refused, and neither commits", async () => {
    const before = await intents(r.app);
    const state = (await (await phone.request("/m/api/state")).json()) as { frame: { frame_id: string; revision: number }; actions: { action_id: string }[] };
    const [one, two] = await Promise.all([phone.commitWith(state), phone.commitWith(state)]);
    expect([one.status, two.status]).toEqual([403, 403]);
    expect(await intents(r.app)).toBe(before);
    expect(commitDecisions(r.wire).length).toBe(0);
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

  test("the phone cannot answer an escalation: refused before SEA-Forge is asked, and nothing commits", async () => {
    // The phone cannot even raise the escalation at this freeze: its commit is refused before any
    // intent exists, so the approval it would answer never appears. The approval commands are
    // refused for their own reason, before SEA-Forge is asked on either side (R3-01, R5-03).
    r.wire.escalateCommits(true);
    const waiting = await phone.commit();
    expect(waiting.status).toBe(403);
    expect(await intents(r.app)).toBe(0);
    const approvalId = "apr-unreachable";
    // Containment (R3-01): the remote path has no operation-bound pending record and no
    // protected confirmation, so the phone's approval command is refused outright rather than
    // downgraded to something its own session can do.
    const approve = await phone.post("/m/api/command", { command_id: randomUUID(), kind: "approve", approval_id: approvalId });
    expect(approve.status).toBe(403);
    const refusal = (await approve.json()) as { outcome: { code: string; message: string } };
    expect(refusal.outcome.code).toBe("no_protected_confirmation_path");
    expect(refusal.outcome.message).toContain("desktop");
    expect(await intents(r.app)).toBe(0);
    expect(r.wire.seen.some((entry) => entry.verb === "authority_approval")).toBe(false);
    // A rejection is refused the same way: the phone never reaches the authority on either side.
    const reject = await phone.post("/m/api/command", { command_id: randomUUID(), kind: "reject", approval_id: approvalId });
    expect(reject.status).toBe(403);
    expect(((await reject.json()) as { outcome: { code: string } }).outcome.code).toBe("no_protected_confirmation_path");
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
      { service: { actor_id: SERVICE, role: "service" }, actors: () => new OperatorActors(new Map([["operator", MAPPED]]), "operator"), serverPrincipalId: "os:server:1", client: { decide: async (...args) => (sent.push(args), { disposition: "allow" as const, reason: "client" }) } },
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

  test("the identity store receives the three hyphenated collection names", async () => {
    const seen = new Set<string>();
    const memory = createMemoryStore();
    const spy = new Proxy(memory, {
      get(target, property) {
        if (property === "commit") {
          return (input: Parameters<typeof memory.commit>[0]) => {
            for (const record of input.records ?? []) seen.add(record.collection);
            return target.commit(input);
          };
        }
        if (property === "getRecord" || property === "listRecords") {
          return (collection: string, ...rest: unknown[]) => {
            seen.add(collection);
            return (target[property] as (...args: unknown[]) => unknown)(collection, ...rest);
          };
        }
        return Reflect.get(target, property, target) as unknown;
      },
    });
    expect([OPERATORS, SESSIONS, DEVICES]).toEqual(["identity-operators", "identity-sessions", "identity-devices"]);
    const store = identityStoreOf(spy);
    await createIdentityService(store).registerOperator({ tenant: "t1", operatorId: "operator" });
    await store.listRecords(SESSIONS, {});
    await store.listRecords(DEVICES, {});
    expect([...seen].sort()).toEqual(["identity-devices", "identity-operators", "identity-sessions"]);
    expect([...seen].some((name) => name.includes("."))).toBe(false);
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

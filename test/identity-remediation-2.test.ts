import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createApplication, OPEN_READS, type HorizonApplication } from "../src/app.ts";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { readIntentAttempts } from "../src/capabilities/navigation-intent.ts";
import { AUDIT_COLLECTION } from "../src/capabilities/remote-records.ts";
import {
  classifyReference,
  loadOperationManifest,
  resolveDispatchedOperation,
} from "../src/contracts/identity/manifest.ts";
import { loadParamSchemas } from "../src/contracts/identity/params.ts";
import { loadRecordsContract, validateRecord } from "../src/contracts/identity/records.ts";
import { checkDesignContractConsistency } from "../scripts/check-design-contract-consistency.ts";
import { checkDispatchCoverage } from "../scripts/check-dispatch-coverage.ts";
import { checkDelegationRegister } from "../scripts/check-delegation-register.ts";
import { checkParamSchemaBinding } from "../scripts/check-param-schema-binding.ts";
import { seedOperationalFixture } from "./support/operational-fixture.ts";
import { horizonDocument, writeConfig } from "./support/config.ts";
import { SoftwareAuthenticator } from "./support/remote-authenticator.ts";
import "./support/write-token.ts";

/**
 * The third independent review's findings, closed with executable checks (T23, Stage 0A).
 *
 * The round-3 reviewer read a frozen copy of the contract set and returned REJECT: six blocking
 * findings and four must-fix findings. Each correction below is a claim the frozen bytes have to
 * support, and each test reads the contract rather than a fixture that restates it. The teeth are
 * the point: where a check can be made to fail by a small mutation of the contract, the mutation
 * is made in a throwaway tree and the check is required to notice.
 *
 * The preregistration that registers these expectations is
 * `.agents/prereg/horizon/STAGE-0A-REMEDIATION-2.prereg.yaml`; its ids never appear in the
 * earlier identity test files, so each file's coverage check owns exactly its own expectations.
 */
const ROOT = new URL("..", import.meta.url).pathname;
const manifest = loadOperationManifest();
const records = loadRecordsContract();
const schemas = loadParamSchemas();
const design = readFileSync(join(ROOT, "design_draft.md"), "utf8");

interface FixtureCase {
  readonly id: string;
  readonly kind: string;
  readonly expect: string;
  readonly violations: readonly string[];
  readonly record: Record<string, unknown>;
  readonly context?: Record<string, unknown>;
  readonly catalog?: Record<string, unknown>;
}

const fixtures = JSON.parse(
  readFileSync(join(ROOT, "contracts/identity/v1/fixtures/record-cases.json"), "utf8"),
) as { cases: FixtureCase[] };
const byId = new Map(fixtures.cases.map((entry) => [entry.id, entry]));

/** A throwaway copy of the files a check reads, so a mutation cannot touch the frozen tree. */
function throwawayCopy(files: readonly string[]): string {
  const root = mkdtempSync(join(tmpdir(), "identity-remediation-2-"));
  for (const file of files) {
    const target = join(root, file);
    mkdirSync(join(target, ".."), { recursive: true });
    cpSync(join(ROOT, file), target);
  }
  return root;
}

/** Rewrite one file in a throwaway tree, in place. */
function patch(root: string, file: string, from: string, to: string): void {
  const target = join(root, file);
  const source = readFileSync(target, "utf8");
  if (!source.includes(from)) throw new Error(`the mutation target is not in ${file}: ${from}`);
  writeFileSync(target, source.replace(from, to));
}

describe("the round-3 review's corrections", () => {
  test("the live remote router is catalogued and its approval path is structurally absent (PE-24)", () => {
    // Every route the phone's server performs has a row in the catalog.
    for (const route of [
      "GET /m/health",
      "GET /m/api/state",
      "GET /m/api/events",
      "POST /m/api/pair/redeem",
      "POST /m/api/auth/options",
      "POST /m/api/auth/finish",
      "POST /m/api/signout",
      "POST /m/api/pair/finish",
      "POST /m/api/command",
    ]) {
      const rows = manifest.routes.get(route) ?? [];
      expect(rows.length, route).toBeGreaterThan(0);
      for (const row of rows) expect(row.binding, route).toBe("verified");
    }
    // The command route is a dispatcher keyed by the command kind, and the settlement command
    // selects between the two settlement rows by phase.
    const command = manifest.dispatch.get("POST /m/api/command")!;
    expect(command.action_field).toBe("kind");
    expect(command.resolved_field).toBe("phase");
    expect(Object.keys(command.actions).sort()).toEqual(["approve", "commit", "open_case", "reject"]);
    expect((command.combinations ?? []).map((entry) => `${entry.resolved}:${entry.action}`).sort()).toEqual([
      "observe:settle",
      "rule:settle",
    ]);
    // The device enrollment is the pairing-finish row, not a catalogued gap.
    expect(manifest.byId.get("device.pair")?.routes).toEqual(["POST /m/api/pair/finish"]);
    expect(manifest.manifest.catalog_gaps).toEqual([]);
    // The phone's server holds no approval resolver at all: the path is absent, not gated.
    const source = readFileSync(join(ROOT, "src/remote/server.ts"), "utf8");
    expect(source).not.toMatch(/resolveApproval|approvalIntent|resolveNavigationApproval|approvalInbox/);
    expect(source).toContain("no_protected_confirmation_path");
  });

  test("the desk's decision route resolves its operation from the card, not from the body (PE-25)", () => {
    const desk = manifest.dispatch.get("POST /desk/decide")!;
    expect(desk.action_field).toBe("choice");
    expect(desk.resolved_field).toBe("card_kind");
    const pair = new Map((desk.combinations ?? []).map((entry) => [`${entry.resolved}:${entry.action}`, entry.operation]));
    expect(pair.get("escalation:accept")).toBe("approval.approve");
    expect(pair.get("escalation:reject")).toBe("approval.reject");
    expect(pair.get("lesson:accept")).toBe("lesson.decide");
    expect(pair.get("case_task:accept")).toBe("case.task.decide");
    expect(pair.get("human_step:accept")).toBe("case.task.complete");
    expect(pair.get("acceptance_observe:accept")).toBe("horizon.settlement.observe");
    expect(pair.get("acceptance_rule:accept")).toBe("horizon.settlement.rule");
    // Each pair selects a row with its own class and its own parameter schema.
    expect(manifest.byId.get("approval.approve")?.class).toBe("P3");
    expect(manifest.byId.get("lesson.decide")?.class).toBe("P2");
    expect(manifest.byId.get("approval.approve")?.paramsSchema).toBe("params.approval");
    expect(manifest.byId.get("lesson.decide")?.paramsSchema).toBe("params.lesson_decide");
    // The route carries no class of its own, so no card can be downgraded by taking a weaker path.
    expect(manifest.byId.get("POST /desk/decide")).toBeUndefined();
    // The live server resolves the pair from the card it fetched.
    const source = readFileSync(join(ROOT, "src/app.ts"), "utf8");
    expect(source).toContain(
      'resolveDispatchedOperation(identityCatalogOf(), "POST /desk/decide", choice, deskCardKind(card))',
    );
  });

  test("a deployment-bound operation is refused on the plain intent path with its own reason (PE-26)", () => {
    const bound = classifyReference(manifest, "deployment.custom.write", new Set(["deployment.custom.write"]));
    expect(bound.class).toBe("deployment");
    expect(bound.allowed).toBe(false);
    expect(bound.reason).toBe("deployment_bound_operation_needs_its_own_path");
    // The catalog says why, in its own words.
    const block = manifest.manifest.deployment_operations!;
    expect(block.minimum_class).toBe("P2");
    expect(block.refusal_rule).toContain("never carried by the plain intent path");
    // Both live refusal sites carry the reason: the request boundary and the last gate before a
    // capability runs.
    const source = readFileSync(join(ROOT, "src/app.ts"), "utf8");
    expect((source.match(/deployment_bound_operation_needs_its_own_path/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("a pending record names exactly one caller channel (PE-27)", () => {
    expect(records.constraints["caller_channel_exclusive"]?.applies_to).toContain("PendingOperation");
    const local = byId.get("PENDING-LOCAL-OK")!;
    const agent = byId.get("PENDING-AGENT-GOVERNED-OK")!;
    // The happy paths: one channel each.
    expect(validateRecord(records, "PendingOperation", local.record, local.catalog as never)).toEqual([]);
    expect(validateRecord(records, "PendingOperation", agent.record, agent.catalog as never)).toEqual([]);
    // A human that names an execution as well as a session names two channels.
    const twoHuman = { ...local.record, execution_ref: "exec:exec-0001" };
    expect(validateRecord(records, "PendingOperation", twoHuman, local.catalog as never)).toContain(
      "constraint:caller_channel_exclusive",
    );
    // An agent that names a session as well as an execution names two channels.
    const twoAgent = { ...agent.record, session_ref: "session:session-0001" };
    expect(validateRecord(records, "PendingOperation", twoAgent, agent.catalog as never)).toContain(
      "constraint:caller_channel_exclusive",
    );
    // A console that names a session names a channel it has no credential for.
    const console = { ...local.record, caller_kind: "local_console", requester_ref: "console:local", session_ref: "session:session-0001" };
    expect(validateRecord(records, "PendingOperation", console, local.catalog as never)).toContain(
      "constraint:caller_channel_exclusive",
    );
    // A human with no session at all has no channel anybody can check.
    const noSession = { ...local.record, session_ref: null };
    expect(validateRecord(records, "PendingOperation", noSession, local.catalog as never)).toContain(
      "constraint:caller_channel_exclusive",
    );
  });

  test("a parameter that names a delegation is registered, and the register says what it means (PE-28)", () => {
    const register = records.delegation_reference_parameters!;
    // The vocabulary decides which parameters are delegation references at all.
    expect(register.delegation_reference_fields).toEqual(["grant_ref", "parent_ref"]);
    expect(register.notes?.sponsor_ref).toContain("Not a delegation reference");
    const entry = (schema: string, field: string) =>
      register.entries.find((candidate) => candidate.schema === schema && candidate.field === field);
    expect(entry("params.grant_revoke", "grant_ref")?.per_caller_kind.human_session).toBe("target");
    expect(entry("params.grant_revoke", "grant_ref")?.per_caller_kind.agent_execution).toBe("target");
    expect(entry("params.run_start", "grant_ref")?.per_caller_kind.agent_execution).toBe("authority");
    expect(entry("params.run_start", "grant_ref")?.per_caller_kind.human_session).toBe("forbidden");
    expect(entry("params.run_start", "grant_ref")?.per_caller_kind.local_console).toBe("forbidden");
    expect(entry("params.grant_redelegate", "parent_ref")?.per_caller_kind.agent_execution).toBe("authority");
    // The grant a revocation revokes is a target, so a human may name it.
    const revoke = byId.get("OD-HUMAN-GRANT-REVOKE-OK")!;
    expect(validateRecord(records, revoke.kind, revoke.record, revoke.catalog as never)).toEqual([]);
    // The grant an agent spends is its own authority, so the record must hold that same one.
    const agentGrant = byId.get("OD-AGENT-RUN-START-GRANT-OK")!;
    expect(validateRecord(records, agentGrant.kind, agentGrant.record, agentGrant.catalog as never)).toEqual([]);
    const mismatch = byId.get("OD-AGENT-RUN-START-GRANT-MISMATCH")!;
    expect(validateRecord(records, mismatch.kind, mismatch.record, mismatch.catalog as never)).toEqual([
      "constraint:delegation_reference_kind",
    ]);
    // A console may never be the authority for a delegation. The console record is also refused
    // for carrying parameters the schema does not declare for a console caller: a caller kind
    // the schema never described must not inherit another caller's wire contract (R4-06).
    const console = byId.get("OD-CONSOLE-RUN-START-GRANT")!;
    expect(validateRecord(records, console.kind, console.record, console.catalog as never)).toContain(
      "constraint:delegation_reference_kind",
    );
    // The build check sees that every delegation reference the schemas declare is registered.
    expect(checkDelegationRegister(ROOT).failures).toEqual([]);
  });

  test("the parameter contracts and the generated design table agree with the handlers (PE-29)", () => {
    expect(checkParamSchemaBinding(ROOT).failures).toEqual([]);
    expect(checkDesignContractConsistency(ROOT).failures).toEqual([]);
    // The design's table carries nested optionality and nullability, not only the top level.
    expect(design).toContain("`surface:{id:string, title:string?, step:string|null?, blocks:[json]}`");
    // Arrays are arrays, and optionality and nullability are separate facts.
    const publish = schemas["params.agent_surface_publish"]!;
    const surface = publish.fields?.find((field) => field.name === "surface");
    const blocks = surface?.object_fields?.find((field) => field.name === "blocks");
    expect(blocks?.type).toBe("array");
    const title = surface?.object_fields?.find((field) => field.name === "title");
    expect(title?.optional).toBe(true);
    expect(title?.nullable).toBeUndefined();
    const step = surface?.object_fields?.find((field) => field.name === "step");
    expect(step?.nullable).toBe(true);
    expect(step?.optional).toBe(true);
    // A question's options are a list that may be absent and is never null.
    const ask = schemas["params.agent_question_ask"]!;
    const options = ask.fields?.find((field) => field.name === "ask")?.object_fields?.find((field) => field.name === "options");
    expect(options?.type).toBe("array");
    expect(options?.optional).toBe(true);
    expect(options?.nullable).toBeUndefined();
  });

  test("the evidence record carries two separate outcomes (PE-30)", () => {
    const evidence = records.records.EvidenceRecord!;
    const observation = evidence.fields.find((field) => field.name === "observation_outcome");
    const effect = evidence.fields.find((field) => field.name === "effect_outcome");
    expect(observation?.enum).toEqual(["observed", "failed", "refused"]);
    expect(effect?.enum).toEqual(["none", "uncertain", "committed"]);
    // The old single field is gone: one field cannot carry two meanings.
    expect(evidence.fields.find((field) => field.name === "outcome")).toBeUndefined();
    // The record's own nullability says the two are separate facts.
    expect(evidence.nullability).toContain("observation_outcome");
    expect(evidence.nullability).toContain("effect_outcome");
  });

  test("the entitlement path fails closed while the owner has published nothing (PE-31)", () => {
    const external = JSON.parse(
      readFileSync(join(ROOT, "contracts/identity/v1/external-interfaces.json"), "utf8"),
    ) as {
      interfaces: {
        interface_id: string;
        publication_status: string;
        required_facts: { fact: string; binds: string | null }[];
        subject_binding?: Record<string, string>;
        failure_rule: string;
      }[];
    };
    const entitlement = external.interfaces.find((entry) => entry.interface_id === "sea_forge.human_entitlement")!;
    expect(entitlement.publication_status).toBe("specified_not_published");
    const facts = entitlement.required_facts.map((fact) => fact.fact);
    for (const fact of [
      "subject_ref",
      "issuer_ref",
      "issuer_key_id",
      "signature",
      "operation_digest",
      "resource_refs",
      "amount",
      "authority_epoch",
      "expires_at",
      "revocation_state",
    ]) {
      expect(facts, fact).toContain(fact);
    }
    // Every subject fact binds to a field the record kind actually has.
    expect(entitlement.subject_binding).toEqual({ AuthorityDecision: "approver_ref", EffectFence: "caller_ref" });
    for (const kind of Object.keys(entitlement.subject_binding!)) {
      const field = entitlement.subject_binding![kind];
      expect(records.records[kind]?.fields.some((candidate) => candidate.name === field), `${kind}.${field}`).toBe(true);
    }
    // Every entitlement-backed fixture is refused, whatever facts it is handed.
    for (const entry of fixtures.cases) {
      if (entry.context?.entitlement === undefined) continue;
      expect(validateRecord(records, entry.kind, entry.record, undefined, entry.context as never), entry.id).toEqual([
        "constraint:entitlement_is_external",
      ]);
    }
  });

  test("the pending record's replay and terminal-state rules are complete (PE-32)", () => {
    expect(records.constraints["nonce_not_reused"]?.applies_to).toContain("PendingOperation");
    expect(records.constraints["supersedes_chain"]?.applies_to).toContain("PendingOperation");
    // The expiry rule belongs to the transition that carries the expiry. The descriptor is
    // immutable and holds no state, so the transition is where an expiry is recorded (R4-05).
    expect(records.constraints["pending_expired_carries_no_confirmation"]?.applies_to).toContain("PendingTransition");
    const local = byId.get("PENDING-LOCAL-OK")!;
    // A nonce that was already used is refused.
    const replayed = validateRecord(records, "PendingOperation", local.record, local.catalog as never, {
      previous_nonces: [local.record.nonce as string],
    });
    expect(replayed).toContain("constraint:nonce_not_reused");
    // A supersession chain that does not match is refused.
    const superseded = validateRecord(
      records,
      "PendingOperation",
      { ...local.record, supersedes_ref: "pending-0000" },
      local.catalog as never,
      { previous_ref: "pending-0001" },
    );
    expect(superseded).toContain("constraint:supersedes_chain");
    // An expired pending operation carries no confirmation evidence: the expiry is an appended
    // transition, and it carries none.
    const expired = byId.get("PENDING-TRANSITION-EXPIRED-OK")!;
    expect(validateRecord(records, "PendingTransition", expired.record, expired.catalog as never)).toEqual([]);
    const expiredWith = byId.get("PENDING-TRANSITION-EXPIRED-WITH-CONFIRMATION")!;
    expect(validateRecord(records, "PendingTransition", expiredWith.record, expiredWith.catalog as never)).toEqual([
      "constraint:pending_expired_carries_no_confirmation",
    ]);
  });

  test("the liveness probe and the diagnostics read are two operations (PE-33)", () => {
    const health = manifest.byId.get("horizon.health")!;
    const diagnostics = manifest.byId.get("horizon.diagnostics.read")!;
    expect(health.routes).toEqual(["GET /health"]);
    expect(diagnostics.routes).toEqual(["GET /diagnostics"]);
    expect(health.executor).toBe("anonymous_connection");
    expect(diagnostics.executor).not.toBe("anonymous_connection");
    expect(health.paramsSchema).toBe("params.horizon_health");
    expect(diagnostics.paramsSchema).toBe("params.horizon_diagnostics_read");
    // The probe is open; the diagnostics read is not.
    expect(OPEN_READS.has("/health")).toBe(true);
    expect(OPEN_READS.has("/diagnostics")).toBe(false);
  });
});

describe("the round-3 review's refusals", () => {
  let app: DeskApp;
  beforeAll(async () => {
    app = await startDeskApp();
  });
  afterAll(async () => {
    await app?.stop();
  });

  test("a deployment-bound operation never runs on the plain intent path (NE-24)", async () => {
    const bound = classifyReference(manifest, "deployment.custom.write", new Set(["deployment.custom.write"]));
    expect(bound.allowed).toBe(false);
    expect(bound.reason).toBe("deployment_bound_operation_needs_its_own_path");
    // The live app refuses it before any capability runs and before any record is appended.
    const root = mkdtempSync(join(tmpdir(), "identity-remediation-2-bound-"));
    const document = {
      ...horizonDocument({ storePath: join(root, "d.sqlite"), secretPath: join(root, "launch.secret") }),
      records: { sources: [{ name: "personal", kind: "personal" }] },
      ui: { timezone: "UTC" },
      operations: [
        {
          operation_ref: "deployment.custom.write",
          label: "A deployment-bound operation",
          reversibility: "read_only",
          payment: [],
          verifier_paths: {},
        },
      ],
    };
    const configPath = await writeConfig(join(root, "horizon.toml"), document);
    const saved = { agentKey: process.env.HORIZON_AGENT_KEY_FILE, secret: process.env.HORIZON_SECRET_FILE };
    process.env.HORIZON_AGENT_KEY_FILE = join(root, "agent.key");
    process.env.HORIZON_SECRET_FILE = join(root, "launch.secret");
    let application: HorizonApplication | null = null;
    try {
      application = await createApplication({ configPath, deskRoot: join(root, "desk") });
      await application.migrated;
      const server = application.startServer(0);
      const base = `http://${server.hostname}:${server.port}`;
      const store = application.runtime.runtime.store;
      const before = (await readIntentAttempts(store)).length;
      const response = await fetch(`${base}/intent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation_ref: "deployment.custom.write" }),
      });
      expect(response.status).toBe(412);
      const body = (await response.json()) as { code?: string; message?: string };
      expect(body.code).toBe("failed_precondition");
      expect(body.message).toContain("bound by this deployment");
      // Nothing was attempted: no capability was invoked and no record was appended.
      expect((await readIntentAttempts(store)).length).toBe(before);
      await server.stop(true);
    } finally {
      await application?.close();
      if (saved.agentKey === undefined) delete process.env.HORIZON_AGENT_KEY_FILE;
      else process.env.HORIZON_AGENT_KEY_FILE = saved.agentKey;
      if (saved.secret === undefined) delete process.env.HORIZON_SECRET_FILE;
      else process.env.HORIZON_SECRET_FILE = saved.secret;
    }
  });

  test("the desk's decision route never downgrades a P3 approval to a P2 row (NE-23)", () => {
    // The honest catalog agrees with itself: every row that claims a dispatched route is
    // reachable through that route's dispatch table.
    expect(checkDispatchCoverage(ROOT).failures).toEqual([]);
    const desk = manifest.dispatch.get("POST /desk/decide")!;
    const pair = (resolved: string, action: string) =>
      (desk.combinations ?? []).find((entry) => entry.resolved === resolved && entry.action === action)?.operation;
    expect(pair("escalation", "accept")).toBe("approval.approve");
    expect(manifest.byId.get(pair("escalation", "accept")!)?.class).toBe("P3");
    // A pair the catalog does not list resolves to nothing, so it is Px before any effect runs.
    expect(resolveDispatchedOperation(manifest, "POST /desk/decide", "accept", "unknown_card")).toBeNull();
    expect(resolveDispatchedOperation(manifest, "POST /desk/decide", "shrug", "escalation")).toBeNull();
    // The teeth: a catalog that maps the escalation pair to the lesson row fails the check.
    const root = throwawayCopy(["contracts/identity/v1/operations.yaml"]);
    patch(
      root,
      "contracts/identity/v1/operations.yaml",
      "- { resolved: escalation, action: accept, operation: approval.approve }",
      "- { resolved: escalation, action: accept, operation: lesson.decide }",
    );
    const drifted = checkDispatchCoverage(root);
    expect(drifted.ok).toBe(false);
    expect(drifted.failures.join("\n")).toContain("approval.approve");
  });

  test("a pending record that names two caller channels is refused (NE-25)", () => {
    const local = byId.get("PENDING-LOCAL-OK")!;
    const agent = byId.get("PENDING-AGENT-GOVERNED-OK")!;
    const cases: { label: string; record: Record<string, unknown>; catalog: Record<string, unknown> }[] = [
      {
        label: "a human with a session and an execution",
        record: { ...local.record, execution_ref: "exec:exec-0001" },
        catalog: local.catalog!,
      },
      {
        label: "an agent with an execution and a session",
        record: { ...agent.record, session_ref: "session:session-0001" },
        catalog: agent.catalog!,
      },
      {
        label: "a console with a session",
        record: { ...local.record, caller_kind: "local_console", requester_ref: "console:local", session_ref: "session:session-0001" },
        catalog: local.catalog!,
      },
      {
        label: "a console with an execution",
        record: { ...local.record, caller_kind: "local_console", requester_ref: "console:local", execution_ref: "exec:exec-0001" },
        catalog: local.catalog!,
      },
      {
        label: "a human with no session",
        record: { ...local.record, session_ref: null },
        catalog: local.catalog!,
      },
    ];
    for (const entry of cases) {
      expect(
        validateRecord(records, "PendingOperation", entry.record, entry.catalog as never),
        entry.label,
      ).toContain("constraint:caller_channel_exclusive");
    }
  });

  test("a delegation reference the register does not cover is never treated as harmless (NE-26)", () => {
    // The honest register covers every delegation reference the schemas declare.
    expect(checkDelegationRegister(ROOT).failures).toEqual([]);
    // A schema that declares a delegation reference the register does not cover is caught by the
    // build check: the vocabulary is what makes the rule see the field at all.
    const root = throwawayCopy(["contracts/identity/v1/params.yaml", "contracts/identity/v1/records.json"]);
    patch(
      root,
      "contracts/identity/v1/params.yaml",
      "  params.horizon_note_save:\n    fields:\n      - { name: body, type: string }",
      "  params.horizon_note_save:\n    fields:\n      - { name: body, type: string }\n      - { name: grant_ref, type: string }",
    );
    const drifted = checkDelegationRegister(root);
    expect(drifted.ok).toBe(false);
    expect(drifted.failures.join("\n")).toContain("params.horizon_note_save.grant_ref");
    // And the rule refuses it: an unlisted (schema, field) pair is forbidden to every caller kind.
    const mutatedSchemas = loadParamSchemas(join(root, "contracts/identity/v1/params.yaml"));
    const catalog = {
      operation_id: "horizon.note.save",
      class: "P1",
      params_schema: "params.horizon_note_save",
      params_schema_spec: mutatedSchemas["params.horizon_note_save"]!,
    };
    const agent = byId.get("OD-AGENT-P1-NO-DELEGATION-OK")!;
    const agentRecord = {
      ...agent.record,
      parameters: { ...(agent.record.parameters as Record<string, unknown>), grant_ref: "grant-0009" },
    };
    expect(validateRecord(records, "OperationDescriptor", agentRecord, catalog as never)).toContain(
      "constraint:delegation_reference_kind",
    );
    const human = byId.get("OD-HUMAN-OK")!;
    const humanRecord = {
      ...human.record,
      parameters: { ...(human.record.parameters as Record<string, unknown>), grant_ref: "grant-0009" },
    };
    expect(validateRecord(records, "OperationDescriptor", humanRecord, catalog as never)).toContain(
      "constraint:human_has_no_grant",
    );
    // Without the vocabulary the rule does not see the field at all: the teeth that show the
    // vocabulary is what makes the difference rather than the schema.
    const bare = throwawayCopy(["contracts/identity/v1/records.json"]);
    const recordsPath = join(bare, "contracts/identity/v1/records.json");
    const mutated = JSON.parse(readFileSync(recordsPath, "utf8")) as {
      delegation_reference_parameters: { delegation_reference_fields?: string[] };
    };
    delete mutated.delegation_reference_parameters.delegation_reference_fields;
    writeFileSync(recordsPath, JSON.stringify(mutated, null, 2));
    const withoutVocabulary = loadRecordsContract(recordsPath);
    expect(validateRecord(withoutVocabulary, "OperationDescriptor", agentRecord, catalog as never)).not.toContain(
      "constraint:delegation_reference_kind",
    );
    expect(validateRecord(withoutVocabulary, "OperationDescriptor", humanRecord, catalog as never)).not.toContain(
      "constraint:human_has_no_grant",
    );
  });

  test("the evidence record never carries one outcome meaning two things (NE-27)", () => {
    const evidence = records.records.EvidenceRecord!;
    expect(evidence.fields.find((field) => field.name === "outcome")).toBeUndefined();
    // A record that carries the old single field is refused for carrying a field the contract
    // does not declare.
    const bad = byId.get("EVIDENCE-BAD-OUTCOME")!;
    expect(validateRecord(records, "EvidenceRecord", { ...bad.record, outcome: "observed" })).toContain(
      "unknown:outcome",
    );
    // The two outcomes are separate fields with separate enums, and a record may carry both.
    const clean = { ...bad.record, observation_outcome: "observed", effect_outcome: "committed" };
    expect(validateRecord(records, "EvidenceRecord", clean)).toEqual([]);
    // An observation that succeeded while the effect is still uncertain is a real state, not a
    // contradiction.
    const uncertain = { ...clean, effect_outcome: "uncertain" };
    expect(validateRecord(records, "EvidenceRecord", uncertain)).toEqual([]);
  });

  test("an entitlement nobody published is never accepted (NE-28)", () => {
    const unpublished = byId.get("DECISION-HUMAN-ENTITLEMENT-UNPUBLISHED")!;
    // The facts beside the record look complete — issuer, key identifier and signature included —
    // and the record is still refused, because an artifact nobody has published cannot be
    // authenticated.
    const facts = unpublished.context!.entitlement as Record<string, unknown>;
    expect(facts.issuer_key_id).toBeDefined();
    expect(facts.signature).toBeDefined();
    expect(facts.subject_ref).toBeDefined();
    expect(validateRecord(records, unpublished.kind, unpublished.record, undefined, unpublished.context as never)).toEqual([
      "constraint:entitlement_is_external",
    ]);
    // The path never falls back to a grant, a session or a policy decision.
    const withGrant = { ...unpublished.record, grant_ref: "grant:grant-0001" };
    expect(validateRecord(records, unpublished.kind, withGrant, undefined, unpublished.context as never)).not.toEqual([]);
    // A record that names an entitlement and is handed none is refused as well.
    const none = byId.get("DECISION-ENTITLEMENT-NOT-SUPPLIED")!;
    expect(validateRecord(records, none.kind, none.record, undefined, none.context as never)).toEqual([
      "constraint:entitlement_is_external",
    ]);
    // The teeth: the publication status is the gate, and the rule reads it.
    const source = readFileSync(join(ROOT, "src/contracts/identity/records.ts"), "utf8");
    expect(source).toContain('publication_status !== "published"');
  });

  test("the liveness probe never becomes a second way in to the deployment (NE-29)", async () => {
    // A paired caller receives exactly the same body as an unpaired one.
    const paired = await fetch(`${app.base}/health`);
    expect(paired.status).toBe(200);
    const pairedBody = (await paired.json()) as Record<string, unknown>;
    expect(pairedBody).toEqual({ ok: true });
    const unpaired = await fetch(`${app.base}/health`, { headers: { "x-test-no-session": "1" } });
    expect(unpaired.status).toBe(200);
    expect((await unpaired.json()) as Record<string, unknown>).toEqual({ ok: true });
    // The deployment is nowhere in either body.
    for (const key of ["status", "profile", "operator_ref", "world", "research", "transports", "version"]) {
      expect(pairedBody, key).not.toHaveProperty(key);
    }
    // The diagnostics read is the paired route that carries it, and an unpaired caller is refused
    // with nothing of the deployment in the refusal.
    const diagnostics = await fetch(`${app.base}/diagnostics`);
    expect(diagnostics.status).toBe(200);
    expect((await diagnostics.json()) as Record<string, unknown>).toHaveProperty("operator_ref");
    const refused = await fetch(`${app.base}/diagnostics`, { headers: { "x-test-no-session": "1" } });
    expect(refused.status).toBe(401);
    expect(await refused.text()).not.toContain("operator_ref");
  });

  test("a pending record is never replayed and an expired one never carries a confirmation (NE-30)", () => {
    const local = byId.get("PENDING-LOCAL-OK")!;
    // The nonce rule applies to the pending record, so a replay is refused.
    expect(
      validateRecord(records, "PendingOperation", local.record, local.catalog as never, {
        previous_nonces: [local.record.nonce as string],
      }),
    ).toContain("constraint:nonce_not_reused");
    // The supersession rule applies to it too.
    expect(
      validateRecord(
        records,
        "PendingOperation",
        { ...local.record, supersedes_ref: "pending-0000" },
        local.catalog as never,
        { previous_ref: "pending-0001" },
      ),
    ).toContain("constraint:supersedes_chain");
    // An expired pending operation that still carries confirmation evidence is refused. The
    // expiry is an appended transition, and it carries none (R4-05).
    const expiredWith = byId.get("PENDING-TRANSITION-EXPIRED-WITH-CONFIRMATION")!;
    expect(validateRecord(records, "PendingTransition", expiredWith.record, expiredWith.catalog as never)).toEqual([
      "constraint:pending_expired_carries_no_confirmation",
    ]);
    // And the rule refuses a confirmation the caller supplied rather than a confirmed window.
    const supplied = byId.get("PENDING-CALLER-SUPPLIED-CONFIRMATION")!;
    expect(validateRecord(records, "PendingOperation", supplied.record, supplied.catalog as never)).toContain(
      "constraint:pending_confirmation_not_caller_supplied",
    );
  });
});

describe("the phone's approval path", () => {
  let application: HorizonApplication;
  let cockpit: ReturnType<HorizonApplication["startServer"]>;
  let cockpitBase = "";
  let phoneBase = "";
  let cookie = "";
  let savedPort: string | undefined;
  const IPHONE_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

  function phoneRequest(path: string, init: RequestInit & { readonly headers?: Record<string, string> } = {}): Promise<Response> {
    const headers: Record<string, string> = { origin: phoneBase, ...((init.headers as Record<string, string> | undefined) ?? {}) };
    if (cookie !== "") headers.cookie = cookie;
    return fetch(`${phoneBase}${path}`, { redirect: "manual", ...init, headers });
  }

  function phonePost(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
    return phoneRequest(path, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", ...headers },
    });
  }

  beforeAll(async () => {
    savedPort = process.env.HORIZON_REMOTE_PORT;
    process.env.HORIZON_REMOTE_PORT = "0";
    const root = mkdtempSync(join(tmpdir(), "identity-remediation-2-remote-"));
    const configPath = await writeConfig(
      join(root, "horizon.toml"),
      horizonDocument({ storePath: join(root, "remote.sqlite"), secretPath: join(root, "launch.secret") }),
    );
    application = await createApplication({ configPath });
    await seedOperationalFixture(application.runtime.runtime.store, undefined, application.caller.tenant);
    cockpit = application.startServer(0);
    cockpitBase = `http://127.0.0.1:${cockpit.port}`;
    await fetch(`${cockpitBase}/workspace/remote/start`, { method: "POST", redirect: "manual" });
    phoneBase = application.remote.origin;
    const link = application.remote.pairingLink();
    if (link === null) throw new Error("the remote holds no pairing link after the start");
    const secret = new URLSearchParams(link.split("#")[1] ?? "").get("p") ?? "";
    const redeemed = await phonePost("/m/api/pair/redeem", { secret });
    if (redeemed.status !== 200) throw new Error(`the pairing secret was refused: ${redeemed.status}`);
    const { ticket, options } = (await redeemed.json()) as {
      ticket: string;
      options: { challenge: string; rp: { id: string } };
    };
    const authenticator = await new SoftwareAuthenticator().generate();
    const credential = await authenticator.register({ challenge: options.challenge, origin: phoneBase, rpId: options.rp.id });
    const finished = await phonePost("/m/api/pair/finish", { ticket, credential }, { "user-agent": IPHONE_UA });
    if (finished.status !== 200) throw new Error(`the device enrollment was refused: ${finished.status}`);
    const match = /__Host-hz_remote=[^;]+/.exec(finished.headers.get("set-cookie") ?? "");
    if (match === null) throw new Error("the phone session carries no cookie");
    cookie = match[0];
  }, 60_000);

  afterAll(async () => {
    await application?.remote.stop().catch(() => undefined);
    await cockpit?.stop(true);
    await application?.close();
    if (savedPort === undefined) delete process.env.HORIZON_REMOTE_PORT;
    else process.env.HORIZON_REMOTE_PORT = savedPort;
  });

  test("the phone can never answer an escalation (NE-22)", async () => {
    const approve = await phonePost("/m/api/command", {
      command_id: randomUUID(),
      kind: "approve",
      approval_id: "apr-0001",
    });
    expect(approve.status).toBe(403);
    const body = (await approve.json()) as { outcome?: { code?: string; state?: string } };
    expect(body.outcome?.state).toBe("refused");
    expect(body.outcome?.code).toBe("no_protected_confirmation_path");
    const reject = await phonePost("/m/api/command", {
      command_id: randomUUID(),
      kind: "reject",
      approval_id: "apr-0001",
    });
    expect(reject.status).toBe(403);
    expect(((await reject.json()) as { outcome?: { code?: string } }).outcome?.code).toBe(
      "no_protected_confirmation_path",
    );
    // The refusal is audited, so the attempt is visible rather than silent.
    const rows = await application.runtime.runtime.store.listRecords(AUDIT_COLLECTION, {
      tenant: application.caller.tenant,
    });
    const outcomes = rows.map((row) => (row.value as { outcome?: string }).outcome);
    expect(outcomes).toContain("refused:no_protected_confirmation_path");
    // The phone's server holds no approval resolver at all: the path is absent, not gated.
    const source = readFileSync(join(ROOT, "src/remote/server.ts"), "utf8");
    expect(source).not.toMatch(/resolveApproval|approvalIntent|resolveNavigationApproval|approvalInbox/);
  });
});


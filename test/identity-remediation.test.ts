import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startDeskApp, type DeskApp } from "./support/desk-app.ts";
import { readIntentAttempts } from "../src/capabilities/navigation-intent.ts";
import {
  classifyReference,
  loadOperationManifest,
  type LoadedManifest,
} from "../src/contracts/identity/manifest.ts";
import { loadParamSchemas, validateParameters } from "../src/contracts/identity/params.ts";
import { loadRecordsContract, validateRecord } from "../src/contracts/identity/records.ts";
import { loadA3Mechanism } from "../src/contracts/identity/issuer.ts";
import { checkDesignContractConsistency } from "../scripts/check-design-contract-consistency.ts";
import { checkParamSchemaBinding } from "../scripts/check-param-schema-binding.ts";
import { renderParameterTable } from "../scripts/gen-design-parameter-table.ts";

/**
 * The second independent review's findings, closed with executable checks (T23, Stage 0A).
 *
 * The round-2 reviewer read a frozen copy of the contract set and returned REJECT: five blocking
 * findings, seven must-fix findings and four advisories. Each correction below is a claim the
 * frozen bytes have to support, and each test reads the contract rather than a fixture that
 * restates it. The teeth are the point: where a check can be made to fail by a small mutation of
 * the contract, the mutation is made in a throwaway tree and the check is required to notice.
 *
 * The preregistration that registers these expectations is
 * `.agents/prereg/horizon/STAGE-0A-REMEDIATION.prereg.yaml`; its ids never appear in the earlier
 * identity test files, so each file's coverage check owns exactly its own expectations.
 */
const ROOT = new URL("..", import.meta.url).pathname;
const manifest = loadOperationManifest();
const records = loadRecordsContract();
const mechanism = loadA3Mechanism();
const schemas = loadParamSchemas();
const design = readFileSync(join(ROOT, "design_draft.md"), "utf8");

/** A throwaway copy of the files a check reads, so a mutation cannot touch the frozen tree. */
function throwawayCopy(files: readonly string[]): string {
  const root = mkdtempSync(join(tmpdir(), "identity-remediation-"));
  for (const file of files) {
    const target = join(root, file);
    mkdirSync(join(target, ".."), { recursive: true });
    cpSync(join(ROOT, file), target);
  }
  return root;
}

const BINDING_FILES = [
  "contracts/identity/v1/operations.yaml",
  "contracts/identity/v1/params.yaml",
  "src/app.ts",
  "src/remote/server.ts",
  "src/ui/desk/panels-model.ts",
  "src/domain/note.ts",
] as const;

const CONSISTENCY_FILES = [
  "design_draft.md",
  "contracts/identity/v1/a3-mechanism.yaml",
  "contracts/identity/v1/external-interfaces.json",
  "contracts/identity/v1/issuer-profile.yaml",
  "contracts/identity/v1/operations.yaml",
  "contracts/identity/v1/params.yaml",
  "contracts/identity/v1/platform-claims.yaml",
  "contracts/identity/v1/policy.yaml",
  "contracts/identity/v1/records.json",
] as const;

/** The design's section that names the operations Stage 0B can actually run. */
function stage0bSection(): string {
  const start = design.indexOf("### 12. Migration and vertical slice");
  expect(start).toBeGreaterThan(-1);
  const end = design.indexOf("### 13.", start);
  return design.slice(start, end === -1 ? design.length : end);
}

describe("the round-2 review's corrections", () => {
  test("the assurance vocabulary is two predicates with the terminal claim beside them (PE-17)", () => {
    const receipt = records.records["A3Receipt"]!;
    const predicate = receipt.fields.find((field) => field.name === "assurance_predicate");
    expect(predicate?.enum).toEqual(["A3-UV", "A3-T"]);
    // Terminal presence is a claim on the receipt, beside the predicate, and never a predicate.
    const presence = receipt.fields.find((field) => field.name === "protected_terminal_presence");
    expect(presence?.type).toBe("boolean");
    expect(presence?.enum).toBeUndefined();
    const requirementIds = mechanism.assurance_requirements.map((entry) => entry.id);
    expect(requirementIds).not.toContain("protected_terminal_presence");
    expect(requirementIds.filter((id) => id.startsWith("A3"))).toEqual(["A3-UV", "A3-T"]);
    // The A0-or-A1 disjunction is in the data, as an explicit disjunction.
    const disjunction = mechanism.assurance_requirements.find((entry) => entry.id === "A0_OR_A1");
    expect(disjunction?.any_of).toEqual(["A0", "A1"]);
    expect(disjunction?.requires).toBeUndefined();
  });

  test("the pending record carries the descriptor's own anti-substitution rules (PE-18)", () => {
    // The rules are listed in the contract's own `applies_to`, so a consumer that follows the
    // frozen contract applies them to the pending record and not only to the descriptor.
    for (const rule of [
      "human_has_no_grant",
      "human_has_no_credential",
      "agent_needs_execution",
      "console_has_no_execution",
      "governed_agent_needs_delegation",
      "parameters_match_schema",
    ]) {
      expect(records.constraints[rule]?.applies_to, rule).toContain("PendingOperation");
    }
    // And the live validator refuses a pending record that carries a grant it may not hold.
    // The record below is written here, not read from a fixture, so the check does not depend on
    // the cross-language examples agreeing with it.
    const pending: Record<string, unknown> = {
      schema_version: "horizon.identity.record/1",
      tenant_ref: "tenant:horizon",
      trust_domain_ref: "td:local:horizon",
      issued_at: "2026-11-09T12:00:00Z",
      issuer_ref: "issuer:horizon-local",
      pending_id: "pending-0001",
      operation_id: "human.answer",
      caller_kind: "human_session",
      requester_ref: "operator:sprime01",
      params_schema_ref: "params.human_answer",
      parameters: {
        panel: "panel-0001",
        ask: "ask-0001",
        outcome: "answered",
        value: "yes",
        version: "0123456789abcd",
        owner_rev: 7,
      },
      nonce: "bm9uY2UtMDAwMDAwMDAwMDAx",
      operation_digest: `sha256:${"ab".repeat(32)}`,
      resource_refs: ["panel:panel-0001"],
      expected_revision: "7",
      world_ref: "world:horizon",
      case_ref: "case:case-0001",
      frame_ref: "frame:frame-0001",
      case_authority: "local",
      policy_digest: `sha256:${"cd".repeat(32)}`,
      execution_ref: null,
      delegation_ref: null,
      session_ref: "session:session-0001",
      created_at: "2026-11-09T12:00:00Z",
      expires_at: "2026-11-09T12:10:00Z",
      confirmation_digest: "Y29uZmlybWF0aW9uLWNvZGUwMDAx",
      launch_generation: "launch-0001",
      // The descriptor carries no state: a pending operation's state lives in the appended
      // transition records, so the descriptor stays immutable (R4-05).
      effect_class: "db_local",
      effect_idempotency_key: null,
      supersedes_ref: null,
      signature: "c2lnbmF0dXJlLWNvbnRyYWN0LXBsYWNlaG9sZGVy",
    };
    const catalog = {
      operation_id: "human.answer",
      class: "P2",
      params_schema: "params.human_answer",
      authority_writer: "cognate_local_continuation",
    };
    const clean = validateRecord(records, "PendingOperation", pending, catalog, { case_authority: "local" });
    expect(clean).toEqual([]);
    // A human session's pending record carries no grant, no credential and no execution. A
    // pending record names exactly one caller channel, so a record that names two is refused by
    // the channel rule as well as by the rule about the channel it should not have named.
    const smuggled = validateRecord(
      records,
      "PendingOperation",
      { ...pending, delegation_ref: "grant:grant-0001" },
      catalog,
      { case_authority: "local" },
    );
    expect(smuggled).toEqual(["constraint:caller_channel_exclusive", "constraint:human_has_no_grant"]);
    const credential = validateRecord(
      records,
      "PendingOperation",
      { ...pending, execution_ref: "execution:execution-0001" },
      catalog,
      { case_authority: "local" },
    );
    expect(credential).toEqual(["constraint:caller_channel_exclusive", "constraint:human_has_no_credential"]);
  });

  test("the intent boundary classifies every operation reference before anything runs (PE-19)", () => {
    const none = new Set<string>();
    // A catalogued local row keeps its own class.
    const local = classifyReference(manifest, "horizon.note.save", none);
    expect(local.class).toBe("P1");
    expect(local.allowed).toBe(true);
    expect(local.reason).toBe("catalogued_local_operation");
    // A governed row never travels the plain intent path.
    const governed = classifyReference(manifest, "human.answer", none);
    expect(governed.class).toBe("P2");
    expect(governed.allowed).toBe(false);
    expect(governed.reason).toBe("governed_operation_needs_confirmation");
    // A deployment-bound operation keeps its own binding contract, and it never travels the plain
    // intent path: that path carries no pending record, no confirmation and no authority writer,
    // so it cannot honour the binding's authority, evidence or expiry (R3-03).
    const bound = classifyReference(manifest, "deployment.custom.write", new Set(["deployment.custom.write"]));
    expect(bound.class).toBe("deployment");
    expect(bound.allowed).toBe(false);
    expect(bound.reason).toBe("deployment_bound_operation_needs_its_own_path");
    // The catalog says a deployment-bound operation is never a local write.
    expect(manifest.manifest.deployment_operations?.minimum_class).toBe("P2");
    expect(manifest.manifest.deployment_operations?.refusal_rule).toContain("never carried by the plain intent path");
  });

  test("every live-bound P0/P1 row names its own schema and the design table is generated (PE-20)", () => {
    const classDefaults = manifest.manifest.class_defaults;
    const verified = [...manifest.byId.values()].filter((operation) => operation.binding === "verified");
    expect(verified.length).toBeGreaterThanOrEqual(37);
    for (const operation of verified) {
      if (operation.class !== "P0" && operation.class !== "P1") continue;
      const fallback = operation.class === "P0" ? classDefaults.P0?.params_schema : classDefaults.P1?.params_schema;
      expect(operation.paramsSchema, operation.id).not.toBe(fallback);
      expect(operation.paramsSchema, operation.id).not.toBeNull();
    }
    // The binding check agrees with the handlers on every row it names.
    const binding = checkParamSchemaBinding(ROOT);
    expect(binding.failures).toEqual([]);
    expect(binding.checked).toBeGreaterThanOrEqual(37);
    // The design's parameter table is the generated one, byte for byte.
    const begin = "<!-- BEGIN GENERATED: parameter-table -->";
    const end = "<!-- END GENERATED: parameter-table -->";
    const start = design.indexOf(begin);
    const stop = design.indexOf(end);
    expect(start).toBeGreaterThan(-1);
    expect(design.slice(start + begin.length, stop).trim()).toBe(renderParameterTable(ROOT));
  });

  test("the catalog's evidence and aliases resolve against the contracts they name (PE-21)", () => {
    const requirementIds = new Set(mechanism.assurance_requirements.map((entry) => entry.id));
    for (const operation of manifest.byId.values()) {
      if (operation.humanEvidence === null) continue;
      expect(requirementIds.has(operation.humanEvidence), operation.id).toBe(true);
    }
    // The approval aliases fix their choice as data, and the export row declares its
    // separation of duty.
    expect(manifest.byId.get("approval.approve")?.fixedParameters).toEqual({ choice: "accept" });
    expect(manifest.byId.get("approval.reject")?.fixedParameters).toEqual({ choice: "reject" });
    const approval = schemas["params.approval"]!;
    const choice = approval.fields?.find((field) => field.name === "choice");
    expect(choice?.enum).toEqual(["accept", "reject"]);
    expect(manifest.byId.get("workspace.export")?.class).toBe("P3");
    const exportRow = manifest.manifest.operations.P3?.find((row) => row.id === "workspace.export");
    expect(exportRow?.separation_of_duty).toBe(true);
    // The pairing row's caller path is the code holder: a one-time code proves possession of the
    // code and nothing about a person, so the row states that no assurance predicate applies
    // rather than inheriting the class's terminal one (R5-07).
    expect(manifest.byId.get("device.pair")?.executor).toBe("code_holder");
    expect(manifest.byId.get("device.pair")?.humanEvidence).toBeNull();
    expect(manifest.byId.get("device.recover")?.humanEvidence).toBe("RECOVERY_CODE_PRESENCE_FRESH_PASSKEY");
    expect(manifest.byId.get("trust.rotate")?.humanEvidence).toBe("ADMIN_PRESENCE_INDEPENDENT_ADMIN");
    for (const id of ["device.pair", "device.recover", "trust.rotate"]) {
      expect(manifest.byId.get(id)?.humanEvidence, id).not.toBe("A3-T");
    }
    expect(manifest.byId.get("session.pair")?.executor).toBe("code_holder");
    expect(manifest.byId.get("session.pair")?.callerAuthentication).toBe("one_time_pairing_code");
  });

  test("the record contract registers nine signed records and the design is pinned (PE-22)", () => {
    const signed = Object.entries(records.records).filter(([, spec]) => spec.signed).map(([kind]) => kind);
    const unsigned = Object.entries(records.records).filter(([, spec]) => !spec.signed).map(([kind]) => kind);
    // The count was nine when this preregistration was recorded. The fourth review's first
    // blocking finding was that a signed pending record had no coherent way to change state, and
    // the correction added the tenth: the append-only transition record that carries the state
    // (R4-05). The expectation is the same one — every signed record the contract declares is
    // registered, and the design names each of them.
    expect(signed).toHaveLength(10);
    expect(unsigned).toEqual(["Refusal"]);
    expect(signed).toContain("PendingOperation");
    expect(signed).toContain("PendingTransition");
    // The design's record table names every kind the contract declares.
    const appendix = design.slice(design.indexOf("## Appendix A"));
    for (const kind of Object.keys(records.records)) {
      expect(appendix, kind).toContain(`| \`${kind}\` |`);
    }
    // This preregistration pins the design the third review reads, and the pin is the file's hash.
    // The design moves on as the findings are closed, so the pin is checked against the frozen
    // copy it belongs to: a verdict binds the bytes it read, and the bytes it read are kept.
    const prereg = Bun.YAML.parse(
      readFileSync(join(ROOT, ".agents/prereg/horizon/STAGE-0A-REMEDIATION.prereg.yaml"), "utf8"),
    ) as { preregistration: { upstream_pins: { design: { sha256: string } } } };
    const pinned = prereg.preregistration.upstream_pins.design.sha256;
    const frozen = createHash("sha256")
      .update(readFileSync(join(ROOT, ".agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/design_draft.md")))
      .digest("hex");
    expect(pinned).toBe(frozen);
  });
  test("the human entitlement is a frozen external interface with named facts (PE-23)", () => {
    const external = JSON.parse(
      readFileSync(join(ROOT, "contracts/identity/v1/external-interfaces.json"), "utf8"),
    ) as {
      interfaces: {
        interface_id: string;
        interface_version: string;
        owner: string;
        publication_status: string;
        horizon_mints: boolean;
        pinned_commit: string | null;
        required_facts: { fact: string; binds: string | null }[];
        dependency: string | null;
      }[];
    };
    const entitlement = external.interfaces.find((entry) => entry.interface_id === "sea_forge.human_entitlement");
    expect(entitlement).toBeDefined();
    expect(entitlement!.interface_version).toBe("1");
    expect(entitlement!.owner).toBe("GodSpeedAI/SEA-Forge");
    // Horizon consumes the interface; it never mints the artifact behind it.
    expect(entitlement!.horizon_mints).toBe(false);
    // The facts an entitlement must carry are named, so "current" is checkable rather than asserted.
    const facts = entitlement!.required_facts.map((fact) => fact.fact);
    for (const fact of [
      "subject_ref",
      "issuer_ref",
      "operation_digest",
      "resource_refs",
      "amount",
      "authority_epoch",
      "expires_at",
      "revocation_state",
    ]) {
      expect(facts).toContain(fact);
    }
    // The owner has published no such artifact, and the contract says so rather than pretending.
    expect(entitlement!.publication_status).toBe("specified_not_published");
    expect(entitlement!.pinned_commit).toBeNull();
    expect(entitlement!.dependency).toContain("refuses");
    // The record contract binds the entitlement, and the design names the same interface.
    expect(records.constraints["entitlement_is_external"]?.applies_to).toEqual(["HorizonAuthorityDecision", "EffectFence"]);
    expect(records.constraints["entitlement_is_external"]?.rule).toContain("sea_forge.human_entitlement");
    expect(design).toContain("### 9.1 External interfaces Horizon consumes");
    expect(design).toContain("`sea_forge.human_entitlement`");
  });
});

describe("the round-2 review's refusals", () => {
  let app: DeskApp;
  beforeAll(async () => {
    app = await startDeskApp();
  });
  afterAll(async () => app.stop());
  const attempts = async (): Promise<number> =>
    (await readIntentAttempts(app.application.runtime.runtime.store)).length;

  test("an operation the catalog does not know never runs at the intent boundary (NE-16)", async () => {
    const before = await attempts();
    const response = await app.post("/intent", { operation_ref: "not.a.catalogued.operation" });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { code?: string; message?: string };
    expect(body.code).toBe("invalid_argument");
    expect(body.message).toContain("not a classified operation");
    // Nothing was attempted, so no capability was invoked and no record was appended.
    expect(await attempts()).toBe(before);
    // A governed row is refused at the same boundary, with the reason named.
    const governed = await app.post("/intent", { operation_ref: "human.answer" });
    expect(governed.status).toBe(412);
    expect(((await governed.json()) as { message?: string }).message).toContain("pending record");
    expect(await attempts()).toBe(before);
    // A catalog that cannot be read is not a permissive catalog: the loader refuses it.
    expect(() => manifest.manifest).not.toThrow();
    const broken = loadOperationManifest();
    expect(broken.byId.size).toBeGreaterThan(0);
  });

  test("a parameter schema that drifts from its handler fails the check (NE-17)", async () => {
    // The honest tree passes both checks.
    expect(checkParamSchemaBinding(ROOT).failures).toEqual([]);
    expect(checkDesignContractConsistency(ROOT).failures).toEqual([]);
    // A wire name that drifts from the handler is caught.
    const root = throwawayCopy(BINDING_FILES);
    const paramsPath = join(root, "contracts/identity/v1/params.yaml");
    const params = readFileSync(paramsPath, "utf8");
    writeFileSync(
      paramsPath,
      params.replace("{ name: row_id, type: string }", "{ name: row_id, type: string, wire: rowId }"),
    );
    const drifted = checkParamSchemaBinding(root);
    expect(drifted.ok).toBe(false);
    expect(drifted.failures.join("\n")).toContain("horizon.conversation.discard");
    // The schema is checked on the values, not on the name.
    expect(validateParameters("params.horizon_conversation_discard", { rowId: "row-1" })).not.toEqual([]);
    expect(validateParameters("params.horizon_conversation_discard", { row_id: "row-1" })).toEqual([]);
    // A design table that drifts from the generated one is caught.
    const designRoot = throwawayCopy(CONSISTENCY_FILES);
    const designPath = join(designRoot, "design_draft.md");
    const text = readFileSync(designPath, "utf8");
    writeFileSync(
      designPath,
      text.replace(
        "| `params.owner_pin` | `id:string`, `pinned:boolean` |",
        "| `params.owner_pin` | `id:string`, `pinned:boolean`, `extra:string` |",
      ),
    );
    const designDrift = checkDesignContractConsistency(designRoot);
    expect(designDrift.ok).toBe(false);
    expect(designDrift.failures.join("\n")).toContain("parameter table");
  });

  test("the agent door checks its reserved actions against the field the route uses (NE-18)", async () => {
    const key = app.application.loaded.agentKey;
    const door = (body: unknown): Promise<Response> =>
      fetch(`${app.base}/agent/panels`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    // The route's action field is the catalog's, and the refusal is read from it.
    const catalog: LoadedManifest = manifest;
    expect(catalog.routes.get("POST /agent/panels")).toBeDefined();
    // A reserved operation named in the action field is refused as reserved.
    for (const action of ["human.answer", "human.close", "human.pin"]) {
      expect((await door({ tool: action })).status).toBe(403);
    }
    // A reserved operation named in any other field is refused as an unreadable request rather
    // than ignored, and nothing is changed.
    for (const action of ["human.answer", "human.close", "human.pin"]) {
      expect((await door({ op: action })).status).toBe(400);
    }
    expect((await door({ tool: "read_responses" })).status).toBe(200);
  });

  test("the Stage 0B tables claim no operation Stage 0B cannot authorise (NE-19)", () => {
    const section = stage0bSection();
    // The routing row is not a Stage 0B operation: it needs a live bounded grant Stage 0B lacks.
    const enforcement = manifest.manifest.live_enforcement?.rows?.find((row) => row.id === "ask.route");
    expect(enforcement?.missing).toContain("live_bounded_grant");
    expect(enforcement?.required_stage).not.toContain("Stage 0B");
    // The design's Stage 0B boundary says so, in prose rather than in a success table.
    expect(section).toContain("ask.route");
    const paragraph = section
      .split("\n")
      .find((line) => line.includes("ask.route") && line.includes("Stage 0B"));
    expect(paragraph ?? "").toMatch(/not a Stage 0B operation|stays refused/i);
    // And the Stage 0B tables themselves name no operation it cannot authorise.
    const stage0bTable = section.slice(section.indexOf("| Effect class |"));
    expect(stage0bTable).not.toContain("ask.route");
    // The operations Stage 0B can run are the governed rows whose authority is the local
    // continuation; the export and hand-off rows are not among them.
    const stage0bRows = manifest.manifest.live_enforcement?.rows?.filter((row) => row.required_stage === "Stage 0B") ?? [];
    expect(stage0bRows.map((row) => row.id)).not.toContain("ask.route");
    expect(stage0bRows.map((row) => row.id)).not.toContain("workspace.export");
    expect(stage0bRows.map((row) => row.id)).not.toContain("handoff.send");
  });

  test("the assurance vocabulary never grows a third predicate (NE-20)", () => {
    const base = {
      schema_version: "horizon.identity.records/1.1.0",
      tenant_ref: "tenant-0001",
      trust_domain_ref: "tenant-0001",
      issued_at: "2026-11-10T10:00:00.000Z",
      issuer_ref: "cognate-local",
      verifier_ref: "verifier-0001",
      key_id: "key-0001",
      device_ref: "device-0001",
      principal_ref: "human-0001",
      operation_digest: `sha256:${"a".repeat(64)}`,
      challenge_digest: `sha256:${"b".repeat(64)}`,
      policy_digest: `sha256:${"c".repeat(64)}`,
      up: true,
      uv: true,
      protected_terminal_presence: false,
      sign_count: "1",
      assurance_predicate: "A3-UV",
      verified_at: "2026-11-10T10:00:00.000Z",
      expires_at: "2026-11-10T10:05:00.000Z",
      signature: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    };
    expect(validateRecord(records, "A3Receipt", base)).toEqual([]);
    // The terminal-presence claim is not a predicate.
    expect(validateRecord(records, "A3Receipt", { ...base, assurance_predicate: "protected_terminal_presence" })).toContain(
      "enum:assurance_predicate",
    );
    // Terminal presence never stands in for user verification.
    expect(validateRecord(records, "A3Receipt", { ...base, uv: false })).toContain("constraint:a3_uv_requires_uv");
    expect(validateRecord(records, "A3Receipt", { ...base, protected_terminal_presence: true })).toContain(
      "constraint:a3_uv_is_not_terminal_presence",
    );
    // The terminal predicate rests on the terminal claim.
    expect(
      validateRecord(records, "A3Receipt", {
        ...base,
        assurance_predicate: "A3-T",
        uv: false,
        protected_terminal_presence: false,
      }),
    ).toContain("constraint:a3_t_requires_protected_terminal_presence");
  });

  test("an entitlement name alone is never authority (NE-21)", () => {
    const fixtures = JSON.parse(
      readFileSync(join(ROOT, "contracts/identity/v1/fixtures/record-cases.json"), "utf8"),
    ) as {
      cases: {
        id: string;
        kind: string;
        expect: string;
        violations: string[];
        record: Record<string, unknown>;
        context?: Record<string, unknown>;
      }[];
    };
    const byId = new Map(fixtures.cases.map((entry) => [entry.id, entry]));
    // The owner has published no entitlement artifact, so there is nothing to authenticate
    // against. The path fails closed: a record that names an entitlement is refused, even when
    // the entitlement beside it carries every fact the interface declares — its issuer key and
    // the issuer's signature included (R3-08).
    for (const id of ["DECISION-HUMAN-ENTITLEMENT-UNPUBLISHED", "FENCE-HUMAN-ENTITLEMENT-UNPUBLISHED"]) {
      const entry = byId.get(id)!;
      expect(entry.violations).toEqual(["constraint:entitlement_is_external"]);
      expect(validateRecord(records, entry.kind, entry.record, undefined, entry.context as never)).toEqual([
        "constraint:entitlement_is_external",
      ]);
    }
    // The same record without the entitlement is refused: a name alone is not authority.
    const unpublished = byId.get("DECISION-HUMAN-ENTITLEMENT-UNPUBLISHED")!;
    expect(validateRecord(records, unpublished.kind, unpublished.record)).toContain("constraint:entitlement_is_external");
    // Every way the owner's artifact can fail to cover the record is refused as well.
    for (const id of [
      "DECISION-ENTITLEMENT-NOT-SUPPLIED",
      "DECISION-ENTITLEMENT-SUBJECT-MISMATCH",
      "DECISION-ENTITLEMENT-EXPIRED",
      "FENCE-ENTITLEMENT-SCOPE-TOO-NARROW",
      "FENCE-ENTITLEMENT-REVOKED",
    ]) {
      const entry = byId.get(id)!;
      expect(entry.violations).toEqual(["constraint:entitlement_is_external"]);
      expect(validateRecord(records, entry.kind, entry.record, undefined, entry.context as never)).toEqual([
        "constraint:entitlement_is_external",
      ]);
    }
  });
});

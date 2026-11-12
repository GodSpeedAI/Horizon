import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { classify, loadOperationManifest } from "../src/contracts/identity/manifest.ts";
import {
  effectiveChildGrant,
  loadRecordsContract,
  validateRecord,
  type CatalogFacts,
} from "../src/contracts/identity/records.ts";

/**
 * Stage 0A-2: the record schemas and their cross-language fixtures.
 *
 * The fixtures are the contract between two independent implementations: this validator and a
 * stdlib-only Python checker that reads the same JSON. A case states the exact set of violations
 * both must produce. If the two disagree, one of them is wrong and the test fails.
 */

const ROOT = new URL("..", import.meta.url).pathname;

const contract = loadRecordsContract();
const fixturesPath = `${ROOT}contracts/identity/v1/fixtures/record-cases.json`;
const fixtures = JSON.parse(readFileSync(fixturesPath, "utf8")) as {
  fixtures_version: string;
  contract_id: string;
  contract_version: string;
  proofs: Record<string, string>;
  cases: {
    id: string;
    kind: string;
    expect: "valid" | "invalid";
    violations: string[];
    proof?: string;
    catalog?: CatalogFacts;
    context?: Record<string, unknown>;
    record: Record<string, unknown>;
  }[];
};

const manifest = loadOperationManifest();
const params = Bun.YAML.parse(readFileSync(`${ROOT}contracts/identity/v1/params.yaml`, "utf8")) as Record<string, any>;

const kinds = Object.keys(contract.records);

describe("the descriptor is the whole contract", () => {
  test("it declares the ten signed records and the one unsigned outcome", () => {
    const signed = kinds.filter((kind) => contract.records[kind]!.signed);
    const unsigned = kinds.filter((kind) => !contract.records[kind]!.signed);
    expect(signed.sort()).toEqual([
      "A3Receipt",
      "Approval",
      "Credential",
      "EffectFence",
      "EvidenceRecord",
      "HorizonAuthorityDecision",
      "HorizonDelegationGrant",
      "OperationDescriptor",
      "PendingOperation",
      "PendingTransition",
    ]);
    expect(unsigned).toEqual(["Refusal"]);
  });

  test("every signed record declares a signature field and the refusal does not (PE-04)", () => {
    for (const kind of kinds) {
      const fields = contract.records[kind]!.fields.map((field) => field.name);
      expect(fields.includes("signature")).toBe(contract.records[kind]!.signed);
    }
  });

  test("the envelope is required before any record-specific field", () => {
    expect(contract.envelope.map((field) => field.name)).toEqual([
      "schema_version",
      "tenant_ref",
      "trust_domain_ref",
      "issued_at",
      "issuer_ref",
    ]);
  });

  test("every encoding rule the schema needs is stated once", () => {
    for (const name of ["uint64", "decimal", "timestamp", "base64url", "digest", "jwk", "money", "enum"]) {
      expect(typeof contract.encoding[name]).toBe("string");
      expect(contract.encoding[name]!.length).toBeGreaterThan(20);
    }
  });

  test("the contract names what one record cannot prove, instead of pretending", () => {
    expect(Object.keys(contract.not_enforceable_from_one_record).sort()).toEqual([
      "entitlement_currentness",
      "epoch_monotonicity",
      "grant_liveness",
      "pending_code_single_use",
      "pending_expiry",
      "revocation_latency",
    ]);
    for (const limit of Object.values(contract.not_enforceable_from_one_record)) {
      expect(limit).toMatch(/Stage [35]/);
    }
  });

  test("every field type a record uses is one the encoding defines", () => {
    const known = new Set([
      "string",
      "uint64",
      "decimal",
      "timestamp",
      "boolean",
      "base64url",
      "digest",
      "string_array",
      "object",
      "jwk",
      "money",
    ]);
    for (const kind of kinds) {
      for (const field of contract.records[kind]!.fields) expect(known).toContain(field.type);
    }
  });
});

describe("the fixtures", () => {
  test("the file names the contract it belongs to", () => {
    expect(fixtures.contract_id).toBe(contract.contract_id);
    expect(fixtures.contract_version).toBe(contract.contract_version);
    expect(fixtures.fixtures_version).toBe("horizon.identity.record-fixtures/1");
  });

  test("every record kind has cases", () => {
    const covered = new Set(fixtures.cases.map((entry) => entry.kind));
    expect([...covered].sort()).toEqual([...kinds].sort());
  });

  test("every case id is unique and every case states its expectation", () => {
    const ids = fixtures.cases.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of fixtures.cases) {
      expect(["valid", "invalid"]).toContain(entry.expect);
      expect(entry.expect === "valid").toBe(entry.violations.length === 0);
    }
  });

  test("a valid case carries the whole envelope", () => {
    for (const entry of fixtures.cases.filter((case_) => case_.expect === "valid")) {
      for (const field of contract.envelope) expect(field.name in entry.record).toBe(true);
    }
  });

  test("both implementations must produce exactly the listed violations (PE-14)", () => {
    const mismatches: string[] = [];
    for (const entry of fixtures.cases) {
      const got = validateRecord(contract, entry.kind, entry.record, entry.catalog, entry.context as never);
      if (JSON.stringify(got) !== JSON.stringify([...entry.violations].sort())) {
        mismatches.push(`${entry.id}: want ${JSON.stringify(entry.violations)}, got ${JSON.stringify(got)}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  test("every constraint in the descriptor is exercised by at least one case", () => {
    const exercised = new Set<string>();
    for (const entry of fixtures.cases) {
      for (const violation of entry.violations) {
        if (violation.startsWith("constraint:")) exercised.add(violation.slice("constraint:".length));
      }
    }
    expect([...exercised].sort()).toEqual(Object.keys(contract.constraints).sort());
  });

  test("no case names a constraint or a field the descriptor does not declare", () => {
    for (const entry of fixtures.cases) {
      for (const violation of entry.violations) {
        const [kind, name] = violation.split(":");
        if (kind === "constraint") expect(contract.constraints[name as string]).toBeDefined();
        if (kind === "missing" || kind === "null") {
          const declared = [...contract.envelope, ...contract.records[entry.kind]!.fields].map((field) => field.name);
          expect(declared).toContain(name as string);
        }
        if (kind === "unknown") {
          const declared = [...contract.envelope, ...contract.records[entry.kind]!.fields].map((field) => field.name);
          expect(declared).not.toContain(name as string);
        }
      }
    }
  });
});

describe("the three proofs the owner asked for", () => {
  test("each named proof has a positive and a negative case", () => {
    for (const proof of ["no_fabricated_grant", "caller_not_substitutable", "no_classification_downgrade"]) {
      expect(fixtures.proofs[proof]).toBeDefined();
      const cases = fixtures.cases.filter((entry) => entry.proof === proof);
      expect(cases.filter((entry) => entry.expect === "valid").length).toBeGreaterThanOrEqual(1);
      expect(cases.filter((entry) => entry.expect === "invalid").length).toBeGreaterThanOrEqual(1);
    }
  });

  test("a human session never receives a fabricated grant or credential (PE-05, NE-05)", () => {
    const positive = fixtures.cases.find((entry) => entry.id === "OD-HUMAN-OK");
    expect(positive?.violations).toEqual([]);
    expect(positive?.record.caller_kind).toBe("human_session");
    expect(positive?.record.delegation_ref).toBeNull();
    // The positive case is checked through the validator, not by reading its own expectation back.
    expect(validateRecord(contract, positive!.kind, positive!.record, positive!.catalog, positive!.context as never)).toEqual([]);

    // A grant named as the record's own field is refused by the grant rule alone.
    const borrowed = fixtures.cases.find((entry) => entry.id === "OD-HUMAN-WITH-DELEGATION")!;
    expect(borrowed.violations).toEqual(["constraint:human_has_no_grant"]);
    expect(validateRecord(contract, borrowed.kind, borrowed.record, borrowed.catalog, borrowed.context as never)).toEqual([
      "constraint:human_has_no_grant",
    ]);
    // A grant smuggled inside the parameters is refused twice over. A human session holds no
    // delegation head, so the human variant of `params.run_start` does not declare `grant_ref`:
    // the delegation register sees the name and refuses the human session, and the parameter
    // schema refuses a field the effect does not have. Both refusals are real, and a case that
    // hid one of them would understate the defect.
    const smuggled = fixtures.cases.find((entry) => entry.id === "OD-HUMAN-RUN-START-GRANT")!;
    expect(smuggled.violations).toEqual(["constraint:human_has_no_grant", "constraint:parameters_match_schema"]);
    expect(validateRecord(contract, smuggled.kind, smuggled.record, smuggled.catalog, smuggled.context as never)).toEqual([
      "constraint:human_has_no_grant",
      "constraint:parameters_match_schema",
    ]);
    const withCredential = fixtures.cases.find((entry) => entry.id === "OD-HUMAN-WITH-CREDENTIAL")!;
    expect(withCredential.violations).toEqual(["constraint:human_has_no_credential"]);
    expect(validateRecord(contract, withCredential.kind, withCredential.record, withCredential.catalog, withCredential.context as never)).toEqual([
      "constraint:human_has_no_credential",
    ]);
  });

  test("the caller kind cannot be substituted (PE-06, NE-06)", () => {
    const positive = fixtures.cases.find((entry) => entry.id === "OD-AGENT-P1-NO-DELEGATION-OK");
    expect(positive?.violations).toEqual([]);
    expect(validateRecord(contract, positive!.kind, positive!.record, positive!.catalog, positive!.context as never)).toEqual([]);
    // Each case states every fact it breaks, and the validator returns exactly that list: a case
    // that broke one rule and now breaks two says both, so the proof is the whole truth and not
    // a single convenient fact.
    for (const [id, violations] of [
      ["OD-AGENT-NO-EXECUTION", ["constraint:agent_needs_execution"]],
      ["OD-CONSOLE-WITH-EXECUTION", ["constraint:caller_kind_permitted", "constraint:console_has_no_execution"]],
      ["OD-CALLER-KIND-ENUM", ["constraint:caller_kind_permitted", "enum:caller_kind"]],
      ["OD-HUMAN-WITH-CREDENTIAL", ["constraint:human_has_no_credential"]],
      ["FENCE-CALLER-IS-TARGET", ["constraint:caller_is_not_target"]],
    ] as const) {
      const entry = fixtures.cases.find((candidate) => candidate.id === id)!;
      expect(entry.violations).toEqual([...violations]);
      expect(validateRecord(contract, entry.kind, entry.record, entry.catalog, entry.context as never)).toEqual([...violations]);
    }
  });

  test("a record's caller kind is one the operation permits (R5-05)", () => {
    // The catalog's own fact, carried by the case: a device credential's record may not claim a
    // human session, and a human session's record may not claim a device.
    const device = fixtures.cases.find((entry) => entry.id === "OD-DEVICE-CREDENTIAL-OK")!;
    expect(device.catalog?.permitted_caller_kinds).toEqual(["device_credential"]);
    expect(device.violations).toEqual([]);
    const substituted = fixtures.cases.find((entry) => entry.id === "OD-DEVICE-CLAIMS-HUMAN-SESSION")!;
    expect(substituted.violations).toEqual(["constraint:caller_kind_permitted"]);
    expect(validateRecord(contract, substituted.kind, substituted.record, substituted.catalog, substituted.context as never)).toEqual([
      "constraint:caller_kind_permitted",
    ]);
    // A code holder and a registered agent are callers the contract can now name.
    for (const id of ["OD-CODE-HOLDER-PAIR-OK", "PENDING-REGISTERED-AGENT-OK"]) {
      const entry = fixtures.cases.find((candidate) => candidate.id === id)!;
      expect(entry.violations).toEqual([]);
      expect(validateRecord(contract, entry.kind, entry.record, entry.catalog, entry.context as never)).toEqual([]);
    }
    // And a caller that names a channel it does not hold is refused by name.
    const withExecution = fixtures.cases.find((entry) => entry.id === "OD-CODE-HOLDER-WITH-EXECUTION")!;
    expect(withExecution.violations).toEqual(["constraint:non_principal_caller_has_no_credential"]);
    expect(validateRecord(contract, withExecution.kind, withExecution.record, withExecution.catalog, withExecution.context as never)).toEqual([
      "constraint:non_principal_caller_has_no_credential",
    ]);
  });

  test("an operation's class cannot be lowered through an alias or a parameter (PE-07, NE-07)", () => {
    const accepted = fixtures.cases.find((entry) => entry.id === "OD-ALIAS-ACTION-OK")!;
    expect(accepted.violations).toEqual([]);
    expect(validateRecord(contract, accepted.kind, accepted.record, accepted.catalog, accepted.context as never)).toEqual([]);

    for (const [id, violation] of [
      ["OD-ALIAS-ACTION-MISMATCH", "constraint:alias_fixes_action"],
      ["OD-P2-WEAK-PARAMS", "constraint:params_schema_mismatch"],
      ["OD-AGENT-GOVERNED-NO-DELEGATION", "constraint:governed_agent_needs_delegation"],
      ["OD-DISPATCH-UNLISTED-TARGET", "constraint:dispatcher_target_listed"],
      ["OD-DISPATCH-NO-TARGET", "constraint:dispatcher_target_listed"],
    ] as const) {
      const entry = fixtures.cases.find((candidate) => candidate.id === id)!;
      expect(entry.violations).toEqual([violation]);
      expect(validateRecord(contract, entry.kind, entry.record, entry.catalog, entry.context as never)).toEqual([violation]);
    }
  });
});

describe("catalog facts are read from the live manifest, not restated", () => {
  const withCatalog = fixtures.cases.filter((entry) => entry.catalog !== undefined);

  test("enough cases bind to the catalog for the check to mean something", () => {
    expect(withCatalog.length).toBeGreaterThanOrEqual(12);
  });

  test("every case's operation exists and its class is the manifest's class", () => {
    for (const entry of withCatalog) {
      const facts = entry.catalog as CatalogFacts;
      expect(entry.record.operation_id).toBe(facts.operation_id);
      const resolved = classify(manifest, facts.operation_id);
      expect(facts.class).toBe(resolved.class);
    }
  });

  test("every case's parameter schema is the one the row resolves to", () => {
    for (const entry of withCatalog) {
      const facts = entry.catalog as CatalogFacts;
      if (facts.params_schema === undefined || facts.params_schema === null) continue;
      const declared: string = facts.params_schema;
      const resolved = classify(manifest, facts.operation_id);
      if (!("paramsSchema" in resolved)) throw new Error(`${facts.operation_id} has no parameter schema`);
      expect(declared).toBe(resolved.paramsSchema as string);
    }
  });

  test("a case's permitted caller kinds are the ones the row resolves to", () => {
    const withKinds = withCatalog.filter((entry) => entry.catalog?.permitted_caller_kinds !== undefined);
    expect(withKinds.length).toBeGreaterThanOrEqual(12);
    for (const entry of withKinds) {
      const facts = entry.catalog as CatalogFacts;
      const resolved = classify(manifest, facts.operation_id);
      if (!("permittedCallerKinds" in resolved)) throw new Error(`${facts.operation_id} is not classified`);
      expect([...(facts.permitted_caller_kinds as readonly string[])].sort()).toEqual(
        [...(resolved.permittedCallerKinds as readonly string[])].sort(),
      );
    }
  });
  test("an alias-fixed action is the value the parameter schema fixes", () => {
    const fixed = withCatalog.filter((entry) => entry.catalog?.alias_fixed);
    expect(fixed.length).toBeGreaterThanOrEqual(2);
    for (const entry of fixed) {
      const facts = entry.catalog as CatalogFacts;
      const schemaName = facts.params_schema as string;
      const schema = params.schemas[schemaName];
      expect(schema.alias_rule).toBeDefined();
      const action = schema.fields.find((field: any) => field.name === facts.alias_fixed!.field);
      expect(action.enum).toContain(facts.alias_fixed!.value);
    }
  });

  test("a case's authority writer is the writer the row resolves to", () => {
    const writers = withCatalog.filter((entry) => entry.catalog?.authority_writer !== undefined);
    expect(writers.length).toBeGreaterThanOrEqual(10);
    for (const entry of writers) {
      const facts = entry.catalog as CatalogFacts;
      const resolved = classify(manifest, facts.operation_id);
      if (!("authorityWriter" in resolved)) throw new Error(`${facts.operation_id} has no authority writer`);
      expect(facts.authority_writer).toBe(resolved.authorityWriter as string);
    }
  });
  test("a dispatcher's listed targets are real catalog rows", () => {    const dispatched = withCatalog.filter((entry) => entry.catalog?.listed_targets);
    expect(dispatched.length).toBeGreaterThanOrEqual(2);
    for (const entry of dispatched) {
      const facts = entry.catalog as CatalogFacts;
      const resolved = classify(manifest, facts.operation_id);
      if (!("dispatcher" in resolved)) throw new Error(`${facts.operation_id} must be a dispatcher`);
      expect(resolved.dispatcher).toBe(true);
      for (const target of facts.listed_targets!) expect(manifest.byId.has(target)).toBe(true);
    }
  });

  test("a governed case names a governed class and a local case does not", () => {
    for (const entry of withCatalog) {
      const facts = entry.catalog as CatalogFacts;
      const isGoverned = facts.class === "P2" || facts.class === "P3";
      if (isGoverned) {
        const resolved = classify(manifest, facts.operation_id);
        if (!("writable" in resolved)) throw new Error("governed rows are classified");
        expect(resolved.writable).toBe(true);
        expect(resolved.offlineAllowed).toBe(false);
      }
    }
  });
});

describe("an absent child grant field grants nothing", () => {
  test("every omitted authority field is zero, empty, or false, never the parent's value", () => {
    const child = fixtures.cases.find((entry) => entry.id === "GRANT-CHILD-OK")?.record ?? {};
    const effective = effectiveChildGrant(contract, {
      grant_ref: child.grant_ref,
      parent_ref: child.parent_ref,
      agent_ref: child.agent_ref,
    });
    expect(effective.operations).toEqual([]);
    expect(effective.resource_selectors).toEqual([]);
    expect(effective.data_labels).toEqual([]);
    expect(effective.budget).toEqual({ amount: "0", unit: "currency", remaining: "0" });
    expect(effective.depth_remaining).toBe("0");
    expect(effective.redelegate).toBe(false);
    expect(effective.offline).toBe(false);
    expect(effective.expires_at).toBeNull();
  });
});

describe("the validator refuses rather than repairs", () => {
  test("an unknown record kind is a violation, not a pass", () => {
    expect(validateRecord(contract, "NotARecord", {})).toEqual(["unknown_record:NotARecord"]);
  });

  test("a record that is not an object is a violation, not a pass", () => {
    expect(validateRecord(contract, "Credential", [])).toEqual(["type:record:Credential"]);
  });

  test("an unknown constraint id fails loudly instead of being ignored", () => {
    // A case that genuinely trips a cross-field rule: with the rule book emptied, the validator
    // must complain about the fixture naming an undefined rule rather than passing it.
    const tripping = fixtures.cases.find((entry) => entry.violations.some((violation) => violation.startsWith("constraint:")))!;
    const bogus = { ...contract, constraints: {} } as typeof contract;
    expect(() => validateRecord(bogus, tripping.kind, tripping.record, tripping.catalog, tripping.context as never)).toThrow();
  });

  test("a numeric amount is never accepted as money", () => {
    const credential = fixtures.cases.find((entry) => entry.kind === "Credential" && entry.expect === "valid")!.record;
    const grant = fixtures.cases.find((entry) => entry.id === "GRANT-ROOT-OK")!.record;
    expect(validateRecord(contract, "HorizonDelegationGrant", { ...grant, budget: { amount: 1000, unit: "tokens" } })).toContain(
      "type:budget:money",
    );
    // A JS number where a uint64 belongs is a type violation, not a silently coerced value.
    expect(validateRecord(contract, "Credential", { ...credential, exp: 1762692900 })).toEqual(["type:exp:uint64"]);
  });

  test("a leading-zero or oversized uint64 is refused", () => {
    const credential = fixtures.cases.find((entry) => entry.kind === "Credential" && entry.expect === "valid")!.record;
    expect(validateRecord(contract, "Credential", { ...credential, exp: "01762692900" })).toEqual(["type:exp:uint64"]);
    expect(validateRecord(contract, "Credential", { ...credential, exp: "18446744073709551616" })).toEqual([
      "type:exp:uint64",
    ]);
    expect(validateRecord(contract, "Credential", { ...credential, exp: "18446744073709551615" })).toEqual([]);
  });

  test("a private key is never a holder key", () => {
    const credential = fixtures.cases.find((entry) => entry.kind === "Credential" && entry.expect === "valid")!.record;
    for (const member of ["d", "p", "q", "dp", "dq", "qi", "oth"]) {
      expect(
        validateRecord(contract, "Credential", {
          ...credential,
          holder_jwk: { kty: "EC", crv: "P-256", x: "eA", y: "eQ", [member]: "c2VjcmV0" },
        }),
      ).toEqual(["type:holder_jwk:jwk"]);
    }
    expect(validateRecord(contract, "Credential", { ...credential, holder_jwk: { kty: "oct", k: "c2VjcmV0" } })).toEqual([
      "type:holder_jwk:jwk",
    ]);
  });
});

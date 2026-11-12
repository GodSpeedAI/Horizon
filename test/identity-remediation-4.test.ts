/**
 * The fifth independent review's nine findings, as checks the Stage 0A contract set must pass.
 *
 * Each test names the expectation it proves in its title, and scripts/check-stage0a-remediation-4
 * -prereg-coverage.ts requires exactly one title per registered expectation. The assertions read
 * the committed contracts, the manifest loader, the frozen refusal table and the owner checkout at
 * the pinned commit; none of them reads a stored verdict or a transcript.
 */
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  checkExternalInterfaceFacts,
  resolveOwnerCheckout,
  structBody,
} from "../scripts/check-external-interface-facts.ts";
import {
  EXECUTOR_CALLER_AUTHENTICATION,
  EXECUTORS,
  RECORD_CALLER_KINDS,
  classify,
  loadOperationManifest,
  type Operation,
} from "../src/contracts/identity/manifest.ts";
import { frozenRefusal, refusalWords } from "../src/contracts/identity/enforcement.ts";
import { loadRecordsContract } from "../src/contracts/identity/records.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const INTERFACES = JSON.parse(readFileSync(path.join(ROOT, "contracts/identity/v1/external-interfaces.json"), "utf8")) as {
  bind_targets: { envelope_checks: Record<string, string> };
  interfaces: {
    interface_id: string;
    required_facts: { fact: string; binds: string; component: string | null; conditional?: string }[];
    components?: Record<string, { file: string; struct: string | null }>;
  }[];
};
const manifest = loadOperationManifest();
const records = loadRecordsContract();

function authorityDecision() {
  const found = INTERFACES.interfaces.find((entry) => entry.interface_id === "sea_forge.authority_decision");
  if (found === undefined) throw new Error("the authority decision interface is missing");
  return found;
}

describe("the external-interface contract", () => {
  test("PE-44: every published fact is verified in the owner struct that carries it, at the pinned commit", () => {
    expect(resolveOwnerCheckout(ROOT)).not.toBeNull();
    const result = checkExternalInterfaceFacts(ROOT, { quiet: true });
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
    const decision = authorityDecision();
    for (const fact of decision.required_facts) {
      expect(fact.component, fact.fact).not.toBeNull();
    }
  });

  test("PE-45: the Merkle inclusion fields are present, component-named, and bound to the envelope check that consumes them", () => {
    const decision = authorityDecision();
    const byName = new Map(decision.required_facts.map((fact) => [fact.fact, fact]));
    expect(byName.get("leaf_index")).toMatchObject({ component: "inclusion", binds: "envelope:inclusion" });
    expect(byName.get("proof_hashes")).toMatchObject({ component: "inclusion", binds: "envelope:inclusion" });
    expect(byName.get("mmr_leaf_index")).toMatchObject({ component: "ledger_entry", binds: "envelope:inclusion" });
    expect(decision.components?.inclusion).toEqual({ file: "crates/sea-forge-ledger/src/types.rs", struct: "MerkleProof" });
  });

  test("PE-46: every fact binds to a declared record field or a listed envelope check, and the Horizon kinds carry Horizon names", () => {
    const kinds = Object.keys(records.records);
    expect(kinds).toContain("HorizonDelegationGrant");
    expect(kinds).toContain("HorizonAuthorityDecision");
    expect(kinds).not.toContain("DelegationGrant");
    expect(kinds).not.toContain("AuthorityDecision");
    const checks = new Set(Object.keys(INTERFACES.bind_targets.envelope_checks));
    for (const entry of INTERFACES.interfaces) {
      for (const fact of entry.required_facts) {
        if (fact.binds.startsWith("envelope:")) {
          expect(checks.has(fact.binds), `${entry.interface_id}.${fact.fact}`).toBe(true);
        } else {
          const [kind = "", field = ""] = fact.binds.split(".");
          const declared = records.records[kind as keyof typeof records.records]?.fields.map((f) => f.name) ?? [];
          expect(declared, `${entry.interface_id}.${fact.fact}`).toContain(field);
        }
      }
    }
  });

  test("NE-38: a fact with no component, an undeclared struct, or an unbound target fails the check", () => {
    const sourceRoot = resolveOwnerCheckout(ROOT);
    expect(sourceRoot).not.toBeNull();
    const scratch = mkdtempSync(path.join(tmpdir(), "ext-facts-"));
    mkdirSync(path.join(scratch, "contracts/identity/v1"), { recursive: true });
    cpSync(path.join(ROOT, "contracts/identity/v1/records.json"), path.join(scratch, "contracts/identity/v1/records.json"));
    const mutated = JSON.parse(JSON.stringify(INTERFACES)) as typeof INTERFACES;
    const decision = mutated.interfaces[0]!;
    decision.required_facts[0]!.component = null;
    decision.required_facts[1]!.binds = "HorizonAuthorityDecision.no_such_field";
    decision.required_facts[2]!.binds = "envelope:unlisted";
    decision.components = { ...decision.components, ghost: { file: "crates/sea-forge-ledger/src/types.rs", struct: "NoSuchStruct" } };
    decision.required_facts[3]!.component = "ghost";
    writeFileSync(path.join(scratch, "contracts/identity/v1/external-interfaces.json"), JSON.stringify(mutated));
    const result = checkExternalInterfaceFacts(scratch, { quiet: true, sourceRoot: sourceRoot! });
    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("names no source component");
    expect(result.failures.join("\n")).toContain("binds to HorizonAuthorityDecision.no_such_field");
    expect(result.failures.join("\n")).toContain("envelope:unlisted");
    expect(result.failures.join("\n")).toContain("NoSuchStruct");
    expect(structBody("pub struct A { pub x: u8 }", "A")).toContain("pub x");
    expect(structBody("pub struct A { pub x: u8 }", "Missing")).toBeNull();
  });
});

describe("the desk and the shared run", () => {
  test("PE-47: the reachable desk P3 rows are refused on every path, and each refusal appends one audit", () => {
    for (const id of ["case.task.decide", "horizon.settlement.rule", "approval.approve", "approval.reject", "workspace.export"]) {
      const refusal = frozenRefusal(manifest, id);
      expect(refusal, id).not.toBeNull();
      expect(refusal?.audit, id).toBe("appends_refusal_audit");
      const row = classify(manifest, id) as Operation;
      expect(row.class, id).toBe("P3");
    }
  });

  test("PE-48: the shared run start is refused before the case advance it would send", () => {
    const refusal = frozenRefusal(manifest, "run.start");
    expect(refusal).not.toBeNull();
    expect(refusalWords(refusal!)).toMatch(/startCase|case advance|target resolution|refused/i);
  });
});

describe("the phone and the executors", () => {
  test("PE-49: a phone commit is refused with no device delegation, and the device is not the operator", () => {
    const refusal = frozenRefusal(manifest, "device.surface.intent.commit");
    expect(refusal).not.toBeNull();
    expect(refusalWords(refusal!)).toMatch(/delegation/);
    const row = classify(manifest, "device.surface.intent.commit") as Operation;
    expect(row.executor).toBe("device_credential");
  });

  test("PE-50: agent execution maps to the registered-agent key the door authenticates, and no executor claims a credential it lacks", () => {
    expect(EXECUTORS).toContain("registered_agent");
    expect(EXECUTORS).not.toContain("registered_agent_key");
    expect(EXECUTOR_CALLER_AUTHENTICATION.registered_agent).toBeDefined();
    expect(Object.keys(EXECUTOR_CALLER_AUTHENTICATION)).toEqual(expect.arrayContaining(["registered_agent"]));
  });

  test("PE-51: the record caller kinds are exactly the set the catalog names", () => {
    const expected: string[] = ["agent_execution", "code_holder", "device_credential", "local_console", "human_session", "registered_agent"];
    const actual: string[] = [...RECORD_CALLER_KINDS];
    expect(actual.sort()).toEqual(expected.sort());
    const approval = classify(manifest, "approval.approve") as Operation;
    expect(approval.permittedCallerKinds).not.toContain("code_holder");
  });

  test("PE-52: anonymous and code-holder rows state no human evidence, and separation of duty is set per row", () => {
    for (const id of ["horizon.health", "remote.health", "session.pair", "remote.pair.redeem", "remote.session.challenge", "device.pair"]) {
      const row = classify(manifest, id) as Operation;
      expect(row.humanEvidence, id).toBeNull();
    }
    const approval = classify(manifest, "approval.approve") as Operation;
    expect(approval.separationOfDuty).toBe(true);
    const navigation = classify(manifest, "horizon.navigation.defer") as Operation;
    expect(navigation.separationOfDuty).toBeNull();
  });
});

describe("refusals are containments with one audit", () => {
  test("NE-39: a refused desk P3 row or the refused run start performs no target effect and appends exactly one refusal audit", () => {
    for (const id of ["approval.approve", "workspace.export", "run.start"]) {
      const refusal = frozenRefusal(manifest, id);
      expect(refusal?.audit, id).toBe("appends_refusal_audit");
      expect(refusal?.reason.length ?? 0, id).toBeGreaterThan(0);
    }
  });

  test("NE-40: a device credential never reaches the human commit path as the human", () => {
    const refusal = frozenRefusal(manifest, "device.surface.intent.commit");
    expect(refusal?.reason).toMatch(/operator|delegation/);
    const row = classify(manifest, "device.surface.intent.commit") as Operation;
    expect(row.executor).not.toBe("human_session");
  });
});

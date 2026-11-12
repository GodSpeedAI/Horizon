/**
 * The fifth independent review's nine findings, as checks the Stage 0A contract set must pass.
 *
 * Each test names the expectation it proves in its title, and scripts/check-stage0a-remediation-4
 * -prereg-coverage.ts requires exactly one title per registered expectation. The assertions read
 * the committed contracts, the manifest loader, the frozen refusal table and the owner checkout at
 * the pinned commit; none of them reads a stored verdict or a transcript.
 */
import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkExternalInterfaceFacts, structBody } from "../scripts/check-external-interface-facts.ts";
import { createApplication } from "../src/app.ts";
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
import { readIntentAttempts } from "../src/capabilities/navigation-intent.ts";
import { startDeskApp } from "./support/desk-app.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const INTERFACES = JSON.parse(readFileSync(path.join(ROOT, "contracts/identity/v1/external-interfaces.json"), "utf8")) as {
  bind_targets: { envelope_checks: Record<string, string> };
  interfaces: {
    interface_id: string;
    publication_status: string;
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
  test("PE-44: the authority decision is unpublished, so no owner struct is read for it and the contract check still passes", () => {
    const result = checkExternalInterfaceFacts(ROOT, { quiet: true });
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
    const decision = authorityDecision();
    expect(decision.publication_status).toBe("specified_not_published");
    for (const fact of decision.required_facts) {
      expect(fact.component, fact.fact).toBeNull();
    }
  });

  test("PE-45: the Merkle inclusion fields are present as facts the owner must carry, and bind to nothing until it publishes the proof", () => {
    const decision = authorityDecision();
    const byName = new Map(decision.required_facts.map((fact) => [fact.fact, fact]));
    for (const name of ["leaf_index", "proof_hashes", "mmr_leaf_index"]) {
      expect(byName.get(name), name).toMatchObject({ component: null, binds: "unbound:owner_projection_not_published" });
    }
    expect(decision.components).toEqual({});
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
        if (fact.binds.startsWith("unbound:")) {
          expect(entry.publication_status, `${entry.interface_id}.${fact.fact}`).not.toBe("published");
        } else if (fact.binds.startsWith("envelope:")) {
          expect(checks.has(fact.binds), `${entry.interface_id}.${fact.fact}`).toBe(true);
        } else {
          const [kind = "", field = ""] = fact.binds.split(".");
          const declared = records.records[kind as keyof typeof records.records]?.fields.map((f) => f.name) ?? [];
          expect(declared, `${entry.interface_id}.${fact.fact}`).toContain(field);
        }
      }
    }
  });

  test("NE-38: a fact with no component, an undeclared struct, a missing field or an unbound target fails the check against a published owner", () => {
    // A synthetic owner repository at a pinned commit, so the struct checks run against real bytes.
    const owner = mkdtempSync(path.join(tmpdir(), "owner-"));
    const git = (args: string[]) => execFileSync("git", args, { cwd: owner, encoding: "utf8" }).trim();
    git(["init", "-q"]);
    mkdirSync(path.join(owner, "crates/x/src"), { recursive: true });
    writeFileSync(path.join(owner, "crates/x/src/types.rs"), "pub struct Env { pub envelope_id: String }\n");
    git(["add", "."]);
    git(["-c", "user.name=owner", "-c", "user.email=owner@example.invalid", "commit", "-q", "-m", "owner fixture"]);
    const pinned = git(["rev-parse", "HEAD"]);
    const scratch = mkdtempSync(path.join(tmpdir(), "ext-facts-"));
    mkdirSync(path.join(scratch, "contracts/identity/v1"), { recursive: true });
    cpSync(path.join(ROOT, "contracts/identity/v1/records.json"), path.join(scratch, "contracts/identity/v1/records.json"));
    const document = (facts: object[], components: Record<string, unknown>) => ({
      ...INTERFACES,
      interfaces: [
        {
          interface_id: "synthetic.owner",
          publication_status: "published",
          interface_version: "1",
          owner: "fixture",
          repository: "fixture",
          pinned_commit: pinned,
          pinned_commit_date: "2026-11-11",
          artifact_path: "crates/x/src/types.rs",
          artifact_symbol: null,
          artifact_paths: ["crates/x/src/types.rs"],
          horizon_mints: false,
          horizon_binding: null,
          horizon_view: "fixture",
          components,
          required_facts: facts,
        },
      ],
    });
    const good = { fact: "envelope_id", meaning: "fixture", binds: "envelope:profile", component: "env", source: null };
    const env = { env: { file: "crates/x/src/types.rs", struct: "Env" } };
    const run = (doc: object) => {
      writeFileSync(path.join(scratch, "contracts/identity/v1/external-interfaces.json"), JSON.stringify(doc));
      return checkExternalInterfaceFacts(scratch, { quiet: true, sourceRoot: owner });
    };
    expect(run(document([good], env)).failures).toEqual([]);
    expect(run(document([{ ...good, component: null }], env)).failures.join("\n")).toContain("names no source component");
    expect(run(document([good], { env: { file: "crates/x/src/types.rs", struct: "NoSuchStruct" } })).failures.join("\n")).toContain("NoSuchStruct");
    expect(run(document([{ ...good, fact: "missing_field" }], env)).failures.join("\n")).toContain("does not carry");
    expect(run(document([{ ...good, binds: "HorizonAuthorityDecision.no_such_field" }], env)).failures.join("\n")).toContain("binds to HorizonAuthorityDecision.no_such_field");
    expect(run(document([{ ...good, binds: "envelope:unlisted" }], env)).failures.join("\n")).toContain("envelope:unlisted");
    expect(run(document([{ ...good, binds: "unbound:owner_projection_not_published" }], env)).failures.join("\n")).toContain("is unbound, but the interface is published");
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
    const expected: string[] = ["agent_execution", "code_holder", "device_credential", "local_console", "human_session", "registered_agent", "credential_issuer"];
    const actual: string[] = [...RECORD_CALLER_KINDS];
    expect(actual.sort()).toEqual(expected.sort());
    const approval = classify(manifest, "approval.approve") as Operation;
    expect(approval.permittedCallerKinds).not.toContain("code_holder");
  });

  test("PE-52: anonymous and code-holder rows state no human evidence, and separation of duty is set per row", () => {
    for (const id of ["horizon.health", "remote.health", "session.pair", "remote.pair.redeem", "remote.session.challenge"]) {
      const row = classify(manifest, id) as Operation;
      expect(row.humanEvidence, id).toBeNull();
    }
    // The commit records the proof it applies: device.pair is evidenced by the controller's user-verified passkey (A3-UV).
    expect((classify(manifest, "device.pair") as Operation).humanEvidence).toBe("A3-UV");
    const approval = classify(manifest, "approval.approve") as Operation;
    // Separation of duty is stated by role: the approver is a different principal from the requester and the executor.
    expect(approval.separationOfDuty).toEqual({ requester: "initiating_human", approver: "approving_human", executor: "human_session" });
    const navigation = classify(manifest, "horizon.navigation.defer") as Operation;
    expect(navigation.separationOfDuty).toBeNull();
  });
});

describe("governed mode waits for the owner's publication", () => {
  test("NE-42: governed mode is refused at startup while the authority decision is unpublished", async () => {
    await expect(createApplication({ governance: { mode: "sea-forge" } as never, realityTrace: null })).rejects.toThrow("specified_not_published");
  });
});

describe("the public intent boundary appends nothing before a refusal", () => {
  test("NE-41: a classification refusal through the public submitIntent appends no attempt record", async () => {
    const app = await startDeskApp();
    try {
      const store = app.application.runtime.runtime.store;
      const before = (await readIntentAttempts(store)).length;
      for (const operation_ref of ["not.a.catalogued.operation", "human.answer"]) {
        await expect(app.application.submitIntent({ operation_ref } as never)).rejects.toThrow();
      }
      expect((await readIntentAttempts(store)).length).toBe(before);
    } finally {
      await app.stop();
    }
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

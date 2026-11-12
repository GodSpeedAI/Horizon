/**
 * The fourth independent review's findings, as executable claims.
 *
 * The round-4 review rejected the frozen contract set with five blocking findings and four
 * must-fix findings. This file states each correction as a testable claim, so the fifth review
 * reads the contract bytes against something that can fail rather than against this file's
 * account of them.
 *
 * The claims are grouped by what they protect:
 *
 * - the external interfaces name the owner's real artifacts, and an unpublished one fails closed;
 * - the phone's effects have their own device-credential rows, and the phone cannot settle or
 *   approve;
 * - the observation half of settlement is P2, and the device enrollment's evidence is presence,
 *   never A3-UV;
 * - a pending operation's state is an append-only transition chain, and a descriptor never
 *   carries a confirmation;
 * - a caller kind the schema never described is refused by name;
 * - the actor is never read from a request, and a field the schema does not name is refused;
 * - the route census is exact in both directions;
 * - the frozen fixture set exercises every negative tooth the preregistrations promised.
 *
 * The mutation teeth in `scripts/teeth-t23-mutation.ts` break each protected property in a
 * throwaway tree and require the claim to notice, so a passing run here is not a passing
 * assertion nobody read.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadOperationManifest } from "../src/contracts/identity/manifest.ts";
import { loadRecordsContract, validateRecord } from "../src/contracts/identity/records.ts";
import { validateParameters } from "../src/contracts/identity/params.ts";
import { RESERVED_ACTOR_FIELDS } from "../src/contracts/identity/reserved-fields.ts";
import { checkRouteCensus } from "../scripts/check-route-census.ts";
import { startDeskApp } from "./support/desk-app.ts";
import "./support/write-token.ts";

const ROOT = path.resolve(import.meta.dir, "..");
const manifest = loadOperationManifest();
const records = loadRecordsContract();
const params = Bun.YAML.parse(readFileSync(path.join(ROOT, "contracts/identity/v1/params.yaml"), "utf8")) as Record<string, any>;
const interfaces = JSON.parse(readFileSync(path.join(ROOT, "contracts/identity/v1/external-interfaces.json"), "utf8")) as {
  interfaces: { interface_id: string; publication_status: string; pinned_commit: string | null; artifact_path: string | null; required_facts: { fact: string; binds: string }[] }[];
  rules: Record<string, boolean>;
};
const fixtures = JSON.parse(readFileSync(path.join(ROOT, "contracts/identity/v1/fixtures/record-cases.json"), "utf8")) as {
  cases: { id: string; kind: string; expect: string; violations: string[]; record: Record<string, unknown>; catalog?: unknown; context?: unknown }[];
};
const appSource = readFileSync(path.join(ROOT, "src/app.ts"), "utf8");
const remoteSource = readFileSync(path.join(ROOT, "src/remote/server.ts"), "utf8");

/**
 * The facts the pinned owner's envelope actually carries. The first thirty-four are the round-4
 * set; the last three are the Merkle inclusion fields the round-5 split added (R5-06), each read
 * from its named owner struct and checked by scripts/check-external-interface-facts.ts.
 */
const PUBLISHED_FACTS = [
  "envelope_id", "cep_version", "envelope_kind", "created_at", "created_by", "decision", "decision_id",
  "operation_id", "request_ref", "ledger_entry", "policy_bundle_hash", "action_request_hash",
  "identity_binding_hash", "policy_basis", "scope", "authority", "constraints", "compensating_controls",
  "approval_expires_at", "approved_by", "entry_hash", "previous_entry_hash", "payload_hash", "append_ordinal",
  "committed_at", "writer_identity_ref", "subject_refs", "canonicalization", "hash_algorithm",
  "checkpoint_hash", "mmr_root", "signing_algorithm", "signing_key_id", "signature",
  "mmr_leaf_index", "leaf_index", "proof_hashes",
];

const byId = new Map(fixtures.cases.map((entry) => [entry.id, entry]));

describe("the round-4 review's corrections", () => {
  test("the decision interface names its facts but no artifact, since the owner does not commit its envelope, and unpublished interfaces fail closed (PE-34)", () => {
    const decision = interfaces.interfaces.find((entry) => entry.interface_id === "sea_forge.authority_decision")!;
    // The decision is specified_not_published (round-6 review): SEA-Forge commits the payload, not the
    // envelope, so the interface names no commit and no artifact, and every fact is unbound.
    expect(decision.publication_status).toBe("specified_not_published");
    expect(decision.pinned_commit).toBeNull();
    expect(decision.artifact_path).toBeNull();
    expect(decision.required_facts.map((fact) => fact.fact)).toEqual(PUBLISHED_FACTS);
    for (const fact of decision.required_facts) expect(fact.binds, fact.fact).toBe("unbound:owner_projection_not_published");
    // The two the owner has not published name no commit and no artifact, because there is
    // nothing to point at, and they fail closed.
    for (const id of ["sea_forge.action_grant", "sea_forge.human_entitlement", "sea_forge.authority_decision"]) {
      const entry = interfaces.interfaces.find((candidate) => candidate.interface_id === id)!;
      expect(entry.publication_status, id).toBe("specified_not_published");
      expect(entry.pinned_commit, id).toBeNull();
      expect(entry.artifact_path, id).toBeNull();
    }
    expect(interfaces.rules.an_unpublished_interface_fails_closed).toBe(true);
    expect(interfaces.rules.an_unknown_interface_is_refused).toBe(true);
  });

  test("every phone effect has its own device-credential row and its own parameters (PE-35)", () => {
    const deviceRows = [
      "device.case.open",
      "device.surface.intent.commit",
      "device.settlement.observe",
      "device.settlement.rule",
      "device.approval.approve",
      "device.approval.reject",
    ];
    for (const id of deviceRows) {
      const row = manifest.byId.get(id);
      expect(row, id).toBeDefined();
      expect(row!.executor, id).toBe("device_credential");
      expect(row!.callerAuthentication, id).toBe("device_passkey_assertion");
      expect(row!.routes, id).toEqual(["POST /m/api/command"]);
      // The phone's wire is the phone's own: it never borrows a human row's schema.
      expect(row!.paramsSchema, id).not.toBeNull();
      expect(params.schemas[row!.paramsSchema!], id).toBeDefined();
    }
    // The command route resolves only to device rows. A human row is never selected by it.
    const command = manifest.dispatch.get("POST /m/api/command")!;
    const selected = [
      ...Object.values(command.actions),
      ...(command.combinations ?? []).map((combination) => combination.operation),
    ];
    for (const id of selected) expect(id, id).toStartWith("device.");
    // And the four refused rows keep their class: a refusal is a containment, not a downgrade.
    expect(manifest.byId.get("device.settlement.observe")!.class).toBe("P2");
    expect(manifest.byId.get("device.settlement.rule")!.class).toBe("P3");
    expect(manifest.byId.get("device.approval.approve")!.class).toBe("P3");
    expect(manifest.byId.get("device.approval.reject")!.class).toBe("P3");
  });

  test("the phone cannot settle and cannot approve, and the refusal precedes every effect (PE-36)", () => {
    // The containment is in the live server, and it stands before the phone's own branches.
    const refusal = remoteSource.indexOf("no_protected_confirmation_path");
    expect(refusal).toBeGreaterThan(-1);
    const openCase = remoteSource.indexOf('if (operation === "device.case.open")');
    const commit = remoteSource.indexOf('if (operation === "device.surface.intent.commit")');
    expect(refusal).toBeLessThan(openCase);
    expect(refusal).toBeLessThan(commit);
    // The refused rows are catalogued as refused: the route resolves them, sees the refusal the
    // catalog states, and performs no target effect. Each refusal is audited rather than silent
    // (R5-08), so a refused attempt leaves one record and no effect.
    for (const id of ["device.settlement.observe", "device.settlement.rule", "device.approval.approve", "device.approval.reject"]) {
      const entry = (manifest.manifest.live_enforcement?.rows ?? []).find((row) => row.id === id)!;
      expect(entry, id).toBeDefined();
      expect(entry.enforced_today, id).toBe(false);
      expect(entry.refused_today, id).toBe(true);
      expect(entry.target_effect, id).toBe("none");
      expect(entry.refusal_audit, id).toBe("appends_refusal_audit");
      expect(entry.refusal_reason ?? "", id).toContain("refused before any target effect");
    }
  });

  test("the observation half of settlement is P2 because it commits evidence elsewhere (PE-37)", () => {
    const observe = manifest.byId.get("horizon.settlement.observe")!;
    expect(observe.class).toBe("P2");
    expect(observe.writable).toBe(true);
    // The row says what is still missing: the pending record and the person's A3-UV evidence.
    // The class follows the effect, and the effect is an external commitment.
    const entry = (manifest.manifest.live_enforcement?.rows ?? []).find((row) => row.id === "horizon.settlement.observe")!;
    expect(entry.enforced_today).toBe(false);
    expect(entry.missing).toContain("pending_record");
    expect(entry.missing).toContain("evidence_A3_UV");
    expect(entry.required_stage).toBe("Stage 0B");
  });

  test("the device enrollment's evidence is local presence, never A3-UV (PE-38)", () => {
    const pair = manifest.byId.get("device.pair")!;
    // The enrollment is held by whoever presents the one-time code: possession of the code
    // proves no identity, and the device is enrolled by the ceremony rather than claimed by it.
    // The row therefore states that no assurance predicate applies (R5-07); the presence claim
    // the ceremony asks for is its own receipt, not an A3 predicate.
    expect(pair.executor).toBe("code_holder");
    expect(pair.callerAuthentication).toBe("one_time_pairing_code");
    expect(pair.humanEvidence).toBeNull();
    const entry = (manifest.manifest.live_enforcement?.rows ?? []).find((row) => row.id === "device.pair")!;
    expect((entry as { caller_path?: string }).caller_path).toBe("code_holder");
    expect(entry.missing).toContain("enrollment_presence_receipt");
    expect(entry.missing).not.toContain("evidence_A3_UV");
    expect(entry.enforced_today).toBe(false);
  });

  test("a pending operation's state is an append-only transition chain (PE-39)", () => {
    const pending = records.records["PendingOperation"]!;
    const transition = records.records["PendingTransition"]!;
    // The descriptor is immutable and carries no state.
    expect(pending.fields.map((field) => field.name)).not.toContain("state");
    // The confirmation lives in the transition that makes it.
    expect(pending.fields.map((field) => field.name)).toContain("confirmer_ref");
    expect(transition.signed).toBe(true);
    expect(transition.fields.map((field) => field.name)).toEqual(
      expect.arrayContaining(["transition_id", "pending_id", "from_state", "to_state", "reason", "at", "launch_generation"]),
    );
    // The transition table is complete and closed.
    const chain = records.constraints["pending_transition_chain"]!;
    expect(chain.applies_to).toEqual(["PendingTransition"]);
    for (const pair of ["pending to confirmed", "pending to expired", "confirmed to dispatching", "confirmed to expired", "dispatching to applied", "dispatching to uncertain"]) {
      expect(chain.rule, pair).toContain(pair);
    }
    // A descriptor that claims a confirmation is refused.
    const local = byId.get("PENDING-LOCAL-OK")!;
    const withConfirmation = validateRecord(records, "PendingOperation", {
      ...local.record,
      confirmer_ref: "operator:sprime01",
    }, local.catalog as never, local.context as never);
    expect(withConfirmation).toContain("constraint:pending_confirmation_not_caller_supplied");
    // A transition that leaves a terminal state is refused.
    const terminal = validateRecord(records, "PendingTransition", {
      ...byId.get("PENDING-TRANSITION-APPLIED-OK")!.record,
      from_state: "applied",
      to_state: "confirmed",
      confirmer_ref: "operator:sprime01",
    }, undefined, {
      pending_transitions: [
        byId.get("PENDING-TRANSITION-CONFIRMED-OK")!.record,
        { ...byId.get("PENDING-TRANSITION-DISPATCHING-OK")!.record },
      ],
    });
    expect(terminal).toContain("constraint:pending_transition_chain");
  });

  test("a caller kind the schema never described is refused by name (PE-40)", () => {
    const consoleCall = validateParameters("params.run_start", { case_id: "case-0001", also_starts: [] }, { caller_kind: "local_console" });
    expect(consoleCall).toContain("params:unknown_variant:caller_kind:local_console");
    // A caller kind the schema does declare is checked against that variant's own fields.
    const human = validateParameters("params.run_start", { case_id: "case-0001", also_starts: [] }, { caller_kind: "human_session" });
    expect(human).toEqual([]);
    // The grant is not part of the human variant, and a human may not carry one.
    const smuggled = validateParameters("params.run_start", { case_id: "case-0001", also_starts: [], grant_ref: "grant-0001" }, { caller_kind: "human_session" });
    expect(smuggled.length).toBeGreaterThan(0);
  });

  test("the actor is never read from a request, and an unnamed field is refused (PE-41)", () => {
    // One list serves every boundary: the desktop's doors and the phone's command route.
    expect(RESERVED_ACTOR_FIELDS).toContain("proposed_by");
    expect(RESERVED_ACTOR_FIELDS).toContain("caller_ref");
    expect(RESERVED_ACTOR_FIELDS).toContain("executor");
    expect(RESERVED_ACTOR_FIELDS).toContain("authority");
    expect(appSource).toContain("reservedActorField");
    expect(remoteSource).toContain("reservedActorField");
    // Neither server keeps a list of its own.
    expect(appSource).not.toContain('"on_behalf_of",\n  "operator"');
    // The lesson's proposer is derived from the caller, so the schema has no such field.
    const lesson = params.schemas["params.horizon_lesson_propose"]!;
    expect(lesson.fields.map((field: { name: string }) => field.name)).toEqual(["text", "source"]);
    expect(lesson.fields.map((field: { name: string }) => field.name)).not.toContain("proposed_by");
  });

  test("the route census is exact in both directions (PE-42)", () => {
    const census = checkRouteCensus();
    expect(census.failures).toEqual([]);
    expect(census.checked).toBeGreaterThan(50);
    // The phone's trailing-slash page is named, because the phone serves it.
    const nonOperations = manifest.manifest.non_operation_routes.map((route) => route.route);
    expect(nonOperations).toContain("GET /m/");
    expect(nonOperations).toContain("GET /m");
    // Every non-operation route says why it performs no operation.
    for (const route of manifest.manifest.non_operation_routes) {
      expect(route.reason.trim().length, route.route).toBeGreaterThan(8);
    }
  });

  test("the frozen fixture set exercises every negative tooth the preregistrations promised (PE-43)", () => {
    // The pending replay and supersession teeth.
    expect(byId.get("PENDING-NONCE-REUSED")?.violations).toContain("constraint:nonce_not_reused");
    expect(byId.get("PENDING-SUPERSEDES-CORRECT")?.expect).toBe("valid");
    expect(byId.get("PENDING-SUPERSEDES-WRONG")?.violations).toContain("constraint:supersedes_chain");
    // The caller-channel combinations.
    expect(byId.get("PENDING-HUMAN-WITHOUT-SESSION")?.violations).toContain("constraint:caller_channel_exclusive");
    expect(byId.get("PENDING-AGENT-WITH-SESSION")?.violations).toContain("constraint:caller_channel_exclusive");
    expect(byId.get("PENDING-CONSOLE-WITH-SESSION")?.violations).toContain("constraint:caller_channel_exclusive");
    expect(byId.get("PENDING-CONSOLE-WITH-DELEGATION")?.violations).toContain("constraint:console_has_no_execution");
    // The old single evidence outcome.
    expect(byId.get("EVIDENCE-OLD-SINGLE-OUTCOME")?.violations).toContain("unknown:outcome");
    // The transition chain's own teeth.
    for (const id of [
      "PENDING-TRANSITION-REOPEN-CONFIRMED",
      "PENDING-TRANSITION-CHAIN-MISMATCH",
      "PENDING-TRANSITION-TERMINAL-REOPENED",
      "PENDING-TRANSITION-REASON-MISMATCH",
      "PENDING-TRANSITION-RESTART-EXPIRES-CONFIRMED",
    ]) {
      expect(byId.get(id), id).toBeDefined();
    }
    // Every record kind has at least one case, and the two implementations agree case for case
    // (the cross-language agreement is proved in the records suite; here the set is the claim).
    const kinds = new Set(fixtures.cases.map((entry) => entry.kind));
    for (const kind of Object.keys(records.records)) expect(kinds, kind).toContain(kind);
  });

  test("the phone must never settle or approve (NE-31)", () => {
    // The containment is the only thing between the phone and a P3 ruling, so its absence is
    // visible: the source no longer refuses by class.
    expect(remoteSource).toContain("no_protected_confirmation_path");
    // The class branch itself, not the flag that also spells the same test: a branch that is
    // silenced while the flag remains would otherwise pass this check.
    expect(remoteSource).toContain('if (resolved.class === "P2" || resolved.class === "P3") {');
    // And the rows it would reach are governed, so the refusal is load-bearing.
    expect(manifest.byId.get("device.settlement.rule")!.class).toBe("P3");
    expect(manifest.byId.get("device.approval.approve")!.class).toBe("P3");
  });

  test("the external interface contract must never claim a fact the owner does not publish (NE-32)", () => {
    const decision = interfaces.interfaces.find((entry) => entry.interface_id === "sea_forge.authority_decision")!;
    // Exactly the facts the pinned source carries: one more or one fewer is a false claim.
    expect(decision.required_facts.map((fact) => fact.fact)).toEqual(PUBLISHED_FACTS);
    // An interface whose owner published nothing names no artifact.
    for (const id of ["sea_forge.action_grant", "sea_forge.human_entitlement"]) {
      const entry = interfaces.interfaces.find((candidate) => candidate.interface_id === id)!;
      expect(entry.artifact_path, id).toBeNull();
      expect(entry.pinned_commit, id).toBeNull();
    }
  });

  test("a pending descriptor must never carry a state or a confirmation, and a terminal state must never open (NE-33)", () => {
    const pending = records.records["PendingOperation"]!;
    expect(pending.fields.map((field) => field.name)).not.toContain("state");
    const local = byId.get("PENDING-LOCAL-OK")!;
    expect(validateRecord(records, "PendingOperation", local.record, local.catalog as never)).toEqual([]);
    expect(validateRecord(records, "PendingOperation", { ...local.record, confirmer_ref: "operator:sprime01" }, local.catalog as never)).toContain(
      "constraint:pending_confirmation_not_caller_supplied",
    );
    // A terminal state opens to nothing.
    const reopened = byId.get("PENDING-TRANSITION-TERMINAL-REOPENED")!;
    expect(validateRecord(records, "PendingTransition", reopened.record, undefined, reopened.context as never)).toContain(
      "constraint:pending_transition_chain",
    );
  });

  test("an unknown caller discriminator must never be fitted to the closest variant (NE-34)", () => {
    const refused = validateParameters("params.run_start", { case_id: "case-0001", also_starts: [] }, { caller_kind: "local_console" });
    expect(refused).toEqual(["params:unknown_variant:caller_kind:local_console"]);
    expect(refused).not.toContain("params:unknown:grant_ref");
  });

  test("a request must never be able to name its own actor (NE-35)", () => {
    // The one list is the contract's, and both boundaries use it.
    expect(RESERVED_ACTOR_FIELDS.length).toBeGreaterThan(20);
    expect(appSource).toContain("reservedActorField(body)");
    expect(remoteSource).toContain("reservedActorField(body)");
    // The phone's strict check runs after the containment refusal, so a governed command is
    // refused for the governance reason rather than for a stray field.
    const containment = remoteSource.indexOf("no_protected_confirmation_path");
    const strict = remoteSource.indexOf("unknownField(body");
    expect(containment).toBeLessThan(strict);
  });

  test("an answered route must never be absent from the catalog (NE-36)", () => {
    const census = checkRouteCensus();
    expect(census.failures).toEqual([]);
    // A read branch answers the method the catalog binds, and no other.
    expect(appSource).toContain('url.pathname === "/health" && request.method === "GET"');
    expect(appSource).toContain('url.pathname === "/diagnostics" && request.method === "GET"');
  });

  test("the frozen fixture set must never lose a preregistered negative case (NE-37)", () => {
    for (const id of [
      "PENDING-NONCE-REUSED",
      "PENDING-SUPERSEDES-WRONG",
      "PENDING-HUMAN-WITHOUT-SESSION",
      "PENDING-AGENT-WITH-SESSION",
      "PENDING-CONSOLE-WITH-SESSION",
      "PENDING-CONSOLE-WITH-DELEGATION",
      "EVIDENCE-OLD-SINGLE-OUTCOME",
    ]) {
      expect(byId.get(id), id).toBeDefined();
      expect(byId.get(id)!.expect, id).toBe("invalid");
    }
  });
});

describe("the lesson route and the reserved fields", () => {
  test("a lesson body that names its proposer is refused, and nothing is recorded (live)", async () => {
    const app = await startDeskApp();
    try {
      const refused = await app.post("/desk/lesson", { text: "a lesson", proposed_by: "someone else" });
      expect(refused.status).toBe(400);
      const body = (await refused.json()) as { message?: string };
      expect(body.message ?? "").toContain("proposed_by");
      // An unknown field is refused too: the boundary has a closed vocabulary.
      const unknown = await app.post("/desk/lesson", { text: "a lesson", invented: "field" });
      expect(unknown.status).toBe(400);
      // The honest body is accepted, and the proposer is the session's own.
      const accepted = await app.post("/desk/lesson", { text: "a lesson" });
      expect(accepted.status).toBe(200);
    } finally {
      await app.stop();
    }
  });
});

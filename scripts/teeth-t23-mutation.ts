/**
 * T23 mutation teeth: do the identity checks reject a violating catalog or record contract?
 *
 * The teeth suite passing against the real contracts proves only that the contracts currently
 * agree with it. This script breaks one protected property at a time in a throwaway copy of the
 * tree, runs the *named* tooth, and requires that tooth to fail by assertion. A compile error, a
 * crash, or a missing test does not count as a caught mutant — those would be noise, not
 * detection.
 *
 * What a passing run means: these twenty-eight hypotheses were caught. It is P2 evidence for strength,
 * not a claim that every arbitrary violation would be detected.
 *
 * Bounded on purpose: each mutant runs one named test under a memory cap, so a runner is never
 * handed a whole-suite bill. node_modules is linked rather than copied, because the mutated tree
 * only reads contracts and source text.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");

interface Mutant {
  readonly id: string;
  readonly expectation: string;
  readonly file: string;
  readonly testFile: string;
  readonly title: string;
  /** The text to replace, for a textual mutation. */
  readonly find?: string;
  /** The replacement text, for a textual mutation. */
  readonly replace?: string;
  /** The id of a case to delete, for a mutation that removes a case from the shared fixture set. */
  readonly removeFixtureCase?: string;
  /** Several textual mutations, one per file, for a claim that is layered across files. */
  readonly edits?: readonly { readonly file: string; readonly find: string; readonly replace: string }[];
}

const CONTRACT_TEST = "test/identity-contract.test.ts";
const RECORDS_TEST = "test/identity-records.test.ts";
const DEFECTS_TEST = "test/identity-defects.test.ts";
const REMEDIATION_2_TEST = "test/identity-remediation-2.test.ts";
const REMEDIATION_3_TEST = "test/identity-remediation-3.test.ts";
const REMEDIATION_4_TEST = "test/identity-remediation-4.test.ts";

const RECORDS_SPAN = "      const successors = allowed[from] ?? [];\n      const match = successors.find((entry) => entry.to === to);\n      if (match === undefined) fail(\"pending_transition_chain\");\n      else if (!match.reasons.includes(reason)) fail(\"pending_transition_chain\");\n      // The chain: the state this transition leaves is the state the operation's prior transitions\n      // leave it in, and `pending` when it is the first.\n      const prior = context?.pending_transitions ?? [];\n      const previous = prior.length === 0 ? \"pending\" : stringOf(prior[prior.length - 1]!, \"to_state\");\n      if (previous !== from) fail(\"pending_transition_chain\");\n";

const RECORDS_MUTATED = "      const successors = allowed[from] ?? [];\n      const match = successors.find((entry) => entry.to === to);\n      if (match === undefined) { /* the transition rule was removed */ }\n      else if (!match.reasons.includes(reason)) { /* the transition rule was removed */ }\n      // The chain: the state this transition leaves is the state the operation's prior transitions\n      // leave it in, and `pending` when it is the first.\n      const prior = context?.pending_transitions ?? [];\n      const previous = prior.length === 0 ? \"pending\" : stringOf(prior[prior.length - 1]!, \"to_state\");\n      if (previous !== from) { /* the transition rule was removed */ }\n";

const PARAMS_FIND = "  if (chosen.unknownVariant !== null) {\n    return [`params:unknown_variant:${schema.discriminator}:${chosen.unknownVariant}`];\n  }\n";

const PARAMS_REPLACE = "  if (chosen.unknownVariant !== null) {\n    // the unknown-variant refusal was removed: the closest variant is fitted instead\n  }\n";

const ENTITLEMENT_FIND = "      \"interface_id\": \"sea_forge.human_entitlement\",\n      \"interface_version\": \"1\",\n      \"owner\": \"GodSpeedAI/SEA-Forge\",\n      \"repository\": \"https://github.com/GodSpeedAI/SEA-Forge.git\",\n      \"pinned_commit\": null,\n      \"pinned_commit_date\": null,\n      \"artifact_path\": null,\n      \"artifact_symbol\": null,\n      \"publication_status\": \"specified_not_published\",\n";

const ENTITLEMENT_REPLACE = "      \"interface_id\": \"sea_forge.human_entitlement\",\n      \"interface_version\": \"1\",\n      \"owner\": \"GodSpeedAI/SEA-Forge\",\n      \"repository\": \"https://github.com/GodSpeedAI/SEA-Forge.git\",\n      \"pinned_commit\": null,\n      \"pinned_commit_date\": null,\n      \"artifact_path\": null,\n      \"artifact_symbol\": null,\n      \"publication_status\": \"published\",\n";

const MUTANTS: readonly Mutant[] = [
  {
    id: "M1 a governed row is satisfied by a local-policy writer",
    expectation: "NE-02",
    file: "contracts/identity/v1/operations.yaml",
    testFile: CONTRACT_TEST,
    title: "a governed operation is never satisfied by a local-policy writer or A0/A1 evidence (NE-02)",
    find: "      authority_writer: case_record.authority\n      ownership: person_owns_board",
    replace: "      authority_writer: cognate_local_policy\n      ownership: person_owns_board",
  },
  {
    id: "M2 an unlisted operation falls back to a local read",
    expectation: "NE-01",
    file: "src/contracts/identity/manifest.ts",
    testFile: CONTRACT_TEST,
    title: "an unlisted operation is Px, not something weaker (NE-01)",
    find: '  return { id: operationId, class: "PX", reason: "unlisted_operation", refusal: "unlisted_operation" };',
    replace: '  return { id: operationId, class: "P0", reason: "unlisted_operation", refusal: "unlisted_operation" };',
  },
  {
    id: "M3 an unrecognized action on a dispatching route resolves to a row",
    expectation: "NE-03",
    file: "src/contracts/identity/manifest.ts",
    testFile: CONTRACT_TEST,
    title: "an unrecognized action is Px on every dispatching route (NE-03)",
    find: '  if (operationId === undefined) return { id: `${route}#${action}`, class: "PX", refusal: "unknown_action", route };',
    replace: '  if (operationId === undefined) return { id: `${route}#${action}`, class: "P1", refusal: "unknown_action", route };',
  },
  {
    id: "M4 the agent door stops refusing the person's reserved operations",
    expectation: "NE-04",
    file: "src/contracts/identity/manifest.ts",
    testFile: CONTRACT_TEST,
    title: "a person's reserved operation cannot be reached from the agent door (NE-04)",
    find: "  if ((entry.refused_prefixes ?? []).some((prefix) => action.startsWith(prefix))) {",
    replace: "  if ((entry.refused_prefixes ?? []).some(() => false)) {",
  },
  {
    id: "M5 a human session is allowed to carry a delegation head",
    expectation: "NE-05",
    file: "src/contracts/identity/records.ts",
    testFile: RECORDS_TEST,
    title: "a human session never receives a fabricated grant or credential (PE-05, NE-05)",
    find: '      if (!isNull(record, "delegation_ref")) fail("human_has_no_grant");',
    replace: '      if (false) fail("human_has_no_grant");',
  },
  {
    id: "M6 a record may claim to be the execution it targets",
    expectation: "NE-06",
    file: "src/contracts/identity/records.ts",
    testFile: RECORDS_TEST,
    title: "the caller kind cannot be substituted (PE-06, NE-06)",
    find: '    if (caller !== null && execution !== null && caller === execution) fail("caller_is_not_target");',
    replace: '    if (false) fail("caller_is_not_target");',
  },
  {
    id: "M7 an alias no longer fixes the action it names",
    expectation: "NE-07",
    file: "src/contracts/identity/records.ts",
    testFile: RECORDS_TEST,
    title: "an operation's class cannot be lowered through an alias or a parameter (PE-07, NE-07)",
    find: '        if (supplied !== fixed.value) fail("alias_fixes_action");',
    replace: '        if (false) fail("alias_fixes_action");',
  },
  {
    id: "M8 a governed operation is allowed offline",
    expectation: "NE-08",
    file: "contracts/identity/v1/operations.yaml",
    testFile: CONTRACT_TEST,
    title: "offline work is confined to P0/P1 and never extends a grant (NE-08)",
    find: "    human_evidence: A3-UV\n    stage0b_evidence: A3-T\n    pending_expiry: 10m\n    offline_allowed: false",
    replace: "    human_evidence: A3-UV\n    stage0b_evidence: A3-T\n    pending_expiry: 10m\n    offline_allowed: true",
  },
  {
    id: "M9 the catalog loader tolerates an unrecognized key",
    expectation: "NE-09",
    file: "src/contracts/identity/manifest.ts",
    testFile: CONTRACT_TEST,
    title: "a stale or malformed manifest fails loudly (NE-09)",
    find: "    note: z.string().optional(),\n  })\n  .strict();",
    replace: "    note: z.string().optional(),\n  })\n  .passthrough();",
  },
  {
    id: "M10 a governed row is reclassified as a local write",
    expectation: "PE-01",
    file: "contracts/identity/v1/operations.yaml",
    testFile: CONTRACT_TEST,
    title: "the catalog has the reconciled shape (PE-01)",
    find: "    - id: horizon.settlement.observe\n      binding: verified",
    replace: '    - id: horizon.settlement.observe\n      class: "P1"\n      binding: verified',
  },
  {
    id: "M11 the agent door's dispatch table loses an action",
    expectation: "PE-02",
    file: "contracts/identity/v1/operations.yaml",
    testFile: CONTRACT_TEST,
    title: "every agent-door tool the code accepts has a reviewed row (PE-02)",
    find: "      show_surface: agent.surface.publish\n",
    replace: "",
  },
  {
    id: "M12 the record validator stops reporting an unknown field",
    expectation: "PE-14",
    file: "src/contracts/identity/records.ts",
    testFile: RECORDS_TEST,
    title: "both implementations must produce exactly the listed violations (PE-14)",
    find: "    if (!declared.has(key)) violations.push(`unknown:${key}`);",
    replace: "    if (!declared.has(key)) void key;",
  },
  // The defect-remediation unit (STAGE-0A-DEFECTS). Each of these undoes one closure, so the
  // unit's own negative tests must fail against it.
  {
    id: "M13 the surface route stops refusing a body that names an actor",
    expectation: "NE-13",
    file: "src/app.ts",
    testFile: DEFECTS_TEST,
    title: "a body that names a role is refused, and nothing is written (NE-13)",
    find: "              if (field in record) {",
    replace: "              if (false) {",
  },
  {
    id: "M14 the durable record stops naming the executor",
    expectation: "PE-15",
    file: "src/capabilities/panel-answers.ts",
    testFile: DEFECTS_TEST,
    title: "an agent's route claim records the key that made it, and the catalog row names it (PE-15)",
    find: "routed_as: routedAs, executed_by_key: executedByKey,",
    replace: "routed_as: routedAs,",
  },
  {
    id: "M15 the agent door starts taking an identity from the body",
    expectation: "NE-15",
    file: "src/app.ts",
    testFile: DEFECTS_TEST,
    title: "the agent door refuses every field that would name an actor (NE-15)",
    find: "      if (field in op) return refuse(400,",
    replace: "      if (false) return refuse(400,",
  },
  {
    id: "M16 the catalog row names an executor the route cannot authenticate",
    expectation: "PE-15",
    file: "contracts/identity/v1/operations.yaml",
    testFile: DEFECTS_TEST,
    title: "an agent's route claim records the key that made it, and the catalog row names it (PE-15)",
    find: "      executor: registered_agent\n      caller_authentication: registered_agent_key\n      authority_writer: case_record.authority\n      ownership: caller_owns_question",
    replace: "      executor: human_session\n      authority_writer: case_record.authority\n      ownership: caller_owns_question",
  },
  // The round-2 remediation unit (STAGE-0A-REMEDIATION). The entitlement is an external record,
  // and these two mutants undo the binding in the two places it can be undone.
  {
    id: "M17 the validator stops binding an entitlement to the record it authorizes",
    expectation: "NE-21",
    file: "src/contracts/identity/records.ts",
    testFile: RECORDS_TEST,
    title: "both implementations must produce exactly the listed violations (PE-14)",
    find: "    if (hasEntitlement && !hasGrant) {",
    replace: "    if (false) {",
  },
  {
    // The round-3 remediation. The owner has published no entitlement artifact, so the
    // entitlement-backed path is unavailable by design: a contract that claimed the artifact
    // existed would let a self-asserted fact set satisfy a governed human decision.
    id: "M18 the interface contract claims the owner published an entitlement artifact",
    expectation: "PE-34",
    file: "contracts/identity/v1/external-interfaces.json",
    testFile: REMEDIATION_3_TEST,
    title: "the decision interface names its facts but no artifact",
    find: ENTITLEMENT_FIND,
    replace: ENTITLEMENT_REPLACE,
  },
  {
    // The round-3 remediation. The phone's approval path is contained by a refusal, and the
    // refusal is the only thing between a phone command and an escalation.
    id: "M19 the phone's approve command resolves to a row the device may perform",
    expectation: "NE-22",
    file: "contracts/identity/v1/operations.yaml",
    testFile: REMEDIATION_2_TEST,
    title: "the phone can never answer an escalation (NE-22)",
    find: "      approve: device.approval.approve",
    replace: "      approve: device.case.open",
  },
  {
    // The round-3 remediation. The desk's decision route is a dispatcher: the pair the server
    // resolves picks the row, so downgrading the escalation pair downgrades a P3 approval.
    id: "M20 the desk's escalation pair is downgraded to the lesson row",
    expectation: "NE-23",
    file: "contracts/identity/v1/operations.yaml",
    testFile: REMEDIATION_2_TEST,
    title: "the desk's decision route never downgrades a P3 approval to a P2 row (NE-23)",
    find: "- { resolved: escalation, action: accept, operation: approval.approve }",
    replace: "- { resolved: escalation, action: accept, operation: lesson.decide }",
  },
  {
    // The round-3 remediation. A pending record names exactly one caller channel, and the rule
    // that says so is the only thing that refuses a record naming two.
    id: "M21 a pending record may name two caller channels",
    expectation: "NE-25",
    file: "src/contracts/identity/records.ts",
    testFile: REMEDIATION_2_TEST,
    title: "a pending record that names two caller channels is refused (NE-25)",
    find: '      if (session === null || execution !== null || delegation !== null) fail("caller_channel_exclusive");',
    replace: "      // the channel rule was removed",
  },
  {
    // The round-4 remediation. The phone's containment is the only thing between a device
    // credential and a governed row, so removing it is what lets the phone settle or approve.
    id: "M22 the phone's governed-row containment is removed",
    expectation: "NE-31",
    file: "src/remote/server.ts",
    testFile: REMEDIATION_3_TEST,
    title: "the phone must never settle or approve (NE-31)",
    // Two layers hold the phone's governed rows: the server's class branch and the catalog's
    // refusal the phone's command resolves through. The claim is tested only when both are gone.
    edits: [
      { file: "src/remote/server.ts", find: '    if (resolved.class === "P2" || resolved.class === "P3") {', replace: "    if (false) {" },
      {
        file: "src/app.ts",
        find: 'const refusal = frozenRefusal(catalog, operation, { route: "POST /m/api/command", codeOp: kind });',
        replace: "const refusal = undefined as ReturnType<typeof frozenRefusal>;",
      },
    ],
  },
  {
    // The round-4 remediation. The contract's claim about the owner's published artifact is
    // exactly the list of facts that artifact carries, so naming a fact it does not carry is a
    // false claim about another project's source.
    id: "M23 the contract names a fact the owner does not publish",
    expectation: "NE-32",
    file: "contracts/identity/v1/external-interfaces.json",
    testFile: REMEDIATION_3_TEST,
    title: "the external interface contract must never claim a fact the owner does not publish (NE-32)",
    find: '          "fact": "envelope_id",',
    replace: '          "fact": "resource_scope",',
  },
  {
    // The round-4 remediation. The pending operation's state is an append-only transition
    // chain, and the chain rule is the only thing that refuses a transition that does not fit.
    id: "M24 a pending transition may leave a terminal state",
    expectation: "NE-33",
    file: "src/contracts/identity/records.ts",
    testFile: REMEDIATION_3_TEST,
    title: "a pending descriptor must never carry a state or a confirmation, and a terminal state must never open (NE-33)",
    find: RECORDS_SPAN,
    replace: RECORDS_MUTATED,
  },
  {
    // The round-4 remediation. A caller kind the schema never described is refused by name,
    // because fitting it to the closest variant hands that caller another caller's wire
    // contract.
    id: "M25 an unknown caller discriminator is fitted to the closest variant",
    expectation: "NE-34",
    file: "src/contracts/identity/params.ts",
    testFile: REMEDIATION_3_TEST,
    title: "an unknown caller discriminator must never be fitted to the closest variant (NE-34)",
    find: PARAMS_FIND,
    replace: PARAMS_REPLACE,
  },
  {
    // The round-4 remediation. The reserved-actor-field list is the contract's, and the
    // boundary's refusal is the only thing between a request and a body that names its own
    // actor.
    id: "M26 the boundary stops refusing a body that names an actor",
    expectation: "NE-35",
    file: "src/app.ts",
    testFile: REMEDIATION_3_TEST,
    title: "a request must never be able to name its own actor (NE-35)",
    find: "    const named = reservedActorField(body);",
    replace: "    const named: string | null = null;",
  },
  {
    // The round-4 remediation. A read branch answers the method the catalog binds and no
    // other, so a method the contract never bound must not reach the handler behind it.
    id: "M27 the liveness probe answers a method the catalog does not bind",
    expectation: "NE-36",
    file: "src/app.ts",
    testFile: REMEDIATION_3_TEST,
    title: "an answered route must never be absent from the catalog (NE-36)",
    find: '    if (url.pathname === "/health" && request.method === "GET") {',
    replace: '    if (url.pathname === "/health") {',
  },
  {
    // The round-4 remediation. The frozen fixture set is the executable evidence, so a case
    // that is quietly dropped takes its tooth with it.
    id: "M28 a preregistered negative case is deleted from the frozen fixture set",
    expectation: "NE-37",
    file: "contracts/identity/v1/fixtures/record-cases.json",
    testFile: REMEDIATION_3_TEST,
    title: "the frozen fixture set must never lose a preregistered negative case (NE-37)",
    removeFixtureCase: "PENDING-NONCE-REUSED",
  },
  {
    // The round-5 remediation. A fact whose bind names a record field the records contract does
    // not declare is a claim about nothing, so the checker must refuse it.
    id: "M29 a fact binds to a record field the records contract does not declare",
    expectation: "NE-38",
    file: "scripts/check-external-interface-facts.ts",
    testFile: REMEDIATION_4_TEST,
    title: "NE-38: a fact with no component",
    find: "if (!names.includes(field)) fail(",
    replace: "if (false && !names.includes(field)) fail(",
  },
  {
    // The round-5 remediation. A fact is checked in the owner struct that carries it, not in the
    // joined source of every file, so a struct the owner does not declare must fail.
    id: "M30 a fact is checked against the joined source instead of its named struct",
    expectation: "NE-38",
    file: "scripts/check-external-interface-facts.ts",
    testFile: REMEDIATION_4_TEST,
    title: "NE-38: a fact with no component",
    find: "const scope = source.struct === null ? text : structBody(text, source.struct);",
    replace: "const scope = text;",
  },
  {
    // The round-5 remediation. The reachable desk P3 rows are refused on every path, so a row
    // the catalog stops refusing must fail its own test.
    id: "M31 a reachable desk P3 row stops being refused",
    expectation: "PE-47",
    file: "src/contracts/identity/enforcement.ts",
    testFile: REMEDIATION_4_TEST,
    title: "PE-47: the reachable desk P3 rows are refused on every path",
    find: "if (entry === undefined) return null;",
    replace: "if (entry === undefined || entry.id === \"approval.approve\") return null;",
  },
  {
    // The round-5 remediation. A phone commit is refused with no device delegation; a refusal
    // that lapses would let the device credential stand in for the operator.
    id: "M32 a phone commit stops being refused for lack of device delegation",
    expectation: "PE-49",
    file: "src/contracts/identity/enforcement.ts",
    testFile: REMEDIATION_4_TEST,
    title: "PE-49: a phone commit is refused with no device delegation",
    find: "if (entry === undefined) return null;",
    replace: "if (entry === undefined || entry.id === \"device.surface.intent.commit\") return null;",
  },
  {
    // The round-5 remediation. An anonymous row states no human evidence; a loader that gives it
    // an assurance predicate instead would let a health probe claim an A0 it cannot produce.
    id: "M33 a row that sets no separation of duty is treated as requiring it",
    expectation: "PE-52",
    file: "src/contracts/identity/manifest.ts",
    testFile: REMEDIATION_4_TEST,
    title: "PE-52: anonymous and code-holder rows state no human evidence",
    find: "    separationOfDuty: raw.separation_of_duty ?? base.separation_of_duty ?? null,",
    replace: "    separationOfDuty: raw.separation_of_duty ?? base.separation_of_duty ?? true,",
  },
  {
    // Stage 0B. A label that runs without the gate's answer is written with no confirmation.
    id: "M34 the label route ignores a waiting confirmation",
    expectation: "PE-58",
    file: "src/app.ts",
    testFile: "test/containment-routes.test.ts",
    title: "PE-58: a label without a confirmation is answered 409 and is not saved",
    find: "if (!labelWaiting.ok) return awaitingLocalConfirmation(",
    replace: "if (false) return awaitingLocalConfirmation(",
  },
  {
    // Stage 0B. The stored descriptor holds the code itself, so the record would reveal the confirmation.
    id: "M35 the descriptor stores the confirmation code",
    expectation: "PE-54",
    file: "src/capabilities/pending-confirmations.ts",
    testFile: "test/pending-confirmations.test.ts",
    title: "PE-54: the code is shown on the terminal and never stored",
    find: "confirmation_digest: codeDigest(pendingId, code),",
    replace: "confirmation_digest: code,",
  },
  {
    // Stage 0B. A wrong code confirms.
    id: "M36 a wrong code confirms the descriptor",
    expectation: "NE-41",
    file: "src/capabilities/pending-confirmations.ts",
    testFile: "test/pending-confirmations.test.ts",
    title: "NE-41: a wrong code confirms nothing",
    find: "if (given.length !== want.length || !timingSafeEqual(given, want)) {",
    replace: "if (false) {",
  },
  {
    // Stage 0B. An expired descriptor can still be confirmed.
    id: "M37 an expired descriptor can still be confirmed",
    expectation: "NE-42",
    file: "src/capabilities/pending-confirmations.ts",
    testFile: "test/pending-confirmations.test.ts",
    title: "NE-42: an expired descriptor cannot be confirmed",
    find: "if (input.now.getTime() > Date.parse(descriptor.expires_at)) {",
    replace: "if (false) {",
  },
  {
    // Stage 0B. Two racing requests both run on one confirmation.
    id: "M38 a lost race still runs the operation",
    expectation: "NE-43",
    file: "src/capabilities/pending-confirmations.ts",
    testFile: "test/pending-confirmations.test.ts",
    title: "NE-43: a confirmed descriptor is consumed exactly once",
    find: "if (moved) return { ok: true, pending_id: descriptor.pending_id };",
    replace: "if (true) return { ok: true, pending_id: descriptor.pending_id };",
  },
  {
    // Stage 0B. A confirmation for one parameter set is applied to another.
    id: "M39 a confirmation is matched without the operation digest",
    expectation: "NE-45",
    file: "src/capabilities/pending-confirmations.ts",
    testFile: "test/pending-confirmations.test.ts",
    title: "NE-45: a confirmation for one operation, parameters or operator is never consumed by another",
    find: "{ tenant: input.tenant, operation_digest: digest }",
    replace: "{ tenant: input.tenant }",
  },
  {
    // Stage 0B. The terminal does not name the operation it asks the person to confirm.
    id: "M40 the confirm command stops naming the operation",
    expectation: "PE-56",
    file: "src/capabilities/confirm-command.ts",
    testFile: "test/pending-confirmations.test.ts",
    title: "PE-56: the confirm command renders the exact operation",
    find: "io.write(`Operation waiting for confirmation: ${descriptor.operation_id}`);",
    replace: "io.write(\"Operation waiting for confirmation.\");",
  },
  {
    // Stage 0B. A second request summons another descriptor instead of reusing the waiting one.
    id: "M41 a waiting descriptor is not reused",
    expectation: "PE-57",
    file: "src/capabilities/pending-confirmations.ts",
    testFile: "test/pending-confirmations.test.ts",
    title: "PE-57: a second request while one descriptor still waits reuses it",
    find: "if (head.state === \"pending\" && waiting === null) waiting = descriptor;",
    replace: "if (false) waiting = descriptor;",
  },
  {
    // Stage 0B. A confirmed descriptor is consumed but the operation is still answered as waiting.
    id: "M42 a confirmed operation is not run",
    expectation: "PE-55",
    file: "src/capabilities/pending-confirmations.ts",
    testFile: "test/pending-confirmations.test.ts",
    title: "PE-55: the typed code confirms exactly the named operation",
    find: "if (moved) return { ok: true, pending_id: descriptor.pending_id };",
    replace: "if (moved) return { ok: false, code: \"awaiting_local_confirmation\", pending_id: descriptor.pending_id, expires_at: descriptor.expires_at };",
  },
  {
    // Stage 0B. Without a terminal the descriptor is still written.
    id: "M43 a request without a terminal still writes a descriptor",
    expectation: "NE-44",
    file: "src/capabilities/pending-confirmations.ts",
    testFile: "test/pending-confirmations.test.ts",
    title: "NE-44: without a terminal nothing is written",
    find: "if (codeSink === null && !output.terminal(",
    replace: "if (false && !output.terminal(",
  },
  {
    // Stage 0B. The repeated unconfirmed label reports success.
    id: "M44 the label route ignores a waiting confirmation on repeat",
    expectation: "NE-46",
    file: "src/app.ts",
    testFile: "test/containment-routes.test.ts",
    title: "NE-46: repeating the label without confirming",
    find: "if (!labelWaiting.ok) return awaitingLocalConfirmation(",
    replace: "if (false) return awaitingLocalConfirmation(",
  },
];

function copyTree(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t23-mutation-"));
  // `domain` is a symlink to `.sea/interaction`, so the semantic world is copied with `.sea` and the
  // link is kept verbatim; without `.sea` the copy would hold a dangling link and the app could not
  // start, which is not evidence about the mutant.
  for (const entry of ["contracts", "src", "test", "scripts", ".sea", "domain", "design_draft.md", "package.json", "tsconfig.json", "bunfig.toml"]) {
    const from = path.join(ROOT, entry);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(dir, entry), { recursive: true, verbatimSymlinks: true });
  }
  // The contracts import zod; linking keeps the copy cheap and does not mutate the real tree.
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dir, "node_modules"), "dir");
  return dir;
}

function applyMutant(dir: string, mutant: Mutant): string | null {
  const target = path.join(dir, mutant.file);
  const source = fs.readFileSync(target, "utf8");
  if (mutant.removeFixtureCase !== undefined) {
    // A case is removed from the shared fixture set by its id. The file is written with two-space
    // indentation and a trailing newline, so the round trip is byte-identical and the mutation
    // touches only the case it names.
    const document = JSON.parse(source) as { cases?: { id?: string }[] };
    const cases = document.cases;
    if (cases === undefined) return `${mutant.file} has no \`cases\` array — the tooth is stale`;
    const before = cases.length;
    document.cases = cases.filter((entry) => entry.id !== mutant.removeFixtureCase);
    if (document.cases.length === before) {
      return `the fixture case ${mutant.removeFixtureCase} is not in ${mutant.file} — the tooth is stale`;
    }
    fs.writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);
    return null;
  }
  if (mutant.edits !== undefined) {
    // A containment that is layered across files is removed in every layer at once: a single
    // removed layer leaves the claim holding, so one edit cannot show the claim is tested.
    for (const edit of mutant.edits) {
      const site = path.join(dir, edit.file);
      const text = fs.readFileSync(site, "utf8");
      if (!text.includes(edit.find)) return `${edit.file}: the mutation site no longer exists — the tooth is stale`;
      fs.writeFileSync(site, text.replace(edit.find, edit.replace));
    }
    return null;
  }
  if (mutant.find === undefined || mutant.replace === undefined) {
    return `the mutant names no mutation site — the tooth is stale`;
  }
  if (!source.includes(mutant.find)) return `the mutation site no longer exists in ${mutant.file} — the tooth is stale`;
  fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
  return null;
}

function runTest(dir: string, testFile: string, title: string): { readonly passed: boolean; readonly output: string } {
  // Bun's `-t` takes a regular expression, so a literal title must be escaped before it is used
  // as a filter. An unescaped "(NE-08)" is a group, and the filter then matches nothing.
  const pattern = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const result = Bun.spawnSync(["bun", "test", testFile, "-t", pattern, "--timeout", "60000"], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NODE_ENV: "test" },
  });
  const output = `${result.stdout.toString()}${result.stderr.toString()}`;
  // Bun prints `   1 pass` / `   0 fail`; match word boundaries, not "0 filter".
  const passed = Number(/(\d+) pass/.exec(output)?.[1] ?? "0");
  const failed = Number(/(\d+) fail/.exec(output)?.[1] ?? "0");
  return { passed: result.exitCode === 0 && passed > 0 && failed === 0, output };
}

/** A caught mutant fails by assertion; a crash or a compile error is not detection. */
function isAssertionFailure(output: string): boolean {
  // Bun prints `error: expect(received).toEqual(expected)` for most matchers, and
  // `error: <label>` followed by `Expected:` / `Received:` for the ones that take a message.
  // Both are assertion failures; a missing module, a syntax error or an unhandled rejection is
  // noise, not detection.
  return (
    /error: expect\(|AssertionError|Expected:|Received:/.test(output) &&
    !/SyntaxError|Cannot find|Unhandled error|Expected ";"/.test(output)
  );
}

let failures = 0;
const report = (line: string): void => console.log(`  ${line}`);
const baselines = new Map<string, boolean>();

function baselinePasses(dir: string, testFile: string, title: string): boolean {
  const key = `${testFile}::${title}`;
  const cached = baselines.get(key);
  if (cached !== undefined) return cached;
  const result = runTest(dir, testFile, title);
  baselines.set(key, result.passed);
  if (!result.passed) report(`FAIL baseline ${key}\n${result.output.slice(-2000)}`);
  return result.passed;
}

for (const mutant of MUTANTS) {
  const dir = copyTree();
  try {
    if (!baselinePasses(dir, mutant.testFile, mutant.title)) {
      failures += 1;
      report(`FAIL ${mutant.expectation} (${mutant.id}): baseline does not pass, so the mutant is not evidence`);
      continue;
    }
    const problem = applyMutant(dir, mutant);
    if (problem !== null) {
      failures += 1;
      report(`FAIL ${mutant.expectation} (${mutant.id}): ${problem}`);
      continue;
    }
    const result = runTest(dir, mutant.testFile, mutant.title);
    if (result.passed) {
      failures += 1;
      report(`FAIL ${mutant.expectation} (${mutant.id}): the tooth passed against a broken identity contract`);
    } else if (!isAssertionFailure(result.output)) {
      failures += 1;
      report(`FAIL ${mutant.expectation} (${mutant.id}): failed without an assertion — not evidence\n${result.output.slice(-1500)}`);
    } else {
      report(`ok   ${mutant.expectation} (${mutant.id}): caught`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (failures === 0) console.log(`teeth-t23-mutation: ok — ${MUTANTS.length} mutants caught`);
else console.log(`teeth-t23-mutation: FAIL — ${failures} problem(s)`);
process.exit(failures === 0 ? 0 : 1);

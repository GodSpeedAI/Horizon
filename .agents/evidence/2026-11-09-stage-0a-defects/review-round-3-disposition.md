# Round-3 independent review — finding-by-finding disposition

The verdict retained verbatim at [`independent-review-round-3.md`](independent-review-round-3.md) is
**REJECT**: six blocking findings and four must-fix findings. The frozen copy the reviewer read is
[`frozen-round-3/`](frozen-round-3/) (mode `0444`, every file hash-pinned in `MANIFEST.sha256`,
declared to the reviewer before the read). The reviewer wrote no files and made no repository
change.

Every finding below was treated as a real disagreement and corrected in the contract set and, where
the design described it, in the design. Nothing was waived. The corrections are recorded here with
the file that carries them and the check that proves the correction; a check that passes against the
real bytes is not the same as a check that notices a broken byte, so the mutation teeth are named
wherever one exists.

The corrections are preregistered in
[`.agents/prereg/horizon/STAGE-0A-REMEDIATION-2.prereg.yaml`](../../prereg/horizon/STAGE-0A-REMEDIATION-2.prereg.yaml)
as PE-24…PE-33 (positive) and NE-22…NE-30 (negative), and are exercised by
[`test/identity-remediation-2.test.ts`](../../../test/identity-remediation-2.test.ts), whose
linkage to the preregistration is checked by
[`scripts/check-stage0a-remediation-2-prereg-coverage.ts`](../../../scripts/check-stage0a-remediation-2-prereg-coverage.ts).
The preregistration was written **after** the design it pins was final (`design_draft.md`
SHA-256 `e2eb3299eabfbe931d86183c7d09b9477550ab7ba3e0850d3fabf9abe17b74b0`) and records
`recorded_before_artifacts: false` for that reason: the design was already carrying the corrections
when the unit was registered.

| Finding | Severity | Status | Where the correction lives |
|---|---|---|---|
| R3-01 the live remote router is absent from the catalog | blocking | closed | `operations.yaml`, `src/remote/server.ts`, `records.json` |
| R3-02 `/desk/decide` downgrades a P3 approval to a P2 lesson row | blocking | closed | `operations.yaml`, `params.yaml`, `src/app.ts` |
| R3-03 deployment-bound operations bypass the minimum-P2 rule | blocking | closed | `operations.yaml`, `src/contracts/identity/manifest.ts`, `src/app.ts` |
| R3-04 `PendingOperation` does not make caller channels exclusive | blocking | closed | `records.json`, `src/contracts/identity/records.ts`, `record-cases.json` |
| R3-05 the human-grant rule makes `grant.revoke` impossible | must-fix | closed | `records.json`, `params.yaml`, `src/contracts/identity/records.ts` |
| R3-06 parameter contracts contradict both handlers and the design | must-fix | closed | `params.yaml`, `design_draft.md` §11, `scripts/check-design-contract-consistency.ts` |
| R3-07 the evidence outcome has two incompatible meanings | blocking | closed | `records.json`, `record-cases.json` |
| R3-08 the external-authority path is not independently authenticatable | blocking | closed | `external-interfaces.json`, `records.json`, `record-cases.json` |
| R3-09 pending replay and terminal-state rules are incomplete | must-fix | closed | `records.json`, `record-cases.json` |
| R3-10 `horizon.health` is not the single anonymous operation | must-fix | closed | `operations.yaml`, `params.yaml`, `src/app.ts` |

## R3-01 — The live remote router is absent from the catalog — closed

**What the reviewer found.** The catalog asserted that reconciliation left `catalog_gaps` empty,
while `src/remote/server.ts` served nine routes that the catalog did not describe. Device
enrollment (`POST /m/api/pair/finish`) performed credential registration and device replacement
while `device.pair` claimed no repository route performs enrollment, and `POST /m/api/command`
dispatched `open_case`, `commit`, `approve`, `reject` and `settle` with an approval path that
invoked the live SEA-Forge resolver without the operation-bound pending/A3-UV contract.

**What changed.** Every route the phone's server performs is now a catalogued row: the health and
state and event reads, the pairing redeem, the authentication options and finish, the sign-out, the
pairing finish and the command. `device.pair` is live-bound to `POST /m/api/pair/finish` rather
than reserved, and `catalog_gaps` is empty because the gap is closed rather than asserted away.
`POST /m/api/command` is a dispatcher with `action_field: kind` and `resolved_field: phase`, so
the settlement command selects between the two settlement rows by phase and the combinations are
enumerated rather than implied.

The phone's approval path is no longer gated — it is **absent**. `src/remote/server.ts` holds no
approval resolver of any kind, and an `approve` or `reject` command is refused with HTTP 403 and
the reason `no_protected_confirmation_path`, audited as `refused:no_protected_confirmation_path`.
The desk keeps its own escalation authority checks; the gap between the desk's current escalation
path and the A3-UV pending confirmation is declared as Stage 0B work in the catalog's
`live_enforcement` block rather than claimed closed.

**How it is checked.** `test/identity-remediation-2.test.ts` — "the live remote router is catalogued
and its approval path is structurally absent (PE-24)" reads the catalog for every remote route and
asserts that the source carries no `resolveApproval`, `approvalIntent`, `resolveNavigationApproval`
or `approvalInbox` at all. "the phone can never answer an escalation (NE-22)" drives a live paired
phone session against a live remote server and asserts the 403, the reason code and the audit row.
The mutation tooth **M19** removes the containment branch from `src/remote/server.ts` and requires
the test to fail by assertion.

## R3-02 — `/desk/decide` downgrades a P3 approval to a P2 lesson row — closed

**What the reviewer found.** The catalog mapped the entire route to `lesson.decide` with
`params.lesson_decide`, while the live handler dispatches by server-side card kind; the schema did
not even permit the live `choice: "accept"`, and declared `records` as an object where the handler
reads an array.

**What changed.** `POST /desk/decide` is a dispatcher. Its `action_field` is `choice` and its
`resolved_field` is `card_kind`, and it enumerates nine `(resolved, action)` combinations that each
name the operation the pair actually selects: `escalation:accept` → `approval.approve` (P3),
`escalation:reject` → `approval.reject` (P3), `lesson:accept` → `lesson.decide` (P2),
`case_task:accept` → `case.task.decide` (P2), `human_step:accept` → `case.task.complete` (P2),
`acceptance_observe:accept` → `horizon.settlement.observe` and `acceptance_rule:accept` →
`horizon.settlement.rule` (both P2), plus `hold` and `release`. The route itself carries no class,
so no card can be downgraded by taking a weaker path: the class belongs to the row the pair selects.

The parameters were corrected to the decision body the handler reads: `params.decision_hold` and
`params.decision_release` carry the full desk decision body (`card_id`, `choice`, `preview_code`,
`records`, `reason`), and the settlement rows bind to the phone's command branch (`{intent_id}`
consumed, `phase` fixed). `src/app.ts` resolves the pair from the card it fetched, with
`resolveDispatchedOperation(identityCatalogOf(), "POST /desk/decide", choice, deskCardKind(card))`.

**How it is checked.** `test/identity-remediation-2.test.ts` — "the desk's decision route resolves
its operation from the card, not from the body (PE-25)" asserts the pair→operation map and the
class of each selected row, and "the desk's decision route never downgrades a P3 approval to a P2
row (NE-23)" asserts that an unlisted pair resolves to `null` (so it is Px before any effect runs).
A new build check, [`scripts/check-dispatch-coverage.ts`](../../../scripts/check-dispatch-coverage.ts),
requires every live-bound row that claims a dispatched route to be reachable through that route's
dispatch table, every dispatch entry's operation to claim that route, and no `(resolved, action)`
pair to resolve to two operations; it reports 32 dispatch entries and fails when the escalation pair
is remapped. The mutation tooth **M20** remaps `escalation:accept` to `lesson.decide` and requires
the test to fail.

## R3-03 — Deployment-bound operations bypass the catalog's minimum-P2 rule — closed

**What the reviewer found.** Live classification returned `allowed: true` for every
identity-catalog-unknown deployment binding, and the binding preparation checked payment and
settlement access but not the identity contract's pending confirmation, caller authority or A3
evidence, so a bound operation could reach a capability through the plain intent path.

**What changed.** `contracts/identity/v1/operations.yaml` now carries a `deployment_operations`
block that says what the rule is rather than leaving it implicit: `minimum_class: P2`, and a
`refusal_rule` that states a deployment-bound reference is never carried by the plain intent path,
because that path has no pending record, no confirmation and no authority writer, and a bound
operation may escalate for authority, spend or an external effect. The block also carries the
`live_enforcement` note that the desk's escalation path still lacks the A3-UV pending confirmation
and that this is Stage 0B work.

`src/contracts/identity/manifest.ts` classifies a deployment-bound reference with `allowed: false`
and the reason `deployment_bound_operation_needs_its_own_path`, and `src/app.ts` carries that
reason at both refusal sites — the request boundary and the last gate before a capability runs —
so the refusal happens before any capability is invoked and before any record is appended.

**How it is checked.** `test/identity-remediation-2.test.ts` — "a deployment-bound operation is
refused on the plain intent path with its own reason (PE-26)" reads the classification and the
catalog's own refusal rule, and "a deployment-bound operation never runs on the plain intent path
(NE-24)" starts a live application whose configuration declares a deployment-bound operation, posts
it to `/intent`, and asserts the 412, the `failed_precondition` code and that the intent-attempt
count does not move.

## R3-04 — `PendingOperation` does not make caller channels exclusive — closed

**What the reviewer found.** The constraints never required `session_ref` for a human caller,
never forbade `session_ref` for an agent caller, never forbade it for a console caller, and never
stated an exclusive choice among the three authentication channels, so a human record could lack
any session binding and an agent record could simultaneously name a human session.

**What changed.** `contracts/identity/v1/records.json` carries one explicit cross-field constraint,
`caller_channel_exclusive`, whose `applies_to` is `PendingOperation` and whose rule states the
exclusive choice in data:

```text
human_session:   session_ref present; execution_ref/delegation_ref absent
agent_execution: execution_ref present; session_ref absent; governed delegation present when required
local_console:   session_ref/execution_ref/delegation_ref absent
```

`src/contracts/identity/records.ts` enforces it, and `research/tests/identity_records.py` mirrors it
for the cross-language fixture check.

**How it is checked.** `test/identity-remediation-2.test.ts` — "a pending record names exactly one
caller channel (PE-27)" and "a pending record that names two caller channels is refused (NE-25)"
exercise the human-with-two-channels, the agent-with-a-session, the console-with-a-session, the
console-with-an-execution and the human-with-no-session cases. The mutation tooth **M21** removes
the rule from `src/contracts/identity/records.ts` and requires the test to fail by assertion.

## R3-05 — The human-grant rule makes `grant.revoke` impossible — closed

**What the reviewer found.** `human_has_no_grant` refused any descriptor or pending record carrying
`grant_ref` in its parameters, although in `params.grant_revoke` the `grant_ref` is the identifier
of the grant being revoked — a target, not authority held by the human.

**What changed.** The rule now distinguishes the three things a delegation reference can be, and
`contracts/identity/v1/records.json` carries that distinction as a register rather than as prose:
`delegation_reference_parameters` names the vocabulary (`delegation_reference_fields:
["grant_ref", "parent_ref"]`) and then, per `(schema, field)` pair, says whether the reference is
the caller's `authority`, the operation's `target`, or `forbidden` for that caller kind. A field is
a delegation reference by its wire name whether or not its schema declares it, so a request cannot
smuggle a delegation under a schema that forgot to repeat it; a `(schema, field)` pair the register
does not list is `forbidden` for every caller kind, and `sponsor_ref` is explicitly not a delegation
reference.

The consequence for `grant.revoke` is that `params.grant_revoke.grant_ref` is a `target` for both
`human_session` and `agent_execution`, so a human may name the grant they are revoking; while
`params.run_start.grant_ref` is the agent's `authority`, so the record's own `delegation_ref` must
be that same reference, and it is `forbidden` to a human session or a local console. The human
variant of `params.run_start` no longer declares `grant_ref` at all, so the schema and the rule
agree.

**How it is checked.** `test/identity-remediation-2.test.ts` — "a parameter that names a delegation
is registered, and the register says what it means (PE-28)" reads the register's own entries and the
fixtures for the revoke, the agent grant, the mismatched grant and the console grant, and
"a delegation reference the register does not cover is never treated as harmless (NE-26)" adds a
`grant_ref` to a schema the register does not list and requires the rule to refuse it — and shows
that removing the vocabulary from the register makes the rule stop seeing the field, which is the
teeth that the vocabulary is what makes the difference rather than the schema. The build check
[`scripts/check-delegation-register.ts`](../../../scripts/check-delegation-register.ts) requires the
register to cover every delegation reference the schemas declare in both directions, and reports
three delegation references, all registered.

## R3-06 — Parameter contracts contradict both handlers and the design — closed

**What the reviewer found.** `surface.blocks` was declared an object where the handler requires an
array; question `options` was declared a nullable required object where the handler accepts an
absent array of option objects; `input` was required in the schema but optional live; surface
`title`, annotation `tone` and panel `title` were required-nullable where the live types make them
optional and generally reject null; and the generated design table dropped nested nullability
despite claiming field-for-field generation.

**What changed.** `contracts/identity/v1/params.yaml` encodes arrays, optionality and nullability as
three separate facts and does so recursively: `surface` is
`{id:string, title:string?, step:string|null?, blocks:[json]}`, a question's `options` is an
optional array that is never null, `input` is optional, and the title and tone fields are optional
and not nullable where the live types reject null. The design's generated parameter table was
regenerated to carry the same nested annotations, so the table is field-for-field with the schema
rather than a flattening of it.

**How it is checked.** `test/identity-remediation-2.test.ts` — "the parameter contracts and the
generated design table agree with the handlers (PE-29)" asserts the nested facts in the loaded
schemas and asserts that the design table contains the nested form. Two build checks carry the
comparison: [`scripts/check-param-schema-binding.ts`](../../../scripts/check-param-schema-binding.ts)
binds every live-bound row's consumed parameters to its schema and reports 55 bindings, and
[`scripts/check-design-contract-consistency.ts`](../../../scripts/check-design-contract-consistency.ts)
compares the generated design tables byte-for-byte against the contract and reports 14 comparisons
that agree.

## R3-07 — The evidence outcome has two incompatible meanings — closed

**What the reviewer found.** The design said the evidence contract records effect outcome as
`none | uncertain | committed`, while `EvidenceRecord.outcome` permitted only
`observed | failed | refused`. Those are observation dispositions, not effect-settlement states, and
a consumer could not implement the design's promised commitment proof from the record.

**What changed.** `contracts/identity/v1/records.json` replaces the single field with two, each with
its own enum and its own meaning: `observation_outcome` (`observed | failed | refused`) says what
the observation found, and `effect_outcome` (`none | uncertain | committed`) says what happened to
the effect. The record's nullability block names both as separate facts. A record may carry both,
and "observed but the effect is still uncertain" is a real state rather than a contradiction.

**How it is checked.** `test/identity-remediation-2.test.ts` — "the evidence record carries two
separate outcomes (PE-30)" asserts the two enums and that the old single field is gone, and "the
evidence record never carries one outcome meaning two things (NE-27)" asserts that a record
carrying the old field is refused as carrying an undeclared field, while a record carrying both new
fields is accepted.

## R3-08 — The external-authority path is not independently authenticatable — closed

**What the reviewer found.** The entitlement interface was `specified_not_published` and said its
path must fail closed, yet a fixture expected a decision backed by that unpublished interface to be
valid using self-asserted facts with no owner signature, key identifier or trust-chain evidence.
`subject_ref` bound to a `record_subject` field that no entitled record kind had, and the published
authority-decision interface's declared required facts omitted the resource scope and amount that
Horizon said it checked.

**What changed.** The path now fails closed, and the contract says so in data rather than in prose.
`contracts/identity/v1/external-interfaces.json` declares `sea_forge.human_entitlement` with
`publication_status: specified_not_published` and a `failure_rule` that refuses the path while the
owner has published nothing. Its `required_facts` name the facts a check needs, including
`subject_ref`, `issuer_ref`, `issuer_key_id`, `signature`, `operation_digest`, `resource_refs`,
`amount`, `authority_epoch`, `expires_at` and `revocation_state`, and its `subject_binding` maps
each entitled record kind to the field its subject binds to — `AuthorityDecision` → `approver_ref`,
`EffectFence` → `caller_ref` — so every subject fact binds to a field the record kind actually
has. The interface is an external artifact another project owns and mints; Horizon neither mints
nor defines it.

`contracts/identity/v1/records.json` carries the `entitlement_is_external` constraint over
`AuthorityDecision` and `EffectFence`, and every entitlement-backed fixture is now invalid
whatever facts it is handed — including the fixture that previously expected a decision backed by
the unpublished interface to be valid.

**How it is checked.** `test/identity-remediation-2.test.ts` — "the entitlement path fails closed
while the owner has published nothing (PE-31)" reads the interface's publication status, its
required facts and its subject bindings, and requires every entitlement-backed fixture to be refused
with `constraint:entitlement_is_external`; "an entitlement nobody published is never accepted
(NE-28)" shows that the facts beside the record look complete — issuer, key identifier and
signature included — and the record is still refused. The mutation tooth **M18** changes the
interface's `publication_status` from `specified_not_published` to `published` and requires the
fixture check to fail by assertion, which is what proves the status is the gate and the rule reads
it.

## R3-09 — Pending replay and terminal-state rules are incomplete — closed

**What the reviewer found.** `PendingOperation` carries a nonce and a `supersedes_ref`, but
`nonce_not_reused` applied only to `Approval` and `OperationDescriptor`, `supersedes_chain`
applied only to `EffectFence` and `EvidenceRecord`, and the confirmation-field rule said nothing
about the `expired` state.

**What changed.** `contracts/identity/v1/records.json` lists `PendingOperation` in the
`applies_to` of `nonce_not_reused` and `supersedes_chain`, and adds a third constraint,
`pending_expired_carries_no_confirmation`, whose rule says what an expired pending record may and
may not carry: an expired record carries no confirmation evidence, because the window it was
waiting for has closed. The `PendingOperation` fixtures gained the replay, the mismatched
supersession, the expired-without-confirmation and the caller-supplied-confirmation cases.

**How it is checked.** `test/identity-remediation-2.test.ts` — "the pending record's replay and
terminal-state rules are complete (PE-32)" asserts that the constraints' own `applies_to` lists
name the pending record and exercises each of the three rules, and "a pending record is never
replayed and an expired one never carries a confirmation (NE-30)" refuses the replay, the
mismatched chain, the expired record carrying confirmation evidence and the caller-supplied
confirmation.

## R3-10 — `horizon.health` is not the single anonymous operation — closed

**What the reviewer found.** The catalog described `/health` as anonymous public liveness exposing
no identity, counts or versions, while the live handler returned the deployment profile, operator
reference, semantic world, research state and transports to a paired caller, and the catalog had no
authenticated detailed-health operation.

**What changed.** The two reads are now two operations on two routes. `horizon.health` is the
anonymous liveness probe on `GET /health` with the executor `anonymous_connection` and no
parameter, and `horizon.diagnostics.read` is the authenticated read on `GET /diagnostics` with no
parameter and an executor that is not the anonymous one. `src/app.ts` serves `{ok: true}` and
nothing else on `/health` for every caller — paired or not — and the deployment detail moved to
the paired `/diagnostics` route, whose refusal to an unpaired caller carries nothing of the
deployment. The catalog's `catalog_gaps` is empty because the gap is closed, not asserted away.

**How it is checked.** `test/identity-remediation-2.test.ts` — "the liveness probe and the
diagnostics read are two operations (PE-33)" asserts the two rows' routes, executors and parameter
schemas and that only `/health` is an open read, and "the liveness probe never becomes a second
way in to the deployment (NE-29)" asserts that a paired and an unpaired caller receive the same
`{ok: true}` body, that the body carries none of the deployment fields, and that the unpaired
`/diagnostics` refusal carries nothing of the deployment either.

## What the reviewer could not check, and what remains open

Two things are outside this freeze and are recorded rather than papered over:

- **The entitlement artifact itself.** SEA-Forge has published no signed entitlement artifact, so
  the entitlement-backed path is unavailable by design. The contract's job — failing closed and
  naming the facts a future check will need — is done; the artifact is an external owner action.
- **The desk's escalation path.** The desk keeps its current escalation authority checks, while the
  pending/A3-UV confirmation the catalog requires is Stage 0B work. The catalog's `live_enforcement`
  block declares that gap instead of claiming it closed.

Neither gap is a defect in the frozen bytes, and neither is waived: each is named in the contract
and carried as open work.

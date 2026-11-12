# Round-4 independent review — finding-by-finding disposition

The verdict retained verbatim at [`independent-review-round-4.md`](independent-review-round-4.md) is
**REJECT**: five blocking findings and four must-fix findings. The frozen copy the reviewer read is
[`frozen-round-4/`](frozen-round-4/) (mode `0444`, every file hash-pinned in `MANIFEST.sha256`,
declared to the reviewer before the read). The reviewer wrote no files and made no repository
change.

Every finding below was treated as a real disagreement and corrected in the contract set and, where
the design described it, in the design. Nothing was waived. Each correction is recorded here with
the file that carries it and the check that proves it; a check that passes against the real bytes
is not the same as a check that notices a broken byte, so the mutation tooth is named wherever one
exists.

The corrections are preregistered in
[`.agents/prereg/horizon/STAGE-0A-REMEDIATION-3.prereg.yaml`](../../prereg/horizon/STAGE-0A-REMEDIATION-3.prereg.yaml)
as PE-34…PE-43 (positive) and NE-31…NE-37 (negative), and are exercised by
[`test/identity-remediation-3.test.ts`](../../../test/identity-remediation-3.test.ts), whose linkage
to the preregistration is checked by
[`scripts/check-stage0a-remediation-3-prereg-coverage.ts`](../../../scripts/check-stage0a-remediation-3-prereg-coverage.ts).
The preregistration was written **after** the design it pins was final (`design_draft.md` SHA-256
`5536acfaa046cb2491fc41c378334a41fa328f78f73fef69b1c0e173e0dccfe8`, 956 lines) and records
`recorded_before_artifacts: false` for that reason: the design was already carrying the
corrections when the unit was registered.

| Finding | Severity | Status | Where the correction lives |
|---|---|---|---|
| R4-01 the two "published" SEA-Forge interfaces are not the artifacts the contract describes | blocking | closed | `external-interfaces.json`, `design_draft.md` §9.1, `scripts/check-external-interface-facts.ts` |
| R4-02 the phone's rows and enforcement claims treat a device credential as a human session | blocking | closed | `operations.yaml`, `params.yaml`, `src/remote/server.ts` |
| R4-03 `horizon.settlement.observe` is classed P1 despite an external governed write | blocking | closed | `operations.yaml` |
| R4-04 `device.pair` simultaneously requires and forbids A3-UV | blocking | closed | `operations.yaml` |
| R4-05 the immutable pending record has no representation for restart expiry | blocking | closed | `records.json`, `src/contracts/identity/records.ts`, `record-cases.json` |
| R4-06 an unknown caller discriminator falls back to another caller's variant | must-fix | closed | `src/contracts/identity/params.ts`, `params.yaml`, `record-cases.json` |
| R4-07 caller-supplied provenance can impersonate a proposer | must-fix | closed | `params.yaml`, `src/contracts/identity/reserved-fields.ts`, `src/app.ts`, `src/remote/server.ts` |
| R4-08 the frozen fixtures do not exercise several preregistered negative teeth | must-fix | closed | `record-cases.json` |
| R4-09 the route census is not exact | must-fix | closed | `operations.yaml`, `src/app.ts`, `scripts/check-route-census.ts` |

## R4-01 — The two "published" SEA-Forge interfaces are not the artifacts the contract describes — closed

**What the reviewer found.** The contract pointed at the pinned `AuthorityDecision` and `ActionGrant`
symbols and required independently verifiable fields — issuer key, signature, resource scope,
amount. The sibling checkout at the pinned commit `b072ec50b1e50df75c45ddf1709caa6877d5c2f1` has
no such fields: `AuthorityDecision` carries no `resource_scope`, `amount`, `issuer_key_id` or
`signature`, and `ActionGrant` is explicitly move-only and "intentionally not serializable", with
private fields. The contract therefore named neither an independently authenticatable decision
envelope nor a transportable grant artifact.

**What changed.** `contracts/identity/v1/external-interfaces.json` now says what the owner actually
publishes. The one published interface is `sea_forge.authority_decision`, pinned to the commit and
to the file that carries the envelope
(`crates/sea-forge-authority/src/cep.rs`), and its thirty-four required facts are the fields that
envelope really has: its envelope identity and kind, its decision and request, its ledger entry and
ordinal, its policy, action and identity hashes, its scope, authority and constraints, its
compensating controls, its approval and expiry, the hash chain that links it to the previous entry,
its writer identity and subject references, and its canonicalization, hash, checkpoint and
Merkle-root facts, with the signing algorithm, key identifier and signature that make it verifiable.
The delegated grant and the human entitlement are both `specified_not_published` and name no commit
and no artifact, because there is nothing to point at. The design's §9.1 says the same thing in
prose, so the normative document and the contract agree.

**How it is checked.** `scripts/check-external-interface-facts.ts` reads the owner's source at the
pinned commit and verifies each of the thirty-four facts against it — a fact the artifact does not
carry fails the build. `test/identity-remediation-3.test.ts` — "a published external interface names
the owner's real artifact, and an unpublished one fails closed (PE-34)" asserts the pin, the
artifact path, the exact fact list and the two unpublished entries; "the external interface contract
must never claim a fact the owner does not publish (NE-32)" refuses one fact more or fewer. The
mutation tooth **M23** renames a published fact to one the artifact does not carry and **M18**
claims the owner published the entitlement artifact; both must fail by assertion.

## R4-02 — The phone's rows and enforcement claims treat a device credential as a human session — closed

**What the reviewer found.** All six rows selected by `POST /m/api/command` inherited
`human_session`, and their live-enforcement entries described only the paired desk. Approve and
reject were contained, but settlement was not: `phase: rule` dispatched to the P3 row and reached
SEA-Forge's final settlement call without a pending record or a protected A3 confirmation.

**What changed.** Every phone effect now has its own device-credential row with its own parameter
schema: `device.case.open`, `device.surface.intent.commit`, `device.settlement.observe`,
`device.settlement.rule`, `device.approval.approve` and `device.approval.reject`. The phone's
command route resolves only to device rows, so no human row is ever selected by it. The live
containment in `src/remote/server.ts` refuses any P2 or P3 command with HTTP 403 and the reason
`no_protected_confirmation_path`, audited as `refused:no_protected_confirmation_path`, and it
stands before the phone's own branches. The four refused rows keep their class — a refusal is a
containment, not a downgrade — and their live-enforcement entries record `performs: false`, so the
catalog states the same containment the code carries. The desk keeps its own escalation authority
checks; the gap between them and the contract's pending/A3-UV requirement remains declared as
Stage 0B work.

**How it is checked.** `test/identity-remediation-3.test.ts` — "every phone effect has its own
device-credential row and its own parameters (PE-35)" asserts the six rows' executors,
authentication, routes and schemas, and that the dispatch entry selects only device rows; "the
phone cannot settle and cannot approve, and the refusal precedes every effect (PE-36)" asserts the
containment's position in the source and the `performs: false` entries; "the phone must never settle
or approve (NE-31)" asserts the class refusal and that the rows it would reach are governed. The
mutation tooth **M22** removes the class containment from `src/remote/server.ts` and **M19** remaps
the phone's `approve` command to a row the device credential may perform; both must fail by
assertion, the second against a live paired phone session.

## R4-03 — `horizon.settlement.observe` is classed P1 despite an external governed write — closed

**What the reviewer found.** The row sat under P1 while admitting that it writes a settlement record
and sends evidence to another system, which contradicts P1's own-scope, reversible definition. The
live-enforcement table even required A3 evidence and a pending record for a P1 operation.

**What changed.** The observation half of settlement is P2. It observes through RealityTrace, builds
an evidence packet and submits it to SEA-Forge, so the effect leaves this application; it still
decides nothing, because the ruling is a separate operation, so it is P2 rather than P3. The
catalog's live-enforcement row says what is still missing on that path — the durable principal
binding, the pending record and the person's A3-UV evidence — and names Stage 0B as the stage that
must close them.

**How it is checked.** `test/identity-remediation-3.test.ts` — "the observation half of settlement is
P2 because it commits evidence elsewhere (PE-37)" asserts the class, the writability and the three
named gaps. The mutation tooth **M10** restates the row's class as `P1` in the catalog; the
catalog's own rule that the group is the class refuses it.

## R4-04 — `device.pair` simultaneously requires and forbids A3-UV — closed

**What the reviewer found.** The operation row named `LOCAL_ENROLLMENT_PRESENCE` and the A3
vocabulary defines it as a presence claim rather than an assurance predicate, yet the authoritative
live-enforcement entry listed `evidence_A3_UV`, `durable_principal_binding` and a generic
`pending_record` as missing, and the generated design repeated the contradiction.

**What changed.** The enrollment's evidence is the enrollment ceremony's own presence receipt and
nothing else. The row is held by whoever presents the one-time pairing code — possession of the
code proves no identity, and the device is enrolled by the ceremony rather than claimed by it — so
its caller path is `code_holder` and its authentication is `one_time_pairing_code`. The
live-enforcement entry names `enrollment_presence_receipt` and does not name A3-UV evidence at all.

**How it is checked.** `test/identity-remediation-3.test.ts` — "the device enrollment's evidence is
local presence, never A3-UV (PE-38)" asserts the executor, the authentication, the evidence
predicate, the caller path and the exact missing set.

## R4-05 — The immutable pending record has no representation for restart expiry — closed

**What the reviewer found.** `PendingOperation` was immutable, a confirmed record had to carry the
confirmer, presence evidence and receipt, an expired record had to carry none and could not be
cleared, and the design said every prior-launch confirmed record becomes expired on restart. No
transition record, signature rule or supersession relation explained how that could happen without
mutating or erasing signed confirmation evidence.

**What changed.** The reviewer's own first correction was taken. A new `PendingTransition` record
kind carries the state: it is signed, it names the pending operation it moves, the state it came
from, the state it enters, the reason, the time and the launch generation, and its transition table
is complete and closed — pending to confirmed, pending to expired, confirmed to dispatching,
confirmed to expired, dispatching to applied, dispatching to uncertain. The `PendingOperation`
descriptor is now immutable and holds **no** `state` field at all; its `confirmer_ref`,
`presence_evidence` and `local_receipt` are always null in the descriptor, and a descriptor that
carries a confirmation is refused by `pending_confirmation_not_caller_supplied`. A transition that
leaves a terminal state is refused by `pending_transition_chain`, and an expiry carries no
confirmation by `pending_expired_carries_no_confirmation`. The two validators — TypeScript and
Python — enforce the same rules over the same frozen fixture set, and agree case for case.

**How it is checked.** `test/identity-remediation-3.test.ts` — "a pending operation's state is an
append-only transition chain (PE-39)" asserts the descriptor's field list, the transition's fields
and signature, the six legal transitions, and refuses a descriptor carrying a confirmation and a
transition leaving a terminal state; "a pending descriptor must never carry a state or a
confirmation, and a terminal state must never open (NE-33)" refuses both again from the other side.
The mutation tooth **M24** removes the transition rule from the validator. The earlier units' own
tests (PE-32 and NE-30) were updated to the new shape rather than left to pass vacuously.

## R4-06 — An unknown caller discriminator falls back to another caller's variant — closed

**What the reviewer found.** `params.run_start` declares only the `agent_execution` and
`human_session` variants, but the validator could not resolve the frozen `OD-CONSOLE-RUN-START-GRANT`
fixture's `caller_kind: local_console`, tested every variant and accepted the closest one. A caller
kind explicitly present but absent from the schema inherited another caller's wire contract.

**What changed.** When the discriminator field is present and its value has no variant, the
validator returns `params:unknown_variant:<discriminator>:<value>` immediately. Best-fit matching is
retained only for a schema with no discriminator field at all, which is a different case: there the
record names no caller kind, and the report says which variant came closest. The console fixture now
expects the unknown-variant refusal as well as the delegation-reference refusal.

**How it is checked.** `test/identity-remediation-3.test.ts` — "a caller kind the schema never
described is refused by name (PE-40)" asserts the refusal's exact text, that a declared variant is
still checked against its own fields, and that a field the variant does not name is refused; "an
unknown caller discriminator must never be fitted to the closest variant (NE-34)" asserts the
refusal is not the old best-fit report. The mutation tooth **M25** removes the unknown-variant
refusal so the closest variant is fitted again.

## R4-07 — Caller-supplied provenance can impersonate a proposer — closed

**What the reviewer found.** `params.horizon_lesson_propose` accepted `proposed_by`, the handler
stored that string as the lesson's proposer, and the lesson is later displayed as "Proposed by …",
so a human request could name an agent, a reviewer or another person as the actor. The phone's
reserved-field list was also narrower than the application's, so it silently accepted names such as
`caller_ref`, `principal`, `executor` and `authority`.

**What changed.** The proposer is derived from the caller's own identity and the parameter schema
has no `proposed_by` field at all. One central list of reserved actor fields —
`src/contracts/identity/reserved-fields.ts` — now serves the desktop's doors and the phone's
command route, and neither server keeps a list of its own. The lesson route, the surface-intent
route and the phone command route each refuse a body carrying a field their schema does not name,
so an unnamed field is refused rather than ignored. The phone's strict check runs after its
containment refusal, so a governed command is refused for the governance reason rather than for a
stray field.

**How it is checked.** `test/identity-remediation-3.test.ts` — "the actor is never read from a
request, and an unnamed field is refused (PE-41)" asserts the central list, its use by both
servers, and the lesson schema's field list; "a request must never be able to name its own actor
(NE-35)" asserts the list's size, both boundaries' use of it, and the order of the two checks in the
phone. A live test — "a lesson body that names its proposer is refused, and nothing is recorded" —
drives the real desk server and asserts the 400, the message, and that the honest body is still
accepted. The mutation tooth **M26** stops the boundary refusing a body that names an actor.

## R4-08 — The frozen fixtures do not exercise several preregistered negative teeth — closed

**What the reviewer found.** The preregistration promised caller-channel combinations, the old
single evidence outcome, the pending nonce replay and the pending supersession checks, and the
frozen proof set contained none of them: the reviewer's own census found
`pending_nonce_replay_cases=0`, `pending_supersedes_chain_cases=0`, `human_no_session=0`,
`agent_with_session=0`, `console_clean=0` and `evidence_old_single_outcome_cases=0`.

**What changed.** The shared fixture set gained the exact cases the preregistration promised, each
with its exact expected violations: the reused pending nonce, the correct and the incorrect pending
supersession, the human without a session, the agent with a session, the console with a session,
the console naming a delegation, the evidence record's old single `outcome` field, and thirteen
`PENDING-TRANSITION-*` cases covering the transition chain's own teeth — reopening a confirmed
pending, a chain that does not match, reopening a terminal state, a reason that does not match, and
a restart that would expire a confirmed pending. The set is now 124 cases, every record kind has
at least one, and the TypeScript and Python validators agree on every one of them.

**How it is checked.** `test/identity-remediation-3.test.ts` — "the frozen fixture set exercises
every negative tooth the preregistrations promised (PE-43)" asserts each named case and its expected
violation, and that every record kind has a case; "the frozen fixture set must never lose a
preregistered negative case (NE-37)" asserts that each case is still present and still expects to be
invalid. The mutation tooth **M28** deletes the nonce-replay case from the frozen set and requires
the claim to notice.

## R4-09 — The route census is not exact — closed

**What the reviewer found.** The phone served both `/m` and `/m/` while the non-operation list named
only `/m`, which made PE-24's "every route the phone's server performs" assertion false. The main
`/health` and `/diagnostics` branches did not constrain the method at all while the catalog bound
only `GET`, and several other read-like branches had the same problem.

**What changed.** The census is now exact in both directions, and it is a check rather than a
promise. Every route either server answers is named exactly once in the catalog: by an operation
row's routes, by a dispatch entry, by a route alias, by an acknowledged catalog gap, or by the
non-operation list. A route that reads the world, the store or the transport is an operation route
even when it only projects — the read *is* the operation — so the projection reads are live rows
with their own parameter schemas rather than fudged as non-operation routes: nine new P0 rows and
four promoted ones, each with its own schema, its own live-enforcement entry and its own parameter
binding. The phone's trailing-slash page is named. Every read branch answers `GET` and no other
method, so a method the contract never bound cannot reach the handler behind it. And the list is
exact in the other direction too: a listed route that no longer exists is a stale entry, and a
live-bound row that claims a route the source does not answer is a row whose binding cannot be
confirmed.

**How it is checked.** `scripts/check-route-census.ts` reads the live source's route branches and
the catalog, and fails the build on a route that is in neither, a branch that does not constrain the
method, a stale non-operation entry, or a live-bound row whose route is not answered. It currently
reports 69 answered routes, all named. `test/identity-remediation-3.test.ts` — "the route census is
exact in both directions (PE-42)" asserts the census has no failures, that the phone's two pages are
named, and that every non-operation route says why it performs no operation; "an answered route
must never be absent from the catalog (NE-36)" asserts the read branches' method constraint. The
mutation tooth **M27** drops the method constraint from the liveness probe.

## What the reviewer could not check, and what remains open

Two things are outside this freeze and are recorded rather than papered over:

- **The delegated grant and the human entitlement.** SEA-Forge publishes neither at the pinned
  revision, so both paths are unavailable by design. The contract's job — failing closed, naming
  the facts a future check will need, and naming no artifact that does not exist — is done; the
  artifacts are an external owner action, and the contract says so instead of pretending otherwise.
- **The desk's escalation path.** The desk keeps its current escalation authority checks, while the
  pending/A3-UV confirmation the catalog requires is Stage 0B work. The catalog's `live_enforcement`
  block declares that gap instead of claiming it closed.

Neither gap is a defect in the frozen bytes, and neither is waived: each is named in the contract
and carried as open work. The third consequence is a product behaviour change the owner should see:
because the phone can no longer settle or approve, those two actions exist only on the desk, and
the phone says so in its refusal reason rather than failing silently.

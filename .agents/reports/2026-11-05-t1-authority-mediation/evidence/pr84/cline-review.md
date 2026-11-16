## Findings

**1. Blocker — `crates/sea-forge-authority/src/cep.rs`, `resolve_uncertain_settlement_at` (`UncertainResolution::NotDeclared` branch)**

The release path is gated on `claim_lease_lapsed`, and the doc comment states the premise outright: "only after the lease has lapsed, so the attempt's authority call cannot still be running." That premise is contradicted by the same diff: `reconcile_settlement_resume` now says "a timed-out authority call does not prove that no declaration was appended", and `declaration.rs` now classifies a *started* command's timeout, nonzero exit and `ProcessTree` "timed out process group survived termination" as `settlement_authority_call_failed` — i.e. the process may still be alive after the lease lapses. `NotDeclared` then calls `release_settlement_resume`, whose own doc says "the claim is released, so a fenced retry can claim it again", and the retry re-runs the declaration for the same settlement.

Failing scenario: authority command is a wrapper that detaches a worker (`setsid sh -c 'sleep 60; append-declaration'`) and exits; transport timeout is 1s, so `submit` returns `call_failed`, the group-kill misses the detached child, `ambiguous_after_call` keeps the claim. One millisecond after the lease lapses, an operator runs `resolve-uncertain --not-declared "authority record shows nothing"`. At that instant the authority's record is indeed empty, so the attestation is honest — but the detached worker appends afterwards, and the released claim is re-claimed and declares a second time. Nothing in the claim state or at the authority boundary fences the second declare; the only barrier is a snapshot attestation that the surviving process invalidates.

**2. Major — same function: no separation between requester and resolver**

The only refusals are `resolver.role != ActorRole::Operator` and the `approval_resolution` policy verdict. The diff shows the sibling path (`CepAuthorityService::resolve_approval`, exercised by `resolve_in`/`resolve`) refusing the requester with `self_approval_refused` — a check made in Rust, not by policy, since the gateway test's other refusal text is the distinct `"may not resolve"` message. `resolve_uncertain_settlement_at` never compares `resolver.actor_id` with `record.actor_id` (it only copies it into `"requester_id"` for the decision parameters, which the fixture policy does not read).

Failing scenario: `op-alice` requests an external declaration; the call times out and is ambiguous; after the lease lapses `op-alice` runs `resolve-uncertain --not-declared … --actor op-alice`. Policy rule `operator-approves` allows any operator, the role check passes, and her own uncertain claim is released so a fresh attempt declares — the control the approval path enforces is silently absent on the path that can re-declare.

**3. Major — same function: audit committed before the close, with no rollback**

`commit_typed_once(SETTLEMENT_UNCERTAIN_RESOLUTION_KIND, …)` writes the resolution record and *then* `complete_settlement_resume` / `release_settlement_resume` runs under a separate fence. There is no compensating write and no state to revert, so the invariant claimed in the comment ("the audit log never holds a resolution that did not take effect") is not enforced; only the 8-way resolution-vs-resolution race is tested (that one is serialised by `commit_typed_once`), not resolution-vs-worker.

Failing scenario: the worker's `declare` actually succeeded but timed out, the claim was left open, and the worker (still alive) completes attempt 1 with `complete_settlement_resume` between the operator's status read and the operator's release. The `settlement_uncertain_resolution` record `not_declared` for attempt 1 remains permanently, stating that the external authority holds no declaration for an attempt that did declare. The same interleaving with `Declared{a}` leaves an audit naming a declaration ref that never completed the record (which was completed on a different ref). Retrying reproduces the same audit and the same fencing error, so the wrong record can never be corrected or superseded.

**4. Major — `crates/sea-forge-cli/src/commands/approve.rs`, `resolve_uncertain` (+ `crates/sea-forge-cli/src/main.rs`, `Command::ResolveUncertain`)**

`let resolver = Actor { actor_id: opts.actor.into(), role: ActorRole::Operator };` — the role is fabricated from a free-form string with a `default_value = "operator_local"`. Both gates keyed on that role (the library's `resolver.role != ActorRole::Operator` and the policy rule `actor_role: operator`) therefore pass for any string, including a service identity. The library test `a service actor cannot resolve it` only proves the refusal when the caller *honestly* declares `ActorRole::Service`, which the CLI never does.

Failing scenario: `sea-forge resolve-uncertain <case> apr-<pending> --attempt 1 --not-declared "attested" --actor gateway` — the gateway service identity is accepted as the human resolver and the audit records `resolver_actor_id: "gateway"`.

**5. Major — same function: the approval_resolution decision is synthesised, not taken from the record**

The action parameters are constants plus a copy of `record.actor_id`: `"resolution": "approved"` for *both* an approval-shaped completion and a release, `"required_approver_roles": []`, and `case_id: "cognate"` rather than the record's case. Nothing reads what the escalation actually recorded, so the decision the policy sees on the resolution path is not the decision that was made on the escalation path.

Failing scenario: an external settlement escalates under a policy whose `approval_resolution` rule requires a named approver role/threshold carried in `required_approver_roles`. The resolver supplies `required_approver_roles: []`, so the requirement is evaluated against an empty set and any operator matching the generic `actor_role: operator` rule succeeds. Additionally a `NotDeclared` *release* is presented to the rule as `resolution: "approved"`, so any rule keyed on resolution semantics cannot distinguish withdrawal from approval. (Worth confirming against the rule bodies, but the parameters are unambiguously fabricated here.)

**6. Minor — `crates/sea-forge-authority/src/cep.rs`, `reconcile_settlement_resume_at`**

The rewrite removes the only path that ever closed a claim without a declaration, so a claim whose call demonstrably never started (crash before the authority call) is now indistinguishable from an ambiguous one: it is held forever and, per the new doc, "blocks every resume". The information needed to tell them apart exists but is discarded — `delegation.rs` computes `call_started` and throws it away instead of recording it on the claim.

Failing scenario: the server panics between `claim` and `CommandSweSeedTransport::new`; every subsequent resume parks, and the settlement can only progress through a human operator running `resolve-uncertain`, indefinitely.

**7. Minor — `crates/sea-forge-server/src/delegation.rs`, `submit_swe_seed_declaration` / `ambiguous_after_call`**

`call_started` is stored immediately before `authority.declare(&request)`, not at spawn, so any failure inside `declare` that occurs before the transport spawns (request/adapter validation, strength checks, config) is classified ambiguous and strands the claim.

Failing scenario: `SweSeedSettlementAuthority::declare` rejects the request for a policy/adapter reason without ever invoking the transport; `ambiguous_after_call(true, …)` keeps the lease, so a provably-unsent declaration blocks all resumes until an operator intervenes.

**8. Minor — `crates/sea-forge-authority/src/cep.rs`, `resolve_uncertain_settlement_at` (`Declared`)**

The `declaration_ref` is trusted verbatim: unlike the reconcile path (which is given a declaration the caller found in the ledger), no check ties it to any ledger entry or authority record before `complete_settlement_resume` marks the attempt `Completed`.

Failing scenario: an operator mistypes `--declared decl-foudn`; the settlement is permanently recorded as completed on a declaration that does not exist, the record leaves `Resuming`, and no later resume will ever call the authority.

**9. Minor — `crates/sea-forge-cli/src/commands/resume.rs`, `resume_artifact_transition`**

The amended comment now says the open claim is settled by reconciliation "once its lease lapses", which is exactly what this diff removes — after the change, a lapsed lease settles nothing and only an operator resolution does. The line is also left as an unwrapped run-on. A maintainer reading this will expect the old automatic settlement and may reintroduce it.

**10. Minor — `crates/sea-forge-authority/tests/horizon_gateway_policy.rs`, `the_fixture_is_the_rendered_policy_with_the_gate_before_the_fallback`**

The module doc asserts the fixture "is the renderer's output, byte for byte; a change to the renderer must update it", but nothing enforces equality — the tests only inspect the fixture and `RENDERED.matches("requires_approval: true").count()`. If `scripts/gateway-setup.ts::renderPolicyYaml` drops or reorders the gate, the suite keeps passing against a stale fixture and the production renderer can ship an ungated external settlement with no failing test.
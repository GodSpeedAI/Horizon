# Round-2 independent review — finding-by-finding disposition

The verdict retained verbatim at [`independent-review-round-2.md`](independent-review-round-2.md) is **REJECT**: five blocking findings, seven must-fix findings and four advisories. The frozen copy the reviewer read is [`frozen-round-2/`](frozen-round-2/) (mode `0444`, every file hash-pinned in `MANIFEST.sha256`, declared to the reviewer before the read). The reviewer wrote no files and made no repository change.

Every finding below was treated as a real disagreement and corrected in the contract set and, where the design described it, in the design. Nothing was waived. The corrections are recorded here with the file that carries them and the check that proves the correction; a check that passes against the real bytes is not the same as a check that notices a broken byte, so the mutation teeth are named wherever one exists.

| Finding | Severity | Status | Where the correction lives |
|---|---|---|---|
| R2-01 A3-T has two incompatible receipt predicates | blocking | closed | `a3-mechanism.yaml`, `records.json` |
| R2-02 PendingOperation's anti-substitution rules are non-normative | blocking | closed | `records.json`, `record-cases.json` |
| R2-03 unknown catalog operations are not gated at live intent boundaries | blocking | closed | `src/app.ts`, `operations.yaml` |
| R2-04 governed fixtures and live wire types contradict the schema | blocking | closed | `params.yaml`, `record-cases.json` |
| R2-05 live P0/P1 handlers use schemas for different payloads | must-fix | closed | `params.yaml`, `operations.yaml`, `check-param-schema-binding.ts` |
| R2-06 the design's parameter table is not field-for-field with `params.yaml` | must-fix | closed | `gen-design-parameter-table.ts`, `check-design-contract-consistency.ts` |
| R2-07 approval aliases are prose-only | must-fix | closed | `operations.yaml`, `params.yaml` |
| R2-08 Stage 0B both executes and defers `ask.route` | blocking | closed | `operations.yaml`, `design_draft.md` |
| R2-09 caller authentication is incomplete; `session.pair` overclaims | must-fix | closed | `operations.yaml`, `manifest.ts` |
| R2-10 `refused_prefixes` is checked against the wrong field | must-fix | closed | `src/app.ts` |
| R2-11 `workspace.export` separation of duty is inconsistent | must-fix | closed | `operations.yaml`, `params.yaml` |
| R2-12 exceptional P2 ceremonies inherit A3-T | must-fix | closed | `operations.yaml`, `a3-mechanism.yaml` |
| R2-13 candidate source locators evade enforcement coverage | advisory | closed | `operations.yaml`, `manifest.ts` |
| R2-14 the preregistration no longer describes the frozen contract | advisory | closed | `STAGE-0A-REMEDIATION.prereg.yaml` |
| R2-15 the human entitlement reference has no frozen interface | advisory | closed | `external-interfaces.json`, `records.json`, `design_draft.md` §9.1 |
| R2-16 two rules refer to data semantics they do not encode | advisory | closed | `records.json`, `a3-mechanism.yaml` |

## R2-01 — A3-T has two incompatible receipt predicates — closed

**What the reviewer found.** `protected_terminal_presence` was called the A3-T receipt predicate in one place and was a presence claim that cannot satisfy A3-T in another, so the receipt could name a predicate that was not one.

**What changed.** `contracts/identity/v1/a3-mechanism.yaml` declares exactly two human predicates, `A3-UV` and `A3-T`; `protected_terminal_presence` is gone from the predicate vocabulary and is a boolean claim on the `A3Receipt` record in `contracts/identity/v1/records.json`. Two rules in the record contract say so in data rather than prose: `a3_t_requires_protected_terminal_presence` and `a3_uv_is_not_terminal_presence`. The A0-or-A1 disjunction is an explicit `any_of` over the two predicates.

**How it is checked.** `test/identity-remediation.test.ts` — "the assurance vocabulary is two predicates with the terminal claim beside them (PE-17)". The `A3Receipt` fixtures in `record-cases.json` carry both claims, and the cross-language check runs in TypeScript and in stdlib Python over the same bytes.

## R2-02 — PendingOperation's anti-substitution rules are non-normative — closed

**What the reviewer found.** The fixtures and the live validator applied the descriptor's anti-substitution rules to `PendingOperation`, while the frozen `applies_to` lists excluded it. A consumer that followed the frozen contract could accept a human grant, or an agent with no delegation, on a pending record.

**What changed.** `contracts/identity/v1/records.json` lists `PendingOperation` in the `applies_to` of every rule that applies to it: `human_has_no_grant`, `human_has_no_credential`, `agent_needs_execution`, `console_has_no_execution`, `caller_is_not_target`, `governed_agent_needs_delegation` and `parameters_match_schema`. The fixture set gained the missing pending cases for the credential, execution and console callers.

**How it is checked.** `test/identity-remediation.test.ts` — "the pending record carries the descriptor's own anti-substitution rules (PE-18)" reads the contract's own `applies_to` lists rather than the validator's behaviour, and `test/identity-records.test.ts` requires every declared constraint to be exercised by at least one case, in both languages.

## R2-03 — unknown catalog operations are not gated at live intent boundaries — closed

**What the reviewer found.** An operation absent from the identity catalog could still become a real P1 intent write, because membership in the current frame was the only test.

**What changed.** `src/app.ts` classifies every operation reference at the live intent boundary, in both `commitNavigationIntent` and `submitIntent`, before any capability is invoked and before any record is appended. `src/contracts/identity/manifest.ts` resolves a reference in three steps: a catalogued operation keeps its own catalog class; an operation that is not catalogued must be a deployment-bound operation, declared in the new `deployment_operations` block of `contracts/identity/v1/operations.yaml`; anything else is `Px` and is refused. A catalog that cannot be loaded refuses everything rather than admitting what it could not read.

**How it is checked.** `test/identity-remediation.test.ts` — "the intent boundary classifies every operation reference before anything runs (PE-19)" and "an operation the catalog does not know never runs at the intent boundary (NE-16)"; the second asserts that the attempt count does not move, so no capability ran and no record was appended.

## R2-04 — governed fixtures and live wire types contradict the schema — closed

**What the reviewer found.** `owner_rev` was a string in one file and a number in another, a supposedly valid version was the wrong length, and a supposedly valid workspace-label descriptor carried entirely different fields.

**What changed.** `contracts/identity/v1/params.yaml` declares `params.human_answer.owner_rev` as `integer` and keeps `params.workspace_label.record_seq` as `uint64`; its `encoding_rules` now say that a parameter is declared with the type its value carries across the boundary, and that a record's `parameters` hold wire names. All thirty-three catalog-bearing fixtures in `contracts/identity/v1/fixtures/record-cases.json` were rewritten to wire names with conforming values, and `parameters_match_schema` is now enforced on both `OperationDescriptor` and `PendingOperation`, so a case may name a rule violation and the parameter violation together.

**How it is checked.** The fixtures are validated twice — `test/identity-records.test.ts` in TypeScript and `research/tests/test_identity_fixtures.py` in stdlib Python — over the same bytes, and `scripts/check-param-schema-binding.ts` compares every live-bound row's schema against the handler that reads it.

## R2-05 — live P0/P1 handlers use schemas for different payloads — closed

**What the reviewer found.** The generic class defaults did not name the fields the live handlers actually read, such as `operation_ref`, `expected_outcome`, `row_id`, `draft_id`, `text` and `mode`.

**What changed.** `contracts/identity/v1/params.yaml` gained thirteen operation-specific schemas, and every live-bound P0/P1 row in `contracts/identity/v1/operations.yaml` now names its own `params_schema`. `scripts/check-param-schema-binding.ts` binds all thirty-seven `binding: verified` rows to the source that reads them, extracts the handler's own field reads, and fails when a verified row has no binding at all.

**How it is checked.** The binding check's own teeth prove that a wire name that drifts from the handler and a removed binding are both caught; `just check-t23` runs it on every gate.

## R2-06 — the design's parameter table is not field-for-field with `params.yaml` — closed

**What the reviewer found.** Requiredness and nullability differed across several schemas, so two frozen files defined different canonical digests.

**What changed.** The table in the design's section 12 is no longer written by hand. `scripts/gen-design-parameter-table.ts` generates it from `contracts/identity/v1/params.yaml`, and `scripts/check-design-contract-consistency.ts` compares the design's copy with the generated output byte for byte.

**How it is checked.** The consistency check is one of the checks `just check-t23` runs, and a mutation that drifts the table fails it.

## R2-07 — approval aliases are prose-only — closed

**What the reviewer found.** `approval.approve` could be described with `resolution: "rejected"` without contradicting the catalog, because the fix existed only in prose.

**What changed.** The two approval rows in `contracts/identity/v1/operations.yaml` carry `fixed_parameters: {resolution: approved}` and `{resolution: rejected}`. The loader validates the fixed value against the row's parameter schema, and the fixtures carry the disagreeing value as a case.

**How it is checked.** `test/identity-records.test.ts` asserts that a case's alias-fixed action is the value the parameter schema fixes, and `test/identity-remediation.test.ts` — "the catalog's evidence and aliases resolve against the contracts they name (PE-21)".

## R2-08 — Stage 0B both executes and defers `ask.route` — blocking — closed

**What the reviewer found.** The `ask.route` row is agent-executed and requires a bounded grant that Stage 0B does not have, while the design's Stage 0B tables listed it as a local success.

**What changed.** The Stage 0B tables in `design_draft.md` name only the operations Stage 0B can actually authorise. `ask.route` is not one of them: its authority needs a live bounded grant and the evidence its row names, so its closure belongs to the stage that supplies both. The design says so where it previously claimed the opposite.

**How it is checked.** `test/identity-remediation.test.ts` — "the Stage 0B tables claim no operation Stage 0B cannot authorise (NE-19)" reads the design's own Stage 0B section.

## R2-09 — caller authentication is incomplete; `session.pair` overclaims — closed

**What the reviewer found.** Sixty-three non-Px rows resolved to no caller-authentication declaration, and an HTTP pairing-code exchange was described as proof of a local-console executor.

**What changed.** `contracts/identity/v1/operations.yaml` gives every non-Px row a caller path. `src/contracts/identity/manifest.ts` derives the caller authentication from the row's executor and refuses a row whose declared caller authentication disagrees with that derivation. `session.pair` no longer claims the local console: it has the new executor `code_holder` and the new caller authentication `one_time_pairing_code`, because the route proves possession of a one-time code and cannot prove who presented it.

**How it is checked.** `test/identity-remediation.test.ts` — "the catalog's evidence and aliases resolve against the contracts they name (PE-21)" and the mutation teeth that break the pairing row's executor.

## R2-10 — `refused_prefixes` is checked against the wrong field — closed

**What the reviewer found.** The agent door checked the reserved prefixes against a field the route does not use; the outcome was still fail-closed through the allowlist, but the frozen claim about a specific refusal was false.

**What changed.** `src/app.ts` reads the frozen `action_field` of the row (`tool` for the agent door) before checking the reserved prefixes, and refuses a reserved operation named in any other field as a forbidden field rather than ignoring it.

**How it is checked.** `test/identity-remediation.test.ts` — "the agent door checks its reserved actions against the field the route uses (NE-18)".

## R2-11 — `workspace.export` separation of duty is inconsistent — closed

**What the reviewer found.** The enforcement text said separation of duty was required and missing, while the row and the final operation table did not consistently declare it.

**What changed.** `contracts/identity/v1/operations.yaml` declares `separation_of_duty: true` on the `workspace.export` row, the approval row names the distinct approver path, and `contracts/identity/v1/params.yaml` describes the fields the separation rule reads. The record contract's `separation_of_duty` rule refuses an approval whose approver is the requester or the executor.

**How it is checked.** The `Approval` fixtures carry the separation-of-duty case, and the cross-language check runs it in both implementations.

## R2-12 — exceptional P2 ceremonies inherit A3-T — closed

**What the reviewer found.** `device.recover` and `trust.rotate` inherited the P2 default `stage0b_evidence` of A3-T, although the design requires a recovery code with a fresh passkey, or independent administrator presence, and says explicitly that these are never A3.

**What changed.** Both rows in `contracts/identity/v1/operations.yaml` carry their own `stage0b_evidence` override, naming the special requirement ids the A3 mechanism declares rather than inheriting the terminal predicate.

**How it is checked.** `test/identity-remediation.test.ts` — "the catalog's evidence and aliases resolve against the contracts they name (PE-21)" resolves every row's evidence against the mechanism's declared requirement ids.

## R2-13 — candidate source locators evade enforcement coverage — advisory — closed

**What the reviewer found.** A reader could not tell whether a candidate's `route` was a discovery hint or a live binding.

**What changed.** The seven candidate rows in `contracts/identity/v1/operations.yaml` now name `observed_routes` and `observed_code_ops` — what was observed — and the loader keeps them apart from the bindings the enforcement coverage counts. The names say what they are.

**How it is checked.** The census the reviewer wrote independently is reproducible against the frozen bytes, and `scripts/check-param-schema-binding.ts` counts only `binding: verified` rows.

## R2-14 — the preregistration no longer describes the frozen contract — advisory — closed

**What the reviewer found.** The task preregistration expected eight signed records while the contract registers nine, and no preregistration pinned the final reviewed design.

**What changed.** `.agents/prereg/horizon/STAGE-0A-REMEDIATION.prereg.yaml` registers the nine signed records and the one unsigned refusal, and pins the design's SHA-256 and line count. The earlier preregistrations are left exactly as recorded — a recorded preregistration is not rewritten — and the new file says so.

**How it is checked.** `scripts/check-prereg-shape.ts`, `scripts/check-stage0a-remediation-prereg-coverage.ts`, and the PE-22 test, which recomputes the design's hash and compares it with the pin.

## R2-15 — the human entitlement reference has no frozen interface — advisory — closed

**What the reviewer found.** The contract named an `entitlement_ref` and nothing said what the artifact behind it was, so currentness, scope, subject, issuer, epoch and expiry could not be checked by anyone.

**What changed.** `contracts/identity/v1/external-interfaces.json` is a new frozen contract that names the interfaces Horizon consumes from other projects and never mints: the SEA-Forge authority decision and the action grant, each pinned to the commit it was read at, and the human entitlement, whose owner has published no artifact. The entitlement interface declares the facts an entitlement must carry — its reference, the subject it was issued to, its issuer, the operation it permits, the resource scope and spend ceiling it covers, the authority epoch, its expiry and its revocation state — and the record contract binds an entitlement-backed `AuthorityDecision` or `EffectFence` to those facts through the new `entitlement_is_external` rule. A wider entitlement is accepted; a narrower scope, a smaller ceiling, another subject, another operation, another epoch, an expiry before the record's, or a revoked entitlement are refused. While the interface is unpublished, the governed human path fails closed rather than falling back to a grant, a session or a policy decision — and that dependency is named in the contract rather than hidden. The design's new section 9.1 carries the interface table, generated from the contract and compared byte for byte by `scripts/check-design-contract-consistency.ts`.

**How it is checked.** `test/identity-remediation.test.ts` — "the human entitlement is a frozen external interface with named facts (PE-23)" and "an entitlement name alone is never authority (NE-21)"; five new fixtures in `record-cases.json` carry the absent, mismatched, expired, too-narrow and revoked cases, and both language implementations produce the same violation set for each. Two mutation teeth prove the rule bites: one removes the binding from the validator, the other removes the revocation fact from the interface contract.

## R2-16 — two rules refer to data semantics they do not encode — advisory — closed

**What the reviewer found.** `human_has_no_credential` referred to a nonexistent `OperationDescriptor.attempt_ref`, and `A0_OR_A1` encoded a two-item `requires` list that read as a conjunction when either item was meant to suffice.

**What changed.** The `human_has_no_credential` rule in `contracts/identity/v1/records.json` now names only fields the descriptor carries, and `contracts/identity/v1/a3-mechanism.yaml` encodes the disjunction as an explicit `any_of` over `A0` and `A1`.

**How it is checked.** `test/identity-remediation.test.ts` — "the assurance vocabulary is two predicates with the terminal claim beside them (PE-17)" asserts the disjunction's shape in the data, and the record contract's field list is compared with the design's Appendix A by the consistency check.

## What this disposition does not claim

This file records that each finding was corrected and where the correction lives. It is not an acceptance: the third independent review reads a frozen, hash-pinned copy of the whole contract set and decides whether these corrections are real. Self-attestation is not confirmation, and neither is a passing check whose assertions were not read.

Two limits belong here rather than in a status entry. The entitlement interface is specified, not pinned: SEA-Forge has published no entitlement artifact, so the fact names are Horizon's requirement on the owner's payload, and the adapter that maps one to the other is Stage 3 work. And the corrections in this wave are contract-level: they say what the bytes must mean, not that a runtime already enforces them.

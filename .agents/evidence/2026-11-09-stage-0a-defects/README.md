# Stage 0A — defect remediation and independent review

**Date:** 2026-11-09 (round 1), 2026-11-10 (round 2, the round-2 and round-3 remediations), 2026-11-11 (round 3, the round-4 review, the round-4 remediation and the round-5 review)
**Task:** `T23` in `HORIZON-PLAN-001`, Stage 0A. Settles no requirement on its own;
`REQ-SEC-006` stays open until the Stage 4 vertical slice and its independent confirmation.
**Preregistrations:** `.agents/prereg/horizon/T23.prereg.yaml` and
`.agents/prereg/horizon/STAGE-0A.prereg.yaml` are **recorded and were not rewritten**. The
defect-remediation wave added its own preregistration,
`.agents/prereg/horizon/STAGE-0A-DEFECTS.prereg.yaml`, with `recorded_before_artifacts: false`,
because the artifacts it names (the closed defect records, the negative tests) did not exist when
the earlier preregistrations were written. The round-2 remediation added a third,
`.agents/prereg/horizon/STAGE-0A-REMEDIATION.prereg.yaml`, also with `recorded_before_artifacts:
false`; it registers the second review's sixteen findings as testable expectations and pins the
design's SHA-256, which no earlier preregistration did. The round-3 remediation added a fourth,
`.agents/prereg/horizon/STAGE-0A-REMEDIATION-2.prereg.yaml`, also with `recorded_before_artifacts:
false`; it registers the third review's ten findings as PE-24…PE-33 and NE-22…NE-30, and pins the
design it was written against (`e2eb3299…`, the SHA-256 the design had already reached when the
unit was registered). The round-4 remediation added a fifth,
`.agents/prereg/horizon/STAGE-0A-REMEDIATION-3.prereg.yaml`, also with `recorded_before_artifacts:
false`; it registers the fourth review's nine findings as PE-34…PE-43 and NE-31…NE-37, and pins
the design it was written against (`5536acfa…`, 956 lines).

This file is the evidence index for the wave that closed the two recorded identity defects, froze
the issuer profile and the A3 mechanism, and answered an independent review that returned
**REJECT**.

## The two recorded identity defects, and how they closed

Both defects were recorded in the catalog's own `binding_defects` register and both are now
`status: fixed`, with the defect rows naming the evidence that proves it.

| Defect | What was wrong | What closed it |
|---|---|---|
| `DEF-ROLE-FROM-REQUEST` | `commitSurfaceIntent` read `role` from the request body and fell back to `human`, so a caller able to reach the route could name its own actor. | `SurfaceIntentRequestBody` has no `role` field; `commitSurfaceIntent(submission, role)` takes the role from its caller, and every route refuses a body that names an actor (`ACTOR_NAMING_FIELDS`, `400 forbidden_field`). The agent door refuses the same fields. |
| `DEF-ASK-ROUTE-EXECUTOR` | The design's P2 row named a human-session executor for `ask.route`, whose only handler runs on the agent door under a registered key, so the executor evidence was wrong. | The catalog row names `executor: agent_execution` and `caller_authentication: registered_agent_key`; the class (P2), the authority writer, the human evidence and the pending expiry are unchanged, so the agent proposes and the human authorises. The durable answer record carries `executed_by_key` and the conversation row carries `refs.executor_key`, both taken from the authenticated key. The design's Appendix A table was amended to say the same thing. |

The negative tests are in `test/identity-defects.test.ts`. Each one is a *negative* test: it proves
the bad path is closed by observing the refusal **and** that nothing was written. The positive
observation for each is the pair — the honest path still works and records the authenticated
identity.

## The issuer profile and the A3 mechanism

| Artifact | What it freezes |
|---|---|
| `contracts/identity/v1/issuer-profile.yaml` | Cognate owns issuance and propagation; SEA-Forge stays the independent delegation authority. Enrollment, issuance, holder binding, rotation, recovery, revocation, the custody profiles, and the four platform lanes (Windows, macOS, Linux, Jetson) plus the no-issuer lane. A host without qualified custody **refuses** agent identity rather than downgrading to a weaker assurance level. |
| `contracts/identity/v1/a3-mechanism.yaml` | The A3-UV and A3-T predicates, the mechanisms that produce them, the challenge binding, the refused paths, the assurance-requirement vocabulary the operation catalog resolves against, and the honest S1/S2 limits. |
| `src/contracts/identity/issuer.ts` | The strict loader for both contracts, with fail-closed parsing. |

Neither contract claims a qualification result. The A3 mechanism's `assurance_requirements` list is
the **single vocabulary** the operation catalog's evidence predicates resolve against, so a catalog
row cannot name a requirement the mechanism contract never declared.

## The catalog changes that answer the round-1 review

The full disposition, finding by finding, is in
[`review-round-1-disposition.md`](review-round-1-disposition.md). In summary, the contract set
gained:

- a **`live_enforcement` block** with one entry per live-bound row (37 entries, exactly the 37
  `binding: verified` rows): the caller path it runs on, whether the runtime enforces it at this
  freeze, what enforces it, what is still missing, and the stage that closes the gap. The loader
  refuses a governed row that claims enforcement it does not have, a live-bound row with no entry,
  and an entry that lists nothing as missing while claiming no enforcement.
- a **structured route alias**: `target_class`, `fixed_parameters`, and `narrowing_checks`, so the
  narrowing is data a validator reads rather than prose it trusts.
- **`session.pair`** as the browser's pairing route (P1, local console, one parameter: the one-time
  code) and **`device.pair`** left reserved for actual device enrollment.
- **`run.start`** as the Px dispatcher bound to `POST /desk/start`; the `cognate.execution.start`
  row is gone.
- a **`PendingOperation` record kind** with 30 fields and three constraints, mirrored in the
  TypeScript validator and the independent Python implementation, covered by 15 new cross-language
  fixtures (86 cases in total).
- **handler-faithful parameter schemas** with wire names, and a build check that compares every
  governed row and every agent-door row against the live source field by field.
- an **`action_values` declaration** on the `POST /desk/search` dispatch entry, because that
  route's action names are semantic rather than literal, and a runtime refusal
  (`deskSearchAction`) that rejects any unlisted `record` value before the search runs.

## The independent reviews

| Round | Frozen copy | Verdict | Where |
|---|---|---|---|
| 1 | [`frozen/`](frozen/) | **REJECT** — 5 blocking, 6 must-fix, 2 advisory | [`independent-review-round-1.md`](independent-review-round-1.md) |
| 2 | [`frozen-round-2/`](frozen-round-2/) | **REJECT** — 5 blocking, 7 must-fix, 4 advisory | [`independent-review-round-2.md`](independent-review-round-2.md) |
| 3 | [`frozen-round-3/`](frozen-round-3/) | **REJECT** — 6 blocking, 4 must-fix | [`independent-review-round-3.md`](independent-review-round-3.md) |
| 4 | [`frozen-round-4/`](frozen-round-4/) | **REJECT** — 5 blocking, 4 must-fix | [`independent-review-round-4.md`](independent-review-round-4.md) |
| 5 | [`frozen-round-5/`](frozen-round-5/) | **REJECT** — 6 blocking, 3 must-fix | [`independent-review-round-5.md`](independent-review-round-5.md) |

The round-2 disposition — every finding, what changed, and what checks it — is
[`review-round-2-disposition.md`](review-round-2-disposition.md). The round-3 disposition is
[`review-round-3-disposition.md`](review-round-3-disposition.md). The round-4 disposition is
[`review-round-4-disposition.md`](review-round-4-disposition.md). Each is a record of corrections,
not an acceptance: the next review decides whether the corrections are real.

## What the round-4 review found

The round-4 review read the round-4 bytes and the pinned SEA-Forge source and returned **REJECT**
again. Eight of the ten round-3 findings are closed at the rule level; R3-01 and R3-09 are
partially closed. Nine new defects remain — five blocking, four must-fix:

| Finding | Severity | What it is |
|---|---|---|
| R4-01 | blocking | The two interfaces the contract calls **published** — `sea_forge.authority_decision` and `sea_forge.action_grant` — are not the artifacts the pinned owner source ships. `AuthorityDecision` at `b072ec50` carries no `resource_scope`, `amount`, `issuer_key_id` or `signature`; `ActionGrant` is move-only, "intentionally not serializable", with private fields and no amount, issuer key or signature. The contract demands facts the pinned artifact does not have. |
| R4-02 | blocking | The phone authenticates a **device credential**, but all six rows `POST /m/api/command` selects inherit `human_session` from the class defaults. Approve/reject are contained; **`horizon.settlement.rule` (P3) is not** — the phone reaches SEA-Forge's final settlement call with a device session and no pending record and no protected A3 confirmation. |
| R4-03 | blocking | `horizon.settlement.observe` is classified **P1** while its own note admits it writes the settlement record and hands evidence to another system, which P1's own-scope definition forbids. The live-enforcement table then paradoxically demands A3 and a pending record for that P1 row. |
| R4-04 | blocking | `device.pair` names `LOCAL_ENROLLMENT_PRESENCE` — a presence claim the A3 mechanism says "grants no A3 evidence" — while its live-enforcement entry lists `evidence_A3_UV` as missing, and the generated design repeats the contradiction. |
| R4-05 | blocking | `PendingOperation` is immutable, a confirmed record must carry all three confirmation fields, an expired record must carry none, and the design says every prior-launch `confirmed` record "becomes `expired`" on restart. There is no transition record, so the `confirmed → expired` edge has no coherent representation. |
| R4-06 | must-fix | `params.run_start` declares only `agent_execution` and `human_session` variants, but the validator falls back to a best-fit match when the discriminator is present and unresolved, so a `local_console` record inherits another caller's wire contract. |
| R4-07 | must-fix | `params.horizon_lesson_propose` accepts `proposed_by`, and the live handler stores that string as the lesson's proposer and shows it as "Proposed by …". The phone's reserved-field list is also narrower than the application's, and unknown fields pass through. |
| R4-08 | must-fix | The frozen fixture set cannot demonstrate the preregistered negative expectations: 23 pending cases and 6 evidence cases, with **0** nonce-replay cases, **0** supersession-chain cases, **0** human-without-session cases, **0** agent-with-session cases and **0** old-single-outcome cases. The rules were exercised only in the TypeScript test file, not in the cross-language fixture bytes. |
| R4-09 | must-fix | The phone serves both `/m` and `/m/`, but the non-operation list names only `/m`; and the `/health` and `/diagnostics` branches do not constrain the method while the catalog binds only `GET`. The route census is therefore not exact. |

The round-4 run changed no file: `git status --porcelain` before and after is byte-identical
(SHA-256 `63848e9b0f5fa218717b11296a51627cd28006b9ae793a61176743c04ef73e07`). The event transcript
is retained at [`review-transcript-round-4.jsonl`](review-transcript-round-4.jsonl) (SHA-256
`da63c091806947216e5de7004e8fcb97ddcb2dc51be612a290c4ed6e65db29cf`).
## What the round-5 review found
The round-4 remediation closed seven of the nine round-4 findings outright and is the first wave
whose corrections the reviewer called **closed** without qualification: R4-03 (settlement
observation is P2), R4-04 (enrollment evidence is presence, never A3-UV), R4-05 (the pending
operation's state is an append-only transition chain), R4-06 (an unknown caller discriminator is
refused by name), R4-07 (the proposer is derived from the caller), R4-08 (the frozen fixture set
exercises every preregistered negative tooth) and R4-09 (the route census is exact in both
directions — the reviewer counted 70 live route-method pairs and 70 catalogued pairs, with none
unnamed and none unanswerable). R4-01 and R4-02 are **partially closed**: the grant and the
entitlement are correctly unpublished, but the remaining published decision interface is still not
exact enough to consume; and the governed phone commands are contained before their target
effects, but the allowed P1 device rows are still executed and attributed as a human session.
The round-5 review returned **REJECT** with six blocking and three must-fix findings:
| Finding | Severity | What it is |
|---|---|---|
| R5-01 | blocking | Five reachable **desktop** P3 rows — `case.task.decide`, `horizon.settlement.rule`, both approval decisions and `workspace.export` — are admitted by the live-enforcement table to lack the pending/A3/authority path, and the live handlers perform the effects anyway. |
| R5-02 | blocking | `run.start` is an authority-free Px dispatcher whose target resolution is named missing and whose route is said to be refused until it exists, but the handler compares the previewed step set and calls `startCase`, which sends an unclassified `case_advance` with no resolved operation, class or authority. |
| R5-03 | blocking | A device credential is converted into a human actor: the remote server resolves the device session to the durable operator's user actor, and `device.surface.intent.commit` then invokes the human commit path with the literal `"human"`. |
| R5-04 | blocking | The catalog maps the `agent_execution` executor to `registered_agent_key`, but the live agent door authenticates only the stable key and receives no issuer-bound execution or attempt proof. |
| R5-05 | blocking | `OperationDescriptor` and `PendingOperation` allow only three caller kinds, while the catalog also has `code_holder`, `device_credential`, anonymous and unauthenticated executors; and live record validation carries no catalog executor fact and never proves a record's `caller_kind` is permitted for the operation. |
| R5-06 | blocking | The remaining published authority interface is a composite that lists conditional owner fields as unqualified requirements, omits the Merkle inclusion-proof fields, binds no Horizon reference to an owner field, and coexists with local signed `DelegationGrant` and `AuthorityDecision` payloads that read like owner artifacts. |
| R5-07 | must-fix | Class inheritance gives P0 and P1 rows assurance predicates (A0, A0-or-A1) that require an authenticated session, while the public health probe, the sign-in challenge and the pairing routes cannot produce them. |
| R5-08 | must-fix | "Before any record is appended" and `performs: false` are false: the remote governed refusal and the intent-classification refusal both append a durable refusal audit before answering. |
| R5-09 | must-fix | The P3 class rule asserts separation of duty universally, while only the approval, case-decision and export rows set `separation_of_duty: true`. |
The round-5 run changed no file: `git status --porcelain` before and after is byte-identical
(SHA-256 `754d1b116800dbcea38d01048e803c4264cf1ddce224131ddef29f77fb723355`). The event transcript
is retained at [`review-transcript-round-5.jsonl`](review-transcript-round-5.jsonl) (SHA-256
`6da454ba7ec11003844f30ddc88818322fe81c98f4bafba1817b213f4e4291d6`, 345 lines, 176 completed items).

Each frozen copy is mode `0444` with its own `MANIFEST.sha256`, and the reviewer verified the
manifest before reading anything. The two copies are kept separately so the round-1 verdict stays
bound to the bytes it read. The reviewer was a fresh independent critic (`gpt-5.6-sol`, xhigh,
read-only sandbox, ephemeral session), not the builder, and was instructed to read neither the
builder's evidence nor the builder's status files.

The round-2 prompt scopes runtime-enforcement gaps as **later-stage work**: Stage 0A freezes the
contract, and the contract now says plainly which governed rows the running code does not yet
enforce and which stage closes each gap. A governed row that is not enforced today is not itself a
defect; a governed row that *claims* enforcement it does not have is.

## Observed command output

| Command | Observed |
|---|---|
| `bun test test/identity-contract.test.ts` | 69 pass, 0 fail |
| `bun test test/identity-records.test.ts` | 31 pass, 0 fail |
| `bun test test/identity-defects.test.ts` | 14 pass, 0 fail |
| `bun test test/identity-issuer.test.ts` | 29 pass, 0 fail |
| `bun test test/identity-remediation.test.ts` | 13 pass, 0 fail |
| `bun test test/identity-remediation-2.test.ts` | 19 pass, 0 fail, 185 expect() calls |
| `bun test test/identity-remediation-3.test.ts` | 18 pass, 0 fail, 193 expect() calls |
| `uv run --project research pytest research/tests/test_identity_fixtures.py -q` | 140 passed |
| `bun run scripts/check-param-schema-binding.ts` | `param-schema binding: ok — 70 handlers agree with the frozen schemas` |
| `bun run scripts/check-design-contract-consistency.ts` | `design/contract consistency: ok — 14 comparisons agree` |
| `bun run scripts/check-delegation-register.ts` | `delegation register: ok — 3 delegation references are all registered` |
| `bun run scripts/check-dispatch-coverage.ts` | `dispatch coverage: ok — 32 dispatch entries agree with the rows that claim their routes` |
| `bun run scripts/check-route-census.ts` | `route census: ok — 69 answered routes are all named in the catalog` |
| `bun run scripts/check-external-interface-facts.ts` | `check-external-interface-facts: ok — 3 interfaces, 34 facts verified against the owner's pinned source` |
| `bun run scripts/check-stage0a-remediation-prereg-coverage.ts` | `ok — 19 expectations linked to named tests` |
| `bun run scripts/check-stage0a-remediation-2-prereg-coverage.ts` | `ok — 19 expectations linked to named tests` |
| `bun run scripts/check-stage0a-remediation-3-prereg-coverage.ts` | `ok — 17 expectations linked to named tests` |
| `bun run scripts/teeth-t23-mutation.ts` | `teeth-t23-mutation: ok — 28 mutants caught` |
| `bun run tsc --noEmit` | exit 0, no output |
| `just check-t23` | ok — preregistration shape and linkage checks, the binding check, the four identity suites, the Python fixture suite |
| `just gate-t23` | `gate-t23: ok — closed operation catalog, frozen record schemas and cross-language identity fixtures` |
| `just verify` | `verify: ok (active frozen artifacts: requirements/ledger.yaml + .wayfinder/answer-key.md)` |
| `just ledger` | `ledger invariants ok: 12 canonical invariant bindings across 11 requirements, all recorded`; freeze hash `sha256:ad8f0bb5411e3e81e53cb5c8ab81b6a25c7d8b0e5b58213845c37fff7c11e5d6` |
| `sha256sum -c MANIFEST.sha256` in `frozen-round-4/` | exit 0 — 15 artifacts OK; the round-4 reviewer reported the same |
| `codex exec --sandbox read-only --ephemeral -m gpt-5.6-sol -c model_reasoning_effort="xhigh" --json` | exit 0 — **REJECT**, 5 blocking and 4 must-fix findings; transcript SHA-256 `da63c091…` |
| `git status --porcelain \| sha256sum` before and after the round-4 review | byte-identical: `63848e9b0f5fa218717b11296a51627cd28006b9ae793a61176743c04ef73e07` |

## The design draft

The design was amended in the same wave so the two frozen files no longer disagree:

- section 9.1 names the external interfaces Horizon consumes, with a table generated from
  `contracts/identity/v1/external-interfaces.json`;
- section 11 names every reconciled operation ID and carries the freeze's live-enforcement tables;
- section 12's frozen parameter table is replaced field for field by the frozen schemas, and the
  Stage 0B boundary states that the browser's pairing route is `session.pair` and not the reserved
  `device.pair`;
- Appendix A names the `PendingOperation` record and its authority rule, and says where an
  `entitlement_ref` points;
- the Review Record states what each independent review found and what is still outstanding, and
  says that the third verdict is recorded beside the frozen copy it reads rather than in the
  design — because editing the design after the verdict would break the hash the remediation
  preregistration pins.

The design after the round-4 remediation is at SHA-256
`5536acfaa046cb2491fc41c378334a41fa328f78f73fef69b1c0e173e0dccfe8` (956 lines), pinned by
`.agents/prereg/horizon/STAGE-0A-REMEDIATION-3.prereg.yaml`. The freeze record
is [`.agents/evidence/2026-11-08-identity-authority/design-freeze-record.md`](../2026-11-08-identity-authority/design-freeze-record.md);
the delta against the round-2 frozen copy — whose bytes are retained read-only, so the whole
correction history stays reconstructible — is
[`.agents/evidence/2026-11-08-identity-authority/design-draft-delta-round-2.txt`](../2026-11-08-identity-authority/design-draft-delta-round-2.txt).

**The design is not claimed to be independently reviewed.** The round-4 review reads these bytes;
until its verdict lands, the design's post-review corrections remain unreviewed, exactly as the
freeze record says. The verdict will be retained in this directory beside the frozen copy it read.
The design was **not** edited after the round-4 freeze: a verdict is recorded beside the frozen
copy it read, not in the design, because editing the design afterwards would break the hash the
remediation preregistration pins.

## Limits

- Stage 0A proves contracts, not runtime behaviour. There is no issuer, no SEA-Forge bridge, no
  live bounded grant, no A3-UV challenge, no external effect and no settled evidence chain in this
  repository. The `Credential` schema is checked for shape only.
- The **runtime** half of the agent P2 path is still open: `ask.route` and the agent variant of
  `ask.withdraw` authenticate a registered key and write. The catalog now says so, names what is
  missing (`execution_proof`, `live_bounded_grant`, `pending_record`) and assigns it to Stage 2;
  the enforcement itself is not done.
- The 36 `candidate` and `reserved` rows are declarations, not capabilities. They become live-bound
  only when an exact handler exists.
- The human entitlement is a **specified** external interface, not a pinned one: SEA-Forge has
  published no entitlement artifact, so the fact names in `external-interfaces.json` are Horizon's
  requirement on the owner's payload, and the adapter that maps one to the other is Stage 3 work.
  While the owner has published none, the governed human path fails closed by design.
- The Python checker shares the fixture file and the rule text with the TypeScript validator, not
  the implementation. It can share a misreading of a rule.
- The route scan reads only literal `pathname === "…" && request.method === "…"` comparisons in
  `src/app.ts`. A route registered through a table, a variable, or another server file is invisible
  to it.
- Stage 0A is **not complete** until the round-5 independent review accepts the re-frozen contract
  set. Until then this directory records four rejected reviews and three remediations, not an
  acceptance.
- The desk's escalation path still uses its own authority checks rather than the catalog's
  A3-UV pending confirmation. That gap is declared in the catalog's `live_enforcement` block and
  assigned to Stage 0B; it is named here so the contract's honesty about it is not mistaken for
  Stage 0B's completion.

## Next

The round-4 remediation wave, then a fifth freeze and a fifth review. The wave's shape is set by
the nine findings above:

- the two interfaces the contract calls published are not the artifacts the pinned owner source
  ships, so they are marked unpublished and made to fail closed like the human entitlement, until
  SEA-Forge publishes a durable decision and grant envelope that carries the facts the contract
  checks;
- the phone's device credential gets its own operation rows, and every P2/P3 phone command is
  refused until a protected operation-bound confirmation path exists;
- `horizon.settlement.observe` is reclassified so an external evidence submission is not P1;
- `device.pair`'s enforcement row names its own enrollment ceremony instead of A3-UV;
- the pending record gets an append-only transition record and a complete transition table, so
  `confirmed → expired` has a representation that mutates nothing;
- an unresolved caller discriminator is refused rather than best-fitted;
- `proposed_by` stops being an actor field, and one reserved-field set covers both write
  boundaries;
- the frozen fixture set gains the cases the preregistration promised;
- the route census becomes exact.

Stage 0B — Horizon interim containment — follows an acceptance: `src/capabilities/pending-confirmations.ts`,
the `horizon confirm --pending <id>` CLI with its controlling-TTY and presence checks, reserved
operations routed through the pending check, and the desk's escalation path brought under the same
protected confirmation — with `test/pending-confirmations.test.ts`, `test/containment.test.ts`, and
`test/desk-write-token.test.ts`. Stage 0B is independently releasable and must not depend on the
new issuer or the SEA-Forge bridge.

One piece of that containment is already in place and is what closed the round-3 review's R3-01:
the phone's approval path is **structurally absent** rather than gated, so a session-only approval
is impossible from the remote. What remains is the protected confirmation itself — the pending
record, the controlled presence check, and the desk's escalation path running through it.

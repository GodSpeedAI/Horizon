# Independent Stage 0A manifest review — round 3
**Verdict: REJECT.** The review is retained verbatim below; nothing in it is edited.
| Field | Value |
|---|---|
| Reviewer | A fresh Codex `gpt-5.6-sol` session, reasoning effort `xhigh`, launched as the Critic role (`--sandbox read-only`, `--ephemeral`). It did not build the contract set and had no access to the builder's notes, status, debt, plans or reports. |
| Run | `codex exec --sandbox read-only --ephemeral -m gpt-5.6-sol -c model_reasoning_effort="xhigh" --json` |
| Thread | `01a1c6db-f9d4-7ba3-92c3-6bf846383c76` |
| Reviewed bytes | `.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/` — 15 files, hash-pinned by `MANIFEST.sha256` (mode 0444). The reviewer verified every hash itself (`sha256sum -c`, exit 0, all OK). |
| Reviewer prompt | SHA-256 `095945196fa8cf9d0766d97716898087bf8d9556d19195998c2315f5c0f89a9a` (`.agents/evidence/2026-11-09-stage-0a-defects/review-prompt-round-3.md`) |
| Event transcript | SHA-256 `70f5cf764bec0bdb94adcfc1cf96dc31a135b39b7575955968f1c63d3101afd6` — 1 turn, 158 completed items, `turn.completed`, no provider-failure marker (`usage_limit_exceeded`, `rate_limit_exceeded`, `server_overloaded`, `turn.failed`: 0 occurrences). |
| Side effects | None. The read-only sandbox changed no file: `git status --porcelain` before and after the run is byte-identical (SHA-256 `2247bf87aa85fab69c39842c903bbaf8a8afa82a97a6304f9c6a9584066b2695`). |
| Census derived by the reviewer | 73 rows — P0 17, P1 26, P2 23, P3 5, Px 2 — with 37 verified, 24 candidate and 12 reserved bindings, derived by the reviewer's own parser, not by a repository script. |
The reviewer's own final word was **REJECT**: six blocking findings, four must-fix findings. Twelve of
the sixteen round-2 findings are closed, two are partially closed, and two are not closed — the
reviewer's closure table says so per finding, with contract citations. The builder's account of the
remediation that follows is in `README.md` and, once written, in `review-round-3-disposition.md`.

# Independent Round-3 review

## 1. Manifest verification

Command:

```text
cd /home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3
sha256sum -c MANIFEST.sha256
```

Exit status: `0`

Complete output:

```text
.agents/prereg/horizon/STAGE-0A-DEFECTS.prereg.yaml: OK
.agents/prereg/horizon/STAGE-0A-REMEDIATION.prereg.yaml: OK
.agents/prereg/horizon/STAGE-0A.prereg.yaml: OK
.agents/prereg/horizon/T23.prereg.yaml: OK
contracts/identity/v1/a3-mechanism.yaml: OK
contracts/identity/v1/external-interfaces.json: OK
contracts/identity/v1/fixtures/record-cases.json: OK
contracts/identity/v1/issuer-profile.yaml: OK
contracts/identity/v1/operations.yaml: OK
contracts/identity/v1/params.yaml: OK
contracts/identity/v1/platform-claims.yaml: OK
contracts/identity/v1/policy.yaml: OK
contracts/identity/v1/records.json: OK
design_draft.md: OK
```

## 2. Independent census

I used standalone Python fed on stdin to parse the frozen YAML/JSON, plus an independent lexical scan of `src/app.ts` and `src/remote/server.ts`. I did not invoke repository check scripts.

### Operation and binding counts

| Class | Total | Verified | Candidate | Reserved |
|---|---:|---:|---:|---:|
| P0 | 17 | 5 | 12 | 0 |
| P1 | 26 | 19 | 7 | 0 |
| P2 | 23 | 11 | 5 | 7 |
| P3 | 5 | 1 | 0 | 4 |
| Px | 2 | 1 | 0 | 1 |
| **Total** | **73** | **37** | **24** | **12** |

All 73 operation IDs are unique.

Other counts:

```text
Parameter schemas:       53
Parameter aliases:        6
Operation-specific maps: 24
Missing schema refs:      0

Record kinds:            10
Signed records:           9
Unsigned records:         1
Record constraints:      23

Fixtures:               100
Valid:                   25
Invalid:                 75
```

Fixture kinds:

```text
A3Receipt               8
Approval                7
AuthorityDecision       9
Credential              7
DelegationGrant        11
EffectFence            10
EvidenceRecord          5
OperationDescriptor    18
PendingOperation       21
Refusal                  4
```

All 23 declared record constraints are cited by at least one invalid fixture. That proves fixture coverage of the declared rules, not semantic correctness of those rules.

The `live_enforcement` section has exactly 37 rows for the 37 verified operations:

```text
enforced_today=true:   24
enforced_today=false:  13

caller paths:
none                    1
human_session          28
agent_execution         6
code_holder             1
variant-specific        1
```

### Catalog-to-source route comparison

The 37 verified operations contain 41 route mentions representing 29 unique direct routes. All 29 route strings occur literally in live source.

The independent explicit-method route scan found:

```text
src/app.ts:             52 routes
src/remote/server.ts:   12 routes
Catalog direct/alias/non-operation declarations: 34
```

Of the 52 explicit app routes, 33 are declared. The 19 undeclared app routes are:

```text
GET /desk
GET /desk/conversation
GET /desk/decide.json
GET /desk/draft
GET /desk/first-move.json
GET /desk/lessons.json
GET /desk/next.json
GET /desk/remote.json
GET /desk/session
GET /desk/setup-guide
GET /desk/state.json
GET /desk/work.json
GET /workspace
GET /workspace.json
GET /workspace/approvals
GET /workspace/compare
GET /workspace/inspect
GET /workspace/remote
GET /workspace/remote/events
```

Three of those are recorded only as candidate observations: `/desk/state.json`, `/workspace.json`, and `/workspace/inspect`.

None of the remote server’s 12 explicit routes is represented:

```text
GET  /m
GET  /m/
GET  /m/api/events
GET  /m/api/state
GET  /m/health
GET  /m/pair
POST /m/api/auth/finish
POST /m/api/auth/options
POST /m/api/command
POST /m/api/pair/finish
POST /m/api/pair/redeem
POST /m/api/signout
```

`GET /health` was not counted by the explicit-method lexical scan because the live handler tests only the path at that branch; its catalog string was nevertheless found in source.

## 3. Previous-finding closure table

| Finding | Status | Independent basis |
|---|---|---|
| R2-01 | **Closed** | A3-T is now the predicate and `protected_terminal_presence` a separate claim; receipt constraints enforce the distinction. [a3-mechanism.yaml:40](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/a3-mechanism.yaml:40), [records.json:949](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/records.json:949) |
| R2-02 | **Closed** | The human, agent-execution, and governed-delegation constraints now include `PendingOperation`. [records.json:823](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/records.json:823) A separate caller-channel gap remains as R3-04 below. |
| R2-03 | **Not closed** | Completely unknown references refuse, but any identity-catalog-unknown deployment binding is classified `allowed: true`; in non-SEA-Forge mode it can reach direct invocation. [manifest.ts:667](/home/sprime01/projects/Horizon-gaps/src/contracts/identity/manifest.ts:667), [app.ts:879](/home/sprime01/projects/Horizon-gaps/src/app.ts:879) |
| R2-04 | **Closed** | `owner_rev` is an integer and workspace-label wire fields now match the stated handler contract. [params.yaml:89](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/params.yaml:89), [params.yaml:135](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/params.yaml:135) |
| R2-05 | **Partially closed** | Operation-specific schemas were added, but several P0/P1 live schemas still contradict handler types and optionality. [params.yaml:379](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/params.yaml:379), [panels-model.ts:48](/home/sprime01/projects/Horizon-gaps/src/ui/desk/panels-model.ts:48) |
| R2-06 | **Not closed** | The generated table omits nested nullability and therefore is not field-for-field equivalent to `params.yaml`; both also disagree with live optionality. [design_draft.md:687](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/design_draft.md:687), [params.yaml:379](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/params.yaml:379) |
| R2-07 | **Closed** | Approval resolution is fixed as catalog data for both aliases. [operations.yaml:425](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/operations.yaml:425) |
| R2-08 | **Closed** | `ask.route` is explicitly agent-executed, unenforced today, and deferred until the execution, grant, pending record, and A3-UV exist. [operations.yaml:294](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/operations.yaml:294), [operations.yaml:760](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/operations.yaml:760) |
| R2-09 | **Partially closed** | Every declared verified row now has a caller-path entry, and `session.pair` correctly uses `code_holder`. However, the live remote router is absent from the catalog and the health handler has an undeclared authenticated branch. [operations.yaml:194](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/operations.yaml:194), [remote/server.ts:323](/home/sprime01/projects/Horizon-gaps/src/remote/server.ts:323) |
| R2-10 | **Closed** | The agent door obtains the catalog action field and checks `refused_prefixes` against that value. [manifest.ts:627](/home/sprime01/projects/Horizon-gaps/src/contracts/identity/manifest.ts:627), [app.ts:2440](/home/sprime01/projects/Horizon-gaps/src/app.ts:2440) |
| R2-11 | **Closed** | `workspace.export` now declares separation of duty and honestly marks runtime enforcement missing until Stage 3. [operations.yaml:448](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/operations.yaml:448) |
| R2-12 | **Closed** | Pairing, recovery, and trust rotation name their own evidence requirements instead of inheriting A3-T. [operations.yaml:365](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/operations.yaml:365), [a3-mechanism.yaml:155](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/a3-mechanism.yaml:155) |
| R2-13 | **Closed** | Candidate locators use `observed_routes`/`observed_code_ops`; live bindings use `routes`/`code_ops`. [operations.yaml:133](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/operations.yaml:133) |
| R2-14 | **Closed** | The remediation preregistration records nine signed records and pins the final design hash while preserving the superseded preregistration as history. [STAGE-0A-REMEDIATION.prereg.yaml:13](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/.agents/prereg/horizon/STAGE-0A-REMEDIATION.prereg.yaml:13), [STAGE-0A-REMEDIATION.prereg.yaml:183](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/.agents/prereg/horizon/STAGE-0A-REMEDIATION.prereg.yaml:183) |
| R2-15 | **Partially closed** | A frozen external-interface descriptor now names subject, issuer, scope, amount, epoch, expiry, and revocation facts and fails closed while unpublished. It still lacks an authenticatable entitlement artifact and binds subject to a nonexistent `record_subject`; a fixture nevertheless calls an unpublished unsigned entitlement context valid. [external-interfaces.json:79](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/external-interfaces.json:79), [record-cases.json:438](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/fixtures/record-cases.json:438) |
| R2-16 | **Closed** | `A0_OR_A1` is explicitly `any_of`, and the human-credential rule now says the descriptor has no attempt reference rather than referring to a nonexistent field. [a3-mechanism.yaml:140](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/a3-mechanism.yaml:140), [records.json:830](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/records.json:830) |

## 4. Numbered findings

### R3-01 — Blocking: the live remote router is absent from the catalog

The catalog asserts that reconciliation closed every router gap and leaves `catalog_gaps` empty. [operations.yaml:925](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/operations.yaml:925)

That is false:

- `POST /m/api/pair/finish` performs credential registration and device replacement. [remote/server.ts:342](/home/sprime01/projects/Horizon-gaps/src/remote/server.ts:342)
- The catalog says `device.pair` is reserved and that no repository route performs enrollment. [operations.yaml:365](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/operations.yaml:365)
- `POST /m/api/command` dispatches `open_case`, `commit`, `approve`, `reject`, and `settle`. [remote/server.ts:544](/home/sprime01/projects/Horizon-gaps/src/remote/server.ts:544)
- Its approval path invokes the live SEA-Forge resolver using an authenticated phone session, but without the operation-bound pending/A3-UV contract the catalog requires. [remote/server.ts:575](/home/sprime01/projects/Horizon-gaps/src/remote/server.ts:575), [app.ts:702](/home/sprime01/projects/Horizon-gaps/src/app.ts:702)

Smallest correction: inventory `src/remote/server.ts`; add route dispatch keyed by server-resolved command kind; mark device enrollment live-bound with its actual ceremony or refuse it; and gate approval commands through the P3 pending, A3-UV, authority, and separation-of-duty path before any effect.

### R3-02 — Blocking: `/desk/decide` downgrades P3 approval to a P2 lesson row

The catalog maps the entire route to `lesson.decide` with `params.lesson_decide`. [operations.yaml:346](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/operations.yaml:346)

The handler dispatches by server-side card kind. An escalation card calls `resolveNavigationApproval`, while a lesson card calls `decideLesson`. [app.ts:1906](/home/sprime01/projects/Horizon-gaps/src/app.ts:1906), [app.ts:1931](/home/sprime01/projects/Horizon-gaps/src/app.ts:1931) The catalog’s schema does not even permit live `choice: "accept"` and declares `records` as an object although the handler reads an array. [params.yaml:154](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/params.yaml:154), [app.ts:1868](/home/sprime01/projects/Horizon-gaps/src/app.ts:1868)

Smallest correction: make `/desk/decide` a dispatcher whose classification is derived from the fetched card kind and selected action. Map escalation accept/reject to the P3 approval rows and enforce their authority; give lesson, hold, release, and other card effects their own accurate rows and schemas.

### R3-03 — Blocking: deployment-bound operations bypass the catalog’s minimum P2 rule

The frozen contract says every deployment-bound operation has minimum class P2 and retains its own authority and evidence. [operations.yaml:28](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/operations.yaml:28)

Live classification instead returns `allowed: true` for every identity-catalog-unknown deployment binding. [manifest.ts:682](/home/sprime01/projects/Horizon-gaps/src/contracts/identity/manifest.ts:682) The binding preparation checks payment and settlement access, not the identity contract’s pending confirmation, caller authority, or A3 evidence. [obligation.ts:121](/home/sprime01/projects/Horizon-gaps/src/settlement/obligation.ts:121) When governance mode is not SEA-Forge, `submitIntent` invokes the capability directly and appends the intent record. [app.ts:879](/home/sprime01/projects/Horizon-gaps/src/app.ts:879)

Smallest correction: give every deployment binding an effective class and authority contract. A P2/P3 binding must be disallowed on the plain intent path until the required pending record, caller authority, evidence, and authority decision are verified. Completely unknown and unloadable classifications should continue to refuse before capability invocation.

### R3-04 — Blocking: `PendingOperation` does not make caller channels mutually exclusive

`PendingOperation` has nullable `execution_ref`, `delegation_ref`, and `session_ref`. [records.json:740](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/records.json:740)

The constraints require agent execution and governed delegation and forbid execution/delegation for human or console callers, but they never:

- require `session_ref` for `human_session`;
- forbid `session_ref` for `agent_execution`;
- forbid `session_ref` for `local_console`;
- state an exclusive choice among the three authentication channels.

A valid-looking human record can therefore lack any session binding, and an agent record can simultaneously name a human session. The fixtures do not test either case.

Smallest correction: add one explicit cross-field constraint and fixtures:

```text
human_session:   session_ref present; execution_ref/delegation_ref absent
agent_execution: execution_ref present; session_ref absent; governed delegation present when required
local_console:   session_ref/execution_ref/delegation_ref absent
```

### R3-05 — Must-fix: the human-grant rule makes `grant.revoke` impossible

`human_has_no_grant` says a human descriptor or pending record carrying `grant_ref` in its parameters must be refused. [records.json:823](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/records.json:823)

But `params.grant_revoke` requires `grant_ref` as the identifier of the grant being revoked. [params.yaml:243](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/params.yaml:243) That is a target, not authority held by the human.

Smallest correction: distinguish authority-bearing delegation references from operation target identifiers. Do not apply the blanket parameter-name prohibition to schemas whose semantic target is a grant.

### R3-06 — Must-fix: parameter contracts still contradict both handlers and the design

Examples:

- `surface.blocks` is declared `object`; the handler requires an array. [params.yaml:379](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/params.yaml:379), [panels-model.ts:81](/home/sprime01/projects/Horizon-gaps/src/ui/desk/panels-model.ts:81)
- Question `options` is declared nullable object and required; the handler accepts an absent array of option objects and rejects null. `input` is required in the schema but optional live. [params.yaml:411](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/params.yaml:411), [panels-model.ts:64](/home/sprime01/projects/Horizon-gaps/src/ui/desk/panels-model.ts:64)
- Surface `title`, annotation `tone`, and panel `title` are required-nullable in the schema, while live types make them optional and generally reject null. [params.yaml:385](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/params.yaml:385), [panels-model.ts:48](/home/sprime01/projects/Horizon-gaps/src/ui/desk/panels-model.ts:48)
- The generated design table drops nested nullability such as `surface.title` and `surface.step`, despite claiming field-for-field generation. [design_draft.md:687](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/design_draft.md:687)

Smallest correction: encode arrays, optionality, and nullability separately and recursively; regenerate the design table with nested annotations; then add valid and invalid fixtures for every live schema.

### R3-07 — Blocking: the evidence outcome has two incompatible meanings

The design says the evidence contract records effect outcome as `none | uncertain | committed`. [design_draft.md:328](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/design_draft.md:328)

`EvidenceRecord.outcome` instead permits only `observed | failed | refused`. [records.json:562](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/records.json:562) Those are observation dispositions, not effect-settlement states. A consumer cannot implement the design’s promised commitment proof from this record.

Smallest correction: either add separate `observation_outcome` and `effect_outcome` fields with their distinct enums, or revise the design and every consumer to one explicitly defined meaning. Add fixtures covering uncertain and committed effects.

### R3-08 — Blocking: the external-authority path is not independently authenticatable

The entitlement interface is `specified_not_published` and says its path must fail closed. [external-interfaces.json:79](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/external-interfaces.json:79)

Nevertheless, `DECISION-HUMAN-ENTITLEMENT-OK` expects a decision backed by that unpublished interface to be valid. Its entitlement context contains only self-asserted facts, including an `issuer_ref`; it has no owner signature, key identifier, or trust-chain evidence. [record-cases.json:438](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/fixtures/record-cases.json:438)

Additionally:

- `subject_ref` binds to `record_subject`, but neither `AuthorityDecision` nor `EffectFence` has such a field. [external-interfaces.json:92](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/external-interfaces.json:92), [records.json:284](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/records.json:284)
- The published authority-decision interface’s declared required facts omit the resource scope and amount that Horizon says it checks. [external-interfaces.json:36](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/external-interfaces.json:36)

Smallest correction: mark every entitlement-backed fixture invalid until SEA-Forge publishes a signed artifact; freeze issuer/key/signature verification and an explicit subject-field mapping; and make each required check derivable from named interface facts.

### R3-09 — Must-fix: pending replay and terminal-state rules are incomplete

`PendingOperation` carries a nonce and `supersedes_ref`, but:

- `nonce_not_reused` applies only to `Approval` and `OperationDescriptor`;
- `supersedes_chain` applies only to `EffectFence` and `EvidenceRecord`;
- the confirmation-field rule defines pending and confirmed/dispatching/applied/uncertain states but says nothing about `expired`.

[records.json:910](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/records.json:910), [records.json:917](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/records.json:917), [records.json:924](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/records.json:924)

Smallest correction: include `PendingOperation` in nonce and supersession constraints, define whether an expired record preserves or lacks confirmation evidence based on its prior state, and add replay/expired/replacement fixtures.

### R3-10 — Must-fix: `horizon.health` is not the single anonymous operation the catalog claims

The catalog says `/health` is anonymous public liveness exposing no identity, counts, or versions. [operations.yaml:123](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-3/contracts/identity/v1/operations.yaml:123)

The live handler returns only `{ok}` to an unpaired caller, but returns the deployment profile, operator reference, semantic world, research state, and transports to a paired caller. [app.ts:3081](/home/sprime01/projects/Horizon-gaps/src/app.ts:3081) The catalog has no authenticated detailed-health operation.

Smallest correction: split anonymous liveness from authenticated diagnostics—preferably separate routes—or declare a dispatcher with distinct response/data-sensitivity contracts.

## 5. Final verdict

**REJECT.** The bytes verify and the frozen set is substantially more explicit than the previous round, but it is not semantically safe to freeze or build against. Six blocking defects remain: the remote router is outside the catalog, `/desk/decide` lowers P3 approvals into a P2 route, deployment-bound operations can bypass the minimum-P2 authority rule, pending caller channels are not exclusive, evidence outcome semantics conflict, and the external entitlement path accepts an unauthenticatable unpublished artifact in its own fixture. The passing manifest and complete fixture coverage do not mitigate those contradictions; they only prove that the contradictory bytes are intact and internally exercised.

## 6. Limits

- I read the complete frozen contract set and its four frozen preregistrations.
- I read live source only where needed to inspect claimed bindings: principally `src/app.ts`, `src/remote/server.ts`, `src/contracts/identity/manifest.ts`, `src/settlement/obligation.ts`, and `src/ui/desk/panels-model.ts`.
- I did not read any prohibited evidence outside the frozen tree, status file, debt file, report, or non-frozen preregistration.
- I did not run repository tests, repository contract checkers, build commands, or the application.
- I did not inspect or execute the pinned external SEA-Forge artifacts, Cognate, issuer service, RealityTrace, or cryptographic verification. The external-interface findings above follow from contradictions inside the frozen bytes themselves.
- The route comparison is a lexical source census, not runtime coverage. UI-page GETs may legitimately be non-operations, but the omitted remote writes and multiplexed approval handlers are real semantic effects.
- I wrote no files and made no repository change.
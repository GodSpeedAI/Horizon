## Manifest verification result — PASS

Ran first, before reading contract content:

```text
cd /home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-2
sha256sum -c MANIFEST.sha256
```

Exit status was `0`. Every manifested file reported `OK`:

```text
.agents/prereg/horizon/STAGE-0A-DEFECTS.prereg.yaml
.agents/prereg/horizon/STAGE-0A.prereg.yaml
.agents/prereg/horizon/T23.prereg.yaml
contracts/identity/v1/a3-mechanism.yaml
contracts/identity/v1/fixtures/record-cases.json
contracts/identity/v1/issuer-profile.yaml
contracts/identity/v1/operations.yaml
contracts/identity/v1/params.yaml
contracts/identity/v1/platform-claims.yaml
contracts/identity/v1/policy.yaml
contracts/identity/v1/records.json
design_draft.md
```

Paths below use:

- `F/` — the frozen-round-2 directory.
- `L/` — `/home/sprime01/projects/Horizon-gaps/`.

## Independent census

I wrote an independent Python census using `yaml.safe_load`, iterated the five `operations` groups, resolved defaults myself, and did not run the repository’s census/check scripts.

```text
TOTAL 73
CLASSES {'P0': 17, 'P1': 26, 'P2': 23, 'P3': 5, 'PX': 2}
BINDINGS {'verified': 37, 'candidate': 24, 'reserved': 12}
```

Parameter resolution:

```text
SCHEMAS 40
ROWS_WITH_RESOLVED_SCHEMA 73
MISSING []
```

I separately extracted explicit live POST branches from `src/app.ts`, added the `/agent/panels` prefix dispatch, and compared them with catalog and `non_operation_routes` entries:

```text
LIVE_POST 25
CATALOG_POST 24
NON_OPERATION_POST 1
LIVE_UNMAPPED []
CATALOG_NOT_LIVE []
```

The non-operation route is `POST /desk/handoff/preview`. The live and frozen dispatch sets matched exactly:

```text
AGENT_TOOLS
['annotate', 'answer.route', 'arrange', 'ask.withdraw',
 'ask_human', 'read_responses', 'show_surface']
MATCH True

DESK_ACTIONS
['human.answer', 'human.close', 'human.open', 'human.pin',
 'human.reassign_owner', 'human.stop_waiting']
MATCH True
```

All 46 declared route strings and all 16 declared `code_ops` strings occur in live source. This is textual existence evidence; candidate bindings still require semantic confirmation.

## Nine semantic checks

### 1. Operation definitions and handler mappings — CONCERN

The explicit write-route census is complete: no live POST write branch was missing from the catalog, and no cataloged POST route lacked a live branch. The two action dispatch sets match the source exactly. `POST /desk/search` also has the correct semantic split.

The concern is that seven `candidate` rows already name live routes or code operations but are excluded from `live_enforcement`: `horizon.workspace.read`, `horizon.inspect.focus`, `horizon.inspect.neighborhood`, `horizon.navigation.inspect`, `horizon.navigation.defer`, `horizon.navigation.reframe`, and `horizon.navigation.disagree`. The loader only requires enforcement entries for `binding: verified` (`L/src/contracts/identity/manifest.ts:442-453`).

Also, `/health`, `/frame`, and `/surface` have method-agnostic branches (`L/src/app.ts:3005`, `3028`, `3050`). A paired POST can therefore reach read behavior not represented by an exact POST route row. I found no write or class downgrade through those aliases, but the supposedly exact method surface is not actually closed.

Smallest correction: distinguish discovery locators from bound `routes`/`code_ops`, or promote the seven rows after semantic verification and add enforcement entries. Add explicit GET guards to method-agnostic read handlers.

### 2. Agent-vs-human caller restrictions — FAIL

The agent and human doors are structurally separate:

- Agent authentication is a registered bearer key (`L/src/app.ts:2351-2354`).
- Non-read human routes require the paired session cookie (`L/src/app.ts:2988-2998`).
- `ask.withdraw` correctly declares its dual caller (`F/contracts/identity/v1/operations.yaml:293-300`).

However:

- Only 8 rows explicitly declare `caller_authentication`; 63 of the 71 rows with a non-null executor resolve to `callerAuthentication: null`. The loader does not inherit authentication from class defaults (`L/src/contracts/identity/manifest.ts:308-325`).
- `session.pair` declares `executor: local_console` and `caller_path: local_console` (`F/contracts/identity/v1/operations.yaml:170-181,645-651`), but its handler authenticates only possession of a code in an HTTP JSON request (`L/src/app.ts:2899-2904`). It does not establish local-console presence.
- The frozen dispatch’s `action_field` is `tool`, but the `human.*` prefix check reads `op.op`; a request with `tool:"human.answer"` receives the generic unknown-tool refusal rather than the promised human-prefix refusal (`L/src/app.ts:2375-2379`).

Required correction: make caller authentication complete and machine-checkable for every non-Px row; represent the pairing-code bootstrap credential honestly; and apply `refused_prefixes` to the declared action field.

### 3. P0/P1 ownership and scope — PASS

P0 and P1 defaults contain explicit `scope_rule` explanations (`F/contracts/identity/v1/operations.yaml:29-53`). P1 rows that write outside generic scope provide more specific ownership, including caller-owned search rows, session lifecycle, agent-owned panels/questions, and person-owned panels.

I found no P0/P1 row whose declared effect is an external commitment or shared governed decision. Live P1 writes are scoped by the paired operator/session or registered agent key. Parameter-schema defects discussed below do not change this ownership result.

### 4. P2/P3 authority and confirmation — FAIL

Positive results:

- Every P2/P3 row resolves to a non-local-only authority writer.
- No P2/P3 row resolves to A0, A1, or `A0_OR_A1`.
- All catalog evidence requirement IDs exactly match the ten IDs declared by `assurance_requirements`.
- `approval.approve` and `approval.reject` have `separation_of_duty: true` and 10-minute expiry.
- P2/P3 rows have explicit expiry semantics, including grant-bound expiry where applicable.

Failures:

- The A3-T receipt vocabulary contradicts itself. The mechanism says A3-T receipts use `protected_terminal_presence` (`a3-mechanism.yaml:83`), then says that value is a presence claim that never satisfies A3-T (`:125-150`). `records.json` admits both values (`:536-542`), while the valid fixture uses `A3-T` (`record-cases.json:78-102`).
- `workspace.export` is described as missing separation of duty (`operations.yaml:792-803`; `design_draft.md:388`) but its catalog row does not set `separation_of_duty`, and the design’s final row table lists only A3-UV (`design_draft.md:715`).
- `A0_OR_A1` stores `requires: [A0, A1]` while its note says either one suffices (`a3-mechanism.yaml:136-140`). The data does not encode OR semantics.

Required correction: use one receipt predicate for A3-T, encode compound evidence semantics explicitly, and align `workspace.export`’s separation rule across the row, record constraints, design, and enforcement entry.

### 5. Parameter schemas, aliases, and downgrade resistance — FAIL

Every row resolves to an existing schema, but existence is not semantic agreement.

Concrete mismatches:

- `params.human_answer.owner_rev` is a `uint64` decimal string (`params.yaml:65-73`), while the live handler requires a JavaScript number (`L/src/app.ts:2563-2575`).
- The schema requires a 14-character version, but every valid PendingOperation human-answer example uses `0123456789abcdef`, which is 16 characters (`record-cases.json:2823-2829` and repeated cases).
- `OD-AGENT-GOVERNED-OK` is marked valid for `params.workspace_label` but supplies `target_ref`, `label`, and `expected_revision`; the schema requires session/event/record-sequence/verdict/failure fields (`record-cases.json:1929-1968`; `params.yaml:106-113`).
- The record validator checks only that `params_schema_ref` has the right name, not that nested `parameters` conform (`L/src/contracts/identity/records.ts:231-250`).
- P0/P1 defaults are generic `params.read`/`params.local_write`, despite the design’s assertion that schemas name the fields the handler consumes (`design_draft.md:630-634`). For example, `horizon.navigation.intent.commit` consumes `operation_ref` and `expected_outcome` (`L/src/app.ts:3031-3043`), while `params.local_write` names `target_ref`, `expected_revision`, and `value`.
- Approval aliases declare in prose that the operation ID fixes `resolution`, but `approval.approve` and `approval.reject` lack machine-readable `fixed_parameters`. Remote aliases have the required fixed data; approval aliases do not.
- The design’s frozen parameter table disagrees with `params.yaml` about optionality/nullability for workspace label, handoff, lesson decision, export, search, surface publication, annotation, agent questions, and panel opening (`design_draft.md:644-675`; `params.yaml:106-133,297-323,348-406`).

Required correction: validate nested parameters against their referenced schemas, reconcile live wire types, add operation-specific schemas for live P0/P1 handlers, make approval resolutions fixed data, and regenerate the design table from the authoritative schema or make its modifiers exact.

### 6. Human entitlement path vs agent grant path — FAIL

The intended paths are distinct:

- Human governed work uses a current SEA-Forge entitlement, no credential, and no delegation.
- Agent governed work requires an execution proof and live bounded grant.
- The issuer profile states that humans are never issued agent credentials.
- `PendingOperation` carries caller kind, execution/delegation references, confirmation state, and expiry.

But the normative record metadata does not apply the essential anti-substitution constraints to `PendingOperation`. All of these declare only `OperationDescriptor` in `applies_to`: `human_has_no_grant`, `human_has_no_credential`, `agent_needs_execution`, `console_has_no_execution`, `governed_agent_needs_delegation`, `params_schema_mismatch`, `alias_fixes_action`, and `dispatcher_target_listed` (`records.json:819-871`). Live validation applies several of them to both record kinds, contradicting the frozen metadata (`L/src/contracts/identity/records.ts:221-250`).

Three PendingOperation fixtures explicitly expect constraints whose frozen `applies_to` excludes PendingOperation:

```text
PENDING-HUMAN-WITH-GRANT       human_has_no_grant
PENDING-AGENT-NO-DELEGATION    governed_agent_needs_delegation
PENDING-SCHEMA-MISMATCH        params_schema_mismatch
```

The human entitlement route is also only a string reference: there is no frozen entitlement schema or referenced external interface defining its issuer, subject, scope, expiry, epoch, or liveness.

Required correction: add `PendingOperation` to every applicable constraint and freeze a minimal SEA-Forge entitlement reference contract or explicit external contract/version.

### 7. Unknown operations fail closed — FAIL

The loader itself is correct:

- Unknown ID → Px (`L/src/contracts/identity/manifest.ts:470-477`).
- Unknown/refused dispatch action → Px (`:480-493`).
- Unknown search action is refused before search or write (`L/src/app.ts:3124-3132`).
- Agent and desk dispatches use closed allowlists.

The failure is integration: live application code does not call the identity manifest classifier. Repository search found only the classifier’s definition. `commitNavigationIntent` checks `bindingFor`, which is application configuration rather than the closed identity catalog, and then submits an unbound current-frame choice when no expectation is supplied (`L/src/app.ts:873-891`). `assertCommitIntent` checks membership in the current frame, not membership in the identity catalog (`L/src/domain/intent.ts:91-100`).

Thus a future or dynamically supplied frame choice absent from the frozen catalog can be recorded through the real P1 `horizon.navigation.intent.commit` path instead of resolving to Px. The current static navigation references I found are all cataloged, so this is a reachable contract gap rather than evidence that an existing static choice already exploits it.

Required correction: classify operation references at every intent/dispatcher boundary and refuse Px before capability invocation or record append.

### 8. Freeze enforcement statement — FAIL

The table has the right four path names: `human_session`, `agent_execution`, `local_console`, and `none`. `none` is used only for `horizon.health`. It contains 37 entries: 24 `enforced_today: true`, 13 false. The governed false entries generally describe the current runtime honestly.

Failures:

- `session.pair`’s claimed `local_console` enforcement is stronger than the handler’s actual pairing-code possession check.
- `ask.route` says its gap closes at Stage 2 and lists only execution proof, live bounded grant, and pending record (`operations.yaml:704-714`). Its effective row still requires human A3 evidence, and the same frozen design includes it in Stage 0B’s successful local operations (`design_draft.md:410-438`). These cannot all be true.
- The `binding_defects` residual says Stage 0B adds A3-T and the pending record for `ask.route` (`operations.yaml:857-863`), contradicting the Stage 2 enforcement entry.
- `workspace.export` lists separation of duty as missing without declaring that requirement on its row.
- Seven source-locating candidate rows are excluded from the enforcement table solely because the loader equates “live-bound” with `binding: verified`.

Required correction: resolve the `ask.route` stage/authority model, fix the pairing caller path, align export separation, and clarify candidate locator semantics.

### 9. Internal consistency across the frozen set — FAIL

Passes:

- Design section 11 operation IDs match the catalog exactly: P0 17, P1 26, P2 23, P3 5.
- Appendix A and `records.json` name the same ten record types: nine signed plus unsigned `Refusal`.
- `session.pair` vs `device.pair` is consistently distinguished in the design and catalog.
- Policy constants and the platform-claim matrix are consistent with their cited design decisions.
- All 19 record constraints have at least one named fixture, and no fixture names an undefined constraint.

Failures:

- A3-T predicate contradiction.
- Design parameter table vs `params.yaml` modifiers.
- Fixture parameters vs referenced schemas.
- PendingOperation fixture expectations vs `constraints.applies_to`.
- Stage 0B `ask.route` contradiction.
- T23 preregistration expectation PE-04 says “eight signed record schemas plus the unsigned refusal” (`T23.prereg.yaml:58-63`); the frozen contract has nine signed records plus refusal.
- The three preregistrations pin earlier design hashes (`2c4a…` or `d0fb…`), while the reviewed frozen design is `df55e921…`. Historical prospective pins are not manifest corruption, but this frozen set has no superseding round-2 expectation binding the final design hash.

Required correction: issue an additive round-2 preregistration/amendment bound to the final design, with the corrected record count and semantic expectations.

## Catalog `binding_defects`

The two recorded `status: fixed` claims describe live reality.

- **DEF-ROLE-FROM-REQUEST — closed.** `SurfaceIntentRequestBody` has no role field (`L/src/app.ts:207-218`); the route refuses all actor/role/executor naming fields and supplies `"human"` from its authenticated path (`L/src/app.ts:3081-3094`).
- **DEF-ASK-ROUTE-EXECUTOR — closed.** The agent door authenticates a registered key, refuses body-supplied identity, passes the authenticated `keyId`, and records `executor_key`/`executed_by_key` (`L/src/app.ts:2351-2376,2238-2252`; `L/src/capabilities/panel-answers.ts:195-228`).

The `observed` fields are historical descriptions, as expected. The separate Stage 0B contradiction in DEF-ASK-ROUTE-EXECUTOR’s residual text remains a contract inconsistency, but it does not make the executor fix itself false.

## Numbered findings

1. **R2-01 — blocking — A3-T has two incompatible receipt predicates.**  
   Contract: `a3-mechanism.yaml:78-83,125-150`, `records.json:536-542`, `design_draft.md:624`, fixture `A3-TERMINAL-OK`.  
   Why wrong: `protected_terminal_presence` is simultaneously called the A3-T receipt predicate and a presence claim that cannot satisfy A3-T.  
   Smallest correction: make `A3-T` the receipt’s `assurance_predicate`, retain terminal presence as a separate claim, and remove `protected_terminal_presence` from the predicate enum.

2. **R2-02 — blocking — PendingOperation’s anti-substitution constraints are non-normative.**  
   Contract: `records.json:819-871`; Pending fixtures at `record-cases.json:3242-3465`.  
   Why wrong: fixtures and live validation apply descriptor constraints to PendingOperation, while frozen `applies_to` excludes it. A consumer following the frozen contract can accept a human grant or an agent without delegation.  
   Smallest correction: add `PendingOperation` to all applicable `applies_to` lists and add missing Pending fixtures for credential/execution/console cases.

3. **R2-03 — blocking — unknown identity-catalog operations are not gated at live intent boundaries.**  
   Source: `L/src/app.ts:873-891`; `L/src/domain/intent.ts:91-100`; no live reference to `loadOperationManifest`/`classify`.  
   Why wrong: current-frame membership can turn an operation absent from the identity catalog into a real P1 intent write.  
   Smallest correction: require non-Px identity classification before constructing/submitting any navigation or surface intent.

4. **R2-04 — blocking — governed parameter fixtures and live wire types contradict the schema.**  
   Contract/source: `params.yaml:9-13,65-73`; `record-cases.json:1929-1968,2823-2829`; `L/src/app.ts:2563-2575`.  
   Why wrong: `owner_rev` is string-vs-number incompatible, the supposedly valid version is the wrong length, and a supposedly valid workspace-label descriptor supplies entirely different fields.  
   Smallest correction: choose one lossless `owner_rev` wire type, correct the fixture versions and workspace-label parameters, and validate nested `parameters`.

5. **R2-05 — must-fix-before-Stage-0B — live P0/P1 handlers use schemas for different payloads.**  
   Contract/source: `design_draft.md:630-634`; `operations.yaml:29-53`; `L/src/app.ts:3031-3043,3139-3153`.  
   Why wrong: generic defaults do not name fields such as `operation_ref`, `expected_outcome`, `row_id`, `draft_id`, `text`, and `mode`.  
   Smallest correction: add operation-specific schemas for every verified live handler and include them in the same binding check as governed rows.

6. **R2-06 — must-fix-before-Stage-0B — the design parameter table is not field-for-field equivalent to `params.yaml`.**  
   Contract: `design_draft.md:644-675`; `params.yaml:106-133,297-323,348-406`.  
   Why wrong: requiredness and nullability differ across multiple schemas, so two frozen files define different canonical digests.  
   Smallest correction: regenerate the design table from `params.yaml`, including `optional` and `nullable`, or remove the duplicated table and make `params.yaml` exclusively normative.

7. **R2-07 — must-fix-before-Stage-0B — approval aliases are prose-only.**  
   Contract: `params.yaml:15-24,249-254`; `operations.yaml` approval rows around `388-400`.  
   Why wrong: unlike remote aliases, approval rows do not fix `resolution`; `approval.approve` can be described with `resolution:"rejected"` without violating catalog data.  
   Smallest correction: add `fixed_parameters: {resolution: approved|rejected}` to the two rows and add disagreeing-value fixtures.

8. **R2-08 — blocking — Stage 0B cannot both execute and defer `ask.route`.**  
   Contract: `operations.yaml:267-284,704-714,835-863`; `design_draft.md:384-391,410-438`.  
   Why wrong: the sole row is agent-executed and requires a bounded grant, unavailable until Stage 2, while Stage 0B lists it as a successful local operation.  
   Smallest correction: remove agent `ask.route` from Stage 0B success/effect lists and place full closure at the stage supplying both grant and required evidence, or create a separate local human operation.

9. **R2-09 — must-fix-before-Stage-0B — caller authentication is incomplete and `session.pair` overclaims local-console authentication.**  
   Contract/source: `operations.yaml:170-181,645-651`; `L/src/app.ts:2899-2904`; loader `manifest.ts:308-325`.  
   Why wrong: 63 non-Px rows resolve to no caller-authentication declaration, and an HTTP pairing-code exchange is not proof of a local-console executor.  
   Smallest correction: make authentication mandatory or derivable from executor, and add an explicit one-time-pairing-code/bootstrap caller type unless the route is genuinely constrained to a local console.

10. **R2-10 — must-fix-before-Stage-0B — `refused_prefixes` is checked against the wrong field.**  
    Contract/source: frozen dispatch `action_field: tool`; `L/src/app.ts:2375-2379`.  
    Why wrong: the security outcome remains fail-closed via the allowlist, but the frozen claim of a specific human-prefix refusal is false.  
    Smallest correction: check `op.tool.startsWith("human.")`.

11. **R2-11 — must-fix-before-Stage-0B — `workspace.export` separation of duty is internally inconsistent.**  
    Contract: `operations.yaml:409-414,792-803`; `design_draft.md:388,715`.  
    Why wrong: enforcement says separation is required and missing, but the row and final operation table do not consistently declare it.  
    Smallest correction: add `separation_of_duty: true`, define the distinct approver record path, and cover it with fixtures; otherwise remove every claim that export requires separation.

12. **R2-12 — must-fix-before-Stage-0B — exceptional P2 ceremonies inherit A3-T.**  
    Contract: P2 default `operations.yaml:54-70`; `device.recover`/`trust.rotate` around `354-379`; design `design_draft.md:363-373`.  
    Why wrong: their effective `stage0b_evidence` is A3-T even though the design requires recovery-code-plus-fresh-passkey or independent administrator presence and explicitly says these are never A3.  
    Smallest correction: override `stage0b_evidence` with the matching special requirement IDs for both rows.

13. **R2-13 — advisory — candidate source locators evade enforcement coverage.**  
    Contract/loader: `operations.yaml:109-122,144-146`; `L/src/contracts/identity/manifest.ts:442-453`.  
    Why wrong: a reader cannot tell whether a candidate `route` is merely a discovery hint or an actual live binding.  
    Smallest correction: use separate `observed_routes`/`observed_code_ops` fields until promoted.

14. **R2-14 — advisory — the preregistration no longer describes the frozen record contract.**  
    Contract: `T23.prereg.yaml:58-63`; actual record set in `records.json`; final design SHA-256 `df55e921…`.  
    Why wrong: PE-04 expects eight signed records, while the contract has nine, and no preregistration pins the final reviewed design.  
    Smallest correction: append a superseding round-2 preregistration with the final hash and nine-signed-plus-refusal expectation.

15. **R2-15 — advisory — the human entitlement reference has no frozen interface.**  
    Contract: `design_draft.md:174-179,210-211`; `records.json:287-301,413-435`; no entitlement entry in `issuer-profile.yaml`.  
    Why wrong: currentness, scope, subject, issuer, epoch, and expiry cannot be independently checked from this artifact set.  
    Smallest correction: freeze a versioned external SEA-Forge entitlement interface reference rather than inventing a Horizon-owned authority record.

16. **R2-16 — advisory — two record/evidence rules refer to data semantics they do not encode.**  
    Contract: `records.json:825-830`; `a3-mechanism.yaml:136-140`.  
    Why wrong: `human_has_no_credential` refers to nonexistent `OperationDescriptor.attempt_ref`, while `A0_OR_A1` encodes a two-item `requires` list but says either item suffices.  
    Smallest correction: remove `attempt_ref` from that descriptor rule and encode A0/A1 with an explicit `any_of` construct.

## Limits

- I read only the frozen-round-2 tree for contract content and the permitted live repository source. I did not read prior evidence, status, debt, plan, or report files.
- I wrote no files and made no repository changes.
- I did not run the repository’s census or binding check as evidence for my counts. The census, route comparison, fixture comparison, and constraint comparison were independent scripts.
- I did not start the server or mutate a live store. Runtime conclusions are source-derived, not load-, crash-, concurrency-, or deployment-tested.
- Route discovery was textual. Dynamically constructed routes, generated code, external consumers, and other repositories were outside the review.
- I did not inspect SEA-Forge or issuer implementations, so the external entitlement concern is about this frozen interface set, not a claim that no external implementation exists.
- I did not assess schema syntax validity, cryptographic implementation, native platform custody, or Stage 0B code that has not yet been built.

## Final verdict

REJECT
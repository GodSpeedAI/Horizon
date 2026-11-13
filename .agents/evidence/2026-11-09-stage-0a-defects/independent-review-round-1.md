# Independent Stage 0A manifest review — round 1

**Verdict: REJECT.** The review is retained verbatim below; nothing in it is edited.

| Field | Value |
|---|---|
| Reviewer | A fresh Codex `gpt-5.6-sol` session, reasoning effort `xhigh`, launched as the Critic role (`--sandbox read-only`, `--ephemeral`). It did not build the contract set and had no access to the builder's notes, status, debt, plans or reports. |
| Run | `codex exec --model gpt-5.6-sol -c 'model_reasoning_effort="xhigh"' --sandbox read-only --ephemeral --json` |
| Thread | `01a1c33b-8751-7c01-a497-90d7a6a0634c` |
| Reviewed bytes | `.agents/evidence/2026-11-09-stage-0a-defects/frozen/` — 12 files, hash-pinned by `MANIFEST.sha256` (mode 0444). The reviewer verified every hash itself (`sha256sum -c`, exit 0, all OK). |
| Reviewer prompt | SHA-256 `c9e3d2543b376f84afea7b0169137e98b01b0493d89c60c6f9b839b5d011b88a` (`/tmp/opencode/critic-prompt.md`) |
| Event transcript | SHA-256 `8d2d47f8f8d5074ac6f5203c2122e0e6d6fb4d2da5989f4449e1677dbc84a5fa` — 1 turn, 133 completed items, `turn.completed`, no provider-failure marker (`usage_limit_exceeded`, `rate_limit_exceeded`, `server_overloaded`, `turn.failed`: 0 occurrences). |
| Side effects | None. The read-only sandbox changed no file: `git status --porcelain` before and after the run is byte-identical (SHA-256 `5906b507403b26d0518c6844e114a7791d1d62496eb0535b40201f61a88a35c8`). |
| Census derived by the reviewer | 73 rows — P0 17, P1 26, P2 23, P3 5, PX 2 — derived by the reviewer's own parser, not by a repository script. This matches the builder's independently derived census. |

The reviewer's own final line was `REJECT`. Five findings are blocking, six must be fixed before Stage 0B,
and two are advisory. The builder's assessment of each finding — accepted, partially accepted, or
rejected with evidence — is in `review-round-1-disposition.md`; the remediation and the second round
follow in `README.md`.

---

## Manifest verification result — PASS

Command:

```text
cd /home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen
sha256sum -c MANIFEST.sha256
```

Exit status was `0`. All 12 entries in `MANIFEST.sha256` reported `OK`; none failed.

## Independent census

I used a standalone Python/PyYAML script that read the frozen `operations.yaml`, merged each class default into its rows, and counted the resulting records. I did not run a repository validation script or use a stated expected count.

| Class | Count |
|---|---:|
| P0 | 17 |
| P1 | 26 |
| P2 | 23 |
| P3 | 5 |
| PX | 2 |
| **Total** | **73** |

Additional derived counts:

- Bindings: 37 `verified`, 24 `candidate`, 12 `reserved`.
- Executors: 58 `human_session`, 8 `agent_execution`, 2 `agent_execution_or_human_session`, 3 `local_console`, 2 null.
- Route references: 46 references to 33 unique routes.
- Code-operation references: 17 unique references.
- Duplicate operation IDs: none.
- All referenced parameter-schema names exist in `params.yaml`.
- All named authority writers exist in the frozen writer catalog.
- No P2/P3 row uses `local_read_policy` or `cognate_local_policy`.
- No P2/P3 row uses literal A0, A1, or A0_A1 evidence.

I independently scanned live TypeScript route guards and catalog bindings:

```text
live_post_routes 25
unaccounted_live_post_routes []
catalog_post_refs_without_literal_route []
code_op_refs 17
code_ops_without_exact_source_literal ["note.remove"]
```

Thus every live POST route was at least accounted for as a catalog route, dispatcher, alias, or the non-mutating `/desk/handoff/preview`. This establishes syntactic route coverage, not semantic correctness.

Ten manifest IDs are absent from the normative closed catalog in `design_draft.md:338-359`:

```text
agent.question.ask
agent.response.read
agent.surface.annotate
agent.surface.arrange
agent.surface.publish
horizon.search.read
horizon.search.record
human.panel.close
human.panel.open
session.logout
```

There are also 26 rows with no route, code operation, or dispatcher locator:

```text
horizon.research.health
horizon.case.read
horizon.evidence.read
horizon.context.query_reference
horizon.settlement.observe
workbench.view.read
gauntlet.run.read
realitytrace.observation.read
workbench.draft.save
workbench.conversation.discard
workbench.expert.launch
device.remove
device.recover
expert.install
expert.configure
expert.answer
expert.remove
grant.create
grant.revoke
gauntlet.run.cancel
trust.rotate
grant.redelegate
approval.approve
approval.reject
external.commit
isolation.request
```

Most are honestly marked candidate or reserved, but they are not presently operations with live handlers.

## Seven semantic checks

### 1. Operation definitions and handler mappings — FAIL

Evidence:

- The normative design says an operation not listed in its catalog is Px (`design_draft.md:338-340`), yet the manifest adds the ten IDs listed above.
- `operations.yaml:75-76` admits that candidate rows have no confirmed binding and reserved rows have no route. Twenty-six rows have no binding locator at all.
- `horizon.note.remove` claims `code_ops: ["note.remove"]` at `operations.yaml:123`, but the live source contains no such code-operation identifier. `removeFromCase` exists only as an uncalled function at `src/capabilities/notes.ts:135-142`.
- All 25 live POST route literals are accounted for. No live catalog POST reference names a nonexistent literal route.
- `/desk/pair` is mapped to governed `device.pair` at `operations.yaml:300-307`, but the handler only accepts an eight-character terminal code and creates an in-memory browser cookie (`src/app.ts:2899-2904`, `src/desk/pairing.ts:62-83,104-123`). It does not accept or enroll the `device_label`, `credential_id`, and `public_key` required by `params.device_pair` (`params.yaml:114-118`).
- `cognate.execution.start` is P1 at `operations.yaml:134-137`, while the handler starts every pending step in a case (`src/app.ts:2663-2682`). That is shared execution routing, not merely a caller-owned local draft.

To pass: issue one consistent frozen design/catalog version, remove or bind the false `note.remove` locator, separate desk-session pairing from device enrollment, and route `/desk/start` through effect-sensitive `run.start` classification.

### 2. Agent-versus-human caller restrictions — FAIL

What is correct:

- The agent door authenticates a bearer agent key (`src/app.ts:2342-2353`).
- It permits exactly the seven tools represented in the frozen dispatch table (`src/app.ts:2337-2379`; `operations.yaml:395-407`).
- `human.*` operations and caller-naming fields are refused (`src/app.ts:2372-2379`).
- The person’s panel route rechecks the pairing cookie before committing (`src/app.ts:2471-2477`).

Failures:

- A registered agent key is not the execution proof and live bounded delegation required for an agent P2/P3 caller by `design_draft.md:179-188,205-211`. `ask.route` and agent `ask.withdraw` are reached with only that key, after which `agentCommandNow` performs the mutation (`src/app.ts:2382-2385`). `planRoute` then commits the route claim and authenticated key (`src/capabilities/panel-answers.ts:206-228`).
- The catalog says A3 human authorization remains required for those P2 operations (`operations.yaml:232-267`), but the live path has no pending/A3/grant gate.
- The desk “human session” is only possession of an in-memory terminal-pairing cookie. It is not bound to the durable human principal described in the issuer contract (`issuer-profile.yaml:129-134`); application effects use one configured operator at `src/app.ts:422`.
- `horizon.health` inherits `executor: human_session` (`operations.yaml:29-37,81`), but `/health` deliberately accepts an unpaired caller (`src/app.ts:3005-3014`).

To pass: bind agent P2 calls to an issuer-verified execution and live delegation, make them pending until the required authority/evidence is consumed, bind human sessions to durable principals, and correct the health and pairing caller declarations.

### 3. P0/P1 ownership and scope — FAIL

The independent census found:

```text
P0/P1 ownership:
none_required 34
caller_own_session 1
caller_owns_panel 4
caller_owns_question 1
caller_scoped_own_rows 1
person_owns_board 2
```

All 18 default P1 rows listed below are writable yet declare only `none_required` through the class default at `operations.yaml:38-46`:

```text
horizon.navigation.defer
horizon.navigation.reframe
horizon.navigation.disagree
horizon.navigation.intent.commit
horizon.surface.intent.commit
horizon.note.save
horizon.note.remove
horizon.draft.save
horizon.conversation.discard
horizon.case.open
horizon.lesson.propose
horizon.onboarding.skip
horizon.onboarding.resume
horizon.workspace.presenting
workbench.draft.save
workbench.conversation.discard
workbench.expert.launch
cognate.execution.start
```

`none_required` is a conclusion, not the requested explicit justification. Several live implementations do enforce caller scope internally, but the catalog does not state that invariant. More seriously, `cognate.execution.start` triggers shared case execution and therefore does not meet the P1 definition of reversible work inside existing ownership (`design_draft.md:205-211`).

To pass: assign an explicit caller/resource ownership rule or written no-owner rationale to every P0/P1 row, and classify `/desk/start` through `run.start` according to its resolved targets.

### 4. P2/P3 authority and confirmation — FAIL

What is correct:

- Every P2/P3 row names `cognate_local_continuation`, `case_record.authority`, `sea_forge`, or `issuer_root`; none uses a local-read/local-policy writer.
- No governed row is satisfiable by literal A0/A1.
- Approval records carry requester, executor, and approver identities (`records.json:352-407`).
- The frozen constraint and live validator reject an approver equal to the requester or executor (`records.json:713-717`; `src/contracts/identity/records.ts:248-253`).

Failures:

- P2/P3 defaults use `A3_UV` and `A3_T` (`operations.yaml:47-60`), but the canonical predicates are `A3-UV` and `A3-T` (`a3-mechanism.yaml:20-45`). The live matcher compares exact normalized strings and will not equate underscores with hyphens (`src/contracts/identity/issuer.ts:251-260`).
- The canonical comparison script produced:

```text
catalog_human_evidence =
["A0","A0_A1","A3_UV","admin_presence_independent_admin",
 "local_enrollment_presence","none",
 "none_for_agent_execution_A3_UV_for_human_session",
 "per_target_row","recovery_code_local_presence_fresh_passkey"]

canonical_a3_predicates =
["A0","A1","A2","A3","A3-T","A3-UV"]
```

- `approval.approve` and `approval.reject` inherit the P3 null expiry (`operations.yaml:56-63,344-355`), contradicting the required ten-minute expiry in `design_draft.md:664` and the 600-second policy at `policy.yaml:18,26`.
- Rows using `case_record.authority` require immutable `case_authority: local | governed` in their pending record (`design_draft.md:588`). `records.json` defines no `PendingOperation` and no `case_authority`; an exact search for either returned no match.
- The Stage-0B terminal mechanism says its predicate is `A3-T` but says its receipt records `protected_terminal_presence` (`a3-mechanism.yaml:70-83`). The live matcher explicitly rejects that value as satisfying an A3 predicate (`issuer.ts:256-259`).

To pass: use one canonical predicate vocabulary, represent terminal presence separately from the assurance predicate, set both approval rows to `10m`, and define and validate the immutable pending `case_authority`.

### 5. Parameter schemas, aliases, and downgrade resistance — FAIL

What is correct:

- Every row’s `params_schema` exists.
- No current route alias points to a weaker manifest row.
- Governed rows do not use `params.read` or `params.local_write`.

Failures:

- The P2 schemas do not describe the actual committed effects:
  - `params.ask_withdraw` requires panel, ask, reason, and expected revision (`params.yaml:78-83`), but `human.stop_waiting` accepts a `step` and closes all waits for it (`src/app.ts:2494-2508`).
  - `params.ask_reassign` declares `assignee` and `expected_revision` (`params.yaml:71-76`), but the handler uses `from_key_id`, `to_key_id`, and `confirmed` (`src/app.ts:2511-2548`).
  - `params.human_answer` declares one `expected_revision` (`params.yaml:56-62`), while the handler requires a 14-hex question `version` and numeric `owner_rev` (`src/app.ts:2563-2575`).
  - `params.owner_pin` requires `target_ref` and `expected_revision` (`params.yaml:85-89`), while the live operation accepts `id` and `pinned` (`src/app.ts:2604-2605`).
- Alias semantics are prose. `params.yaml:15-24,219-224` says an operation ID fixes the action or resolution, but the manifest loader only verifies that an alias target exists (`manifest.ts:242-247`).
- The record validator enforces a fixed alias only if an external caller supplies `CatalogFacts.alias_fixed` (`records.ts:44-51,225-234`). The frozen manifest does not contain or derive that structured fact.
- Route alias “narrowing” and `added_requirements` are unvalidated strings (`operations.yaml:432-442`; `manifest.ts:81-89,242-247`).

To pass: make exact effect parameters match the handlers, split semantically different actions where necessary, encode fixed alias values and narrowing requirements structurally, and derive them from the trusted manifest rather than caller-supplied facts.

### 6. Human entitlement path versus agent grant path — FAIL

The intended frozen model is distinct and basically coherent:

- A human P2/P3 caller has no grant and uses a current entitlement (`design_draft.md:175-179`; `records.json:284-301,725-730`).
- A governed agent must supply execution identity and a live delegation (`records.json:113-200,689-693`).
- Humans are prohibited from acquiring a grant (`records.json:659-664`; `policy.yaml:35-36`).
- The issuer contract can in principle enroll an agent and resolve issuance from enrollment plus a verified human session or grant (`issuer-profile.yaml:112-152`).
- The issuer contract explicitly does not claim a qualified platform implementation (`issuer-profile.yaml:14-17`).

The paths are not satisfiable end-to-end in the live application:

- The human confirmation path cannot match the catalog’s underscored A3 predicates.
- The desk cookie is not a durable human-principal session or entitlement.
- Agent P2 operations accept a registered key without an execution descriptor, credential, grant, budget, depth, or grant expiry.
- The missing pending `case_authority` prevents `case_record.authority` from selecting and freezing the local-entitlement versus governed-grant path.

To pass: retain the record-level separation but wire both live paths through it—durable human session plus entitlement/A3 for humans, and credentialed execution plus live bounded delegation for agents.

### 7. Unknown operations fail closed — FAIL

The loader itself passes this check. Direct evaluation against the frozen manifest produced:

```json
{"id":"unknown.operation","class":"PX","reason":"unlisted_operation","refusal":"unlisted_operation"}
{"id":"POST /agent/panels#human.answer","class":"PX","refusal":"reserved_for_person","route":"POST /agent/panels"}
{"id":"POST /agent/panels#not.a.tool","class":"PX","refusal":"unknown_action","route":"POST /agent/panels"}
{"id":"POST /not-dispatch#anything","class":"PX","refusal":"no_dispatch_route","route":"POST /not-dispatch"}
```

The returned unknown classification has no writer, expiry, or writable capability. This agrees with `manifest.ts:259-282`.

The live router does not use this loader: a search of `src` outside `manifest.ts` found no `loadOperationManifest`, `parseOperationManifest`, or `dispatchAction` call.

There is one concrete fail-open classification path:

- The frozen `/desk/search` dispatch accepts only `false_or_absent` or `true_with_non_empty_q`, with all other actions Px (`operations.yaml:421-426`).
- The live route treats any other `record` value—and `record: true` with an empty query—as a normal read response rather than an unknown-action refusal (`src/app.ts:3116-3128`).

No unknown action was observed writing state. The defect is that an unknown dispatch action executes a real P0 read path instead of resolving to Px.

To pass: route semantic action selection through the manifest loader, or implement an equivalent exact selector that rejects every value outside the two frozen search actions before reading or writing.

## `binding_defects` reality check

The two recorded defects are closed in the live source under their stated narrow criteria:

- **DEF-ROLE-FROM-REQUEST:** closed. `SurfaceIntentRequestBody` has no role field (`src/app.ts:207-212`); actor-naming fields include role and executor (`src/app.ts:189-205`); `/surface/intent` rejects those fields and supplies `"human"` from the authenticated route context (`src/app.ts:3073-3097`).
- **DEF-ASK-ROUTE-EXECUTOR:** closed as an attribution defect. The agent door authenticates the bearer key, refuses caller-naming fields, and passes the authenticated key into the operation (`src/app.ts:2342-2385`). The answer record stores `executed_by_key`, and the conversation row stores `executor_key` (`src/capabilities/panel-answers.ts:206-228`; `src/app.ts:2249`).

The register does not fully describe current reality:

- Its residual claim that the design table still says `human_session` for `ask.route` (`operations.yaml:484-487`) is stale; the frozen design already names agent execution at `design_draft.md:648,674`.
- Closing executor attribution did not close the separate absence of execution proof, delegation, authority decision, and A3 consumption on the live P2 route.

## Numbered findings

1. **F-01 — blocking — The two frozen canonical catalogs disagree.**  
   `design_draft.md:338-359` declares a closed catalog but omits ten IDs present in `operations.yaml`. Those IDs are simultaneously Px under the design and P0/P1 under the manifest.  
   **Smallest correction:** amend the normative catalog and Appendix A to include the ten reconciled operations, issue a new frozen design version/hash, and re-pin the manifest; alternatively remove those rows and refuse the live actions.

2. **F-02 — blocking — Required A3 evidence identifiers cannot match canonical receipts.**  
   `operations.yaml:47-60` uses `A3_UV`/`A3_T`; `a3-mechanism.yaml:20-45` and `records.json:536-541` use `A3-UV`/`A3-T`; `issuer.ts:251-260` compares predicate identity.  
   **Smallest correction:** replace the underscored identifiers with canonical hyphenated IDs and record terminal presence as a separate claim rather than a competing predicate string.

3. **F-03 — blocking — P2 parameter schemas do not bind the effects committed by their handlers.**  
   `params.yaml:56-89` disagrees with `src/app.ts:2494-2508,2511-2548,2563-2575,2604-2605`. An A3 digest made from the frozen schema cannot faithfully authorize the live operation.  
   **Smallest correction:** define schemas using the handlers’ normalized parameters and revision tokens; split `human.stop_waiting` from agent `ask.withdraw`, or define an explicit caller-discriminated schema.

4. **F-04 — blocking — Agent P2 operations bypass execution proof and bounded delegation.**  
   `design_draft.md:179-188,205-211` forbids a local agent P2 path, but `ask.route` and agent `ask.withdraw` authenticate only a registered key (`src/app.ts:2337-2385`) and then write.  
   **Smallest correction:** turn the agent call into a pending P2 descriptor bound to execution and delegation, and consume the required authority decision/A3 evidence before `planRoute` or withdrawal commits.

5. **F-05 — blocking — `case_record.authority` cannot be frozen in the required pending record.**  
   `design_draft.md:588` requires immutable `case_authority`; `records.json` has neither that field nor a `PendingOperation` record.  
   **Smallest correction:** add the pending record schema with immutable `case_authority`, operation digest, expiry, revisions, and caller references, then validate that every `case_record.authority` decision uses it.

6. **F-06 — must-fix-before-Stage-0B — Approval expiry is null despite the normative ten-minute limit.**  
   `approval.approve` and `approval.reject` do not override P3’s null default (`operations.yaml:56-63,344-355`), contradicting `design_draft.md:664` and `policy.yaml:18,26`.  
   **Smallest correction:** set `pending_expiry: 10m` on both rows.

7. **F-07 — must-fix-before-Stage-0B — `/desk/pair` is not a `device.pair` handler.**  
   The catalog expects physical-presence credential enrollment with `device_label`, `credential_id`, and `public_key`; the live route creates only an in-memory browser cookie from a short terminal code.  
   **Smallest correction:** remove the `device.pair` mapping from `/desk/pair`; declare a distinct desk-session ceremony, and reserve `device.pair` for an actual credential-enrollment handler.

8. **F-08 — must-fix-before-Stage-0B — Starting shared case execution is classified as P1.**  
   `operations.yaml:134-137` maps `/desk/start` to `cognate.execution.start`, while `src/app.ts:2663-2682` starts all pending steps.  
   **Smallest correction:** map the route to the `run.start` dispatcher and resolve the pinned target operations before choosing the class.

9. **F-09 — must-fix-before-Stage-0B — Alias downgrade resistance is prose, not trusted data.**  
   `params.yaml:15-24,219-224` and `operations.yaml:432-442` describe fixed values and narrowing textually; `manifest.ts:242-247` checks only target existence, while `records.ts:44-51,225-234` trusts externally supplied alias facts.  
   **Smallest correction:** add structured `fixed_parameters`, target class, and machine-checkable narrowing fields to the frozen manifest, and derive validator facts directly from it.

10. **F-10 — must-fix-before-Stage-0B — P0/P1 ownership declarations are incomplete.**  
    Thirty-four P0/P1 rows inherit `none_required`; 18 are writable P1 rows. `none_required` does not explain why no owner is required, and `cognate.execution.start` has a shared effect.  
    **Smallest correction:** assign an explicit ownership/scope rule or per-row rationale, and reclassify effects that leave caller-owned scope.

11. **F-11 — must-fix-before-Stage-0B — Unknown search actions do not resolve to Px in the live router.**  
    `operations.yaml:421-426` freezes two selectors and Px otherwise; `src/app.ts:3116-3128` falls through to a read for every unsupported selector. The manifest loader is not used by the router.  
    **Smallest correction:** validate the selector against the frozen dispatch table before calling `deskSearch`; reject unsupported values with the typed Px refusal.

12. **F-12 — advisory — Not every catalog row has a real handler mapping.**  
    Twenty-six rows have no binding locator, and `horizon.note.remove` names a nonexistent `note.remove` code operation (`operations.yaml:123`). Their candidate/reserved labels make the incompleteness visible, but they do not satisfy “one real operation with one real handler.”  
    **Smallest correction:** remove the false `note.remove` locator now; promote candidate/reserved rows only when an exact live binding exists.

13. **F-13 — advisory — Caller declarations and the defect register contain stale statements.**  
    `horizon.health` inherits `human_session` despite its public unpaired path. `DEF-ASK-ROUTE-EXECUTOR` says the design table still needs amendment although the frozen design is already amended.  
    **Smallest correction:** override the health caller authentication to the actual anonymous connection model and remove or update the stale residual text in the next frozen revision.

## Limits

- I reviewed contract content only from the specified frozen tree and implementation evidence from the live `src` tree.
- I did not read prohibited evidence outside `frozen/`, current-status files, debt, plans, or reports.
- I did not run repository-owned contract/check scripts.
- I ran the independent parsing/source-census scripts and the manifest loader evaluation described above; no files were written.
- Route and caller discovery was static. Dynamic routing, generated code, deployed clients, and code in other repositories may add behavior not visible here.
- I did not exercise a browser, live SEA-Forge, Cognate authority service, external issuer, WebAuthn device, or protected terminal. Consequently, this review does not establish runtime qualification, concurrency safety, or platform custody.
- Candidate and reserved rows were checked as declarations, not as implemented capabilities; where no handler exists, no runtime behavior could be verified.

REJECT
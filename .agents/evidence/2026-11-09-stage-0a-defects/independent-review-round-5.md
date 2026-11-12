# Independent review — REJECT

The manifest verified, and the route/schema corrections are substantial. The set is still unsafe to freeze: six blocking semantic defects remain, including reachable P3 effects without the required confirmation path, an active unresolved dispatcher, caller-identity substitution, and an incomplete external-authority binding.

## 1. Manifest verification

Command:

```bash
cd /home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5
sha256sum -c MANIFEST.sha256
```

Exit status: `0`

Complete output:

```text
.agents/prereg/horizon/STAGE-0A-DEFECTS.prereg.yaml: OK
.agents/prereg/horizon/STAGE-0A-REMEDIATION-2.prereg.yaml: OK
.agents/prereg/horizon/STAGE-0A-REMEDIATION-3.prereg.yaml: OK
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

These counts came from independent read-only Python/source scanners, not repository check scripts.

| Area | Result |
|---|---:|
| Operations | 101 |
| Classes | P0 29; P1 34; P2 26; P3 10; PX 2 |
| Bindings | verified 73; candidate 19; reserved 9 |
| Live-enforcement rows | 73 unique; exactly equal to verified rows |
| Parameter schemas | 82 |
| Operation-specific schema bindings | 51 |
| Parameter aliases | 12 |
| Effective operation schemas | all 101 rows resolve; 82 distinct |
| Record schemas | 11: 10 signed, 1 unsigned refusal |
| Record constraints | 27 |
| Dispatchers | 5 routes |
| Dispatcher mappings | 21 direct actions + 11 resolved combinations = 32 |
| Operation method/path pairs | 56 |
| Route aliases | 1 |
| Catalog gaps | 0 |
| Non-operation routes | 14 |
| Normalized catalog route union | 70 |
| Live source routes | 70: 58 application, 12 remote |
| Live routes unnamed by catalog | 0 |
| Catalogued routes not answerable live | 0 |
| Fixtures | 124: 31 expected-valid, 93 expected-invalid |
| Fixture record kinds | all 11 represented |
| Fixture/catalog schema comparisons | 46; 0 mismatches |

The fixture set now includes nonce replay, supersession, human-without-session, agent-with-session, console channel violations, the legacy single-outcome evidence record, and terminal/restart transition cases. The frozen design SHA-256 is `5536acfaa046cb2491fc41c378334a41fa328f78f73fef69b1c0e173e0dccfe8`, matching the round-5 preregistration pin.

Three exploratory census probes initially used incorrect YAML paths; I preserved those failures, inspected the actual structure, and reran against `live_enforcement.rows` and `dispatch`. Only successful rerun counts appear above.

## 3. Previous-finding closure

| Finding | Status | Evidence |
|---|---|---|
| R4-01 | **Partially closed** | `action_grant` is now correctly `specified_not_published`, but the remaining published decision interface is not exact enough to consume; see finding 6. [external-interfaces.json:26](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/external-interfaces.json:26), [external-interfaces.json:227](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/external-interfaces.json:227) |
| R4-02 | **Partially closed** | Governed phone commands are now contained before their target effects, but allowed P1 device rows are still executed and attributed as a human session. [operations.yaml:1463](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/operations.yaml:1463), [server.ts:582](/home/sprime01/projects/Horizon-gaps/src/remote/server.ts:582), [app.ts:1495](/home/sprime01/projects/Horizon-gaps/src/app.ts:1495) |
| R4-03 | **Closed** | `horizon.settlement.observe` is now P2, with the external evidence submission stated explicitly. [operations.yaml:503](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/operations.yaml:503) |
| R4-04 | **Closed** | Pairing now uses `LOCAL_ENROLLMENT_PRESENCE`, explicitly a non-A3 presence claim, and the missing receipt is named accordingly. [operations.yaml:625](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/operations.yaml:625), [a3-mechanism.yaml:155](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/a3-mechanism.yaml:155) |
| R4-05 | **Closed** | State is represented by `PendingTransition`; the descriptor has no state, terminal states do not reopen, and restart expiry is an explicit transition. [records.json:674](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/records.json:674), [records.json:820](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/records.json:820), [records.json:1069](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/records.json:1069) |
| R4-06 | **Closed** | An explicit but unknown discriminator now returns `params:unknown_variant`, rather than best-fit matching. [params.yaml:448](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/params.yaml:448), [params.ts:304](/home/sprime01/projects/Horizon-gaps/src/contracts/identity/params.ts:304) |
| R4-07 | **Closed** | The lesson schema has no `proposed_by`; unknown fields are refused and the proposer comes from `caller.actor.id`. [params.yaml:791](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/params.yaml:791), [app.ts:1845](/home/sprime01/projects/Horizon-gaps/src/app.ts:1845) |
| R4-08 | **Closed** | The named negative fixtures now exist, including replay, supersession, caller-channel, old-outcome, and transition-chain cases. [record-cases.json:6516](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/fixtures/record-cases.json:6516), [record-cases.json:6834](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/fixtures/record-cases.json:6834), [record-cases.json:7223](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/fixtures/record-cases.json:7223) |
| R4-09 | **Closed** | `/m` and `/m/` are both named, `/health` and `/diagnostics` are GET-only in source and contract, and the 70-route census is exact in both directions. [operations.yaml:1633](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/operations.yaml:1633), [app.ts:3144](/home/sprime01/projects/Horizon-gaps/src/app.ts:3144) |

## 4. Numbered findings

### 1. Blocking — reachable desktop P3 effects bypass pending/A3/authority

The live-enforcement table admits that five reachable P3 rows lack the required path: `case.task.decide`, `horizon.settlement.rule`, both approval decisions, and `workspace.export`. The live handlers nevertheless perform the effects: approvals resolve at [app.ts:1953](/home/sprime01/projects/Horizon-gaps/src/app.ts:1953), case decisions reach the keeper at [app.ts:1988](/home/sprime01/projects/Horizon-gaps/src/app.ts:1988), settlement invokes the ruling path at [app.ts:2040](/home/sprime01/projects/Horizon-gaps/src/app.ts:2040), and export writes immediately at [app.ts:3411](/home/sprime01/projects/Horizon-gaps/src/app.ts:3411).

The frozen rows themselves list missing A3, pending records, authority, and separation-of-duty checks. [operations.yaml:1372](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/operations.yaml:1372), [operations.yaml:1479](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/operations.yaml:1479), [operations.yaml:1544](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/operations.yaml:1544)

Smallest correction: place a class gate before every desktop P3 branch and refuse it until the pending descriptor, protected A3 confirmation, authority decision, and applicable separation check are present. This is the same containment already used for the phone.

### 2. Blocking — `run.start` is not refused while target resolution is absent

The frozen catalog says `run.start` is an authority-free PX dispatcher, names target resolution and resolved authority/evidence as missing, and says the route is refused until they exist. [operations.yaml:809](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/operations.yaml:809), [operations.yaml:1555](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/operations.yaml:1555)

The handler does not refuse. It compares the previewed step set and calls `startCase` at [app.ts:2792](/home/sprime01/projects/Horizon-gaps/src/app.ts:2792), which sends an unclassified `case_advance` with no resolved operation IDs, classes, or authority at [sea-forge-case.ts:320](/home/sprime01/projects/Horizon-gaps/src/adapters/sea-forge-case.ts:320).

Smallest correction: refuse `/desk/start` until the pinned plan’s target operations are resolved and the highest effective class is enforced. Alternatively, catalogue and govern the actual monolithic `case_advance` effect.

### 3. Blocking — a device credential is converted into a human actor for allowed effects

The design says a device credential proves a device, never a person, and that phone commands do not inherit a human caller path. [design_draft.md:392](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/design_draft.md:392)

Live code resolves the device session to the durable operator’s user actor at [server.ts:228](/home/sprime01/projects/Horizon-gaps/src/remote/server.ts:228). `device.surface.intent.commit` then invokes the human commit path with literal `"human"` at [app.ts:1495](/home/sprime01/projects/Horizon-gaps/src/app.ts:1495), and `device.case.open` stores that user as the operator at [app.ts:3084](/home/sprime01/projects/Horizon-gaps/src/app.ts:3084).

Smallest correction: retain the device principal as executor and record any operator association separately as attribution/delegation. Do not pass a device-authenticated request through the human-session path.

### 4. Blocking — a registered agent key is claimed to authenticate a logical execution

The design and issuer profile distinguish a stable agent principal/instance from each logical execution and process attempt. [design_draft.md:96](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/design_draft.md:96), [issuer-profile.yaml:187](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/issuer-profile.yaml:187)

The catalog nevertheless maps `agent_execution` to `registered_agent_key` at [manifest.ts:83](/home/sprime01/projects/Horizon-gaps/src/contracts/identity/manifest.ts:83). The live agent door authenticates only that stable key at [app.ts:2446](/home/sprime01/projects/Horizon-gaps/src/app.ts:2446); it receives no issuer-bound execution or attempt proof.

Smallest correction: either authenticate and propagate Cognate-issued execution/attempt evidence, or rename the current executor to `registered_agent` and keep execution-dependent/governed rows unavailable until execution proof exists.

### 5. Blocking — record caller kinds neither cover nor verify catalog executors

`OperationDescriptor` and `PendingOperation` allow only `human_session`, `agent_execution`, and `local_console`. [records.json:123](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/records.json:123), [records.json:686](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/records.json:686)

The catalog also has `code_holder`, `device_credential`, anonymous, unauthenticated, and union executors. `device.pair`, for example, says a pending record is missing but its `code_holder` cannot be encoded. More seriously, live record validation checks class, schema, alias, and authority writer but carries no catalog executor fact and never proves `caller_kind` is permitted for the operation. [records.ts:79](/home/sprime01/projects/Horizon-gaps/src/contracts/identity/records.ts:79), [records.ts:493](/home/sprime01/projects/Horizon-gaps/src/contracts/identity/records.ts:493)

The caller-channel prose also says a valid `local_console` names none of the three channel references, then says a record naming none is refused. [records.json:1050](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/records.json:1050)

Smallest correction: add the operation’s exact permitted caller-kind set to catalog facts and validate it. Add representable kinds or ceremony-specific records for code holders and devices, clarify that `local_console` is identified by `caller_kind`/`requester_ref`, and add valid plus cross-kind mismatch fixtures.

### 6. Blocking — the remaining “published” authority interface is not an exact consumable artifact

The interface is described as a composite of the authority-decision envelope, ledger entry, checkpoint, and Merkle proof. [external-interfaces.json:39](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/external-interfaces.json:39)

Problems remain:

- Facts such as `policy_basis`, constraints, compensating controls, and approval fields are conditional in the pinned owner source, but are listed as unqualified `required_facts`. [cep.rs:1976](/home/sprime01/projects/sea-rs/crates/sea-forge-authority/src/cep.rs:1976)
- The interface claims Merkle inclusion verification but omits `MerkleProof.leaf_index`, `proof_hashes`, and the entry’s `mmr_leaf_index`. [external-interfaces.json:215](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/external-interfaces.json:215), [types.rs:233](/home/sprime01/projects/sea-rs/crates/sea-forge-ledger/src/types.rs:233), [types.rs:262](/home/sprime01/projects/sea-rs/crates/sea-forge-ledger/src/types.rs:262)
- Every decision fact has `binds: null`; the contract does not define how owner `operation_id`/`action_request_hash` equals Horizon’s `operation_digest`, or whether `decision_ref` maps to `decision_id`, envelope ID, or ledger entry.
- The local record contract still defines signed `DelegationGrant` and `AuthorityDecision` payloads even though the external contract says Horizon defines no external payload and the owner publishes no serializable grant. [records.json:203](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/records.json:203), [records.json:284](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/records.json:284)

Smallest correction: split the composite into exact source components, mark conditional fields explicitly, include all inclusion-proof fields, and define every Horizon-to-owner binding. Rename local record projections so they cannot be mistaken for owner artifacts. Keep the grant path unavailable until an owner-published serializable artifact exists.

### 7. Must-fix — inherited assurance requirements contradict actual caller authentication

P0 inherits A0 and P1 inherits A0-or-A1. [operations.yaml:62](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/operations.yaml:62), [operations.yaml:74](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/operations.yaml:74)

Those predicates require an authenticated session, workload, or execution. [a3-mechanism.yaml:135](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/a3-mechanism.yaml:135)

Yet public health is anonymous, the sign-in challenge is unauthenticated, and pairing routes authenticate only possession of a one-time code. These rows inherit assurance evidence they cannot produce. [operations.yaml:130](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/operations.yaml:130), [operations.yaml:355](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/operations.yaml:355), [operations.yaml:440](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/operations.yaml:440)

Smallest correction: explicitly mark human confirmation as not applicable/none for non-human and public rows while retaining their actual `caller_authentication`; do not let class inheritance assert evidence the route lacks.

### 8. Must-fix — “before any record is appended” and `performs:false` are false

The contract and design say governed phone containment and unknown-operation refusal occur before any record append. The live implementation deliberately appends refusal audits:

- Remote governed refusal calls `audit` before replying. [server.ts:587](/home/sprime01/projects/Horizon-gaps/src/remote/server.ts:587)
- That audit commits a durable record. [remote-records.ts:54](/home/sprime01/projects/Horizon-gaps/src/capabilities/remote-records.ts:54)
- Intent classification refusal calls `audit`. [app.ts:873](/home/sprime01/projects/Horizon-gaps/src/app.ts:873)
- Intent audit appends both an event and a record. [navigation-intent.ts:313](/home/sprime01/projects/Horizon-gaps/src/capabilities/navigation-intent.ts:313)

Auditing refusals is reasonable; claiming that nothing is written is not.

Smallest correction: distinguish “no target capability/effect record” from the permitted refusal-audit append. Replace `performs:false` with an exact target-effect field or catalogue the audit append explicitly.

### 9. Must-fix — P3 separation-of-duty semantics are internally inconsistent

The P3 class rule says the authority decision, fence, and separation-of-duty rule carry responsibility and that the pending record names requester, executor, and approver separately. [operations.yaml:100](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/operations.yaml:100)

Only approval, case-decision, and export rows explicitly set `separation_of_duty: true`; settlement, device settlement, `external.commit`, and `isolation.request` do not. [operations.yaml:738](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/operations.yaml:738), [operations.yaml:749](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-5/contracts/identity/v1/operations.yaml:749)

Smallest correction: make separation a closed per-row requirement and remove the universal class claim, or declare it uniformly on every P3 row and make the records/fixtures enforce it.

## 5. Final verdict

**REJECT.** Round 5 genuinely closes seven of the nine prior findings and materially improves the route census, pending-state model, schema validation, and fixtures. It is not yet semantically safe to freeze: desktop P3 effects remain reachable without their declared governance path; `run.start` executes despite being an unresolved PX dispatcher; device and agent authentication are represented as stronger identities than the handlers prove; the record model cannot bind all catalog executors; and the published authority interface is still not exact enough to implement or verify. The two remaining contract-language inconsistencies—assurance inheritance and refusal audit writes—would also mislead an implementer even if the blocking paths were contained.

## 6. Limits

- I read only the named frozen evidence tree, live repository source, and the relevant pinned SEA-Forge source. I did not read the prohibited status, debt, report, external preregistration, or other evidence contents.
- I wrote no files and made no repository changes.
- I did not run repository tests, checks, typechecks, builds, or check scripts.
- I did not execute live routes, Cognate, RealityTrace, SEA-Forge services, WebAuthn ceremonies, or cryptographic verification.
- The SEA-Forge observations came from the local checkout at exact HEAD `b072ec50b1e50df75c45ddf1709caa6877d5c2f1`; I did not independently verify remote publication or release packaging.
- The route census used source predicates in both routers, including the agent sub-router and combined-route branches. A dynamically registered route outside those sources would require another inventory mechanism.
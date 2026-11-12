# Independent Stage 0A manifest review — round 4

**Verdict: REJECT.** The review is retained verbatim below; nothing in it is edited.

| Field | Value |
|---|---|
| Reviewer | A fresh Codex `gpt-5.6-sol` session, reasoning effort `xhigh`, launched as the Critic role (`--sandbox read-only`, `--ephemeral`). It did not build the contract set and had no access to the builder's notes, status, debt, plans or reports. |
| Run | `codex exec --sandbox read-only --ephemeral -m gpt-5.6-sol -c model_reasoning_effort="xhigh" --json` |
| Thread | `01a1c8fb-a3cd-7a70-8af0-b27561218771` |
| Reviewed bytes | `.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/` — 15 hash-pinned artifacts plus `MANIFEST.sha256` (mode 0444). The reviewer verified every hash itself (`sha256sum -c`, exit 0, all OK). |
| Reviewer prompt | SHA-256 `9bb2884c4767283730634a9cf9da0b4504395e7d90cb9e9411b891c99f4a6235` (`.agents/evidence/2026-11-09-stage-0a-defects/review-prompt-round-4.md`) |
| Event transcript | SHA-256 `da63c091806947216e5de7004e8fcb97ddcb2dc51be612a290c4ed6e65db29cf` — 1 turn, 121 completed items, `turn.completed`, no provider-failure marker (`usage_limit_exceeded`, `rate_limit_exceeded`, `server_overloaded`, `turn.failed`: 0 occurrences). Retained at `review-transcript-round-4.jsonl`. |
| Side effects | None. The read-only sandbox changed no file: `git status --porcelain` before and after the run is byte-identical (SHA-256 `63848e9b0f5fa218717b11296a51627cd28006b9ae793a61176743c04ef73e07`). |
| Census derived by the reviewer | 86 rows — P0 20, P1 33, P2 24, P3 7, Px 2 — with 54 verified, 23 candidate and 9 reserved bindings, 39 distinct operation routes, 5 dispatch routes and 11 qualified combinations, derived by the reviewer's own parser, not by a repository script. |

The reviewer's own final word was **REJECT**: five blocking findings and four must-fix findings.
Eight of the ten round-3 findings are closed at the rule level; R3-01 and R3-09 are partially closed.
The builder's account of the remediation that follows is in `README.md` and, once written, in
`review-round-4-disposition.md`.

---

# Round-4 independent review

**Final verdict: REJECT.** The manifest is valid, and most Round-3 corrections are materially present. However, five blocking defects remain: the published SEA-Forge authority interfaces do not match the pinned source, phone device credentials reach human-session and P3 paths, settlement observation is misclassified as P1, the device-enrollment evidence requirements contradict themselves, and the pending-record transition model is not coherent.

## 1. Manifest verification

Command:

```bash
cd /home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4
sha256sum -c MANIFEST.sha256
```

Exit status: **0**

Complete output:

```text
.agents/prereg/horizon/STAGE-0A-DEFECTS.prereg.yaml: OK
.agents/prereg/horizon/STAGE-0A-REMEDIATION-2.prereg.yaml: OK
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

Computed with read-only inline scripts that parsed the frozen YAML/JSON and extracted literal live route branches. I did not invoke repository check scripts.

| Item | Count |
|---|---:|
| Operations | 86 |
| P0 / P1 / P2 / P3 / Px | 20 / 33 / 24 / 7 / 2 |
| Verified / candidate / reserved bindings | 54 / 23 / 9 |
| Operation-route bindings | 64 |
| Distinct operation routes | 39 |
| Code-operation bindings | 16 |
| Live-enforcement rows | 54 |
| Enforced today / not enforced | 34 / 20 |
| Parameter schemas | 66 |
| Explicit schema references | 68 |
| Effective schema references | 86 |
| Distinct effective schemas | 66 |
| Unreferenced schemas | 0 |
| Parameter aliases / operation-specific entries | 12 / 32 |
| Variant schemas | 3 |
| Record kinds | 10: 9 signed, 1 unsigned |
| Record constraints | 26 |
| Fixture cases | 107: 26 valid, 81 invalid |
| A3 assurance requirements | 10 |
| External interfaces | 3 |

Dispatcher census:

| Item | Count |
|---|---:|
| Dispatch routes | 5 |
| Direct action mappings | 21 |
| Qualified combinations | 11 |
| Distinct target operations | 25 |
| Route aliases | 1 |
| Declared non-operation routes | 7 |
| Catalog gaps | 0 |
| Recorded binding defects | 2 |

The five dispatch routes are `POST /agent/panels`, `POST /desk/panels/op`, `POST /desk/decide`, `POST /m/api/command`, and `POST /desk/search`.

Static live-route comparison:

| Source | Served conditions | Exact catalog coverage | Method wider than catalog | Unmapped |
|---|---:|---:|---:|---:|
| Main application | 58 | 33 | 2 | 23 |
| Phone server | 12 | 11 | 0 | 1 |
| Combined | 70 | 44 | 2 | 24 |

All **39 distinct operation routes** were observed in live source. The phone’s only uncovered route is `GET /m/`; `GET /m` is declared non-operational, but its slash alias is not. The two method-wider handlers are `/health` and `/diagnostics`: their source branches do not check the method, while the catalog declares only `GET`.

The 23 main-application branches absent from operation, alias, and non-operation coverage are:

```text
ANY /, ANY /frame, ANY /surface, ANY /surface/schema,
GET /desk, GET /desk/conversation, GET /desk/decide.json,
GET /desk/draft, GET /desk/first-move.json, GET /desk/lessons.json,
GET /desk/next.json, GET /desk/remote.json, GET /desk/session,
GET /desk/setup-guide, GET /desk/state.json, GET /desk/work.json,
GET /workspace, GET /workspace.json, GET /workspace/approvals,
GET /workspace/compare, GET /workspace/inspect, GET /workspace/remote,
GET /workspace/remote/events
```

Many are projections or pages, and the design promises exact coverage primarily for write routes. I therefore do not treat all 23 as security defects by themselves. The explicit all-phone-routes claim and method-widened handlers are addressed below.

## 3. Round-3 closure table

| Finding | Status | Evidence |
|---|---|---|
| R3-01 | **Partially closed** | Pairing routes and command dispatch are catalogued, and approve/reject are refused at [server.ts:553](/home/sprime01/projects/Horizon-gaps/src/remote/server.ts:553). But phone `settle` still reaches `horizon.settlement.rule` and calls the live settlement path at [server.ts:607](/home/sprime01/projects/Horizon-gaps/src/remote/server.ts:607) and [app.ts:3069](/home/sprime01/projects/Horizon-gaps/src/app.ts:3069) without pending/A3 confirmation. `GET /m/` is also absent from the frozen route census. |
| R3-02 | **Closed** | The frozen dispatcher binds server-resolved card kinds at [operations.yaml:687](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/contracts/identity/v1/operations.yaml:687); the live handler resolves it before effect at [app.ts:1908](/home/sprime01/projects/Horizon-gaps/src/app.ts:1908). Lesson `choice` admits `accept` and `reject` at [params.yaml:173](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/contracts/identity/v1/params.yaml:173). |
| R3-03 | **Closed** | Deployment bindings are declared minimum P2 and refused on the plain path; live classification returns `allowed: false` at [manifest.ts:723](/home/sprime01/projects/Horizon-gaps/src/contracts/identity/manifest.ts:723), and the request boundary refuses before constructing an intent at [app.ts:946](/home/sprime01/projects/Horizon-gaps/src/app.ts:946). |
| R3-04 | **Closed** | `caller_channel_exclusive` explicitly binds `PendingOperation` and distinguishes all three caller kinds at [records.json:987](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/contracts/identity/v1/records.json:987). Frozen fixture coverage remains incomplete; see R4-08. |
| R3-05 | **Closed** | The delegation register identifies `params.grant_revoke.grant_ref` as a target for every caller kind at [records.json:1015](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/contracts/identity/v1/records.json:1015). |
| R3-06 | **Closed** | Arrays, optionality, and nullability are now encoded recursively at [params.yaml:501](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/contracts/identity/v1/params.yaml:501), and the generated design representations preserve them at [design_draft.md:764](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/design_draft.md:764). |
| R3-07 | **Closed** | `EvidenceRecord` now has distinct `observation_outcome` and `effect_outcome` fields and enums at [records.json:562](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/contracts/identity/v1/records.json:562). |
| R3-08 | **Closed** | The human-entitlement interface is explicitly unpublished, identifies per-record subject bindings, requires issuer key and signature, and fails closed at [external-interfaces.json:157](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/contracts/identity/v1/external-interfaces.json:157). This does not close the separate published-decision/grant problem in R4-01. |
| R3-09 | **Partially closed** | Nonce and supersession now apply to `PendingOperation`, and expired confirmation is addressed at [records.json:921](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/contracts/identity/v1/records.json:921). However, the frozen fixtures contain no pending nonce-replay or supersession case, and the `confirmed → expired` semantics contradict immutability; see R4-05 and R4-08. |
| R3-10 | **Closed** | `GET /health` and `GET /diagnostics` are distinct rows at [operations.yaml:130](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/contracts/identity/v1/operations.yaml:130), and the live bodies are split at [app.ts:3132](/home/sprime01/projects/Horizon-gaps/src/app.ts:3132). The method-level route mismatch is a separate defect. |

## 4. Numbered findings

1. **Blocking — the two “published” SEA-Forge authority interfaces are not the artifacts the frozen contract describes.**

   The contract points to the pinned `AuthorityDecision` and `ActionGrant` symbols and requires independently verifiable fields including issuer key and signature at [external-interfaces.json:24](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/contracts/identity/v1/external-interfaces.json:24).

   The sibling checkout is exactly the pinned commit `b072ec50b1e50df75c45ddf1709caa6877d5c2f1`. Its `AuthorityDecision` has no `resource_scope`, `amount`, `issuer_key_id`, or `signature` field at [types.rs:484](/home/sprime01/projects/sea-rs/crates/sea-forge-core/src/types.rs:484). `ActionGrant` is explicitly move-only and “intentionally not serializable,” has private fields, and has no issuer key, signature, or amount at [lib.rs:80](/home/sprime01/projects/sea-rs/crates/sea-forge-authority/src/lib.rs:80).

   Consequently, the contract names neither an independently authenticatable decision envelope nor a transportable grant artifact. An adapter cannot verify fields or signatures the pinned artifact does not carry.

   **Smallest correction:** replace these entries with the actual durable SEA-Forge ledger envelope/receipt interface that carries the committed decision, trust anchor, key identifier, integrity proof, action hash, scope, amount/budget, epoch, and expiry. Pin that artifact’s path and symbol. Until SEA-Forge publishes such an interface, mark these paths unpublished and fail closed, as already done for human entitlements.

2. **Blocking — the phone authenticates a device but several rows and enforcement claims treat it as a human session; the phone can reach the P3 settlement ruling.**

   The contract correctly says a device credential proves the enrolled device, “never which person is holding it,” at [operations.yaml:826](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/contracts/identity/v1/operations.yaml:826). Nevertheless, all six rows selected by `POST /m/api/command` inherit `human_session`, and their live-enforcement entries describe only the paired desk:

   - `horizon.surface.intent.commit`
   - `horizon.case.open`
   - `horizon.settlement.observe`
   - `approval.approve`
   - `approval.reject`
   - `horizon.settlement.rule`

   See the P1/P3 defaults at [operations.yaml:71](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/contracts/identity/v1/operations.yaml:71), the phone-bound rows at [operations.yaml:215](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/contracts/identity/v1/operations.yaml:215), and the misleading enforcement descriptions at [operations.yaml:925](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/contracts/identity/v1/operations.yaml:925).

   Approve/reject are contained, but settlement is not: `phase: rule` dispatches to the P3 row and invokes `settleNavigationIntent` at [server.ts:607](/home/sprime01/projects/Horizon-gaps/src/remote/server.ts:607). That reaches SEA-Forge’s final settlement call at [app.ts:864](/home/sprime01/projects/Horizon-gaps/src/app.ts:864) without a pending record or protected A3 confirmation.

   **Smallest correction:** give phone effects separate device-credential operation rows, with explicit scope and attribution, or refuse them. In particular, refuse every P2/P3 phone command until a protected operation-bound confirmation path exists. Live enforcement must be recorded per route/caller path, rather than one human-session entry for a multi-credential row.

3. **Blocking — `horizon.settlement.observe` is classified P1 despite performing an external governed write.**

   The row is placed under P1 while admitting that it writes a settlement record and sends evidence to another system at [operations.yaml:382](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/contracts/identity/v1/operations.yaml:382). This contradicts P1’s own-scope/reversible definition at [operations.yaml:71](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/contracts/identity/v1/operations.yaml:71).

   The handler observes through RealityTrace, creates an evidence packet, submits it to SEA-Forge, and appends settlement state at [app.ts:789](/home/sprime01/projects/Horizon-gaps/src/app.ts:789) and [app.ts:850](/home/sprime01/projects/Horizon-gaps/src/app.ts:850). The live-enforcement table paradoxically requires A3 and a pending record for this P1 operation at [operations.yaml:1147](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/contracts/identity/v1/operations.yaml:1147).

   **Smallest correction:** split local evidence preparation from external evidence submission, or reclassify observation as at least P2. The external submission half must take the governed path and cannot be callable by a plain device session.

4. **Blocking — `device.pair` simultaneously requires and forbids A3-UV.**

   The operation row correctly names `LOCAL_ENROLLMENT_PRESENCE` at [operations.yaml:504](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/contracts/identity/v1/operations.yaml:504). The A3 vocabulary defines it as a presence claim, not an assurance predicate, at [a3-mechanism.yaml:155](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/contracts/identity/v1/a3-mechanism.yaml:155). The design says enrollment records local presence and “never A3” at [design_draft.md:389](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/design_draft.md:389).

   Yet the authoritative live-enforcement entry lists `evidence_A3_UV`, `durable_principal_binding`, and generic `pending_record` as missing at [operations.yaml:1183](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/contracts/identity/v1/operations.yaml:1183), and the generated design repeats that contradiction at [design_draft.md:454](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/design_draft.md:454).

   **Smallest correction:** make the enforcement row use the enrollment-specific ceremony and receipt only. If a pending record is required, define an enrollment-specific record whose satisfaction predicate is `LOCAL_ENROLLMENT_PRESENCE`; do not reuse the A3-UV human-confirmation requirements.

5. **Blocking — the immutable pending record has no coherent representation for restart expiry.**

   `PendingOperation` is described as immutable at [records.json:672](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/contracts/identity/v1/records.json:672). A confirmed record must carry confirmer, presence evidence, and receipt at [records.json:937](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/contracts/identity/v1/records.json:937), while an expired record must carry none and must not be cleared because it is immutable at [records.json:993](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/contracts/identity/v1/records.json:993).

   The design nevertheless says every prior-launch `confirmed` record “becomes `expired`” on restart at [design_draft.md:499](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/design_draft.md:499). No transition record, signature rule, or supersession relation explains how that happens without mutating or erasing signed confirmation evidence.

   **Smallest correction:** define an append-only transition/event record and a complete transition table, leaving the immutable descriptor and confirmation receipt intact. Alternatively, let expired confirmed records retain historical confirmation while explicitly making it non-redeemable. Add restart, transition, replay, and supersession fixtures.

6. **Must-fix — an unknown caller discriminator falls back to another caller’s schema variant.**

   `params.run_start` declares only `agent_execution` and `human_session` variants at [params.yaml:425](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/contracts/identity/v1/params.yaml:425). The frozen `OD-CONSOLE-RUN-START-GRANT` fixture uses `caller_kind: local_console` but expects only `delegation_reference_kind`, not `parameters_match_schema`, at [record-cases.json:6153](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/contracts/identity/v1/fixtures/record-cases.json:6153).

   Live validation fails to resolve that discriminator, then tests all variants and accepts the closest one at [params.ts:286](/home/sprime01/projects/Horizon-gaps/src/contracts/identity/params.ts:286) and [params.ts:324](/home/sprime01/projects/Horizon-gaps/src/contracts/identity/params.ts:324). A caller kind explicitly present but absent from the schema must not inherit another caller’s wire contract.

   **Smallest correction:** when the discriminator field is present and its value has no variant, return an unknown-variant violation immediately. Retain best-fit matching only for schemas genuinely discriminated by an external code operation with no record field. Update the console fixture to expect `parameters_match_schema`.

7. **Must-fix — caller-supplied provenance can impersonate a proposer.**

   `params.horizon_lesson_propose` explicitly accepts `proposed_by` at [params.yaml:654](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/contracts/identity/v1/params.yaml:654). The live handler stores that string as the lesson’s proposer at [app.ts:1837](/home/sprime01/projects/Horizon-gaps/src/app.ts:1837). It is later displayed as “Proposed by …”, so a human request can name an agent, reviewer, or another person as the actor.

   The phone’s reserved-field list is also narrower than the application list: it rejects `actor` and `role` but silently accepts names such as `caller_ref`, `principal`, `executor`, or `authority` as unknown fields at [server.ts:32](/home/sprime01/projects/Horizon-gaps/src/remote/server.ts:32).

   **Smallest correction:** derive proposer identity from the authenticated caller or source record. If free-form provenance is useful, rename it to a clearly non-authoritative note. Apply one central reserved actor/executor/authority field set and strict unknown-field validation across write boundaries.

8. **Must-fix — the frozen fixtures do not exercise several preregistered negative teeth.**

   The preregistration promises caller-channel combinations, an old single evidence outcome, pending nonce replay, and pending supersession checks at [STAGE-0A-REMEDIATION-2.prereg.yaml:131](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/.agents/prereg/horizon/STAGE-0A-REMEDIATION-2.prereg.yaml:131).

   Independent fixture census found:

   ```text
   pending_fixture_count=23
   pending_nonce_replay_cases=0
   pending_supersedes_chain_cases=0
   human_no_session=0
   agent_with_session=0
   console_clean=0
   evidence_fixture_count=6
   evidence_old_single_outcome_cases=0
   ```

   The constraint prose is improved, but the frozen proof set cannot demonstrate those claims.

   **Smallest correction:** add exact frozen cases for reused pending nonce, correct and incorrect pending supersession, human-without-session, agent-with-session, each forbidden console channel, and the old single `outcome` field. Evaluate each with exact expected violations.

9. **Must-fix — the route census is not exact.**

   The phone serves both `/m` and `/m/` at [server.ts:333](/home/sprime01/projects/Horizon-gaps/src/remote/server.ts:333), but the non-operation list includes only `/m` at [operations.yaml:1291](/home/sprime01/projects/Horizon-gaps/.agents/evidence/2026-11-09-stage-0a-defects/frozen-round-4/contracts/identity/v1/operations.yaml:1291). That makes PE-24’s “every route the phone’s server performs” assertion false.

   The main `/health` and `/diagnostics` branches do not constrain the method at [app.ts:3132](/home/sprime01/projects/Horizon-gaps/src/app.ts:3132), while the catalog binds only `GET`. Several other read-like branches have the same problem.

   **Smallest correction:** add `/m/` as an explicit non-operation alias or redirect it to `/m`; constrain read handlers to `GET`/`HEAD`; then either catalogue the remaining projection/page routes or explicitly define why they are outside the operation census.

## 5. Final verdict

**REJECT.** The Round-4 bytes are substantially better than Round 3, and eight of the ten earlier contract defects are closed at the rule level. They are not yet safe to freeze and build against. The contract currently relies on external authority artifacts that the pinned owner source does not publish in the claimed form, misidentifies device-authenticated phone effects as human-session effects, allows a phone device to trigger the P3 settlement ruling, places an external evidence submission in P1, gives `device.pair` mutually incompatible evidence requirements, and leaves signed pending-state transitions undefined. Those defects affect authority, identity, downgrade resistance, and replay behavior—the central purpose of this contract.

## 6. Limits

- I read the entire frozen contract set and all five frozen preregistrations.
- I inspected only targeted live source necessary for handlers, dispatch, authentication, validation, and route comparison.
- I verified the two published SEA-Forge interfaces against the exact pinned sibling commit; the sibling HEAD equals the frozen pin.
- I did not read `.agents/CURRENT_STATUS.jsonl`, `.agents/CURRENT_STATUS.md`, `.agents/DEBT.md`, `.agents/reports`, any preregistration outside the frozen tree, or evidence outside the frozen tree.
- I did not run repository checks, tests, `just` targets, servers, WebAuthn ceremonies, SEA-Forge, RealityTrace, or network requests.
- I did not cryptographically validate signatures or exercise actual HTTP requests.
- The live-route census is static and covers literal route branches; it excludes dynamic framework behavior and 404 prefix fallthrough.
- I wrote no files and made no repository changes.
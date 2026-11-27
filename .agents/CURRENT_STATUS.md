# Current status

**Status revision:** 40

**Stage:** Owner-approved GodSpeed vocabulary consolidation

**Summary:** Reconciled the owning glossary against the review patch and authoritative sources. The owner approved the conceptual distinctions. Runtime, frozen specifications, and identifiers retain their existing contracts.

- Cross-checked glossary targets, source links and the eleven semantic scenarios.

**Open items (revision 40):**

- Round-7 critic: Codex usage limit (resets Nov 12 00:53); Haiku subagent critic substituted.
- Stage 0B receipt signing and presence checks not implemented.
- `horizon confirm` cannot write while a desk holds the store lock.
- PE-53 and PE-59 have no mutant tooth.
- PR, merge, branch and worktree cleanup.

## Active work carried forward

Stage 0A remediation-4 wave and Stage 0B containment in progress (plan task T23). Checkpoint commit 61e694c holds round-6 corrections and Stage 0B.

Round-6 critic (REJECT, four blocking) corrected: authority decision specified_not_published with governed mode refused at startup; facts unbound; submitIntent appends no attempt on classification refusal; design descriptor state moved to transitions. Stage 0B: label gated at route, confirm command, prereg PE-53..PE-59 / NE-41..NE-46, 11 new teeth. Full suite 1590 pass, tsc clean, 44 mutants caught.

**Revision:** 38 · **Recorded:** 2026-11-11 · **Stage:** Stage 0A remediation-4 wave in progress (plan task T23). Checkpoint commit `f88cb20` holds all prior work. Remaining work is the checklist below; nothing in it is claimed complete until its evidence is recorded.

## Remaining-work checklist (remediation-4 wave, then Stage 0B containment)

> **Superseded.** This revision 38 checklist is retained for history only. The open items above (revision 40) are current. Boxes below that read NOT STARTED or unchecked are not a live to-do list: Stage 0B routing and the round-6 corrections were committed in `61e694c`, and what remains of Stage 0B is the list above.

Scope: finish Stage 0A to a blind-critic ACCEPT, then Stage 0B interim containment, then PR and merge.

- [ ] R5-01 desk P3 rows refused on every path — gates wired in `src/app.ts`; prove with tests in `test/identity-remediation-4.test.ts` and record in the evidence table
- [ ] R5-02 `run.start` refused before `startCase` — gate wired; prove likewise
- [ ] R5-03 device credential is a service principal; phone commit refused (`no_device_delegation`) — code and tests green; prove in remediation-4 tests
- [ ] R5-04 `agent_execution` → `registered_agent` executor mapping — catalog done; prove by fixture
- [ ] R5-05 caller-kind enum and `caller_kind_permitted` constraint — triple (TS/Python/fixtures) done; re-verify
- [ ] R5-06 split `external-interfaces.json` into exact source components, conditional facts marked, Merkle fields added, every fact bound, local grant/decision kinds renamed; update `scripts/check-external-interface-facts.ts` and design §9.1 — NOT STARTED
- [ ] R5-07 `human_evidence: null` on the six anonymous/code-holder rows — catalog done; prove
- [ ] R5-08 refusal audits stated in design prose ("before any target effect plus audited refusal") — prose NOT DONE
- [ ] R5-09 separation of duty per row, not by class rule — done; prove
- [ ] Design prose for R5-01/02/03/05/07/08/09 in `design_draft.md` — NOT DONE (generated tables already regenerated)
- [ ] `.agents/prereg/horizon/STAGE-0A-REMEDIATION-4.prereg.yaml` with PE-44…, NE-38… — NOT STARTED
- [ ] `scripts/check-stage0a-remediation-4-prereg-coverage.ts` — NOT STARTED
- [ ] `test/identity-remediation-4.test.ts` — NOT STARTED
- [ ] Teeth M29+ in `scripts/teeth-t23-mutation.ts`; wire `check-t23` and copy the prereg in `scripts/freeze-stage0a-contract-set.sh` — NOT STARTED
- [ ] Re-freeze as `frozen-round-6` with MANIFEST; write `review-prompt-round-6.md` — NOT STARTED
- [ ] Blind critic round 6 (`codex exec` read-only, ephemeral, no builder reasoning); retain verdict, transcript, no-mutation proof — NOT STARTED
- [ ] Repeat rounds until no blocking findings; disposition each finding — NOT STARTED
- [ ] Stage 0B: `src/capabilities/pending-confirmations.ts`, `horizon confirm --pending <id>`, reserved-operation routing, `test/pending-confirmations.test.ts`, `test/containment.test.ts`, `test/desk-write-token.test.ts` — NOT STARTED
- [ ] Evidence table mapping every requirement to CI/script/critic evidence with reproduce commands — NOT STARTED
- [ ] Final report in `.agents/reports/`; PR to `main`; merge; delete branch and worktree — NOT STARTED

**Previous revision 37 follows.** Stage: unchanged plan settlement state — spec HORIZON-001 **1.2.0** frozen; next dependency-ready plan task **T11**. Stage 0A's contract set has been through five independent manifest reviews and all five returned **REJECT**; the round-5 remediation wave is the open work inside plan task **T23**; no task is settled and no requirement is claimed.

**Spec:** HORIZON-001 v1.2.0, frozen 2026-11-02 (REQ-SEC-006: operator identity is a configured durable actor bound to a WebAuthn credential and mapped to a SEA-Forge actor; the OS account is diagnostic only); SHA-256 `7b06f6b813462e08432b6e020e9266bdec625b2fee7140d4f2f52a774f9fa435`.

## Identity and authority — Stage 0A: five independent reviews, five rejections (no task settled)

The Stage 0A contract set is frozen, hash-pinned and reviewed by a fresh independent critic each
round. **All five rounds returned REJECT.** The set is not safe to build against yet, so Stage 0A
is not complete and Stage 0B containment has not begun.

| Round | Frozen copy | Verdict | Findings |
|---|---|---|---|
| 1 | `frozen/` | **REJECT** | 5 blocking, 6 must-fix, 2 advisory |
| 2 | `frozen-round-2/` | **REJECT** | 5 blocking, 7 must-fix, 4 advisory |
| 3 | `frozen-round-3/` | **REJECT** | 6 blocking, 4 must-fix |
| 4 | `frozen-round-4/` | **REJECT** | 5 blocking, 4 must-fix |
| 5 | `frozen-round-5/` | **REJECT** | 6 blocking, 3 must-fix |

Each frozen copy is mode `0444` with its own `MANIFEST.sha256`, and the reviewer verified the
manifest itself before reading anything (`sha256sum -c`, exit 0, every file OK). The reviewer was a
fresh `gpt-5.6-sol` critic at `xhigh`, run read-only and ephemeral, with no access to the builder's
evidence, status, debt, plans or reports. The round-5 run changed no file: `git status --porcelain`
before and after is byte-identical (SHA-256 `754d1b116800dbcea38d01048e803c4264cf1ddce224131ddef29f77fb723355`);
its event transcript is retained (SHA-256 `6da454ba…`, 345 lines, 176 completed items).

**What the round-4 remediation actually closed.** Nine findings, nine corrections in the contract
set, the enforcing code, the cross-language fixtures and the design together, each with an
executable check: the external-interface contract names only what SEA-Forge actually publishes
(one committed decision envelope at the pinned commit, with the thirty-four facts that envelope
carries, and two interfaces that are specified rather than pinned because the owner publishes
neither, so both fail closed); the phone's six effects have their own device-credential rows with
their own parameters, and the phone can neither settle nor approve; the observation half of
settlement is P2 because its effect leaves the application; the device enrollment's evidence is
local presence and never A3-UV; a pending operation's state is an append-only chain of signed
transitions, so the descriptor is immutable, carries no state and never carries a confirmation; a
caller kind the schema never described is refused by name rather than fitted to the closest variant;
the actor is derived from the caller and a field the schema does not name is refused at every
boundary; the route census is exact in both directions; and the frozen fixture set exercises every
negative tooth the earlier preregistrations promised.

**What the round-5 review found.** The round-5 reviewer's own closure table calls seven of the
nine round-4 findings **closed** outright — the first wave whose corrections it could close without
qualification — and two **partially closed**. It then returned **REJECT** with six blocking and
three must-fix findings of its own:

| Finding | Severity | What it is |
|---|---|---|
| R5-01 | blocking | Five reachable **desktop** P3 rows — `case.task.decide`, `horizon.settlement.rule`, both approval decisions and `workspace.export` — are admitted by the live-enforcement table to lack the pending/A3/authority path, and the live handlers perform the effects anyway. |
| R5-02 | blocking | `run.start` is an authority-free Px dispatcher whose target resolution is named missing and whose route is said to be refused until it exists, but the handler compares the previewed step set and calls `startCase`, which sends an unclassified `case_advance`. |
| R5-03 | blocking | A device credential is converted into a human actor: the remote server resolves the device session to the durable operator's user actor, and `device.surface.intent.commit` then invokes the human commit path with the literal `"human"`. |
| R5-04 | blocking | The catalog maps the `agent_execution` executor to `registered_agent_key`, but the live agent door authenticates only the stable key and holds no issuer-bound execution or attempt proof. |
| R5-05 | blocking | `OperationDescriptor` and `PendingOperation` allow only three caller kinds, while the catalog also has `code_holder`, `device_credential`, anonymous and unauthenticated executors; and live validation never proves a record's `caller_kind` is permitted for its operation. |
| R5-06 | blocking | The remaining published authority interface is a composite: conditional owner fields are listed as unqualified requirements, the Merkle inclusion-proof fields are omitted, no Horizon reference is bound to an owner field, and local signed `DelegationGrant` and `AuthorityDecision` payloads read like owner artifacts. |
| R5-07 | must-fix | Class inheritance gives P0 and P1 rows assurance predicates (A0, A0-or-A1) that the public health probe, the sign-in challenge and the pairing routes cannot produce. |
| R5-08 | must-fix | "Before any record is appended" and `performs: false` are false: the remote governed refusal and the intent-classification refusal both append a durable refusal audit before answering. |
| R5-09 | must-fix | The P3 class rule asserts separation of duty universally, while only the approval, case-decision and export rows set `separation_of_duty: true`. |

**Verified (round-5 freeze):** `bun test` 1563 pass / 16 skip / 0 fail across 176 files (11 717
expect() calls) · `bun run tsc --noEmit` exit 0 · `just check-t23` exit 0 · `just gate-t23` ok ·
`just verify` exit 0 · `just ledger` ok (12 canonical invariant bindings across 11 requirements) ·
28 mutation teeth caught, each by assertion in its named test · 140 Python fixture checks · the
round-5 design at SHA-256 `5536acfaa046cb2491fc41c378334a41fa328f78f73fef69b1c0e173e0dccfe8`
(956 lines), pinned by `.agents/prereg/horizon/STAGE-0A-REMEDIATION-3.prereg.yaml`.

**Limits.** Stage 0A is not complete, and no requirement is claimed by it — `REQ-SEC-006` stays
open until the Stage 4 vertical slice and its independent confirmation. The contract checks prove
what the bytes mean, not that a runtime enforces them: there is no issuer, no SEA-Forge bridge,
no live bounded grant, no A3-UV challenge, no external effect and no settled evidence chain in
this repository. The delegated grant and the human entitlement are *specified*, not pinned:
SEA-Forge publishes neither, so both paths fail closed by design. The Python checker shares the
fixture file and the rule text with the TypeScript validator, not the implementation, so it can
share a misreading of a rule. Three earlier mutation teeth went stale under the round-4
remediation; they were repaired rather than left passing (M10 now restates a governed row's class,
M18 now claims the unpublished entitlement is published, M19 now remaps the phone's `approve`
command to a row the device may perform), and the class-integrity rule M10 depends on is now
asserted. All work is uncommitted on branch `horizon-desk-gaps`; nothing was committed or
published.

**Next.** Remediate the round-5 review's nine findings in the contract set, the enforcing code, the
cross-language fixtures and the design; re-freeze as `frozen-round-6`; and have a fresh critic read
it. Stage 0B containment — pending confirmations, `horizon confirm --pending`, reserved-operation
routing, and the desk's escalation path under a protected confirmation — starts only after a review
accepts the contract set. The plan's next dependency-ready task remains **T11**.


## Recon deliverable — Palantir Foundry + AI FDE (non-normative, no task settled)

Applied the owner-supplied `replica-recon` skill to the operator-confirmed slice *"the Ontology system that
encodes the data, logic, action and security of the enterprise to automate decisions across business
operations + the agent that builds it."* Output: `.agents/reports/2026-11-01-palantir-foundry-aifde-recon.md`
(54 screens, 12 flows, ~50 entities, UI/UX anatomy, evidence grades) and
`2026-11-01-palantir-foundry-aifde-features.csv` (65 rows). Public sources only: docs, architecture center,
one conference page, two official recordings, one practitioner recording, and 56 public product screenshots.

Three passes: docs and marketing; then official recordings plus the AI FDE screenshots; then the
ontology-half screenshots, which upgraded the type wizard, action authoring and submission criteria from
`[D]` to `[O]`. Pass 3 reversed six further inferences — most importantly that **security is authored with
the type** (step 6 of a six-step creation wizard, a per-property policy table) rather than configured
afterwards, that the wizard **generates Create/Modify/Delete action types and requires a submit authority**
(`Organization | Group | User`), and that submission criteria are a nested `MATCH ALL / MATCH ANY` predicate
tree over typed operands rather than a flat condition. It also produced the recon's only observed negative
state: a disabled action with tooltip `Invalid state to apply action`.

All 56 screenshots are staged in `.tmp/palintar-screens/` (six folders) with `INDEX.md` mapping every file to
its screen ID and public source URL. `.tmp/` is gitignored at `.gitignore:25`, so they cannot be committed
or shipped.

This changes no requirement, plan task, gate or proof level. It is comparative research recorded where
`.agents/AGENTS.md` says investigations live. Grading note for future readers: no Palantir account was used,
so empty/error/denied states remain unobserved; the report marks every claim `[O]`/`[D]`/`[I]`/`[?]` and
carries a corrections table against its own first pass.


## SPEC-CR-002 — spec 1.1.0: payment and IS7 settlement (normative, not yet implemented)

Six independent review rounds (Codex; final verdict ACCEPT; `.agents/candidates/horizon/SPEC-CR-002/REVIEW.md`). Payment is a list of per-currency entries checked against capacity with an atomic reservation at commit, never summed (REQ-NAV-008..010). An intent that needs settlement carries a frozen expected outcome: a pinned, read-only verifier template run by RealityTrace, a discrimination run after authority and before execution, and three-valued settlement by SEA-Forge from evidence completed before the window deadline (REQ-NAV-011..013). Ledger: 105 requirements, frozen `HORIZON-001-1.1.0@2026-10-23`.

Not yet implemented: the interaction-model migration (new world_ref), the capacity ledger, expected outcomes, IS7 settlement and RealityTrace RT-1. They ship together with gate J02 revision 2. Until then J02 reports IS2 and IS7 open.

## Readiness P04 steps 1-3 — SEA-Forge decides navigation commits; escalations wait for the operator; settlement is SEA-Forge's

Step 3: `settleNavigationIntent` records J02 IS6's `execution_record`, `realitytrace_observation` and `settlement_reference`. The governed commit's trace reaches RealityTrace through Cognate's outbox; RealityTrace's own evidence goes to SEA-Forge, which corroborates it against RealityTrace's ledger and answers `unsettled` (execution is not settlement). What cannot be obtained is `unavailable` with the reason. Live: `test/J02-live.test.ts`. Cognate SDK 0.6.3 makes the trace a pure function of the committed event, so the hash check holds at any later time (0.6.2 matched only within the same second).

Step 1: createHorizonRuntime and createApplication accept Cognate GovernanceOptions (default from COGNATE_GOVERNANCE / COGNATE_SEA_FORGE_SOCKET / COGNATE_WORLD_REF; off when unset). Cognate SDK 0.6.3.

Step 2: with governance on, a commit runs as `horizon.navigation.commit`, so SEA-Forge's escalate parks it on a durable approval. `submitIntent` throws `AwaitingAuthorityError` (audited `awaiting_authority`; `POST /intent` answers 202). `resolveNavigationApproval` records the human operator's decision at SEA-Forge (`on_behalf_of` the operator in `COGNATE_SEA_FORGE_OPERATOR`); SEA-Forge revalidates on resume and the run writes the record. A rejection commits nothing.

Exactly once per `intent_id` (per tenant): an index record written atomically with the intent event; the same intent returns the first record; a different intent under that id is `duplicate_intent` (audited, on both paths). The guard was documented before but not implemented. Horizon polls SEA-Forge, so an approval made there directly still resumes the commit; the run audits its own acceptance.

Live proof: `test/J02-live.test.ts` (real sea-forge-server): allow / deny / offline, and escalate -> self-approval refused -> operator approval commits once -> rejection commits nothing. Limits: an approval never revives a stale frame (the frame register is in memory); no HTTP approval route. Next: IS6 (RealityTrace observation, settlement reference); IS2/IS7 need a SPEC-CR candidate.

## T10 — Source-grounded seven-operation world debugger

The debugger answers `why`, `impact`, `diff`, `timeline`, `counterfactual`, `reach` and `replay`
from the T06 projection read behind the same T07 frame the terminal and GUI render. Context Kernel
retrieval sits beside that answer as cited reference material, reached only through the
boot-registered `horizon.context.query_reference` capability.

- **Every value is labelled.** `recorded`, `derived`, `unknown`, `effect` or `untrusted_reference`,
  each with a source; an `unknown` always names the source that records nothing.
- **Retrieval grants nothing.** Citations are classed `untrusted_reference` by Horizon itself,
  never by copying what the server said, so a retrieved instruction cannot become an action.
- **Refusals are typed.** Bounds are required rather than defaulted; undeclared relations are
  refused by name; denied, unavailable and no-match stay three distinct observations.
- **A cross-checkpoint read says so.** `diff`/`timeline` name the checkpoint actually read in
  `scope.comparison` and never rewrite the frame's own `checkpoint_ref`.

**Defect found and fixed while building the teeth.** `inspectFocus`'s `argumentsFor` returned
`{ operation }` for `counterfactual`, `replay` and `impact`, so every operation's own arguments were
silently discarded: a counterfactual with a proposal could only be refused, and `impact` could never
be bounded through the application surface. The caller's arguments are now passed through and the
debugger — not the adapter — decides validity. Two further boundary breaks were corrected: `src/ui`
imported the Context Kernel adapter (replaced with a local structural contract), and two comments
tripped the donor-reference check.

**Teeth.** 11 teeth (NE-01…NE-10 plus a PE-14 boundary tooth) each assert the typed refusal *and*
that navigation still answers, so a debugger that had simply broken cannot pass them. A mutation
runner then breaks one protected property at a time in a throwaway tree and requires failure by
assertion: 11/11 caught, including a direct Context Kernel import in the surface.

**Verified:** `just gate-t10` exit 0 · `just verify` exit 0 · 139 pass / 0 fail (20 files) plus
4 research tests · `tsc --noEmit` clean · boundaries ok · spec SHA-256 unchanged.

**Limits.** No independent confirmer signed this round, so P3 is not claimed. No live Context
Kernel process was spawned: the capability, its policy, its registration and its scope refusals are
production ones, but the wire is scripted, so `integration_level` stays `fixture`. Operational rows
remain fixture-produced. `declaredFor` declares no relation types, so bounded `impact` is exercised
only by driving `runDebugger` directly (logged in `DEBT.md`). Checkpoint restore filters current
rows, which is exact only while the projection is additive.

**Next:** T11.

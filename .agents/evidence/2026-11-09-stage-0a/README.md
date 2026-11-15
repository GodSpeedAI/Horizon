# Stage 0A-1 evidence — closed operation catalog and policy freeze

**Date:** 2026-11-09
**Preregistration:** `.agents/prereg/horizon/STAGE-0A.prereg.yaml` (`HORIZON-PREREG-STAGE-0A-1`)
**Design input:** `design_draft.md` §11, §13, §14, Appendix A at SHA-256 `2c4a4182…`
**Settles:** nothing. No plan task, no specification requirement.

These are contract-freeze observations. They say nothing about runtime behaviour, authority
enforcement, or any of Q1–Q8.

## What was committed

| Artifact | Purpose |
|---|---|
| `contracts/identity/v1/operations.yaml` | The closed catalog: 63 operations in five class groups, one binding state per row, plus a defect register for write routes with no row |
| `contracts/identity/v1/policy.yaml` | Owner-frozen U4.A constants and the absent-child-grant rule |
| `contracts/identity/v1/params.yaml` | Frozen parameter schemas and the alias table |
| `contracts/identity/v1/platform-claims.yaml` | The U5.A claim matrix, including the measured Jetson limits |
| `src/contracts/identity/manifest.ts` | Strict loader, `classify()` with Px fail-closed semantics, downgrade predicate |
| `test/identity-contract.test.ts` | 26 checks: closure, downgrade, dispatchers, parameter resolution, route accounting, policy constants, platform claims |

## Observed command output

| Command | Observed |
|---|---|
| `bun test test/identity-contract.test.ts` | 26 pass, 0 fail, 674 expect() calls |
| `./node_modules/.bin/tsc --noEmit` | exit 0, no output |
| `bun run check` | `check: ok (local_operator, 127.0.0.1:4319, horizon)` |
| `bun run scripts/check-prereg-shape.ts .agents/prereg/horizon/STAGE-0A.prereg.yaml` | `prereg shape: ok`, 6 positive + 6 negative structural members |

## Defects this work surfaced

The manifest has a `catalog_gaps` section. Its entries are findings, not waivers. Under the design's
own rule — "an operation not listed, or a route/handler not mapped to one of these IDs, is Px and
fails closed" — each of these writes would refuse:

1. **The agent door has no catalog row.** `POST /agent/panels` performs four writes (`show_surface`,
   `ask_human`, `arrange`, `annotate`). Section 11 closes the catalog without any agent-authored
   content operation, and the Stage 0B scope list does not name them. Building Stage 0B as written
   would cut agent collaboration off from the person's workspace.
2. **`POST /desk/pair/logout` has no row.** Ending a paired session is a write, and it is not
   `device.remove`.
3. **`POST /workspace/intent` has no row.** The catalog carries two intent rows and the code carries
   three intent routes; which row governs this one is not established by the source.
4. **`POST /desk/search` is write-classed with no row.** No effect was observed, but a POST route
   with no row is exactly what the closure rule forbids.

Item 1 changes the plan: it is a catalog revision, not an implementation choice, and it should be
settled before Stage 0B rather than absorbed silently into it.

## Limits

- The route scan reads only literal `pathname === "…" && request.method === "POST"` comparisons in
  `src/app.ts`. A route registered through a table, a variable, or another server file is invisible
  to it.
- P1 rows inherit their class default, so a mis-classified P1 write would be hidden by inheritance
  rather than by omission.
- The catalog is a binding of the design, and the design carries five post-review corrections that
  were never independently reviewed. The Stage 0A fixtures are where those corrections become
  testable; this file covers the catalog, the policy constants, the frozen parameter schemas, and
  the claim matrix, not the record schemas (`Credential`, `DelegationGrant`, `AuthorityDecision`,
  `Approval`, `EffectFence`, `A3Receipt`, `EvidenceRecord`, `Refusal`) or the issuer profile.

---

# Stage 0A reconciliation and Stage 0A-2 record schemas

**Date:** 2026-11-09 (same day, after the Stage 0A-1 freeze above; that record is preserved unchanged)
**Owner decision:** the owner authorized reconciling the catalog against implemented behaviour,
classifying the agent door per semantic action, treating session logout as session lifecycle,
binding the third intent route as a narrowing alias, classifying search by effect, and registering
the identity work as a tracked plan task.
**Plan relationship:** task `T23` in `HORIZON-PLAN-001` (plan version 1.1.0), depending on `T04`,
required before `T19`. `T23` settles `REQ-SEC-006`; this stage settles no requirement on its own.

## The four gaps, and what each became

| Gap | Disposition |
|---|---|
| The agent door (`POST /agent/panels`) had no row | Dispatched per semantic action. Seven rows: `agent.surface.publish` (P1), `agent.surface.arrange` (P1), `agent.surface.annotate` (P1), `agent.question.ask` (P1), `agent.response.read` (P0), plus the already-governed `ask.withdraw` (P2) and `ask.route` (P2). The door refuses every `human.*` action outright. |
| `POST /desk/pair/logout` had no row | `session.logout` (P1), session lifecycle, `ownership: caller_own_session`. It is not `device.remove`, which stays governed (P2) and keeps its A3 evidence. |
| `POST /workspace/intent` had no row | A narrowing route alias of `horizon.surface.intent.commit` (P1). Both handlers call `commitSurfaceIntent`; the workspace route hard-codes `transport: gui`, `role: human`, and additionally requires an offered, available action and a matching frame revision. |
| `POST /desk/search` was write-classed with no row | Split by effect: `horizon.search.read` (P0) and `horizon.search.record` (P1). The POST method is not the classification; the recorded find is the write. |

## The census, and every difference from the 63-row freeze

**73 rows** — P0 17, P1 26, P2 23, P3 5, PX 2.

**Added (10):** `horizon.search.read` (P0), `agent.response.read` (P0), `horizon.search.record` (P1),
`session.logout` (P1), `agent.surface.publish` (P1), `agent.surface.arrange` (P1),
`agent.surface.annotate` (P1), `agent.question.ask` (P1), `human.panel.open` (P1),
`human.panel.close` (P1).

**Removed (1 binding):** `GET /desk/search` is no longer bound to `horizon.workspace.read`; the read
half of that route is `horizon.search.read`.

**Corrected (1 binding):** `human.answer` was bound to a route it does not perform; it is bound to
`POST /desk/panels/op` only.

**Aliases (1):** `POST /workspace/intent` → `horizon.surface.intent.commit`, narrowing only.

**Classification changes (0 by demotion):** no previously protected operation was downgraded. The
agent door's four writes move from *no row* (which meant Px, i.e. refused) to P1 rows that are
owned by the caller's key. `ask.withdraw` and `ask.route` remain P2. `device.remove` remains P2.

**Also recorded, not fixed:** `human.panel.open` and `human.panel.close` had no row either; they
were found by reading the handler rather than by scanning routes, and are now `human.panel.open`
and `human.panel.close` (P1, `ownership: person_owns_board`).

**Deliberately not added:** a P0 ephemeral private surface presentation. No implemented path exists,
so it has no row; it is named in `agent.surface.publish`'s note instead of being claimed.

## Two binding defects recorded rather than waived

| Id | Route | Status |
|---|---|---|
| `DEF-ROLE-FROM-REQUEST` | `POST /surface/intent` | `recorded_not_fixed` — `commitSurfaceIntent` still reads `role` from the request body and falls back to human. The defect is only honest while that is true; Stage 3 carries the caller kind from the session. |
| `DEF-ASK-ROUTE-EXECUTOR` | `POST /agent/panels` (`ask.route`) | `recorded_for_owner` — the design's P2 row names a `human_session` executor; the handler is on the agent door. The class is not in doubt; the executor evidence is. |

`catalog_gaps` is empty: reading the router found no write route or code operation the catalog
does not now contain.

## Stage 0A-2 — record schemas and cross-language fixtures

| Artifact | Purpose |
|---|---|
| `contracts/identity/v1/records.json` | The record contract: an envelope, 9 record kinds (8 signed + the unsigned `Refusal`), 8 encoding rules, 15 named cross-field constraints, and the properties one record cannot prove |
| `src/contracts/identity/records.ts` | The TypeScript validator: field checks, constraint checks, `effectiveChildGrant` |
| `contracts/identity/v1/fixtures/record-cases.json` | 71 cross-language cases: 22 valid, 49 invalid, across all 9 kinds |
| `test/identity-records.test.ts` | 30 checks: the fixture drive, the manifest cross-check of every case's `catalog` facts, the three owner proofs, and the refusal semantics |
| `research/tests/identity_records.py` | An independent implementation of the same rules, written from the rule text, stdlib only |
| `research/tests/test_identity_fixtures.py` | 87 checks: the same cases in Python, plus a check that every declared constraint is implemented and exercised |

The record descriptor is JSON, not YAML, so the TypeScript validator and the Python checker read
identical bytes without a new dependency (`research/pyproject.toml` declares none). The Python
checker is a test helper under `research/tests`, the repository's Python test root; it is not part
of the `horizon_research` package and the research subsystem does not own identity.

### The three owner proofs, in both languages

| Proof | What it shows |
|---|---|
| `no_fabricated_grant` | A human-session descriptor with no grant is well formed. The same descriptor with a delegation head, an execution, or a grant smuggled into its parameters is refused (`human_has_no_grant`, `human_has_no_credential`), not ignored. |
| `caller_not_substitutable` | A human cannot present an execution, an agent cannot omit one, a console cannot claim one, and a fence cannot claim to be the execution it targets. |
| `no_classification_downgrade` | An alias fixes its action, a governed row may not name a local parameter schema, a governed agent execution needs a live delegation, and a dispatch target that is not a listed row is Px. |

### Observed command output

| Command | Observed |
|---|---|
| `bun test test/identity-contract.test.ts test/identity-records.test.ts` | 79 pass, 0 fail, 1655 expect() calls |
| `uv run --project research pytest research/tests/test_identity_fixtures.py -q` | 87 passed |
| `bun run scripts/check-t23-prereg-coverage.ts` | 20 Stage 0A expectations linked to named tests, 6 later-stage expectations open |
| `bun run scripts/teeth-t23-mutation.ts` | 12 mutants caught |
| `./node_modules/.bin/tsc --noEmit` | exit 0, no output |
| `just verify` | `verify: ok (active frozen artifacts: requirements/ledger.yaml + .wayfinder/answer-key.md)` |

### The mutation teeth

Twelve mutants, one per protected property: a governed row satisfied by a local-policy writer; an
unlisted operation falling back to a local read; an unrecognized action resolving to a row; the
agent door ceasing to refuse the person's reserved operations; a human session carrying a
delegation head; a record claiming to be the execution it targets; an alias no longer fixing its
action; a governed operation allowed offline; the loader tolerating an unrecognized key; a
governed row reclassified as a local write; the dispatch table losing an action; the validator
ceasing to report an unknown field. Each mutant is caught by assertion in the named test.

## Plan, ledger and freeze

The identity work is registered as `T23` in `.agents/plans/horizon.plan.yaml` (version 1.1.0):
a task block with its own stages (0A, 0B, 1–7), four preregistered teeth, the task evidence path,
and `REQ-SEC-006` added to its settling tasks. `T23` depends on `T04`; `T19` now depends on
`T23`. The dependency graph, the blocked map and the parallel tracks carry the same edges.

The requirement ledger was regenerated and re-frozen because the plan hash it records had changed.
The regenerated ledger differs from the frozen one only by the `T23` additions: `REQ-SEC-006`'s
`proof` gains `just gate-t23` and its `settling_tasks` gain `T23`. Freeze id
`HORIZON-001-1.2.0@2026-11-09`; ledger freeze hash
`sha256:a7042916f8a94b56c1668d4b1454ee33bde483adacf79cf220b3ee3353eda25f`.

To regenerate at all, one pre-existing defect had to be fixed: `scripts/gen-requirement-ledger.py`
failed closed when a requirement named two invariants, and the canonical `.sea` model binds
`REQ-DEV-001` to both `INV-12` (settlement-stage order) and `INV-07` (evidence is not settlement).
The repository's own IDM integrity check permits that shape. The generator now selects the lowest
invariant id as the primary binding and reports the others on stderr instead of dropping them
silently. The ledger's binding for `REQ-DEV-001` is unchanged (`INV-07`), so the freeze diff
stays limited to the `T23` additions. The ambiguity is in the `.sea` model and is flagged for the
IDM owner, not resolved here.

## Limits

- The Stage 0A fixtures are contract-level. They prove the catalog bindings, the schemas and the
  refusal rules. They prove nothing about a live issuer, a live grant, a real external effect or a
  settled evidence chain; those are Stages 1–5.
- The route scan reads only literal `pathname === "…" && request.method === "POST"` comparisons in
  `src/app.ts`. A route registered through a table, a variable, or another server file is invisible
  to it.
- The Python checker shares the fixture file and the rule text with the TypeScript validator, not
  the implementation. It can share a misreading of a rule; the expectations are also checked
  against the design text by a reader.
- The design draft these contracts derive from carries post-review corrections that were never
  independently reviewed. The Stage 0A fixtures are where those corrections become testable.

## What remains open for Stage 0A

Stage 0A is not finished. The contract set is frozen and checked, but two items of the design's
Stage 0A exit gate are not in this repository yet:

1. **The issuer profile** (design §3, §5) is not frozen as a contract file. Nothing here can
   produce a credential, so the `Credential` schema is checked for shape only.
2. **An independent review of the manifest** — the design requires "an independently reviewed
   manifest" as part of the Stage 0A exit gate. The reconciliation and the fixtures are recorded
   here; a fresh reader has not yet re-derived the census and the violation sets. The
   `confirmation_condition` in `.agents/prereg/horizon/T23.prereg.yaml` states what that review
   must show.

The next dependency-ready work is Stage 0B containment, which needs the owner decision on
`DEF-ASK-ROUTE-EXECUTOR` before the reserved-operation refusals are implemented.

---
# Stage 0A-3 — issuer profile, A3 mechanism, defect closure, and an independent review that rejected the set
**Date:** 2026-11-09 and 2026-11-10 (same evidence wave; the two records above are preserved unchanged)
**Preregistration added by this wave:** `.agents/prereg/horizon/STAGE-0A-DEFECTS.prereg.yaml`
(`recorded_before_artifacts: false` — the artifacts it names did not exist when the earlier
preregistrations were written, and the recorded ones were not rewritten)
**Full evidence index for this wave:** `.agents/evidence/2026-11-09-stage-0a-defects/README.md`

## What this wave added
| Artifact | Purpose |
|---|---|
| `contracts/identity/v1/issuer-profile.yaml` | The issuer profile: Cognate owns issuance and propagation, SEA-Forge stays the independent delegation authority, enrollment/issuance/holder binding/rotation/recovery/revocation, the custody profiles, and the four platform lanes plus the no-issuer lane. A host without qualified custody refuses agent identity rather than downgrading. |
| `contracts/identity/v1/a3-mechanism.yaml` | The A3 mechanism: the A3-UV and A3-T predicates, the challenge binding, the refused paths, the assurance-requirement vocabulary, and the honest S1/S2 limits. |
| `src/contracts/identity/issuer.ts` | The strict loader for both, with fail-closed parsing. |
| `test/identity-issuer.test.ts` | 29 checks over both contracts. |
| `test/identity-defects.test.ts` | The negative tests for the two recorded identity defects, plus the closed-dispatch refusal. |
| `scripts/check-param-schema-binding.ts` | The binding check: every governed row and every agent-door row's schema is compared field by field against the live handler. |
| `.agents/evidence/2026-11-09-stage-0a-defects/` | The frozen review copies, the round-1 verdict, and the finding-by-finding disposition. |

The catalog gained a `live_enforcement` block (one entry per live-bound row), a structured route
alias, the `session.pair` row, the `run.start` dispatcher, and an `action_values` declaration on the
find route. The record contract gained the `PendingOperation` kind and three constraints. The
parameter schemas were rewritten to the handlers' wire names. The design draft was amended in the
same wave so that the two frozen files no longer disagree; its new hash is
`df55e921c0c62e22737a91fcdcbb5ba4bb6160492fbd0de7a1db274f24bd65b7` (747 lines).

## The independent review
A fresh independent critic (`gpt-5.6-sol`, xhigh, read-only sandbox, ephemeral session) read a
frozen, hash-pinned copy of the whole contract set and returned **REJECT**: five blocking findings,
six must-fix-before-Stage-0B findings, two advisories. The builder independently confirmed that all
five blocking findings were true before making any correction; none was waived. Every finding's
disposition is in `.agents/evidence/2026-11-09-stage-0a-defects/review-round-1-disposition.md`.

A second review of the re-frozen, corrected contract set is the condition for Stage 0A to settle.

## The state of the two items this record previously listed as open
1. **The issuer profile is frozen.** `contracts/identity/v1/issuer-profile.yaml` and
   `contracts/identity/v1/a3-mechanism.yaml` exist, are strictly parsed, and are covered by 29
   checks. Nothing here can still produce a credential: the `Credential` schema is checked for
   shape only, and the issuer profile claims no qualification result.
2. **The independent manifest review has been done once, and it rejected the set.** The round-1
   verdict is retained verbatim. The remediation is recorded. The round-2 verdict is the remaining
   condition, and it had not landed when this section was written.

The `DEF-ASK-ROUTE-EXECUTOR` owner decision this record previously said Stage 0B was blocked on was
resolved by the owner's rule that the row may be corrected when the executor evidence is missing:
the row now names `executor: agent_execution` and `caller_authentication: registered_agent_key`,
the design's table says the same, and the defect is closed with negative tests.

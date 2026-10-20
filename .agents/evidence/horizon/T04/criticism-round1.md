# Criticism round 1 — candidate revision T04-CR-001

**This is not an independent verdict and does not settle T04.** It was written in the build
session that produced the candidate, so it cannot be independent of its author. It is recorded
because it found four defects in the candidate *as first prepared*, and the corrected candidate
must be reviewed against them. A fresh, context-isolated reviewer is still required; their
verdict goes in `verdicts/<reviewer-id>.md` (the builder does not write files there).

Date: 2026-10-19. Subject: the first draft of `T04-CR-001` as committed in `8cb0368`
(candidate ledger sha256 `7963fd15…`, policy overlay sha256 `8840b0d4…`). The corrected
candidate is measured against it below.

## The instruction this round applied

> Preserve MUST, MUST NOT, MAY and SHOULD exactly in meaning. A witness may supply an *input*;
> it may not restate a *policy* as though the policy had been ratified.

## C1 — `AC-CASE-002-01` (material deviation) — **defect**

| | |
| --- | --- |
| Requirement | "The next primary move MUST respond to material deviation; no primary recommendation is required when only optional choices remain." |
| First draft | "For a frame whose recorded deviation input is `undertaken` -- a listed operation has completed, been refused, failed, or returned evidence that contradicts its new state -- the next primary move responds to that operation by name; …" |
| Defect | It treated `undertaken` as the requirement's predicate for *material* deviation and enumerated four outcomes the ruler never names. The witness returned `operation_ref = deviation.operation_ref` and computed a `changed_from` field no requirement mentions. |
| Evidence | `scripts/ledger-policy.candidate.yaml` (first draft) `overrides.REQ-CASE-002`; `src/domain/contracts.ts` `evaluateDeviation` (first draft). |
| Reproduced | `check-witness-claims` reports `REQ-CASE-002: adds the quantifier 'every'` against the first draft. |
| Correction | The contract restates the requirement verbatim and states separately what the witness supplies ("which operations deviated from a visible settleable path, and the frame's ordered typed choices"). The witness was rewritten to the frozen spec's own algorithm, `derive_navigation_frame` → `firstAvailableThatAddressesMaterialDeviationOrNone`, which selects the first **available** choice; `.sea` INV-01 defines availability as a visible reachable, payable, governable, settleable path. The invented `changed_from` and outcome list are gone. |

## C2 — `AC-CONFIG-004-01` (config witness) — **defect**

| | |
| --- | --- |
| Requirement | "Configured provider endpoints, credentials, timeouts and scope MUST remain below stable behavior contracts." |
| First draft | "… changing a configured provider endpoint, credential, timeout or scope leaves the typed choices, intent ids and surface blocks unchanged; **only provider configuration records differ**." |
| Defect 1 | "Provider configuration records" do not exist in Horizon, so the contract asserted a difference nothing observed. |
| Defect 2 | The witness compared two object literals (`providerA`, `providerB`) that neither application read, then asserted `second.provider !== first.provider` — a tautology. |
| Defect 3 | "Exercise configuration through application construction" is not in the ruler. |
| Correction | The contract restates the requirement verbatim. The witness builds two applications from two `horizon.toml` files that genuinely differ (bound endpoint `127.0.0.1:11434` vs `localhost:11435`; different launch-secret paths), reads those values back from `app.loaded.config`, asserts the loaded configurations differ, and asserts choices, intent ids, surface and frame revision are identical. Its header states what it does not cover: `HorizonConfig` declares no provider timeout or scope (DEBT D-019). Teeth: an endpoint-dependent surface makes the test fail. |

## C3 — `AC-NAV-005-01` — **narrower defect**

| | |
| --- | --- |
| Requirement | "The navigation controller MUST avoid asking for context it can resolve without user burden." |
| First draft | "Against the **pinned frame vocabulary**, a prompt … **is never issued**; the frame resolves it and records the reference it resolved from." |
| Defect | "Pinned frame vocabulary" names a ratified vocabulary the ruler never declares; "records the reference it resolved from" adds a recording obligation. |
| Correction | Verbatim restatement; the witness supply is stated as an input; the code comment no longer claims a ratifying vocabulary. |

## C4 — a third-party contract changed by the same run — **defect**

`REQ-STACK-002` ("adapters MUST not create a second authoritative event history") is regenerated
by the same run. With its subject restored, the lowercase `MUST not` became "Adapters **are
observed to not** create …" — a positive observation of a prohibition: the F2 class recurring in
a contract nobody was watching. Fixed in the generator, locked with a self-test case.
`check-acceptance-claims` could not see it because it checks only the four cited contracts;
`check-witness-claims` now can.


## Review of all regenerated contracts for the same class

`scripts/check-witness-claims.py` (new) judges every contract in the active and candidate
ledgers against its requirement's own words: permission negated, SHOULD strengthened,
behaviour, authority or quantifier added, quantifier dropped, prohibition unrestated.
`scripts/measure-contract-modals.py` (new) measures mechanically whether a contract loses a
modal its requirement carries.

| Round | Contracts changing vs the frozen ledger | Findings in changed contracts |
| --- | --- | --- |
| First draft (`8cb0368`) | 72 | CASE-002 (quantifier + outcome list), CONFIG-004 (behaviour + false claim), NAV-005 (annotation), STACK-002 (prohibition inverted), UX-009 (SHOULD→MUST), RES-004 / STACK-013 / WORLD-008 (MAY→absolute), NAV-003 / STACK-009 (MAY→absolute) |
| Corrected candidate | 72 | none new; the four cited contracts restate verbatim, and 9 pre-existing findings are recorded as DEBT D-020 rather than fixed here |

Ten contracts changed between the first draft and the corrected candidate:
`REQ-CASE-002`, `REQ-CONFIG-004`, `REQ-NAV-003`, `REQ-NAV-005`, `REQ-RES-004`, `REQ-STACK-002`,
`REQ-STACK-009`, `REQ-STACK-013`, `REQ-UX-009`, `REQ-WORLD-008`.

- `measure-contract-modals.py --ledger <candidate>` → every contract preserves its requirement's modals.
- `measure-contract-modals.py --ledger requirements/ledger.yaml` → 10 contracts drop a modal
  (the active ledger, which this revision does not change).
- `check-witness-claims.py` → 9 findings, all matched to `scripts/witness-claims-baseline.txt`
  (DEBT D-020). A *new* finding fails: verified by injecting one (`remedy`, `first available`).

`REQ-UX-009` ("Read-only navigation interactions **SHOULD** respond within 300 ms p95") shows why
the measurement matters: the generic restatement had already turned a SHOULD into a hard
obligation, and neither prior checker saw it. The generator now restates a `MAY` as "may be
observed" and a `SHOULD` as "should be observed", each with a self-test.

## Frozen artifacts

All six pins are byte-identical to the state the independent verdict reviewed; `git status`
over those paths is empty.

```
c7afbcc60f9cd197ddef60941e19bd6cc9cfc00584c5703a6e6fa07e364e7417  requirements/ledger.yaml
f00b060d4f27a1dc727ad34a50b099efa881a665e7c4ba308c2429b22ec05eb2  .wayfinder/answer-key.md
75cfc1ceb9eec6139f7b8e73f8d1107fcc5e2b680e80683824edd7d8de434130  .agents/specs/horizon.agent.spec.yaml
9c434b404a948971e3bca27a06eef670ab790e1f6bfc5c7ffd0847662a06a03e  .agents/prereg/horizon/T04.prereg.yaml
6d03ab70cfabc446e2610300909edbaa81adfce6b629ce0b2d79eef733003e45  scripts/ledger-policy.yaml
1c3909e51c509b60634dc5f4dba7dc29c3c58bc883a0134cf2861ac23bb1eec1  .sea/interaction/interaction-model.sea
```

No inverted prohibition is recorded as accepted risk, and T04 is not settled:
`just acceptance-claims-frozen` and `just contract-modals-frozen` stay **red** by design.

## What still needs an independent reviewer

The five questions in `.agents/candidates/horizon/T04-CR-001/REVIEW.md`, plus:

6. Does `evaluateDeviation` implement the spec's algorithm, or has one invented rule merely
   replaced another? (`reference_algorithms.derive_navigation_frame`, INV-01.)
7. Does the config witness's claim survive without provider timeouts and scopes (D-019)?
8. Is baselining nine findings acceptable (D-020), given none is in a contract this revision
   changed?

## C5 — the round-1 record was itself incomplete — **defect in this record**

When the four corrections above were first written up, this record said the corrected candidate
carried "no new finding" and listed only the contracts criticism had named. A full review of all
regenerated contracts then found two more of the same class, both in contracts the rewrite
touched:

| Contract | Requirement | First draft | Found by |
| --- | --- | --- | --- |
| `REQ-RES-004` | "Predictive estimates **MAY** inform payment … only after governed activation" | "are observed to **inform** payment …" — the permission became an absolute | `check-witness-claims` (permission negated) |
| `REQ-UX-009` | "Read-only navigation interactions **SHOULD** respond within 300 ms p95" | "are observed to **respond** within 300 ms p95" — the SHOULD became a MUST | `measure-contract-modals` (soft obligation lost) |

`REQ-STACK-013` and `REQ-WORLD-008` had the same shape (a `MAY` restated as "is observed to be a
hosted surface" / "is observed to be a read-only view"); their `MUST NOT` was preserved, so the
prohibition checks never fired on them.

Correction: the generator now restates a `MAY` as "may be observed" and a `SHOULD` as "should be
observed", with self-tests; `REQ-RES-004`, `REQ-STACK-013` and `REQ-WORLD-008` were re-derived
with explicit overrides that keep the permission as a permission (the generic generator cannot
place the modal where the ruler put it inside a multi-clause sentence), `REQ-UX-009` is restated
by the generator itself, and all four are reviewed again in the table above. The lesson is
recorded because it is the same lesson as C4: the contracts nobody flagged are where the same
defect class hides.

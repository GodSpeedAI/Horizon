# T04 independent review — single entry point (candidate revision 3)

**This is the only current review request for T04.** Revision 2 failed independent review
(`verdicts/codex-adversarial-r2-20261019.md`, verdict **fail**, R1 revise_again). Revision 3 is the
builder's response. Nothing has been applied to a frozen artifact or re-frozen.

Superseded requests (history only, do not review against them): `REVIEW_REQUEST.r2.superseded.md`
(revision 2), `REVIEW-attempt1.superseded.md` (first build), `REMEDIATION.review-request.superseded.md`.
The two recorded verdicts are **evidence you may cite, not a specification**: re-test what they
found rather than inheriting it in either direction.

You have no access to the builder's context. The builder's statements below are *claims*.
Falsifying one is the most valuable thing you can produce; "could not falsify" is a complete
verdict. Do not repair anything. Do not edit a frozen artifact. Report only.

## 1. What is under review

| | |
| --- | --- |
| Review target | The commit that adds this file: `git log -1 --format=%H -- .agents/evidence/horizon/T04/REVIEW_REQUEST.md`. Review that commit's tree from a clean export (`git archive`), not a working copy. |
| Candidate | `.agents/candidates/horizon/T04-CR-001/`, **revision 3** (`CANDIDATE.yaml`, `REVIEW.md`, `ledger.yaml`, `answer-key.md`, `composed/`) |
| Overlay | `scripts/ledger-policy.candidate.yaml` (rules, `witness_supplies`, `evaluated_by`) |
| Prior verdicts | `verdicts/codex-root-20261019-7b4d110.md` (first build), `verdicts/codex-adversarial-r2-20261019.md` (revision 2) |
| Preregistration | `.agents/prereg/horizon/T04.prereg.yaml`, frozen; the oracle to argue against |
| Owner decision | `DEC-T04-05` in `.agents/reports/horizon-decisions.yaml` authorized revision 2 conditionally; whether it extends to revision 3 is the owner's call (§8) |

### Frozen artifacts — confirm first

```bash
sha256sum requirements/ledger.yaml .wayfinder/answer-key.md \
  .agents/specs/horizon.agent.spec.yaml .agents/prereg/horizon/T04.prereg.yaml \
  scripts/ledger-policy.yaml .sea/interaction/interaction-model.sea
git diff 7b4d110 -- requirements/ .wayfinder/ .agents/specs/ .agents/prereg/ .sea/ scripts/ledger-policy.yaml   # expect empty
```

| Path | sha256 |
| --- | --- |
| `requirements/ledger.yaml` | `c7afbcc60f9cd197ddef60941e19bd6cc9cfc00584c5703a6e6fa07e364e7417` |
| `.wayfinder/answer-key.md` | `f00b060d4f27a1dc727ad34a50b099efa881a665e7c4ba308c2429b22ec05eb2` |
| `.agents/specs/horizon.agent.spec.yaml` | `75cfc1ceb9eec6139f7b8e73f8d1107fcc5e2b680e80683824edd7d8de434130` |
| `.agents/prereg/horizon/T04.prereg.yaml` | `9c434b404a948971e3bca27a06eef670ab790e1f6bfc5c7ffd0847662a06a03e` |
| `scripts/ledger-policy.yaml` | `6d03ab70cfabc446e2610300909edbaa81adfce6b629ce0b2d79eef733003e45` |
| `.sea/interaction/interaction-model.sea` | `1c3909e51c509b60634dc5f4dba7dc29c3c58bc883a0134cf2861ac23bb1eec1` |
| Pinned `world_ref` | `world:horizon@sha256:6c18d6a608bd9d83e6aa354d5a8cc804009ca208562021c1736ee429412309f0` |

A differing hash is a blocker: stop and report it.

## 2. What revision 3 claims

| r2 finding | Claimed change | Where to attack |
| --- | --- | --- |
| F1 frozen E2E falsifier triggers | The structural E2E asserts every required Cognate package and every Cognate package `src/` imports is a declared dependency, so metadata-only removal fails it | `test/app.test.ts` (`assertDeclaredCognateClosure`), `src/runtime/required-cognate.ts`, `scripts/teeth.ts` (`missing-cognate-dependency-e2e`) |
| F2 five contracts alter their ruler | DEV-001, NAV-002, STACK-004, STACK-011, STACK-014 restate their own ruler | overlay entries; candidate ledger |
| F3 witness claims exceed observation | Uncalled helpers and their six tests removed; CASE-002 and NAV-005 unbound (proof open until T07); CONFIG-004 varies the research provider endpoint and is marked PARTIAL | `test/acceptance.test.ts`, overlay `evaluated_by` / `witness_supplies` |
| F4 baseline hides a regression | Keys are full ledger path plus a contract-text digest; stale entries fail; `gate-t04` runs `contract-modals` | `scripts/witness-claims-baseline.txt`, `scripts/check-witness-claims.py`, `scripts/measure-contract-modals.py`, `justfile` |
| F5 active inverted prohibitions / prereg overclaim | Unchanged from revision 2: the candidate restores the four prohibitions and carries the prereg patch | `composed/prereg.patch` |
| F6 `.sea/` exempted wholesale | Only the import closure of `.sea/interaction/interaction-model.sea` is canonical | `scripts/check-boundaries.ts`, tooth `duplicate-canonical-subtree` |
| F7 records ahead of evidence | Correction notes appended; recorder exits 0 only when required targets pass and expected-red targets fail | `criticism-round1.md`, `SUMMARY.md`, `run-gates.sh`, `gates.txt` |

## 3. Rulings you must make

### R1 — Candidate revision 3

Reproduce it and diff against the committed files:

```bash
python3 scripts/apply-candidate-revision.py
python3 scripts/gen-wayfinder.py --ledger .agents/candidates/horizon/T04-CR-001/ledger.yaml \
  --out /tmp/ak.md --freeze-id T04-CR-001-candidate --frozen-at pending-owner-authorization
cmp /tmp/ak.md .agents/candidates/horizon/T04-CR-001/answer-key.md
git status --porcelain .agents/candidates/horizon/T04-CR-001/   # expect empty
```

Audit all 98 candidate contracts against the frozen spec text. Attack the five F2 rewrites
specifically:

| Requirement | Question |
| --- | --- |
| REQ-DEV-001 | Are all five named categories kept, with nothing added? |
| REQ-NAV-002 | Does the contract now reject a missing key as well as an extra one? |
| REQ-STACK-004 | Is the restriction's direction right? Does the last sentence ("does not make Gauntlet the sole executor") add a rule, or only state the direction REQ-RES-003 already gives? |
| REQ-STACK-011 | Is the joining restriction kept? Does "is refused" overstate "joins ... only through"? |
| REQ-STACK-014 | Is the prohibition limited to dependency-producing changes? Is the public-surface clause about Horizon's integration? |

### R2 — Witness dispositions (F3)

Is anything still claiming CASE-002 or NAV-005 as observed? Is leaving them unbound acceptable
at T04? Does AC-CONFIG-004-01 vary a configured provider endpoint (`research_command`), and does it
claim nothing beyond that?

### R3 — Baseline (F4)

Can any entry in `scripts/witness-claims-baseline.txt` suppress a finding it should not? Repeat the
r2 attack (restore an active-ledger wording in a disposable candidate copy) and try others: path
aliasing, whitespace-only text changes, a stale entry. Rule on the one candidate entry
(REQ-RES-001).

### R4 — Mutable fixes (F1, F6)

Does the structural E2E now discriminate the prereg falsifier without asserting something the
prereg does not name? Does the boundary check reject every `.sea` authority outside the canonical
closure while accepting the real tree? Try closure edge cases (import syntax variants, symlinks,
a closure file shadowed by a copy).

## 4. Re-run the gates

```bash
bash .agents/evidence/horizon/T04/run-gates.sh; echo "recorder exit=$?"
just check; just boundaries; just test; just ledger; just wayfinder; just teeth; just verify; just gate-t04
```

Requires `just`, Bun 1.4.0, `uv`, and DomainForge 0.21.1 at `../domainforge/target/release/domainforge`
or via `DOMAINFORGE_BIN`. Loopback HTTP binds are needed for `just test`; a sandbox `EPERM` is
environmental. Bun may hide per-test `(pass)` lines in agent sessions; read the `N pass` summary.

## 5. Criteria to adjudicate

PASS, FAIL or UNVERIFIABLE for each, with one sentence and the command or file. Quote the
preregistration, not a summary.

- **PE-01..PE-08** and **NE-01..NE-05** in `.agents/prereg/horizon/T04.prereg.yaml`. Perform the NE
  attacks yourself; do not rely on `scripts/teeth.ts`.
- **Falsifier:** "Remove the required Cognate project dependency or load a fake in-memory runtime
  and the structural E2E still passes; or accept a copy of Product Actualizer's process source as
  canonical Horizon world state." Try to make it true.
- PE-01's ordering miss is a recorded deviation (DEC-T04-01). Rule on substance, not on ordering
  alone.

## 6. Questions

1. Recorder and per-target exits, pasted.
2. Any gate green without asserting anything?
3. Is the candidate freeze-ready? If not, which contracts or bindings block it?
4. Any of the 98 contracts not falsifiable as written, beyond those revision 3 leaves unbound?
5. Does anything in `SUMMARY.md`, `criticism-round1.md`, `CANDIDATE.yaml` or `REVIEW.md` still claim
   more than you observed? Quote it.
6. Anything material the builder did not disclose (skips, `|| true`, swallowed errors, mocks
   standing in for the external boundary, hand-written evidence).

## 7. Where the verdict goes

Write `.agents/evidence/horizon/T04/verdicts/<reviewer-id>.md`. Do not overwrite another file.

```yaml
---
reviewer: <id>
date: <YYYY-MM-DD>
commit: <the commit you reviewed>
independent_of_builder: true
verdict: pass | pass_with_findings | fail
candidate_revision_reviewed: 3
---
```

Sections: `## Per-criterion`, `## Rulings` (R1 accept | accept_with_S3_findings | revise_again;
R2, R3, R4 with reasons), `## Findings` (severity S1/S2/S3, file:line, why it matters, and
**candidate revision / re-freeze required: yes|no**), `## Answers` (numbered to §6),
`## Scope limits`. A finding against a frozen artifact is never waived.

## 8. What happens with the verdict

| Verdict contains | Builder will |
| --- | --- |
| no S1 and no S2 | report to the owner; apply and re-freeze only once the owner confirms DEC-T04-05 covers revision 3 |
| any S1/S2, or R1 revise_again | revise and resubmit; no freeze |
| S3 only | as the first row, and record the S3 items as DEBT |

`REQ-UX-009` was ruled faithful_SHOULD in r2 and stays open only as `OQ-001` for the next spec
version. T04 settles only after a passing verdict, an applied re-freeze and the owner's decision.

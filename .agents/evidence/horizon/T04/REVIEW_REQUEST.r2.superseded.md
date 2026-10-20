> **SUPERSEDED (2026-10-20).** This request covered candidate revision 2 at `7a248ea` and produced
> `verdicts/codex-adversarial-r2-20261019.md` (verdict **fail**). The current request is
> [`REVIEW_REQUEST.md`](REVIEW_REQUEST.md) (revision 3). Kept as history; do not review against it.

# T04 independent review — single entry point

**This is the only review request for T04.** The owner authorized candidate revision 2 on
2026-10-19, *conditional on this review*; the decision is `DEC-T04-05` in
`.agents/reports/horizon-decisions.yaml`. Nothing has been applied, regenerated or re-frozen.

Two earlier requests exist and are **superseded, not deleted** — read them only as history:
`REVIEW-attempt1.superseded.md` (the first-build request against `7b4d110`) and
`REMEDIATION.review-request.md.superseded.md` (its remediation restatement). Both point at
material this document includes. Verdicts already recorded for the first build
(`verdicts/codex-root-20261019-7b4d110.md`) are **evidence you may cite but not a
specification** — they name defects that revision 2 claims to have corrected, so the same
defects must be re-tested rather than inherited.

You have no access to the builder's context, reasoning or chat history. That is the point: the
builder's claims below are *claims*, not findings. Falsifying one is the most valuable thing you
can produce; "could not falsify" is a complete verdict. Do not repair anything. Do not edit a
frozen artifact. Report only.

## 1. What is under review

| | |
| --- | --- |
| Repository | `GodSpeedAI/Horizon`, local `/home/sprime01/projects/Horizon` |
| Review target | The tree at commit **`7a248ea`** — `fix(t04): correct T04-CR-001 policy additions found by criticism round 1` (`git status` should be clean) |
| Candidate under review | `.agents/candidates/horizon/T04-CR-001/` — **revision 2**, `status: prepared-awaiting-owner-authorization` |
| Original verdict | `verdicts/codex-root-20261019-7b4d110.md` (reviewed `7b4d110`; verdict `fail`) |
| Builder criticism | `.agents/evidence/horizon/T04/criticism-round1.md` — a **build-session record, not an independent verdict** |
| Preregistration | `.agents/prereg/horizon/T04.prereg.yaml`, sha256 `9c434b404a948971e3bca27a06eef670ab790e1f6bfc5c7ffd0847662a06a03e` — frozen, the oracle to argue against |
| Owner decision | `DEC-T04-05`: authorized, conditional on this review; not yet applied |

The candidate is a **proposal**. Review it; do not apply it to the active tree.

### Frozen artifacts — confirm these before evaluating anything

```bash
cd /home/sprime01/projects/Horizon
git status --porcelain     # expect empty
sha256sum requirements/ledger.yaml .wayfinder/answer-key.md \
  .agents/specs/horizon.agent.spec.yaml .agents/prereg/horizon/T04.prereg.yaml \
  scripts/ledger-policy.yaml .sea/interaction/interaction-model.sea
```

| Path | sha256 | Authority |
| --- | --- | --- |
| `requirements/ledger.yaml` | `c7afbcc60f9cd197ddef60941e19bd6cc9cfc00584c5703a6e6fa07e364e7417` | 98 requirements + 98 acceptance contracts |
| `.wayfinder/answer-key.md` | `f00b060d4f27a1dc727ad34a50b099efa881a665e7c4ba308c2429b22ec05eb2` | Wayfinder; `hashes:` block is authoritative for whole-file digests |
| `.agents/specs/horizon.agent.spec.yaml` | `75cfc1ceb9eec6139f7b8e73f8d1107fcc5e2b680e80683824edd7d8de434130` | normative ruler, frozen 1.0.0 |
| `.agents/prereg/horizon/T04.prereg.yaml` | `9c434b404a948971e3bca27a06eef670ab790e1f6bfc5c7ffd0847662a06a03e` | preregistration |
| `scripts/ledger-policy.yaml` | `6d03ab70cfabc446e2610300909edbaa81adfce6b629ce0b2d79eef733003e45` | ledger policy, frozen |
| `.sea/interaction/interaction-model.sea` | `1c3909e51c509b60634dc5f4dba7dc29c3c58bc883a0134cf2861ac23bb1eec1` | canonical semantic model |
| Pinned `world_ref` | `world:horizon@sha256:6c18d6a608bd9d83e6aa354d5a8cc804009ca208562021c1736ee429412309f0` | immutable semantic identity |

If a hash differs, **stop and report it as a blocker**. Also confirm the candidate did not leak
into the active tree: `git diff 7b4d110 -- requirements/ .wayfinder/ .agents/specs/
.agents/prereg/ .sea/ scripts/ledger-policy.yaml` must be empty.

## 2. What revision 2 claims to have fixed

The first build's verdict failed on four frozen defects: four contracts inverting their
prohibition (F2, S1), three underdetermined contracts (F3, S2), and a prereg claim that
"0 violations" verifies semantic fidelity (F4, S2). Revision 2 changes nothing frozen; it
prepares a corrected ledger, Wayfinder and prereg patch, and it also corrected **itself** after
the builder's own criticism found the first draft had introduced policy:

- `AC-CASE-002-01` had invented a materiality predicate and listed four outcomes.
- `AC-CONFIG-004-01` had prescribed "exercise configuration through construction" and claimed a
  provider-record difference nothing observed.
- `AC-NAV-005-01` had named an unratified "pinned frame vocabulary".
- Seven further contracts nobody had flagged carried the same class: `REQ-STACK-002` (prohibition
  inverted), `REQ-RES-004`, `REQ-STACK-013`, `REQ-WORLD-008`, `REQ-NAV-003`, `REQ-STACK-009`
  (`MAY` made absolute), `REQ-UX-009` (`SHOULD` made a MUST).

The claim to attack is: **each contract preserves its requirement's MUST / MUST NOT / MAY /
SHOULD exactly, and a witness supplies an input without restating policy as ratified.**

These are mandatory. Each needs a **RULING**, and R1 must name any contract it judges defective.

### R1 — Candidate revision 2

Regenerate it yourself and diff your result against the committed candidate. A candidate that
cannot be reproduced from its own scripts is a finding.

```bash
python3 scripts/apply-candidate-revision.py
python3 scripts/gen-wayfinder.py --ledger .agents/candidates/horizon/T04-CR-001/ledger.yaml \
  --out /tmp/ak.md --freeze-id T04-CR-001-candidate --frozen-at pending-owner-authorization
git status --porcelain .agents/candidates/horizon/T04-CR-001/   # expect empty after regeneration
```

Then audit **all 98** contracts, not only the ten the builder changed. For each changed contract
compare the contract text against the requirement text in `.agents/specs/horizon.agent.spec.yaml`
and record, per contract, whether the modal (MUST / MUST NOT / MAY / SHOULD), the subject, the
quantifier and the prohibition survive. Attack these specifically:

| Requirement | What to test | Why |
| --- | --- | --- |
| `REQ-CASE-002` | Does `AC-CASE-002-01` still imply a materiality threshold, an outcome list, or a `changed_from` field the ruler never sets? Compare `evaluateDeviation` in `src/domain/contracts.ts` against the spec's `derive_navigation_frame` / `firstAvailableThatAddressesMaterialDeviationOrNone` and INV-01. | The first draft invented all three; revision 2 claims to have removed them. |
| `REQ-CONFIG-004` | Does `AC-CONFIG-004-01` observe anything, or does it still assert a difference in values it just constructed? Does it claim coverage of provider timeouts/scopes? | The first draft's witness read no configuration at all. |
| `REQ-NAV-005` | Does the contract restate the requirement, or does it re-introduce an unratified "pinned frame vocabulary"? | Same class. |
| `REQ-STACK-002` | Is the prohibition (`MUST NOT`) restored in polarity, subject and strength? | It was inverted once its subject was restored. |
| `REQ-RES-004`, `REQ-STACK-013`, `REQ-WORLD-008`, `REQ-NAV-003`, `REQ-STACK-009` | Is `MAY` still a permission, or quietly an absolute observation? | All six were `MAY → absolute`. |
| `REQ-UX-009` | Is the `SHOULD` still soft? | See R4. |

```bash
python3 scripts/check-witness-claims.py; echo "exit=$?"
python3 scripts/measure-contract-modals.py --ledger .agents/candidates/horizon/T04-CR-001/ledger.yaml; echo "exit=$?"
python3 scripts/measure-contract-modals.py --ledger requirements/ledger.yaml --baseline scripts/witness-claims-baseline.txt
```

The builder claims 72 contracts changed, ten of them deliberately and the rest generic ones that
gained back their subject; and that the candidate has **zero** changed contracts which lose a modal
their requirement carries, while the active frozen ledger has **ten**. Confirm the 72 yourself, and
test the instrument rather than only its output: feed `measure-contract-modals.py` and
`check-witness-claims.py` a ledger you deliberately corrupt (one `MAY`→`MUST`, one `MUST NOT`→`MUST`)
and confirm both fire. A checker that stays silent on your own injection is the finding.

**RULING R1:** `accept` | `accept_with_S3_findings` | `revise_again`. If `revise_again`, list each
contract that must change and why.

### R2 — Criticism round 1

`.agents/evidence/horizon/T04/criticism-round1.md` was written by the builder. Judge it as a
document, not as authority:

- Are C1–C5 (the four defects plus the self-found incompleteness) real defects, or does the file
  overstate or understate what it found?
- Is each correction it claims **actually** in the candidate, or is the record ahead of the code?
- Did the corrections stay inside the ruler, or did they substitute one invention for another —
  in particular does `evaluateDeviation` now follow the spec's algorithm or merely a different
  invented rule?
- Was the same class forgotten anywhere? Search every contract, not just the ten changed.

**RULING R2:** is criticism round 1 an accurate and complete account of the candidate's defects?

### R3 — The D-020 baseline

`scripts/witness-claims-baseline.txt` suppresses findings so inherited defects do not fail a gate
while a new one does. Counts, verified against the current file: **11** `check-witness-claims`
lines (9 distinct findings — `REQ-CASE-003` and `REQ-NAV-002` appear under both ledger paths) and
**14** `check-modals` entries (the modal losses, which overlap the first set). The builder's claim
is that no suppressed finding sits on a requirement whose contract this revision changes, so
suppressing them cannot hide new policy.

- Verify that claim yourself. The candidate changes **72 contracts**; list the requirements they
  touch and intersect that set with every requirement named in the baseline. The claim is false if
  the intersection is non-empty — note that `REQ-CASE-003`'s candidate contract *is* repaired
  ("should settle now"), so inspect whether its baseline entry is honest bookkeeping or a mask.
- Four baselined entries are claimed to be **real modal losses in the active ledger**:
  `REQ-NAV-002` (drops `exactly`), `REQ-RES-001` (loses a prohibition), `REQ-STACK-011` (loses
  `only`), `REQ-STACK-014` (loses a prohibition). All four are absent from the candidate's 72
  changed contracts — that is the builder's justification for not fixing them. **Adjudicate each
  of the four as DEFECT or ACCEPTABLE-DIFFERENCE.** This ruling has a named consequence in §9, so
  state it explicitly.
- Is a baseline the right instrument at all, or should the active ledger's defects fail a gate
  until the candidate is applied?

**RULING R3:** for each of the four, `DEFECT` or `ACCEPTABLE-DIFFERENCE`, plus a claim on whether
the baseline hides anything.

### R4 — Review question 9: `REQ-UX-009`

The candidate contract reads "Read-only navigation interactions *should be observed to respond*
within 300 ms p95 …". The owner has decided that this soft `SHOULD` shape is **kept** for now and
that any change is an open question for the next spec version; the spec is **not** amended in this
round and must not be.

So the question is narrow: is "should be observed to respond" a **faithful** rendering of a
`SHOULD`, or does it smuggle a requirement into an observation? If you judge it unfaithful, say
what a faithful `SHOULD` contract would look like — as an open question, not as an instruction to
edit the spec.

**RULING R4:** `faithful_SHOULD` | `unfaithful_but_not_blocking` | `blocking`.

### Recommended reading order

1. This file, §1–§3.
2. `.agents/candidates/horizon/T04-CR-001/REVIEW.md` — the builder's itemised diff: a verbatim table
   for the three witness-bound contracts and all 72 changed contracts against the frozen ledger.
   Treat every row as a claim; the underlying YAML is the evidence.
3. `.agents/evidence/horizon/T04/criticism-round1.md` (R2).
4. `.agents/DEBT.md` D-016 … D-021.
5. `verdicts/codex-root-20261019-7b4d110.md`, to check that nothing it found is still present.


## 3. The four items the owner specifically required



## 4. Re-run the gates

A single recording script exists. It asserts nothing beyond propagating a non-zero exit:

```bash
cd /home/sprime01/projects/Horizon
bash .agents/evidence/horizon/T04/run-gates.sh; echo "run-gates exit=$?"
```

This writes `just-<target>.log` beside itself. It requires `just`, `bun` (1.4.0), `uv` 0.12.1
for the research pytest gate, and DomainForge 0.21.1 at
`../domainforge/target/release/domainforge` or via `DOMAINFORGE_BIN`.

**Run the targets individually too.** Do not accept the loop's summary as your evidence:

```bash
just check; just boundaries; just test; just ledger; just wayfinder; just teeth; just verify; just gate-t04
```

Settle these mechanical questions and record the exact outputs:

1. Does `just test` run the research pytest suite, or skip it? (PE-07 claims it does not skip.)
2. Do any targets return green while performing no assertions?
3. `just verify` depends on `check boundaries test ledger wayfinder` — it does **not** depend on
   `teeth`. Is that a gap in what `verify` means?
4. Does `gate-t04` actually cover the PE/NE items below, or only a subset?

## 5. Criteria you must adjudicate

For each item give **PASS**, **FAIL**, or **UNVERIFIABLE**, one sentence of justification, and the
command or file you relied on. Quote from the preregistration, not from the builder's summary.

### Positive expectations (`.agents/prereg/horizon/T04.prereg.yaml`)

- **PE-01** Ledger has non-placeholder semantic bindings, acceptance contracts naming observable
  outcomes, real freeze digests, **and independent criticism verdicts recorded before the freeze**;
  Wayfinder cross-references every requirement exactly.
- **PE-02** `cognate create` (0.6.1) starter with reproducible dependency closure; boots a real
  Cognate runtime over SQLite, not an in-memory substitute.
- **PE-03** Semantic adapter loads canonical `.sea`, reports pinned `world_ref` and projected
  object counts, fails closed on mismatched/missing world.
- **PE-04** Structural E2E drives source world → typed frame/intent → Cognate run →
  projection/health, identifying `world_ref`, checkpoint and correlation.
- **PE-05** `local_operator` binds loopback only, derives operator identity from OS session, keeps
  agent principals distinct, generates per-launch secrets with restrictive permissions, refuses
  `shared_remote` without an identity provider.
- **PE-06** Python research subsystem: own uv project, lock file, typed process contract, pytest
  invoked by `just test`; no ML logic claimed.
- **PE-07** `just check`, `boundaries`, `verify`, `gate-t04` exist and pass; `just test` does not
  skip the research gate.
- **PE-08** Topology record names component units, one-way dependencies, adapter seams, frozen
  boundaries, open behavior; copies no other product's truth engine.

### Negative expectations (attacks)

- **NE-01** Remove required Cognate dependency → boundary check fails closed, names the package.
- **NE-02** Configure in-memory store under `local_operator` → runtime rejects it; E2E does not
  quietly pass.
- **NE-03** Create `product-model/` as a competing canonical store → boundary check rejects it.
- **NE-04** Add a second `.sea` authority → boundary check rejects it.
- **NE-05** False `world_ref` or deleted canonical model → adapter fails closed, no success result.

Re-run the NE arms yourself; do not trust `scripts/teeth.ts`. `just teeth` currently runs
`scripts/teeth.ts`, `scripts/teeth-ledger-freeze.sh` and `scripts/teeth-domainforge-gate.py`.

### The preregistered falsifier

> Remove the required Cognate project dependency or load a fake in-memory runtime and the
> structural E2E still passes; or accept a copy of Product Actualizer's process source as
> canonical Horizon world state.

Do your best to make this happen. If the E2E passes under a fake runtime, T04's claim is falsified
regardless of every other result.

## 6. Known weaknesses placed in your scope

Disclosed by the builder because the ledger freezes at T04, so a defect now is cheap and a defect
later costs a re-freeze. These are **not** pre-adjudicated; you decide.

### W1 — PE-01's ordering condition was missed

Verdicts were **not** recorded before the freeze. The freeze happened at `2026-10-19T23:26:47Z`;
this review is post-hoc. The owner ruled on 2026-10-19 that post-freeze criticism stands in for the
preregistered order (`.agents/reports/horizon-decisions.yaml`, `DEC-T04-01`), that PE-01 is not
restated, and that a material finding in a frozen artifact becomes a candidate revision and a
re-freeze.

**Adjudicate:** PE-01 as written is **unmet**. State whether that is a material defect in a frozen
artifact (→ re-freeze required) or an acceptable recorded deviation. Note your own weakness here:
you can see that the freeze already happened, so you cannot police it prospectively.

### W2 — 72 of 98 acceptance contracts may not be falsifiable

The builder claims 72 of 98 `acceptance_contracts[].expected` values are the generic
`Observed in the runtime's own terms: ...` restatement produced by
`scripts/gen-requirement-ledger.py:141`. A restatement of a requirement is not automatically an
observation. As a control on your own method: the apostrophe is YAML-escaped, so a plain
`grep "runtime's own terms" requirements/ledger.yaml` returns **zero** and will mislead you. Use:

```bash
python3 -c "
import yaml
d=yaml.safe_load(open('requirements/ledger.yaml'))
ac=d['acceptance_contracts']
g=[c['id'] for c in ac if 'own terms' in str(c.get('expected',''))]
print(f'{len(g)} of {len(ac)}')
print('\n'.join(g))
"
```

**Answer concretely: which of the 98 are NOT falsifiable as written, and why does that specific
wording fail?** Group them; you need the full list and a rule per group (e.g. "no observable
difference from a system that does nothing", "names no actor/state/transition", "the
`gate_command` does not exercise the claim"). If you judge the generic form acceptable because
`gate_command` carries the real proof, say so and explain what makes that sufficient — several of
those gates are unimplemented at T04, which bears on the answer.

### W3 — the DomainForge "0 violations" gate is demonstrably blind

The builder ran a vivisection, recorded as **D-011 (continued)** in `.agents/DEBT.md` and
`DEC-T04-02`, with tooth `scripts/teeth-domainforge-gate.py`. Two injections were accepted at
exit 0:

- `requirement_ref: "REQ-INT-003"` → `"REQ-DOES-NOT-EXIST-999"` — still `0 violations`, exit 0.
- `invariant_id: "INV-08"` relabelled `"INV-07"` (duplicate id) — still `0 violations`, exit 0.

A control injection (instance retyped to an undefined entity) fails at exit 1, so the gate is not
wholly vacuous — it resolves symbols. This matters because the T04 pin revision was itself caused
by a wrong `requirement_ref` (INV-08 bound to `REQ-NAV-001`): the gate cited as verifying that fix
cannot see that class of defect.

**Adjudicate:** is `0 violations` still cited anywhere as integrity evidence — in `SUMMARY.md`,
`scaffold.log`, any log, the plan, or the preregistration? `pin_revision.verified_by` is in the
**frozen** preregistration and *does* cite it as verification. Decide whether that is a material
finding. Verify the tooth is not itself vacuous:

```bash
python3 scripts/teeth-domainforge-gate.py; echo "exit=$?"   # expect exit 0, both blind spots printed
git diff --stat .sea/                                       # expect empty: the tooth must not touch the tree
```

Do your best to make this happen. If the E2E passes under a fake runtime, T04's claim is falsified
regardless of every other result.

## 7. Questions you must answer

Number your answers to match. "Unverifiable" is acceptable if you say what would make it
verifiable.

1. Did `run-gates.sh` exit 0 on a clean checkout, and did each target run individually? Paste the
   per-target exits.
2. Did any gate return green without asserting anything? Name it.
3. PE-01: verdict, and whether it requires a re-freeze.
4. W2: which acceptance contracts are not falsifiable as written — the list and your grouping rule.
5. W3: is "0 violations" cited as integrity evidence anywhere it should not be; does the tooth
   demonstrate a real blind spot; is `pin_revision.verified_by` a material finding?
6. Is the fragment-digest freeze scheme sound as an argument, or does it inherit the trust it
   claims to establish?
7. Do the NE-01..NE-05 attacks actually block when you perform them yourself?
8. Did `SUMMARY.md` overclaim anywhere relative to what you observed? Quote the claim and the
   contradicting observation. Do not assume the builder was honest merely because the disclosures
   above look candid.
9. Is the `world_ref` re-pin (`b0f31fcc…` → `6c18d6a6…`) justified, or does it silently promote an
   alternate world? The rationale is `pin_revision.reason` and `DEC-T04-*`.
10. Does anything in the scaffold copy another product's truth engine (Product Actualizer's
    Product Model, router, authority) rather than only surface vocabulary?
11. Anything material the builder did not disclose. Look specifically for: hidden skips, `|| true`,
    swallowed errors, tests asserting on mocks that stand in for the external boundary, and
    evidence files hand-written rather than captured. Note that `scaffold.log` is explicitly
    labelled reconstructed because the original `cognate create` output was lost — judge whether
    that is disclosed adequately and whether anything in it is unverifiable as a result.

## 8. Where verdicts go

Write your verdict to `.agents/evidence/horizon/T04/verdicts/<reviewer-id>.md`.

`<reviewer-id>` is your session or agent identifier — anything that distinguishes you from the
builder and from other reviewers. Do not write into the `T04/` root and do not overwrite another
reviewer's file. Use this header:

```yaml
---
reviewer: <id>
date: <YYYY-MM-DD>
commit: 7a248ea
independent_of_builder: true
verdict: pass | pass_with_findings | fail
candidate_revision_reviewed: 2
---
```

```markdown
## Per-criterion
PE-01..PE-08, NE-01..NE-05: PASS | FAIL | UNVERIFIABLE + one line each

## Rulings
R1: accept | accept_with_S3_findings | revise_again   (+ contracts to change, if revise_again)
R2: accurate_and_complete | incomplete | overstated     (+ what it missed)
R3: REQ-NAV-002=… REQ-RES-001=… REQ-STACK-011=… REQ-STACK-014=…   each DEFECT | ACCEPTABLE-DIFFERENCE
R4: faithful_SHOULD | unfaithful_but_not_blocking | blocking

## Findings
Each: severity S1 | S2 | S3, what is wrong, where (file:line), why it matters, and
whether it demands a re-freeze.

## Answers
Numbered to match §7.

## Scope limits
What you could not check, and why.
```

**Rules for the verdict:**

- One line per criterion is enough; do not pad.
- A finding against a **frozen** artifact must say explicitly **candidate revision / re-freeze
  required: yes|no**. It is never waived.
- If a command fails for environmental reasons (no DomainForge, no network), record it as a scope
  limit and still adjudicate what you can.
- Do not fix anything and do not mark T04 settled. The builder records settlement; you supply the
  verdict.

## 9. What the owner has committed to do with your verdict

Stated here so you can judge the consequence of each ruling. None of this is a waiver: a finding
is either fixed or the candidate is withdrawn.

| If your verdict contains | Then the builder will |
| --- | --- |
| no **S1** and no **S2** findings | apply the candidate, regenerate the ledger and Wayfinder, run `freeze-formation.sh`, record the new freeze id and hashes, and append status — **without further owner approval** |
| `REQ-NAV-002`, `REQ-RES-001`, `REQ-STACK-011` or `REQ-STACK-014` ruled `DEFECT` | fold the fix into the candidate as **revision 3** *before* freezing, then have revision 3 reviewed. A known-wrong contract is not frozen. |
| anything else material (S1/S2, or a `revise_again` ruling) | revise and resubmit; no freeze |
| `S3`/advisory findings only | freeze as authorized, and record the S3 items as DEBT |

`REQ-UX-009` is already decided: the `SHOULD` shape stays for this round and becomes an open
question for the next spec version (`OQ-001` in `.agents/reports/horizon-decisions.yaml`). Your
R4 ruling is recorded but does not by itself block the freeze unless you call it `blocking`.

T04 settles only when this verdict **and** `DEC-T04-05`'s condition are both satisfied. Until
then the frozen ledger keeps its four inverted prohibitions and no inverted prohibition is
recorded as accepted risk.


**Rules for the verdict:**

- One line per criterion is enough; do not pad.
- A finding against a **frozen** artifact must say explicitly **candidate revision / re-freeze
  required: yes|no**. It is never waived.
- If a command fails for environmental reasons (missing DomainForge, no network), record it as a
  scope limit and still adjudicate what you can.
- Do not fix anything and do not mark T04 settled. The builder records settlement; you supply the
  verdict.

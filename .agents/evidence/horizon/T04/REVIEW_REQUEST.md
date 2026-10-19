# T04 Independent Review Request (adversarial)

> **You are the independent verifier.** You have no access to the builder's context,
> reasoning or chat history. That is the point: the builder's claims below are *claims*,
> not findings. Your job is to try to falsify them. If you cannot falsify a claim, say so
> plainly. If you can, that is the most valuable thing you can produce.
>
> Do not repair anything. Do not edit `requirements/ledger.yaml`, `.wayfinder/answer-key.md`,
> the `.sea` model, or any frozen artifact. Report only.

## 1. What you are reviewing

| | |
|---|---|
| Repository | `GodSpeedAI/Horizon` (local: `/home/sprime01/projects/Horizon`) |
| Commit under review | **`7b4d110`** — `t04: scaffold walking skeleton, freeze ledger and wayfinder` |
| Post-freeze debt commit | `d80cdd5` — `chore: record observed debt d-011 d-012` (not under review) |
| Later commits | Any commit after `d80cdd5` that adds this request and a DomainForge tooth; review those **only** as "does the tooth actually work" (Q5). Frozen artifacts must be unchanged. |
| Task | T04 — Project Topology Architect walking skeleton with Cognate and selective Product Actualizer reuse |
| Preregistration | `.agents/prereg/horizon/T04.prereg.yaml` (sha256 `9c434b404a948971e3bca27a06eef670ab790e1f6bfc5c7ffd0847662a06a03e`) — **frozen and MUST NOT be edited**; it is the oracle you argue against |

Verify the commit is what you think it is before starting:

```bash
cd /home/sprime01/projects/Horizon
git log --oneline -4
git status --porcelain          # expect clean, or only untracked review scaffolding
git rev-parse 7b4d110
```

## 2. Frozen artifacts under scrutiny

| Path | sha256 | Authority |
|---|---|---|
| `requirements/ledger.yaml` | `c7afbcc60f9cd197ddef60941e19bd6cc9cfc00584c5703a6e6fa07e364e7417` | requirement ledger: 98 requirements + 98 acceptance contracts |
| `.wayfinder/answer-key.md` | `f00b060d4f27a1dc727ad34a50b099efa881a665e7c4ba308c2429b22ec05eb2` | Wayfinder; its `hashes:` block is authoritative for whole-file digests |
| `.agents/specs/horizon.agent.spec.yaml` | `75cfc1ceb9eec6139f7b8e73f8d1107fcc5e2b680e80683824edd7d8de434130` | normative ruler (approved, frozen 1.0.0) |
| `.sea/interaction/interaction-model.sea` | `1c3909e51c509b60634dc5f4dba7dc29c3c58bc883a0134cf2861ac23bb1eec1` | canonical semantic model |
| Pinned `world_ref` | `world:horizon@sha256:6c18d6a608bd9d83e6aa354d5a8cc804009ca208562021c1736ee429412309f0` | immutable semantic identity |

Confirm the recorded hashes match reality before evaluating anything — if they do not, stop and
report that as a blocker:

```bash
sha256sum requirements/ledger.yaml .wayfinder/answer-key.md .agents/specs/horizon.agent.spec.yaml .sea/interaction/interaction-model.sea
grep -A4 '^hashes:' .wayfinder/answer-key.md
```

The ledger cannot contain its own whole-file sha256, so its `freeze_hash` is a **fragment
digest** computed with the marker normalised to the literal string `candidate`. The Wayfinder
`hashes:` block carries the whole-file digest. `scripts/check-ledger-freeze.sh` is supposed to
verify both and their mutual agreement. **Check that this argument is sound, not merely that
the script exits 0.** A digest scheme that verifies itself against a value it also produced is
not a proof.

## 3. Re-run the gates

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

## 4. Criteria you must adjudicate

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

## 5. Known weaknesses placed in your scope

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

## 6. Questions you must answer

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

## 7. Where verdicts go

Write your verdict to `.agents/evidence/horizon/T04/verdicts/<reviewer-id>.md`.

`<reviewer-id>` is your session or agent identifier — anything that distinguishes you from the
builder and from other reviewers. Do not write into the `T04/` root and do not overwrite another
reviewer's file. Use this header:

```yaml
---
reviewer: <id>
date: <YYYY-MM-DD>
commit: 7b4d110
independent_of_builder: true
verdict: pass | pass_with_findings | fail
---

## Per-criterion
PE-01..PE-08, NE-01..NE-05: PASS | FAIL | UNVERIFIABLE + one line each

## Answers
1..11

## Material findings
Each: what is wrong, where (file:line), why it matters, and whether it demands a re-freeze.

## Scope limits
What you could not check, and why.
```

**Rules for the verdict:**

- One line per criterion is enough; do not pad.
- A finding against a **frozen** artifact must say explicitly **candidate revision / re-freeze
  required: yes|no**. It is never waived.
- If a command fails for environmental reasons (missing DomainForge, no network), record it as a
  scope limit and still adjudicate what you can.
- Do not fix anything and do not mark T04 settled. The builder records settlement; you supply the
  verdict.

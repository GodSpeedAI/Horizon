# T05 — one grammar, one binder, one reducer, one projection

**Settled 2026-10-20**, subject to the two corrections below. Neither is open work; both are
closed by this revision and recorded so the settlement is auditable rather than asserted.

- **PE-08 was refuted and re-earned.** The first `NOTICE` stated that Horizon declares no
  license. That was false: `origin/main` carried `LICENSE` (Apache-2.0, `4702ada`) while the
  local clone sat one commit behind, and no gate fetches, so a stale-tree absence was recorded
  as a repository fact (D-026 refuted; D-028, D-029 recorded). The licence claim is now checked
  structurally — the SPDX id in `package.json` must be the id the `NOTICE` header names, backed
  by a real `LICENSE` — with teeth NE-B14–NE-B16. PE-08 stays a pass because it is now
  demonstrated, not because the earlier evidence stands. DEC-T05-07 supersedes DEC-T05-04's
  licence finding.
- **The NE→test map had drifted.** Ten tests were labelled NE-01…NE-10, but only NE-02's label
  was wrong at the start of this correction: the test named `NE-02` asserted provenance
  laundering, not the preregistered `iframe` / `jsx` / `onclick` attack, which was covered only
  by accident (an unused variable in NE-06). Every other label matched its prereg attack text,
  and five IDs (NE-01, NE-02, NE-06, NE-08, NE-10) each collapsed several attacks into one test.
  `just gate-t05` proves the property held on the whole; nothing here was a live vulnerability.
  The prereg-literal attacks are now asserted, and
  `scripts/check-t05-prereg-coverage.ts` fails if a test stops naming the attack the prereg
  states.

Prereg: `.agents/prereg/horizon/T05.prereg.yaml`
(sha256 `ff36d65b578531687f8165950ba38c438dd98a71671c230d59ae48d02bd73019`), frozen before
implementation.

## What is now true

- `horizon.surface/2` is declared once, in `src/ui/surface2/grammar.ts`, and published
  (`publishSurfaceSchema()`) for consumers that need it as data.
- Binding, reduction and projection live only in `src/ui/surface2/`. `src/ui/surface.ts` is
  the single frame → transport seam; routes read its projection.
- GUI (`GET /surface`), CLI (`horizon surface`, `horizon act`) and MCP (`horizon mcp`) all
  resolve and commit through the same `surfaceFor()` / `commitSurfaceIntent()` seam, so a
  transport cannot mean something the others do not.

## Preregistered expectations

| ID | Verdict | Evidence |
| --- | --- | --- |
| PE-01 | pass | Schema published once; a second declaration outside the authority is caught by `check-t05` NE-B1. Invented role refused 409 (`teeth-t05-equivalence`). Test `PE-01 NE-06` names it, checked by `check-t05-prereg-coverage`. |
| PE-02 | pass | NE-02/NE-04/NE-07: an agent-supplied value cannot be bound as an authority fact (`bound values MUST NOT use an agent: source`); every typed source (`horizon:` / `semantic:` / `file:` / `agent:`) resolves to a value plus observation or to a non-bound status. |
| PE-03 | pass | NE-05/NE-03/NE-04: agent layout authority is downgraded to `agent_proposed`; the reducer is `(state, op) -> {state, result}` and byte-stable across runs; human-authority ops are refused for the agent role. |
| PE-04 | pass | GUI `text/plain` body is **byte-identical** to CLI `surface` output, compared as two live processes; GUI json is one `horizon.gui-view/1` inside a `horizon.surface/2` frame. |
| PE-05 | pass | NE-01/NE-10: markup rejected at grammar, escaped at render, anchors carry only `data-*`; every node carries `ActorAttribution` with `on_behalf_of_ref` for an agent (carried through into `horizon.gui-view/1` and printed as `agent:<ref> acting for <human>` by both renderers); no surface attributed to an unattributable observer. |
| PE-06 | pass | MCP publishes 11 operation tools + 1 view tool, derived from `HORIZON_OPERATIONS`; unoffered intents refused 409 on GUI and MCP, exit 1 on CLI. |
| PE-07 | pass | `just gate-t05` and `just verify` both exit 0 (logs retained). |
| PE-08 | **pass** (re-run 2026-10-20) | `docs/donors.md` records T05 reuse and no donor module is imported (`grep product-actualizer src/` → 0). A root `NOTICE` now records each donor's name, license, pinned source commit or package version and what was borrowed, and `docs/donors.md` links to it; `check-t05-boundaries` fails if either list drops a donor or a section lacks License/Source/Borrowed (three attacks bite). Was partial until the owner ruling (DEC-T05-04) authorized the file; see D-022. |


## Negative evidence (NE-01…NE-10)

`test/surface-negative.test.ts`, 12/12, plus `teeth-t05-equivalence` for the route-level halves.
NE-03 of the reducer work found a real gap, not a test bug: a placement claimed as `human` by
an `agent` attribution now caps at `agent_proposed` (`downgrade(placement, role, attributedTo)`).

**The NE→test map was restructured in the settlement correction** (see the note at the top).
What the rewrite added, beyond the `NE-02` relabel:

- `NE-03` had no test at all — the preregistered attack (an unoffered or non-union operation,
  and an agent offering a consequential op) is now asserted, including the grammar's
  `an agent MUST NOT present a consequential operation as its own action` refusal.
- `NE-04` was labelled onto a *different* test (human-authority ops). Unsafe source
  expressions are now asserted directly: `javascript:`, `file:` traversal, an over-long
  source, and an unknown `horizon:` source.
- `NE-05` was likewise labelled onto the markup test. `view.move` / `view.pin` / `surface.put`
  / `human.approve` are now refused with a typed code.
- `NE-10` had no `<img onerror=...>` assertion; it now has its own test, in both renderers,
  plus a live `/surface` check for `onerror=` / `onclick=` / `javascript:` in the served bytes.
- `PE-05` was **not** satisfiable as written: `projectSurface` dropped `agent_ref`,
  `on_behalf_of_ref` and `principal_ref`, so an agent view could not be rendered as acting for
  a human. The projection now carries them and both renderers print the delegation. This is a
  source change inside T05's own authority (`src/ui/surface2/`), not a re-design.

One status nuance found while writing `NE-04`, worth recording rather than smoothing over: an
unknown `horizon:` source resolves to `blocked` (awaiting `TA-T06/T07`), not `refused`, because
`bindingContextOf` declares that namespace pending. `blocked` still carries no value, so the
property holds; the test asserts the honest status and that clearing the pending declaration
turns it into `not_found`.

## Commands and outcome

```
just gate-t05   -> exit 0   (.agents/evidence/horizon/T05/gate-t05.log)
just verify     -> exit 0   (.agents/evidence/horizon/T05/just-verify.log)
bun test        -> 26 pass / 0 fail, 5 files
teeth-t05-boundaries   -> ok (21 checks, incl. NE-B14..NE-B16 licence teeth)
teeth-t05-equivalence  -> ok (6 comparisons)
teeth-t05-coverage     -> ok (5 teeth)
check-t05-prereg-coverage -> ok (18 expectations, each named by a test that names its attack)
pytest          -> 4 passed
T05 boundaries  -> ok (30 files)
```

Note: `teeth-t05-equivalence` compares live processes, not mocks. It caught a real divergence
on first run (MCP names fold `.` → `_`), which the comparison now asserts explicitly.

## Remaining unknowns

- Clack and the WebMCP browser transport are not bound at T05 (declared in the prereg).
- The reducer's agent-attribution cap is exercised by unit tests; no end-to-end journey has
  yet driven a conflicting human/agent layout claim (J02 territory, later task). Recorded as
  DEBT D-027 after confirming J02 does not contain the case.
- Horizon's own license is Apache-2.0 (root `LICENSE`). The `NOTICE` states that and points at it.
  An earlier version of this line claimed the opposite (D-026); that was a stale-clone error, corrected
  in D-028, not a repository finding.
- PE-08's `NOTICE` half was unachievable as written; resolved by owner ruling (D-022,
  DEC-T05-04) and re-run in isolation — see `pe08-rerun.log`.

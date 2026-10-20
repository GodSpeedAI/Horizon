# T05 — one grammar, one binder, one reducer, one projection

Settled 2026-10-20. Prereg: `.agents/prereg/horizon/T05.prereg.yaml`
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
| PE-01 | pass | Schema published once; a second declaration outside the authority is caught by `check-t05` NE-B1. Invented role refused 400 (`teeth-t05-equivalence`). |
| PE-02 | pass | NE-02: an agent-supplied value cannot be bound as an authority fact (`bound values MUST NOT use an agent: source`). |
| PE-03 | pass | NE-03/NE-04: agent layout authority is downgraded to `agent_proposed`; human-authority ops are refused for the agent role. |
| PE-04 | pass | GUI `text/plain` body is **byte-identical** to CLI `surface` output, compared as two live processes; GUI json is one `horizon.gui-view/1` inside a `horizon.surface/2` frame. |
| PE-05 | pass | NE-01/NE-10: markup rejected at grammar, escaped at render, anchors carry only `data-*`; no surface attributed to an unattributable observer. |
| PE-06 | pass | MCP publishes 11 operation tools + 1 view tool, derived from `HORIZON_OPERATIONS`; unoffered intents refused 409 on GUI and MCP, exit 1 on CLI. |
| PE-07 | pass | `just gate-t05` and `just verify` both exit 0 (logs retained). |
| PE-08 | **pass** (re-run 2026-10-20) | `docs/donors.md` records T05 reuse and no donor module is imported (`grep product-actualizer src/` → 0). A root `NOTICE` now records each donor's name, license, pinned source commit or package version and what was borrowed, and `docs/donors.md` links to it; `check-t05-boundaries` fails if either list drops a donor or a section lacks License/Source/Borrowed (three attacks bite). Was partial until the owner ruling (DEC-T05-04) authorized the file; see D-022. |


## Negative evidence (NE-01…NE-10)

`test/surface-negative.test.ts`, 10/10. NE-03 found a real reducer gap, not a test bug: a
placement claimed as `human` by an `agent` attribution now caps at `agent_proposed`
(`downgrade(placement, role, attributedTo)`).

## Commands and outcome

```
just gate-t05   -> exit 0   (.agents/evidence/horizon/T05/gate-t05.log)
just verify     -> exit 0   (.agents/evidence/horizon/T05/just-verify.log)
bun test        -> 24 pass / 0 fail / 197 expect() calls, 5 files
teeth-t05-boundaries  -> ok (14 checks)
teeth-t05-equivalence -> ok (5 comparisons)
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
- Horizon declares no license of its own (D-026). The `NOTICE` header states that absence
  rather than implying a grant.
- PE-08's `NOTICE` half was unachievable as written; resolved by owner ruling (D-022,
  DEC-T05-04) and re-run in isolation — see `pe08-rerun.log`.

# Horizon Current Status

**Revision:** 16 · **Recorded:** 2026-10-20 · **Stage:** T05 settled (P2); next task **T06**

**T05 — one surface, three transports.** `horizon.surface/2` is declared once
(`src/ui/surface2/grammar.ts`), with one binder, one reducer and one shared
`horizon.gui-view/1` projection. GUI (`GET /surface`), CLI (`horizon surface` / `horizon act`)
and MCP (`horizon mcp`) all resolve and commit through `src/ui/surface.ts`, so no transport can
mean something the others do not.

- **A real defect was fixed, not a test.** NE-03 caught a reducer gap: a placement attributed to
  an `agent` could still be reported as human-authored layout. `downgrade(placement, role,
  attributedTo)` now caps it at `agent_proposed` (DEC-T05-02).
- **Equivalence is proven live, not by mock.** `scripts/teeth-t05-equivalence.ts` starts the
  real server and runs the real CLI, demanding a byte-identical text body. On first run it
  caught a genuine divergence: MCP folds `.` → `_` in tool names (D-024).
- **The observer principal** is `os:<user>:<uid>` accepted as an authenticated human, rather
  than a fabricated `actor:` prefix (DEC-T05-01).

**Verified:**

| Command | Result |
| --- | --- |
| `just gate-t05` | exit 0 |
| `just verify` | exit 0 |
| `bun test` | 24 pass / 0 fail, 197 expect() calls |
| `teeth-t05-boundaries` | ok (14 checks) |
| `teeth-t05-equivalence` | ok (5 comparisons) |
| `check-t05-boundaries` | ok (30 files) |
| `pytest` | 4 passed |

**Prereg:** `T05.prereg.yaml` sha256 `ff36d65b…`, frozen before implementation.

**Frozen pins (unchanged):**

| Artifact | SHA-256 |
| --- | --- |
| Spec 1.0.1 | `14a42936…` |
| Ledger | `68974521…` |
| Wayfinder | `3a28ed7d…` |

**Open:**
- **PE-08 is PARTIAL.** It names `docs/donors.md` *and* `NOTICE`; `docs/donors.md` is updated and
  no donor module is imported, but no `NOTICE` file exists (D-022). Because PE-08 is frozen,
  closing it needs an owner ruling.
- New debt observed, not fixed: D-022 (`NOTICE`), D-023 (CLI and server contend for one SQLite
  store), D-024 (MCP tool names fold operation ids), D-025 (`horizon.view` copies the role
  vocabulary).
- Earlier: `REQ-CASE-002` and `REQ-NAV-005` unwitnessed until T07; D-019 provider controls;
  D-020 `REQ-RES-001` lexical baseline.
- Not bound at T05 (declared in the prereg): Clack and the WebMCP browser transport.

**Next:** T06 — build the operational object layer: typed object-set and relationship
projections on Cognate (depends on T04).

**Spec:** HORIZON-001 v1.0.1, frozen; SHA-256 `14a42936fe3a17c3726ee57fbc9278fd6f6e92276f67519fd9bf0f605f3324a4`.

**Evidence:** [T05 summary](evidence/horizon/T05/SUMMARY.md), [prereg](prereg/horizon/T05.prereg.yaml), [spec](specs/horizon.agent.spec.yaml), [plan](plans/horizon.plan.yaml), [decisions](reports/horizon-decisions.yaml), [ledger](../requirements/ledger.yaml), [wayfinder](../.wayfinder/answer-key.md), [debt](DEBT.md).

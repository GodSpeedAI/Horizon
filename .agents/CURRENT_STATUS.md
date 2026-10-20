# Horizon Current Status

**Revision:** 18 · **Recorded:** 2026-10-20 · **Stage:** T05 settled (P2), PE-08 pass; next task **T06**

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

**PE-08 closed by owner ruling (DEC-T05-04).** Plan rule `horizon.plan.yaml:77` makes a `NOTICE`
entry an expected output of copying donor material, so the owner authorized authoring it rather
than amending frozen PE-08. The root `NOTICE` records, for each donor in `docs/donors.md`, the
name, license, pinned source commit or package version and what was borrowed; `docs/donors.md`
links back to it. Two hand-maintained lists drift, so `check-t05-boundaries` now fails on any
disagreement and four new teeth (NE-B10–NE-B13) prove it bites. PE-08 was re-run in isolation:
**pass**. D-022 is closed.

**D-023 does not reproduce.** Six concurrent processes against one `HORIZON_STORE` all exited 0;
the pinned `cognate-store-sqlite` 0.6.1 already sets `busy_timeout`. Reclassified latent — it
does not block T06 or T07 — with the residual opening-burst window recorded rather than closed
(DEC-T05-06).

**License correction (D-028).** The `NOTICE` first stated that Horizon declares no license. That
was false: `origin/main` already carried `LICENSE` (Apache-2.0, commit `4702ada`) and the local
clone was one commit behind, so a stale-clone absence was recorded as a repository fact. After
merging `origin/main`, `NOTICE` states Apache-2.0 and `package.json` carries `license`.
`check-t05-boundaries` now proves agreement structurally — the SPDX id `package.json` declares must
be the one the `NOTICE` header names, backed by a real `LICENSE` — and teeth NE-B14–NE-B16 show it
bites. DEC-T05-07 supersedes the incorrect part of DEC-T05-04.

**Verified:**

| Command | Result |
| --- | --- |
| `just gate-t05` | exit 0 (`gate-t05: ok — horizon.surface/2 + horizon.gui-view/1 verified across GUI/CLI/MCP`) |
| `just verify` | exit 0 (`verify: ok`) |
| `bun test` | 24 pass / 0 fail, 197 expect() calls |
| `teeth-t05-boundaries` | ok (21 checks, incl. NE-B10–NE-B16) |
| `teeth-t05-equivalence` | ok (5 comparisons) |
| `check-t05-boundaries` | ok (30 files) |
| `pytest` | 4 passed |
| `sha256sum -c T05/SHA256SUMS` | summary, PE-08 re-run log, frozen prereg all OK |

**Prereg:** `T05.prereg.yaml` sha256 `ff36d65b…`, frozen before implementation and unedited.

**Frozen pins (unchanged):**

| Artifact | SHA-256 |
| --- | --- |
| Spec 1.0.1 | `14a42936…` |
| Ledger | `68974521…` |
| Wayfinder | `3a28ed7d…` |

**Open:**
- **D-027:** the agent attribution cap is unit-proven only. J02 contains no conflicting
  human/agent layout claim, so the end-to-end case is not merely unexercised — it is not
  planned. Recorded so it is not lost.
- **D-028/D-029:** D-026 was refuted (the license exists; the clone was stale). What remains is
  that no gate fetches, so a green gate can describe a tree behind `origin/main`.
- **D-024** (MCP tool names fold operation ids) and **D-025** (`horizon.view` copies the role
  vocabulary) remain open, both size S.
- **D-023** latent: the opening-burst window before `busy_timeout` is armed was not observed
  failing; hardening belongs upstream in Cognate (REQ-STACK-010).
- Earlier: `REQ-CASE-002` and `REQ-NAV-005` unwitnessed until T07; D-019 provider controls;
  D-020 `REQ-RES-001` lexical baseline.
- Not bound at T05 (declared in the prereg, owner-accepted): Clack and the WebMCP browser
  transport.

**Next:** T06 — build the operational object layer: typed object-set and relationship
projections on Cognate (depends on T04). D-023 does not block it.

**Spec:** HORIZON-001 v1.0.1, frozen; SHA-256 `14a42936fe3a17c3726ee57fbc9278fd6f6e92276f67519fd9bf0f605f3324a4`.

**Evidence:** [T05 summary](evidence/horizon/T05/SUMMARY.md), [PE-08 re-run](evidence/horizon/T05/pe08-rerun.log), [SHA256SUMS](evidence/horizon/T05/SHA256SUMS), [NOTICE](../NOTICE), [LICENSE](../LICENSE), [donors](../docs/donors.md), [prereg](prereg/horizon/T05.prereg.yaml), [spec](specs/horizon.agent.spec.yaml), [plan](plans/horizon.plan.yaml), [decisions](reports/horizon-decisions.yaml), [ledger](../requirements/ledger.yaml), [wayfinder](../.wayfinder/answer-key.md), [debt](DEBT.md).

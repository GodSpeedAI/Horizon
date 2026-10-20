# Horizon Current Status

**Revision:** 20 · **Recorded:** 2026-10-20 · **Stage:** T06 settled (P2) on the Cognate public Projection API; next task **T07**

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

**Settlement corrected (DEC-T05-08).** The owner asked whether T05 was actually settled. The
audit answered no — not about the properties, which held and were gate-green, but about the
evidence. The test named `NE-02` asserted provenance laundering, not the preregistered
`iframe` / `jsx` / `onclick` attack; `NE-03` had no test at all; `NE-04` and `NE-05` were
labelled onto different tests; and `PE-05` could not be satisfied as written, because
`projectSurface` dropped `agent_ref` / `on_behalf_of_ref` / `principal_ref`, so no view could
render an agent as acting for a human. All fixed inside T05's own authority: the prereg-literal
attacks are asserted, `NE-03` and `NE-10` have their own tests, the projection carries the
delegation and both renderers print it, and `check-t05-prereg-coverage` fails if any prereg id
stops being named by a test that names that attack. Its five teeth include the shipped `NE-02`
mislabel, which it reproduces. T05 remains **settled** on that basis.

**Verified:**

| Command | Result |
| --- | --- |
| `just gate-t05` | exit 0 (`gate-t05: ok — horizon.surface/2 + horizon.gui-view/1 verified across GUI/CLI/MCP`) |
| `just verify` | exit 0 (`verify: ok`) |
| `bun test` | 26 pass / 0 fail, 261 expect() calls |
| `check-t05-prereg-coverage` | ok (18 expectations, each named by a test that names its attack) |
| `teeth-t05-coverage` | ok (5 teeth, incl. the shipped NE-02 mislabel) |
| `teeth-t05-boundaries` | ok (21 checks, incl. NE-B10–NE-B16) |
| `teeth-t05-equivalence` | ok (6 comparisons, incl. live `/surface` markup check) |
| `tsc --noEmit` | clean |
| `sha256sum -c T05/SHA256SUMS` | 5/5 OK |

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
- **D-030:** `checkT05Boundaries` keeps findings in module state, so calling it twice in one
  process merges results. The new coverage check hit this and returns a copy instead; the
  boundary check still has the hazard.
- **D-023** latent: the opening-burst window before `busy_timeout` is armed was not observed
  failing; hardening belongs upstream in Cognate (REQ-STACK-010).
- Earlier: `REQ-CASE-002` and `REQ-NAV-005` unwitnessed until T07; D-019 provider controls;
  D-020 `REQ-RES-001` lexical baseline.
- Not bound at T05 (declared in the prereg, owner-accepted): Clack and the WebMCP browser
  transport.

**Next:** T06 — build the operational object layer: typed object-set and relationship
projections on Cognate (depends on T04). Settle the design fork first: **D-002**
(`listRecords` vs the upstream Cognate gap). D-023 and D-030 do not block it.

---

## Revision 20 — T06 settled (operational object layer)

**T06 — the operational object layer.** Objects, links and lineage are folded from durable Cognate
events into `horizon.operational-objects` and read back through the public store API, so
`checkpoint_ref` and rows come from one statement. Built only on
`@godspeedai/cognate-projections` / `cognate-events` (DEC-T05-10); no fork, no patch, no second
object store (REQ-WORLD-006). The pinned 0.6.1 surface was inspected in the installed tree before
any code (`T06/pinned-api-inspection.log`), not taken from skill prose.

- **D-002 settled.** The gap is *query*, not *state*: `readProjectionSnapshot`,
  `listProjection` and `ProjectionRunner.rebuild` already exist. The three genuine upstream gaps —
  no predicate query beyond top-level equality, no traversal, no version-aware query API — are
  reported upstream and **not** worked around with a local query engine.
- **D-023 does not block T06 or T07.** Reclassified latent; `busy_timeout` is supplied by the
  pinned store. Not touched.
- **Five outcomes stay five.** `empty`, `no-match`, `denied`, `blocked` and `unavailable` are
  distinct, and the refusals are built from the request so a denial cannot leak a count
  (NE-01). A blocked connector degrades a readable answer visibly instead of impersonating
  an empty world.
- **Three graphs stay three.** The operational relation vocabulary is Horizon's own; the world's
  semantic import edges are never returned as operational links, and lineage is a separate record
  kind that traversal cannot reach (REQ-WORLD-005).
- **Shape before code.** The T06 prereg was parsed with `check-prereg-shape` *before* any
  implementation existed: 10 positive + 9 negative structural members. The same check re-derives
  the T05 defect (`PE-06..PE-08` inside the folded scalar) and fails it.

**What the evidence found that design review did not:**

1. A **wrong-world write was accepted** — the semantic type was checked against the declared
   world, but the requested world was never compared to it. NE-07 caught it; all three recorders
   now guard it.
2. `SemanticRef` **rejected real dotted namespaces** (`horizon.products.strategist::…`), and the
   projection recorded an *error row* rather than failing. It surfaced later as a dangling link.
3. An **empty projection was reported as `unavailable`**, because Cognate commits no checkpoint
   when it folded no events. Corrected: no checkpoint means `empty`.
4. The **NE-09 determinism test was weaker than its title**: comparing a rebuild cannot detect an
   order-dependent query when the store already returns ordered rows. It now asserts the mechanism
   (answer equals sorted `object_ref`s regardless of row order) and M8 confirms it bites.
5. One mutant was a **no-op** and was replaced rather than counted.

**Proof level: P2, unchanged by the extra green tests.** `teeth-t06-mutation` shows 8 specific
violations are each caught by a **failing assertion** in the test that claims the property. It does
not show that an arbitrary violation would be caught, and no independent replay was performed.

**Fixture, not settlement.** The events are recorded by the fixture. `integration_level` says
`fixture` on every object; "unavailable" and "blocked" are simulated by name, not by taking a
system down. Horizon's scope decision is a query filter, not an authorization ruling — SEA-Forge
was not consulted.

- **Open:** D-024, D-025, D-030 unchanged (size S, out of scope). No live connector; traversal is
  a whole-projection read (fine for the fixture, an upstream ask for a large world).

**Next:** T07 — depends on T02, T05 and T06, all settled. Carry D-002's upstream report.

**Spec:** HORIZON-001 v1.0.1, frozen; SHA-256 `14a42936fe3a17c3726ee57fbc9278fd6f6e92276f67519fd9bf0f605f3324a4`.

**Evidence:** [T06 summary](evidence/horizon/T06/SUMMARY.md), [gate-t06](evidence/horizon/T06/gate-t06.log), [verify](evidence/horizon/T06/just-verify.log), [teeth](evidence/horizon/T06/teeth-t06.log), [mutation teeth](evidence/horizon/T06/teeth-t06-mutation.log), [pinned API](evidence/horizon/T06/pinned-api-inspection.log), [T05 regression](evidence/horizon/T06/t05-regression.log), [T06 prereg](prereg/horizon/T06.prereg.yaml), [T05 prereg](prereg/horizon/T05.prereg.yaml), [T05 interpretation](prereg/horizon/T05.prereg.interpretation.yaml), [T05 summary](evidence/horizon/T05/SUMMARY.md), [spec](specs/horizon.agent.spec.yaml), [plan](plans/horizon.plan.yaml), [decisions](reports/horizon-decisions.yaml), [ledger](../requirements/ledger.yaml), [wayfinder](../.wayfinder/answer-key.md), [debt](DEBT.md).

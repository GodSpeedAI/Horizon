# T23 evidence — unified human and agent identity, delegation and authority
**Task:** `T23` in `HORIZON-PLAN-001` (plan version 1.1.0), depending on `T04`, required before `T19`.
**Settles:** `REQ-SEC-006` — open until the Stage 4 vertical slice and its independent
confirmation.
**Preregistration:** `.agents/prereg/horizon/T23.prereg.yaml` (`HORIZON-PREREG-T23-0A`).
This file is the task's evidence index. The detailed observations live in the dated evidence file
for the stage that produced them, so a later stage never edits a recorded one.
## Stage status
| Stage | Scope | State | Evidence |
|---|---|---|---|
| 0A | Freeze the closed operation catalog, policy constants, parameter schemas, record schemas, issuer profile, A3 mechanism and platform-claim matrix; prove them in two languages; review them independently | Contracts frozen and checked; the two recorded identity defects are closed with negative tests; the issuer profile and the A3 mechanism are frozen; **the independent manifest review returned REJECT in round 1 and the re-frozen round-2 review has not yet landed** | `.agents/evidence/2026-11-09-stage-0a/README.md`, `.agents/evidence/2026-11-09-stage-0a-defects/README.md` |
| 0B | Horizon interim containment: pending descriptors, local A3-T terminal confirmation, reserved operations refusing with no write | Not started. Ready to begin once Stage 0A is accepted; it does not depend on the issuer or the SEA-Forge bridge | — |
| 1 | Cognate identity foundation | Not started | — |
| 2 | SEA-Forge authority bridge | Not started | — |
| 3 | A3-UV phone challenge and consumers | Not started | — |
| 4 | Minimum end-to-end vertical slice | Not started | — |
| 5 | Gauntlet and RealityTrace binding | Not started | — |
| 6 | Platform qualification | Not started | — |
| 7 | Consumer rollout and legacy drain | Not started | — |
## Stage 0A in one paragraph
The catalog was reconciled against the implemented behaviour under an owner decision on
2026-11-09: 73 rows (P0 17, P1 26, P2 23, P3 5, PX 2), ten additions, one removed read binding,
one corrected binding, one narrowing route alias, handler-level semantic dispatch on three routes,
and no demotion of a previously protected operation. The record contract declares 10 record kinds
(9 signed plus the unsigned `Refusal`), 8 encoding rules and 18 cross-field constraints, checked by
a TypeScript validator and by an independent stdlib-only Python implementation over 86 shared
fixture cases. The three owner proofs — no fabricated grant for a human session, no substitutable
caller type, no class downgrade through an alias or a parameter — each have a positive and a
negative case and are reproduced by both implementations. A later wave froze the issuer profile and
the A3 mechanism, closed the two recorded identity defects with negative tests, gave the catalog a
`live_enforcement` block that states what the running code enforces at this freeze and which stage
closes each remaining gap, made the parameter schemas handler-faithful with a build check that
compares them against the live source, and added the `PendingOperation` record with its three
constraints. Sixteen mutation teeth attack the catalog and the record rules one property at a
time; all sixteen are caught. An independent critic reviewed a frozen, hash-pinned copy of the
contract set and returned **REJECT** (5 blocking, 6 must-fix, 2 advisory); every finding was
confirmed true and every finding has a recorded disposition. Stage 0A settles only when the
re-frozen contract set passes a second independent review.
## The narrow gate
```
just check-t23
```
runs the preregistration shape check, the prereg→test linkage check (20 Stage 0A expectations
linked to named tests; 6 later-stage expectations reported open), the defect preregistration's
shape and linkage checks, the parameter-schema binding check, the four TypeScript identity suites,
and the Python fixture suite.
```
just teeth-t23
```
runs the sixteen mutation teeth.
`just gate-t23` adds the global gates (test, check, boundaries, IDM integrity, acceptance claims,
witness claims, contract modals, ledger, wayfinder, teeth).
## Limits
- Stage 0A proves contracts, not runtime behaviour. No issuer, grant, external effect or settled
  evidence chain exists in this repository yet.
- A governed row that the running code does not yet enforce is recorded as such in the catalog's
  `live_enforcement` block, with the missing pieces and the stage that closes them named. The
  loader refuses a row that claims enforcement it does not have. The *runtime* enforcement is
  Stage 0B and Stage 2/3 work and is not done.
- A later stage adds its own preregistration with its own expectations rather than editing this
  task's recorded ones.
- The Stage 0A unit preregistration (`.agents/prereg/horizon/STAGE-0A.prereg.yaml`) is preserved
  as recorded; the reconciliation that followed it is recorded in the dated evidence file, not by
  rewriting that file's expectations. The defect-remediation wave added
  `.agents/prereg/horizon/STAGE-0A-DEFECTS.prereg.yaml` with `recorded_before_artifacts: false`,
  because the artifacts it names did not exist when the earlier preregistrations were written.
- The independent review is a contract review. It establishes internal consistency and
  implementation sufficiency of the authority model, and nothing about runtime behaviour, platform
  security, revocation latency, or cross-stack integration.

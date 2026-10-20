# Horizon Current Status

**Revision:** 14 · **Recorded:** 2026-10-20 · **Stage:** **T04 settled** by owner decision (`DEC-T04-06`); re-frozen as `T04-CR-001@2026-10-20`; next task **T05**

At the owner's direction, candidate revision 3 was applied without another review cycle, and the formation inputs were re-frozen. The frozen ledger no longer carries the four inverted prohibitions or the five altered contracts.

**What was applied:**
- The composed policy replaced `scripts/ledger-policy.yaml`.
- The prereg `verified_by` correction was applied.
- The ledger and Wayfinder were regenerated and frozen. The active contracts are identical to revision 3's.

**Verified:**
- All 12 gate targets exit 0, and so does the recorder.
- 14 Bun tests pass, and 4 pytest tests pass.
- Every tooth is blocked, including the E2E falsifier and the duplicate canonical subtree.

**New pins:**

| Artifact | SHA-256 |
| --- | --- |
| Ledger | `c4237e17…` |
| Wayfinder | `50ccfd6b…` |
| Ledger policy | `4bc84aca…` |
| Prereg | `f42836a6…` |

The spec (`75cfc1ce…`) and `world_ref` (`6c18d6a6…`) are unchanged.

**Deviations and limits:**
- **No independent verdict on revision 3:** recorded in `DEC-T04-06`. The two earlier independent verdicts' findings were all addressed.
- **Pre-freeze criticism order:** the PE-01 deviation remains, as accepted in `DEC-T04-01`.
- **No witness yet:** `REQ-CASE-002` and `REQ-NAV-005` remain unwitnessed until T07.
- **Open debt:**
  - D-016: `REQ-CMP-001`
  - D-019: provider controls
  - D-020: the `REQ-RES-001` lexical baseline

**Next:** T05, which extracts a deterministic closed surface grammar, source bindings and a role reducer.

**Spec:** HORIZON-001 v1.0.0, frozen; SHA-256 `75cfc1ceb9eec6139f7b8e73f8d1107fcc5e2b680e80683824edd7d8de434130`.

**Evidence:** [decisions](reports/horizon-decisions.yaml), [gate record](evidence/horizon/T04/gates.txt), [verdict r2](evidence/horizon/T04/verdicts/codex-adversarial-r2-20261019.md), [candidate](candidates/horizon/T04-CR-001/CANDIDATE.yaml), [ledger](../requirements/ledger.yaml), [wayfinder](../.wayfinder/answer-key.md), [debt](DEBT.md), [prereg](prereg/horizon/T04.prereg.yaml), [plan](plans/horizon.plan.yaml).

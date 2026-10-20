# Horizon Current Status

**Revision:** 15 · **Recorded:** 2026-10-20 · **Stage:** T04 settled; spec amended to **1.0.1**; next task **T05**

**Spec 1.0.1 (`DEC-SPEC-101`):**
- **New requirement:** `REQ-CMP-001` says a hypothetical comparison never changes world state, grants authority or commits an intent. It was previously only a J05 journey note, and the canonical `.sea` already referenced it.
- **World unchanged:** `world_ref` stays `6c18d6a6…`.
- **Plan:** rebound to the new spec hash, with REQ-CMP-001 mapped to T16.
- **Ledger:** regenerated at 99 requirements and re-frozen as `HORIZON-001-1.0.1@2026-10-20`.
- **Debt:** D-016 is closed.

**T04:** settled (`DEC-T04-06`). T04 is P2, so no independent verdict was required. The only deviation is that the re-freezes had no independent ledger criticism.

**Verified:** all 12 gate targets exit 0, and so does the recorder.

**Frozen pins:**

| Artifact | SHA-256 |
| --- | --- |
| Spec | `14a42936…` |
| Ledger | `68974521…` |
| Wayfinder | `3a28ed7d…` |

**Open:**
- `REQ-CASE-002` and `REQ-NAV-005` have no witness until T07.
- D-019: provider controls.
- D-020: the `REQ-RES-001` lexical baseline.

**Next:** T05, which extracts a deterministic closed surface grammar, source bindings and a role reducer.

**Spec:** HORIZON-001 v1.0.1, frozen; SHA-256 `14a42936fe3a17c3726ee57fbc9278fd6f6e92276f67519fd9bf0f605f3324a4`.

**Evidence:** [spec](specs/horizon.agent.spec.yaml), [plan](plans/horizon.plan.yaml), [decisions](reports/horizon-decisions.yaml), [ledger](../requirements/ledger.yaml), [wayfinder](../.wayfinder/answer-key.md), [debt](DEBT.md).

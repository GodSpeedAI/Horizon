**Major — governed-human P2 authorization remains inconsistent.** [AuthorityDecision](design_draft.md:576) permits a null `grant_ref` only for root `grant.create` or entitlement-backed human P3. This excludes entitlement-backed governed P2 operations such as `handoff.send` and governed `ask.route`, despite their permitted human path.

Additionally, the [governed pipeline](design_draft.md:188) creates a fence for every governed operation, but [EffectFence](design_draft.md:578) permits a null grant only for human P3. Root `grant.create` therefore cannot complete that pipeline without an existing grant, contradicting its entitlement-backed bootstrap.

**Exact correction:** In both schemas, allow `grant_ref: null` for entitlement-backed human governed **P2 or P3**, requiring a non-null, currently valid `entitlement_ref`. Keep human `execution_ref` and `attempt_ref` null. Explicitly branch authority evaluation and fencing: agents use their grant and attempt; humans use their verified entitlement and caller reference. Root creation must reference the sponsor’s existing entitlement, never the grant being created; any grant being revoked or redelegated remains a separate target parameter.

Add Q1/Q3 fixtures for successful entitlement-backed human P2 and first-root-grant creation, plus refusal without entitlement.

CHANGES REQUIRED
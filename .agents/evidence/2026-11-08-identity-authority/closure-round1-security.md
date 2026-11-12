Verified the supplied SHA-256 and 547-line count. Three substantive issues remain:

1. **Major — Local P2 routing contradicts the mandatory pipeline.** [design_draft.md:174](/design_draft.md:174) limits the local path to P0/P1; line 175 sends P2 human-reserved decisions through SEA-Forge. Lines 177, 336, and 423 nevertheless retain local reserved decisions with a Cognate writer. This leaves implementations choosing whether local P2 requires SEA or bypasses the stated pipeline.

   **Exact correction:** Include explicitly designated local P2 decisions in the local path, requiring exact-operation A3 and a Cognate continuation. Restrict the governed path to SEA-governed P2 and every P3 operation. Assign each catalog operation one path/writer. Update Q3 so SEA outage refuses governed operations while local P2 depends on its own required verifier.

2. **Major — First-grant authorization remains circular or implicit.** [design_draft.md:182](/design_draft.md:182) requires execution proof, and line 184 evaluates authority through an existing grant. Yet `grant.create` is supposed to establish that grant; J03 supplies A3 confirmation without defining the sponsor’s independently authorized root entitlement. An implementer must invent a bootstrap exception or treat A3 as authority, contrary to line 185.

   **Exact correction:** Define root `grant.create` as SEA-only: authenticate the human sponsor, require operation-bound A3-UV, verify the sponsor’s existing SEA entitlement to delegate the requested bounds, and issue within those bounds without requiring the grant being created. Identify the requesting agent/service separately. Child grants require a live parent permitting redelegation and enforce ancestor budgets. Neither a session nor A3 alone grants entitlement.

3. **Major — Recovery has incompatible authorization requirements.** [design_draft.md:260](/design_draft.md:260) permits replacement through a recovery code or another paired device. Line 343 instead places `device.recover` behind console presence, prohibits remote-phone invocation, and says replacement requires ordinary A3. Line 405 requires a recovery code plus console enrollment. These rules disagree about both required anchors and whether recovery without the lost device’s A3 is possible.

   **Exact correction:** Limit console-only bootstrap to initial enrollment. Define recovery as either a single-use recovery code plus protected-console enrollment, or exact-operation A3-UV from another paired device. Explicitly exempt that recovery flow from requiring the lost device’s A3; console presence alone cannot replace an initialized identity. Bind authorization to the replacement key and consume it atomically.

CHANGES REQUIRED
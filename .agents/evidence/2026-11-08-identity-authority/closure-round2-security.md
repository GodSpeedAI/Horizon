The requested snapshot could not be verified. The file changed during review; its latest SHA-256 was `5418e5d792598c663038b643804b2ea5870fb0d17094a0cf0b7acddf3db41277`. This finding applies to the observed text, not the supplied hash.

**Major — Stage 0B leaves governed operations’ behavior implicit.** [design_draft.md:382](/design_draft.md:382) routes `approval.approve`, `approval.reject`, and `handoff.send` through local pending confirmation. Line 385 supplies A3-T without the SEA bridge. However, line 345 requires A3-UV for approvals, and Appendix A assigns these operations to SEA-Forge. An implementer must choose whether terminal confirmation enables their existing handlers or leaves them blocked.

**Exact correction:** Add to Stage 0B:

> Successful interim A3-T confirmation is restricted to Cognate-owned local P2 operations. Governed P2 and all P3 operations—including `handoff.send`, `approval.approve`, and `approval.reject`—remain refused until their required SEA-Forge authorization and human evidence are available. A local pending record or interim receipt cannot enable them. Initial `device.pair` follows the bootstrap ceremony and records `local_enrollment_presence`, never A3-T.

Require the Stage 0B gate to demonstrate these refusals even with a valid interim receipt.

**CHANGES REQUIRED**
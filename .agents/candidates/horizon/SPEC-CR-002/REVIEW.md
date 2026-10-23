# SPEC-CR-002 — independent review record

Reviewer: OpenAI Codex (`codex exec`, read-only sandbox). This is a different model and harness from the
builder (Claude). Every round read the frozen spec, manifesto v17, and the Horizon and RealityTrace
source.

| Round | Verdict | Findings | File |
|---|---|---|---|
| r1 | REJECT | 2 blockers, 6 major, 1 minor | REVIEW-codex-r1.md |
| r2 | REJECT | 7 major | REVIEW-codex-r2.md |
| r3 | ACCEPT_WITH_CHANGES | 5 major (fix before apply) | REVIEW-codex-r3.md |
| r4 | ACCEPT_WITH_CHANGES | 2 major | REVIEW-codex-r4.md |
| r5 | ACCEPT_WITH_CHANGES | 1 major | REVIEW-codex-r5.md |
| r6 | **ACCEPT** | implementation minors only | REVIEW-codex-r6.md |

DELTA.md maps each finding to its answer.

Applied 2026-10-23 as HORIZON-001 **1.1.0** under DEC-OWNER-2026-10-23-01:
- spec sha256 `d5ba60b08def01a4f996f6153b654a1e1148c3f2555ea32a61490a114f98a907`;
- plan rebound;
- ledger regenerated (105 requirements, 0 unmapped) and frozen as `HORIZON-001-1.1.0@2026-10-23`.

One transcription alignment is recorded here. REQ-NAV-013 in DELTA r6 says "whose executable digest
matches". §4 and REQ-NAV-011 pin **every** executed or loaded artifact, so the applied text reads
"whose pinned artifact digests all match". This is a narrowing consistent with the accepted design.

Open minors, carried to implementation:
- update DELTA prose that still says timestamps are not persisted;
- test early and late child completion while the watchdog pauses across the deadline;
- exercise confinement (write and network denied) with an authorized verifier.

Not yet done (implementation; gate J02 revision 2):
- the interaction-model migration (new records; world_ref change);
- the payment gate and capacity ledger;
- expected outcome and IS7 settlement;
- RT-1 in RealityTrace.

Until then, J02 keeps reporting IS2 and IS7 as open.

## Recorded deviation

CANDIDATE.yaml's authorization scope says that application includes the interaction-model migration in the
same change. It was **not** done in the spec change.

Reason: that migration changes Horizon's world_ref. It must land atomically with the J02 world_ref pin and
with the code that writes the new records (`PaymentEntry`, `ExpectedOutcome`, the capacity ledger,
`contract_version`). Otherwise the model would claim records that no code honours.

The spec (1.1.0) is normative now. Horizon conforms to REQ-NAV-008..013 only when the implementation PR
lands and gate J02 revision 2 passes. Until then the requirements are recorded as **not yet implemented**,
and J02 keeps IS2 and IS7 open.

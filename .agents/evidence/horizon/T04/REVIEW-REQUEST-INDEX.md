# T04 review requests — which one is current

There is exactly **one** current review request:

> **[`REVIEW_REQUEST.md`](REVIEW_REQUEST.md)** — candidate revision 3 (the commit that adds it).

Everything else in this directory is superseded history. Do not open more than one request to a
reviewer, and do not treat a superseded file as a second, independent review.

| File | Status | Covers |
| --- | --- | --- |
| `REVIEW_REQUEST.md` | **CURRENT** | candidate revision 3; rulings R1 (candidate, five F2 rewrites) · R2 (witness dispositions) · R3 (baseline) · R4 (E2E falsifier and canonical-closure boundary); PE/NE criteria and the prereg falsifier |
| `REVIEW_REQUEST.r2.superseded.md` | superseded | candidate revision 2 at `7a248ea`, which produced `verdicts/codex-adversarial-r2-20261019.md` (fail) |
| `REVIEW-attempt1.superseded.md` | superseded | the first-build request against `7b4d110`, which produced `verdicts/codex-root-20261019-7b4d110.md` |
| `REMEDIATION.review-request.superseded.md` | superseded | the remediation restatement (claims C1–C12) that the current request absorbs |

The owner authorized candidate revision 2 **conditional on** independent review (`DEC-T04-05` in
`.agents/reports/horizon-decisions.yaml`). Revision 2 failed that review. Revision 3 needs its own
verdict in [`verdicts/`](verdicts/), and the owner decides whether `DEC-T04-05` extends to it.

# T04 review requests — which one is current

There is exactly **one** current review request:

> **[`REVIEW_REQUEST.md`](REVIEW_REQUEST.md)** — candidate revision 2, commit `7a248ea`.

Everything else in this directory is superseded history. Do not open more than one request to a
reviewer, and do not treat a superseded file as a second, independent review.

| File | Status | Covers |
| --- | --- | --- |
| `REVIEW_REQUEST.md` | **CURRENT** | candidate revision 2 (`7a248ea`); rulings R1 (candidate) · R2 (criticism round 1) · R3 (D-020 baseline) · R4 (`REQ-UX-009`); plus the first build's PE/NE criteria, gates, W1–W3 and questions, so the original verdict's findings are re-tested rather than inherited |
| `REVIEW-attempt1.superseded.md` | superseded | the first-build request against `7b4d110`, which produced `verdicts/codex-root-20261019-7b4d110.md` |
| `REMEDIATION.review-request.superseded.md` | superseded | the remediation restatement (claims C1–C12) that the current request absorbs |

Superseding was recorded in `.agents/reports/horizon-decisions.yaml` as `DEC-T04-05`. The owner
authorized candidate revision 2 **conditional on** the review the current request describes; the
authorization is not effective until a verdict exists in [`verdicts/`](verdicts/).

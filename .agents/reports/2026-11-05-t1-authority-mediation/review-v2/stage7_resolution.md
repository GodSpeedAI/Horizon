# Goldfish Annotated Review Report — Stage 7 (v4 → v5)

Status: resolved
**Target:** `design_draft.md` v4, FeatureRange 1-84
**Findings:** `critic_report.md`, `critic_structural_raw.md`, `critic_style_raw.md`
**Mode:** operator-directed autonomous ⇒ PROPOSE FIX applied.

Because the feature section changed throughout, it was rewritten as one block (v5) and spliced onto the Technical Plan; the plan and acceptance rows were then updated to match.

## Majors

| ID | Finding | Disposition | Evidence / edit |
| --- | --- | --- | --- |
| D-1 | Identity tarball `^0.8.0` ranges vs 0.9.0 pins | PROPOSE FIX | Verified `node_modules/@godspeed/identity/package.json`: `cognate-events` and `cognate-runtime-api` are `^0.8.0`; no `packages/identity` on cognate main (source lives in `cognate-identity-wt`, branch `horizon/shared-identity`). Chosen: keep the tarball vendored, with an `overrides` entry to 0.9.0, gated by an additive-only v0.8.0..v0.9.0 diff, a clean install with a single copy of each package, and green identity tests. Repacking a T2-owned artifact was rejected as out of scope. The Overview contradiction is fixed. Risk R7 added |
| D-2 | 256 KB cap vs growing unfiltered listing | PROPOSE FIX | Verified 11 fields per `ApprovalStanding::to_json` row (`cep.rs:727-747`), about 0.5–0.7 KB per row, so the cap would fail at roughly 400 rows; Horizon's current client is unbounded. Added `maxListBytes` (8 MiB) for `listApprovals` only, failing closed with typed `response_too_large`, plus `bytes` in the result and a Stage 0 measurement. Busy-retry latency is stated in the Overview. Paging is deferred to post-T1 sea-rs (R6) |
| D-3 | Workbench has no teeth | PROPOSE FIX | Goal 3 covers both fronts; D3 adds a Workbench boundary test and a mutation case |
| D-4 | No single contract for the escalation standing | PROPOSE FIX | Golden fixture `contracts/fixtures/approval-standing.json` in sea-rs is the source of truth. sea-rs conformance asserts against it byte-for-byte; the SDK parses a byte-identical copy, checked by sha256; a real-binary run is required at release. Citation corrected to `cep.rs:711-741` / 727 |
| D-5 | SWE_SEED run required but SWE_SEED out of scope | PROPOSE FIX | Decided: non-blocking for the T1 release. A red run is recorded as FAILED and escalated as a SWE_SEED fix; it blocks only the "Workbench installable" claim. R8 added (two cancelled runs on 2026-10-31, from Phase A baseline) |
| S-1 | H1 → H3 heading skip | PROPOSE FIX | Vocabulary and History promoted to H2 |
| Y-1 | "folklore" | PROPOSE FIX | "No contract or type separates them. Consumers tell them apart only by which verb returned the row." |
| Y-2 | Fragment adjudication sentence | PROPOSE FIX | Moved into the Overview as full sentences |
| Y-3 | "Zero exceptions" contradiction | PROPOSE FIX | "No exceptions inside `src/`", with the reason and a reference to the deviation from owner direction 3 (also D-7) |
| Y-4 | "write-moves" undefined | PROPOSE FIX | Defined from the concepts brief line 36: moving Horizon's capacity and case write operations into Cognate; interim implementations stay |

## Nits

All applied except where noted.

* D-6: INV-2 is now defined in the Vocabulary from `06-egm-design-boundary.md` item 2. It is no longer presented as a quotation, because no Horizon spec defines it.
* D-7, D-8, D-9: applied.
* S-2 to S-8: applied — "Problem Statement" with P1/P2, decisions moved out of the Vocabulary, terms glossed, Non-Goals given reasons, History table normalized and sorted, call-site bullets made parallel, adjudication moved to the Overview.
* Y-5 to Y-17: applied. The exception is Y-13: the linked-versions wording is reduced to "published at one shared version" in Goal 4.

**Counts:** 10 Majors accepted, 24 Nits accepted. 0 contested, 0 escalated.

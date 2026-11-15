# Final acceptance check — retained reviewer output

**Target:** immutable copy of `design_draft.md`, mode `0444`, SHA-256 `e7ef6a9dffebe138262d865bf58299ef0b613c9ca60f2900cab90a623b003c4a`, 658 lines. The hash was declared in the prompt and the file was frozen before the read, because closure rounds 2 and 3 were invalidated by a target that changed mid-review.

**Scope constraint given to the reviewer:** report only defects both still present in that exact file and either an internal contradiction between two citable lines or an implementer-blocking ambiguity. Style, elaboration, and items already assigned to a named gate (Q1-Q8) or a named stage were excluded.

**Verdict:** not `ACCEPT`. One defect, with the exact minimal correction prescribed.

**Verbatim output:**

> - Human-session `capability.invoke` and `run.start` have no grant, yet their pending expiry requires “grant expiry,” forcing an undefined fallback ([design_draft.md:176](design_draft.md:176), [design_draft.md:645](design_draft.md:645), [design_draft.md:647](design_draft.md:647)); exact minimal correction: replace both expiry cells with `agent execution: grant expiry; human session: 10m, with current entitlement rechecked at consumption`.

**Disposition:** applied verbatim to both catalog cells. A deterministic sweep then reported zero rows with a grant-based expiry but no agent caller, zero duplicate operation rows, and zero operations without a resolved parameter schema across all 30 catalog operations.

**Status of the corrected text:** not re-reviewed. Acceptance of the correction rests on it being the reviewer's own prescribed wording applied to the cited cells, plus the reproducible sweep -- not on a further independent verdict. Recorded so no later reader mistakes the final edit for a reviewed sentence.

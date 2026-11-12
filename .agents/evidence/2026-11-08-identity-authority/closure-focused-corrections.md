# Focused check — owner-identified corrections

**Frozen target:** mode `0444`, SHA-256 `32474d8f9a480ec51ded234678c46709e40340bdc2cc2884db6986f222457836`, 687 lines. The reviewer confirmed that hash before reviewing, and the file could not change.

**Verdict:** not `ACCEPT`. Item 1 PASS, item 4 PASS, four defects across items 2 and 3, each with an exact minimal correction prescribed.

**Verbatim output:**

> Verified SHA-256: `32474d8f9a480ec51ded234678c46709e40340bdc2cc2884db6986f222457836` — 687 lines, mode `0444`.
> 
> 1. **PASS.** Human `run.start` is caller-discriminated, rejects `grant_ref`, and derives entitlement authority server-side. Schema, resolution paragraph, catalog, and Q1 agree.
> 
> 2. **DEFECT — Stage 0B state/restart contract.** `design_draft.md:388` enumerates only four states, while `design_draft.md:389` requires `dispatching` and `uncertain`. `design_draft.md:401` promises a crashed record remains redeemable, while `design_draft.md:390` expires prior-launch `confirmed` records.
>    
>    Minimal correction: add `dispatching` and `uncertain` to line 388’s enum. Replace line 401’s failure handling with: “Crash rolls back the effect; within the same launch the record remains `confirmed` and redeemable once; restart expires it under the launch-generation rule.”
> 
> 3. **Two defects in catalog consistency:**
> 
>    - **Human redelegation:** `design_draft.md:353` unconditionally requires the agent execution’s own delegation head, contradicting human-session redelegation at `design_draft.md:661`. Minimal correction: qualify that head check with “For agent callers”; add: “For human callers, verify the authenticated principal’s current SEA-Forge entitlement to redelegate the named live parent.”
>    - **Local dispatch:** `design_draft.md:632` requires every agent `run.start` to supply a grant, and `design_draft.md:638` requires SEA-Forge resolution, contradicting grant-free local P0/P1 at `design_draft.md:592` and SEA-independent dispatch at `design_draft.md:216`. Minimal correction: permit null `grant_ref` for local P0/P1; specify trusted Cognate-side resolution for local targets, with SEA-Forge authority verification required only for governed targets.
> 
> 4. **PASS.** Human-session expiry remains independent of a caller grant; inherited target expiry preserves that invariant.
**Disposition:** all four corrections applied as prescribed and verified structurally:

| Item | Correction | Verification |
|---|---|---|
| State enum | `dispatching` and `uncertain` added; `uncertain` terminal until reconciled | enum now covers every state the text uses |
| `db_local` restart | recovery scoped to the launch, then expires under the launch-generation rule | row states the launch-scoped rule |
| Human redelegation | agent head check qualified; human path uses current SEA entitlement | both caller paths present and distinct |
| Local `run.start` | `grant_ref` nullable for all-local plans; Cognate resolves, no SEA call | local resolution and mixed-plan binding stated |

**Status of the corrected text:** not independently re-verified. These four invariants are assigned to Stage 0A as machine-checked fixtures and negative tests, so a regression fails a test rather than needing another prose review.

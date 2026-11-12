# Re-verification of the four prescribed corrections

**Frozen target:** mode `0444`, SHA-256 `34a6e3845b17fc3f06fd7ae6c53d5240c25eba0771cc3b86d9aa6c0ba5f001ef`. The reviewer confirmed the hash and that it was unchanged.

**Verdict:** `ACCEPT`.

**Verbatim output:**

> Verified SHA-256: `34a6e3845b17fc3f06fd7ae6c53d5240c25eba0771cc3b86d9aa6c0ba5f001ef`. Mode `0444`; unchanged.
> 
> - A: **PASS** — [line 388](design_draft.md:388) lists all six states and makes `uncertain` terminal until reconciled.
> - B: **PASS** — [line 401](design_draft.md:401) limits confirmed-record redemption to the same launch; restart expiry agrees with [line 390](design_draft.md:390).
> - C: **PASS** — [line 353](design_draft.md:353) specifies both paths: agent delegation-head validation and human current SEA-Forge entitlement validation.
> - D: **PASS** — [line 632](design_draft.md:632) permits null `grant_ref` for all-local P0/P1 plans; [line 638](design_draft.md:638) specifies Cognate resolution without SEA-Forge, SEA resolution for governed targets, and highest-class binding for mixed plans.
> 
> ACCEPT
**Gate status:** the Stage 0A contract gate is passed for this hash. All four corrections are present and mutually consistent, so the four invariants are frozen as written and move to Stage 0A as machine-checked fixtures.

**Scope limit:** this verdict covers corrections A-D only. It is not a re-review of the design, and it establishes nothing about runtime behaviour or platform security.

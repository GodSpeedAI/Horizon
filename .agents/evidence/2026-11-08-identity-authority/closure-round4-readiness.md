- **Major — [design_draft.md:573](design_draft.md:573):** `Credential.delegation_ref` permits null only for local P1, while lines 175 and 574 permit local P0/P1 agent executions without delegation. A read-only P0 execution therefore lacks a valid credential representation. **Exact correction:** add `delegation_ref` to the required fields and replace its nullability rule with: “Required and nullable only for a local P0/P1 execution; non-null for governed execution.”

- **Major — [design_draft.md:176](design_draft.md:176):** The exhaustive authorization branches assign governed humans only P2, but lines 644–648 explicitly assign human callers P3 approval, invocation, run-start, and export operations. **Exact correction:** extend “Governed human” to “SEA-Forge-owned P2 decisions and P3 operations whose operation row permits a human session”; require the row’s assurance predicate and SEA-Forge decision, plus the bounded grant and effect fence for P3. Keep human execution/attempt/delegation references null.

Automatic approval review rejected file indexing because of potential data egress. Direct read-only inspection completed.

CHANGES REQUIRED
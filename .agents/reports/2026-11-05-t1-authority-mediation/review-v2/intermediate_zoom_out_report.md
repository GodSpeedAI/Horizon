# Stage 8 — Intermediate Zoom Out (v5) — verbatim reviewer output

Reviewer: `egm:egm-zoom-out` (fresh context, model inherit), 2026-11-05. Target: `design_draft.md` v5 (sha256 `606b1c94…c1ed1`; snapshot `design_draft.v5.stage8-input.md`), full file. Standard: `zoom-out-standard.md`. Context: the Stage 5 report and its v2 input.

---

**Zoom Out Review (Stage 8), `/home/sprime01/projects/Horizon/.agents/reports/2026-11-05-t1-authority-mediation/design_draft.md` (v5)**

I read the persona, the zoom-out standard, the v5 target, the Stage 5 report and its v2 input, `stage6_resolution.md`, `stage7_resolution.md`, and `04-adjudication-remaining.md`. I also spot-checked the code: cognate `runtime-bun/package.json` exports, `exchange` at `sea-forge-authority.ts:220`, Horizon `test/` raw calls and `test/support/`, and sea-rs test fixtures.

Context is sufficient. Stage 5's findings are all resolved, and in each case the fix made the design simpler:
- **Blocker:** the INV-2 exception is gone, because the delegated decide now uses `decide(..., delegation)`.
- **Majors:**
  - Request ids are deterministic again and byte-identical to today's.
  - `listApprovals` sends the actor each caller sends today, and `approvalState` is rebuilt on it.
  - The `get_schema` wire change is now stated.

The Stage 6 and 7 additions are mostly proportionate. These four are good, minimal fixes:
- the socket-free `sea-forge-config.ts`;
- Workbench teeth;
- the two-layer rollback;
- the identity-tarball override.

Remaining findings:

**1. Severity: Major**
**Affected Scope:** Goal 5 "SWE_SEED packaging evidence" plus R8; Goal 3 "No exceptions inside `src/`"; Risks E-1 to E-3
**Simplicity Rationale:** Two review-stage resolutions changed owner directions, and the owner has not signed off on either:
- Owner direction 1 (`04-adjudication-remaining.md:13`) makes a green SWE_SEED run a *critical-path* addition. Stage 7 (D-5) made it non-blocking.
- Owner direction 3 allowed dated exceptions. Goal 3 removes them, citing `stage5_resolution.md` #1, not an owner decision.

Both changes simplify the plan and I agree with them. But E-3 says implementation is authorized "subject to the evidence gates", and these changes alter the gates after that authorization. The cheapest fix is one new item, E-4: "owner ratifies (a) the non-blocking SWE_SEED gate and (b) zero `src/` exceptions." No design change is needed.

**2. Severity: Nit**
**Affected Scope:** Goal 4 ("so each front stops carrying its own copy") vs D3 ("`validateResolve` keeps rejecting malformed input"); D4 `APPROVAL_ID` deletion
**Simplicity Rationale:** Stage 6 #2 created a contradiction. Goal 4 says the fronts stop duplicating validation, but D3 keeps Workbench's regex copy so it can keep its own error messages. The simpler option is for Workbench to drop its regex and map the SDK's typed refusal to its messages. Otherwise Goal 4 should say "Horizon stops carrying its copy."

**3. Severity: Nit**
**Affected Scope:** Goal 1 / D1 `listApprovals` (`maxListBytes` constructor option, `bytes` result field); acceptance row "Release evidence" (Stage 0 measurement)
**Simplicity Rationale:** The bound itself is the right fix (D-2): it fails closed and doesn't truncate. Two pieces of it are speculative:
- **The `bytes` result field.** It has no consumer. The Stage 0 measurement happens at current heads, before the SDK method exists, so it can't come from this field.
- **The `maxListBytes` constructor option.** No caller is named as needing to change it. A fixed internal list bound does the same job with less API surface. Paging is already deferred (R6).

Drop `bytes`, and either make the bound internal or say who sets it.

**4. Severity: Nit**
**Affected Scope:** Goal 2 / D2.2 golden fixture; acceptance row "Correctness" (SDK parses "a byte-identical copy … sha256 equals the sea-rs file's")
**Simplicity Rationale:** Two checks are enough here: the sea-rs golden fixture with its byte-for-byte conformance test, plus the real-0.4.0-binary `listApprovals` run. The cross-repo sha256 check adds nothing automatic. The cognate suite can only compare against a hash recorded when the file was copied, so it won't notice when sea-rs changes the fixture. Treat the hash as a one-time copy record, not a guard, or drop it.

Also, sea-rs already keeps fixtures in `crates/sea-forge-server/tests/fixtures/`. Placing the new one in the new `contracts/fixtures/` is defensible because it is a cross-repo contract, but the design should say why it departs from the existing location.

**5. Severity: Nit**
**Affected Scope:** D4 test re-homing ("uses a socket helper under `test/support/`")
**Simplicity Rationale:** This is correct as far as it goes: `runtime-bun` exports only `"."`, so tests can't reach the SDK's `exchange`. The raw adversarial calls (`J02-live.test.ts:159,197`, `J02r2-live.test.ts:128`, `j02r2-rig.ts:191`) do need a raw sender. The design should say the deleted `seaForgeCall` *moves* to `test/support/`, so it isn't read as writing a new socket client.

**6. Severity: Nit**
**Affected Scope:** acceptance row "Recovery" (cross-version matrix)
**Simplicity Rationale:** One matrix cell repeats another row. "Adoption commit against 0.4.0" is already covered by the Correctness row (J02-live) and the Integration row (tag roundtrip). Only "adoption vs v0.3.0" (rollback) and "pre-adoption vs 0.4.0" (mixed-state window) add anything. Narrow the row to those cells per front.

**7. Severity: Nit**
**Affected Scope:** Whole document. The identity-override gates appear in Goal 4, D4, Regression and R7. The list bound appears in Goal 1, D1 and R6. Line-level detail runs throughout: regexes, test filenames, `lib.rs`/`app.ts` line numbers.
**Simplicity Rationale:** The Comprehension additions were justified: Vocabulary, the History table and inline glosses. But the same constraint is now stated three or four times, and the design has dropped further toward plan-level detail. Stage 5 Nit 8 asked for the opposite. State each gate once (Goals or D-sections) and point to it from the acceptance table and Risks. Line citations can move to the plan.

**Verdict:** I found no Blocker. Proceed once the Major is fixed: add one owner-ratification item (E-4) covering the two changed owner directions. The Nits are optional tightening.

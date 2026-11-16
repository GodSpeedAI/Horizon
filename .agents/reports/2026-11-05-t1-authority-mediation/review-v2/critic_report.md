# Stage 7 — Critic Review (v4, FeatureRange lines 1-84)

Reviewers, run in parallel within the stage, fresh context, model inherit:
* `egm:egm-design` with `feature-spec-standard`
* `egm:egm-structural` with `feature-spec-standard`
* `egm:egm-style` with no standard

All three completed. Verbatim outputs: design below; structural `critic_structural_raw.md`; style `critic_style_raw.md`.

Summary:

| Reviewer | Blocker | Major | Nit |
| --- | --- | --- | --- |
| design | 0 | 5 | 4 |
| structural | 0 | 1 | 7 |
| style | 0 | 4 | 13 |

---

## egm-design — verbatim

**REVIEW: egm-design, Stage 7. Target: `/home/sprime01/projects/Horizon/.agents/reports/2026-11-05-t1-authority-mediation/design_draft.md`, lines 1-84**

I read the persona, the feature-spec standard, the whole target file, both GoldfishContext files, and the referenced sources. The sources were Horizon `src/app.ts`, `src/adapters/{sea-forge-approvals,delegating-authority}.ts`, `package.json`, `node_modules/@godspeed/identity/package.json`, `.agents/specs/horizon.agent.spec.yaml`; Cognate `packages/runtime-bun/src/sea-forge-authority.ts`; and sea-rs `cep.rs`.

Branch caveat: I read sea-rs from the local checkout, not `origin/main`. The citations I checked still matched it.

Claims that check out:
- The three raw call sites: `app.ts:776`, `app.ts:1011`, and `delegating-authority.ts:27`, which calls `seaForgeCall`.
- The hardening gap: Horizon's `seaForgeCall` has no busy-retry and no size cap. The SDK caps responses at `maxResponseBytes ?? 256*1024` (line 321) and retries `server_busy` answers that carry `no_side_effect`.
- The wording of REQ-NAV-006 and REQ-NAV-010.

The Alternatives and Risks sections exist later in the file, so the standard's structural requirements are met. The findings below are about the substance of lines 1-84.

---

**1. Severity: Major. Lines 70 and 57 (Goal 4 de-vendor exception).**
**Finding:** The "one explicit exception" does not work as written. The vendored `@godspeed/identity` 0.1.0 declares `"@godspeedai/cognate-events": "^0.8.0"` and `"@godspeedai/cognate-runtime-api": "^0.8.0"`. For 0.x versions, a caret range means >=0.8.0 <0.9.0, so 0.9.0 does not satisfy it. If Horizon pins every linked package to exactly 0.9.0, one of two things happens:
- The package manager installs duplicate 0.8.x copies of events and runtime-api next to 0.9.0. Types and singletons then split across the identity boundary, and those 0.8.0 copies must actually resolve from the registry.
- Or an override forces 0.9.0 onto identity, outside its declared range.

The tarball also ships `"@godspeedai/cognate-store-memory": "workspace:*"` as a devDependency. On top of that, line 57 says Horizon "drops its vendored Cognate packages", which contradicts the exception.
**Recommendation:** State how the identity tarball resolves against a 0.9.0 pin set: a repacked identity with `^0.9.0` ranges, a documented override, or tolerated duplicates with a check. Make "clean install with no duplicate cognate-events/runtime-api" an acceptance criterion. Make line 57 match Goal 4.

**2. Severity: Major. Lines 36, 59 and 63 (256 KB cap presented as pure hardening; "exactly one change visible").**
**Finding:** Today Horizon's client reads responses of any size. After adoption, every listing goes through the SDK's 256 KB cap. The design itself says (line 93) that `authority_approvals` is unfiltered, and `app.ts:1011` counts decided rows, so the listing holds history and keeps growing. Once it passes the cap, the approval inbox and the REQ-NAV-010 `steering_attention` capacity read both fail hard. Neither the Overview nor the Goals mention this, and line 59's "exactly one change is visible" is false once the cap is hit. Busy-retry also changes call latency inside the existing timeouts.
**Recommendation:** Estimate the bytes per standing row and the number of rows at which listings reach the cap. Pick one: configure `maxResponseBytes` per call, add server-side paging or a state filter (which would need a sea-rs change), or record the ceiling as an accepted limit with an alarm. Then reword line 59.

**3. Severity: Major. Lines 63 and 69 (Goal 1 claims both fronts, but the Goal 3 check covers only Horizon).**
**Finding:** Goal 1 says `SeaForgeAuthority` is the only SFWP client "in either product front". Goal 3's static check and mutation teeth exist only in Horizon. Workbench is product #1 per the adjudication and gets no boundary check, so a new hand-rolled socket call there would go unnoticed. That is exactly the regression class T1 exists to remove. The adjudication says Workbench adoption is "gated, not tracked".
**Recommendation:** Either extend the boundary check and teeth to `cognate-workbench/src`, or narrow Goal 1 to say Workbench is converged but not enforced. If you narrow it, give the reason and a follow-up owner.

**4. Severity: Major. Line 66 (contract for the escalation standing).**
**Finding:** The escalation standing is the shape T1's new client actually parses, yet it has no generated schema. The design says it is "pinned by the SDK parity fixtures and the sea-rs conformance suite". Those are two independent pins in two repos. The SDK fixtures are scripted fakes (see line 195), and the sea-rs suite never reads them. If the server changes `ApprovalStanding::to_json`, sea-rs conformance can be updated and stay green while the SDK fakes keep passing. The only thing that would catch the drift is the opt-in live test. That leaves the "one wire vocabulary" goal with no single checked contract for the half it depends on. The adjudication direction was to *document* `ApprovalStanding::to_json` as the contract.
**Recommendation:** Name one source of truth and check the other repo against it. Options: a golden JSON fixture emitted by the sea-rs conformance test and consumed byte-for-byte by the SDK parity suite, or a required real-server SDK parity run for `listApprovals`. Separately, the citation `cep.rs:718` falls inside the struct body; the struct starts at 711 and `to_json` is at 727.

**5. Severity: Major. Lines 71 and 79 (SWE_SEED green run is required evidence, but SWE_SEED is a non-goal).**
**Finding:** Goal 5 makes a green `native-candidate.yml` run plus SHA256SUMS release evidence. The adjudication record (04 §1 row 1) says that workflow exists but has never run. Line 79 puts SWE_SEED architecture out of scope. If the first run fails, T1's acceptance is blocked on a repo T1 may not change, and no owner or fallback is named. The Risks section has no matching entry.
**Recommendation:** Pick one of these and state it: a red run blocks T1, or it is recorded and escalated without blocking. Name who fixes SWE_SEED if it fails, and add the risk entry.

**6. Severity: Nit. Line 36 (INV-2 quotation).**
**Finding:** INV-2 is quoted without a source. I found no definition in Horizon outside `.agents/reports`. The discovery comprehension review paraphrases the mission's §5 clause 2 differently ("only process speaking to authorities"). A fresh reader cannot verify the quote.
**Recommendation:** Cite the file and clause that define INV-2, and quote it exactly.

**7. Severity: Nit. Line 69 ("Zero exceptions" departs from the adjudicated direction).**
**Finding:** Owner direction 3 (04 §1) specified "a dated named-exception list for Horizon's two remaining app-voice calls". The draft goes stricter: zero exceptions, with the delegated decide also moved onto the SDK. That is defensible, and `LEDGER.md:28` records it, but the FeatureRange never says the direction was superseded or by whom.
**Recommendation:** Add a one-clause reference to the ledger entry or resolution that approved strict mode.

**8. Severity: Nit. Lines 59 and 63-71 (scope not stated in the Overview or Goals).**
**Finding:** Two in-scope items are missing from the Overview and Goals:
- Deleting Workbench's hand-rolled `RealityTraceCli` (D3, line 154). The Problem section and Goal 4 talk only about SFWP clients.
- The `system.get_schema` name and path change. This is the one change on the wire, and the Overview's wire statement leaves it out.

**Recommendation:** Add both to the Overview and to Goal 4.

**9. Severity: Nit. Line 71 (what the runbook proves).**
**Finding:** The runbook is called "the standing correctness, recovery and release artifact", but the runbook does not test recovery. That is done by the cross-version matrix and the revert drills in the Recovery row of the acceptance table.
**Recommendation:** Drop "recovery" from line 71, or point it at the Recovery acceptance row.

---

**Verdict:** REVISE. There are no Blockers, but five Majors need fixing before the FeatureRange passes: the identity tarball's dependency ranges, the 256 KB cap against an unfiltered listing that keeps growing, no boundary check in Workbench, no single contract for the escalation standing, and the never-run SWE_SEED workflow as required evidence.

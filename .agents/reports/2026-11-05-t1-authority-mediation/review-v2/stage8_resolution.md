# Goldfish Annotated Review Report — Stage 8 (v5 → v6)

Status: resolved
**Target:** `design_draft.md` v5 (full file) · Findings: `intermediate_zoom_out_report.md`

| # | Sev | Disposition | Edit |
| --- | --- | --- | --- |
| 1 | Major | PROPOSE FIX | E-4 added. The owner must ratify (a) SWE_SEED non-blocking for the T1 release and (b) zero `src/` exceptions. Both are reversible and the agent proceeds on them meanwhile. The question is raised to the owner in chat |
| 2 | Nit | PROPOSE FIX | Workbench `validateResolve` drops its regex and maps the SDK's typed refusal, so Goal 4 holds for both fronts |
| 3 | Nit | PROPOSE FIX | `bytes` field dropped; the list bound is a fixed internal 8 MiB, not a constructor option |
| 4 | Nit | PROPOSE FIX | The sha256 is a copy record, not a guard; drift is caught by sea-rs conformance plus the real-binary run. The `contracts/fixtures/` location is justified |
| 5 | Nit | PROPOSE FIX | `seaForgeCall` moves unchanged to `test/support/`; no new socket client |
| 6 | Nit | PROPOSE FIX | Recovery matrix narrowed to two cells per front |
| 7 | Nit | DECLINE (partly) | Line-level citations stay in the Technical Plan because Stage 9 (implementation readiness) audits that range and needs them. Duplicate statements are kept as pointers rather than consolidated; a full restructure was not worth the churn ahead of Stage 9 |

Counts: 1 Major accepted; 5 Nits accepted; 1 Nit declined.

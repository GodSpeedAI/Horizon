# Live case-keeper probe (2026-11-07)

Command: `bun live-probe.ts e2e-signoff-gate@0.1.0 '{"change_summary":"..."}'` against the test setup socket, case keeper built from `feat/horizon-desk-support` (00:33 build), through `src/adapters/sea-forge-case.ts`. Second run (the first run created the case; this run shows replay).

```
cases: {"kind":"ok","value":{"cases":[{"case_id":"case_20261107T061312Z_820737","case_state":"active","summary":"Execute plan drafts/draft_eaa7a3.json","created_at":"2026-11-07T06:13:12.793396581+00:00","closed_at":null}],"unreadable":[]}}
preflight: {"kind":"ok","value":{"ok":true,"template_ref":"e2e-signoff-gate@0.1.0","errors":[],"items":[{"plan_item_id":"task_draft","name":"draft change note","item_kind":"SandboxedTask"},{"plan_item_id":"signoff_release","name":"operator sign-off","item_kind":"HumanTask"}],"precondition":{"ref":"template:e2e-signoff-gate@0.1.0","expected_digest":"sha256:cdbb4b4d69e896104c510aa007658ad8a0a1e6e333d5ad330a3951dd450ce78e"},"plan_precondition":{"ref":"plan:e2e-signoff-gate@0.1.0","expected_digest":"sha256:8813eaca514dfa547006a64fe82712a8b29713b7f6c108d3aca8f6aa31317253"}}}
commit with stale plan digest: {"kind":"stale","changed":[{"ref":"plan:e2e-signoff-gate@0.1.0","expected_digest":"sha256:0000000000000000000000000000000000000000000000000000000000000000","current_digest":"sha256:8813eaca514dfa547006a64fe82712a8b29713b7f6c108d3aca8f6aa31317253"}],"words":"This changed after you looked at it, so nothing was done. Look at the new version and decide again."}
commit with fresh plan digest: {"kind":"ok","value":{"case_id":"case_20261107T061312Z_820737","exit_code":5,"state":"active"}}
same request again (replay): {"kind":"ok","value":{"case_id":"case_20261107T061312Z_820737","exit_code":5,"state":"active"}}
cases after: {"kind":"ok","value":{"cases":[{"case_id":"case_20261107T061312Z_820737","case_state":"active","summary":"Execute plan drafts/draft_eaa7a3.json","created_at":"2026-11-07T06:13:12.793396581+00:00","closed_at":null}],"unreadable":[]}}
```

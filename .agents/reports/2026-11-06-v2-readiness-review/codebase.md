SUMMARY (under 120 words). I could not write codebase.md because my tools are read-only, so the full report follows below for you to save at /home/sprime01/projects/Horizon/.agents/reports/2026-11-06-v2-readiness-review/codebase.md. I checked about 40 citations, and most are accurate. There are no 🔴 findings. Two 🟡 reuse misses: stage 3 plans a new "preview code" although sea-rs already has a generic precondition mechanism, and stages 2 and 4 plan new SQL tables and an outbox although Horizon's DurableStore already has record collections and an outbox. Three 🟡 stale or wrong claims: the `types.rs` line ranges, `lib.rs ~3146`, and the "check first" on package installs, which is already answered. I found no wrong-repository changes.

FULL REPORT. Mode: REVIEW. Target: Horizon_Operator_Workspace_Design_v2_technical_annex.md. Read-only. No code was built or run. I looked at ~/.agents for structure and names only.

## 🔴 Blockers
None. No cited current-state fact contradicts the code in a way that would mislead the plan.

## 🟡 Major

1. Reuse missed: stage 3 "preview code" (annex C, stage 3; `case.rs:149`, `lib.rs ~3146`).
   - The annex plans a new preview code computed in `preflight()` and checked in `CaseCommit` and the decision handlers.
   - sea-rs already has a generic precondition mechanism:
     - `RecordDigest {ref, expected_digest}` is the type at `sfwp/case.rs:137`.
     - `sfwp::precondition::{evaluate, digest_of, RecordResolver}` are in the same module.
     - `CaseCommit` takes `preconditions` (`lib.rs:1084`) and evaluates them before any side effect (`lib.rs:3189`).
     - `ApprovalDecide` takes `preconditions` (`lib.rs:1118`) and passes them to `decide()` (`lib.rs:3170`). Decisions are therefore already precondition-checked.
   - The only gap is that `TemplateRecordResolver` (`lib.rs:3577`) resolves `template:` refs only, so preflight pins the template bytes alone.
   - Corrected fact: extend the resolver with a second ref kind, for example `plan:<hash>` over template, params and items. Return it from `preflight()` as an additional `RecordDigest`. Do not add a new field or a new check. The "decision handlers" part of the change is already done.

2. Reuse missed: notes tables and outbox (annex C stages 2 and 4; rows "Persistence" and "Out: An outbox keeps writes in order").
   - The annex says `notes`, `note_revisions`, `note_placements` and `tags` are created in `.cognate/app.sqlite`, and that there is "no notes store". It also plans a hand-built GitHub outbox.
   - Horizon accesses that file only through Cognate's `DurableStore`. Its interface is at `cognate/packages/events/src/types.ts:191`:
     - `commit()` applies atomically and gives one-transaction saves.
     - `getRecord` and `listRecords` work over versioned record collections.
     - `claimOutbox`, `settleOutbox` and the optional `claimOutboxLeased` and `renewOutboxLease` provide an ordered, leased outbox.
   - Horizon's established pattern is record collections: `src/capabilities/workspace-records.ts` has `horizon-cases` and `horizon-onboarding`, `OpenCase` with tenant and operator, and `checkPurpose`.
   - Corrected fact: model notes, revisions, placements and tags as `DurableStore` collections, for example `horizon-notes` and `horizon-note-revisions`. Use `commit()` for the single-transaction save, and `claimOutbox` for the GitHub write queue. Raw SQL tables would bypass the store's conflict and idempotency guarantees and its fail-closed behaviour.
   - The annex's "one transaction" and "crash-in-mid-save keeps the previous revision" tests map directly onto `commit()`.

3. Stale or inconsistent sea-rs line citations.
   - Annex A cites "Step kinds `types.rs:50-58`" and stage 6 cites "`ItemKind` (`types.rs:51-59`)". The `ItemKind` enum is lines 51-60 (derive at 49-50, seven variants including `HumanTask` and `AgentTask`). Both ranges are off and disagree with each other.
   - "`CaseCommit` handler (`lib.rs` ~3146)" is wrong. Line 3146 is inside the `ApprovalDecide` arm. The `CaseCommit` handler is at `lib.rs:3175`, and its precondition check at 3189. The enum variant is at 1069.
   - "`events.subscribe` ... (`lib.rs:2468`)": the function `start_subscription` starts at 2466 and its `from_cursor` parameter is at 2472. This is acceptable, but cite 2466. `events.get_range` is at 3034 and `events_get_range` at 415.
   - "`request_id` mandatory (`lib.rs:1866`, `2179`)" is accurate. 1866 is `requires_durable_locator` and 2179 is `durable_locator_refusal()`. The `request_id_reused` response is at 1946 and the `Reused` arm at 1936, so the annex's 1936 is the branch rather than the error text, which is fine.

4. The "check first" on package installs is already answered (stage 1, transport).
   - The annex asks whether `cognate-protocol-connect`, `protocol-connect-bun` and `cognate-client` install from the registry or need a local link.
   - Horizon's `package.json` (lines 18, 40, 42-43) already pins them as vendored tarballs, for example `file:./.cognate/vendor/godspeedai-cognate-protocol-connect-bun-0.8.0.tgz`.
   - Horizon already calls `createClient({service, caller})` in `src/ui/workspace/render.tsx:15` and `:952`. The plan only needs `connectTransport` and `createRemoteRuntimeService` added, from tarballs already vendored.
   - Corrected fact: the check can be dropped. The packages come from `.cognate/vendor`, not the registry.

## 🟢 Minor

- The annex says `declare()` "has a fixed `TARGET` and criteria". In `realitytrace-obligation.ts`, `TARGET = "concept:navigation_intent"` (line 50) is used in `run()` at line 119, not in `declare()`. The fixed criteria are in `declare()` (line 107, `minimum_relevance`/`minimum_reliability: "medium"`), and the question title comes from `expectation.statement`. Every call goes through a private `sxr()` wrapper (line 57) that calls `spawnSync` with a 120 s timeout. A generalisation therefore has to change `sxr()`, not only `declare()`. The snapshot literal `snapshot:horizon` (line 117) is also fixed.
- Reuse hint for stage 1: Horizon already has a `ledger export --json` reader with a 512MB `maxBuffer` (`src/adapters/realitytrace-economics.ts:56`, `:93`) and a second one in `src/adapters/settlement.ts:159`. A read-only allow-list of RealityTrace commands lives at `realitytrace-economics.ts:53` (`READ_ONLY_COMMANDS`) and `config/types.ts:42`. Extend those. Do not write a third exporter.
- `journeys.py:1258` is a nit. In `~/.agents/lib/te-rt/journeys.py`, `_ledger` is at 1255 and `read_observations` at 1259, and the computing function `build_score` is at 1285. The read-time-computation claim is true. Cite `build_score:1285`.
- `config.rs:358`: `SEA_FORGE_ROOT` is read at `config.rs:359` inside the function that starts at 353, and `SEA_FORGE_SOCKET` is at 371. Fine.
- The "stage 2 client bundle" says `Bun.build` is needed, and the cockpit-comparison row says "no client build in Horizon". Horizon's deps already include `cognate-react` and `cognate-ui-astryx`. I did not verify whether they are bundled.
- Stage 1 puts a "Workbench deep link" under C (create) and also under M (Workbench). The two bullets overlap. This is a clarity issue, not a code fact.

## Verified, no change needed (citations spot-checked, 40 or more)

Horizon:
- `grammar.ts` `BLOCK_TYPES` at 350-366 (15 names), `MAX_BLOCKS = 64` at 369, and `SURFACE_INTENTS` at 38.
- `navigation.ts` `GATE_KEYS` at 23-31 (the seven keys match exactly).
- Gate test `test/navigation-controller.test.ts:171`.
- `approval-inbox.ts:100` `buildInbox`.
- `src/config/load.ts:308` `HORIZON_STORE`, `:320` `local:${hostname()}`.
- `config/horizon.toml:6` `.cognate/app.sqlite`.
- Every route line in annex B matches `src/app.ts`. The approval handler is at 1534. The lines 1165-1168 cited are the inbox comment, so "(handler 1166)" is a loose pointer: the `approvalInbox` function is at 1168 and the POST handler at 1534-1552.
- All six listed test files exist.
- `render.tsx:777` exports `STYLE`; `economics.tsx` and `model.ts` exist.
- The t05 guard scripts exist: `scripts/check-t05-boundaries.ts` and the `teeth-t05-*` scripts.
- Commit `18f0c40` exists.
- The settlement runbook file exists.

Cockpit (product-actualizer):
- `cockpit/protocol/spec.ts:175` `BLOCK_TYPES` (same 15 names), `:181` intents, `:183` `.max(12)`.
- zod 4 in product-actualizer, zod 3.25.76 in Horizon.

sea-rs:
- `types.rs:16` `CaseState` (4 states).
- `PlanItem` at 104 has no tag or external-ref field. It has `proposed_by`, which `CaseAddItem` overwrites with the verified actor.
- `ItemMarkers` at 63 holds three booleans (`required`, `repetition`, `manual_activation`).
- `preflight` at `case.rs:184`, `precondition` at 137, template-bytes digest at 149.
- `case.add_item` is absent from `docs/reference/sfwp-protocol-reference.md`. The file exists and mentions `case.commit` and `case.preflight`.

Cognate and Workbench:
- `cognate/packages/realitytrace/src/sxr-cli.ts:111` `snapshot:genesis` (the owner is Cognate, as the annex says).
- `ExpertsService.context` at `cognate-workbench/src/experts/service.ts:138`.
- `service.ts:167` throws "Assignment identity already exists".
- `J-EXPERT-memory.test.ts` tests the Critic role only.
- `COGNATE_WORKBENCH_HOME`, `COGNATE_POSTGRES_URL` and `PORT` are read in `cognate-workbench/src/cli.ts:95-103`.
- `identity.session.issue` and the `wbs1.` token prefix exist.
- The only deep link is `#plugins/<id>` (`App.tsx:4456`).
- `observations.ts:28-33` lists exactly 14 event types. `model.request.retried` is not among them, so model requests are not sent.
- There is no GitHub integration in Workbench or Cognate; the only "github" hits are install hints for agent catalogs.
- The word "poison" is used by Cognate events (`dispatcher.ts`, 11 hits).

~/.agents (structure only):
- `lib/te-rt/{drain.py,journeys.py}` exist, and the field names `agent_event`, `native_session_id`, `te_session_id`, `journey_check` and `payload_ref` appear in them.
- `state/rt/journeys/*.json` exists, one file per repository. Journey scores are not in the witness, as the annex states.

Repository placement: all planned changes sit in the right repository. This covers the `external_ref` and `review` markers in sea-rs, the `snapshot:genesis` replacement in Cognate, the deep link in Workbench, the GitHub connector in Horizon, and the tap in ~/.agents. The one caution is the preview-code change. It belongs in sea-rs, but build it on the existing precondition machinery as in finding 1.

Not verifiable from code: the `gh` 2.103.0 version, the missing `project` scope, the 204MB and 45.7MB ledger sizes, and the `realitytrace` binary not being on PATH. I did not run commands.
SUMMARY (120 words or fewer)
Verdict: NOT READY. An engineer could not build stages 1 to 6 from the annex alone without making design choices. Only stage 1 has a done criterion and a must-run list. Stages 2 to 6 have neither. Most new files have no path, most tests are unnamed or cite design rules by number, and about 15 choices are still open (setting format, clear-command rules, transport registry or link, preview-code algorithm, request_id derivation, DomainForge call, gh versus API, the event-to-record threshold). The throwaway setup comes first, but nothing guarantees production starts clean. Totals: 19 Blockers, 17 Majors, 6 Nits. I could not write the report file because I have no write tool. The full report follows and can be saved to /home/sprime01/projects/Horizon/.agents/reports/2026-11-06-v2-readiness-review/readiness.md.

FULL REPORT
Target: /home/sprime01/projects/Horizon/.agents/specs/Horizon_Operator_Workspace_Design_v2_technical_annex.md (whole file, with §C as the focus). Intent only from /home/sprime01/projects/Horizon/.agents/specs/Horizon_Operator_Workspace_Design_v2.md §9, §9.1, and §5.2 (attention rules). Standard: /home/sprime01/.claude/plugins/cache/egm/egm/0.1.0/resources/document_standards/implementation-readiness-standard.md. Severity labels are text (Blocker / Major / Nit) to follow the no-emoji rule.

Anchors spot-checked and found accurate: grammar.ts:369 MAX_BLOCKS; navigation.ts:23 GATE_KEYS; config/load.ts:320 local tenant; sea-rs types.rs:51, :63, :104; sfwp/case.rs:184 preflight; sea-rs lib.rs:1946 request_id_reused. Not verified: most §B route lines, the tap, and the Workbench files. Nothing was built or run.

PER-STAGE ANSWER TO THE QUESTION
- Throwaway setup (§C "Before stage 1"): Files, partial (C tags, no paths). Tests, no (one unnamed). Done, not stated. Deps, GitHub sandbox not explicit. Unresolved, yes. Order, first, correct.
- Stage 1: Files, fail (no paths for three creates; tap and Workbench files missing). Tests, fail (one unnamed test). Done, partial. Deps, ~/.agents tap has no path. Unresolved, yes. Order, OK.
- Stage 2: Files, partial (grammar.ts named; tables, bundle, and guard files not). Tests, fail (rule numbers only). Done, missing. Unresolved, yes (time zone, schema). Order, OK.
- Stage 3: Files, partial. Tests, fail. Done, missing. Deps, sea-rs deploy unstated. Unresolved, yes (preview code). Order, OK after stage 2.
- Stage 4: Files, fail. Tests, fail. Done, missing. Deps, DeepSeek tool repo absent; cockpit path absent; GitHub scope is a manual gate not in the order. Unresolved, many. Order, the manual gate is not sequenced.
- Stage 5: Files, partial. Tests, fail. Done, missing. Deps, DomainForge has no path. Unresolved, yes (threshold, version code). Order, depends on a threshold that stage 1 never sets.
- Stage 6: Files, partial. Tests, partial. Done, missing. Unresolved, yes (marker pattern, memory rule). Order, no production-clean step.

BLOCKERS

B1. Throwaway setup, annex line 54 and line 56. The "one setup setting" has no name, format, default, or parser location. Line 56 also leaves the Workbench database as "COGNATE_POSTGRES_URL (or the bundled pg0)", an open choice. Fix: name the setting (for example HORIZON_SETUP, values testing | production), the file that parses it (src/config/load.ts), and a mapping table from setup to org id, HORIZON_STORE, XDG_DATA_HOME, XDG_STATE_HOME, SEA_FORGE_ROOT, SEA_FORGE_SOCKET, COGNATE_WORKBENCH_HOME, the Postgres choice, PORT, and the GitHub repo and Project. State that the setting is passed as env at spawn. Pick one Postgres option and give its data directory and start command.

B2. Throwaway setup, line 55. The clear command has no file or name. "Production" and "the throwaway setup's root" are undefined. Fix: define the root (for example ~/.horizon/setups/testing/) and a marker file in it (SETUP.json with name and root). Name the command file (for example scripts/setup-clear.ts). Refuse if the setting is production or the marker is missing. Print the list, then require an explicit --yes.

B3. Production clean start is not guaranteed (lines 56, 57, 64, 69; design §9.1 requires that production be empty). (a) The tap at line 64 is not in the setup list, so it keeps writing real sessions to the default RealityTrace ledger. Production's witness is therefore non-empty from day one. (b) The annex does not say which witness stage 1 reads for the "three real sessions". (c) The throwaway test at line 57 compares "production paths" that the plan never creates. (d) No step starts production. Fix: decide and write it down. Real sessions are read from the operator's default ledger through a read-only path. The production witness is a fresh XDG directory under the production root. The emptiness check covers records Horizon wrote, and the tap is excluded by name. Add a production-start procedure (create root, marker, fresh XDG dirs, start services) and a named check script. Rewrite the line 57 test to list the exact paths and run before and after the clear.

B4. Transport, line 66. "Check first: whether these packages install from the registry or need a local link" gates stage 1 and is unresolved. Fix: run the check now, record the answer in the annex, and state one approach with version pin, for example bun add @godspeedai/cognate-client@<ver> from the registry, or bun link ~/projects/cognate/packages/client.

B5. Desk views have no Create entries. §B says Today, Decide, Work, Explore, Inspector, the status bar, decision cards, composer, and the Setup badge "land in" the desk. None is listed as a file to create, and stage 3's "Done when" (decision cards with previews, confirm button turns off) cannot be built. Fix: add a C line per view and component with its file path, its route, and the stage that creates it.

B6. Stages 2 to 6 have no "Done when" and no "Must be running" (annex lines 71 to 103; only stage 1 has them at line 68 and 69). Design §9 has both. Fix: copy them into each stage as checkable commands. For example, stage 6: "scripts/setup-clear.ts --setup testing --yes; then start production; GET /workspace.json returns zero cases, zero notes, and zero Horizon-written witness records." Stage 2: "bun test src/ui/workspace/notebook.test.ts passes, and the walk-through is saved at <path>."

B7. Attention rules, lines 76 and 81, are cited only by number. The rules are defined in design §5.2, not in the plan. Test cases cannot be written from the annex. Fix: copy rules 1 to 9 into the annex as a table (trigger, expected behaviour). Name each test "attention rule N: <behaviour>" in a named file (for example src/ui/workspace/attention.test.ts).

B8. Stage 1, lines 60 to 65. Undefined: the label table DDL and its store; the label writer's file; the Presenting key and where it is stored; the substitution function's file (the design calls it the view-model layer; the annex never says model.ts); the export file and its format; and the ledger export's JSON fields that the day filter reads. Fix: give the DDL, for example run_labels(tenant TEXT, session_id TEXT, event_id TEXT, record_seq INTEGER NULL, verdict TEXT CHECK (verdict IN ('pass','fail')), first_failure TEXT, created_at TEXT, PRIMARY KEY(tenant, session_id, event_id)). Give the key path (for example <setup root>/secrets/presenting.key, 32 random bytes, created once) and the stand-in rule (HMAC-SHA256 of the name, truncated). Name the substitution file and export file. Add a checked-in fixture of ledger export JSON so the parser's field contract is fixed.

B9. Stage 2, line 72. The DDL for notes, note_revisions, note_placements, and tags is absent. So are the migration mechanism (CREATE TABLE IF NOT EXISTS, or a DurableStore migration), the owner of app.sqlite (Horizon or Cognate DurableStore), and the foreign keys. Fix: write the DDL in the annex, name the migration file, and state the rule for existing databases.

B10. Stage 2, lines 73 and 74. The note part's type is undefined, as are its closed-vocabulary additions to SURFACE_INTENTS and SURFACE_ROLES. The t05 guard files are not named (graft/scripts/ holds several t05 files). The client bundle entry point, the Bun.build config, the served path in app.ts, and the live-update mechanism are all missing. Fix: give the Zod shape for note and the reference kinds. Name the t05 files to edit. Name the entry (for example src/ui/client/notebook.tsx), the build script, the served path, and the polling interval.

B11. Stage 3, line 80. The preview code has no algorithm, canonical encoding, field name, or error class. "The decision handlers" are not named. Fix: specify, for example, preview_code = sha256(canonical_json({template_sha, params, items})), hex, carried in a field named preview_code on CaseCommit and decision requests. Refusal error_class is preview_mismatch. Name each handler (Approve, Reject, Hold, Settle) with its file and line. Name a test, for example preview_code_mismatch_is_refused, in crates/sea-forge-server/tests/. Correct the CaseCommit arm location: lib.rs:3175, not "~3146".

B12. Stage 4, lines 84 and 85. (a) declare() has no signature. Fix: write it, for example declare(input: {target: string; criteria: Criterion[]; cwd: string}): Promise<Expectation>, in src/adapters/realitytrace-obligation.ts, replacing spawnSync with Bun.spawn and await proc.exited. (b) Hand off's request_id derivation is undefined, so the three-times test cannot pass deterministically. Fix: request_id = "handoff:" + sha256(caseId + "\n" + sentence), and state the file (src/app.ts, POST /workspace/intent, line 1468).

B13. Stage 4, line 86 (external_ref). Undefined: the Rust type, the kind values, serde behaviour, and whether old case data still deserializes. Fix: add pub external_ref: Option<ExternalRef> to PlanItem (types.rs:104), with #[serde(default, skip_serializing_if = "Option::is_none")]. Define ExternalRef { kind: ExternalRefKind, url: String } and ExternalRefKind { GithubIssue, Ticket }. Add a named test that old JSON without the field deserializes.

B14. Stage 4, lines 87 to 92 (GitHub connector). The connector has no file list (the directory connectors/github/ is named, its files are not). Open items: "uses the gh CLI or the GitHub API" is an open choice. The outbox table, the from_cursor storage, and the sub-issue fallback are undefined. Sub-issues are unverified. Fix: pick gh CLI or the API. List files (connectors/github/index.ts, outbox.ts, cursor.ts). Define the outbox table (github_outbox(seq INTEGER PRIMARY KEY, kind, payload_json, state)) and the cursor table (github_cursor(name PRIMARY KEY, from_cursor)). Decide now the fallback if sub-issues are unsupported (for example a task list in the parent body).

B15. Stage 4, line 89 (cockpit agent-panel port). No command list, no source file:line in product-actualizer, no target file, no schema for recorded owner answers, and no predicate for "acceptance blocked until the agent replies". The 8-panel cap has no file. Fix: enumerate each command with its source file:line and target file, state the predicate in code terms, and name the test for the cap.

B16. Stage 4, line 90 (DeepSeek-derived tool). Its repository is not in the Repository roots list (line 5), and no file is named. Fix: add its path to line 5, name the file(s) to edit, and state the mapping: request_id = ticket.id, ticket link in external_ref.

B17. Witness write path (stages 4, 5, 6; §A). §A lists only read and config commands (ledger export, projections export, semantic configure, snapshot create). Nothing says how Horizon or Workbench writes a record, what the payload is, or where the "rulebook edition" and "version code" fields live. Fix: name the write command or API and the payload schema, and name the rulebook-edition field.

B18. DomainForge snapshot, line 98. The install method, the call that replaces snapshot:genesis, and the version pin are missing. DomainForge has no path in line 5. Fix: add its path, the install command, the exact call, and the file cognate/packages/realitytrace/src/sxr-cli.ts:111, as the edit location.

B19. Stage 5 threshold, line 99. "Add batching only if above a threshold set in stage 1", but stage 1 never sets one. This is an ordering defect and an unresolved decision. Fix: add to stage 1's done criteria: measure event-to-record delay on the stated command, record the baseline, and set the threshold (for example 2 seconds). Stage 5 then cites that number.

MAJORS

M1. Stage 1, line 67 (Workbench deep link). The route file in cognate-workbench is not named. No test is named. Fix: name the file, the handler, and a test such as "deep link #sessions/<sessionId>/<eventId> resolves to the session view".

M2. Stage 1, line 62 (empty folders, stale notes). Not enumerated. Fix: list every folder and note by path, or give the find command and its expected output.

M3. Stage 1, line 69 (tests). One unnamed test. Missing cases: the label writer's validation (verdict values, optional recordSeq), the day filter, the cache keyed by last record number, the stand-in stability and non-reversibility, the export default, and the Workbench link. Fix: name each test and file.

M4. Stage 1, line 69 (done artefacts). "The walk-through is recorded" and "timings are written down" have no location. Fix: give the path for each (for example .agents/reports/<date>-stage1/timings.md) and the required fields.

M5. Tap change, line 64. No path to the tap files (~/.agents/lib/te-rt/…). The witness record format for journey verdicts is undefined. Fix: name the file and the record fields (event type, payload.extensions keys, payload_ref journey:<id>, exit_code).

M6. Stage 1, line 65 (ledger export). Not stated: which repositories to export, how the repo list is found, and the date-to-record mapping. Fix: list the repos (or the command that lists them), name the cache file and key, and name a timing test with its 1-second threshold.

M7. Stage 2, line 75 ("chosen time zone"). The setting key and its default are not named. Fix: name the setting (for example ui.timezone, default the system zone) and its file.

M8. Stage 2, line 76 (tests). "Two-organization count test" and "crash-in-mid-save keeps the previous revision" are unnamed and have no file. Fix: name both tests and their files.

M9. Stage 3, line 79 and §B. "After parity" has no definition. The old render pages are not listed. The fate of the six test files named in §B (line 49) is not assigned to any stage. Fix: list the files to delete, define parity as a named test set that passes, and assign each test file to the stage that replaces it.

M10. Stage 3, line 81 (tests). The settle round trip is a runbook (.agents/reports/2026-11-03-settlement-live-roundtrip-runbook.md), not a test. No test covers preview mismatch or "confirm turns off when the preview changes". Fix: name the test file and command for the round trip, and add the two missing tests.

M11. sea-rs changes (lines 80, 86, 103). The annex never says how changed sea-rs reaches the running SEA-Forge (rebuild, restart, which binary). Fix: add one deploy step per stage that changes sea-rs, for example cargo build -p sea-forge-server, stop the running server, restart with SEA_FORGE_ROOT from the setup.

M12. GitHub gates (line 92; line 54). The project scope and sandbox repo are manual gates that are not in the stage order. The throwaway setting (line 54) references a sandbox Project before stage 4 needs it. Fix: move the scope and sandbox creation into the throwaway setup section, with a named check, and state the sandbox repo name.

M13. Running services and token (lines 66, 68). No start commands or health checks for the realitytrace CLI, Workbench, or the tap. The token file path and issuance command are not stated. Fix: give the start command and a health check per service, and the token steps: operator runs the issue command for the testing setup and writes <setup root>/secrets/workbench.token with mode 0600. Add a test that the token never appears in logs or records.

M14. Stage 4, lines 88, 93, 94. The three-times and offline tests are unnamed and have no harness. The Workbench assignment call is not named (the cognate-client method). Fix: name each test and file, name the fake GitHub harness, and name the client method.

M15. Stage 5, lines 97 and 98. "Version codes" is not defined in the annex. The Workbench files are not named. The test "records hold version codes, not text" has no name. Fix: define version code, name the Workbench files, and name the test.

M16. Stage 6, lines 102 and 103. The review-marker pattern to follow is unnamed. The UI setting for it is unnamed. The memory-exclusion mechanism (how the author is identified, which filter) is undefined. The path to J-EXPERT-memory.test.ts is not given. Fix: name the pattern (for example the existing boolean in ItemMarkers with serde default), the UI intent that sets it, the exclusion rule as code, and the test file path.

M17. Repository roots (line 5). The product-actualizer (cockpit) and DomainForge repos have no paths. Stage 4 ports from the cockpit and stage 5 uses DomainForge, so both need paths. Fix: add absolute paths to line 5.

NITS

N1. Line 80 and line 86. Paths are relative to unnamed roots ("sfwp/case.rs", "docs/reference/..."). Fix: give full paths from ~/projects/sea-rs.

N2. Line 80. "lib.rs ~3146" is stale. The CaseCommit arm is at lib.rs:3175. Fix: use the exact line.

N3. Line 5. gs-term is listed as a repository but is not used by any stage. Fix: drop it or name its stage.

N4. §B line 49 and "Workbench stylesheet import". The import path is not given. Fix: give the module path and the file that imports it.

N5. Terms used without definition: version code, Presenting, comparison view, case keeper, attention rules, the desk. Fix: add a short glossary at the top of the annex.

N6. Line 56. HORIZON_STORE is listed, but the default and precedence over config/horizon.toml:6 are not stated. Fix: state "HORIZON_STORE overrides config/horizon.toml:6 when set".

ORDER CHECK
- Throwaway setup is listed first. Good.
- Stage 5 depends on a threshold that stage 1 never sets (B19).
- Stage 4 depends on a manual GitHub scope gate that is not in the order (M12).
- Stage 3 and stage 4 change sea-rs, but there is no deploy step (M11).
- Stage 6's review step needs stage 4's agent steps, which the order does not state.
- Presenting (stage 1) must hide names in every export, but no export feature is assigned to a stage.

Nothing was built, run, or edited. No files were written by me.
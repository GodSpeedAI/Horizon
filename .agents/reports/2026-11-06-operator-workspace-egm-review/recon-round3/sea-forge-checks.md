# SEA-Forge and Horizon read-only checks

Paths are under ~/projects/sea-rs/crates unless stated. Nothing was built, run or edited.

## 1. `case.preflight`
- Handler: `sea-forge-server/src/sfwp/case.rs:184` (`preflight`). It returns `PreflightResult` (case.rs:128): `ok`, `template_ref`, `errors`, `items` (id, name, kind per planned item) and an optional `precondition` (case.rs:137).
- The `precondition` is a `RecordDigest` with ref `template:<ref>` and a sha256 of the template file's raw bytes (`resolve_template_digest_source`, case.rs:149).
- `case.commit` rechecks it (`sea-forge-server/src/lib.rs` around 3146-3200) and refuses a stale one with no side effect.
- Answer: only partly. The digest pins the template file. It does NOT cover the `params` or the instantiated items. The same template with different params gets the same digest. So a changed preview (different params) is not caught.
- To add a preview hash: in `preflight()` (case.rs:184), hash the instantiated `plan.items` plus `params` after `validate_proposal`. Return it as a new field on `PreflightResult`. Then `case.commit` (lib.rs, `Request::CaseCommit`, around 3180) would recompute it and compare, probably as an extra precondition ref.

## 2. Marking an agent-task step as a "review"
- `ItemKind` (`sea-forge-core/src/types.rs:51-59`) has SandboxedTask, HumanTask, Milestone, Stage, TimerListener, UserEventListener, AgentTask.
- `PlanItem` (types.rs:104-139) has no tag, label, metadata or free-form field. The fields are `name`, operations, criteria, `item_kind`, `sandbox_class`, `parent_stage`, `markers`, `max_instances`, `depends_on`, `environment` and `proposed_by`.
- `ItemMarkers` (types.rs:62-69) holds only booleans: required, repetition, manual_activation.
- Answer: no field, kind or metadata for "review". The only workaround is a naming convention in `name` or `plan_item_id`.

## 3. `case.add_item`
- Handler: `sea-forge-server/src/lib.rs:3238-3257`, calling `sfwp::case_mutations::add_item` (`sfwp/case_mutations.rs:195`).
- `request_id` is `Option<String>` in the type (lib.rs:1164-1165). It is mandatory because `requires_durable_locator` (lib.rs:1866) lists `CaseAddItem`, and an empty or missing id is refused with `durable_locator_required` and `no_side_effect: true` (`durable_locator_refusal`, lib.rs:1891, used at lib.rs:2179).
- Dedupe is in `dispatch_admitted` (lib.rs:1902) using `dedupe_key` (lib.rs:2279). The key is the request_id plus a payload hash.
  - Same id and same payload: the stored outcome is replayed, or `pending` is returned.
  - Same id with a different payload: refused with `request_id_reused` (lib.rs:1936).
- Documentation gap: `docs/reference/sfwp-protocol-reference.md` has no `case.add_item` entry. A grep for "add_item" found nothing in it. The table at line 93 mentions only `case.commit` and `case.preflight` (line 92). The method is listed in code at `sfwp/mod.rs:257`. It does appear in docs/tutorials/03-authoring-first-workbench-case.md, docs/execution/WORKBENCH_DRAFTS.md and docs/execution/SPEC_CODE_TRACEABILITY.md.
- External link: no field on `PlanItem` for an issue URL or reference. A GitHub URL could only go in `name`, or in an operation's free text (for example `WriteFile.content_hint`, types.rs:147-151). Neither is a real link field.

## 4. Data location
- Cell root is `SEA_FORGE_ROOT` if set, otherwise `.sea-forge` under the current directory (`sea-forge-server/src/config.rs:312, 358-363`).
- The root holds records, templates and `server.yaml`, and the socket by default. `SEA_FORGE_SOCKET` overrides only the socket path (config.rs:370).
- The server takes no command-line flags (`sea-forge-server/src/main.rs:11-24`). Config comes from the environment and `<root>/server.yaml`.
- Two side-by-side locations are supported: run two servers with different `SEA_FORGE_ROOT` values. Each gets its own socket, so test and production do not collide.
- I did not find a database for this. Storage looks file and ledger based. The Postgres module in `sea-forge-server/src/postgres.rs` is about issued sandbox sessions, not the main store. I did not verify this further.

## 5. Outbound hooks
- `events.subscribe` with optional `from_cursor` exists (lib.rs:1026, 1759; `sfwp/mod.rs:127`). Handling is at `start_subscription` (lib.rs:2468): it replays durable events after the cursor, then streams live frames.
- Replay uses `sfwp/events.rs:132-142` and is capped at 500 events (`EVENTS_REPLAY_CAP`, events.rs:37).
- `events.get_range` (from_cursor and to_cursor, events.rs:167) is available for polling.
- `EventFrame` (events.rs:19) has `cursor` (a ledger ulid, monotonic and durable), `kind`, `case_id`, `run_id`, `detail` and `committed_at`.
- Case and step changes publish as `case.trace.<kind>` frames (`sfwp/case_mutations.rs:12-25, 123`). Approvals use kinds like `approval.approved`.
- Subscribe needs a live socket connection (lib.rs:3063).
- Also: `notify_command` in `server.yaml` (config.rs:253), an argv run on completions (docs/reference/configuration-spec.md:72). It is a fire-and-forget hook and failures are ignored.
- No plugin system was found.

## 6. Horizon gate test
- `~/projects/Horizon/test/navigation-controller.test.ts:171`: `expect(Object.keys(choice?.gates ?? {}).sort()).toEqual([...GATE_KEYS].sort());` (GATE_KEYS is imported at line 12 and defined at `src/domain/navigation.ts:23`).
- A grep of test files found no other test that references `GATE_KEYS`.

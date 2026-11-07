# Recon: ~/.agents state, TokenEconomizer and the RealityTrace tap

Read-only inspection. Structure, counts and field names only; no conversation content was read or copied.

## 1. What tokeneconomizer is
- /home/sprime01/.agents/tokeneconomizer is Microsoft/Berkeley "TokenEconomizer" (TE), pinned to an upstream commit on a local `agents-fork` branch with vendored patches (history backfill, multi-harness readers, `te inject`). Pin and patch hashes: tooling/te-integration/te.lock. Apache 2.0, Python 3.10+.
- Goal: cut the cost of coding agents in repos you use often, without modifying the agent. README claims 18-30% lower mean cost on SWE-Bench (their measurement, not ours).
- Three mechanisms:
  1. Micro-skills: facts about a repo (command spellings, build order, env vars) learned from repeated failures, optionally from a model reviewer. A fact is injected at session start after 3 sessions confirm it.
  2. Tool pruning: tools unused over N prompts or sessions are left out via the agent's own settings; reversible.
  3. Loop guard: a judge model detects a stuck turn and adds one redirect note.
- Operator configuration (state/te/config.json): `microskills=envfacts` (deterministic, no model call), `loopguard=off`, `toolprune=off`. So here TE mostly MEASURES; it does not prune or intervene. Doctor reports `model_calls=off`.
- Supports Claude Code, Codex, Copilot CLI, Pi, opencode (experimental). The operator's data also shows cline, zcode, agy.
- Data it writes: per repo and harness, `ledger.jsonl` (one `session` record per agent session), `folded.json` (sessions already folded), `sessions/`, `mechanisms/`, `injection.json`, `untool.json`.
- Ledger session fields: host, repo, session_id, started/ended, turns, prompts, requests, aborts, input/output/cache_read/cache_creation tokens, `effective_tokens`, model, `priced_by`, `injected_chars`, `injection`, `untool`/`untool_applied`, `nudges`, `overhead` {optimizer, spiral_judge, nudge_writer tokens}, `shadow`, `origin` (null=live, `backfill`), `provenance`.
- Metrics exposed: effective tokens, cache reads, TE's own overhead tokens, status and toolprune measure through slash commands (/tokeneconomizer:status, :microskills, :toolprune, :repos, :config), and the experiments/te_bench harness for A/B arms.

## 2. state/te and state/rt (sizes from du; counts from find/jq)
state/ is 4.4 GB, but 3.9 GB of it is `build/` (94k files, mostly `build/scratch` 3.7 GB, build workspace plus RealityTrace target tree; not capture data). `src/` 513 MB is source checkouts. The capture data is small.

state/te (54 MB, about 10k files):
- 938 repo directories, 988 per-harness ledgers, 3,939 session records.
- Records by harness: opencode 3,489; pi 198; codex 94; zcode 69; claude 44; cline 44; agy 1.
- Date range: sessions started 2026-08-04 to 2026-11-06.
- Of the 3,939 records, 3,921 are `origin=backfill` (history replayed from snapshots) and 18 are live.
- Totals across all records: about 5.47 B input tokens, 15.3 B cache-read tokens, 59 M output tokens, 7.46 B effective tokens.
- Caveat (UNCONFIRMED): many repo names look like test or synthetic runs (jolli-localagent-*, gauntlet-prime-live-*, cw-harness-smoke-*), and opencode dominates the count. Real Claude Code coverage is only 44 sessions. Nothing here is demo-grade until filtered.

state/rt (5.6 MB, 30 files):
- `spool/claude.ndjson`: 9,594 pointer lines (3.7 MB), Claude only.
- `drain-state.json`: 16 sessions, 2 enrolled repos (Horizon, cognate-workbench). Counters: 13,932 events ingested, 9,557 pointers, 12 reconciliation mismatches.
- `acked/<repo>/<runtime>-<sid>.ids`: 13,932 delivered event ids (13 files).
- `queue/`: empty, so nothing is pending.
- `journeys/`: 6 per-repo files (Horizon, cognate-workbench x2, gs-term, sea-rs x2); each holds the declared .sea journeys, the generated RealityTrace "questions", the .sea path and sha256, and a history of syncs.
- `repos/`: 6 enrollment records. `config.json`: drain.py path, RealityTrace binary and pinned commit (opt/realitytrace/4d154b12...), `spawn: true`.
- Pointer fields: v, ts, runtime, event, sid, tool, tool_use_id, cwd, root, transcript. Pointers hold ids, names and paths only.
- Captured live by hook: Claude Code only. Other harnesses reach RT only through TE readers and backfill (UNCONFIRMED whether codex or others are enrolled; drain-state shows runtime=claude only).

## 3. Capture pipeline
Source: lib/te-rt/{tap,drain,journeys,rtcore}.py, mirrored in tooling/te-integration/rt/; docs in tooling/te-integration/README.md ("RealityTrace tap").
1. Hook (tap.py, run as the harness hook command). It checks the repo for `.sea/interaction/`. If absent, it exits and writes nothing. That directory is the opt-in. If present, it appends one small pointer line to state/rt/spool/<runtime>.ndjson. On Stop or SessionEnd it starts the drainer detached.
2. Drain (drain.py, under flock). It reads spool pointers from a saved byte offset, then reads the native transcript read-only through TE's trace readers and converts it to ADR-002 `agent-event/v1` events: session_start, tool_post, tool_fail, one `usage` event per native usage record, plus `te` events from the TE ledger (attribution and TE's own overhead). It delivers them to the pinned `realitytrace ingest --stdin-format agent-event-v1`. Delivery is idempotent, and conflicting re-deliveries are kept, not overwritten.
3. Journeys (journeys.py): parses `.sea/interaction/interaction-model.sea` with domainforge (>= 0.21), extracts journey clauses (adapters for horizon, sea-rs, cognate and generic schemas), marks clauses machine-checkable when they name a path, command or similar, and scores each session "declared vs observed" from RealityTrace. Deterministic, no model call. Commands: `te-agents rt sea-sync | score | drain --journeys`.
- Captured: session start, tool calls and failures (with ids and exit codes), token usage per request (so cost), TE overhead, and a per-session journey score. Not captured: prompts, tool inputs or outputs, transcript text.
- Live? Yes for Claude. Last drain was 2026-11-07T00:36Z (UTC; i.e. this evening), result `rt: OK`, 35 events delivered from 5 sessions, and a TE hook process was running during this inspection. Drain exit code 4 indicates an integrity finding; 12 recon mismatches exist (UNCONFIRMED cause).
- Where the RealityTrace store itself lives was not located (UNCONFIRMED); the binary is in opt/realitytrace.

## 4. Pattern vs data, and existing privacy rules
Reusable as PATTERNS (safe to copy into Horizon design):
- Pointer-not-content tap with an opt-in gate (`.sea/interaction/`), 0600 files and 0700 dirs.
- agent-event/v1 as the neutral event schema; idempotent ids and acks; spool offsets plus lock; detached, fail-open drain.
- Journey declaration -> machine-checkable clauses -> declared-vs-observed score.
- Manifest-before-change installs, backups, `no changes` idempotence, memory-capped backfill.

Data Horizon COULD read, with explicit consent:
- state/te ledgers (counts, tokens, host, model, timing, no content). Lowest risk.
- state/rt journeys and acked ids (journey titles and clauses come from the repo's own .sea files; check each for sensitive text first).
- RealityTrace's own store (not content either, by design).
Do NOT read: native transcripts, `state/te/.../sessions/` contents (UNCONFIRMED what they hold; likely derived session data), `state/build/scratch`, `state/src`, `*.bak` configs (may include server settings or secrets), agent-archive snapshots under ~/.local/state/agent-archive (full session copies).

Privacy rules already in place:
- Opt-in per repo; hook never copies prompts or tool I/O; credential files skipped in snapshots; originals opened read-only; snapshot taken only for sessions idle more than 10 minutes; TE data survives uninstall unless `--purge-data --yes`; `model_calls=off` default so no session data is sent to a model.

## 5. How this could supply Horizon needs
(a) Side-by-side regular vs RealityTrace-enriched trace. "Regular" = the TE ledger or pointer view of a session (tool names, token counts, timestamps). "Enriched" = the same session after drain: events keyed to RealityTrace, with declared .sea journeys, per-clause declared-vs-observed scoring, and TE attribution. Candidate sessions: the 16 Claude sessions in drain-state (Horizon repo has live captured data) which have both views today. Horizon can read it as: ledger line + spool pointers for plain; journey file + `te-agents rt score --json` output for enriched. Consent needed before showing any real repo names or paths; a synthetic or redacted copy is the safer demo.
(b) Evals and labels. Journey clauses with machine-checkable refs give deterministic pass/not-observed labels per session. tool_fail events and TE `aborts`/`nudges` give failure labels. Sample is small (16 enrolled sessions), so it is a seed set, not a benchmark. te_bench in tokeneconomizer/experiments has A/B arm machinery that could be a pattern for controlled evals.
(c) Cost and effort per accepted outcome. Cost: ledger tokens (input, output, cache read/creation, effective_tokens, priced_by) plus overhead. Effort: turns, prompts, requests, aborts, tool-call and failure counts. Outcome: the nearest existing signal is journey score and an "ended-green proxy" mentioned in PLUGIN.md (UNCONFIRMED how it is defined). No explicit "accepted" signal (human approval, merge) exists in this data; Horizon would need to supply it from its own approval and settlement events and join on session id. Pricing in `tokeneconomizer/pricing.py`; many records have `priced_by=null` (UNCONFIRMED), so dollars may need Horizon-side pricing.

## 6. Must NOT become an application dependency
- Any path under /home/sprime01/.agents (hard-coded home paths, state/ layout, drain-state.json internals); they are an operator-local control plane that is reconciled by manifest and may move.
- TE itself (a forked, patched Microsoft research plugin pinned by commit), its Python readers, and its config; the drain imports TE's trace readers, so the coupling is deep.
- The pinned realitytrace binary location and CLI flags; use a documented ingest interface instead.
- Live hooks, daemons or the detached drainer; the app must not start, trigger or depend on them.
- Raw transcripts, agent-archive snapshots, or build/scratch.
- Operator-specific repo names in state (sibling repos, test harness repos). Treat as private.
- Pattern dependency is fine; data dependency must be an export Horizon imports with consent (ledger-derived JSON or agent-event/v1 file), not a live read of ~/.agents.

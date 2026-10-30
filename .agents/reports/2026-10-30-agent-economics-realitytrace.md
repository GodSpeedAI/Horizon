# Agent economics + RealityTrace integration: unattended run report (2026-10-30)

Scope: `.agents/prompts/token-economizer.md` (TokenEconomizer, "TE") plus the owner's directives of
2026-10-29/30: wire RealityTrace into every `.sea` project, map interaction-model journeys to
RealityTrace questions so each agent session is scored declared-vs-observed, include it all in the
portable installer, and work unattended with frequent commits, pushes and rollback checkpoints.

## 1. Outcome

| Area | State | Evidence |
|---|---|---|
| TE installed for all agent CLIs, learning from history (all harnesses) | Done earlier, still `doctor: OK` | `te-agents doctor` |
| RealityTrace tap (hooks append pointers; drainer sends `agent-event/v1`) | **Live** for claude + codex; prime via `te-prime` sweep | `RT_TAP=OK`, first real drain: 1 449 ledger records, `ledger verify ok` |
| Six `.sea` repos enrolled; journeys synced as RealityTrace questions | **Live** | Horizon 17, cognate-workbench 109, cognate-workbench-base 102, sea-rs 36, sea-rs-integration 36, gs-term 0 (no journeys) |
| Per-session journey score (match / mismatch / undefined) | **Live** | `te-agents rt score` (run inside a repo) |
| Horizon case-economics view (HC-06) | **Built**, on branch `feat/agent-economics` (not merged) | `GET /workspace/economics`, 14+13+1 tests, real store renders in 0.3 s |
| Installer provisions a capable RealityTrace without touching yours | Done | `te-agents rt provision`; `~/.cargo/bin/realitytrace` sha256 unchanged |
| HC-07 fail-open tests | Partial | tap: garbage input, missing HOME, read-only spool, overflow, latency, RealityTrace down → all fail open (84 tests). SEA-Forge fail-closed: **not tested** |
| Four-arm ablation (Stretch A), handoffs (B/D), failure lifecycle (C) | **Not done** | needs paid model runs; not started unattended (HC-13) |

## 2. How to use it

- Nothing to do for capture: work normally in an enrolled repo. Sessions are drained when they end
  (or run `te-agents rt drain --journeys`). `te-agents rt status` shows the per-repo state.
- Journey score for a repo: `cd <repo> && te-agents rt score` (`--session <id>` for per-clause detail).
- New `.sea` repo: `te-agents rt enroll <repo>` (also syncs journeys). After editing
  `interaction-model.sea`: `te-agents rt sea-sync <repo>` (old questions are never edited; new versions are declared).
- Horizon economics view: merge/checkout `feat/agent-economics`, then start Horizon with
  `HORIZON_ECONOMICS_REALITYTRACE_BIN=~/.agents/opt/realitytrace/<pin>/bin/realitytrace`
  (or an `[economics] realitytrace_bin = …` table) and open `/workspace/economics`. Unset, the page
  explains how to enable it. `Accept: application/json` returns the same figures.
- New machine: `sh ~/.agents/tooling/te-integration/bootstrap.sh --with-realitytrace`.
- Rollback: `te-agents uninstall` (restores hooks/configs from the manifest; keeps learned data),
  or reset to a checkpoint tag (section 5).

## 3. Decisions I made that you did not explicitly define

Design
1. **Journeys → checkable questions by linking tests that name the journey id.** Journey prose almost
   never names a test, file or command (Horizon and cognate-workbench: 0 checkable clauses), so scoring
   would have been all "undefined". `sea-sync` now also declares one question per test file that
   mentions the journey id as a whole token (e.g. `test/J02-live.test.ts` for J02), capped at 8 per
   journey, labelled `linked by a test file` (provenance `test-mentions-id`) separately from questions
   declared by the prose. Disable with `--no-test-links`. Known noise: Horizon J05 links
   `test/support/sequential-fixture.ts` (a helper that mentions J05).
2. **Match rule is strict.** A linked test counts only when a session runs that file by path (or a
   path suffix; `cargo test --test <stem>` for `tests/<stem>.rs`). A bare `bun test` (whole suite) or a
   basename without directory stays "undefined" — under-claiming rather than guessing.
3. **Residuals.** RealityTrace creates residual records only through its own `residual compute`
   settlement step, which nothing runs yet, so the view shows 0 residuals honestly. "Undefined" journey
   counts are the declared-unobserved signal for now.
4. **Lesson savings are never computed.** `agent-event/v1` has no lesson-id or savings field, so the
   view lists TE injections per session with "no estimate recorded" and labels injected tokens
   "estimate" (attribution, not consumption). The ablation table renders "not run".
5. **Economics view shows only repos with agent activity.** Your default RealityTrace store has 527
   enrolled repos; 517 point at deleted temp folders and 9 have no agent events. They are skipped and
   counted on the page ("Not shown: …") so nothing disappears silently.
6. **The tap writes to your default RealityTrace store** (`~/.local/share/sxr`), as one enrolled repo
   per `.sea` project, separate from Horizon's own obligation store. `te-agents uninstall` removes the
   tap but cannot delete those ledger entries (append-only by design).
7. **Drainer rebuilds RealityTrace projections** after delivering to a repo (`projections rebuild
   --all`), so readers see current tables. Fail-open.
8. **Installer never builds implicitly.** `install` prints `te-agents rt provision` when no capable
   binary exists; `--with-realitytrace` opts in. Binary lookup: `REALITYTRACE_BIN` → saved path →
   provisioned pin → a capable binary on PATH. Your `~/.cargo/bin/realitytrace` (0.3.0, no
   agent-event support) is left alone.

Changes to your projects (all on feature branches, never on `main`)
9. **RealityTrace (sxr) bug fix — materially needed.** The first real drain (1 200 events) made the
   Horizon ledger refuse to open: `startup tail-chain verification failed at <id>:241`. Root cause in
   existing code (also on `main`): the startup check verifies the last 1 000 rows as if the window
   started at ordinal 1, so **any ledger longer than 1 000 records becomes unopenable**. Fix:
   `chain_verify_from(anchor, rows)` anchors the window on its predecessor; regression tests fail
   without it; workspace 242/242 pass. No data was lost — the chain was intact; the retry delivered the
   remaining 209 events with no duplicates. **Recommend cherry-picking 6ff3e05 onto sxr `main`.**
10. sxr also gained the `agent-event-v1` ingest format and the `journey_check` event kind (ADR-005).
11. Horizon gained the read-only economics view (adapter allowed to run only `repo list`,
    `ledger export`, `projections export`; AGENTS.md §9 respected — no storage, no writes, gates nothing).

Process
12. Push policy: project repos pushed only as `feat/agent-economics`; `~/.agents` pushed to `main`.
    Annotated `checkpoint/*` tags pushed before each significant change.
13. Memory safety on the 8 GB machine: every build/test ran under a systemd memory cap, cargo with 2
    jobs, one heavy job at a time (WSL had OOM-crashed twice; root cause was the `~/.nub` node shim
    re-executing itself under a non-real HOME — version probes are now process-capped).

## 4. Known limitations / follow-ups

- Only claude and codex sessions are scored live; prime is swept at the next `te-prime` launch;
  opencode/agy/cline have no hook API (history still learned by TE).
- Case binding: sessions show case "unbound" unless `GODSPEED_CASE_ID` is set or
  `te-agents rt case bind <id>` is used. Gauntlet and cognate-workbench do not export a case id to
  CLI agents yet (optional small change; not made because not materially needed).
- `te-agents rt score` reads the whole ledger export each time (fine at current size).
- The Horizon view reads RealityTrace synchronously per request (same pattern as Horizon's existing
  RealityTrace adapter); acceptable for a local cockpit.
- A cold network-clone build of RealityTrace by the installer was not exercised (compile time/RAM);
  the clone/fetch/pin-check path is unit-tested and the build was verified from the local checkout.
- An older provisioned binary (pin 60bb3c2) remains under `~/.agents/opt/realitytrace/`; harmless,
  removed by uninstall.
- Not built: four-arm ablation (needs paid model spend — needs your budget approval), handoffs,
  failure lifecycle, SEA-Forge fail-closed tests.

## 5. Commits and rollback points

| Repo / branch | Commits | Rollback tags |
|---|---|---|
| `~/.agents` `main` (pushed) | 5a1cc13 tap · be3c260 journeys · 5ec8af6 test links · 76e8f9e provision · b1f8aea pin + projections | `checkpoint/2026-10-30-pre-rt-tap`, `-pre-journeys`, `-pre-rt-activation` |
| RealityTrace `feat/agent-economics` (pushed) | 6c37573 ingest · 60bb3c2 journey_check · 6ff3e05 ledger fix | `checkpoint/2026-10-30-pre-agent-ingest`, `-pre-journey-check`, `-pre-tail-verify-fix` |
| Horizon `feat/agent-economics` (pushed) | e95c0bf view · c98c47d repo filtering · this report | `checkpoint/2026-10-30-pre-economics-view` |

Config backups: `~/.local/state/agent-archive/config-pre-rt-20261030T013855` (with SHA256SUMS), plus
the earlier `config-preactivation-20261029T220703`.

## 6. Your action items

1. Codex: approve the TE + tap hooks in Codex's "Hooks need review" prompt.
2. Restart open Claude Code sessions so the new hooks load.
3. Review and merge: sxr `feat/agent-economics` (at least the ledger fix 6ff3e05) and Horizon
   `feat/agent-economics`.
4. Leftover scratch files I was not permitted to delete: `/tmp/R8.bak`, `/tmp/x*`,
   `/tmp/te-rt-lab-*`, `/tmp/te-jr-repo-*`. `tooling/fast-jev-compaction` in `~/.agents` is a
   third-party clone staged as a gitlink by something else; left uncommitted.
5. Decide whether to fund the four-arm ablation (paid model runs).

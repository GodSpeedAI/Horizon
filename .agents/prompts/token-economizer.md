```
# OUTCOME
User (founder, GodSpeed AI) installs Microsoft's TokenEconomizer once under ~/.agents/ for his seven coding-agent CLIs. It starts from his existing session history instead of from zero, and every cost, lesson and handoff is joined to RealityTrace evidence. He can then answer from audited evidence: what any agent already tried on a problem, what it cost, what verifiably worked, and what the optimization actually saved. He can also move a task between agents without rebuilding context.
This build is useless if any of these happen:
- A savings claim cannot be attributed and independently verified.
- Tokens are double-counted.
- A handoff looks successful but silently loses material context.
- Imported history is treated as instruction.
- An optimization or telemetry fault blocks ordinary agent work.
- A SEA-Forge failure lets governed work through.
- A CLI is reported "supported" without a passing test.
It is an operational system, not an architecture proposal.

# STRETCH GOAL
All four bars are measured by raw evidence, never by agent assertion.
- A. Run the four-arm ablation on at least 10 identical tasks, each with an independently executable verifier.
  - Arms: baseline; TokenEconomizer only (TE); GodSpeed navigation only (G); TE + G (F).
  - Report effective tokens per verified settlement for each arm, and `interaction = T + G - B - F` with a paired-bootstrap 95% confidence interval.
  - F must settle at least as many tasks as B.
  - The audit must find zero double-counted tokens.
  - Do not force a positive result.
- B. Show at least one verified native cross-harness continuation, or executed evidence that no native path is safe.
  - Every other installed CLI gets a tested contextual handoff.
  - On a 10-fact seeded fidelity test, every fact the receiver lacks must appear in the handoff diagnostics. Silent loss must be zero.
- C. Complete at least one full failure lifecycle (observed → classified → reproduced → correction proposed → tested against an unchanged adversarial test → promoted or rejected) from real or sanitized history.
- D. Run a paired continuity comparison (no assistance / shared recall / native handoff / integrated). Report fidelity, repeated work, added context tokens, time to first productive action, and tokens per verified settlement, including overhead.

# CONTEXT

## How to read this prompt
Precedence when instructions conflict: safety invariants (INV-*) > hard constraints (HC-*) > OUTCOME > STRETCH > style preferences (such as "prefer Rust").
Priority tiers. Finish P0 completely before spending effort on P1 or P2. If budget runs out, report honestly what is done:
- P0: HC-01 through HC-07 (install, backfill seeding, tap, correlation, cost ingestion, Horizon economics, fail-open/fail-closed tests) plus the four-arm ablation (Stretch A).
- P1: cross-agent continuity (Stretch B and D) and shared recall.
- P2: failure intelligence (Stretch C).
Glossary (use these terms exactly):
- session: one native conversation in one harness.
- thread: a logical task that may span several sessions in different harnesses.
- case / unit: GodSpeed correlation ids (RealityTrace case; Gauntlet unit). The exact owners are to be resolved in recon. Never invent them.
- arm: one experimental condition in the benchmark.
- accounting owner: the single record that owns a token-consumption event.
- native continuation: the receiver opens a converted native session.
- contextual handoff: the receiver is given a structured, evidence-linked summary.
- execution-state continuity: worktree, files, pending operations and approvals.
- historical recall: retrieval of prior knowledge.
These are four distinct capabilities, and each must be measured separately.

## Facts from Sam
Agents and the user's own stated session stores (paths as given, to be verified):
- Claude Code: ~/.claude/projects/<encoded-path>/<id>.jsonl
- OpenCode: ~/.local/share/opencode/opencode.db
- Codex CLI: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl, index ~/.codex/state.db, prompts ~/.codex/history.jsonl
- Antigravity CLI: ~/.gemini/antigravity-cli/conversations/<uuid>.db, transcripts ~/.gemini/antigravity-cli/brain/<id>/.system_generated/logs/transcript_full.jsonl, prompts ~/.gemini/antigravity-cli/history.jsonl
- Pi: ~/.pi/agent/sessions/--PATH--/TIMESTAMP_UUID.jsonl
- prime-agent: ~/.prime/agent/sessions/ (subagents: ~/.prime/agent/session-artifacts/)
- Cline CLI: ~/.cline/data/sessions/<sessionId>/, index ~/.cline/data/db/sessions.db
- ZCode (an extra store, NOT one of the seven CLIs): ~/.zcode/cli/db/db.sqlite
Shared guidance:
- Canonical files: ~/.agents/AGENTS.md and ~/.agents/skills/.
- Intended references or symlinks: ~/.gemini/antigravity-cli/skills/, ~/.cline/skills/, ~/.codex/AGENTS.md, ~/.config/opencode/AGENTS.md, ~/.gemini/GEMINI.md, ~/.pi/agent/AGENTS.md, ~/.zcode/AGENTS.md.

TokenEconomizer (https://github.com/microsoft/TokenEconomizer). The facts below come from a third-party video and public listings. The implementation is authoritative:
- It is a plugin for Claude Code, Codex, GitHub Copilot CLI and Pi, driven by hooks at session start, after each tool use, and at session end.
- Micro-skills are OFF by default. When on, a model call writes facts roughly every 3 sessions, and facts are promoted after later sessions confirm them. They derive from command output, which is a prompt-injection risk.
- Tool pruning silently drops tools unused past a threshold. The video says 10 messages across at least 2 sessions. An earlier note said 5 consecutive sessions. Resolve from code.
- The stuck check uses a model call, nudges once, and never stops the agent.
- Learning is per project. Early sessions can cost more until about the 6th task.
- Learned data lives under ~/.tokeneconomizer by default.
- Microsoft's reported SWE-Bench savings are background evidence, not proof for this environment.
- The video's "fix" was a first-run background job that reads ~/.claude session history. Claude Code retains sessions about 30 days, so history is perishable.

GodSpeed stack: `.sea → DomainForge → Context Kernel → SWE_SEED → SEA-Forge → Gauntlet → RealityTrace`, with Cognate (runtime), Horizon (cockpit, phone remote works) and Cognate-Workbench (coding-agent cockpit).
- RealityTrace is observational. Expectation is frozen before observation.
  - Comparison states: match / mismatch / undefined.
  - Residuals: observed_undeclared, declared_unobserved, declared_contradicted, settled_with_debt.
  - Its CLI includes repo enroll, question declare, threshold declare, run begin, plan create, verify run, ingest (with --extensions), evidence create --derive, delta, ledger verify, projections export.
- SEA-Forge is the authority, default deny, fail-closed. Exit codes per docs: 0 accepted, 3 rejected, 4 escalated/denied, 5 awaiting approval. Verify against the implementation. It governs only operations routed through it.
- Gauntlet terminal states: SETTLED, BLOCKED, BUDGET_EXHAUSTED, ESCALATED, ABORTED, INCONCLUSIVE.
- Context Kernel supplies bounded, cited context and is not authority.
- Docs may be stale. Trust executable behavior.

Candidate reference projects. These were named by Sam, are not required installs, and must have their URLs verified:
- deja-vu (https://github.com/vshulcz/deja-vu): shared recall.
- Baton (https://github.com/Kaseban/baton): native session conversion.
- agit (https://github.com/Einsia/agent-git): session versioning.
- Letta trajectory (https://github.com/letta-ai/trajectory) and trajectoriz (https://github.com/monperrus/trajectoriz): normalization.
- tangle-network/traces (https://github.com/tangle-network/traces): failure analysis.
- Entire CLI (https://github.com/entireio/cli): git-linked provenance.
- Agent Data Protocol (https://github.com/neulab/agent-data-protocol): schemas, only if there is a clear interoperability benefit.
Selection rule: pick the smallest coherent combination covering shared recall, high-fidelity continuation, session identity and provenance, normalized trajectories, evidence-grounded failure analysis, and verifiable economics. Reuse proven capabilities, write small adapters for genuine gaps, and pin versions and commits.

## ASSUMPTIONS
- ASSUMPTION: the shared state root is ~/.agents/state/ (subdirs te/, history/, spool/, handoffs/), mode 0700, and TokenEconomizer's data dir can be redirected there by env var or symlink. If not, record the deviation.
- ASSUMPTION: TokenEconomizer's code installs under ~/.agents/tokeneconomizer/ as one canonical copy, with per-CLI adapters referencing it.
- ASSUMPTION: antigravity, opencode, cline and prime-agent have no official TokenEconomizer adapter. Each gets a narrow adapter if feasible, otherwise a documented log-only status.
- ASSUMPTION: "GodSpeed navigation only" (arm G) means Context Kernel context plus SWE_SEED contract plus RealityTrace-delta feedback to the agent, without TokenEconomizer. Freeze the exact definition in Phase 1.
- ASSUMPTION: shared recall (deja-vu or equivalent) is OFF in all four ablation arms, because the arms are a clean two-factor experiment. It is evaluated only in Stretch D.
- ASSUMPTION: target tap overhead is p99 added hook latency ≤ 50 ms, adjustable after measuring baseline hook cost. Record the chosen value before Phase 4.
- ASSUMPTION: the benchmark runs on one primary harness that TokenEconomizer officially supports (default Claude Code) with one pinned model.
- ASSUMPTION: the GodSpeed repos are checked out locally. Discover their paths and never assume them.
- ASSUMPTION: User may use WSL and Windows-native CLIs side by side. Do not assume they share paths or SQLite file locking.

## UNRESOLVED (answer by inspection, write answers with evidence before choosing architecture; do not ask Sam)
Environment
1. Installed CLI versions, runtimes, session formats, and whether each runs in WSL or Windows-native.
2. Hook and lifecycle events per CLI. How the prime-agent hook model, config path and guidance path work.
3. MCP, plugin, dynamic guidance and user-level skill support per CLI.
4. Which configs can safely be symlinked without breaking upgrades.
5. Session retention and compaction per harness.
6. Locations of the GodSpeed checkouts.
Optimization
7. TokenEconomizer's actual adapters, defaults, relocatable install, per-project learning under a global install, pruning thresholds and safety checks.
8. Whether historical sessions can seed learning through a supported interface, and how cost and event data are recorded.
Continuity
9. Overlap among deja-vu, Baton, agit, Entire, Letta trajectory and trajectoriz.
10. Which source→target pairs have a reader, a writer, an import path and verified continuation.
11. How reasoning, tool calls, results, attachments and ids are preserved.
12. Compacted or interrupted session reconstruction.
13. How handoffs are reversed, retried and rolled back.
14. License and network egress behavior of each candidate, including whether Entire pushes checkpoints to a remote.
Evidence
15. Where normalized events enter RealityTrace, how extension fields are versioned, and where Gauntlet case and unit ids are exposed to hooks.
16. Which token measurements are exact, estimated or unavailable per harness, and how cache tokens are reported.
17. How Horizon registers views and projections.
18. Which agent actions are actually routed through SEA-Forge in this integration, and which bypass it.
19. Existing GodSpeed tests covering any of this.
Benchmark
20. Source of at least 10 tasks with independent verifiers. Default plan: reconstruct tasks from bug-fix commits in the GodSpeed or other local repos (check out the parent commit, use the added or changed test as the hidden verifier).
21. How history is excluded from benchmark tasks to prevent solution leakage.

# HARD CONSTRAINTS
Sam's words, verbatim, each checked in VERIFY:
- HC-01: "install https://github.com/microsoft/TokenEconomizer globally on my machine in my ~/.agents/ directory for all my agents: claude code cli, codex cli, antigravity cli, opencode cli, pi cli, prime-agent cli, and cline cli"
- HC-02: "instead of it solely relying on gathering data for understanding patterns from the point i installed onwards, it should also go through the session history that's being stored in the ~/.claude/ folder. start learning the patterns from there first and then keep learning from the usage onward too"
- HC-03: "Hook tap: a small command registered on the same post-tool and session-end events that TokenEconomizer uses. It writes one normalized event per call into realitytrace ingest. The README documents a cargo-test-json stdin format, so a hook-event format is the new piece. It runs asynchronously and never blocks the agent."
- HC-04: "Correlation ids on every event: case, Gauntlet unit, TokenEconomizer session id. This is what lets cost, evidence and settlement be joined later and rolled up without counting any token twice."
- HC-05: "Read TokenEconomizer's own cost and event files into the same trace so injected tokens and overhead are charged to the arm that used them."
- HC-06: "A Horizon view of case economics, so the cost of each attempt and the saving from each lesson are visible next to the evidence."
- HC-07: "test and benchmark the system, considering those Optimization fails open. Authority fails closed cases"
- HC-08: "Avoid building a new agent framework. Compose the best parts of existing open-source tools and integrate them through narrow, maintainable interfaces."
- HC-09: "Never allow optimization, memory, session conversion, or telemetry components to acquire SEA-Forge authority."
- HC-10: "Never modify original transcripts."
- HC-11: "Back up configuration before modifying it." and "Do not overwrite existing content or assume that these paths are universally supported."
- HC-12: "Retain native CLI execution, authentication, model selection, tools, and session storage. Do not route every model call through a new central proxy."
- HC-13: "Micro-skills and paid model-assisted functionality must not be silently activated."
- HC-14: "Do not fake an installed dependency, a successful test, or a settlement."
- HC-15: "No claim of full compatibility without executing representative tests."
- HC-16: "No unapproved remote publication or synchronization of transcripts."
- HC-17: "No automatic promotion of untrusted historical facts." and "No substitution of historical claims for independent verification."
- HC-18: "No concurrent unsafe mutation of native sessions." and "Never mutate a live source session destructively."
- HC-19: "No hidden coupling between telemetry availability and authority decisions."
- HC-20: "Restore native agent usability after any failed integration." and "Keep configuration changes reversible and upgrades maintainable."
- HC-21: "Preserve this ablation as a clean two-factor experiment. Do not silently add cross-agent handoff only to the full-integration arm and then attribute its savings to TokenEconomizer."
- HC-22: "Do not let the same agent's assertion substitute for independent proof."

Approval gates. The agent NEVER self-approves these. Prepare the exact command or diff, write it to DECISIONS_FOR_User. md (with the cost estimate where applicable), and continue other work:
- Enabling micro-skills or any model-assisted learning in Sam's real configuration. In scratch environments it may be enabled for benchmark arms within the spend ceiling.
- Any model spend above the recorded ceiling.
- Writing a converted session into a real native store.
- Any push, sync or upload of transcripts or checkpoints.
- Editing global guidance (~/.agents/AGENTS.md or the symlinked guidance files) from learned lessons.
- Purging any index or archive.
Never wait on User mid-run. Record and continue.

# EXPERT DEPTH
- Work a top practitioner does that the request omits:
  - Pre-register the experiment before running it: tasks, arm definitions, metric formulas, analysis script (hashed and committed), and stop rules. Neither the builder nor the benchmark runner may change them afterward.
  - Prevent benchmark leakage. Hold-out tasks and their fix sessions must be absent from backfill, shared recall and TokenEconomizer learning. Each arm starts from a frozen snapshot of learning state, in an isolated project clone, in randomized order, with prompt-cache effects recorded.
  - Archive first. Snapshot all session stores read-only before installing anything, because retention is perishable. Use the sqlite online-backup API, or copy db plus wal plus shm together. Never open a live DB for writing, and skip or quiesce sessions modified within a recent window. Store archives mode 0700, outside git and any synced folder.
  - Dry-run everything in a scratch HOME (HOME override) before touching real config. Keep a manifest of every file the installer touches, with before-hashes.
  - Treat every candidate dependency as untrusted code that will read secrets. Build from a pinned commit, review its install scripts, run it network-denied, and assert no outbound connections. Disable any telemetry or remote checkpoint sync.
  - Make idempotency keys from stable fields only (source runtime, native session id, native event id or ordinal plus content hash). Exclude volatile wrapper metadata.
  - Test redaction with planted canary secrets. Do not assume a scanner catches everything.
  - Wrap retrieved history in a clearly labelled untrusted-data envelope with provenance. Test it against injection fixtures.
  - Keep a debt ledger: each custom adapter with its upstream dependency, owner, upgrade test and removal criteria. Add format-drift canary tests per CLI version.
  - Normalize WSL and Windows paths. Check line endings and SQLite file locking.
  - Use a spool file with a separate drainer for the tap, so the hook only appends and returns. Prefer a small compiled binary over a heavyweight interpreter startup.
- Start from this material, not from scratch: the TokenEconomizer repo (code, tests, config), the RealityTrace README, CLI and ingest tests, SEA-Forge tests, Gauntlet and SWE_SEED tests and benchmarks, Context Kernel, Cognate and Horizon repos and design conventions, each CLI's session fixtures, the candidate repos, and the session stores listed above (read-only copies).
- Methods and tools: sqlite online backup; JSON Schema validation; property-based tests for dedup and accounting; a deterministic replay harness; paired bootstrap statistics; fault injection by kill, SIGSTOP, disk-full and file corruption; a network-deny sandbox; a secret-scanner plus canaries; headless Chromium for Horizon; a second-model CLI for review.
- Proof other than the agent's word: verifier exit codes from tests the agent cannot edit (read-only mount or hash check); native usage reconciliation; byte-identical replay projections; `realitytrace ledger verify`; network-egress logs; UI assertions tied to projection data; pre-registration hashes; an independent reviewer's findings.

# RESOURCES (confirm before building; stop and report any that fail)
- [ ] Software: git, Rust toolchain, Node or Bun, Python, sqlite3, a secret scanner, headless Chromium (Playwright), a network-deny mechanism (namespace, firewall or container).
- [ ] The seven CLIs: for each, detected version or "absent". An absent CLI is reported, never simulated.
- [ ] Data: read-only snapshots of every session store above, plus the ZCode store as an extra source.
- [ ] Context to read first: AGENTS.md, CLAUDE.md, README and existing skills in each GodSpeed repo and in TokenEconomizer; ~/.agents/ as it exists now.
- [ ] Environment: a scratch HOME and scratch worktrees where the agent can install, run real CLIs against throwaway projects, kill processes and replay sessions, with no production credentials.
- [ ] Services: a RealityTrace instance, a SEA-Forge instance with a test policy fixture, the Horizon dev environment.
- [ ] A second model CLI for review (Codex or equivalent), or Claude Code in non-interactive mode as fallback (disclose the limitation).

# SKILLS TO CREATE
Check ~/.agents/skills/ and each repo's .agents/skills/ first. Reuse and extend. Create only where the procedure repeats, a generic agent would get it wrong, and it fits one narrow SKILL.md (frontmatter `name` and `description` with a precise trigger; imperative steps; failure modes; a verification step; under 150 lines; one job each). Maximum five. Create each before the work it governs. Do not replace existing project instructions.
1. `agent-global-integration`: safe install, adapters, scratch-HOME dry run, manifest, rollback, doctor check.
2. `agent-history-learning`: read-only snapshot, normalization, dedup, quarantine, redaction, candidate lessons, promotion gates.
3. `agent-session-continuity`: handoff transaction, quiescence, locks, target validation, worktree checks, recovery.
4. `agent-evidence-economics`: tap events, correlation, accounting ownership, reconciliation, benchmark pre-registration and analysis.
5. `agent-failure-hardening`: failure mining, reproduction, adversarial regression tests, and this project's review checklist (INV-* and FI-* below). This is the review skill.

# BUILD
Execution protocol:
- Keep PROGRESS.md (phase, decisions with rationale, evidence links, blockers) and re-read it after any context loss.
- One coordinating agent owns architecture, authority decisions and final verification. Subagents get bounded, worktree-scoped tasks with an owner, an acceptance condition and a verification artifact. They never edit the same file concurrently and never receive production credentials.
- Place code where it belongs: the ingest format and tests in the RealityTrace repo; views in Horizon; the session picker in Cognate-Workbench; the global installer, adapters and doctor under ~/.agents/ (git-tracked locally). Use feature branches or worktrees and local commits only. Never push.
- If a component is unavailable, continue independent phases and report the blocker. Run VERIFY for a phase before starting the next. P0 phases complete before P1, and P1 before P2.

Phase 0, Preflight. Preflight snapshot and safety.
- Create the scratch HOME and PROGRESS.md.
- Inventory the CLIs.
- Archive all session stores read-only with source hashes.
- Verify the candidate URLs resolve.
- Exit: archive hashes recorded; originals unchanged (INV-02).

Phase 1, Recon and decision record.
- Answer UNRESOLVED 1–21 with evidence.
- Build the CLI capability matrix with these statuses:
  - SUPPORTED_NATIVE
  - SUPPORTED_ADAPTER
  - CONTEXT_ONLY
  - READ_ONLY
  - UNSUPPORTED
  - UNVERIFIED
- Rows (every cell evidenced or UNVERIFIED):
  - version
  - session location and format
  - history read
  - native write/import
  - resume
  - contextual handoff
  - hooks
  - MCP/guidance/skills
  - token data quality (EXACT / DERIVED / ESTIMATED / UNAVAILABLE)
  - TE support
  - RealityTrace event support
  - worktree/repo metadata
  - WSL/Windows
  - limitations and fallback
- Run a candidate comparison, including license, pinned commit and egress test.
- Select the architecture and write a decision record per chosen or rejected dependency.
- Freeze the metric definitions, arm definitions and event schema v1.
- Exit: an evidence-backed architecture with no invented compatibility claims (INV-14).

Phase 2, Global install (P0).
- Install TokenEconomizer once under ~/.agents/, wire adapters, and preserve existing configuration. Leave micro-skills off in real config.
- Prove install and uninstall in scratch HOME.
- Add a doctor command that reports per-CLI status.
- Exit: all seven CLIs have a demonstrated status and remain usable (HC-01, HC-11, HC-20).

Phase 3, Backfill and TE seeding (P0).
- Normalize deterministically from the snapshots, dedupe, and attach repo and worktree.
- Seed TE learning from ~/.claude history through a supported mechanism, as quarantined candidates that TE's own confirmation rule governs.
- Set up incremental ingestion via the session-end hook plus an idempotent sweep. No always-on daemon unless justified.
- Record model-assisted extraction as a separately owned, capped cost.
- Exit: a repeat backfill yields identical state; candidates are not injected until promoted; a canary-secret and injection fixture passes (HC-02, HC-17, INV-02/03/04/09).

Phase 4, Tap, correlation and accounting (P0).
- Build the passive tap, with schema v1 and an append-only spool.
- Add correlation ids, ingest TE cost and event files, and implement ownership, dedup, orphan queue and reconciliation.
- Event sources are kept distinct:
  - harness hooks;
  - TE files;
  - continuity tools;
  - Gauntlet, SEA-Forge and verifier outputs ingested by their owners.
  - The tap never authors a verification or settlement claim.
- Events without a declared case carry case_id=unknown. Never create an expectation after the fact.
- Exit: deterministic replay gives identical accounting; the rollup invariant holds; a fabricated count fails reconciliation (HC-03/04/05, INV-05..08).

Phase 5, Horizon case economics (P0).
- Extend Horizon through its real extension points.
- Show cost, overhead, per-lesson estimated savings (labelled estimate vs observed), evidence, residuals, unattributed usage and the ablation table.
- Exit: UI assertions match projections (HC-06, INV-13).

Phase 6, Fail-open/fail-closed tests and the four-arm ablation (P0).
- Run FI-01..FI-12 on the core path, then the pre-registered ablation.
- Record the estimated spend before running, set a ceiling at 1.5× the estimate, and stop at the ceiling.
- Exit: results with raw evidence, confidence intervals and negative findings (HC-07, HC-21, Stretch A).

Phase 7, Continuity (P1).
- Integrate shared recall and the selected conversion path.
- Implement the handoff transaction:
  1. Select a source and resolve its repo, worktree and thread.
  2. Confirm quiescence and take a consistent checkpoint.
  3. Check the target's capabilities and choose native or contextual.
  4. Convert into a scratch copy, validate, and launch the target in scratch HOME.
  5. Only with approval, import into the real store, backing it up first.
  6. Verify the receiver can name the pending work.
  7. Record the transition and its fidelity diagnostics.
  8. Release locks.
- Use advisory locks with PID and start time and stale-lock detection. Refuse when worktrees conflict.
- Make handoffs user-initiated only.
- Exit: at least one verified native pair, or executed evidence that none is safe; contextual fallback for every other installed CLI; rollback tested (Stretch B, INV-10..12).

Phase 8, Failure intelligence (P2).
- Mine normalized trajectories for repeated failures and treat classifications as candidates.
- Run the full lifecycle with a frozen reference and independent verification, and retain failed experiments.
- Exit: one complete lifecycle (Stretch C, HC-17).

Phase 9, Workbench and continuity benchmark (P1).
- Add the minimal session list, search, lineage, compatibility preview, safe handoff and recovery view, showing repo, branch, worktree and pending task before handoff.
- Run Stretch D with paired tasks.
- Exit: UI assertions pass; D results with overhead.

Phase 10, Hardening and report. See below.

# VERIFY
Every invariant needs executable evidence: the command, its output, and an exit code. No "done" without output.

Invariants and checks:
- INV-01 (HC-01/11/20). Every changed file appears in the manifest. Uninstall in scratch HOME restores before-hashes. A failed integration leaves each CLI starting normally (smoke-run each).
- INV-02 (HC-10). Source stores hash-identical before and after all phases.
- INV-03 (HC-02/17). Re-running backfill yields identical logical state. A history item stays a candidate until promoted by the stated gate.
- INV-04. A planted prompt-injection string in a historical tool result never appears outside the untrusted-data envelope, and never changes agent behavior in the injection test.
- INV-05. Every token has exactly one accounting owner. Case total = sum of unit totals = sum of owned worker-session totals, for complete scopes. Imported sessions create zero new historical consumption. Conversion cost is its own owned event.
- INV-06. A fabricated or edited usage event fails reconciliation against native usage records. Discrepancies are reported, with measurement quality tagged EXACT/DERIVED/ESTIMATED/UNAVAILABLE. The headline benchmark uses EXACT only.
- INV-07. Missing ids are marked unknown or queued as orphans, never invented.
- INV-08. Replay of the same inputs reproduces byte-identical accounting and lineage projections. `realitytrace ledger verify` passes.
- INV-09. Redaction canaries never appear in indexes, handoffs or reports. No outbound connection occurs during any candidate-tool run.
- INV-10. Two processes cannot corrupt one native session (lock test). A live, actively written source is refused or safely snapshotted.
- INV-11. A native import passes format validation and the receiver identifies the pending work. Failure leaves the source resumable.
- INV-12. A handoff with a changed target worktree or branch stops with a clear alternative.
- INV-13. Every Horizon figure equals the audited projection. Observed costs and counterfactual savings are labelled separately.
- INV-14. Every status in the capability matrix has a command or test behind it. Nothing "supported" without execution.
- INV-15 (HC-09/19, fail-open). With TokenEconomizer, recall, handoff assistance or the tap killed, hung, or queue-overflowed, ordinary agent tasks complete with the same verified outcome. Tap latency stays within the recorded budget, and drops are counted.
- INV-16 (fail-closed). With SEA-Forge absent or its policy unloadable, a governed consequential operation in the test policy is denied or held (non-zero exit as implemented). With RealityTrace down, an operation whose contract requires evidence is held, not passed. Undefined outcomes are never counted as success. Report which operations are actually routed through SEA-Forge, and mark unrouted ones as residual risk.
- INV-17 (passivity). Authority decisions are identical with the tap on or off across identical runs.
- INV-18 (HC-16). No network egress of transcripts or checkpoints. Remote sync features stay disabled.
- INV-19 (HC-13). Real config has micro-skills off unless User approved. Model spend never exceeds the recorded ceiling.

Fault-injection cases (all on fixtures or scratch HOME, never on Sam's real data):
- FI-01 kill TokenEconomizer during session end.
- FI-02 hang RealityTrace ingest for 10× the tap timeout.
- FI-03 overflow the telemetry queue.
- FI-04 corrupt a historical session file.
- FI-05 import the same session through two tools.
- FI-06 handoff into an unsupported target.
- FI-07 handoff while the source is actively writing.
- FI-08 change the target worktree between checkpoint and import.
- FI-09 inject a malicious instruction into a historical tool result.
- FI-10 retrieve a stale or previously rejected decision (it must come back marked rejected or superseded, never endorsed).
- FI-11 remove SEA-Forge or make its policy unloadable.
- FI-12 alter or delete a fixture transcript after evidence was recorded.
- FI-13 fabricate a token-count event.
- FI-14 retry a partially completed handoff.
- FI-15 interrupt an agent just before a checkpoint.
- FI-16 DomainForge, Horizon projection and shared-index failures (each must degrade without blocking ordinary agent work).
- FI-17 path traversal in a session id or file path.
- FI-18 concurrent agent activity.

Benchmark protocol:
- Metric. Effective tokens per verified settlement.
  - Report raw components (input, output, cache write, cache read) separately.
  - Define effective tokens as a stated formula over those components, using a pinned pricing table. Also report the plain token sum.
  - Freeze the metric before the first run.
  - If an arm has zero settlements, report "undefined", never infinity or zero.
- Costs. Include injected skills, learning overhead, hook overhead, retries and amortized backfill.
  - Present direct and amortized figures, with the amortization policy stated.
  - Each expense is a uniquely owned event.
- Runs. Use paired tasks, randomized arm order, fixed model and version, fresh isolated clones, and at least 3 repeats per task per arm if the ceiling permits. Otherwise run one repeat and label the results exploratory. Report the paired-bootstrap CI with at least 10,000 resamples.
- Verifiers. Verifiers are read-only to the agent. Gauntlet or the harness runs them, and the agent's claim of success counts for nothing.
- Fidelity test (Stretch B and D). Seed ten known facts: an architecture decision, an exact value buried early, a rejected implementation, a failed test and its diagnostic, an unresolved requirement, a modified file and line, a pending approval, a version constraint, the Git state, and an unfinished operation. Ask the receiver without revealing answers. Score against a hidden key with exact-match grading, not by the agent. Separate conversion loss from retrieval or reasoning failure.
- Continuity comparison. Measure preparation and conversion time, context retrieval time, added context tokens, repeated tool calls, file reads and failed commands, time to first productive action, settlement rate, and total tokens per settlement.

# ADVERSARIAL HARDENING (mandatory final phase)
1. Freeze the build.
2. Invoke a different model than the builder, via CLI. Give it the requirements, the diff, the tests and the evidence, and tell it to attack the work.
   - It must challenge claims of lossless transfer, injection boundaries, cross-project contamination, duplicate accounting, false causal attribution of savings, wrong task or worktree restoration, partial handoffs and concurrency, governance bypass, telemetry-induced latency, hidden coupling between optimization and authority, unsupported-CLI claims, test independence, regression-test gaming, benchmark leakage and overengineering.
   - It must return findings with file and line references, ranked by severity.
3. Reproduce and fix every confirmed finding. Dispute a finding only with executable evidence.
4. Re-run the full applicable VERIFY suite.
5. Repeat until a pass yields no high or medium findings, or three passes complete.
6. If no second model is available, spawn a fresh non-interactive session with only the diff, the spec and an attacker prompt, and disclose that limitation.

# REPORT
Write the report to a file (record the path) and give a concise summary in the final message. Declare completion only for outcomes backed by evidence. The report contains:
- Executive outcome against the MISSION and each stretch goal (met / not met / unproven).
- A Mermaid component diagram with authority boundaries, and a Mermaid sequence diagram of a cross-agent handoff.
- The dependency decision table: project, role, selected or rejected, license, pinned commit, egress result, rationale, integration debt.
- The full CLI capability matrix with demonstrated evidence.
- Installation, backfill and rollback: locations, files changed, source inventory, imported and rejected candidates, idempotency results.
- The continuity pair matrix with fidelity scores and overhead.
- The ablation table with all four arms, settlement counts, raw components, interaction term and CI, and uncertainty.
- The Stretch D results.
- Failure intelligence: failures observed, corrections, tests, verified improvements, rejected hypotheses.
- Horizon and Workbench evidence.
- Test evidence: commands, exit codes, ledger verification, fault-injection results, replay audits.
- Findings by hardening pass with resolutions, remaining risks, the debt ledger, and DECISIONS_FOR_User. md.
- Maintenance: how to upgrade dependencies, repair adapters after CLI format changes, restore configuration, rebuild indexes, verify the ledger, and safely disable the system.
- Answers to these eight questions, each evidenced or marked unproven: Can I switch agents and genuinely continue work? Which transitions are native vs contextual? Can agents reuse verified lessons? Does historical learning improve efficiency? Can repeated failures be identified and prevented? Are the savings real and attributable? Are GodSpeed's governance boundaries preserved? What remains unsupported or unproven?
```

---

```
# ADDENDUM: ORCHESTRATION, MODEL ROSTER AND EXECUTION MODE
This addendum amends the main prompt above. Where they conflict, this addendum wins for orchestration, model use and the benchmark harness. Everything else in the main prompt, including its hard constraints (HC-*), invariants (INV-*), approval gates and report requirements, still applies.

# OUTCOME (addendum)
The build runs end-to-end from one interactive Claude Code session with Opus 5.5 as coordinator. Opus decides, verifies and packages approvals, and cheaper or different-family workers do the volume work. Every worker is isolated, and every worker's output is checked by something other than the worker that produced it. Failure modes specific to this mode:
- Opus's context is flooded with recon or logs.
- Build-time token spend contaminates the benchmark accounting.
- Installing TokenEconomizer or the tap into the real config alters the very session that is building it.
- A worker's claim is accepted without mechanical proof.
- Quota is exhausted mid-phase with no resumable state.

# CONTEXT (addendum)

## Execution environment
- The session runs in Claude Code with its working directory at the Horizon repo. The work spans other repos and directories (~/.agents/, RealityTrace, Cognate-Workbench, TokenEconomizer, Gauntlet, SEA-Forge, SWE_SEED and others discovered in recon). Grant access with the harness's multi-directory mechanism and use one git worktree per repo per task. Do not edit any repo's main working tree directly.
- Work on a feature branch in each repo (suggested name `feat/agent-economics`), with local commits only. Never push, and follow Horizon's own AGENTS.md and CLAUDE.md.
- Orchestration state lives outside any source repo, in ~/.agents/state/build/ (mode 0700). It holds PROGRESS.md, DECISIONS_FOR_User. md, task packets, worker reports, ADRs and benchmark pre-registration. These replace any locations named in the main prompt.

## Model roster (Sam's confirmed choices)
Exact harness invocation and flags are UNRESOLVED. Discover them from each CLI's `--help` and docs; never invent flags.
- Opus 5.5, in the main Claude Code session: coordinator.
- Sonnet 5.5, as Claude Code subagents: implementers, per-phase verifiers, and the benchmark replication. Use Xhigh effort, not Max (reported to trigger sub-agent review loops, timeouts and out-of-scope edits).
- Haiku 5.5, as Claude Code subagents: recon, inventories, log and transcript summarization, structured extraction with citations.
- GLM 5.3 Flash (harness TBD in recon; likely via an OpenCode, Cline or Claude-Code-compatible endpoint): parallel recon, visual or screenshot verification of Horizon and Workbench, bounded adapters.
- Sol 6.1 via Codex CLI: primary adversarial reviewer. Use high effort (reported to score higher at high than at max).
- DeepSeek V4.1 Flash (the 1017 snapshot): candidate benchmark subject model and bounded implementation, via whichever harness is verified in recon (Pi is the first candidate).
- Kimi (the exact ClinePass model to be recorded): optional second reviewer for planning and architecture critique.
- Gemini 3.8 Flash inside Antigravity only: conformance tests of the Antigravity adapter. It is reported to be harness-dependent and weak on hard agentic tasks, so give it nothing else.
- Never assign authority logic, token-ownership logic, dedup keys or ledger code to a flash-tier model. If the assigned model or harness is unavailable, substitute per the fallback table in PROGRESS.md and log the substitution. A substitute for the reviewer must still be a different model family than the builder.

## Facts about the roster (reported, not verified; mark as ASSUMPTION in the ADRs and re-verify against your own bake-off)
- Sonnet 5.5 is reported to match or beat Opus 5.5 on terminal-style agentic tasks at half the price. Opus is reported stronger on judgment-heavy and long-horizon engineering benchmarks.
- Haiku 5.5 is positioned by Anthropic for lookups, summaries and subagent work, and is far behind Sonnet on hard agentic coding.
- Sol 6.1 is reported strongest on DeepSWE among the OpenAI models.
- DeepSeek V4.1 Flash is cheap and fast but verbose, and may be less reliable at holding a plan across turns and recovering from tool-call failures.
- Claude Code subagent mechanics (definition file location, `model` field, tool restrictions, whether subagents load user-level skills) must be read from current documentation or `/agents` behavior. Do not assume.

## ASSUMPTIONS (addendum)
- ASSUMPTION: maximum parallel workers is 4. Adjust after observing rate limits and record the value.
- ASSUMPTION: Sam's Claude and ChatGPT subscriptions have finite usage limits, with Opus, Sonnet and Haiku sharing one pool. Spend is controlled by self-imposed per-phase budgets, because the remaining quota cannot be read programmatically.
- ASSUMPTION: Pi reports exact provider usage for DeepSeek. This is the open question that decides the benchmark harness (see Benchmark mode below).
- ASSUMPTION: each worker CLI stores its authentication in its own config directory. Whether it honors a config-directory environment override is UNRESOLVED.

## UNRESOLVED (addendum, answer in Phase 0/1)
1. Non-interactive invocation, sandbox and permission flags, and structured-output options for Codex, Antigravity, OpenCode, Pi, Cline and prime-agent.
2. How each worker CLI authenticates and whether its config directory can be redirected without breaking login. Credentials must never be printed, logged or copied into evidence.
3. How Claude Code subagents are defined and constrained here (model field, tool allowlist, working directory, skill loading), and whether ~/.agents/skills/ is visible to them.
4. How Horizon's own conventions constrain edits made from this working directory.
5. Whether the harnesses expose exact per-call usage for each roster model.
6. Whether Pi (or another harness) can host DeepSeek V4.1 Flash as the benchmark subject with TokenEconomizer support and exact usage.

# HARD CONSTRAINTS (addendum)
- HC-A1: The orchestrating session must not be altered by the system it is building. Build and verify everything in a scratch environment first. Real-config activation of TokenEconomizer, the tap, and any hook, adapter or pruning is the final build step, after hardening, and uses the main prompt's rollback and manifest rules. Until then the builder session stays uninstrumented. If activation could affect the orchestrating session, exempt its tools from pruning and tag its events as role=builder.
- HC-A2: Build-time consumption (role=builder) is recorded on a separate ledger and never enters any benchmark arm's or case's rollup. Report it separately, per model and per role, as the cost of building this.
- HC-A3: No worker judges its own work. Each worker report is verified by a mechanical check (test, hash, validator script) or by a different worker with only the spec, the diff and the evidence.
- HC-A4: The reviewer's family must differ from the builder's. This is verified from recorded model ids and not from names.
- HC-A5: Workers run with the narrowest permissions the harness offers. Reviewers and recon workers are read-only. Implementers write only inside their assigned worktree and allowed_paths. Do not use any permission-bypass flag against Sam's real HOME or real session stores. Any worker that executes code under test runs against fixtures or a scratch environment.
- HC-A6: Opus's context is a scarce resource. Opus does not read raw transcripts, large source files, benchmark logs or full diffs unless a decision requires it. It reads worker reports, validator output and aggregates.

# EXPERT DEPTH (addendum)
- Confine Opus to decision points, each recorded as an ADR in ~/.agents/state/build/:
  - architecture and dependency selection (Phase 1);
  - event schema v1, accounting ownership rules and dedup keys;
  - benchmark pre-registration;
  - invariant and fault-injection design;
  - adjudicating reviewer findings;
  - approval packaging for DECISIONS_FOR_User. md;
  - the final report.
  Everything else is delegated.
- Task packet format. Every delegated task states: task_id, goal, inputs (paths and SHAs), allowed_paths, forbidden actions, required skill to follow (workers may not auto-load it, so name it), output schema, acceptance check, model and effort. A worker report returns: task_id, the actual model id and effort that ran (from harness output), result, evidence paths, citations, unresolved items, tokens used (if the harness reports it).
- Build a citation validator (a small script, not a model). For every capability-matrix cell and recon claim, it confirms the cited file and line exist and the quoted snippet matches. A cell without a valid citation is UNVERIFIED automatically. This replaces sampling-based spot checks.
- Build a scope validator that diffs each worktree against its allowed_paths after the worker finishes. Out-of-scope changes are reverted and the task is failed.
- Keep a quota guard. At each phase start, estimate the phase's token spend per model in PROGRESS.md. If actual spend reaches 1.5× the estimate, stop launching workers, checkpoint, and report. If any provider limits you mid-phase, finish nothing speculative: write the resume state (what is done, what is in flight, exact next command) to PROGRESS.md and stop cleanly. Treat resumability as a tested property, since this build is itself a session-continuity problem.
- Run long jobs (benchmark arms, replays, fault-injection suites) through a headless runner script with timeouts and log files, not through Opus. Opus reads only the aggregate and a failures list. Clean up orphaned processes and temporary worktrees at the end of every phase.
- Run a short bake-off in Phase 1 before relying on any roster assumption. Give Opus and Sol the same Phase 1 task (capability rows for two CLIs). Run the citation validator on both and record fabrication rates. Run the same task on Haiku and GLM 5.3 Flash for recon-suitability. Use the results to confirm or change the roster and record this in an ADR.
- Adversarial review isolation. Give Sol the requirements, the diff, the tests and the raw evidence, and not the builder's reasoning or success claims. Run it read-only. Ask for severity-ranked findings with file and line. A second reviewer (Kimi) is optional for architecture critique.

# BENCHMARK MODE (amends Stretch A and the main prompt's benchmark assumptions)
- The main prompt's default of Claude Code as the benchmark harness is replaced by this rule.
  - Primary: if Phase 1 verifies that Pi (or another TokenEconomizer-supported harness) hosts DeepSeek V4.1 Flash with exact provider usage, run the full four-arm ablation there, because it costs a fraction of Sonnet per task.
  - Replication: run a single-repeat subset of the same tasks on Claude Code with Sonnet 5.5 at Xhigh, to test whether the effect transfers.
  - Fallback: if exact usage is not available on the cheap harness, run the primary ablation on Claude Code with Sonnet 5.5 and report the limitation.
- Report tokens by component (input, output, cache write, cache read), not dollars. DeepSeek pricing varies by time of day and its cache-hit rate is high, either of which can distort cost-based comparisons.
- Report each result as measured on that model and harness. Do not claim it generalizes.
- The runner and analysis scripts are pre-registered and hashed before the first run. Opus does not launch or watch individual runs.
- Run the spend estimate and 1.5× ceiling from the main prompt before the first arm starts.

# BUILD CHANGES
- New Phase 0 additions (before the main prompt's Phase 0 steps complete):
  1. Create ~/.agents/state/build/ and PROGRESS.md.
  2. Discover the worker CLIs' invocation and auth behavior.
  3. Define the subagent roles (recon, implementer, phase-verifier) with their models and tool limits.
  4. Build the citation validator and scope validator.
  5. Smoke-test one worker per roster entry on a trivial read-only task and record the actual model id returned.
  6. Run the Phase 1 bake-off.
- Phase 2 (global install) is scratch-only. It proves install and uninstall and produces the exact activation procedure, but does not touch the real hook configuration (HC-A1).
- Add a final step after Phase 10 hardening, "Phase 11: Real activation":
  1. Back up configs per the main prompt.
  2. Apply the manifest to the real CLI configs.
  3. Smoke-run each CLI.
  4. Restart sessions.
  5. Re-run doctor.
  6. Confirm micro-skills are still off unless User approved (INV-19).
- Per phase, the sequence is:
  1. Opus writes task packets.
  2. Workers execute in worktrees, in parallel up to the cap.
  3. Validators run (citation, scope, tests).
  4. A fresh Sonnet phase-verifier checks the exit condition from spec, diff and evidence only.
  5. Opus reviews the verifier's report and the aggregate evidence, then records the decision.
- Skills: create them under ~/.agents/skills/ as specified, then ensure the orchestrator and every subagent roster entry can actually load them (symlink with backup, or include their text in the task packet). Verify by asking a subagent to cite a step from each skill.

# VERIFY (addendum)
- INV-20: the builder ledger and the benchmark ledger are disjoint. Assert that no role=builder event appears in any arm or case rollup.
- INV-21: before Phase 11, the real configs of all seven CLIs are byte-identical to the Phase 0 backups, except for files listed in the manifest as pre-approved. After Phase 11, only manifest files differ.
- INV-22: the reviewer's recorded model family differs from every builder's recorded model family. Print both lists.
- INV-23: the citation validator passes for 100% of capability-matrix cells marked SUPPORTED_* or READ_ONLY. Everything else is UNVERIFIED.
- INV-24: the scope validator shows no worker wrote outside its allowed_paths, per worktree.
- INV-25: a credential canary placed in each worker CLI's config never appears in any log, evidence file, report or index. A scanner pass over ~/.agents/state/ and the repos finds no credentials.
- INV-26: resumability. Kill the orchestrating session mid-phase, start a fresh one with only PROGRESS.md, and show it resumes at the correct step without redoing completed work.
- INV-27: every worker report contains the actual model id from harness output. A worker whose reported id differs from its assigned model is flagged, and its output is re-verified.

# ADVERSARIAL HARDENING (addendum)
- The primary reviewer is Sol 6.1 via Codex, read-only, isolated per the rules above. Fall back to a fresh non-interactive session of a different family only if Codex is unavailable, and disclose it.
- In addition to the main prompt's review targets, require the reviewer to attack: orchestration contamination of the benchmark ledger, activation side effects on the builder session, worker scope violations, credential leakage into logs, citation-validator evasion, unverified roster-capability claims in the ADRs, and quota-exhaustion state loss.

# REPORT (addendum)
Add to the final report: the roster as actually used (model, harness, effort, task count, tokens), the substitutions and why, the bake-off results, build-time spend by model and role (separate from benchmark spend), the quota-guard events, the resumability test result, and what User must approve in DECISIONS_FOR_User. md.
```

---

## Addendum: Radical Token Efficiency as an Engineering Advantage

Apply the same ambition to your own intelligence expenditure that you apply to production engineering.

**Your goal is not merely to consume fewer tokens. It is to achieve greater verified engineering progress per token, with equal or better correctness, depth, reliability, and recovery.**

Draw inspiration from DeepSeek-style efficiency engineering: selective activation, specialization, careful resource allocation, and extracting maximum useful intelligence from constrained computation.

Treat tokens as a finite computational resource to be invested strategically.

- **Minimize the active world.** Narrow each problem to the smallest sufficient representation, relevant files, dependencies, constraints, and evidence. Expand context only when observations justify it.
- **Use progressive disclosure.** Inspect symbols, interfaces, indexes, diffs, and targeted source ranges before loading entire files or repositories. Preserve paths and provenance.
- **Allocate intelligence adaptively.** Use deterministic tools for deterministic work, inexpensive models for bounded tasks, and stronger reasoning models for architectural uncertainty, consequential decisions, and difficult failures.
- **Eliminate redundant cognition.** Reuse verified findings, cached analyses, existing tests, structured state, and durable engineering artifacts. Do not repeatedly rediscover settled facts.
- **Optimize information gain.** Prefer the next investigation or experiment that eliminates the most consequential uncertainty per unit of cost.
- **Compress without losing invariants.** Maintain compact, structured, evidence-linked working memory. Never compress away failed attempts, unresolved contradictions, authority boundaries, or critical design rationale.
- **Prefer targeted verification.** Run cheap, discriminating checks early; escalate to expensive integration, adversarial, and full-regression tests when justified. Never substitute cheap tests for necessary independent proof.
- **Control parallelism.** Spawn specialists only when their bounded work provides more value than their coordination and context costs. Avoid duplicated investigation and competing modifications.
- **Measure actual efficiency.** Track tokens, tool calls, elapsed time, rework, defect discovery, verified settlements, and regressions. Optimize total cost to a trustworthy result—not tokens per message.

A shorter response that causes misunderstanding, rework, or undetected defects is **less efficient**, not more.

Seek structural improvements to the agentic workflow itself: better representations, smarter context routing, reusable computation, earlier falsification, and less orchestration burden.

Do not merely practice token frugality. **Engineer an agentic coding process whose efficiency compounds as it learns.**

Your ultimate standard:

**Maximize independently verified, durable engineering progress per unit of intelligence expenditure, while preserving governance, quality, and recovery capacity.**

Demonstrate that this approach outperforms an ordinary coding workflow on representative GodSpeed tasks. The ambition is not to make an expensive process cheaper; it is to make a more intelligent process possible within the same resource budget.

**Optimize the cost of reaching justified certainty, not the cost of producing an answer. Narrow the active representation aggressively, but expand it whenever contradictions, failed predictions, unexplained observations, or insufficient evidence indicate that the current representation is inadequate. Measure efficiency through independently verified settlements and avoided rework—not merely reduced token consumption.**
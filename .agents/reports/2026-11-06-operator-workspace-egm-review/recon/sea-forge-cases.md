# SEA-Forge cases, DeepSeek-harness wiring, and EGM absorption (recon, 2026-11-06)

Paths are under /home/sprime01/projects unless noted. Read-only research; nothing was built or run.

## 1. What a case is today

**Plain version.** A case is one governed piece of work. It starts from a stated intent, gets a plan made of plan items, and runs only while an independent authority keeps saying yes. When work finishes, a separate step called settlement decides whether the result is accepted. Running something and exiting cleanly does not count as success (sea-rs/docs/mental-model.md, section 1 and Pillar 4).

**Shape.**
- A case record holds an id, the intent, a state, a pointer to its plan, run ids, stages, and a close reason (sea-rs/crates/sea-forge-core/src/types.rs, `Case`, around line 25).
- Case states are only four: active, awaiting_approval, completed, terminated (types.rs:16-21).
- Plan item kinds: sandboxed task, human task, milestone, stage, timer listener, user-event listener, agent task (types.rs:50-58). Each item moves through available, enabled, active, completed, failed, terminated (crates/sea-forge-planner/src/case_engine.rs:122-129). This is a CMMN-style engine: an item becomes enabled when its entry conditions ("sentries") are met.
- "Ticket" is not a SEA-Forge word. The nearest thing is a plan item, especially a human task or agent task. I found no ticket table, ticket id, or ticket importer in sea-rs (grep for "ticket" only hits an unrelated MCP test fixture and the admission queue). Horizon's own spec already says "plan items (including ticket-like work items)" and "avoid a second ticket database" (Horizon/.agents/specs/Horizon_Operator_Workspace_Design_v1.md, section 7, line ~179).

**Who may move a case.**
- Every change goes through one shared set of operations used by both the CLI and the server: append event, reopen, terminate, propose item, complete human task, resolve approval, advance (sea-rs/crates/sea-forge-case-runner/src/case_ops/README.md, Interface). Advance is bounded to 32 episodes per call.
- Each mutation is authorized first and the decision is written to an append-only ledger before it takes effect (case_ops/README.md, Invariants, "Mediation contract").
- Enabled items that need manual activation are activated by the operator, not automatically (advance.rs module docs, decision D-3).
- Separation of duties: a proposer cannot approve their own item, error `sod_violation` (docs/reference/sfwp-protocol-reference.md:130). Unknown identity fails closed.
- Identity is the OS user bound to an actor and roles, not a login screen (docs/reference/cli-command-reference.md, line ~36).

**Settlement.** The settlement engine checks the committed criteria: exit zero if required, required artifacts present, required output text, evaluator criteria, batch pass ratio, no authority Deny or Escalate. Only then is the result `Accepted`; otherwise `Rejected` or `Escalated` (mental-model.md Pillar 4; types.rs:836-841). Artifact hashes are recorded as evidence but are not themselves a settlement test. Agent termination is a separate fact from settlement (PRODUCT.md, principle 2).

**Interfaces that expose it.**
- SFWP v1 over a local Unix socket, served by crates/sea-forge-server. Documented methods (docs/reference/sfwp-protocol-reference.md:69-117): `case.list`, `case.get_overview`, `case.get_horizon`, `case.preflight` (dry run), `case.commit` (needs `request_id` for idempotency), `approval.list`, `approval.decide`, `run.list`, `run.get`, `asset.list`, `thoth.ask`, `events.subscribe` (with `from_cursor` replay), plus `readiness.get` and `identity.get`. The server code also handles `case.add_item`, `case.reopen`, `case.terminate`, `case.advance` (crates/sea-forge-server/src/lib.rs:3243-3320) that the protocol reference does not list. UNCONFIRMED whether those are wire-exposed to clients or internal.
- CLI `sea-forge`: `run --plan`, `runs`, `resume`, `case reopen|add-task|manager-iterate`, `task complete`, `approve`, `ledger replay --case`, `agent probe|delegate` (docs/reference/cli-command-reference.md). Exit code 5 means "case still alive, needs you" (lines 21-26).
- Go casework gateway, apps/godspeed-casework-go: HTTP plus live event stream in front of SFWP. Routes: `/api/world`, `/api/events`, `/api/trajectory`, `/api/templates`, `/api/templates/preflight`, `/api/intents`, `/api/ask`, `/api/artifacts/{digest}`, session and login (internal/server/README.md:15-31). Every route except health needs a session; every POST needs a CSRF token.
- Persisted layout: cases/<id>/case.json, plan.json, case-events.jsonl; runs/<id>/settlement.json.

**Live vs designed.** The production gateway refuses to serve fixtures and probes the real kernel first (apps/godspeed-casework-go/cmd/godspeed-casework/README.md:7-28). The 2026-09-23 live-wiring plan covers journeys CJ01-CJ09 live and CJ10-CJ12 with "honest availability", with Gauntlet execution deferred to T13 (.agents/plans/2026-09-23-casework-live-wiring-production.plan.yaml:68, 332). The latest status I saw (revision 183, 2026-10-30) is about documentation drift, not new case features (.agents/CURRENT_STATUS.md). Whether T13 has since landed: UNCONFIRMED.

## 2. The DeepSeek harness workflow

**Finding: the ticket-to-case wiring you describe is not present as built code in the places I searched. UNCONFIRMED where it lives.** What exists under that name:

1. **DeepSeek as a model inside sea-rs experiments.** The "bounded judgment" programme measures whether model judgment can inform, but never replace, deterministic authority and settlement. DeepSeek v4.1 Flash is reached through the opencode tool and ClinePass as the main generator and judge (.agents/preregistrations/godspeed-bounded-judgment-T16.provider-substitution-addendum.yaml:16-17, 46). There is no judgment service, port or database; it is "realized through existing machinery" (.agents/plans/godspeed-bounded-judgment-brief.md, one-paragraph picture). No Rust crate mentions deepseek.
2. **"DeepSeek harness" as a product Cognate copied for testing.** cognate-identity-wt/validation/reconstructions/deepseek-harness/ is a rebuild of that harness on Cognate, with architecture evidence (62 tests) showing it depends on nothing from the original. cognate-workbench/README.md:139 says Workbench began as that reconstruction and has since diverged; MIGRATION.md shows the move out of that folder.
3. **Workbench under SEA-Forge authority.** When switched on, every Workbench capability call goes to SEA-Forge as an authority request; SEA-Forge may escalate, the run waits, the operator approves or rejects, and SEA-Forge ledgers it (cognate-workbench/docs/sea-forge-authority.md, top). Requester and approver are different actors. Off by default. This is governance of actions, not tickets-as-cases.
4. **Horizon's proposal** (spec section 7): bind an eligible plan item to a durable Workbench assignment (task, scope, acceptance criteria, resources, correlation ids; not a transcript), then cross-reference results into the case. That is a design, not wiring I could find.

**How results become evidence and judgments get recorded (this part is real).** Each experiment task has a frozen preregistration (.agents/preregistrations/godspeed-bounded-judgment-T*.prereg.yaml) with addenda; evidence sits under .agents/evidence/godspeed-bounded-judgment/T*/ as generation records, judgment records (provider, model, attempt, outcome, abstention, raw output path), and accepted-case files (for example T24/accepted-case.yaml: generator, source route, replay, `settled: true`). Judges see observation records only, never the builder's narrative (T23 judgment-record.yaml, `judge_input_rule`). Task state is in .agents/current_status.yml; tasks T00-T29 were settled as of 2026-09-19 (.agents/status-archive/current_status.godspeed-bounded-judgment.2026-09-19.yml). This is how sea-rs is built by agents. It is not the product's case model, so do not conflate the two.

**Agent tasks inside real cases.** A case plan item of kind AgentTask delegates to a model over ACP or HTTP; each tool call goes to the authority; turn and token caps apply; transcript is encrypted and sealed (docs/workflows/agent-delegation-flow.md). CLI: `sea-forge agent delegate`. This is the existing, designed path for any harness-driven work to become case evidence. Live status UNCONFIRMED.

**Name clash to watch.** Cognate Workbench has its own cognitive "case" concept (`case.open`, `criterion.freeze`, `world.settle`, ...). Its known-gaps file calls the cognitive layer "a local proof" and says a semantic binding does not execute a SEA policy (cognate-workbench/docs/known-gaps.md:122-130). Not the same object as a SEA-Forge case.

**Other repos.** hermes-agent-sea-forge is a fork of Nous Research's Hermes Agent (self-improving agent); zeroclaw-sea-forge is a fork of ZeroClaw whose installer adds SEA authority checks before file writes, shell, and web fetches (its README). Both are authority-checked agent runtimes, not case managers. Hermes has "ticket" branches only in a desktop-login sense (unrelated).

## 3. EGM absorption

**What EGM is** (elephant-goldfish-model/README.md): one agent with full project context (the Elephant) drafts a design; fresh reviewers with no prior conversation (Goldfish) attack it; the human decides. Reviews require genuinely fresh subagent contexts and stop if none can be made.

**Pieces.**
- Skills: brainstorm, draft, review (five stages: initial zoom-out, comprehension, design critique, intermediate zoom-out, implementation readiness), resolve (apply approved fixes, negotiate the rest), review-loop, bootstrap (write contract READMEs), drift-report (docs vs code) (elephant-goldfish-model/skills/).
- Reviewer roles (agents/*.md): zoom-out (simplicity, scope), comprehension (naive reader), design critic (hostile architecture), implementation readiness (tech lead), codebase details (accuracy), structural, style, plus synthesizer (dedupe and compile) and bootstrap orchestrator. The same roles are installed here as `egm:*` agents.
- Artifacts: concepts_brief.md, design_draft.md, review reports, resolution record.

**Where it is absorbed.**
- sea-rs: bootstrap produced 150 EGM contract READMEs (status revision 182, 2026-10-30); drift report fixed 10 items and left 3 for triage (revision 183; sea-rs/2026-10-30_DRIFT_REPORT.md). Every crate and folder README now uses the Overview / Interface / Invariants / Side Effects / Verification shape.
- cognate-workbench: the full sequence ran for "desktop-native-completion" (drift report, six-lens Goldfish brief, review report with 17 fixes applied) under .agents/plans/desktop-native-completion/ (CURRENT_STATUS.md lines 3-31).
- Horizon: this review folder (comprehension, critic, zoom-out, readiness reports) is the method applied to Horizon's own spec.
- Ties to cases: none found in code. EGM reports are files and a method, not SEA-Forge case items. Resolution and approval of a design are human-run; nothing records an EGM review as a plan item, evidence record or settlement. UNCONFIRMED whether that is planned.

## 4. What Horizon should show and steer, using what already exists

Show (all readable now via SFWP or the gateway): readiness and identity; case list, overview, and horizon (what is enabled now and why); pending approvals with actor, action, resource, policy reason, expiry, and separation-of-duty warning; run records and artifacts; settlement outcome kept distinct from execution and agent termination; live event stream with cursor replay so a restart loses nothing.
Steer (all through governed commands, never direct file edits): preflight then commit a case; approve or reject; complete a human task; reopen or terminate; advance; ask Thoth a typed question.
Rule from PRODUCT.md: one focus, one lawful next action, reason shown for any unavailable action, no blind batch approval, no green "success" that merges authority, execution, and settlement.

## 5. What would make a proposed Horizon feature redundant

- A ticket store, status board, or workflow engine: plan items, sentries, human tasks and the case ledger already do this. PRODUCT.md bans Jira-style card soup.
- An approval inbox: `approval.list` / `approval.decide` and the gateway already exist, with separation of duties built in.
- A case timeline or audit view: `events.subscribe`, `ledger replay --case`, and case-events.jsonl already give ordered, replayable history.
- A second casework UI: apps/godspeed-casework-go plus apps/godspeed-cognitive-ui (and the Tauri Workbench) already exist; ADR-006 covers the casework UI replacement. Horizon should be a client of the gateway or SFWP, not a rival.
- A judgment or review service: the bounded-judgment brief explicitly says none exists by design; EGM is a method run by agents, so Horizon only needs to display its report files and record decisions.
- Missing and genuinely new: a ticket-import adapter (external ticket becomes a proposed plan item), a mapping from a Workbench assignment to a plan item, and any record tying an EGM review to a case. None found; these are the real gaps.

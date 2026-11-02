# Horizon cockpit: unattended work report

Date: 2026-11-01. Branch: `horizon-cockpit-projection-review` (pushed; not merged; no PR opened).
Base: `main` at `4ab84e9`. Head at time of writing: `fb66aeb`.

## Status: not production ready

The cockpit is safer and clearer than it was at the start of this session, but it is not production ready. The
reviewed blockers that need live SEA-Forge or RealityTrace, or a design decision, are still open (see
"Still open"). Nothing below has been run against live binaries. The live suites are skipped in this environment,
so every claim about live settlement and approval is unverified.

Verification at head: `bun test` 352 pass, 16 skip (live suites), 0 fail. `tsc --noEmit` clean. The DomainForge
validator reports 0 violations for `.sea/interaction/interaction-model.sea`. `scripts/check-idm-coverage.py` passes.

## What changed, commit by commit

Each commit is a rollback point. Revert from the top if a later change is unwanted: `git revert <sha>`.

| Commit | What it does | Verified |
| --- | --- | --- |
| `aa99368` | graft ignore config. Keeps the graph cache out of git; re-admits the tree to ripgrep. | n/a (config) |
| `9bd7645` | Status and debt ledger updates from earlier work. | n/a (docs) |
| `4b4ccb2` | Palantir recon, feature matrix, cockpit concept briefs (v1 superseded, v2), Jetson control-plane designs. Screenshots stay in gitignored `.tmp/`. | n/a (docs) |
| `7abdf99` | A governed commit is shown as "allowed by SEA-Forge" only when a SEA-Forge decision is recorded for it. Without one it is "unverified". v1 intents no longer get a final verdict written by Horizon. | unit tests |
| `5ee9cca` | "Observe and settle" is split into two steps: observe (RealityTrace records evidence, status `pending`) and rule (SEA-Forge rules on existing evidence). Default for other callers stays combined. The cockpit and the remote panel both send an explicit phase. | unit and typecheck; live test written, skipped |
| `68bc877` | The decision reference is SEA-Forge's `decisionEnvelopeId`, not the Cognate invocation event id that I had used. Adds the approval-contract consumer requirements note. | unit tests |
| `819f34a` | Model: adds `SettlementStage` (unobserved, observed, ruled) and INV-12 (stages advance in order; SEA-Forge rules only on observed evidence). | DomainForge validate, IDM coverage |
| `fe55bd4` | Ruling before any observation is refused with a reason and writes no record. World identity re-pinned after the model change (see decision D3). | tests; live test written, skipped |
| `53703ce` | One primary action at the top of the cockpit: an escalation waiting for the operator, then observe, then rule, then unfinished setup, then the first available move. It links to where the operator acts and submits nothing. | 7 unit tests, render test |
| `fb66aeb` | "Recorded" is neutral, not success green. Allowed and observed keep the green. | full suite |

Files of note: `src/app.ts` (settlement phases, decision reference, route validation), `src/ui/workspace/model.ts`
(`moveOf`, `primaryActionOf`), `src/ui/workspace/render.tsx` (panel, settle forms, colour rule),
`src/remote/server.ts` (remote settle requires a phase), `.sea/interaction/interaction-model.sea`.

## Decisions I made without explicit instruction

**D1. Settlement split is two requests, with a default of combined for other callers.**
Justification: the review found the one-click path performs an observation and a ruling together, which hides the
second from the operator. The model (flows `EvidenceObservationMessage` and `SettlementRecordMessage`, and INV-07)
already treats them as distinct. Other callers (live tests, bench, an internal call) keep the combined behaviour, so
the change does not break them. The cockpit and remote panel require an explicit phase, so they cannot fall back
to the combined path.

**D2. Bound operations (obligation window) cannot be split.**
Justification: the obligation flow closes and settles a window in one step by design. Splitting it would require a
redesign of that flow, which is outside an unattended change. These operations refuse observe and rule with a
stated reason. Known limitation: the cockpit still shows an "Observe" button for them, which returns that refusal.

**D3. Re-pinned the world identity after changing the model.**
Justification: the world identity is a deliberate hash of the semantic source, and the code refuses to load a
mismatched world. Changing the model therefore required a re-pin, not a workaround. I computed the new value with
the project's own tool (`scripts/world-ref.py`) and checked it matched what the loader observed. I updated every
live pin (config, justfile, `config/horizon.toml`, `ui-model/atomic-ui-contract.yaml`, `behavioral/contract.yaml`,
and test fixtures). I did not update `.wayfinder/answer-key.md` or `behavioral/PROOF-REPORT.md`, because both are
records of past verdicts and should stay as they were. Anyone reading them should know their hashes are historic.

**D4. Added `SettlementStage` as a stage vocabulary in the model, not a new entity.**
Justification: the model should own the vocabulary the code now relies on (`pending` as a stored state). A new
entity would have been a larger change than the gap needed. `INV-12` records the ordering rule.

**D5. An early ruling is refused with an error, not recorded as `unavailable`.**
Justification: the model's failure-recovery rules prefer no side effect when authority is pending or denied. A
refused request that does nothing should leave no record. The obligation path already refuses this way. Trade-off:
the cockpit now returns a 409 with a reason rather than a stored status, which is the behaviour the route already
has for refusals.

**D6. The primary action uses a fixed precedence and links, never submits.**
Justification: the review found no single next step per screen, which is the main reason the cockpit reads as a
form. A fixed order is testable and explainable. It links rather than submitting, so the panel cannot become a
second decision path. The order (approval, observe, rule, setup, move) follows the causal order of a governed
commit.

**D7. Recorded is neutral; allowed and observed keep the success colour.**
Justification: the review found that allowed, observed and recorded all used the same green. "Recorded" only says a
record was written. It is not an outcome, so it should not read as success. Text already states every state, so
colour is not the only signal.

**D8. The approval contract is consumed from SEA-Forge, not defined in Horizon.**
Justification: SEA-Forge already defines `PendingApproval` and the `authority_approvals` and `authority_approval`
verbs. Defining a parallel shape in Horizon would make Horizon the authority on what counts as an approval, which
the product principles forbid. The requirements note lists the four gaps to propose to `sea-rs` and Cognate. I did
not write to `sea-rs`, since that is another repository.

**D9. Did not build the approval inbox.**
Justification: an inbox needs a live `authority_approvals` call, which I cannot verify here, and a Cognate-side
client for that call, which Cognate does not export. Building it unverified would repeat the earlier pattern of
claiming behaviour that was never observed. It is the first item in "Still open."

**D10. Did not change the palette, layout, or navigation beyond the primary panel.**
Justification: the redesign direction needs your review, and the Goldfish reviewers flagged the design decisions as
open. The primary action is the smallest change that addresses the stated problem ("what do I do?").

## Still open (blocking "production ready")

1. **Horizon still decides in places.** Availability is computed in Horizon (`navigation.ts`, `model.ts`), and some
   pass gates are hard-coded (`expectation.ts`). The rule is that Horizon shows only observable facts and each
   verdict carries its sibling's source. Needs a design pass; not attempted unattended.
2. **Approval inbox and typed approval contract.** Needs live SEA-Forge to verify. See the requirements note in
   `.agents/reports/2026-11-01-sea-forge-approval-contract-consumer-requirements.md`.
3. **Live verification.** The split settlement, the early-refusal refusal, and the decision reference need a run
   against SEA-Forge and RealityTrace. The live tests exist but are skipped here.
4. **Obligation-window settlement cannot be observed separately** (D2).
5. **Claim vocabulary.** The hypothesis names four claims; the UI shows three. "Capability improved" is absent.
6. **Owned state.** The model assigns case and capacity state to siblings; Horizon still holds some. Needs your
   decision on ownership.
7. **Palantir patterns not yet applied:** facet counts on filters, risk-coded actions pinned in the object header,
   the object-view hub. The recon documents them; none is implemented.
8. **Gauntlet and SWE_SEED** have no integration in Horizon. Their projection contracts are not defined.

## Verification gaps stated plainly

- No browser or visual check of the page. The rendering tests check markup, not layout.
- The live suites (16) are skipped; their new cases have not run.
- The Palantir screenshots were consulted for patterns only; nothing was copied or shipped.
- Line references in the review briefs were checked for the spots I read, not all of them.

## Rollback

- Model: `git revert 819f34a` (and `fe55bd4` to restore the old world pins; they must be reverted together).
- Settlement split: revert `5ee9cca` and `fe55bd4`.
- Primary action: revert `53703ce`. The panel is removed and nothing else depends on it.
- Colour: revert `fb66aeb`.

## Live verification (SEA-Forge and RealityTrace installed)

Run with `SEA_FORGE_SERVER_BIN=/home/sprime01/.local/bin/sea-forge-server` and
`REALITYTRACE_BIN=/home/sprime01/.cargo/bin/realitytrace` (RealityTrace reports 0.3.0).

- **J02 live (4 tests): all pass.** This covers the SEA-Forge commit decision, escalation and operator approval
  (IS3 to IS5), RealityTrace trace and SEA-Forge settlement (IS6 and IS7), and the new observe-then-rule split.
  This is the first observed pass of the settlement path in this session.
- **Full suite with live binaries: 353 pass, 12 skip, 3 fail.** Remaining failures are listed below.

### Fixed during live verification

- `test/economics-live.test.ts` passed `--require-declared` to `realitytrace run begin`. That flag exists nowhere
  (not in the installed binary, the `sxr` source or history, Cognate, or the Horizon dependencies). The test was
  never green; it had only skipped. I removed the flag and declared the question and threshold, as the test already
  does.
- Probe result that matters for the design: the installed RealityTrace **accepts `run begin` for an undeclared
  question** (exit 0) and accepts a threshold declared against a question that does not exist. The "require
  declared" guarantee is therefore not enforced by this RealityTrace. This belongs to the RealityTrace owners.

### Failures that remain

1. **Phone remote, Chromium (2 to 3 tests, varies by run). Pre-existing.** Reproduced on `main` at `4ab84e9` with the
   same failures, so it is not caused by this branch. Error: `goto: net::ERR_INSUFFICIENT_RESOURCES`. Shared memory
   is not the cause (`/dev/shm` is 1% used). Host memory is tight (about 1.7 GB available of 7.9 GB). The cause is
   not confirmed. I left these failing rather than skipping them, since they are real end-to-end checks.
2. **Economics live (now an explicit skip, not a pass).** RealityTrace 0.3.0's ledger export keeps only
   `observation_id` and `scope` for each observation. Agent-event token figures never reach the reader, so the
   figures cannot be derived from this RealityTrace. Enable with `HORIZON_ECONOMICS_RT_EXPORTS_EVENTS=1` once the
   export carries them.

## Upstream gaps (for the owners, not fixed here)

- **RealityTrace (sxr):** `run begin` does not refuse undeclared questions; `ledger export` drops agent-event
  payloads (only `observation_id` and `scope` survive). Both are needed for the economics view and for the
  declared-question guarantee.
- **SEA-Forge and Cognate:** the approval client in `src/adapters/sea-forge-approvals.ts` is a raw socket client.
  Cognate should export the approval call (`authority_approval`, and `authority_approvals` for an inbox).
- **Gauntlet and SWE_SEED:** no projection contract exists in Horizon.

## Architecture check against the target invariants

Invariant 2 says Horizon reaches external stack services through Cognate capabilities or Cognate-owned adapters, and
must not build separate authority, execution or evidence clients. Current violations, stated plainly:

- `src/adapters/sea-forge-approvals.ts`: Horizon writes to SEA-Forge's socket itself (authority client).
- `src/adapters/realitytrace-economics.ts`: Horizon spawns the RealityTrace CLI itself (evidence client).

Both exist because Cognate does not export the calls. Each file's header says so. They are recorded as readiness debt
and should move behind Cognate once Cognate exports them. They are not replaced by new substitutes in this branch.

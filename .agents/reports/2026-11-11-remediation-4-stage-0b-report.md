# Remediation-4 wave and Stage 0B containment: report

Date: 2026-11-11. Branch: `horizon-desk-gaps` (worktree `/home/sprime01/projects/Horizon-gaps`).
Status: **not ready to merge.** The blind critic's last verdict is REJECT with open blocking findings (see Critic findings). No PR was opened and no branch or worktree was deleted.

## Commits

| Commit | Subject |
|---|---|
| `f88cb20` | checkpoint of prior uncommitted work |
| `c576160` | status rev 38 checklist |
| `050b654` | R5-06 contract split by owner component |
| `fa42339` | remediation-4 wave (prereg, tests, coverage, teeth, round-6 prompt) |
| `61e694c` | round-6 corrections and Stage 0B containment |
| `0a217fe` | round-7 corrections (unbound grant and entitlement, executor, descriptor fields) |
| `64a8d71` | round-8 residues (bind-target marker, entitlement subject, defect note) |

## Checklist

| Item | State |
|---|---|
| R5-01 to R5-09 (fifth review's nine findings) | Addressed in `fa42339`; R5-06 split in `050b654`. Re-checked by critics: R4-02, R4-03, R4-04 (partially), R4-07, R4-08, R4-09 closed; R4-05 and R4-06 partially closed (critic rounds 6-8). |
| Remediation-4 prereg, tests, coverage, teeth | Done. 14 expectations linked; 33 teeth at fa42339, rerun later. |
| Stage 0B: pending confirmation gate on the workspace label | Done (`src/app.ts`); route tests PE-58, PE-59, NE-46. |
| Stage 0B: `horizon confirm --pending <id>` | Wired (`src/main.ts`, `src/app.ts confirmPending`). Not exercised end to end; see Incomplete. |
| Stage 0B: desk panel P2 ops and `lesson.decide` gates | Wired in `src/app.ts`; covered by the gate's unit tests, not by route tests. |
| Stage 0B prereg, coverage checker, justfile wiring, 11 teeth (M34 to M44) | Done. 13 expectations linked. |
| Round-8 critic finding F3, F4, F7 | Fixed in `64a8d71`. |
| Round-8 critic findings F1, F2, F5, F6, F8 | **Open** (see Critic findings). |
| PR to `main`, merge, delete branch and worktree | **Not done**: blocked by open critic findings. |

## Evidence table

| Requirement | Evidence | Source process | Reproduce command |
|---|---|---|---|
| Full suite passes | 1590 pass, 0 fail | `bun test` (CI-style run) | `bun test` |
| Types check | no errors | `tsc --noEmit` | `bun run tsc --noEmit` |
| Stage 0B mutants are caught | 44 of 44 caught | `scripts/teeth-t23-mutation.ts` (deterministic; mutates a copy, requires assertion failures) | `bun run scripts/teeth-t23-mutation.ts` |
| Remediation-4 expectations linked to tests | 14 linked | `scripts/check-stage0a-remediation-4-prereg-coverage.ts` | `bun run scripts/check-stage0a-remediation-4-prereg-coverage.ts` |
| Stage 0B expectations linked to tests | 13 linked | `scripts/check-stage0b-containment-prereg-coverage.ts` | `bun run scripts/check-stage0b-containment-prereg-coverage.ts` |
| Design and contract agree | 14 comparisons agree | `scripts/check-design-contract-consistency.ts` | `bun run scripts/check-design-contract-consistency.ts` |
| External interfaces are honest | 3 interfaces, all unpublished, 0 facts verified against owner source | `scripts/check-external-interface-facts.ts` | `bun run scripts/check-external-interface-facts.ts` |
| Round-8 freeze is intact | 19 files, all OK | `sha256sum -c MANIFEST.sha256` in `frozen-round-8/` | `cd .agents/evidence/2026-11-09-stage-0a-defects/frozen-round-8 && sha256sum -c MANIFEST.sha256` |
| Python implementation agrees on fixtures | 146 passed | `pytest` on `research/tests/test_identity_fixtures.py` | `cd research && uv run --project . pytest tests/test_identity_fixtures.py -q` |

Two evidence kinds are non-test: the deterministic mutation teeth and the static checkers. The critic reviews are a third, non-author process (see below).

## Critic findings and dispositions

Codex (`gpt-5.6-sol`) ran round 6 but did not complete; its later rounds were blocked by a usage limit that resets 2026-11-12 00:53. Rounds 7 and 8 used a Haiku subagent as the blind critic, reading only the frozen tree and the review prompt.

**Round 6 (Codex, partial, then closed by round 7):** four blocking findings, each corrected:
- R6-01 authority decision called published: now `specified_not_published`; governed mode refused at startup. Closed.
- R6-02 facts bound to wrong owner identifiers: all facts `unbound` on unpublished interfaces. Closed in round 7 for the decision interface; round 8 F3 closed the vocabulary gap.
- R6-03 public `submitIntent` audited before refusal: classification refusals now throw before any audit (NE-41). Closed.
- R6-04 descriptor carried state and confirmation fields: descriptor fields removed; state in transitions. Closed in round 7.

**Round 7 (Haiku), REJECT, three blocking, all fixed in `0a217fe`:**
- R7-01 grant and entitlement facts bound to Horizon fields: now `unbound`.
- R7-02 `ask.route` executor inconsistent: defect note and fixture aligned to `registered_agent`. The fixture still permits `agent_execution` because the manifest maps `registered_agent` executors to that caller kind as well; see F5.
- R7-03 descriptor still declared confirmation fields and a code slot: removed; `confirmation_digest` replaces the code.

**Round 8 (Haiku), REJECT, three blocking:**
- F1 (blocking, **open**): six P2 rows with an external commitment or SEA-Forge authority (`horizon.settlement.observe`, `handoff.send`, `grant.create`, `grant.revoke`, `gauntlet.run.cancel`, `grant.redelegate`) should be P3 with separation-of-duty statements, or each P2 needs a justification. This changes class counts and needs a decision.
- F2 (blocking, **open**): `device.pair` replaces an enrolled device with no A3 predicate; `isDowngrade` does not flag null human evidence. Needs a policy decision: first-device bootstrap only, or A3-UV replacement.
- F3 (blocking, **fixed in `64a8d71`**): the `unbound` marker was not in the bind-target vocabulary.
- F4 (must-fix, **fixed**): defect-note residue; the fixture's `agent_execution` permission is kept because the manifest and the test require it (disputed; see F5).
- F5 (must-fix, **open**): no `permitted_caller_kinds` source in the catalog; the manifest derives it from the executor, which permits `agent_execution` under `registered_agent`. The critic reads this as a defect; the manifest and its test read it as intended.
- F6 (must-fix, **open**): P2 rows without a named owner or self-owned statement (about 15 rows).
- F7 (must-fix, **fixed**): entitlement `subject_binding` removed; the subject check now fails closed.
- F8 (must-fix, **open**): remote and expert external-effect rows classed P2 with local authority.
- F9 to F16 (advisory, **open, not blocking**): stale-preview bypass on case-task decisions; process history in the design; separation of duty on `horizon.settlement.rule`; P1 rows that write state; pending expiry constants not in policy; naming aliases; label vocabulary; Appendix A row incomplete.

## Files

Added: `src/capabilities/pending-confirmations.ts`, `src/capabilities/confirm-command.ts`, `src/contracts/identity/interface-status.ts`, `test/pending-confirmations.test.ts`, `test/containment-routes.test.ts`, `test/support/local-confirmation.ts`, `scripts/check-stage0b-containment-prereg-coverage.ts`, `.agents/prereg/horizon/STAGE-0B-CONTAINMENT.prereg.yaml`, `scripts/check-stage0a-remediation-4-prereg-coverage.ts`, `test/identity-remediation-4.test.ts`, `.agents/prereg/horizon/STAGE-0A-REMEDIATION-4.prereg.yaml`, the round prompts and frozen trees `frozen-round-6`, `frozen-round-7`, `frozen-round-8`.

Deleted: none.

## Incomplete

- **Critic verdict is REJECT.** Round 8 F1, F2, F5, F6 and F8 are open. These need decisions on class assignments, device replacement policy and the caller-kind source. I did not make those choices silently.
- **`horizon confirm` cannot write while a desk runs.** The command opens the writable store, and a running desk holds the store lock. The command works only with no desk running. This is a design gap to decide, not a claimed feature.
- **Stage 0B receipt and presence are not implemented.** The design requires a signed local receipt and presence checks; the confirmation records only the transition. The descriptor no longer carries those fields.
- **PE-53 and PE-59 have no mutation tooth.** Both are exercised by tests, but no mutant breaks them specifically.
- **Governed-mode tests are mostly skipped or opt-in.** The J02 live tests need a SEA-Forge binary. The remote-sessions test uses a test seam, `unpublishedAuthorityForTests`, to drive governed mode in process.
- **No PR, merge, or branch or worktree deletion.** These wait for a clean critic verdict.

# Blind review round 4 (final, cap reached)

Reviewed origin/main..HEAD at a5eaf5e. Raw output: /tmp/claude-1000/-home-sprime01-projects-Horizon/153d70cd-d7e5-4657-8444-9a0c48bbc206/scratchpad/critic/codex-r4.out

211,768
Reviewed `origin/main..HEAD` at `a5eaf5e`. **Five findings.** The desk regression suite passed: **547 tests across 82 files**. Adversarial attempts reproduced the defects below.

1. **P2 major — Durable panels cross operator boundaries**  
   **[panel-records.ts:180](/home/sprime01/projects/Horizon-gaps/src/capabilities/panel-records.ts:180)**  
   Panels, board order and associated answers are selected by tenant without operator scoping, contrary to design v3’s operator-scoped identities.  
   **Failing scenario:** Alice publishes and answers a question. Restart the same database with `HORIZON_OPERATOR_REF=actor:review-bob`. Bob’s paired desk displays Alice’s panel and private answer. Reproduced.  
   **RECOMMENDED SOLUTION:** Include operator identity in panel, board, question, answer, guard and receipt keys and queries. Migrate existing records under verified ownership; leave unknown ownership inaccessible pending explicit recovery.

2. **P2 major — Stale-lock takeover can delete a new holder’s lock**  
   **[desk-lock.ts:108](/home/sprime01/projects/Horizon-gaps/src/capabilities/desk-lock.ts:108)**  
   Reading the stale holder and unlinking its pathname are separate operations.  
   **Failing scenario:** Processes A and B both read a stale lock. A deletes it and acquires a new lock. B resumes and unlinks A’s live lock, then acquires its own. A deterministic two-process probe printed `ACQUIRED` for both. The database lock remains a second check, but it runs **after** opening and potentially migrating the store. Actual upgrade damage was **not reproduced**.  
   **RECOMMENDED SOLUTION:** Use a kernel-held advisory lock on a canonical store identity, acquired before SQLite opens and retained through shutdown. Avoid stale-file deletion as the exclusion mechanism.

3. **P2 major — Legacy deferrals create permanent false conflicts**  
   **[panel-answers.ts:499](/home/sprime01/projects/Horizon-gaps/src/capabilities/panel-answers.ts:499)**  
   Migration 5 includes legacy `outcome: "deferred"` records when detecting contradictory committed answers. Migration 6 subsequently clears that outcome but leaves the conflict marker.  
   **Failing scenario:** Seed one legacy “Not yet”, followed by a legitimate answer to the same question, then upgrade. The final records become `put_off` and `waiting_for_agent`, but routing refuses them as contradictory. Reproduced through restart and routing.  
   **RECOMMENDED SOLUTION:** Compare only answered/cancelled outcomes during reconciliation. Add a new versioned repair migration that recomputes existing conflict markers and removes false positives while preserving genuine contradictions and original evidence.

4. **P2 major — Ownerless legacy answers cannot be reassigned**  
   **[app.ts:2425](/home/sprime01/projects/Horizon-gaps/src/app.ts:2425)**  
   Reassignment requires a string `from_key_id`, while a preserved legacy answer can legitimately have `owner_key: null`. Every string fails the subsequent owner comparison.  
   **Failing scenario:** Upgrade an outstanding answer without a recorded owner. Reassign with `from_key_id: null`: HTTP 400. Supply `""` or `"unknown"`: HTTP 409. No representable request succeeds. Reproduced.  
   **RECOMMENDED SOLUTION:** Accept an explicit nullable previous-owner field throughout validation, planning and reassignment history. Compare it exactly against current ownership, retaining recent pairing, target registration and confirmation checks.

5. **P3 minor — Empty panel IDs produce invisible questions**  
   **[panels-model.ts:254](/home/sprime01/projects/Horizon-gaps/src/ui/desk/panels-model.ts:254)**  
   `ask_human` validates the question ID but accepts an empty panel ID. Board-order comparison joins IDs with newlines, making an empty board indistinguishable from `[""]`.  
   **Failing scenario:** Submit a valid confirmation question with `panel: ""`. The agent door returns HTTP 200 and saves `panel:`, but the visible board remains empty. Reproduced.  
   **RECOMMENDED SOLUTION:** Apply the panel-ID validation used by `show_surface` to `ask_human`. Compare board-order arrays structurally rather than through delimiter joining.

Other requested checks:

- **Queue coverage:** No production answer, panel or question writer bypass found.
- **Ownership:** No additional bypass found for reassigned routing, omission protection, duplicate block IDs or foreign removal.
- **Transactions and retries:** No additional defect found in partial-commit protection, queued logout checks, migration-failure pausing or request-ID reuse across successful transitions.
- **Read-only CLI:** No store-write bypass found; read-only regression tests passed.
- **Secrets/reports:** No new credential exposure found; historical whole-suite claims were not independently verified.
- **Known browser residual:** A browser-controlling agent can omit the page-agent header and use the paired session’s human authority. The agent door still requires its bearer key. This remains the acknowledged open decision, not a new finding.

Browser UI behavior and crash-induced data loss were not dynamically verified. Working changes were preserved.

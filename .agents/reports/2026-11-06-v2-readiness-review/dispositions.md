# How the v2 readiness-review findings are settled (2026-11-06)

This review covers the new v2 design and its annex: readiness, code accuracy and style. The reports are `readiness.md`, `codebase.md` and `style.md`. This file is the author's ruling on each finding. Both edits (design and annex) must follow it.

## Shared decisions (apply to both documents)

**D1. Three record stores, not two.** This settles readiness B3 and style R3 and R4.
- **Personal record:** the operator's existing witness ledgers, written by the `~/.agents` tap. They are neither test data nor production data. Horizon only reads them, through the existing read-only command allow-list, in both setups. It never writes to them, and they are never cleared.
- **Test setup record:** a separate witness directory under the test setup's folder.
- **Production record:** a separate witness directory under the production folder.
- A single entry can never be removed from a record. A whole separate test record can be thrown away, and the clear step does that. Reword "cannot be deleted" accordingly.
- The production "starts empty" check covers the production record and Horizon's production store. The personal record is excluded by name.

**D2. Setup setting.**
- `HORIZON_SETUP` = `testing` | `production`. It is parsed in `src/config/load.ts`.
- Folder: `~/.horizon/setups/<name>/`, with a marker file `SETUP.json` (`{name, root, createdAt}`).
- One mapping table gives, for each setup: the org id, `HORIZON_STORE`, `XDG_DATA_HOME` / `XDG_STATE_HOME` (for Horizon's own witness writes only), `SEA_FORGE_ROOT`, `SEA_FORGE_SOCKET`, `COGNATE_WORKBENCH_HOME`, `PORT`, the GitHub sandbox repository and the board.
- Workbench uses its bundled pg0 under the setup folder, so no outside Postgres is needed.
- `scripts/setup-env.ts <name>` prints the environment for starting each service.
- `scripts/setup-init.ts --setup <name>` creates the folder, the marker and fresh directories.
- `scripts/setup-clear.ts --setup testing` lists every path and every GitHub item first, and needs `--yes`. It refuses if the setup is `production` or the marker is missing. It deletes the test folder, the sandbox issues and the sandbox board. It never deletes a repository; the scope used is `project` plus the existing `repo`, never `delete_repo`.
- `scripts/setup-check-empty.ts --setup production` must report zero cases, notes, labels and production records.

**D3. Workshop key.**
- New Workbench CLI command: `identity issue --label <l> --days <n>`, at most 90 days. It calls `identity.session.issue` with the running operator session. It writes the key to `<setup root>/secrets/workbench.key` with mode 0600 and never prints it.
- Horizon reads the path from the setup.
- The status bar warns when 7 days or fewer remain.
- Test: the key never appears in logs, records or exports.

**D4. Presenting.**
- Key: `<setup root>/secrets/presenting.key`, 32 random bytes, created once.
- Stand-in: "Project " + the first 4 base32 characters of HMAC-SHA256(key, name). Change the design's "Project A" example to match.
- **Exports:** while Presenting is on, exports always use stand-ins. With Presenting off, the export asks, and the default is stand-ins. Make §5.1, §10, §12 and §13 consistent with this. (Style R6.)

**D5. One door for work.** (Style R2, readiness B16.)
- There is no separate ticket list. Every piece of work enters as a case step through `case.add_item`.
- Work enters through three entries: Hand off, GitHub issues (through the connector), and agents in the workshop proposing follow-up steps (`proposed_by` is already recorded).
- The "DeepSeek-derived agent tool" is Cognate Workbench itself, which grew out of it. Remove it as a separate repository or change. Say this once in the glossary.
- "No importer" becomes "no separate ticket list".

**D6. GitHub.**
- One board per organization. Drop the per-case board exception (style Y20).
- Use `gh api` (REST and GraphQL) through the operator's existing `gh` login. Horizon stores no token.
- Check sub-issue support during test setup creation. If it is not supported, fall back to a task list in the parent issue's body.
- Store the cursor in a DurableStore collection, `horizon-github-cursor`. Save it after each successful write. There is no outbox.
- The `project` scope and the sandbox repository (`GodSpeedAI/horizon-sandbox`) move into the test-setup section as named checks. (Readiness M12.)

**D7. Hand off duplicates.**
- `request_id` = `"handoff:" + draftId`. The `draftId` is a UUID made when a composer draft starts, and it survives restart.
- A retried send makes no new step. A new draft makes a new step. (Readiness B12b.)

**D8. Preview code** follows codebase finding 1: a `plan:<sha256 of canonical JSON {template_sha256, params, items}>` `RecordDigest`, resolved by an extended `TemplateRecordResolver`. A mismatch is refused by the existing precondition failure. Cite its error class from the code.

**D9. `external_ref`:**
- `Option<ExternalRef { kind: ExternalRefKind (GithubIssue | Ticket), id: String, url: String }>`, with `#[serde(default, skip_serializing_if = "Option::is_none")]`.
- Test: old step JSON without the field still loads.

**D10. Batching threshold.** Stage 1 measures the delay between an event and its record, and sets the threshold to 2 seconds median unless the measurement shows otherwise. Stage 5 cites that number. (Readiness B19.)

**D11. One build at a time.** Each sea-rs, Cognate or Workbench change ends with:
- one build, after checking free memory;
- stopping that service;
- restarting it with the setup's environment.

(Readiness M11.)

**D12. Stage order.** Stage 6 needs stage 4's agent steps; say so. Stage 6's done criterion includes `setup-clear`, then `setup-init --setup production`, then `setup-check-empty`.

## Style rulings (design document)

**Accepted:** R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13 (partly; see below), and Y1–Y30 except where noted, plus all GREEN findings. The settled word choices:

- **Check code** replaces "version code". It is a short code made from some content. The same content always gives the same code, and the code reveals nothing about the content.
- **Edition** is used only for the rulebook.
- **Record keeper** is the witness part. **Record** is one entry. On screen it is "Records".
- **Case keeper** and **Workshop** are defined in §2.
- **Connector** is defined as "a small program that keeps GitHub and the case keeper in step".
- **GitHub issue** means a task on GitHub; a **sub-issue** is a smaller task inside one. A **GitHub tag** is the label on an issue. A **GitHub board** is a GitHub Project.
- **Label** is used only for the operator's pass/fail verdict on a run. The automatic ones are "automatic labels". "Reviewed by operator" is a **mark**. The composer's tag is the **mode tag**. The link chip is a **link**.
- **Test setup** replaces "throwaway setup" and "sandbox". GitHub's test repository and board are the "test repository" and "test board". **Production** is the real setup. Both go in §2.
- The agent's own tools are "the operator's agent tools", not "agent setup".
- **Not connected** is the only phrase for a missing part.
- The loop step "Judge" becomes **Decide**.
- The demonstration's columns are **"What the agent reports"** and **"What the independent record shows"**, everywhere.
- "Merge" becomes "add the fix to the main code", and the rule becomes "tests must pass before a fix goes in".
- "Settle" becomes **final sign-off**: closing the case and recording the final outcome. It cannot be undone. Define it in §2.
- "Evals" becomes "**checking whether the agents work**". The "AI judge" becomes "**an AI reviewer that scores runs**".
- "Approve" is removed. People **accept**, and rules **allow**.

**Partly accepted, with the reason:**
- **R13:** product names stay in the §1 "Name" column only, because the operator and the demo audience need the role-to-product map. They are removed from every other place in the body.
- **R11:** the "Elephant-and-Goldfish" name stays in one parenthesis, after "fresh-eyes review", because it is the operator's own method name.

**Declined, with the reason:**
- **Y31:** the keyboard table stays. "Ctrl/Cmd+K" is the plain, standard way to write a shortcut.
- **"12 pixels"** stays as a measurable design target.

## Readiness rulings (annex)

**Accepted:** all Blockers (B1–B19), Majors (M1–M17) and Nits (N1–N6). Where a finding offers a fix, use that fix unless D1–D12 say otherwise.

**Rule for any fact not yet known:** the annex editor may look facts up in code, read-only. Examples: the witness write path, the DomainForge path, the cockpit path, the Workbench route file, the t05 file names and the test file locations. Anything that still cannot be found stays **check first**, with the exact command or file that answers it. It is never guessed.

## Codebase rulings

**Accepted:** all five findings, already applied to the annex: preview code reuse, DurableStore collections, line numbers, vendored packages and the obligation adapter.

## Later rulings (after the annex rewrite)

- **D3 revised (CF1):** a separate CLI cannot reach the operator's session, so the workshop key is issued by a "Connect Horizon" Settings action instead. The server writes the key file, and the key never reaches the browser.
- **F1:** the Hand off preview comes from the case keeper via `case_add_item` with `dry_run: true`, plus the `plan:` digest precondition (D8).
- **CF2 closed:** sub-issues are supported. **OP1 done:** `GodSpeedAI/horizon-sandbox` was created (private) on 2026-11-06.
- **Remaining check-first items (CF3–CF12)** are answered by running or reading the named command when their stage starts. None blocks the test-setup stage except CF10, which is needed at stage 2.

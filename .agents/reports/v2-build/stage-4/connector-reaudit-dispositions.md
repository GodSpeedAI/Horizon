# Connector re-audit: rulings (2026-11-07)

Source: `blind-critic-connector-reaudit.md` (Codex, blind, second and last audit allowed). Each finding gets a ruling.
- **FIX:** the ruling names the change and the regression test it needs.
- **DECLINE:** the ruling gives the reason.

No third audit. The fixes are proven by tests that fail before the change.

| # | Finding | Ruling |
|---|---|---|
| B1 | Lock: an empty lock file is treated as stale | FIX. Write the pid to a temp file, then `link()` it to `connector.lock`. That step is atomic and fails if the lock exists. A lock counts as stale only when it holds a pid and that pid is dead. |
| B2 | An issue-create timeout is followed by a retry that makes a duplicate | FIX. After a create times out or fails, do not create again. Re-list issues by the connector's login and label using REST list, not search. If several parents or steps carry the same marker, keep the oldest and close the others with a plain comment ("duplicate made by a retry"). Test both the timeout and the cleanup. |
| M1 | Shutdown releases the lock while writes are in flight | FIX. On shutdown, stop intake, drain the queue (bounded wait), kill the `gh` process groups, then release the lock. |
| M2 | A failed old-label delete makes the retry post a duplicate comment | FIX. The marker is `to@<event id>`, with no `from`. Poll recovery reuses the last event id it saw for that step. |
| M3 | Buffered events post only the latest state | DECLINE. GitHub mirrors the current state; the case keeper keeps the full history. Skipping intermediate states is intended, and the design §7 says state goes back as the current tag plus a comment. Write it in the connector README. |
| M4 | A copied `horizon-case` marker on someone else's issue is trusted | FIX. Parent and step markers count only on issues the connector's own login authored, the same rule as comments. |
| M5 | A title edit gives `request_id_reused`, then the sync is skipped | FIX. For `github:` request ids, `request_id_reused` means the step already exists. Keep syncing its state. Title edits are not carried into the case (say so in the README). |
| M6 | A refused intake is cached as done | FIX. Keep refused intakes in a retry set, retried each poll with backoff (at most every 10 minutes). |
| M7 | A credential in a title is copied into the case item | FIX. Pass titles through `redact()` at intake. |
| M8 | Quoted credentials get past `redact()` | FIX. Cover JSON- and quote-wrapped keys: `"password":"…"`, `'token': '…'`, `token="…"`. |
| M9 | Request/reply sockets have no size cap | FIX. Apply the same 8 MB line cap to every keeper call, dropping the connection with words. |
| M10 | `spawnSync` stops a child only with SIGTERM | FIX. Use `killSignal: "SIGKILL"` after the timeout (or move to `run-child`). |
| M11 | `run-child` leaves descendants alive after a normal exit | FIX. Always kill the process group when the call finishes, including after a normal exit. |
| M12 | `seenIssues` and `placed` grow without bound | FIX. Evict entries not seen in the latest full discovery. Cap both maps. |
| m1 | The poll identity suppresses a repeated close | FIX. The poll marker uses the issue's `updated_at` as its event id. |

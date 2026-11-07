# Stage 1 notes (build)

## Check-first answers (by reading code)

- **CF1/F2 (settled).** Built as the author ruled: a Settings action "Connect Horizon" (Settings > Governance & evidence), server side `identity.connectHorizon`. It writes `<dirname(COGNATE_WORKBENCH_HOME)>/secrets/workbench.key` (0600) and `workbench.key.json` `{sessionId, expiresAt}`, and returns only `{sessionId, expiresAt}`. Tested against real pg0.
- **CF3 (open).** Cannot be answered by reading: it needs the packaged workshop started with the test setup's environment, then `cognate-workbench doctor`. Code facts: `src/cli.ts` runs the packaged `pg0` only after checking its sha256 against `MANIFEST.json`, and uses an external database only when `COGNATE_POSTGRES_URL` is set. Operator check after the repackage.
- **CF4.** No Cognate change in this stage, so no Cognate package refresh is needed.
- **CF6.** `extensions.cognate` has no `sessionId` field. It carries `correlationId`, and the workshop sets `correlationId` to `session:<sessionId>` (`src/observations.ts:141`, `src/remote/mobile.ts:368`). The workshop session id is therefore `correlationId` minus the `session:` prefix, and the event id is `extensions.cognate.eventId`. Horizon's link uses exactly these.
- **CF8 (open, out of scope).** It concerns `~/.agents` (tap), which this stage may not read or change. Horizon reads an aggregate `journey_check` event with `payload_ref` `journey-score:<id>` if one ever appears, never counts it as a check, and until then the row reads "not recorded — scored outside the record".
- **CF12.** `bun scripts/package.ts bun-linux-x64 linux-x64` (usage at the top of `scripts/package.ts`). Output lands in `dist-package/` of the tree it is run in.

## Deviations (spec vs code), each followed by the code's pattern

1. **Comparison page and surface2.** The surface2 pipeline needs semantic refs, a binder and a frame for every block, and ledger rows have none. The page reuses the `compare` block's shape (left label, right label, dimensions of label/left/right) as a type (`CompareDimensions` in `compare-model.ts`, taken from `SurfaceBlock`) and its table markup styles from `render.tsx`. The grammar is unchanged (15 blocks). The route is the new `GET /workspace/compare`, as the annex lists it.
2. **`ledger verify` added to `READ_ONLY_COMMANDS`.** The annex says "allow-list unchanged", but "record intact" needs a check that runs now. `ledger verify --repo <id> --json` is read-only and returns `{ok, verified_count, first_divergence}`. `verified_count` is also the cache key ("last record number"), so a warm day needs no export.
3. **Reader.** `recordReader(source, bin, run)` was added to `realitytrace-economics.ts` and reuses its runner, allow-list assertion, env rules and `rowsOf`. No third exporter. `settlement.ts` (which exports one ledger by ordinal for a different purpose) is untouched.
4. **Cache content.** `<root>/cache/ledger-<repo_id>.json` stores reduced rows (agent events, workshop correlation, question ids), not the whole ledger. Without a setup the root is `<store dir>/desk`.
5. **"Expected" row.** The annex fills only observed and difference at stage 1. Followed: expected is "not recorded" with a reason, even though declared check ids exist in the ledger.
6. **Extra row "journey score"** (not among the seven) holds the required text "not recorded — scored outside the record".
7. **Workshop link only for workshop-run sessions.** Tap sessions (personal record) have native tool session ids, not workshop session ids. Linking them would be invented data, so they show "No workshop link" with the reason. Workshop-record sessions link as `${workshop.url}/#sessions/<sessionId>/<eventId>`.
8. **Presenting scope.** Names are hidden as whole words, so a short repo name does not corrupt other words. The page title and chrome do not use the product name, so a repo named like the product cannot trip the scan.
9. **`setup-scripts.test.ts` line 262** asserted `--only tap` is refused (a stage 0 fact). Stage 1 adds a `tap` check, so the test now uses `--only nonsuch`. Same assertion, different unknown name.
10. **Workbench connect action** calls the identity helpers `ensureIdentity` and `issueSession` directly (what `identity.session.issue` does) instead of invoking the capability, because a capability cannot invoke another with the operator context. Same rules: human operator only, operator identity only, <= 2160 hours (default 2160). It is bound as a fifth `DurableSession` capability (`bindT8Identity`, README updated).
11. **Deep-link test file** is `.tsx`, not `.ts` (it renders React, like `ui-experts.test.tsx`).
12. **No ledger-day export of `observed_at`.** `measure-timings` computes `delay.json` from `observed_at - ts` of tap events in the ledger.
13. **Pre-existing Workbench dev database.** The Workbench test ran with the checkout's `.tmp/pg0` on PATH against the running `cognate-dev` instance, as the existing J-AUTH tests do.
14. **Previous Horizon key not revoked.** Pressing Connect Horizon again issues a new session; the older one stays valid until it expires. Revoke from the identity overview if needed.

## Not run on purpose

- `measure-timings.ts` and `walkthrough-capture.ts` against the personal record (data rule). Their logic is tested with fakes. They are the operator's step after the restart.
- Workbench repackage and any cargo build.
- Tap (`~/.agents`) changes and its pytest.

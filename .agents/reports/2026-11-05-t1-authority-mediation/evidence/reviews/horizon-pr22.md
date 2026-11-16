# Review: Horizon PR #22 (D4, SDK adoption), commits 12b9a8a e58434d 1c1f51f 7228224

Verdict: APPROVE. There are no Blockers and no Majors. The Minor findings below should be fixed in follow-ups or before merge.

Checked against: the spec `### D4` (design_draft.md:264-340), the SDK at tag `cognate-runtime-bun-v0.9.0` (`packages/runtime-bun/src/sea-forge-authority.ts`), the installed `node_modules` 0.9.0, and the old `src/adapters/sea-forge-approvals.ts` from origin/main. I ran `scripts/check-single-cognate.ts` and `scripts/teeth-inv2-mutation.ts` in the worktree. Both pass: 28 packages with one copy each, and 3 of 3 mutants caught. I did not stage anything.

## 1. Wire bytes and identity: OK

- **resolve.** The SDK sends the same fields as before: `authority_approval`, `approval_id`, `resolution`, `request_id` `horizon:<id>:<resolution>`, `actor` (the service), and `on_behalf_of` `{operator, role operator}`. The SDK's own parity test pins this (sea-forge-authority.test.ts:456-466, the `oldHorizon` literal).
- **list.** `authority_approvals` with `actor` is sent, and the instance is always given an actor, so `explicitActor` is present. The timeout stays at 15 s.
- **closure.** The verb, fields and `horizon:closure:<op>` request id are unchanged, and the timeout is 30 s.
- **delegated decide.** `request_id` is the operation id, `actor` is the service, and `on_behalf_of` carries `{actor_id, role:"operator"}`.
- **Config contract.** `sea-forge-config.ts` is a verbatim move. All the refuse-to-guess errors are unchanged. The operator-differs-from-service rule is kept (line 61). `seaForgeActorOf` and `ENV_OPERATOR` are kept.
- **Self-approval.** It is still blocked at config time. The SDK also refuses an `on_behalf_of` equal to the service, in `resolveApproval` (it returns `invalid_input`) and in `decide`. `delegating-authority.ts` keeps its own guards.
- **Two changes the spec allows.**
  - `server_busy` answers are now retried within the timeout.
  - The delegated decide now honours `approvals.timeoutMs`.

## 2. Authority boundaries: OK

- **Resolution paths.** Every resolution still goes through the `approvals` guard in `app.ts` and passes `authority.operator` as `onBehalfOf`. The SDK has no path where the service resolves for itself.
- **Delegation.** An unmapped operator is refused before any send. The service identity is never sent as the human.
- **Inbox rows.** Malformed or excluded rows cannot become actionable. The SDK parser is a port of `parseApproval` (SDK source lines 52-83). Case-task rows and unknown states are counted in `excluded`, never listed.

## 3. Deleted code: covered by the SDK

- **Old checks, all now in the SDK.**
  - `APPROVAL_ID` (SDK `APPROVAL_ID`, checked in `resolveApproval`).
  - Resolution enum.
  - Row parsing: `parseApprovalStanding`, same logic.
  - Socket: `exchangeOnce` handles timeout, close, and invalid JSON. It also adds a response-size bound and a server-busy retry.
- **Removed tests.** The two `parseApproval` cases map to SDK tests at sea-forge-authority.test.ts:328-349. The non-array listing case maps to the SDK "no approvals array" `malformed_response` test (557). The malformed-row-count case maps to the `excluded` test (389-394).
- **Behaviour change (acceptable).** A non-array listing used to render an empty inbox. It now returns `{state:"unreachable", message:"malformed_response: ..."}`. This is stricter and fails closed.

## 4. De-vendor: OK, with Minor findings

- **Pins and overrides.** The pins are exact `0.9.0`. The overrides are `cognate-events` and `cognate-runtime-api` at `0.9.0`. The identity tarball is kept.
- **Lockfile.** Every cognate package in `bun.lock` is a registry 0.9.0 entry with a sha512. The only `file:` entry is `@godspeed/identity`.
- **Drift besides cognate.**
  - `@types/node` 26.6.5 to 26.6.6
  - `ansi-regex` 6.4.0 to 6.5.0
  - `lucide-react` 1.61.0 to 1.69.0
  - `undici-types` 8.12.3 to 8.12.4
  - `ws` 8.22.0 to 8.22.1

  These are all transitive. `lucide-react` is the largest minor bump (the UI icon library). It is a side effect of regenerating the lock, which the implementer disclosed.

- **M1 (Minor) `scripts/check-single-cognate.ts:19-30`: the walker misses nested duplicates under scoped dependents.**
  - Scenario: `node_modules/@godspeedai/cognate-b/node_modules/@godspeedai/cognate-a` holds a second copy. The `@godspeedai` branch reads `cognate-*` names but never recurses into them.
  - I reproduced this with a fake tree: the script exits 0 with "2 packages, one copy each".
  - This is the most likely place for duplication, because the transitive `^0.9.0` ranges could resolve to 0.9.x. The overrides cover only two packages, so the check's teeth are weaker than claimed.
  - Fix: recurse into every package directory, scoped or not.
- **M2 (Minor) `.cognate/vendor/godspeed-identity-0.1.0-ed6c52a.tgz` is still present.**
  - Nothing references it. The implementer says `git rm` was blocked.
  - Delete it as the spec requires.
- **M3 (Minor) `NOTICE:44`** still says the package closure is vendored under `.cognate/vendor/`. It is now only identity.

## 5. Teeth: OK, with Minor findings

- **Scan coverage.** The scan covers `.ts` and `.tsx` under `src/` recursively (`check-boundaries.ts:155`), and asserts `scanned === 0` fails (line 163).
- **Mutation script.** It runs a control and three mutants, one per regex. It requires the planted file name in stderr, so it cannot pass by failing for another reason. I ran it: 3 of 3 caught.
- **M4 (Minor)** The mutants are all `.ts` and sit at depth 2. A regression that dropped `.tsx` would go unnoticed.
- **M5 (Minor)** `walk` uses `entry.isFile()` and `entry.isDirectory()`, which are false for symlinks. A symlinked `.ts` under `src/` is not scanned.
- **M6 (Minor)** The regexes follow the spec but miss `"unix":` (a quoted key) and `"verb":"authority_…"`. They also miss template literals, `Bun["connect"]` and `node:net`. The spec accepts this limit.

## 6. `delegating-authority.ts`: OK

There is no exception, which follows the spec's "No exceptions inside `src/`" (line 96). It now calls `client.decide(operation, worldRef, approval, undefined, {onBehalfOf:{actor_id, role:"operator"}})`. The `send`, `delegationSender` and `delegationSend` seams are deleted. The unmapped-operator and service-identity guards are intact. The "sea-forge unreachable" `unknown` result now comes from the SDK `decide`.

## 7. Gateway, installer and stage: no runtime impact

- **Unit env.** `gateway-setup.ts` is unchanged except for one import path. The unit env, including `COGNATE_SEA_FORGE_OPERATOR`, is unchanged.
- **Stage contents.** `RUNTIME_ENTRIES` is unchanged. `node_modules` is copied as before, with the same 8 relative `.bin` symlinks. `.cognate` stays excluded, so the shrunken vendor directory has no effect.
- **Installer.** `PLAN_TABLE` rows are fixed paths and are not affected by `src/` or `node_modules` content. The manifest and symlink list are regenerated at stage time.
- **Not run.** I did not stage, as instructed. Run `just gateway-stage` once after merge to confirm.
- **Dependency contents.** `node_modules` now comes from the registry instead of tarballs. The `SECRET_NAME` filter in `excludeReason` could silently drop a newly-named file. I found no evidence of this.

## Other Minor findings

- **M7 `src/app.ts:542` and `:782`: failure classes are flattened into a message.**
  - `resolved.errorClass` is used only when the error text is "no detail". An `unreachable`, `invalid_input` or `response_too_large` failure now reads "APPROVAL: SEA-Forge refused the resolution: <text>".
  - Before, transport failures threw the raw message. The text now misdescribes a transport failure as a refusal.
  - It still fails closed. Nothing in `src/` matches the old messages, and `server.ts:585`'s `startsWith("APPROVAL: the requester")` is unaffected and was never matched by this path.
- **M8** `test/remote-sessions.test.ts` rebuilds the wire request inside its fake `decide`. The delegated-decide bytes are therefore not asserted in Horizon. The spec assigns them to the SDK parity suite, which asserts `on_behalf_of` composition (test 596) but, as far as I saw, not a byte-exact delegated literal. Consider adding one.

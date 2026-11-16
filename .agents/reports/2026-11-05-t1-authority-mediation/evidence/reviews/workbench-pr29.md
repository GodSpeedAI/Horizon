# Review: Cognate Workbench PR #29 (t1/sdk-adoption)

Verdict: APPROVE. No Blocker or Major findings. Four Minor findings.

## Checks against the spec
1. Behaviour preservation (governance.ts): all hold.
   - Capability names and the startup checks (lines 43-45) are unchanged.
   - The direct-human guard (`ctx.actor.kind !== "user" || ctx.runId`) is unchanged.
   - `pollApprovals` still runs after a successful resolve.
   - `onBehalfOf: a.operator`, and `timeoutMs: a.timeoutMs` is passed on both calls.
   - The client is built with `requestIdPrefix: "workbench"`, so request ids are still `workbench:<id>:<resolution>`.
   - The actor is passed only when `COGNATE_SEA_FORGE_ACTOR` is set. SDK `listApprovals` sends `actor` only from `explicitActor` (sea-forge-authority.ts:540). The SDK default actor is `cognate-service/service`, which equals the old `a.service`.
   - The list error message matches the spec. Malformed rows are dropped by `parseApprovalStanding`, and `excluded` is not exposed, so contract 1.0.0 holds.
2. Validation removal: the SDK covers the old checks, and the error class does not change.
   - The SDK enforces `APPROVAL_ID = /^[A-Za-z0-9_.:-]{1,200}$/`, the same regex as the deleted one (sea-forge-authority.ts:56, 554). It also enforces the approved/rejected check (:555).
   - Both checks run before any send and return `invalid_input`. The capability throws a plain `Error` carrying the SDK text, as the old code did.
   - `validateResolve` also treated a non-object `raw` as `{}`. The new code keeps that coercion, so a non-object still fails closed at the SDK.
   - No input the old code rejected can reach the server.
3. Teeth: the scan covers `.ts` and `.tsx` recursively. `bun test test/boundary-sfwp.test.ts` passes (2 pass).
4. `seaForgeCall` move: the file is byte-identical to the deleted function. Nothing in `src/` imports it. `src/server.ts` and `src/settlement/orchestrator.ts` import only `ExternalAuthority` and the component.
5. Pins and lockfile: all 23 pins are exactly 0.9.0, with no `^` or `~`. The lockfile has no remaining 0.8.0 entries and no non-cognate drift.

## Findings

### Minor 1 - governance.ts:84-86: a missing `approvals` field now throws
- Old: `response.approvals ?? []` returned an empty list.
- New: the SDK returns `malformed_response` (sea-forge-authority.ts:543), so the capability throws `SEA-Forge refused the approval list: malformed_response: ...`.
- Scenario: a gateway answers `{ok:true}` with no array. This fails louder and is arguably safer, but it is an unlisted change. The spec does not mention it.

### Minor 2 - governance.ts:86: listing rows are re-shaped
- The old code passed raw rows through. The new code returns `ApprovalStanding`, which drops any extra server fields and fully validates the known ones.
- Scenario: a UI consumer that read an extra server field would no longer see it. No consumer exists in `src/`. Only the capability itself references the list.

### Minor 3 - test/boundary-sfwp.test.ts:12-20: the scan can pass vacuously
- There is no assertion that the scan visited any files. A wrong root or an empty glob would pass.
- The planted case tests the `matches` function on strings. The temp file is written and then read back directly. It does not go through the directory scanner.
- The detector can fail, but the scanner is not shown to find a planted file. Fix: factor a `scan(dir)` helper, assert `files > 0`, and run it on the temp dir.

### Minor 4 - governance.ts:95-96: the resolve error format differs from the old one
- Resolve failures other than `invalid_input` drop the error class from the message, so `unreachable` and a server `error_class` cannot be told apart.
- This follows the spec. The list message does include the class.
- Behaviour also changed for list calls: the SDK retries no-side-effect calls inside the timeout budget, and responses are now size-limited. Both are intended SDK behaviour.

## Authority and security
No regression found.
- The self-approval guard is still enforced twice: the startup check, and the SDK refusal of `on_behalf_of` naming the service.
- The service identity is never sent as the human.
- The `invalid_input` text exposes only the SDK validation message.

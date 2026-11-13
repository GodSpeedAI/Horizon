# Remediation-4 / Stage 0B: critic round 2 addendum

Branch `horizon-desk-gaps`. Checkpoints: `977e2d2` (critic-remediation), `c305010` (round-2 fixes).
No PR opened, no merge, no branch deletion: the blind critic has not accepted.

## Critic round 2 (Haiku, read-only, on 977e2d2): REJECT

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | Blocking | `horizon.settlement.observe` live_enforcement prose said P2 and claimed the desk writes the observation | Fixed in `c305010`: P3 in both enforcement entries; note says the route refuses before the handler runs |
| 2 | Blocking | device.pair: terminal presence (typed code on /dev/tty) may not be a "trusted human-authority mechanism" | **Owner decision, not resolved.** See below |
| 3 | Blocking | PE-67 passed only because the listener was closed | Fixed: test restarts the listener and asserts the old cookie is refused and no device is active |
| 4 | Advisory | finish route read generation and controllers outside the serial chain | Fixed: enabled check, read and record run inside `serial`; `remote_off` response unchanged |
| 5 | Advisory | `typed()` can re-add an entry after `abandonWaiting` | Open. Harmless: commit checks store state. Fix: check open-map membership after each await |
| 6 | Advisory | `applyConfirmed` runs before `replaceDevices`/`addDevice`; a throw burns the code | Open, accepted limitation (fail closed). Needs a route test that injects the failure |
| 7 | Advisory | no route test for confirmed-but-uncommitted enrolment ended by stop/refresh; PE-66 can pass vacuously | Open. PE-71 is unit-level |
| 8 | Advisory | device.pair requester and executor are both `code_holder` | Owner to confirm intended (see F7 below) |
| 9 | Advisory | "NE-09 made semantic" is not in the Stage 0B prereg | Checked: NE-09 is the title of `test/identity-contract.test.ts` ("a stale or malformed manifest fails loudly"), which cites an ID from a prereg not in `.agents/prereg/horizon`. Not a Stage 0B expectation; no entry added |
| 10 | Advisory | executor comparison skipped when a row's executor is null | Moot today: class default is `human_session`; noted |

Critic items checked and accepted: grant.revoke and gauntlet.run.cancel are reserved with no route; handoff.send is refused at the route; device.settlement.observe and device.settlement.rule are refused at `/m/api/command`; grant.redelegate has no route; pairing redeem is single use; refresh and stop run through `serial`; commit checks confirmation state, expiry and generation; NE-58, PE-71 and NE-51 cover expiry and CAS.

## Owner decisions still needed

- **F7, device.pair authority (critic #2, requirement 1).** The authority today is the 6-digit code shown on the desk terminal and typed on `/dev/tty`. It is bound to the pending id and operation digest, expires in 5 minutes, and browser clicks cannot supply it. Owner question: does terminal presence count as the trusted human-authority mechanism for a P3 enrolment, or does it need A3-UV?
  - Option A (smallest): owner accepts terminal presence in writing. Record that acceptance in the catalog (`human_evidence` on device.pair) and in the report. No code change.
  - Option B: require A3-UV. Needs an assurance path that does not exist yet, so device.pair stays refused until Stage 3.
  - Recommendation: A, with the acceptance recorded, because it is the only mechanism that exists and it is already tested.
- **F5 (`registered_agent` executor caller kinds) and F6 (14 P2 rows with `none_required` ownership):** unchanged from the previous report; still owner decisions.
- **F8, requester = executor rows** (expert.*, isolation.request, device settlement rows): does a single principal that requests and executes count as separation when the approver is independent? The enforced rule says yes.

## Validation at c305010

- `bun run tsc --noEmit`: clean.
- `bun test`: 1618 pass, 0 fail.
- `teeth-t23-mutation`: 46 of 46 caught.
- design consistency: 14 comparisons agree. Stage 0B coverage: 37 expectations linked. Prereg shape: ok.

## Remaining blockers

1. F7 owner decision (device.pair authority).
2. Critic items 5, 6, 7 (code and tests), not yet done.
3. Containment for agent grants (`grant.revoke`, `gauntlet.run.cancel`): no runtime path; SEA-Forge unpublished.
4. Separation of duty is enforced only where a pending record with an approver is written.
5. Same-terminal processes can read and type codes (tty trust).

The critic cannot return ACCEPT while F7 is open, so the PR stays closed.

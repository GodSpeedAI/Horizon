# Decision needed: can an agent in the paired browser act as the person?

Status: SUPERSEDED on 2026-11-16 by owner ruling OD-1 (S1/A3 phone authority). The original status follows unchanged: open, not implemented, needing a decision before the desk can claim "agents may only propose; the person decides." See the closing section "Closure (2026-11-16)".

(Original status line: Status: open. Not implemented.)

## 1. The problem Sol's recommendation solves

Critic finding 4 (blind review, round 1, `app.ts` around the agent-source check):

- Human-only actions (answer, route, withdraw, reassign, stop waiting, remove) are allowed when the request carries a valid pairing session cookie.
- Agent requests are recognised by the `x-horizon-source` header. Agent-only limits are enforced by that header.
- An agent that runs inside the paired browser (browser automation, or any script on the page) can leave the header out. The same human request then returns 200 instead of 403.

So the rule "agents cannot act as the person" is enforced only by the caller saying who it is. The desk cannot tell a person's click from an agent driving the same browser session.

The HttpOnly cookie does not help: it stops JavaScript reading the token, but any code running in the page can still send requests that carry it.

## 2. Sol 6.1's recommendation (summary)

Source: the full sol 6.1 answer is in `/tmp/claude-1000/-home-sprime01-projects-Horizon/153d70cd-d7e5-4657-8444-9a0c48bbc206/scratchpad/critic/sol-item4.out` (lines 2249 to 2320). Summary:

1. Three separate capabilities:
   - **Agent key**: each agent holds its own bearer key. It can submit panels and read its own answers. It can never authorise a human action.
   - **Browser session**: unchanged (terminal pairing, 12-hour HttpOnly cookie). It can view the desk and submit **proposals**.
   - **Terminal approval**: a confirmation typed into the operator's terminal. It is never a browser credential or HTTP parameter.
2. Every human-only action becomes a **proposal**:
   - The server validates it and freezes it (exact operation, answer, recipient, affected objects, state versions). It returns `202 Pending confirmation`. Nothing changes yet.
   - The operator sees the proposal in the terminal, with agent text marked and control characters escaped.
   - The operator types a fresh challenge into the terminal. It is valid for that one proposal, for 60 seconds, and is never sent to the browser.
   - On confirmation the server rechecks the session and versions, then consumes the proposal and commits the effect and its receipt in one SQLite transaction.
   - Proposals expire after 2 minutes. Logout, session expiry, or restart invalidates them. No "approve for N minutes" mode and no HTTP approve endpoint.
3. Agent-door routes that change state (`ask.withdraw`, `answer.route`, and any move of an existing question) must also become proposals. Returning success for a committed human action keeps the hole open through another door.
4. Agents must run in an OS-enforced sandbox that excludes the operator terminal, desktop control, pairing output, Horizon's process memory, and writable desk storage. Separate credentials alone are not enough.

## 3. Impact of the recommendation

### Product and UX (largest impact)
- **Every human action needs a terminal step.** Answering a question in the browser would show "Awaiting terminal confirmation" and the operator would type a challenge in the terminal. This is a visible change to the core flow of the desk, not a back-end detail.
- Two review surfaces: the browser shows the request, the terminal is the authoritative review. Users may find this confusing.
- Latency: each decision costs one extra round trip the operator must act on. Pending proposals pile up if the operator is away (they expire after 2 minutes, so a late answer must be redone).

### Architecture and deployment
- Requires an **OS-level sandbox for agents**. That lives outside this repo (service or container configuration). Without it, the design is not secure; with an unrestricted same-user agent it cannot be made to hold.
- Adds a proposal store (new durable records), a terminal confirmation path inside the running process, and changes to every human route and the agent-door allowlist.
- Estimated work: seven steps (sol's change set). Each has one test. This is larger than any round so far.

### Security posture after the change
- Closes the browser-automation path for human actions, assuming the sandbox holds.
- Residual risks that remain: an agent with same-user access to process memory, the SQLite file, or the terminal can defeat it. A browser agent can still submit nuisance proposals or mislead the operator about what they are reading. A mistaken human confirmation is always possible.

### Rejected options (per sol)
- Stronger headers, CSRF tokens, origin checks, or trusted-click checks: an agent in the browser uses the same request path as the person.
- Fresh pairing that unlocks mutations for a time: the agent can act during the unlocked window.
- A per-action code typed in the browser: page scripts or automation can capture it.
- Separate browser profiles alone: operational help, not enough once the browser itself is compromised.

## 4. Options for you to choose

| Option | What it means | Cost | Protection |
|---|---|---|---|
| A. Sol's design (terminal confirmation + sandbox) | Recommended by sol 6.1 | Large UX change, sandbox outside repo | Strongest |
| B. Narrower: keep browser answers, require the agent door to be the only agent route, and document that a browser-controlling agent is trusted | Smallest change; the header rule is replaced by separate routes | Low | Stops accidental and naive agents; not a determined agent in the browser |
| C. Leave as is and document the residual | No change | None | Known hole stays open |

My read: B is the honest near-term option if the desk is only ever used with agents that do not control the operator's browser. A is the right answer if agents may drive the browser. Only you know which of those is true.

## 5. Decisions needed from you

1. Which option (A, B or C)?
2. If A: may the operator confirm in the terminal for every human action, accepting the UX change? And will an OS sandbox for agents be provided?
3. If B or C: do you accept that a browser-controlling agent can act as you until A is in place?

Until you answer, the other round-2 findings are being fixed; this item stays open and is listed as a known residual in the final report.

## Closure (2026-11-16)

Owner ruling OD-1 (2026-11-16) approved the S1/A3 authority design and ruled that it supersedes the A/B/C choice above. The paired phone is the independent A3-UV confirmation surface for human-reserved operations. There is no terminal confirmation for routine work, and P0 to P3 classification with proportional authentication stays.

- Option A (terminal confirmation plus sandbox): superseded. Terminal confirmation is not the human-authority surface.
- Option B (narrower, agent door as the only agent route): superseded. The agent door remains the only agent route, but it is no longer the answer to the authority question.
- Option C (leave as is): rejected. The residual is closed by the phone surface, not documented.

Sections 1 to 5 above are kept as the record of the question as it stood on 2026-11-08. The ruling is recorded in the FDE convergence decision record `2026-11-16-owner-rulings-OD-1-to-OD-6.md` and in `.agents/reports/horizon-decisions.yaml` as DEC-OWNER-2026-11-16-01.

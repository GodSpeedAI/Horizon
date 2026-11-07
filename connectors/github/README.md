# GitHub connector

Mirrors a Horizon case on GitHub. It runs `gh` under the operator's own login; Horizon stores and reads no token.

## Start

```
set -a && eval "$(bun run scripts/setup-env.ts testing --service connector)" && set +a && bun run connectors/github/index.ts
```

It needs `<setup root>/github.json` (made by `scripts/setup-github.ts --setup <name>`). Only one connector runs per setup: a second one is refused because the pid lock `run/connector.lock` is held. Stop it with SIGINT or SIGTERM; it stops taking work, lets writes in flight finish (up to 10 seconds), kills any `gh` still running, and only then releases the lock.

## What it mirrors

- In: an issue labelled `horizon` becomes a case step (`case_add_item`, request id `github:<owner>/<repo>#<n>`). Sending it again changes nothing.
- Out: a case becomes a parent issue labelled `horizon-case`; its steps become sub-issues labelled `horizon-step` (or a task list in the parent when `subIssues` is false). Each step's state goes back as one `horizon-state/*` label plus one comment. The case goes on one board.
- Closing, reopening or relabelling an issue on GitHub is noticed by polling and shown as a label and comment.

Only issues and comments written by the connector's own login count as its work. A copied marker on someone else's issue is ignored.

## What it never does

- It never accepts a step. Closing an issue on GitHub is never an acceptance; the connector sends no decision of any kind. Only the case keeper settles a step.

## Decided limits

- GitHub shows the current state, not the history. If a step passes through several states before the connector catches up (for example active, then completed), GitHub gets the current state as a label and one comment; the in-between state is skipped on purpose. The case keeper keeps the full history, and the design (section 7) says state goes back as the current tag plus a comment. This was raised in the second audit (M3) and declined.
- Editing an imported issue's title does not change the step in the case. The step keeps the name it was imported with; its state still follows the issue (M5).
- Titles pass through credential masking on the way in, so a secret pasted into a title is not copied into the case.

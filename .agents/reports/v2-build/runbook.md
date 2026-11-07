# Horizon desk: runbook

Commands to start, look around, clear, and ship. Run them from the Horizon checkout (`~/projects/Horizon`).

## 1. Start the test setup

```sh
set -a; eval "$(bun run scripts/setup-env.ts testing --service horizon)"; set +a
bun run ignite --unisolated-development --cell ~/.horizon/setups/testing/cell --remote-port 4340
```

Open http://127.0.0.1:4339/desk. To stop it, press Ctrl+C in that terminal. From another terminal, use `pkill -INT -f "scripts/ignite.ts --unisolated-development --cell $HOME/.horizon/setups/testing/cell"`. Signal `scripts/ignite.ts` itself: signalling the outer `bun run ignite` leaves the desk and the case keeper running.

The first start writes the cell's rules file, `~/.horizon/setups/testing/cell/policy.yaml`. That file is yours to edit, and the case keeper rereads it on every decision. It lets the operator add steps, mark waiting steps done and approve; agents may propose steps.

## 2. See it working (seed data)

With the test setup running:

| Command | What it does |
|---|---|
| `just seed` | Makes two cases, waiting steps, notes on five days, records, and issues on the sandbox GitHub board. Running it again changes nothing. |
| `just seed-status` | Lists each seeded part and whether it is there. |
| `just seed-clear` | Lists what it will remove, asks, then removes it and leaves the setup empty. Stop the test setup first. Pass `--yes` to skip the question. |
| `just seed-reset` | Clear, then seed. Restart the test setup between the two. |

What to try on the desk:
- **Today:** the day's notes and Getting started.
- **Decide:** the steps waiting for you. *Mark done…* asks for a reason and shows a preview; nothing happens until you confirm.
- **Composer (Ctrl+K):** Tab switches between Write and Hand off. Hand off turns your words into a step in a case. Enter shows a preview, and Confirm adds the step.
- **Explore** and **Work:** cases, steps and what each record keeper saw.

The seed never touches production. It refuses to run when the setup is not `testing`, and on GitHub it uses only the sandbox repository.

## 3. GitHub mirror (optional)

```sh
set -a && eval "$(bun run scripts/setup-env.ts testing --service connector)" && set +a && bun run connectors/github/index.ts
```

A case becomes a GitHub project board and its steps become issues. See `connectors/github/README.md` for what it mirrors and what it never does. It never deletes a repository, and `gh` needs only the `project` and `repo` scopes.

## 4. Check the setup

- `bun run scripts/setup-health.ts --setup testing`: every health check, stopping at the first failure.
- `bun run scripts/setup-health.ts --setup testing --only seaforge`: the case keeper only.
- `just verify`: the full repository check (slow; run nothing else heavy at the same time).

## 5. Ship to production with no test data

1. Stop the test setup, then run `just seed-clear` and `bun run scripts/setup-clear.ts --setup testing --yes`. Both clear commands refuse `production`, and neither deletes a GitHub repository. Links inside the test folder (the workshop makes some) are removed as links; what they point at is left alone.
2. `bun run scripts/setup-init.ts --setup production` creates an empty production setup.
3. `bun run scripts/setup-check-empty.ts --setup production --exclude personal` exits 0 only when production holds no cases, notes, tags, records or GitHub items. `--exclude personal` leaves out your own work record, which is shared by every setup and is not test data. The setup's own rulebook folder is left out while it holds only what a start writes.
4. Start production the same way as step 1, using `production` in place of `testing`, and `--remote-port 4320`. The desk is at http://127.0.0.1:4319/desk.
5. Check it: `bun run scripts/setup-health.ts --setup production --only horizon`, then `--only seaforge`, `--only records` and `--only tap`. The `workbench` and `connector` checks pass only once you start the workshop (port 3180) and the GitHub mirror for production. Both are optional: without them the desk says "Agent work: Not connected" and no board is kept.

After production has been started once, run step 3 while it is running. When it is stopped, the case keeper cannot be asked, so the check fails safe.

## 6. When something is refused

The desk says why in words under the box, and nothing is changed. Common cases:
- **"Preview out of date":** the case changed after you looked. Press *Show the new preview*, then decide again.
- **"The rules for this setup do not allow this":** add a rule to the cell's `policy.yaml` (see the existing lines for the shape).
- **"Agent work: Not connected":** the workshop has no access key yet. Hand off still works, and the step stays with you.

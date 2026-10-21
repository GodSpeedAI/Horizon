# Task: Consolidate branches into main

## Goal
Integrate all worthwhile work from every branch and worktree into `main`, verify the result, then remove the leftover branches and worktrees. No useful change may be lost.

## Definitions
- **Stale**: superseded, duplicated, or intentionally obsolete. Age alone does not make a branch stale.
- **Unique work**: any commit, diff, stash, or uncommitted change whose content is not already in `main`.

## Hard rules
1. Do not delete anything until Phase 5 verification passes.
2. Do not force-push. Do not rewrite `main` history.
3. Do not discard uncommitted work. Commit it to a rescue branch first.
4. Do not delete a branch classified UNCERTAIN. Escalate it.
5. Do not use a full merge where it would restore obsolete code. Cherry-pick instead.
6. Stop and report if `main` is dirty, diverged from origin, or CI is red at the start.

## Phase 1: Inventory
Collect all of the following:
- Local branches, with ahead/behind counts against `main`
- Remote branches (`git fetch --all --prune` first)
- All worktrees (`git worktree list`)
- Uncommitted changes, untracked files, and stashes in each worktree
- Open PRs and their head branches (`gh pr list`)

Output one table:

| Ref | Location | Ahead/Behind main | Last commit | Worktree | Dirty? | Open PR |
|---|---|---|---|---|---|---|

## Phase 2: Backup
- Tag or branch every ref's current tip as `backup/<name>-<date>`.
- Commit each dirty worktree's changes to `rescue/<worktree>-<date>`.
- Confirm backups exist before continuing.

## Phase 3: Classify
Compare actual diffs, not branch names or dates. Use `git cherry`, `git range-diff`, and `git diff main...<ref>`.

| Class | Test | Action |
|---|---|---|
| MERGED | All changes already in `main` | Delete after verify |
| COHERENT | Self-contained, still relevant | Merge |
| PARTIAL | Mix of useful and obsolete commits | Cherry-pick useful commits |
| SUPERSEDED | Replaced by a different implementation in `main` | Delete after verify |
| DUPLICATE | Same change as another branch | Keep one, delete the rest |
| UNCERTAIN | Intent or value unclear | Do not touch. Escalate |

For each ref, record the class and a one-line evidence statement.

## Phase 4: Integrate
- Work on an integration branch off `main`. Do not commit directly to `main`.
- Merge COHERENT branches one at a time. Resolve conflicts in favor of current `main` behavior unless the branch change is the point.
- Cherry-pick PARTIAL commits individually.
- Run the test suite after each integration step. Revert any step that breaks it.

## Phase 5: Verify
Run and report output for each:
- Build
- Full test suite
- Lint and typecheck
- `git diff` of each integrated unique change against the integration branch, to prove it is present
- For each deletion candidate: `git log main..<ref>` is empty, or every remaining commit is classified SUPERSEDED or DUPLICATE

Fast-forward `main` to the integration branch only if all checks pass.

## Phase 6: Cleanup
Delete in this order, only for MERGED, SUPERSEDED, and DUPLICATE refs, and for fully integrated branches:
1. Worktrees (`git worktree remove`), then `git worktree prune`
2. Local branches (`git branch -d`, not `-D`, unless the Phase 5 proof covers it)
3. Remote branches (`git push origin --delete`)

Leave `backup/*` and `rescue/*` refs in place.

## Final report
- Table of every ref: class, action taken, evidence
- List of what was merged and what was cherry-picked
- Verification output
- UNCERTAIN items with a recommendation for each
- Remaining branches and worktrees
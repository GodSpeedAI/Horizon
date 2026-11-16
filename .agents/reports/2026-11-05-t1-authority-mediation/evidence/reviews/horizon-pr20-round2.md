# Horizon PR #20, round 2 security re-review

Range 4d07c08..010b7ad, worktree Horizon.wt-installer. Read-only; no sudo run. Line numbers are scripts/install-sea-forge-gateway.sh unless stated.

Verdict: REQUEST CHANGES (one Major, plus Minors). The three prior Majors are fixed in fact. The test seams cannot act as root.

## Prior Majors

- Cline #1 (directories pinned): fixed. Dir lines are emitted by the stager (gateway-setup.ts copyTree and stageRuntime) and compared as an exact sorted set against `find -type d -printf` (241-247). Extra, missing and unlisted directories are refused. The check runs on the snapshot (267) and again on the deployed copy (410). List line shape is enforced (239).
- Cline #2 (ambiguous names): fixed. Newline, CR, tab and backslash are refused in the full relative path and in every link target via `-path` and `-lname` (225-227). The manifest cannot smuggle in a variant either: a manifest line not matching `^hex{64}  ` stays whole in the want-set and mismatches the find output (229-235).
- Cline #4 (verify-only covers every root-read path): fixed. `check_plan_sources` (271-287) is derived from the plan rows and checks config templates, generated sources and the worlds directory. Row-to-index mapping matches `run_plan`. Residual (Minor 5): a worlds `*.sea` symlink to a directory would fail mid-apply.

## Test seams (question 2): cannot take effect as root

Traced every branch:
- 109: INSTALLER_TEST_MODE with `--authorize-privileged` is refused. This runs before `--dry-run` or `--check` can clear APPLY at 119-120, so those combinations are refused too.
- 110-114: if uid, ruid or EUID is 0, INSTALLER_TEST_MODE (any value) is refused.
- 186-187 (hook) and 496 (deploy DST) additionally require VERIFY=1, mode equal to 1, and all three uids non-zero. VERIFY and APPLY are mutually exclusive (108).
- Under sudo, env_reset drops the variables. If env_keep or `-E` keeps them, the root branch refuses.
- Neither seam can redirect a root write. Both only run as the unprivileged invoker.
- Accepted limit: a hijacked PATH could fake `id`. That already defeats the whole script.

## Findings

### Major 1. Plan fields are unvalidated, and several apply branches hide owner/group/mode from the review output (lines 331, 338, 402, 407, 446, 457-458)

plan.tsv comes from the hostile stage. The installer has no allowlist for owner, group, mode or destination. The owner's only protection is reading the dry-run output before approving the digest. That output omits the fields in these branches:
- `row_deploy_tree` prints a hard-coded "root-owned copy (dirs 0755, files 0644)" (402). Owner and group come from the plan and drive `chown -R -h "$owner:$group"` (407).
- `place_file` "keep" prints "identical, kept (mode and owner corrected)" (331) and then runs `chown "$owner:$group"; chmod "$mode"` (338).
- `row_config_file` has the same pattern (446, 457-458).

Scenario: a hostile stage writes `deploy-tree<TAB>agent<TAB>agent<TAB>/opt/godspeed-horizon`. Dry-run shows "root-owned copy". The owner approves the digest. Root installs a runtime tree owned by the agent login. The runtime service account then executes agent-writable code, so the agent gets code execution as the runtime account. The same happens with `place-binary agent agent 0777 <existing server path>`: when the binary matches, the "keep" branch re-owns the deployed gateway binary to the agent.

Destinations are also free: `worlds` does `rm -rf -- "$dest"` (472) on whatever path the plan names.

Fix, either or both:
1. Validate every row in `check_plan_sources` (runs in verify-only too): owner in {root, plan gateway/runtime account}, group likewise, mode in an allowlist, destination absolute, containing no `..`, and not beginning with `-`.
2. Print the real owner:group mode in every branch (deploy-tree, keep, config identical).

Also add a test for a crafted plan.

### Minor 2. Dry-run digest is not bound to the plan shown (lines 160-162, 211, 622)

Non-root, the snapshot lives in `$TMPDIR/gateway-snapshot.*`, owned by the same uid as the agent. The agent can rewrite `stage/plan.tsv` in that directory between the digest (211) and the plan print (622). The owner then reviews a benign plan with the digest of a malicious one. Root mode is safe because the snapshot is root-owned 0700. Fix: print the plan from the same read that is hashed, or recompute the digest immediately after printing and compare.

### Minor 3. TOCTOU on the stage root (165 vs 168)

The `-L` check is on the original. `cp -a "$STAGE_SRC/."` follows the trailing `/.`, so a swap to a symlink between the two steps snapshots any directory root can read. Install still requires the digest to match, so it cannot install foreign content, but `--check` as root would parse and print it. Fix: `cp -a -- "$STAGE_SRC" ...` after an `[ -L ]` re-check on the copy, or `realpath` the stage once and use that. The 137-139 existence tests run on the original but are used only for the dry-run message, which is harmless.

### Minor 4. ACLs and xattrs are preserved into the snapshot and the deployed tree (168, 177, 406)

`cp -a --no-preserve=ownership` still copies POSIX ACLs. The agent can give itself a named-user ACL on its stage files. `chmod 0644` or `0755` narrows the mask, so effective write is masked and I see no live exposure. But the ACL entries persist in the root-owned tree, and a later `chmod g+w` revives them. Fix: `cp -a --no-preserve=all` (then `--preserve=links` if needed), or `setfacl -b -R`.

### Minor 5. Missing `--` and loose plan values on variable-path commands (317, 404, 421, 427, 483, 553)

Missing: `sha256sum "$dest"` (317), `dirname "$dst"` (404), `cmp -s "$STAGE/$src" "$dst"` (483), `cd "${F[3]}"` (553), and `id`, `groupadd`, `useradd` and `usermod` with plan names (348-364). Values are plan-controlled; fixed by Major 1 validation (leading `-`). Snapshot paths are absolute when root. Non-root with a relative TMPDIR is not a root exposure. Related: a `*.sea` symlink to a directory would abort the apply half-way (469-475).

### Minor 6. `mktemp` with no template honors TMPDIR (451)

As root this is `$TMPDIR` if set. sudo normally resets it, but the script refuses HORIZON_GATEWAY_* and not TMPDIR. If TMPDIR is an agent-writable directory, the rendered config can be swapped between render and `install`. Use `mktemp "$SNAP/render.XXXXXX"`. The temp file is also left behind on `refuse`.

### Minor 7. resetStageDir (gateway-setup.ts, new function) is a heuristic guard, not a containment check

- `stageDir` is `resolve()`d first, so `..` and relative paths are normalized. A symlinked final component is refused. `/` and the resolved home are refused. Symlinks inside the tree are not followed by `rmSync`.
- It does not refuse an arbitrary directory that happens to contain a `plan.tsv`. `existsSync` follows a symlinked `plan.tsv`. The whole tree is then deleted, recursively, with `force`. HORIZON_GATEWAY_STAGE is env-provided. This is not a privilege boundary, since the agent can delete as the same uid already. It is an accident risk (for example a stage path that is an ancestor of the repo or of home subtrees holding a plan.tsv).
- Fix: require a stage marker the stager itself writes, or require exactly the known entry names; refuse when the stage contains or equals the repo.

## Round 2 additions checked and fine

- Snapshot hardening (183-184): `chmod -R` does not follow links. setuid, setgid and sticky bits are cleared. Deployed files and dirs are normalized to 0644 and 0755.
- `snapshot_file` (170-179): a swap to a symlink or special file is caught after the copy.
- Digest and `staged_file` checks run on the snapshot only. `compgen -e | grep -q` under pipefail still detects the variable with 20000 exported variables (tested).

# Round 3 (010b7ad..e7ce6b8)

Verdict: REQUEST CHANGES. The round-2 Major is closed for every field that the table-checked loops see, but one bypass remains through the awk readers.

## (a) PLAN_TABLE and check_plan_sources

Every plan line is matched whole against the table (`plan_row_allowed`, grep -qxF). Owner, group, mode and every destination in the apply loops now come from the table, including worlds dest, deploy-tree dst and the `rm -rf` targets. `check_plan_sources` runs unconditionally before any mode. The display now prints real owner/group/mode.

### Major R3-1. An unterminated last line of plan.tsv bypasses the table (install-sea-forge-gateway.sh:`runtime_account_name`, `render_config` awk, check_plan_sources loop)

`while IFS= read -r line` skips a final line with no trailing newline, so that line is never table-checked. `run_plan` and `run_check` skip it too, but two awk readers do read it: `runtime_account_name` (`$1=="account" && $3=="runtime"`) and the socket group lookup in `render_config` (`$1=="group"`). Verified with a minimal reproduction: the loop checks the first row, and awk prints `evil` from the unterminated row.

Scenario: omit the legitimate `account godspeed-horizon runtime` row and `group godspeed-sock` row, then append `account<TAB>agentuser<TAB>runtime` and `group<TAB>agentgroup` with no final newline. Root renders server.yaml with the agent's uid (`id -u` is accepted, because only 0 is refused) and the agent's gid substituted for `__SOCKET_GID__`. The gateway then authorizes the agent as the runtime peer or the socket group. This also affects the template sed substitutions, whose values are not table-bound.

Fix: require the plan to end in a newline (refuse otherwise), and require each rows' presence. Better: take the runtime account and group from the table, not from awk over the plan.

### Minor R3-2. Table comparison aliases `|` and tab (`plan_row_allowed`)

The plan line has tabs converted to `|` before matching, so a line with literal pipes in place of some tabs matches (`dir<TAB>root|root<TAB>0755<TAB>/usr/...`). Fields then merge, for example owner `root|root`. I traced dir, worlds, deploy-tree, generated and place-* rows; all fail closed (install -o with a bogus user, empty path, or the worlds `runtime/` refusal) but leave a half-applied state. A fully pipe-separated line is refused as an unknown step. Fix: compare with tabs preserved (convert the table to tabs, not the line to pipes), or refuse lines containing `|`.

## (b) INSTALLER_TEST_PLAN_TABLE

Guarded by test mode = 1, non-empty variable, and uid, ruid and EUID all non-zero. As root, line 112 exits before the table is built. With `--authorize-privileged`, line 109 exits (before `--dry-run`/`--check` can clear APPLY). A non-root run cannot reach apply (151). The seam cannot replace the table as root. OK.

## (c) m2 to m7

- m2 (dry-run display not bound to digest): mitigated. The snapshot is still same-uid and rewritable, but the table limits what a swapped plan can select, and the output is labelled display-only. Residual: R3-1 aside, ordering and omission only.
- m3 (stage root TOCTOU): fixed. dev:inode is taken before the copy and re-checked with `-d` and `! -L` afterwards; a mismatch refuses. Root may still read a swapped-in directory into its private snapshot, but nothing is installed from it.
- m4 (ACL/xattr): partly fixed. `cp -a` replaced with `cp -dR --preserve=mode,timestamps,links`, and `setfacl -b` where available. `setfacl` is not installed on this machine, so the scrub is silently a no-op there (`|| true`). Whether `--preserve=mode` carries ACLs depends on the coreutils build; I could not confirm it. The chmod mask still limits effective rights. Residual Minor.
- m5 (`--`): fixed on sha256sum, dirname, cmp, cd, id, getent, groupadd, useradd, usermod; `*.sea` non-regular entries are refused in verify (stricter: a symlinked `.sea` is now refused too). Remaining unquoted-option commands (`id -nG`, `grep -qx` on plan fields) take table values only.
- m6 (mktemp): fixed, now `mktemp "$SNAP/render.XXXXXX"`.
- m7 (resetStageDir): improved. A symlinked or special `plan.tsv` no longer counts as a marker. Residual Minor: any directory holding a regular-file `plan.tsv` is still wiped recursively, and the marker is writable by anyone.

No new seam issues. The R3-1 fix is the only blocker to approval.

# Round 4 (e7ce6b8..82d587d)

Verdict: APPROVE. No Major. One Minor and one Info.

## (a) R3-1 and R3-2: closed

`load_plan` (install-sea-forge-gateway.sh:~314-329) is the only place plan.tsv is opened (grep of the script: the other `plan.tsv` hits are the existence tests at 137 and 202, which run before and on the snapshot, and the load itself). It reads the snapshot once:
- A NUL byte is detected by `read -d ''` returning 0.
- A missing trailing newline, a CR, a `|`, an empty line or a leading newline are each refused.
- Each row is compared by exact string equality against a tab-preserving `PLAN_TABLE` array. This removes the pipe/tab aliasing of R3-2.

All consumers read `PLAN_ROWS`: `check_plan_sources`, `run_plan`, `run_check`, the invoker loop, `runtime_account_name` and the new `socket_group_name`. The awk readers are gone, so the unterminated-line bypass cannot recur. The test seam is now `mapfile -t PLAN_TABLE` under the same guard (test mode = 1, uid, ruid and EUID non-zero), so it is still refused as root and with `--authorize-privileged`.

## (b) Omitted, duplicated and reordered table rows

Every case I traced fails closed or is harmless to the root boundary:
- Missing runtime account row: `runtime_account_name` returns empty, `id -u -- ""` fails, and `render_config` refuses. The uid regex also refuses 0. Missing group row: "plan names no socket group" refusal; the gid regex refuses empty.
- Missing account, group, member or dir rows: later `install -o`, `usermod` and `chown` fail on the missing user or group, leaving a half-applied state. One case: omitting the gateway-root `dir` row lets `worlds` (`install -D`) create `/var/lib/godspeed-sea-forge` as root:root 0755. That is more restrictive than intended, so the gateway cannot write there, but nothing becomes agent-writable.
- Reordering (for example config-file before account) fails on the missing user.
- Duplicates are idempotent: `place_file` and generated rows become "keep", `worlds` re-copies, and `deploy-tree` twice moves the first `.previous-TS` into a nested directory (clutter only).
- Dropping account or group rows also skips the invoker check, but the table fixes every account to godspeed-*, so the check no longer guards anything.

Minor R4-1: the table is a whitelist of rows, not a required set. Require every table row exactly once, in table order (compare `PLAN_ROWS` to `PLAN_TABLE` as arrays), so verify-only cannot bless a bundle the apply would leave half-applied.

## (c) m4 and m7: fixed

- m4: the snapshot and deploy copies use `cp -dR --preserve=timestamps,links --no-preserve=mode,ownership,xattr,context`. I ran this on a 4755 file: it was copied as 0644, links kept, no error. Without `--preserve=mode` GNU cp does not carry ACLs, and the `setfacl` dependency is removed. The chmod normalization still follows.
- m7: `resetStageDir` deletes only an empty directory or one holding `.horizon-gateway-stage` that is a regular file with the exact text. The marker is written by the stager and is part of the digest in both the shell and `stageDigest` (the TS walker includes dotfiles, so they agree). Residual Info: anyone can create the marker deliberately (accident guard, not a privilege boundary), and stages from earlier rounds have no marker, so the first re-stage needs a manual delete.

## (d) New

Nothing else. The errexit pattern inside the table-match loop behaves as intended (checked: a non-final failed `[ ] && ...` does not exit under `set -e`).

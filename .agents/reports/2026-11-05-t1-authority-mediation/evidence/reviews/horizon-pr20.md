# Review: Horizon PR #20 (installer installs only from a verified root-owned snapshot)

Verdict: APPROVE (no Blocker, no Major). Five Minor findings; fixes optional and small.

Method: read full diff of install-sea-forge-gateway.sh, gateway-setup.ts, both test files; traced every `$STAGE`/`$BINARY`/`$BUN_BINARY` use; mutation-tested.
Gates: `bash -n` OK. `bun test gateway-installer + gateway-setup`: 70 pass, 0 fail.

## What holds
1. Snapshot. Every post-snapshot use (plan rows at 364-551, place_file, deploy, render config, check) goes through `$STAGE`/`$BINARY`/`$BUN_BINARY`, which are rebound to `$SNAP/...`. `STAGE_SRC`/`BINARY_SRC`/`BUN_SRC` appear only in messages. The one pre-snapshot read of the original (`[ -e $STAGE/$f ]`, line ~122) only chooses "not staged, exit 0" and cannot install anything.
   - `cp -a` copies symlinks as links. Only the top-level `"$STAGE_SRC/."` is dereferenced, which is the stage path the owner named. Digest plus manifest then pin whatever was copied.
   - A raced copy (mixed state) is hashed after the copy, so it is accepted only if the mix equals the approved bytes.
   - Snapshot is `mktemp -d` under /run (else /root) as root, 0700. The EXIT trap covers `refuse`, errors and INT/TERM/HUP (only SIGKILL leaks, and /run is tmpfs). Trap is set before any content is copied.
2. Manifest/symlinks. File set is compared exactly (unlisted, missing, duplicate, `..`, `./`, `*` binary-mode and uppercase-hex lines all fail closed), then `sha256sum -c`. Newline names are refused. Escape check uses `realpath -m` (resolves chains and intermediate links), with a trailing-slash prefix test, so `/a/bc` does not match `/a/b`. The two checks are complementary: a link like `../runtime/b` passes in the snapshot (dir named runtime) but fails on `$new` (runtime.new-TS), and vice versa, so a link that is only valid under one name is refused. The post-copy check is sound; /opt is root-only.
3. Digest. Covers every regular file outside runtime/ (all files root reads from outside runtime); runtime/ is pinned by manifest plus symlink list, both inside the digest. Shell and TS agree (byte sort of path; `sha  path\n`; fixed 64-hex prefix makes the encoding unambiguous, newlines refused). Test g proves equality on a real stage.
4. Test mode. The hook needs VERIFY=1, INSTALLER_TEST_MODE=1 and uid != 0; `--verify-only` forces APPLY=0 even with `--authorize-privileged`. It cannot weaken a root apply, even if the env survives sudo.
5. Destinations. No temp/intermediate path is agent-writable on the root path (`$new` and `$dst.*` sit under root-only dirs; snapshot in /run).

## Findings
### Minor
m1. install-sea-forge-gateway.sh:157-158 `snapshot_file`: `[ ! -L ]` then `cp` is a TOCTOU. If the agent swaps the source for a symlink in between, `cp` (dereferencing) copies any root-readable file into the 0700 snapshot. The hash check then refuses, so no install, but the refusal message prints that file's sha256 (small hash oracle) and a FIFO swap hangs root. Fix: `cp --no-dereference` is wrong here (sha256sum would follow it later); instead open once and check: `exec 3<"$src"; [ -f /proc/self/fd/3 ] && [ ! -L ... ]` or use `cp -L --` after `stat -c %F` on the fd, and drop the hash from the mismatch message for the snapshot case.
m2. install-sea-forge-gateway.sh:155-161,150: `cp ... "$src"` and `cp -a ... "$STAGE_SRC/."` lack `--`. A path beginning with `-` is parsed as an option (fails closed, owner-supplied only). Add `--`.
m3. install-sea-forge-gateway.sh:146 (stage cp): no size/type bound. `--stage` (or a stage symlink at the default ~/.cache path) pointing at a huge tree makes root fill /run (tmpfs) before any check: DoS only, no integrity impact. Fix: reject a symlinked top-level stage (`[ ! -L "$STAGE_SRC" ]`) and optionally cap size with `du`.
m4. verify_tree (symlink list, line ~209) and TS `assertPlainName`: the shell refuses newlines only; TS also refuses tab/backslash/CR. A list line `symlink\tT\tP` is ambiguous if names contain tabs (target `A\tB`/path `C` vs target `A`/path `B\tC`), so two distinct trees can match one line (both still relative, in-tree, with manifest-pinned files). Not reachable with a stager-produced list; refuse tabs in tree paths and link targets in the shell for symmetry.
m5. Tests: the apply path (row_deploy_tree post-copy check, place_file, rows reading `$STAGE`) is not exercised because the suite is verify-only and needs root otherwise. Mutating the post-copy check (`if ! verify_tree "$new"` -> `if false`) left all 14 tests green. A future regression that reads `$STAGE_SRC` in an install row would also not be caught. Fix: add a static test asserting no `STAGE_SRC|BINARY_SRC|BUN_SRC` use outside `say/echo/refuse` lines, and a rootless test of deploy by sourcing/stubbing `install`/`chown` (or running with a fake-root harness).

Not a finding, pre-existing: `HORIZON_GATEWAY_ROOT` is honored as root if inherited (sudo env_reset normally strips it; `sudo -E`/env_keep would redirect all destinations into an agent-writable prefix). Consider refusing it when `id -u`=0 unless an explicit flag is passed.

## Mutation results (each reverted; `git status` clean afterwards)
| Mutation | Result |
|---|---|
| escape check made always-pass | 1 fail (caught, test e) |
| symlinked --binary refusal removed | 1 fail (caught) |
| post-copy `verify_tree "$new"` disabled | 0 fail, NOT caught (m5) |
| absolute-link case removed | 0 fail (redundant: escape check also refuses; fine) |
| symlink-list comparison disabled | 2 fail (caught) |
| binary hash taken from original path instead of snapshot | 1 fail (caught) |

## Could not verify
- Real root apply (no sudo allowed): setuid-bit handling of `cp -a --no-preserve=ownership` as root (snapshot is 0700 and install rows chmod explicitly, so no exposure seen), exact GNU cp O_NOFOLLOW behavior on the file race on the installed coreutils version, trap behavior on every signal.
- Full apply rows against a root-owned /opt tree; sudo env handling on the owner's host.

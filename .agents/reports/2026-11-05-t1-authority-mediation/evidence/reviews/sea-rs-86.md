# Review: sea-rs #86, branch fix/settlement-orphan-guard (uncommitted)

Verdict: REQUEST CHANGES (no Blocker; three Majors, all about the guard failing open or stuck).
Read-only review; cargo not run.

## Major

M1. Zombies count as live members. `command_launch.rs:111-116` (Linux), `:152-159` (ps).
Scenario: the orphan finishes but its reaper (pid 1 in a container, or a subreaper that never waits) does not reap it. The `/proc/<pid>/stat` entry stays with state `Z` and the old pgid. The guard refuses `NotDeclared` with `settlement_command_alive` forever, and the design offers no override. The same thing makes `not_declared_is_accepted_once_the_command_has_exited` fail after its 10 s loop in CI containers. Fix: skip state `Z`/`X` (`fields[0]`); on macOS add `stat=` to `ps` and skip `Z`.

M2. An unreadable or unparseable entry is read as "not a member", so the check fails open. `command_launch.rs:84` (`.ok()?`), `:102` (`dir.flatten()` drops readdir errors), `:111`, and the ps `filter_map` at `:154`.
Scenario: EACCES, EMFILE or a transient read error on the orphan's `/proc/<pid>/stat` leads to `Gone`, so the operator is allowed to attest `NotDeclared` while the orphan runs. Only `NotFound` and `ESRCH` mean the process is gone. Fix: any other error, a stat line with no `)`, or a non-numeric pgrp field returns `Err`, which becomes `liveness_unknown`. The `hidepid` probe at `:96` covers only pid 1.

M3. A `launched:<n>` record that exists but is malformed falls back to lease-only. `cep.rs` `recorded_launch`: the `?` chain on pgid and `u32::try_from` returns `None`, which is the same as "no record".
Scenario: a payload with the pgid missing or too large reopens #86. Fix: distinguish "no entry" (old behaviour) from "entry unreadable" (`settlement_command_liveness_unknown`).

## Minor

m1. Failure cleanup in `declaration.rs:~363-371` ignores the `tree.terminate` error, and `child.wait()` can block if the kill failed. It does return an error, and it is safe, because stdin is dropped and the request was never sent. The error maps to an ambiguous claim, which stays open, which is acceptable. Log the terminate error.

m2. `declaration.rs:~359`: with `with_launch_evidence` set but `authorization_ref == None`, no record is written, and nothing says so. Log it, or document it.

m3. macOS: `kern.boottime` and `ps lstart` can shift when the clock is stepped. A spurious mismatch gives `Gone` (boot_id) or `Gone` (starttime), which fails open. Prefer comparing only when both values parse, and treat a mismatch as `Unknown` unless the boot difference is large. Pid reuse cannot happen while any member of the group lives, so the starttime check is largely redundant on Linux.

m4. The cycle needs no change. The authority integration test links one copy of the authority crate. Only in-crate `#[cfg(test)]` unit tests would see two copies, and none uses settlement types. A path dev-dependency without a version is stripped on publish. I did not run `deny.toml` or cargo-deny.

m5. No unit test covers `/proc` stat parsing with a `comm` such as `a) b (c`. The code (`rfind(')')`, index 19 for starttime, index 2 for pgrp) is correct.

m6. Docs: add the zombie behaviour and "no operator override when liveness is unknown" to the bounds. Note it in the `resolve_uncertain_settlement` doc at `cep.rs:3191` as well.

## Verified OK

1. Ordering is correct. The record is written after the spawn and before the stdin write, so a command with nothing on stdin cannot declare. A crash in that window closes stdin; this is the documented bound. If the write fails the command is killed (`declaration.rs:~363`), and the error is ambiguous, so the claim stays held.
2. Linux fields: pgrp is field 5 and starttime is field 22. Both indexes are right.
3. boot_id comes from `/proc/sys/kernel/random/boot_id` on Linux and `sysctl kern.boottime` on macOS. A missing value skips only the boot comparison; the group check still runs, which is conservative.
4. Claims with no record behave as before.
5. The record is create-only (`commit_typed_once`). A different payload under the same key is an integrity error, which fails closed, and a re-claim uses a new attempt number.
6. The race test reproduces steps 1-5 with real processes. It would fail without the guard, as the implementer's red run shows. Orphans exit within about 3 s, so nothing is left behind.
7. There is no `unsafe`. The `resume.rs` and `delegation.rs` wiring is correct, and `root` is the same ledger root in both.
8. The idempotency MUST and the bounds are accurate.

## Round 2 (fixes re-checked; read-only, cargo not run)

Verdict: APPROVE (one doc nit).

- M1 fixed: zombie states Z/X/x are skipped in the /proc parse (`command_launch.rs:116-118,192`) and in `parse_ps_members` (`ps ... stat=`, `:133`). Unit tests cover both.
- M2 fixed: only ENOENT/ESRCH mean gone (`:153-155,187`); other read errors, readdir errors, an unparseable stat line and an unparseable ps line return Err, which becomes liveness_unknown. A zombie leader is excluded from `members`, so the start-time check is skipped and surviving members still count as Alive.
- M3 fixed: `recorded_launch` returns `Some(Err)` for an entry that exists but is malformed (including pgid 0). That is liveness_unknown, not lease-only. `None` is reserved for no entry.
- (a) Override: `NotDeclaredCommandGone` is folded into `NotDeclared` after the role check is still enforced (cep.rs, `resolve_uncertain_settlement_with_hook`; the operator check follows the conversion, so non-operators are refused). The `Alive` arm returns before the attestation is consulted, so a live group is never bypassed. Only `Unknown` and `Some(Err)` honour the flag. The audit record carries `command_gone_attested`, `command_liveness_overridden` (true only if the override was actually used) and `command_pgid` (null if the record was unreadable). `--attest-command-gone` has `requires = "not_declared"`, and `--declared` conflicts with `--not-declared`, so it cannot be combined with `--declared`; the library variant is NotDeclared-only. Tests cover the malformed-record override and the live-command refusal.
- (b) macOS: the boot_id mismatch is ignored off Linux and the group decides. A leader start-time mismatch returns Unknown, not Gone. An empty group is still Gone, which is correct. Only Linux treats a start-time mismatch as Gone, and that is sound because the kernel will not reuse a pid still in use as a pgid.
- (c) `wait_bounded` (5 s, `try_wait` polling) replaces the unbounded wait. A terminate error or a timeout is reported in the error, the error remains ambiguous, and the claim stays held. Correct.
- (d) No new fail-open path found. Residuals: Linux with a rebooted host and unreadable boot_id falls through to the group check, which is conservative.

Nit (Minor): the module doc at `command_launch.rs:14-15` says the flag overrides "a group that stays alive". The code correctly does not. Reword it.

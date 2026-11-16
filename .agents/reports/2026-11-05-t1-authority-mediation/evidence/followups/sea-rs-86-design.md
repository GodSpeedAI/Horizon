# sea-rs #86 design note: SWE_SEED command outliving a server crash

Worktree: /home/sprime01/projects/sea-rs.wt-86, branch fix/settlement-orphan-guard at origin/main 55bb3937 (includes PR #84).
All paths below are under `crates/` in that worktree unless absolute. Nothing was built or changed.

## 1. Lifecycle of a SWE_SEED declaration

1. **Gate and claim.** `authorize_settlement_declaration` (sea-forge-authority/src/cep.rs:2730) reaches `claim_resume` (cep.rs:2864). It writes a create-only ledger record `settlement-state:<pending_id>:resuming:<attempt>` with payload `{attempt, claimed_at}` (cep.rs:2870-2893). The attempt number is max existing + 1. A second claimer collides on the key and is refused as `already_used` (cep.rs:2898-2907).
   - The claim holds only `claimed_at` and the attempt. It records no pid and no process identity.
2. **Lease.** `SETTLEMENT_CLAIM_LEASE_SECS = 900` (cep.rs:2317). It is longer than any descriptor `timeout_secs`, which is validated on load. `claim_lease_lapsed` (cep.rs:3353-3376) is a time check only.
3. **Callers.**
   - Server: `delegation.rs:1028` builds `CommandSweSeedTransport` inside `tokio::task::spawn_blocking`.
   - CLI: `sea-forge-cli/src/commands/resume.rs:1081` builds the same transport. This path runs outside any unit.
   - Both set `request.authorization_ref`, `authorization_request_sha256` and `authorization_content_sha256` from the claim (server: sea-forge-server/src/delegation.rs:1016-1019).
4. **Spawn.** `CommandSweSeedTransport::submit` (sea-forge-settlement/src/declaration.rs:~320-405).
   - `env_clear()` is applied, with piped stdio.
   - `command.process_group(0)` (declaration.rs:331) makes the child a group leader, so pgid == pid.
   - `ProcessTree::spawn` (declaration.rs:414-418, Unix) is a plain `spawn()`. The `ProcessTree` struct is empty on Unix.
   - On Windows, `ProcessTree` wraps a kill-on-close Job Object (declaration.rs:426-433). A server crash therefore already kills the command there.
5. **Deadline kill.** A 10 ms poll loop with `try_wait` (declaration.rs:363-378).
   - On timeout it calls `tree.terminate`, which runs `/bin/kill -KILL -- -<pid>` against the group (declaration.rs:452+).
   - The kill is in-process only. If the server dies, nothing enforces the deadline.
6. **Ambiguous failure keeps the lease.** `ambiguous_after_call` (delegation.rs:1096) keeps the claim open after a started command times out or fails. `settle_unrecorded_claim` (delegation.rs:1154) fails the claim only for errors that prove nothing was sent.
7. **Append and complete.** The server verifies the echo and calls `append_and_reconcile_swe_seed_declaration` (swe_seed_reconciliation.rs:88). That goes through `append_declaration_ledgered_once` (declaration.rs:~77), whose idempotency key is `(case, run, claim_manifest_sha256, authority_ref, settlement_ref, plan_item)`. The key has no attempt. The ledger therefore dedups on ingest. `complete_settlement_resume` (cep.rs:2991) then closes the attempt.
8. **Fencing.** The close is one create-only marker `closed:<attempt>` per attempt (cep.rs:2940-2960). `status_in` (cep.rs:2463-2529) says `Resuming{attempt}` until `closed:` or `released:` exists. A stale worker completing after a newer attempt owns the claim is refused (cep.rs:3004-3021).
9. **Lapsed claims.** `reconcile_settlement_resume_at` (cep.rs:3098) never fails a lapsed claim. It only completes one when a declaration is found in the ledger.
10. **Operator resolution.** `resolve_uncertain_settlement_with_hook` (cep.rs:3188). The `NotDeclared` path:
    - checks operator role;
    - checks requester != resolver (cep.rs:3223);
    - evaluates the `approval_resolution` policy;
    - requires status `Resuming{attempt}` (cep.rs:3299);
    - requires the lease lapsed (cep.rs:3307);
    - runs `before_close()` (cep.rs:3316);
    - calls `release_settlement_resume` (cep.rs:3061), which writes `released:<attempt>`;
    - writes the audit record.
    The only evidence required is a non-empty string (cep.rs:3212). The function never looks at any process. The CLI wrapper is sea-forge-cli/src/commands/approve.rs:118.

**Where the race lives.** After step 5 the server is dead, so nothing enforces the deadline. After step 10 `released:` makes attempt N+1 claimable (the status returns to `Approved`). The orphan never reports to a ledger, so the ledger has no trace of it.

## 2. What the external authority is

- It is the configured `settlement_authorities[].command`, an argv run as a child process. The protocol is JSON `SettlementDeclarationRequest` on stdin (types.rs:992) and JSON `SweSeedResponse` (declaration.rs:~245) on stdout.
- **Not in this repo.** The only in-repo implementation is the hidden test double `internal-test-swe-seed` (sea-forge-cli/src/main.rs:522-570). It reads stdin, optionally sleeps via `--delay`, and prints a fixed response. It stores nothing.
- **Not in the SWE_SEED checkout** (~/projects/SWE_SEED). `git grep authorization_request_sha256` returns nothing there, and no declare-protocol handler turned up. No RealityTrace checkout is present under ~/projects.
- **The request carries `authorization_request_sha256` on every external declaration.**
  - `refuse_unauthorised_external` (declaration.rs:40-51) rejects an external declaration without it.
  - It is copied from the request (declaration.rs:271 and 613) and is echo-verified (cep.rs:2703).
- **Uniqueness.** This repo has none against the authority's own store. The in-repo ledger-side dedup (step 7) is on a different key and is not applied to the authority store. Whether the deployed authority could dedup is unknowable from here. It would have to be a check-and-append that is atomic across processes.
- **Deployed policy.** `/var/lib/godspeed-sea-forge/policy.yaml` is root:godspeed-sock 0640 and unreadable to me. I could not confirm that a SWE_SEED authority is configured on the live gateway.

## 3. Is `authorization_request_sha256` stable across attempts?

**Yes, by construction.**
- `request_sha256 = bind(ingress_sha256, declared_content_sha256)` (cep.rs:2587, 2607, 2746).
- `ingress_sha256` hashes `CanonicalSettlementRequest` (cep.rs:2340-2352, 2402): case, ingress, operation_id, class, actor id and role, identity binding hash, sorted evidence refs, and approval requirement. It has no attempt, no time and no nonce.
- `declared_content_sha256` clears the authorization fields (cep.rs:2575-2582). The claim path refuses unless the content equals what was approved (delegation.rs, sea-forge-artifact-ip/src/lib.rs:1128-1139).
- `claim_resume` copies `record.request_sha256`, which is one value per pending record (cep.rs:2895).
- So attempts N and N+1 send byte-identical `authorization_request_sha256` and `authorization_ref`. The authority cannot tell the attempts apart. For dedup it does not need to, because the key is already stable.
- If the authority wants attempt-level auditing, it would need a new field (for example `attempt`). Adding one would change the wire type, which is `deny_unknown_fields` on the response side only.

## 4. Liveness evidence without `unsafe`

**Yes, it is feasible with std only.**
- **Process identity.** The command is a process-group leader (pgid == pid, declaration.rs:331), so the group is the unit to track.
- **Group liveness (Linux).** Scan `/proc/*/stat` with `std::fs`. The pgrp is the 3rd field after the last `)`. No FFI is needed.
- **Group liveness (macOS and other Unix).** `ps -A -o pgid=`, or the `/bin/kill -0 -- -<pgid>` call already used at declaration.rs:452+. `kill -0` exit status cannot cleanly separate ESRCH from EPERM, so prefer the scan.
- **Start time.** `/proc/<pid>/stat` field 22 (`starttime` in clock ticks) plus `/proc/sys/kernel/random/boot_id`. On macOS use `ps -o lstart= -p <pid>`. Both are std-only (`fs` or `Command`).
- **Policy aside.** The workspace lint is `unsafe_code = "deny"` (Cargo.toml:40), not `forbid`. Unsafe is confined to `sea-forge-os` (crates/sea-forge-os/src/lib.rs:8-12, which today compiles empty on Unix), the sandbox crates and workload-exec. Liveness evidence needs none of it.

**Design.**
- A second create-only record `settlement-state:<pending>:launched:<attempt>` holds `{pgid, leader_starttime, boot_id}`.
- It is written by a spawn observer called from `CommandSweSeedTransport` right after `spawn()`. This needs a small API addition: for example `with_spawn_observer(Box<dyn Fn(&LaunchedCommand) -> Result<..>>)`, with the server and CLI callers passing a closure that commits the record through `sea_forge_authority::cep` (`commit_launch_evidence(root, pending_id, attempt, ...)`).
- If the observer fails, kill the tree and fail closed, leaving the claim open.
- `resolve_uncertain_settlement_with_hook` gets a `launch_still_alive` check after the lease check (cep.rs:3307) and before `before_close`, for `NotDeclared` only. It refuses when:
  - any process has pgrp == recorded pgid (when `boot_id` matches); or
  - the evidence is unreadable or ambiguous (for example `/proc` mounted with `hidepid`).
- A different `boot_id` proves every process died, so the resolve is allowed.

**Bounds.**
- A residual window of microseconds between `fork` and the observer's ledger write.
- A command that leaves its process group (`setsid` or `setpgid` by a grandchild) is not seen.
- The resolver must run in the same pid namespace and boot as the server. The `boot_id` match is the only same-host check, so a container with a different pid namespace and the same `boot_id` would see nothing and wrongly allow.
- A recycled pgid can produce a false "alive". That refuses, which is safe. Leader `starttime` narrows it when the leader still exists.

**Legacy claims** (no `launched` record).
- Behave exactly as main does today: lease-only, with the audit detail `no_launch_evidence`.
- Otherwise every existing open claim would be stuck forever.

## 5. Containment

**Deployed unit.** `/etc/systemd/system/godspeed-sea-forge.service` is generated by Horizon's `scripts/gateway-setup.ts` (the template around lines 225-250).
- It has `Restart=on-failure` (scripts/gateway-setup.ts:239).
- It has **no** `KillMode=`, so the default `control-group` applies.
- It has no `TimeoutStopSec=`, `SendSIGKILL=` or `ExecStopPost=`.
- The sandbox directives are `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`.

**systemd behaviour (from my understanding of the systemd documentation, not verified here).**
- When a Type=simple unit's main process dies, the unit leaves `active`. Before `Restart=` schedules a restart, systemd runs the unit's stop sequence. With `KillMode=control-group` that sends SIGTERM to every remaining process in the unit cgroup, then SIGKILL after `TimeoutStopSec` (default 90 s) if any remain.
- Net effect: an orphaned SWE_SEED command in the gateway cgroup is signalled at crash time and is dead at most about 90 s later. That is far inside the 900 s lease, so a gateway crash under this unit cannot produce the lapsed-lease race.
- A `setsid` grandchild stays in the cgroup and is still killed. Only a process that moves itself out of the cgroup (`systemd-run`, or privileged cgroup writes) escapes. `NoNewPrivileges` plus the dedicated user make that unlikely.

**Not covered by containment.**
- The CLI `resume` path (resume.rs:1081). It runs under an operator shell, not the unit.
- macOS and other non-systemd Unix.
- Anyone running the server outside the unit.
- A SIGTERM-ignoring command surviving up to `TimeoutStopSec`.
- Windows is covered by the Job Object.

**Hardening available in Horizon only.**
- Render `KillMode=control-group`, `SendSIGKILL=yes` and a short `TimeoutStopSec=` explicitly, and add a render test.
- Real verification would need a manual runbook step with `systemctl kill` on the main PID, because I could not do this without root.

**In-process containment options in sea-rs.**
- `PR_SET_PDEATHSIG`: needs `pre_exec`, so `unsafe`. It would have to live in `sea-forge-os`, which is the sanctioned unsafe crate but compiles empty on Unix, so it would need a `libc` dependency. It also fires on thread exit, not process exit. A tokio `spawn_blocking` thread is busy for the whole call, so that would hold, but a CLI `resume` that exits normally mid-call would also kill the child. That is acceptable.
- `setpriv --pdeathsig KILL` as an argv wrapper: no unsafe, but Linux-only, needs a util-linux dependency, and covers only the direct child (the group is not signalled).
- A supervisor or subreaper process: a larger design, with no benefit on the deployed systemd path.

## Comparison

| Option | Closes the window completely? | Blast radius | `unsafe`? | Testable here with real processes | Back-compat |
|---|---|---|---|---|---|
| **A. Authority dedup** on `authorization_request_sha256` | Yes, even for `setsid` escapees and cross-host, **if** the authority does an atomic check-and-append and returns the existing attestation (the key is stable per section 3) | The authority (SWE_SEED, out of repo) plus a protocol document in sea-rs. In-repo behaviour change is none | No | Only against a fake script that dedups (tests a contract, not the real authority) | Existing authorities do nothing until upgraded |
| **B. Liveness evidence** | For the command's process group, yes. Not for out-of-group escapees or different pid namespaces | sea-forge-authority (cep.rs: new record and a check), sea-forge-settlement (spawn observer), sea-forge-server and sea-forge-cli (wire the observer) | No | Yes, fully (section "Test plan") | Legacy claims keep today's behaviour, labelled |
| **C. Containment: systemd unit** | Yes under the unit, because the orphan is dead within about 90 s and the lease is 900 s. No for the CLI path and non-systemd hosts | Horizon scripts/gateway-setup.ts only | No | No (needs a real unit and root); runbook evidence only | None needed |
| **C2. Containment: pdeathsig in `sea-forge-os`** | Direct child only, on Linux | sea-forge-os (+libc), settlement | **Yes** | Yes | None needed |
| **B + C** (recommended) | B closes the in-group window everywhere. C shortens the orphan's life under the unit | Both of the above | No | B only | As B |
| **B + C + A** | Complete | Adds the authority | No | As B | As B |

## Recommendation

**Option B (liveness evidence in sea-rs), with explicit `KillMode=control-group` and `TimeoutStopSec` rendered by Horizon (option C) as a separate small follow-up. Record option A as an upstream authority requirement. A is the only complete fix, but I could not find a place in this repo or in SWE_SEED where it can be enforced.**

Reasons:
- B is the only option that is implementable, enforceable and testable in this repo, and it needs no `unsafe`.
- It converts `NotDeclared` from "trust the operator and the clock" into "refuse while the command's group still exists". That is exactly steps 3-4 of the issue.

**Bounds of B.**
- Out-of-group escapees.
- A cross-namespace resolver.
- A tiny fork-to-record window.
- It refuses on unreadable evidence, so an operator may need to wait for the group to exit or take the `--declared` route.

## Test plan

All integration tests use real processes. Put them in a test file under `sea-forge-server/tests/` or `sea-forge-cli/tests/`, because settlement depends on authority and so authority tests cannot use the transport.

**Fake authority** (shell script in a temp dir, invoked as `/bin/sh script <store_dir>` with absolute tool paths because the transport does `env_clear()`):
1. Read stdin and extract `authorization_request_sha256` with `/bin/sed`.
2. Touch `<store_dir>/started`.
3. `/bin/sleep` N seconds.
4. Append the sha to `<store_dir>/store.jsonl`.
5. Print a valid `SweSeedResponse`.
A variant does an atomic noclobber (`set -C`) create of `seen-<sha>` and skips the append if it exists, to show option A.

**T1: the 5-step race.** It shows the race on main and the fix closing it.
1. **Server crash.** Re-exec the test binary as a driver child (the pattern used by `acp_fixture_child` in conformance_m16.rs). The driver claims the settlement and calls `CommandSweSeedTransport::submit` with the slow fake. Wait for `started`, then `kill -KILL` the driver. The fake is now an orphan in its own process group.
2. **Lease lapse.** Call `resolve_uncertain_settlement_at` with `now = claimed_at + 900 s`. Use the helpers in cep_settlement.rs: `lease_and_fencing::claimed_at` and `lease()` (around lines 1978 and 2096).
3. **NotDeclared.** The fake is still sleeping.
   - On main: returns `Ok` (the bug).
   - With B: returns `Err` and the claim stays `Resuming`.
4. **Late append.** Wait for the orphan to append.
5. **Re-claim.** Re-run the gate and `submit` for attempt N+1.
   - On main: `store.jsonl` has two lines with the same sha (the double declaration).
   - With B: step 3 was refused, so the second `submit` never happens.
   - After the orphan exits, `NotDeclared` is accepted. The operator's evidence is then false, but that is the operator's attestation, as today. Assert only that no second append occurs unless the operator attests.

   The assertions are written for the fixed behaviour. The test is red on main (verify by running it before the fix).
3. **T1b:** the same race with the dedup variant of the fake. It shows that with A the second `submit` returns the existing attestation and the store holds one line.

**Unit tests.**
- Group-scan and `boot_id` logic against synthetic `/proc` content, if the scan is made parameterisable on a root path.
- The observer failure path kills the tree and leaves the claim open.
- A reboot (different recorded `boot_id`) allows `NotDeclared`.
- A legacy claim with no `launched` record behaves as today.
- A grandchild left in the group after the leader exits is still seen as alive.
- A `setsid` grandchild is not seen. Document this as a known bound with a test marked as such.

**Build note.** The machine has 7 GB free RAM. Use `CARGO_BUILD_JOBS=2` and run `-p sea-forge-settlement -p sea-forge-authority` first.

## Implementation (uncommitted; no PRs opened)

I did not commit, push or open PRs: my standing rules forbid it and a coordinator message cannot lift them. The work sits uncommitted in three worktrees.

**PR A, /home/sprime01/projects/sea-rs.wt-86 (branch fix/settlement-orphan-guard).**
- New `crates/sea-forge-authority/src/cep/command_launch.rs`: `CommandLaunch::capture` and `liveness()` (Linux `/proc`, other Unix `ps`, std only, no `unsafe`).
- `cep.rs`: `record_command_launch` writes a create-only `launched:<attempt>` record. The `NotDeclared` guard returns `settlement_command_alive` or `settlement_command_liveness_unknown` (the latter names the pgid and says to check `ps -g`). No force flag exists, so none was added. A missing record keeps the lease-only rule.
- `declaration.rs`: `CommandSweSeedTransport::with_launch_evidence(root)`, the authority idempotency MUST and the stated bounds in the type docs. Wired in sea-forge-server `delegation.rs` and sea-forge-cli `resume.rs`.
- Race test `orphaned_command::an_orphaned_command_cannot_race_not_declared_into_a_second_declaration` in `crates/sea-forge-authority/tests/cep_settlement.rs`, plus `not_declared_is_accepted_once_the_command_has_exited`.
  - Red with the guard disabled (`if false &&`): "NotDeclared was accepted while the orphaned command was still running; the authority store now holds 2 declaration(s) for one request".
  - Green with the guard: 3 passed. Authority and settlement crates: all green. Clippy is clean.
- Cost: sea-forge-authority gains a dev-dependency on sea-forge-settlement (cycle, dev only), and Cargo.lock changed.
- Full `cargo test -j 2 --workspace`: no test failures. The run stopped at the `sea-forge-agent` doctest (rustdoc "can't find crate for reqwest"), a crate this change does not touch. Doctests after it did not run, and I did not check whether main has the same failure.

**PR B, /home/sprime01/projects/sea-rs.wt-class (branch test/settlement-class-fail-closed).**
- Two tests in `horizon_gateway_policy.rs` pass against the fixture. Missing or unknown class is not Allow, `local` is Allow, `external` is Escalate.
- The fixture's fallback is unconstrained, yet the engine already fails closed. Horizon #19 therefore describes a non-issue; the tests pin it.
- `cep_authority.rs::load_worlds` logs INFO `cep_authority world loaded` with `world` and `world_ref`.

**Horizon, /home/sprime01/projects/Horizon.wt-unit (branch chore/gateway-unit-killmode).**
- `scripts/gateway-setup.ts` gateway unit gains `KillMode=control-group` and `TimeoutStopSec=30`. New test in `test/gateway-setup.test.ts`. `bun test` on the two affected files: 97 pass.
- Full `bun test`: 6 failures (approval-inbox and SDK wire-format tests), identical without my change.

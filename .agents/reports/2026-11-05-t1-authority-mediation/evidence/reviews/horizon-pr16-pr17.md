# Review: Horizon PR #16 and PR #17

Read-only review. `bun test test/gateway-setup.test.ts` in Horizon.wt-gateway-socket-dir: 55 pass, 0 fail.

## PR #16 - gateway unit recreates its socket directory (scripts/gateway-setup.ts)

### Findings

1. **Nit, CONFIRMED** - scripts/gateway-setup.ts:234-236. The first two new comment strings end in `\n` and the array is joined with `\n`, so the generated unit gets blank lines between the comment lines. This matches the existing ReadOnlyPaths comment at :251-252. systemd ignores blank lines, so it is harmless. It only looks untidy, and the digest is stable.

2. **Minor, PLAUSIBLE** - :237. `install -d` also creates missing parent directories, as root with the default mode, and `-o/-g/-m` apply only to the final component. With the default `/run/<account>` the parent `/run` is root-owned and `0755`, so there is no symlink or rename attack surface: only root can plant a symlink at that path. If an operator overrides `HORIZON_GATEWAY_SOCKET_DIR` to sit under a directory the gateway or another non-root user can write, root `install` follows symlinks in that parent. Does `resolveLayout` constrain the override to a root-owned parent? I did not find such a check. This is a hardening gap for non-default layouts only, not a defect in the default.

3. **Minor, CONFIRMED** - Deployed hosts. The unit digest feeds the installer's STAGE_DIGEST (scripts/install-sea-forge-gateway.sh:116). Hosts need a restage, reinstall and `daemon-reload` for the fix to take effect. This is expected and the digest check does agree, so `--check` stays consistent with the new unit. It is worth a line in the PR description or runbook.

### Questions checked

- **`+` vs `!`: `+` is correct.**
  - `!` still applies the sandbox/namespace restrictions and only changes the privilege level.
  - The failure is the 226/NAMESPACE setup, so the pre-command has to run outside the namespace.
  - `+` runs this one command with full privileges and no sandbox. ExecStart gets no prefix, and the test asserts that.
- **Namespace setup is per exec command.** systemd builds the mount namespace for each ExecStartPre/ExecStart separately, and `+` skips it. The directory exists by the time ExecStart sets up ReadWritePaths, so ExecStart should succeed. This is the documented behaviour but I did not boot a unit. The live boot is still the real proof.
- **An existing directory with different ownership or mode** is not a failure. `install -d` is idempotent and re-applies owner, group and mode. It fails only if the path is a non-directory, which is the correct fail-closed behaviour.
- **Mode, owner and group match the plan's `dir` row** (gw, sock, 0750, gen-setup.ts:192). The test derives the expected string from the plan, so it cannot drift. This is not a weakening, because it restores the state the installer already established.
- **RuntimeDirectory= is unsuitable, so the PR's approach is right.** It would chown to User:Group, which is the gateway account's primary group, not the socket group. Setting the socket group would mean changing `Group=`. That would be a larger change to the identity model.
- **Test guards the behaviour.**
  - It asserts the exact line (derived from the plan row), the order before ExecStart, and that ExecStart has no `+` or `!`.
  - It does not render or execute the unit, which is fine for a generator test.
  - It would not catch `+` being swapped for `!` if the plan row also changed, but the string is derived from the row rather than hardcoded, and the `+` is literal in the test, so a swap would fail.

### Verdict: APPROVE
Optionally address finding 2 in a follow-up.

## PR #17 - J02r2 rig operator ref `actor:operator` (test/support/j02r2-rig.ts:161)

### Findings

1. **No defects found. CONFIRMED consistent.**
   - `seaForgeActorOf` (src/adapters/sea-forge-approvals.ts:25) requires the `actor:` prefix and returns the bare id. The old value `"operator"` would have thrown "must be actor:<id>", so the rig could not have worked before the change.
   - `actor:operator` maps to `operator`, which equals the rig's server.yaml binding (`actor_id: "operator"`, roles operator, and `delegable_actors: ["operator"]`, j02r2-rig.ts:112-113).
   - The service actor stays `cognate-service`, so the guard `operatorActor === serviceId` at :66 still holds.
   - The change alters only the input to the real mapping. It does not stub or loosen any check, so it does not weaken what the tests prove.
   - Rig uid 4_294_967_000 for the operator differs from the service uid, so the distinct-actors setup is unchanged.

2. **Nit, CONFIRMED** - The rig hardcodes the string `"actor:operator"` rather than deriving it from a shared constant. The gateway-setup test uses the same literal, so they agree today.

3. **Minor (evidence), PLAUSIBLE** - j02-live-at-heads.log shows 12 pass, 0 fail, 99 expects, but contains no commit SHA or branch identifier. I cannot confirm from the log that it ran with the PR #17 change. If the log was taken at the pre-fix heads, it cannot be evidence for this PR. Record the head SHA, or rerun.

I found no J02 test that calls `approvalAuthority` with the same ref for both operator and service, so I found no self-approval test that this change affects.

### Verdict: APPROVE

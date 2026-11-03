# SEA-Forge gateway and Horizon runtime: operator runbook

This runbook covers the two-account setup for governed approvals: a dedicated SEA-Forge gateway account, a
dedicated Horizon runtime account, and your login, which the coding agents run as. The agents must not be able to
reach the gateway socket or change the code and configuration that the services run.

The values below are for this machine. Anything that differs on another machine comes from the stage and plan output,
not from this file.

## Accounts and who runs what

| Identity | Name on this machine | Used for |
| --- | --- | --- |
| Operator login (your normal login, the agent account) | `sprime01` | `just` recipes, `--check` as a non-root user |
| Gateway service account | `godspeed-sea-forge` | runs `sea-forge-server` |
| Runtime service account | `godspeed-horizon` | runs the Horizon runtime (Bun) |
| Socket group | `godspeed-sock` | the gateway socket is group-readable by this group only |

Your login is in neither service account nor the socket group, and the installer refuses to run if it is. Confirm
your login with `id -un`.

Two rules follow from this:

- **Run the read-only check as your login, without `sudo`,** to test what the agents can reach. The socket test is
  meaningful only then.
- **Run the privileged steps with `sudo`, and always pass `--stage`.** `sudo` replaces `$HOME` with `/root`, so the
  installer looks for the staged bundle under `/root/.cache` unless you give the path.

## What the setup does

- Creates two system accounts, `godspeed-sea-forge` (gateway) and `godspeed-horizon` (runtime), and a shared socket
  group, `godspeed-sock`.
- Copies the SEA-Forge server binary to `/usr/local/lib/godspeed-sea-forge/bin/sea-forge-server` (root-owned, 0755)
  after verifying its sha256.
- Copies Bun to `/usr/local/lib/godspeed-horizon/bin/bun` (root-owned, 0755) after verifying its sha256.
- Deploys a root-owned copy of the Horizon runtime tree to `/opt/godspeed-horizon`, checked against a manifest.
  Agents cannot edit it. Changing Horizon's code means redeploying.
- Renders the gateway's `server.yaml` from a template, using the uid of `godspeed-horizon` read at install time, and
  places `policy.yaml`.
- Writes the two systemd units to `/etc/systemd/system`. It installs them but does not start them.

Nothing runs privileged commands by itself. The only privileged step is the `sudo` command you run.

## Current values on this machine

| Item | Value |
| --- | --- |
| SEA-Forge server binary (built from `sea-rs`, PR #73 merged as `6fae052`) | `/home/sprime01/projects/sea-rs-socket-group/target/release/sea-forge-server` |
| SEA-Forge sha256 | `9d2487cd18fceb6c377d5fb26f739c28251862c55663cfde64ab6c6072a32c85` |
| Bun binary (used as `~/.local/bin/bun`, resolves to the nub path) | `/home/sprime01/.local/bin/bun` |
| Bun sha256 (Bun 1.4.0) | `33d56b070be6a9e3da0ab013038b43d1645d0534ca811ecdba4472599117eb4b` |
| Stage directory | `/home/sprime01/.cache/godspeed/gateway-stage` |
| Stage digest (current, from `just gateway-stage` at commit `42cec18`) | `3e714a192c8159c0796ff8644c801061b77126b290fd8e55a6724d13320a8720` |
| Socket | `/run/godspeed-sea-forge/sea-forge.sock` (group `godspeed-sock`, mode 0660) |
| Gateway root (config and state) | `/var/lib/godspeed-sea-forge` |

The stage digest changes whenever you run `just gateway-stage`. The `sudo` command must use the digest printed by the
latest `just gateway-stage`. Recompute a binary's hash with `sha256sum <path>` if you rebuild or upgrade it.

RealityTrace is not installed by this setup. The runtime unit points at
`/usr/local/lib/godspeed-horizon/bin/realitytrace`. Place a root-owned copy there yourself if you use RealityTrace.

## Steps

1. Stage the bundle, which is unprivileged:

   ```bash
   just gateway-stage
   ```

   Note the `bundle digest` it prints. That is the value for `--expect-stage-sha256` below.

2. Dry run, which changes nothing and prints the full plan:

   ```bash
   scripts/install-sea-forge-gateway.sh --dry-run
   ```

   The output ends with the `sudo` command to run. Use that output rather than an older copy of this file.

3. Apply, as root. You run this yourself, and sudo asks for your password:

   ```bash
   sudo scripts/install-sea-forge-gateway.sh --authorize-privileged \
     --stage /home/sprime01/.cache/godspeed/gateway-stage \
     --binary /home/sprime01/projects/sea-rs-socket-group/target/release/sea-forge-server \
     --sha256 9d2487cd18fceb6c377d5fb26f739c28251862c55663cfde64ab6c6072a32c85 \
     --replace-binary \
     --bun /home/sprime01/.local/bin/bun \
     --bun-sha256 33d56b070be6a9e3da0ab013038b43d1645d0534ca811ecdba4472599117eb4b \
     --expect-stage-sha256 3e714a192c8159c0796ff8644c801061b77126b290fd8e55a6724d13320a8720
   ```

   `--replace-binary` keeps the old gateway binary as `*.replaced-<UTC>`. The installer applies the plan rows in order
   and stops at the first failing row. Rerunning the same command is safe. Every step is idempotent, and an existing
   file that differs is kept as a sidecar (`*.generated-<UTC>`, `*.replaced-<UTC>`, or `*.previous-<UTC>`).

4. Check, read-only. Run it as your login first, then as root:

   ```bash
   scripts/install-sea-forge-gateway.sh --check --stage /home/sprime01/.cache/godspeed/gateway-stage
   sudo scripts/install-sea-forge-gateway.sh --check --stage /home/sprime01/.cache/godspeed/gateway-stage
   ```

   The check ends with `check: ok` or `check: N problem(s)`. The lines read:

   - `ok`: matches the expectation.
   - `note`: informational. Some notes are expected (see below).
   - `UNVERIFIED`: the login cannot see the path, because `/var/lib/godspeed-sea-forge` is closed to other accounts. Run
     the check as root to confirm these.
   - `BAD` or `FAIL`: a real problem.

5. Reload systemd and restart both services, in this order:

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart godspeed-sea-forge.service
   sudo systemctl restart godspeed-horizon.service
   ```

   Confirm they are up:

   ```bash
   systemctl is-active godspeed-sea-forge.service godspeed-horizon.service
   journalctl -u godspeed-sea-forge.service -n 5 --no-pager
   ```

   The gateway log should include `server listening on /run/godspeed-sea-forge/sea-forge.sock`.

6. Confirm the containment. Run this as your login, without `sudo`:

   ```bash
   ls /run/godspeed-sea-forge/sea-forge.sock
   ```

   Expect `Permission denied`. The directory is `godspeed-sea-forge:godspeed-sock 750`, and your login is in neither.
   The check reports the same thing as `ok agent cannot reach the socket path (permission denied, expected)`.

7. Confirm the config files cannot be replaced by the gateway. This step runs inside the gateway's mount namespace, where
   the read-only binds apply:

   ```bash
   PID=$(systemctl show -p MainPID --value godspeed-sea-forge.service)
   sudo nsenter -t "$PID" -m -- mv /var/lib/godspeed-sea-forge/policy.yaml /var/lib/godspeed-sea-forge/policy.yaml.test
   ```

   Expect `Device or resource busy`, and the file must still be in place afterwards. A plain
   `sudo -u godspeed-sea-forge mv` does not test this, because it runs outside the service's namespace.

## Expected check results after a complete apply

- All accounts, group memberships, and root-owned directories are `ok`.
- `/var/lib/godspeed-sea-forge` is `godspeed-sea-forge:godspeed-sea-forge 711`. The gateway enforces this on every
  start. See [The gateway root mode](#the-gateway-root-mode).
- `server.yaml`, `policy.yaml`, and `status.json` are `root:godspeed-sock 0640`.
- `realitytrace/data` and `realitytrace/state` are gateway-owned, 0700.
- `/usr/local/lib/godspeed-horizon/bin/realitytrace` is reported as absent. That note is expected.
- The socket test as root is a note, not a result. Root connects to any socket, so only the login's test counts.

## Why things are set this way

### The gateway root mode

The gateway's own hardening sets its state root to 0711 on every start (the root is in its traverse list). The
installer therefore expects 711. An earlier version expected 1700 with the sticky bit. That expectation could not hold,
because the gateway resets the mode on each restart.

The sticky bit also never protected the config files from the gateway. A directory's owner may remove or rename any
entry in it, sticky or not, and the gateway owns `/var/lib/godspeed-sea-forge`. The read-only binds in the unit (below)
are what block replacement.

### Config files and the read-only binds

`server.yaml` and `policy.yaml` are root-owned, 0640, group `godspeed-sock`. The gateway unit adds
`ReadOnlyPaths=` for both files, which bind-mounts each one read-only inside the gateway's namespace. A mount point
cannot be renamed or unlinked, so the gateway cannot replace them. Step 7 verifies this on the live system.

### The socket test under `--check`

The socket test runs as whichever login invokes the check. Under `sudo` that is root, which can connect to any socket,
so the check reports a note there instead of a result. As your login, the check reports the denial for the socket path.

## Troubleshooting

- **`no staged bundle at /root/.cache/godspeed/gateway-stage`.** You ran the installer with `sudo` and no `--stage`. Add
  `--stage /home/sprime01/.cache/godspeed/gateway-stage`.
- **A `MISSING` line after apply.** The apply stopped before that row. Rerun the same `sudo` command and read the last lines
  of its output.
- **`BAD` on `/var/lib/godspeed-sea-forge` mode.** The gateway restarted and enforced 711. Run the apply, which expects 711,
  or re-stage if the expectation changed.
- **`Socket check skipped: python3 missing`.** The check uses `python3` to test the socket. Install it, or verify containment
  by hand (step 6).
- **Stage digest mismatch.** You re-ran `just gateway-stage` after the dry run. Use the new digest in `--expect-stage-sha256`.
- **Refused: invoking login is in the socket group or a service account.** Your login must not be in `godspeed-sock`, and
  must not be a service account. Remove that membership and re-stage.

## Rollback

Rollback is a manual, owner-run step. Stop the services first:

```bash
sudo systemctl disable --now godspeed-sea-forge.service godspeed-horizon.service
sudo rm -f /etc/systemd/system/godspeed-sea-forge.service /etc/systemd/system/godspeed-horizon.service
sudo systemctl daemon-reload
```

Back up `/var/lib/godspeed-sea-forge/policy.yaml` and any evidence you want to keep before removing the state
directories. Then remove `/run/godspeed-sea-forge`, `/var/lib/godspeed-sea-forge`, `/opt/godspeed-horizon`, and the
root-owned binary and Bun copies under `/usr/local/lib/godspeed-*`. Finally remove the accounts with `userdel` and the
socket group with `groupdel`. The installer header lists the same steps.

## Known open items

- The gateway unit's read-only binds (step 7) are not yet verified on the live system. Run step 7 after the restart.
- The live approval round-trip through the inbox (approve and reject a real request, and confirm SEA-Forge records the
  operator identity) is not yet done.
- The runtime's connection to the socket as `godspeed-horizon` is not yet confirmed from the cockpit.
- RealityTrace is not installed by this setup.
- The socket check depends on `python3`.

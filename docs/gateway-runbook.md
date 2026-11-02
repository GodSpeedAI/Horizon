# SEA-Forge gateway and Horizon runtime: operator runbook

This runbook covers the two-account setup for governed approvals: a dedicated SEA-Forge gateway account, a
dedicated Horizon runtime account, and your login, which the coding agents run as. The agents must not be able to
reach the gateway socket or change the code and configuration that the services run.

The values below are for this machine. Anything that differs on another machine comes from the stage and plan output,
not from this file.

## What the setup does

- Creates two system accounts, `godspeed-sea-forge` (gateway) and `godspeed-horizon` (runtime), and a shared socket
  group, `godspeed-sock`. Your login is in neither account nor the group, and the installer refuses to run if it is.
- Copies the SEA-Forge server binary to `/usr/local/lib/godspeed-sea-forge/bin/sea-forge-server` (root-owned, 0755)
  after verifying its sha256.
- Copies Bun to `/usr/local/lib/godspeed-horizon/bin/bun` (root-owned, 0755) after verifying its sha256.
- Deploys a root-owned copy of the Horizon runtime tree to `/opt/godspeed-horizon`, checked against a manifest.
  Agents cannot edit it. Changing Horizon's code means redeploying.
- Renders the gateway's `server.yaml` from a template, using the uid of `godspeed-horizon` read at install time.
  It places `policy.yaml`, and writes the two systemd units to `/etc/systemd/system`.
- Installs the units but does not start them.

Nothing runs privileged commands by itself. The only privileged step is the `sudo` command you run.

## Prerequisites on this machine

| Item | Value |
| --- | --- |
| SEA-Forge server binary | `/home/sprime01/.local/bin/sea-forge-server` |
| SEA-Forge sha256 | `6802d0880bf501003f702946f3fa65ec0b366ea1a0bc9f8f5f18c9e021af6980` |
| Bun binary (resolved from `~/.local/bin/bun`) | `/home/sprime01/.cache/nub/node/24.19.0/lib/node_modules/bun/bin/bun.exe` |
| Bun sha256 | `33d56b070be6a9e3da0ab013038b43d1645d0534ca811ecdba4472599117eb4b` |
| Stage directory | `/home/sprime01/.cache/godspeed/gateway-stage` |
| Stage digest (current) | `f425fc54d153cdd5be47854dbbd8c3a8b36f6261ff264ff85ba5e840a5bbdd98` |
| Socket | `/run/godspeed-sea-forge/sea-forge.sock` |
| Gateway root (config and state) | `/var/lib/godspeed-sea-forge` |

The stage digest changes whenever you run `just gateway-stage` again. The `sudo` command you run must match the digest
printed by the latest `just gateway-install`.

If you upgrade SEA-Forge or Bun, recompute the sha256 with `sha256sum <path>` and run the dry run again.

RealityTrace is not installed by this setup. The runtime unit points at
`/usr/local/lib/godspeed-horizon/bin/realitytrace`. Place a root-owned copy there yourself if you use RealityTrace.

## Steps

1. Stage the bundle, which is unprivileged:

   ```bash
   just gateway-stage
   ```

2. Dry run, which changes nothing and prints the full plan:

   ```bash
   just gateway-install /home/sprime01/.local/bin/sea-forge-server \
     6802d0880bf501003f702946f3fa65ec0b366ea1a0bc9f8f5f18c9e021af6980 \
     /home/sprime01/.cache/nub/node/24.19.0/lib/node_modules/bun/bin/bun.exe \
     33d56b070be6a9e3da0ab013038b43d1645d0534ca811ecdba4472599117eb4b
   ```

   The output ends with the exact `sudo` command to run.

3. Apply, as root. You run this yourself, and sudo asks for your password:

   ```bash
   sudo scripts/install-sea-forge-gateway.sh --authorize-privileged \
     --stage /home/sprime01/.cache/godspeed/gateway-stage \
     --binary /home/sprime01/.local/bin/sea-forge-server \
     --sha256 6802d0880bf501003f702946f3fa65ec0b366ea1a0bc9f8f5f18c9e021af6980 \
     --bun /home/sprime01/.cache/nub/node/24.19.0/lib/node_modules/bun/bin/bun.exe \
     --bun-sha256 33d56b070be6a9e3da0ab013038b43d1645d0534ca811ecdba4472599117eb4b \
     --expect-stage-sha256 f425fc54d153cdd5be47854dbbd8c3a8b36f6261ff264ff85ba5e840a5bbdd98
   ```

   The installer applies the plan rows in order and stops at the first failing row. Rerunning the same command is safe:
   every step is idempotent, and an existing file that differs is kept as a `*.generated-<UTC>` sidecar.

4. Check, which is read-only:

   ```bash
   just gateway-check
   ```

   Every line should read `ok`. `note` lines are informational. `MISSING` means the apply did not reach that step.

5. Reload systemd and start both services:

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now godspeed-sea-forge.service godspeed-horizon.service
   ```

6. Confirm that your login cannot reach the socket. This is the containment check. Once the socket exists, `just gateway-check`
   reports it, and the connection from your login must fail with permission denied.

## Expected check results after a complete apply

- All accounts, group memberships, and root-owned directories are `ok`.
- `/var/lib/godspeed-sea-forge` is `godspeed-sea-forge:godspeed-sea-forge 1700`.
- `server.yaml`, `policy.yaml`, and `status.json` exist in `/var/lib/godspeed-sea-forge`, root:godspeed-sock, 0640.
- `realitytrace/data` and `realitytrace/state` exist, gateway-owned, 0700.
- The socket is reported once the gateway is running.

## Troubleshooting

- **A `MISSING` line after apply.** The apply stopped before that row. Rerun the same `sudo` command and read its last
  lines. The script does not print an error when it stops, so the output of the run is the evidence.
- **Socket check skipped: `python3 missing`.** The check uses `python3` to test the socket. Install it, or accept that the
  socket check is skipped and verify containment by hand (step 6).
- **Stage digest mismatch.** You re-ran `just gateway-stage` after the dry run. Run `just gateway-install` again and use the
  new `sudo` line.
- **Refused: invoking login is in the socket group or a service account.** Your login must not be in `godspeed-sock`, and must
  not be one of the service accounts. Remove that membership and re-stage.

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

- The apply run on this machine stopped before writing the config and status files. The cause is not confirmed.
- RealityTrace is not installed by this setup.
- The socket check depends on `python3`.
- The gateway's startup with the rendered config, and the runtime connecting as its bound account, are not yet verified.

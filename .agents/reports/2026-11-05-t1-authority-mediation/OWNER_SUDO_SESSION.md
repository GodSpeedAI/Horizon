# Owner sudo session: deploy v0.4.1 and the new gateway unit

This needs `sudo`, which the agent may not run. Everything unprivileged is done:
- v0.4.1 is released and its checksum verified;
- Horizon J02 live passes 12/12 against that binary;
- the bundle is restaged and the dry run is clean.

Run from the Horizon main worktree the agent prepared, not from the owner checkout, which is on another branch:

```bash
cd ~/projects/Horizon.wt-v041
```

## 1. Install (required)

This installs the SEA-Forge v0.4.1 server (the sea-rs #86 fix) and the gateway unit with `KillMode=control-group` and `TimeoutStopSec=30` (Horizon #26). The old binary and old unit are kept as `*.replaced-<UTC>` and `*.generated-<UTC>` sidecars.

```bash
sudo scripts/install-sea-forge-gateway.sh --authorize-privileged \
  --stage /home/sprime01/.cache/godspeed/gateway-stage \
  --binary /home/sprime01/.cache/godspeed/bin/sea-forge-server-v0.4.1 \
  --sha256 b0e9eb9f22762c506428b2d8b6a53c70ef9d413e1b303c4aab9f6698b69ee23f \
  --replace-binary \
  --bun /usr/local/lib/godspeed-horizon/bin/bun \
  --bun-sha256 33d56b070be6a9e3da0ab013038b43d1645d0534ca811ecdba4472599117eb4b \
  --expect-stage-sha256 b4d6be18c39a6f9a23904a06aef34897333aff89da6a92dce8e6775ebbb524e0
sudo scripts/install-sea-forge-gateway.sh --check --stage /home/sprime01/.cache/godspeed/gateway-stage
sudo systemctl daemon-reload
sudo systemctl restart godspeed-sea-forge.service
sudo systemctl restart godspeed-horizon.service
systemctl is-active godspeed-sea-forge.service godspeed-horizon.service
systemctl show -p KillMode -p TimeoutStopUSec godspeed-sea-forge.service
```

You should see:
- `check: ok`;
- both services `active`;
- `KillMode=control-group` and `TimeoutStopUSec=30s`.

Then tell the agent "deployed". The agent then:
- checks the deployed binary's hash;
- re-runs the live approve, resume and reject roundtrip against the deployed gateway;
- records the result as LIVE VERIFIED.

## 2. Second OS account delegation test (optional, about a minute)

This moves the "on_behalf_of from a non-gateway uid" case from SIMULATED PASS to LIVE VERIFIED. A throwaway account that is allowed to reach the socket sends `on_behalf_of`, and the gateway must refuse it. The probe names an approval id that does not exist, so it cannot change anything.

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin -G godspeed-sock gs-uid-probe
(cd / && sudo -u gs-uid-probe python3 -I -) < ~/projects/Horizon/.agents/reports/2026-11-05-t1-authority-mediation/evidence/followups/second-uid-probe.py | tee /tmp/second-uid-probe.txt
sudo userdel gs-uid-probe
```

The expected last line is `PROBE PASS`, with `error_class` `identity_delegation_refused`. Paste the output to the agent, or leave `/tmp/second-uid-probe.txt` for it to read.

## 3. Rollback, if anything is wrong after step 1

The previous binary is v0.4.0, sha `2e755e82…`, also kept at `~/.cache/godspeed/bin/sea-forge-server-v0.4.0`. To roll back, rerun step 1 with these changes:
- `--binary /home/sprime01/.cache/godspeed/bin/sea-forge-server-v0.4.0`
- `--sha256 2e755e8242cc5d8a8a815171b04a7d6ad2de6fd771e31bb35488b0b6193a0d32`

Then restart both services. The old unit file is the `*.generated-<UTC>` sidecar next to `/etc/systemd/system/godspeed-sea-forge.service`. `RELEASE_RECOVERY.md` has the full procedure.

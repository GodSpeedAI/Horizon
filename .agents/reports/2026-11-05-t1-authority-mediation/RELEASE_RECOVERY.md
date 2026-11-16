# T1 Authority Mediation: release recovery

How to undo any part of the T1 release, using the exact versions involved. Both layers can be rolled back on their own: the matrix in `evidence/phase-f/MATRIX.md` shows that every pairing of front and gateway works.

Published npm packages and crates cannot be withdrawn. Rolling back means pinning or installing the previous version, never unpublishing.

## What was released

| Layer | Released | Previous (rollback target) |
|---|---|---|
| Gateway | sea-rs tag `v0.4.0` (`55bb3937`), deployed binary sha256 `2e755e8242cc5d8a8a815171b04a7d6ad2de6fd771e31bb35488b0b6193a0d32` | The previously deployed binary, kept on disk as `/usr/local/lib/godspeed-sea-forge/bin/sea-forge-server.replaced-20261105T224530Z` (sha256 `9d2487cd18fceb6c…`). The tag `v0.3.0` (`c81f6307`) build is tested in the matrix (sha256 `4540aa96…`). |
| Gateway policy | `/var/lib/godspeed-sea-forge/policy.yaml` sha256 `08c84612…` | `policy.yaml.previous-20261105T224530Z` |
| Horizon runtime | `/opt/godspeed-horizon` | `/opt/godspeed-horizon.previous-20261105T224530Z` |
| Cognate SDK | `0.9.0` (release `bcef6637`, all 48 publish jobs green) | `0.8.0` (still on npm) |
| Workbench | main `39700cb` (PR #29) | `f0f2733` |
| Horizon | main `ed69e8c` (PR #22), installer `03a57da` (#20), gateway `94748dc` (#18) | `94748dc` for the adoption; the pre-#18 main `66abfd6` for the gateway work |
| Agent stage | `~/.cache/godspeed/gateway-stage`, digest `57bad1e5…` (built from main by the new stager) | `~/.cache/godspeed/gateway-stage.deployed-v0.4.0-20261105T224530Z` (digest `6b235e6a…`, the stage that v0.4.0 was installed from) |

## 1. Gateway rollback (owner-run, needs sudo)

Use this when the v0.4.0 server misbehaves. No source revert is needed, because fronts on Cognate 0.9.0 work with the previous server: they only use verbs and fields that already existed there (matrix cells `*-adopt × v0.3.0`).

1. The agent stages from current main (`just gateway-stage`) and gives you the printed digest.
2. You run, with the variables from `docs/gateway-runbook.md` set:
   ```bash
   OLD=/usr/local/lib/godspeed-sea-forge/bin/sea-forge-server.replaced-20261105T224530Z
   sudo scripts/install-sea-forge-gateway.sh --authorize-privileged --stage "$STAGE" \
     --binary "$OLD" --sha256 "$(sha256sum "$OLD" | cut -d' ' -f1)" --replace-binary \
     --bun "$(readlink -f "$BUN")" --bun-sha256 <hex> --expect-stage-sha256 <digest>
   sudo systemctl restart godspeed-sea-forge.service godspeed-horizon.service
   ```
   The installer keeps the current binary as `sea-forge-server.replaced-<UTC>`, so you can roll forward again the same way.
3. The agent re-runs the read-back probe (`evidence/release/live-roundtrip-readback.ts`) and records the result. The rollback counts as LIVE VERIFIED only after that.

The policy file is unaffected: the server re-reads it on every decision. To restore the previous policy, run `sudo install -o root -g godspeed-sock -m 0640 /var/lib/godspeed-sea-forge/policy.yaml.previous-20261105T224530Z /var/lib/godspeed-sea-forge/policy.yaml`.

## 2. Front rollback (agent-run, no sudo except redeploy)

The approval bytes did not change, so a front reverted to its pre-adoption commit works with the v0.4.0 server (matrix cells `*-pre × v0.4.0`, and the revert cells).

- **Horizon:** `git revert ed69e8c` on a branch, then open a PR and merge. That restores the vendored 0.8.0 tarballs, the adapter, and the old inbox parsing. To put it into service, stage and install with the owner command in section 1, using the *current* binary path and sha.
- **Workbench:** `git revert 39700cb` on a branch, then open a PR and merge. It is not deployed, so no install is needed.
- **Cognate:** pin the dependents back to `0.8.0`. Do not unpublish 0.9.0.

## 3. Quick restore of the Horizon runtime tree (owner-run)

When only the deployed runtime tree is bad and the gateway is fine, restore the previous tree directly:
```bash
sudo systemctl stop godspeed-horizon.service
sudo mv /opt/godspeed-horizon /opt/godspeed-horizon.bad-$(date -u +%Y%m%dT%H%M%SZ)
sudo cp -a /opt/godspeed-horizon.previous-20261105T224530Z /opt/godspeed-horizon
sudo systemctl start godspeed-horizon.service
```
The manifest at `/opt/godspeed-horizon.manifest.sha256` then describes the bad tree, so re-run a normal install to make them consistent again.

## Known open items (not regressions)

- sea-rs #86: crash orphan.
- Horizon #19 (M4): fail-open policy fallback.
- Horizon #21: the installer table should be a required set.
- Workbench #30: the live tests need a domainforge CLI matching the server's core version.
- SWE_SEED `native-candidate.yml` is red (`evidence/release/swe-seed-native-candidate.md`), so no claim is made that Workbench is installable.
- The cockpit approval flow was confusing in live use (ledger L-021). This is a UX follow-up.

## Rehearsal record

- 2026-11-06: the gateway rollback in section 1 was rehearsed without root, as `--verify-only`, using the previous binary (`…replaced-20261105T224530Z`) and stage digest `57bad1e5…`. Result: `verify-only: ok`, nothing installed. That is **SIMULATED PASS**. The privileged redeploy is owner-run and becomes LIVE VERIFIED only if the owner performs it.

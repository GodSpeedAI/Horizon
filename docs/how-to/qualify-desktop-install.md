# Qualify the desktop install (WP-67)

**Goal.** Know, per platform, whether the Horizon desktop bundles install, run and uninstall cleanly, with evidence.

## What CI does

The `qualify` job in `.github/workflows/desktop.yml` runs after `build`, on a clean runner per platform, against the artifact that
same commit built (no ref or tag input exists). It downloads `horizon-unqualified-<platform>` and runs
`scripts/qualify-desktop.py`, which uploads `horizon-qualification-<platform>` containing one JSON record.

| Platform | Steps |
|---|---|
| linux-x64, linux-arm64 | `deb_install`, `deb_installed_smoke`, `deb_installed_gui`, `deb_uninstall`, `appimage_extract`, `appimage_extracted_smoke` |
| windows-x64 | `msi_install`, `msi_installed_smoke`, `msi_uninstall`, then `nsis_install`, `nsis_installed_smoke`, `nsis_uninstall` |
| macos-arm64, macos-x64 | `dmg_install` (mount, copy the `.app` to a temporary Applications folder), `app_installed_smoke`, `app_uninstall` |

Every record also has `checksums` (each artifact file matches `SHA256SUMS`) and `upgrade`.

- **installed smoke** locates the server and resources the installer put on disk (not the build tree) and runs
  `scripts/smoke-sidecar.ts` against them. On Linux the server ships gzipped in the resources; the step unpacks the installed
  `horizon-server.gz` exactly as the app does on first run.
- **deb_installed_gui** launches the installed app under `xvfb-run`, finds its supervised `horizon-server` listening port with `ss`,
  requires `/health` 200, stops the app with SIGTERM and requires the server to be gone. macOS and Windows record no GUI step: the
  sidecar smoke is their evidence, and a headless GUI launch is not attempted there.
- **uninstall** requires that nothing remains under the install path. User data (for example `~/.local/share/ai.godspeed.horizon`)
  may remain; what remains is listed in the step's `evidence.user_data_remaining`.
- **upgrade** is always `NOT_RUN`, reason "no previous release". It is never required.

## Statuses

Each step is `PASS`, `FAIL` or `NOT_RUN` with a reason. The record's `status` is:

- `QUALIFIED`: no step failed and every required step passed (the required list is in `scripts/qualification-platforms.json` and
  copied into the record).
- `PARTIAL`: nothing failed but a required step was `NOT_RUN` (for example the `.deb` steps without root).
- `NOT QUALIFIED`: any step failed.

Records also carry the commit, artifact sha256 values with whether each matched `SHA256SUMS`, OS, architecture and runner image.
The script exits non-zero on any `FAIL` (a red job); `NOT_RUN` is recorded, not hidden. Artifacts stay named `unqualified` until a
release workflow consumes `QUALIFIED` records; this repository does not publish, sign or release anything from them.

## Run it yourself (Jetson, Ubuntu 22.04 arm64)

Download the `horizon-unqualified-linux-arm64` artifact of a Desktop run, then, from a checkout with `bun` installed:

```sh
sudo apt-get install -y xvfb iproute2      # once; the GUI step records NOT_RUN without them
python3 scripts/qualify-desktop.py --platform linux-arm64-jetson --dist ./dist-arm64 \
  --commit "$(git rev-parse HEAD)" --out ./qualification/jetson.json --runner-image jetson-local
```

Without root the script never prompts. It records the `.deb` steps `NOT_RUN` and prints the exact commands that need root
(`sudo apt-get install -y <deb>`, `sudo apt-get remove -y horizon`). To qualify the `.deb`, you run the script as root yourself:

```sh
sudo env "PATH=$PATH" python3 scripts/qualify-desktop.py --platform linux-arm64-jetson --dist ./dist-arm64 \
  --commit "$(git rev-parse HEAD)" --out ./qualification/jetson.json --runner-image jetson-local
```

`linux-arm64-jetson` is accepted only on an L4T host (`/etc/nv_tegra_release`); it is the only record that counts as real-hardware
evidence. Hosted `linux-arm64` does not.

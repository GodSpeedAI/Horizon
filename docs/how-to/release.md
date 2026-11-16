# Cut a release (WP-68)

**Goal.** Publish Horizon desktop installers and the headless server with an honest record of what was qualified.

Three workflows, kept apart:

| Stage | Workflow | What it does |
|---|---|---|
| CI | `ci.yml` | Existing gates. Nothing is published. |
| Qualification | `desktop.yml` | Builds every platform and install-qualifies it ([how](qualify-desktop-install.md)). Also callable (`workflow_call`) by the release. |
| Publication | `release-please.yml`, `release-desktop.yml`, `promote-release.yml` | Version and tag, release with assets, promotion. |

## Cut a release

1. Merge conventional commits (`feat:`, `fix:`, ...) to `main`. `release-please.yml` keeps one standing **Release PR** up to date
   (version bump in `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, plus `CHANGELOG.md`). Tags look like `horizon-v0.2.0`.
2. Merge the Release PR. release-please creates the tag and a GitHub Release flagged **prerelease** with the changelog.
3. `release-desktop.yml` starts from the tag push (or, when the repository has no `RELEASE_PLEASE_TOKEN` secret, release-please
   dispatches it). It checks the tag equals `package.json`, calls `desktop.yml` at the tag's commit, then `publish`:
   - every qualification record must name the tag commit, and every released file must be byte-identical to what its record qualified;
   - assets of a QUALIFIED platform lose "unqualified" in their names, others keep it;
   - build provenance is attested and verified (`gh attestation verify <asset> --repo GodSpeedAI/Horizon`);
   - the release gets the installers, tarballs, `SHA256SUMS`, one `SHA256SUMS.<platform>` per platform, `qualification-<platform>.json`,
     `qualification.json` and `QUALIFICATION.md` (platform, status, NOT_RUN/FAIL reasons).
4. A failing platform job (any `FAIL` step is a red job) blocks publication: no release is created from a failing qualification.
   Fix it on `main` and cut a new release. Never move a tag. To re-run publication for a tag: Actions, Release (desktop), **Use
   workflow from: the tag** (idempotent).

`RELEASE_PLEASE_TOKEN` (PAT or app token) is optional but recommended: pull requests and tags created with `GITHUB_TOKEN` trigger no
workflows, so without it CI does not run on the Release PR by itself.

## What "prerelease" means

The release is a **prerelease and not "latest"** unless every platform in `scripts/qualification-platforms.json` is QUALIFIED. The
`linux-arm64-jetson` row can only be satisfied by a record made on real Jetson hardware, so a fresh release is always a prerelease: that
is intended, not a failure. A prerelease still carries installers; its `QUALIFICATION.md` says exactly which platforms and steps are not yet evidenced.

## Add the Jetson evidence, then promote (owner)

On the Jetson (Ubuntu 22.04 arm64, `bun` installed), using the release's own assets (full steps in
[qualify the desktop install](qualify-desktop-install.md)):

```sh
TAG=horizon-v0.2.0
mkdir dist-arm64 && cd dist-arm64
gh release download "$TAG" --repo GodSpeedAI/Horizon --pattern 'SHA256SUMS.linux-arm64'
for f in $(awk '{print $2}' SHA256SUMS.linux-arm64); do gh release download "$TAG" --repo GodSpeedAI/Horizon --pattern "$f"; done
mv SHA256SUMS.linux-arm64 SHA256SUMS && cd ..
git checkout "$TAG"
sudo env "PATH=$PATH" python3 scripts/qualify-desktop.py --platform linux-arm64-jetson --dist ./dist-arm64 \
  --commit "$(git rev-parse "$TAG^{commit}")" --out qualification-linux-arm64-jetson.json --runner-image jetson-local
gh release upload "$TAG" qualification-linux-arm64-jetson.json --repo GodSpeedAI/Horizon
```

Then run Actions, **Promote release**, with **Use workflow from: the tag**. It re-validates every record asset (known platform,
`commit` equals the tag commit, `real_hardware` true for the Jetson, artifact sha256 values equal the release `SHA256SUMS`),
regenerates `QUALIFICATION.md` and the notes, and marks the release **latest** only if every claimed platform is QUALIFIED and the
release carries its provenance marker. Otherwise it stays a prerelease and the run says why. A record for another commit, a
non-hardware record or mismatched bytes fails the run and changes nothing.

## Not covered

Signing (Authenticode, Apple notarization) is not configured; upgrade qualification is NOT_RUN until a previous release exists.

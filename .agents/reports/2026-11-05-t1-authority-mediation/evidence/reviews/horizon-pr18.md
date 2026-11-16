# Review: Horizon PR #18 (head 781231e)

Verdict: REQUEST CHANGES. The PR's own delta (self-approval refusal, policy gate, tests) is sound. Two Major findings are in the installer's stage-binding, which this review was asked to check. They predate or sit outside the diff, and you may reasonably accept them as follow-ups.

Note on scope: `git diff origin/main...HEAD` outside `.agents/` and `docs/` is only 4 files (src/app.ts, scripts/gateway-setup.ts, and two test files). The installer script and units are unchanged by the diff and were reviewed as the current state.

## Findings

### Major

M1. The installer's stage digest does not bind everything root installs. `scripts/install-sea-forge-gateway.sh:116,119,244`, `scripts/gateway-setup.ts:513-515,555`.
- The runtime tree is checked with `sha256sum -c`, which only verifies files named in the manifest.
- Scenario: an agent adds `runtime/src/extra.ts`, or `runtime/bunfig.toml`, or a symlink, to the stage dir. The manifest, and therefore the digest, are unchanged. I confirmed `sha256sum -c` passes with an extra file and a symlink present.
- Root then `cp -a`s the extra file or symlink into the root-owned `/opt` tree, and the runtime service executes it. `copyTree` also copies symlinks with their raw target but excludes them from the manifest. A symlink to an agent-writable path would let the agent change the code later, after the digest was approved.
- Today's `node_modules` symlinks are relative and benign; the installer does not enforce that.
- Fix: before copying, refuse any non-regular file and any file not listed in the manifest. For example, compare `find runtime -type f | sort` with the manifest names, and require `find runtime ! -type f ! -type d` to be empty. Alternatively, fold the file list and symlink targets into the digest.

M2. Time-of-check/time-of-use between the digest and use. `scripts/install-sea-forge-gateway.sh:116 vs 435, 171, 244, 250, 288, 323`.
- The digest is computed once at the start, compared at line 435, and the stage files are then re-read from the agent-writable `$STAGE` (units, `server.yaml.in`, `policy.yaml`, manifest). The post-copy manifest check at 244 also re-reads the manifest from `$STAGE`.
- `--binary` and `--bun` are hashed at lines 127 and 140, then installed from the same path later. If that path is agent-writable, it can be swapped between hash and install.
- Fix: as root, snapshot `$STAGE` (and the binaries) into a root-owned `mktemp -d`. Digest and verify the snapshot, and install only from it.

M3. Digest coverage is a fixed file list, while the plan can name other staged paths. `install-sea-forge-gateway.sh:116, 309, 323`.
- `config-file`, `generated` and `worlds` rows take their source from `plan.tsv`. Only 7 named files are digested.
- Scenario: a plan row naming `config/other.yaml` would be installed without that file being hashed. The owner sees only the path in the printed plan.
- Fix: digest the full staged tree (a sorted `find`), or refuse plan sources outside the digested list.

M4. The policy fallback is fail-open for unclassified settlement declarations. `scripts/gateway-setup.ts:440-455`.
- Only `settlement_authority_class: [external]` is gated. The final `settlement` rule allows service `settlement_declaration` with no class constraint, so a declaration with the field absent or with another value (for example `External`) is allowed outright.
- `settlement_authority_class` is never set in `src/`, so I could not confirm where it comes from or what the engine does with a missing field.
- Fix: make the fallback explicit with `settlement_authority_class: [local]`, so unknown classes hit default deny. Add a test that no ungated settlement allow remains.

### Minor

m1. `src/app.ts:517-519` and `src/app.ts:511`. The desktop requester's `caller_ref` is `actor:<id>`, but the approver is `seaForgeActorOf(...)`, which has the prefix stripped. The mapping is keyed by bare operator id.
- On the desktop path, `requester === approver` and `actorFor(requester)` therefore never match. The comment "runs on every path" overstates what happens there: only the unknown-identity half is live.
- This is not exploitable. At SEA-Forge the desktop requester is the service actor, which differs from the operator.
- Fix: normalise both sides (strip `actor:`), or state the limit in the comment.

m2. `src/app.ts:517-521`. An unknown requester (no `awaiting_authority` row in the local log, for example an escalation raised outside Horizon) is now refused before the "already decided" and "no run waits" branches. This is correct fail-closed behaviour, but the error is misleading for those cases.

m3. `src/app.ts:90-91`. The `selfApprovalRefusal` doc comment was inserted between the `/** The frame this application... */` comment and `FrameView`, so the FrameView doc is now detached. Move the new function above it.

m4. `scripts/gateway-setup.ts:222-290`. The units omit further hardening: `CapabilityBoundingSet=`, `RestrictAddressFamilies=AF_UNIX`, `PrivateDevices`, `ProtectKernel*`, `SystemCallFilter`. The `ExecStartPre=+install -d` is the only `+`-prefixed command, as required. `ReadOnlyPaths` on `server.yaml` and `policy.yaml` is correct. Modes are 0640/0750/0700, and `local-operator.secret` is written 0600. No world-readable secret found.

## Checked and fine
- Operator-to-actor mapping comes only from validated config (`src/remote/operators.ts`). A request body, header or cookie never supplies it.
- An unmapped operator is refused with no fallback (`sessionRefusal`, `delegating-authority.ts:41`). The service identity cannot be a human operator.
- The agent-kind caller cannot approve (`app.ts:508`).
- Approval inbox: GET only, calls only `authority_approvals`, and any error becomes the `unreachable` state. It never allows or acts.
- Rendered policy: both external gates (service and operator) come before the plain allow, and each has `requires_approval: true`.

## Tests
- `bun test`: 477 pass, 0 fail.
- `bun run check`: ok.

## Mutations (each reverted; `git status` clean of tracked changes afterwards)
1. Self-equality check in `selfApprovalRefusal` replaced with `if (false)`. KILLED: 2 tests fail, including the integration test in `remote-sessions.test.ts`.
2. Unknown-approver guard disabled. KILLED: 1 test fails (a unit test only).
3. Stage-digest compare `[ "$EXPECT_STAGE" = "$STAGE_DIGEST" ]` replaced with `true`. SURVIVED: 56 pass, 0 fail. The only test that exercises it runs as non-root and is stopped earlier by the "must run as root" check. Add a test that reaches the digest check, for example with `id`/root stubbed, or by moving the digest check before the root check.

Also noted: no integration test covers an unknown identity or requester through `resolveNavigationApproval`; only the pure function is tested.

## Could not verify
- Any real root run of `--authorize-privileged` (tests ran as uid 1000).
- SEA-Forge engine semantics: first-match order, treatment of a missing `settlement_authority_class`, and where that field is set.
- The live gateway and systemd sandbox behaviour.

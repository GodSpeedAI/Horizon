# Settlement approval: live round-trip runbook (owner-run)

Status: prepared, not run. Scope: deploy the sea-rs build that contains the settlement approval lifecycle
(PR #79 and PR #81, main at 09c2541b or later) to the protected gateway, then prove approve, reject, and
resume against the live socket. Read it end to end before starting.

Run the privileged steps yourself. Agents must not run `sudo`, `systemctl`, `chown`, `chmod`, or `useradd`.

## What is verified and what is not

- Verified in code and tests: the CLI `approve`/`reject` resolve settlement pending approvals; the gateway's
  `authority_approval` verb calls `CepAuthorityService::resolve_approval`; `authority_approvals` lists approvals
  read-only; a claim is released, completed, or left open after a failed resume (PR #81).
- Not verified here: the exact request that creates a live settlement pending record. Step 2 below names the
  two candidate paths. Confirm which one you will use before you start. If neither produces a pending record
  (exit code 5 and an `apr-settlement-pending-` approval), stop and report. Do not improvise a substitute.
- Open review findings that a live run does not exercise (see "Known gaps" at the end). They do not block a
  test deployment on this machine. They do block calling the feature production-ready.

## Values to set once in your login shell

Use the values from this machine. Do not paste a digest from an older copy of this file.

```bash
export STAGE="$HOME/.cache/godspeed/gateway-stage"
export SEA_FORGE_BIN="<path to your sea-rs checkout>/target/release/sea-forge-server"
export BUN="$HOME/.local/bin/bun"
```

## 1. Build and digest the new binary (unprivileged)

```bash
cd "<path to your sea-rs checkout>"
git fetch origin && git switch --detach origin/main   # 09c2541b or later
cargo build --release -p sea-forge-server
sha256sum "$SEA_FORGE_BIN"
```

Record the digest as `NEW_BIN_SHA256`. The previous gateway binary digest is `9d2487cd18fceb6c377d5fb26f739c28251862c55663cfde64ab6c6072a32c85`.
It must differ from `NEW_BIN_SHA256`. If it does not, the build did not change and this runbook does not apply.

## 2. Stage and dry-run (unprivileged)

```bash
cd "<path to Horizon>"
just gateway-stage
```

Record the `bundle digest` line as `NEW_STAGE_SHA256`.

```bash
scripts/install-sea-forge-gateway.sh --dry-run
```

The dry run prints the full plan and the exact `sudo` command. Check that the binary row shows
`NEW_BIN_SHA256` and the stage row shows `NEW_STAGE_SHA256`. Stop if either row shows an older value.

## 3. Apply as root (owner)

```bash
sudo scripts/install-sea-forge-gateway.sh --authorize-privileged \
  --stage "$STAGE" \
  --binary "$SEA_FORGE_BIN" \
  --sha256 "<NEW_BIN_SHA256>" \
  --replace-binary \
  --bun "$BUN" \
  --bun-sha256 "<BUN_SHA256 from the dry run>" \
  --expect-stage-sha256 "<NEW_STAGE_SHA256>"
```

`--replace-binary` keeps the previous gateway binary as `sea-forge-server.replaced-<UTC>`. That sidecar is the
rollback source. The installer stops at the first failing row. Rerunning the same command is safe.

## 4. Reload and restart (owner)

```bash
sudo systemctl daemon-reload
sudo systemctl restart godspeed-sea-forge.service
sudo systemctl restart godspeed-horizon.service
systemctl is-active godspeed-sea-forge.service godspeed-horizon.service
journalctl -u godspeed-sea-forge.service -n 5 --no-pager
```

Expect both `active` and the log line `server listening on /run/godspeed-sea-forge/sea-forge.sock`.

## 5. Containment checks (login, then owner)

```bash
scripts/install-sea-forge-gateway.sh --check --stage "$STAGE"            # as your login, no sudo
ls /run/godspeed-sea-forge/sea-forge.sock                                # expect: Permission denied
PID=$(systemctl show -p MainPID --value godspeed-sea-forge.service)
sudo nsenter -t "$PID" -m -- mv /var/lib/godspeed-sea-forge/policy.yaml /var/lib/godspeed-sea-forge/policy.yaml.test
#   expect: Device or resource busy; the file must still be in place afterwards
sudo scripts/install-sea-forge-gateway.sh --check --stage "$STAGE"       # as root
```

Stop if the login can reach the socket, if the `nsenter` move succeeds, or if the check reports `BAD` or `FAIL`.

## 6. Round trip against the live socket

The socket accepts only the `godspeed-sock` group, so the calls below run as the runtime account. Use the Horizon
cockpit approval inbox, or call the socket as the runtime account with `sudo -u godspeed-horizon` (owner only).
Each request is one NDJSON line.

### 6a. Create a live settlement pending record

Candidate paths (confirm one before you start):

- an external SWE_SEED declaration submitted through the gateway for a case with a claim manifest;
- an artifact transition that requires an external settlement, resumed through the gateway.

Expected: the attempt returns `awaiting_approval` (CLI exit code 5) and prints `settlement_pending_id=<id>`.
The approval id is `apr-settlement-pending-<id>`. Record it as `APPROVAL_ID`.

### 6b. Confirm the approval is listed as pending

```json
{"verb":"authority_approvals","actor":"<runtime service actor>"}
```

Expect `ok: true` and `APPROVAL_ID` with a pending status. If it is not listed, stop and report.

### 6c. Reject path (use a fresh pending record)

```json
{"verb":"authority_approval","approval_id":"<APPROVAL_ID>","resolution":"rejected",
 "request_id":"horizon:<APPROVAL_ID>:rejected","actor":"<runtime service actor>","on_behalf_of":"<operator>"}
```

Then attempt the resume for that case. Expect no declaration: the case ledger holds no `settlement_declaration`
naming the pending record, and the attempt is refused with a rejected status. Stop if any declaration appears.

### 6d. Approve path (a fresh pending record, approved by someone other than the requester)

Send the same verb with `"resolution":"approved"` and `request_id` `horizon:<APPROVAL_ID>:approved`. Then resume.

Expect exactly one declaration, the transition to complete, and `declaration_id` printed. Resume a second time.
Expect no second declaration and a completed status. Stop and report if a second declaration appears.

### 6e. Approved but never resumed

Approve a third pending record and do not resume. Expect the status to stay approved, and any declaration
naming it to be refused as `authorization_unclaimed`. Check this with the approval list and, if available, the
quarantine records. Do not declare by hand.

## Expected outcomes

| Step | Expected |
|---|---|
| 1 | new digest differs from the previous one |
| 3 | installer reports each row ok and `--replace-binary` keeps a `.replaced-<UTC>` sidecar |
| 4 | both services active; listening line present |
| 5 | login cannot reach the socket; `nsenter` move is refused; check ok |
| 6a | awaiting approval, pending id printed |
| 6b | approval listed as pending |
| 6c | rejected: no declaration |
| 6d | approved: one declaration, then a second resume declares nothing |
| 6e | unclaimed: no declaration accepted |

## Stop conditions

Stop and report, without retrying, if any of these happen:

- a declaration appears without an approval or after a rejection;
- a second declaration appears for one approval;
- the login can reach the socket, or the `nsenter` move succeeds;
- the approval is not listed, or a verb returns an error class not named above;
- the gateway log shows a panic or a restart loop.

## Rollback

1. Re-run the installer with the previous binary and its digest (`9d2487cd18fceb6c377d5fb26f739c28251862c55663cfde64ab6c6072a32c85`),
   or move the `sea-forge-server.replaced-<UTC>` sidecar back in place as root.
2. `sudo systemctl daemon-reload`, then restart `godspeed-sea-forge.service` and `godspeed-horizon.service`.
3. Approvals and declarations written by the new binary stay in the authority ledger. Do not delete them. Record
   the pending ids in the run notes so the reconciliation can account for them.

## Known gaps (open review findings, not closed by this deployment)

- `verify_one` (crates/sea-forge-authority/src/cep/declaration_authority.rs) authorises a declaration from its
  copied `authorization_request_sha256` and id. It does not recompute `declaration_hash` or check the declared
  content against the approved hash. Promotion reads the unchained `settlement/declarations.jsonl` view. CodeRabbit
  rated this Major on PR #80 (security). It needs a decision on which record is authoritative before go-live.
- Resume-start reconciliation (`reconcile_open_settlement_attempts`) can fail the open claim of a concurrent resume
  that is still declaring. CodeRabbit rated this Major on PR #80 (stability). It needs a decision: a claim age bound
  larger than the declare timeout, or refusing to resume while a claim is open.
- The server path (`settle_unrecorded_claim` in crates/sea-forge-server/src/delegation.rs) records
  `declaration_not_made` on non-unavailable errors without checking for an appended declaration.
- This runbook does not exercise concurrent resumes.

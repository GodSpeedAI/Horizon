- **blocker** — [connectors/github/lock.ts:44](/home/sprime01/projects/horizon-connector/connectors/github/lock.ts:44): Writer A creates the lock but pauses before writing its PID. Writer B treats the empty file as stale, unlinks it and acquires another lock. A resumes successfully; both writers run.

- **blocker** — [connectors/github/index.ts:292](/home/sprime01/projects/horizon-connector/connectors/github/index.ts:292): An issue-create request times out while GitHub is still processing it. A retry discovers no issue and creates another; the original request subsequently commits, producing duplicate parents. Step creation has the same failure window.

- **major** — [connectors/github/index.ts:474](/home/sprime01/projects/horizon-connector/connectors/github/index.ts:474): Shutdown releases the lock without draining writes or terminating detached `gh` processes. A replacement connector can start while the previous process’s GitHub mutation remains in flight.

- **major** — [connectors/github/index.ts:374](/home/sprime01/projects/horizon-connector/connectors/github/index.ts:374): After the comment and new label succeed, deleting the old label fails. Retrying computes a different `from` value and posts a duplicate comment. Recovery through polling also changes the marker’s event identity to `poll`.

- **major** — [connectors/github/index.ts:275](/home/sprime01/projects/horizon-connector/connectors/github/index.ts:275): Buffered events read the latest horizon rather than their corresponding states. If a step becomes active and then completed before delivery resumes, processing both events posts only “finished”; the active transition disappears while both cursors advance.

- **major** — [connectors/github/index.ts:281](/home/sprime01/projects/horizon-connector/connectors/github/index.ts:281): An unrelated issue carrying `horizon-case` and a copied case marker is accepted as the parent. Synchronization overwrites its title and body and attaches case steps. Step discovery likewise trusts copied body markers.

- **major** — [connectors/github/index.ts:205](/home/sprime01/projects/horizon-connector/connectors/github/index.ts:205): Editing an imported issue’s title changes the intake payload while retaining its request ID. The keeper returns `request_id_reused`; the connector skips synchronization. Closing that issue then leaves its previous state label unchanged.

- **major** — [connectors/github/index.ts:212](/home/sprime01/projects/horizon-connector/connectors/github/index.ts:212): A refused intake is cached as processed. If authorization is subsequently granted without an issue edit, later polls skip the unchanged issue indefinitely until restart.

- **major** — [connectors/github/mapping.ts:86](/home/sprime01/projects/horizon-connector/connectors/github/mapping.ts:86): A title containing `token=…` or a GitHub credential is copied into the durable case item without redaction. Rendering that item back to GitHub also retains the credential.

- **major** — [src/adapters/redact.ts:12](/home/sprime01/projects/horizon-connector/src/adapters/redact.ts:12): Quoted credentials bypass redaction. For example, `{"password":"example-password","token":"example-token"}` survives unchanged and can appear in adapter errors or GitHub error details.

- **major** — [connectors/github/sea-events.ts:48](/home/sprime01/projects/horizon-connector/connectors/github/sea-events.ts:48): Keeper request/reply sockets have no receive-size cap. The underlying reader accumulates bytes until newline; a peer flooding an unterminated reply can exhaust memory before the timeout. The subscription’s line cap does not cover these calls.

- **major** — [src/adapters/realitytrace-economics.ts:40](/home/sprime01/projects/horizon-connector/src/adapters/realitytrace-economics.ts:40): `spawnSync` uses SIGTERM on timeout without escalation. A child that ignores SIGTERM blocks indefinitely, freezing the calling event loop despite the configured timeout.

- **major** — [src/adapters/run-child.ts:83](/home/sprime01/projects/horizon-connector/src/adapters/run-child.ts:83): Normal parent exit cancels the timeout without killing remaining descendants. A command that backgrounds a process with redirected output returns success while that descendant continues running without a deadline.

- **major** — [connectors/github/index.ts:71](/home/sprime01/projects/horizon-connector/connectors/github/index.ts:71): `seenIssues` never evicts entries for issues no longer discovered; `placed` likewise retains every case. Repeatedly labeling and unlabeling new issues grows memory indefinitely despite bounded individual polls.

- **minor** — [connectors/github/index.ts:232](/home/sprime01/projects/horizon-connector/connectors/github/index.ts:232): Every polling transition uses the same `poll` identity. Closing, reopening and closing a generated step again suppresses the second closure comment because its marker matches the first closure.

- **Clean category — issue closure:** no path found that accepts a keeper step because GitHub closed its issue.
- **Clean category — cursor storage:** no premature-save or rewind defect found in `cursor.ts`.
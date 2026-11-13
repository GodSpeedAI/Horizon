# Unified human and agent identity, delegation, and authority

**Status:** revised after adversarial review; conditional architecture for owner decisions; not implemented  
**Date:** 2026-11-08  
**Scope:** Cognate, Cognate Workbench, Horizon, SEA-Forge, Gauntlet, and RealityTrace  
**Method:** source and test inspection, focused existing-test runs, six fresh-context EGM Goldfish lenses, and final adversarial review. The design does not change the frozen Horizon specification or any implementation.

## Executive recommendation

Build one identity envelope and one delegation chain, not one identity database. Cognate should own the application identity contract, authenticate humans, agents, executions, services, and connections, and provide a default local issuer that gives every agent execution a distinct, short-lived identity. A configured external issuer may replace that local implementation without changing the contract. SEA-Forge should independently authorize bounded delegation and consequential operations. Horizon, Workbench, and Gauntlet should consume those verified contexts; none should become another identity or approval authority.

Keep four claims separate:

1. **Authentication:** which principal or execution presented a valid credential?
2. **Human participation:** did an authenticator report presence and user verification?
3. **Human intent:** was the exact operation reviewed on a surface the adversary could not control?
4. **Authorization:** did the applicable runtime policy and, when required, SEA-Forge permit this exact operation now?

A browser cookie proves only a session. A WebAuthn assertion can prove an authenticator-backed ceremony bound to an operation; it cannot prove that a person understood a page an agent could manipulate. SEA-Forge authorization is never inferred from either one.

The current code does not satisfy that model. Cognate runs inherit `startedBy` as their actor. Workbench Expert runs are system-started rather than independently authenticated. SEA-Forge's existing gateway delegation deliberately turns the effective actor into the end user. Horizon's page-agent header is caller-controlled, and its phone approval uses the signed-in session rather than a fresh operation-bound assertion. These are migration gaps, not mechanisms to rename and declare complete.

### Acceptance condition and trust profile

This recommendation is conditional, not accepted for implementation. The owner must approve a threat profile before code changes; otherwise the identity machinery can be correct while the deployment premise is false.

- **Minimum profile S1:** defend against a browser-controlling agent, caller-controlled headers, replay, stale approval, credential theft by another isolated workload, and a naive or accidental same-account local process. Require the local issuer/broker to run under a principal or OS service boundary the agent cannot write, read, signal, or control. A2 is supported only when its page is trustworthy. A3 remains unavailable.
- **Strong profile S2:** additionally defend against a hostile local process that can inspect ordinary operator files, and against page manipulation of approval review. Require the issuer, SEA-Forge authority, and confirmation service to be outside the agent's security boundary, plus enforceable workload separation and a separately trusted confirmation device/surface. A3 may be offered only when those conditions are measured.
- **Not defended by either profile:** compromised operating-system kernel/root, compromised issuer or authority host, malicious or cloned authenticator, physical coercion, or a user who intentionally approves the wrong thing. Those require separate controls and evidence.
- **Issuer compromise:** the trust root can issue false identities, so recovery requires trust-root rotation, revocation of the issuer generation, invalidation of its credentials/grants, re-enrolment of agents/devices, and preservation of evidence with a compromised-issuer marker. Naming TPM, DPAPI, or Keychain does not settle which process may use the key.
- **Legacy gateway:** the current SEA-Forge human-gateway path does not authenticate the target human's participation. It may remain for a human-only gateway running under a distinct, non-agent-controlled OS principal, and must be disabled wherever an agent shares that principal. Once the agent-executed contract exists, no new governed work may fall back to the legacy path; old records remain versioned history.

A deployment that has not selected S1/S2 and demonstrated its mechanics may run low-risk local work, but must not claim authenticated agent attribution, immediate revocation, or independent human confirmation.

## 1. Investigation baseline and evidence rules

Repository states inspected:

| Repository | Branch | Commit |
|---|---|---|
| Horizon | `horizon-desk-gaps` | `0eca3ed0fa438f8fa7e11fba56dee1a6e12a04f0` |
| Cognate | `security/repo-hygiene-2026-10-31` | `87333bce08f449e4664b01936832d2a72034d405` |
| Cognate shared-identity worktree | `horizon/shared-identity` | `f4d4db6402485e1d6f0de4e11e7172af3bdeb49d` |
| Cognate Workbench | `feat/desktop-terminal-browser` | `65510bbfce73bf08dd9463e4213eef47cb74e5bf` at final test run; the checkout advanced from `461da18b1a50bc21db57fd9b3b5651d4e984f0a6` through `32582afe94aab3e6e7dc1a54f70fd4e493c92791` during review |
| SEA-Forge | `docs/egm-bootstrap-readmes` | `b072ec50b1e50df75c45ddf1709caa6877d5c2f1` |
| Gauntlet | `release/native-distribution` | `584277796ff73cb00ffd4c5f60b0e4a2cec429a6` |
| RealityTrace | `feat/native-binary-distribution` | `c239d5c6748373434b33c483f9ee8cf67c3eb323` |

Claims below use **implemented** for source that exists at the named commit, **verified here** only for tests actually run in this investigation, and **proposed** for the architecture. Source presence is not a live cross-platform security proof. Configured CI lanes are not reported as passing evidence without an observed run.

The shared `@godspeed/identity` package is a separate worktree and a vendored Horizon dependency, not evidence that the main Cognate checkout already provides agent identity. Workbench advanced through unrelated concurrent commits during the investigation; reviewers checked the later source and no reviewer changed branches or files. Existing Workbench changes were preserved; no repository implementation or specification was edited.

## 2. What exists and what is missing

| Area | Existing mechanism and evidence | Remaining gap |
|---|---|---|
| Cognate principal and caller | `Principal` supports `user`, `agent`, `service`, and `system`; `Caller` comes from the transport authenticator, not a message body (`packages/kernel-api/src/types.ts:22-25`, `packages/runtime-api/src/types.ts:154-158`, `packages/protocol-connect/src/index.ts:27-31`). | The authenticator is only a callback. There is no production agent issuer, credential lifecycle, delegation chain, or session identity in `Caller`. The development token accepts a tenant and principal string and must never be a production authenticator (`packages/protocol-connect-bun/src/index.ts:111-117`). |
| Cognate runtime identity | Runs have durable `runId`, correlation, replay, continuation, and causation. Run-ownership leases fence writers (`packages/events/src/types.ts:46-73`). | A fencing lease is not authentication. `RunContext.actor` is reconstructed from `startedBy`, so a run inherits its initiator (`packages/runtime-bun/src/executor.ts:120-127`). There is no separate execution or attempt identity. |
| Cognate scopes and authority | Scopes can narrow principals, capability policy defaults to deny, service actions have a separate policy, and invocations carry correlation (`docs/security.md:5-22`). | Narrowing a `Principal` does not express delegated grants, expiry, audience, budget, redelegation, revocation, or human assurance. |
| Cognate protocols | Connect, AG-UI, and A2A authenticate at their boundary; MCP fixes a caller for the connection. All invoke the same runtime policy (`docs/subsystems/wire-and-protocols.md:40-53`). | None carries a verified execution and delegation context. A2A advertises an empty security scheme even though its handler has an authenticate callback (`packages/a2a/src/index.ts:102-128`). Authentication at one hop does not yet become a bounded token for the next. |
| Shared human identity | `@godspeed/identity` has durable operators, hashed session tokens, devices, generation-based revocation, and WebAuthn UP+UV (`packages/identity/src/service.ts:18-72` in the shared-identity worktree). Its 36 tests passed here. | Operators only: no registered agents, ephemeral instances, executions, delegation, or workload credentials. Registration accepts attestation `none`, so authenticator hardware properties are not established (`src/remote/webauthn.ts:69-82` in Horizon). |
| Workbench sessions | Durable identities and revocable sessions resolve a bearer token to a server-built `Caller`; same-process revocation is immediate and cross-process cache lag is bounded at two seconds (`src/auth/identity.ts:175-220`). Seventeen auth/WebAuthn tests passed here. | This is a second session-ledger implementation to migrate into the shared package, not a model for per-run agent identities. |
| Experts and Teams | Experts have durable IDs; assignments link parent, attempt, run, tools, budget, and evidence. Team bounds include depth, assignments, rounds, and concurrency (`src/experts/types.ts:22-33,69-93`). | An Expert ID is registry metadata, not an authenticated principal. Runs are started through the system caller and admission explicitly requires that (`src/experts/bridge.ts:42-50`, `src/experts/admission.ts:172-188`). |
| Horizon human and agent doors | Browser sessions and per-agent bearer keys exist. The closed surface grammar distinguishes agent and owner provenance (`src/ui/surface2/grammar.ts:20-23,35-60`). | Agent keys are long-lived and not execution-bound. `x-horizon-source` is only a caller assertion (`src/app.ts:3430-3438`). Surface provenance is not itself cryptographic attribution. |
| Horizon WebAuthn and remote device | Pairing, single-use challenges, durable device sessions, origin/RP checks, UP+UV, and sign-count checks exist (`src/remote/pairing.ts:109-124`, `src/remote/webauthn.ts:266-283`). Forty-two focused tests passed here. | WebAuthn currently opens a session (`src/remote/server.ts:382-410`). Approval later needs only that session (`src/remote/server.ts:575-581`). No assertion is bound to an operation, parameters, revision, or approval. |
| SEA-Forge direct identity | Unix UID and Windows SID resolution, actor bindings, protected-verb classification, entity matching, and separation of duty exist (`crates/sea-forge-server/src/identity.rs:50-107,412-463`). | Same-OS-account agents are not independently isolated by this mechanism. Actor claims become trusted only after transport or workload authentication. |
| SEA-Forge gateway delegation | Gateway allowlists, target role checks, and a durable two-principal audit record exist. Nine delegated-identity tests passed here. | The effective actor deliberately becomes the end user (`crates/sea-forge-server/src/delegation_audit.rs:1-16`). That is suitable for a human gateway, not for an agent that must remain the executor. A new versioned contract is required. |
| SEA-Forge action and workload grants | Move-only, exact-action `ActionGrant`; authority-issued, single-use, exact-request private connections; and `identity_minting` exist (`crates/sea-forge-authority/src/lib.rs:80-103`, `crates/sea-forge-server/src/workload_connection.rs:18-44,100-141`). | These are not renewable execution credentials or general delegation leases. Existing in-memory grants are not portable offline tokens. The production executable starts ordinary `run`, not `run_authenticated`, so the private-connection path is only partially integrated (`crates/sea-forge-server/src/main.rs:78`, `src/lib.rs:1438-1450`). |
| SEA-Forge credential lifecycle | The PostgreSQL broker re-decides on renewal, revokes on refusal, terminates live backends on revocation, and reconciles expiry (`crates/sea-forge-server/src/postgres.rs:424-484,526-645`). | This is resource-specific, but it is the right lifecycle donor. General agent renewal, revocation broadcast, offline verification, and reconnect reconciliation are absent. |
| Gauntlet | Runs pin a frozen reference; role invocations carry run, role, runner, permissions, context digest, tier, and adapter session (`crates/gauntlet-domain/src/run.rs:64-92`, `role_invocation.rs:110-149`). Four focused role-invocation tests passed here. | `RunnerIdentity` is adapter configuration, not an authenticated agent (`crates/gauntlet-domain/src/values.rs:799-814`). Runs and invocations lack initiator, execution, attempt, delegation, and grant references. |
| RealityTrace | Cognate already sends stable event, correlation, causation, run, and scope fields through extensions (`docs/workflows/evidence-and-observation.md:37-50`). | Identity and authority references must be added without making RealityTrace an identity or approval ledger. A stored receipt is not proof of human intent or settlement. |
| OIDC | SEA-Forge's Go casework gateway verifies discovery, code exchange, ID-token signature, audience, expiry, and nonce, with fail-closed claim mappings (`apps/godspeed-casework-go/internal/auth/oidc.go:1-11,167-233`). | OIDC is not a shared Horizon/Cognate capability here. Its login-time kernel-standing mapping must not become permanent agent authority or require OIDC accounts for executions. |

Fifteen SEA-Forge identity-conformance tests and 56 Cognate Connect runtime-conformance tests also passed. These prove their current contracts, including the existing human-gateway semantics; they do not prove the proposed model.

## 3. Canonical identity and delegation model

### 3.1 Separate the nouns

| Concept | Canonical meaning and lifetime |
|---|---|
| **Principal** | A durable human, service, system actor, or registered agent/Expert. A registered agent has a stable identity across executions but need not hold a permanent private key or OIDC user account. |
| **Agent instance** | One incarnation of a registered or ad hoc agent. It may be ephemeral and may span several runs in a conversation. Its record can remain as evidence after its credentials die. |
| **Execution** | One logical unit of work. It has a unique `execution_id`, an agent instance, an initiator, and optionally a parent execution. It remains stable across credential rotation, restart, resume, and retry of that logical work. |
| **Attempt** | One actual dispatch or process occupation of an execution. A restart or retry creates a new `attempt_id`; it never rewrites earlier attempt evidence. |
| **Connection/session** | An authenticated channel for a human, agent, service, or device. It has its own ID, device/gateway, authentication time, and expiry. A session is not an execution and grants no human intent. |
| **Initiator** | The principal that requested the root work. This may differ from the principal whose authority is delegated and from the gateway submitting the request. |
| **Executor** | The currently authenticated agent instance/execution, service, or interactive human performing this operation. An agent executor never becomes the human delegator. |
| **Delegator / delegate** | The immediate principal or execution granting a bounded subset of authority and the agent instance/execution receiving it. Every child has its own link. |
| **Grant** | A SEA-Forge-issued bound on operations, resources, audience, expiry, budget, offline use, and redelegation. A grant is evidence of authority, not identity. |
| **Effective authority** | The intersection of the executor's own standing, every delegation link, runtime scope, and the exact operation policy. It is a set of permissions, never a person. |
| **Human verification** | Evidence about UP, UV, the credential, operation digest, and ceremony. It is not a role or an authorization decision. |
| **Approval** | A SEA-Forge decision that required human participation. It references verification evidence and exact operation preconditions. Horizon and Workbench do not keep competing approval truth. |

An ad hoc agent with one run still gets distinct instance and execution identifiers, even if they are one-to-one. This avoids a future special case when that instance receives another run. Persistent Experts have one registered principal, potentially several instances over time, many executions, and several attempts where recovery requires them.

### 3.2 Versioned context contracts

Use language-neutral schemas with TypeScript and Rust generated bindings. Do not make Gauntlet import a TypeScript package or SEA-Forge import Cognate internals. The contracts carry references and hashes, never private keys, bearer tokens, raw cookies, or secrets.

- `PrincipalRef`: URI, kind (`human | agent | service | system`), persistence (`registered | ephemeral`), tenant/trust domain.
- `ExecutionRef`: execution ID, agent-instance ID, optional registered principal, parent execution, definition/version and configuration digests, issuer, current attempt.
- `ConnectionContext`: session ID, authenticated principal or execution, device, gateway, authentication method/time, expiry. It is server-resolved.
- `DelegationLink`: delegator, delegate execution, grant reference, parent-link hash, operations/resources, audience, not-before/expiry, offline deadline, aggregate budget, remaining redelegation depth.
- `OperationContext`: operation ID and canonical digest, targets, parameters, state revisions, world/frame references, correlation/causation, idempotency key, executor, initiator, delegation head, connection, and applicable grant references.
- `AuthorityContext`: SEA-Forge decision, grant, approval, human-verification evidence, policy digest, and settlement references, each nullable when not applicable.
- `Attribution`: who proposed, modified, authorized, executed (execution plus attempt), observed, and settled. Legacy records use `unknown`; they never guess.

Store the full delegation chain once at execution admission. Events carry its head reference and hash rather than duplicating the whole chain on every event. Any resolver must reject cycles, excess depth, audience mismatch, expired links, or a child bound that exceeds its parent.

## 4. Responsibility ownership

| Responsibility | Owner | Consumers / non-owners |
|---|---|---|
| Human registration, OIDC/WebAuthn authentication, durable devices and sessions | Cognate identity service, using the shared package and SEA-Forge's OIDC donor | Horizon and Workbench consume resolved sessions; SEA-Forge receives human evidence when policy needs it. |
| Registered agent/Expert identity and ephemeral agent-instance records | Cognate; Workbench keeps Expert/Team product metadata | Gauntlet and Horizon resolve references, not registries of their own. |
| Execution and attempt issuance, key rotation, runtime cancellation | Cognate identity contract and a configured trusted issuer/broker; the default local issuer is optional | Every run gets an identity automatically. Gauntlet uses the same contracts through IPC/signed credentials. |
| Permission to use an identity for governed work | SEA-Forge `identity_minting` and identity bindings | Cognate may issue an unprivileged local identity alone; delegated or governed use requires SEA-Forge. |
| Runtime capabilities and scoped local state | Cognate policy, default deny | SEA-Forge does not replace ordinary runtime scope checks. |
| Delegation, privilege expansion, consequential authorization, governed approvals, separation of duty | SEA-Forge | Cognate submits the exact executor, delegation, operation, and evidence. Horizon cannot approve locally instead. |
| Human-participation verification | Cognate WebAuthn verifier for local decisions; SEA-Forge or its trusted verifier validates evidence for governed approvals | WebAuthn is not a grant. UI labels and client claims are ignored. |
| Trusted review of human intent | An isolated native surface or separately trusted device, reading canonical operation data from the authority | Horizon can host the interaction but must not certify isolation it does not have. |
| Durable execution history | Cognate events and Gauntlet execution records for their respective runs | Neither duplicates SEA-Forge's authority decision. |
| Independent observation and settlement evidence | RealityTrace under its own contracts | Identity fields are correlation/provenance, not a new identity ledger. |
| Shared presentation | Horizon and Workbench projections | Render verified attribution and `unknown` honestly; never infer a human click. |

## 5. Operation classification and assurance policy

### 5.1 Classify meaning, not mutation shape

The interaction model should declare each operation's effect, reversibility, resource sensitivity, ownership, external commitment, permitted executor, authority rule, human-assurance rule, and offline rule. Horizon's current three-entry `CONSEQUENTIAL_OPERATIONS` list is too small to be the universal classifier (`src/ui/surface2/grammar.ts:98-107`). Unknown or contradictory classification fails closed to the stricter applicable path. No LLM or client-supplied label participates in enforcement.

Authority and human assurance are separate axes. A consequential operation may run autonomously under a standing SEA-Forge grant; it does not automatically need a human every time. A reversible local operation may still be operator-reserved because it changes an owner's pin. Rejection, withdrawal, or cancellation may be safer than approval, but if they close a governed approval they still need the required authority record and cannot be silently committed during an outage.

| Operation class | Examples | Minimum actor/authority | Human assurance | Offline rule |
|---|---|---|---|---|
| **P0 — local presentation** | Navigation, reads, own focus, own unsaved view composition | Authenticated session or execution and local read/scope policy | None beyond session authentication | Continue from locally verified identity and cached read scope |
| **P1 — reversible collaboration** | Own annotations, drafts, agent-owned panels, ordinary layout, low-risk local run control | Authenticated executor plus explicit local scope; agents use their own identities | None by default | Existing grants only; agent work stops at the earliest freshness, grant, or credential deadline |
| **P2 — shared or operator-reserved decision** | Modify another actor's content, change an existing owner pin, answer an operator question, route a reserved decision, enrol a device | Exact operation policy; local Cognate continuation for local decisions or SEA-Forge when governed | Fresh operation-bound WebAuthn when the operation is reserved to the person; no header or click substitute | No new reserved decision while its required verifier/authority is unavailable |
| **P3 — consequential governed commitment** | External publish/send, payment, irreversible operation, credential access, privileged delegation, access-policy change | Online SEA-Forge decision and exact bounded grant at commitment, plus duplicate protection | Policy chooses none, operation-bound verification, or independent trusted confirmation | No offline authorization grace; pending work remains pending |
| **Px — unknown or sensitive** | Sensitive read, unclassified external effect, unknown reversibility or ownership | Refuse until classified; never infer P1 from a route or UI label | Determined by policy, not by convenience | Fail closed for mutations and sensitive reads |

Content submitted through an agent execution credential is agent-authored and attributable. Content submitted through a human session is **session-controlled**: the server knows the durable human on whose authority the session acts, not who wrote or caused it. Such records must say `session-authorized` and `authorship: unverified`, never `human-verified`. An agent controlling that browser can write low-risk content and cannot be distinguished; it receives no agent attribution and cannot use that path for P2/P3. A human session may perform P0/P1 without proving that each event was a personal click. Existing owner-pinned views and other explicitly human-owned controls can be P2 without making every layout change P2. Revoking an agent execution therefore cannot revoke low-risk access through a still-valid human session; the session's own policy and revocation govern it. This is the honest boundary that preserves fluid collaboration while protecting the controls whose ownership matters.

### 5.2 Assurance levels

- **A0 — authenticated session/connection:** local verification of a durable session or workload credential. Establishes the caller only.
- **A1 — authenticated execution and scoped grant:** verifies the execution, attempt, audience, and current local or SEA-Forge bounds. Suitable for autonomous work.
- **A2 — operation-bound human verification:** fresh WebAuthn UP+UV bound to a server-created pending operation. Establishes human participation in that ceremony, not comprehension of an untrusted display.
- **A3 — independently reviewed human intent:** the canonical operation is rendered by an isolated native surface or separate trusted device and then bound to fresh verification and SEA-Forge approval. Required only when policy and the threat model call for independent intent.

Horizon's current `ApprovalAssurance` is derived from an environment string (`src/ui/workspace/model.ts:108-115`). Replace that declaration with measured deployment capabilities and the evidence actually available for the operation. A deployment that cannot prove A3 must not offer an A3-labelled approval.

### 5.3 Exact operation binding

For A2/A3, the server first creates the pending operation: a Cognate continuation for a local reserved decision or a SEA-Forge approval for a governed one. There is no third Horizon proposal ledger. Canonically bind:

- schema/domain-separation version and a fresh server nonce;
- authenticated human principal, tenant, device/session, and requesting execution;
- operation kind, exact parameters, target resources, and requesting delegation head;
- relevant record/owner/state revisions, world/frame references, policy digest, and approval/continuation ID;
- issue time, short expiry, and one consumption.

The WebAuthn challenge is a domain-separated hash of that canonical record and nonce. Verify credential ownership, origin, RP ID, UP+UV, signature, sign count where supported, one-time challenge, pending record, and all preconditions again at consumption. Store enough assertion material or a trusted-verifier receipt for independent checking. Any changed parameter or revision needs a new ceremony.

A normal browser is acceptable for A2 only when the threat model accepts its review surface. A3 requires the surface to fetch and render the canonical operation directly from the trusted authority, not accept agent-authored HTML or a summary posted by the browser. A separate phone is insufficient if the same hostile desktop can also modify the local authority or the operation sent to that phone; in that case the authority must be isolated or remote as well.

## 6. Identity, delegation, renewal, and revocation lifecycle

### 6.1 Issuance and delegation

1. The trusted Cognate launcher resolves the caller from the connection, never a role or name in the request.
2. It resolves the registered agent or creates an ephemeral agent-instance record, then creates a new execution and attempt. Their IDs come from the issuer, not the agent.
3. The broker creates a short-lived credential bound to execution, attempt, issuer, audience, key, code/configuration digest, and expiry. The registered agent does not need a permanent secret. Delivery uses a protected IPC channel or broker-held key handle, not a command-line argument or a world-readable file.
4. `run.started` atomically records initiator, executor, execution, attempt, and delegation head. `startedBy` remains only the initiator. Existing run-ownership fencing remains a separate guard.
5. A child execution or privilege expansion requires a SEA-Forge grant when it exercises delegated authority. Each child narrows operations, resources, audience, time, budget, and depth. Parallel children consume from authority-enforced shared budgets rather than receiving independent copies.
6. An unprivileged local execution can start with the local issuer alone. If the local issuer is unavailable, no new execution is started; if an external OIDC provider is unavailable, existing local sessions and identities can still verify. New delegated/governed authority fails closed when SEA-Forge is unavailable.

The grant must not make the agent the human. Internally, preserve `executor = agent execution`, `delegator = immediate principal/execution`, `initiator = root principal`, and `via = gateway/service`. Authorization evaluates their intersection and records all of them.

### 6.2 Renewal, retry, resume, and replay

- Start credentials with a maximum 15-minute lifetime. Renew through the trusted broker with jitter before expiry, only while the issuer, execution, and grants remain authorized.
- Renewal keeps the logical execution ID and creates a new credential ID. A new process dispatch creates a new attempt and revokes or supersedes the old attempt credential. Reusing a run ID never reuses a credential silently.
- The PostgreSQL broker supplies the renewal rule: re-decide under current policy; anything other than allow revokes and has no fallback credential.
- Stable idempotency keys and correlation IDs survive retry. Previously recorded steps replay under their original attribution; new effects use the current attempt. An uncertain external effect enters reconciliation instead of being repeated blindly.
- A replay of historical evidence grants no authority. A fresh Gauntlet evaluation of an old frozen reference is a new execution with `parent_run`, not a resurrection of the old executor.

### 6.3 Revocation and expiry

Cognate and SEA-Forge maintain different but linked revocation facts: credentials/sessions/executions in Cognate, grants/approvals/authority bindings in SEA-Forge. Use generation/epoch checks modeled on the shared operator service, plus a connected revocation notification to brokers and runtime cancellation. Parent revocation cascades to affected child executions and grant descendants.

On revocation, stop new invocations immediately in connected components, cancel affected run signals, disable broker credentials, close or reauthenticate already-open channels, and terminate isolated workloads when required. Current Workbench terminal and browser sockets authenticate once and retain tenant/actor ownership for later input, so request-only revocation is insufficient (`src/terminal/wsController.ts:63-103`, `src/browser/wsController.ts:47-79`). Do not delete the evidence. Expired or revoked credentials receive no grace and no automatic privilege restoration. Reconnection requires revocation/grant reconciliation before further governed work.

Every governed effect uses an explicit ordering: prepare the exact operation, revalidate authority and revocation, atomically consume the approval/grant and reserve budget, acquire an effect-admission fence, then dispatch the effect. The fence carries the broker's revocation epoch and the SEA-Forge decision. Revocation before dispatch cancels the operation with no effect. Once an irreversible external dispatch has begun, the system cannot promise rollback: it records whether the result is `none`, `uncertain`, or `committed`, prevents a retry from duplicating it, and triggers a compensating action where policy permits. Revocation is complete for a connected scope only when the broker generation has advanced, active effect fences are rejected, channels are closed or reauthenticated, and uncommitted grants cannot be consumed. Disconnected completion is bounded by the offline deadlines, not claimed as immediate. An external provider that cannot participate in the final acceptance check cannot support a guarantee of revocation at commitment.

### 6.4 Offline operation

Keep two independent deadlines in addition to grant expiry: `credential_expires_at` and `authority_fresh_until`. Start the proposed five-minute offline window at the last successful authoritative validation, not at last activity, restart, or credential renewal. P0/P1 work may continue only while all applicable bounds remain valid and the operation needs no fresh decision. P2/P3 and new delegation never acquire offline grace.

Existing interactive P0/P1 sessions may continue under locally verified session rules. Previously delegated P1 work may continue for at most five minutes without fresh authority/revocation checking. A restart does not extend that deadline; monotonic-clock checks and persisted wall-clock bounds must treat detected rollback as unavailable, not as extra time.

Disconnection means immediate revocation cannot be guaranteed. Bound that exposure with short credentials, freshness deadlines, and no consequential commits. Reconnect must reconcile before resuming governed work. Losing SEA-Forge therefore disables capabilities rather than the whole application, while losing the local identity issuer prevents new executions but does not invalidate already verified low-risk sessions by itself. An unavailable organizational issuer must not be replaced silently with a different local trust root. Offline budgets must be allocated to a device or execution in advance; disconnected peers cannot enforce one shared global spending limit. Operations requiring globally current budget or revocation state stay online-only.

## 7. Trust boundaries and workload isolation

| Agent/deployment form | What identity can prove | Required boundary and residual risk |
|---|---|---|
| Brokered API agent | Issuer, execution, audience, grant, and exact attributed call | Protect the broker channel and keys. A stolen bearer token remains replayable unless sender-constrained. |
| Browser-controlling agent | Human session authentication is ambiguous; an A2 ceremony can prove participation | The page is not a trusted review surface. A3 needs an independent device/surface. Agent operations need an agent credential, not the human cookie. |
| Local process under the operator account | OS peer identity identifies only that shared account | It may read keys, sockets, files, or process memory. Per-execution credentials alone do not provide isolation. |
| Linux isolated workload | Distinct subordinate UID/GID plus namespace and Landlock controls can separate sibling workloads | Requires delegated subordinate IDs, setuid mappers, usable namespaces, and supported Landlock/socket controls. Fail closed when unavailable. |
| macOS jailed workload | App Sandbox can constrain filesystem/network for the workload | The current `Isolated` backend is Linux-only. App Sandbox is not equivalent per-UID credential or desktop isolation. |
| Windows local workload | Named-pipe SID and job-object lifecycle controls exist | `Isolated` and `Jail` are unavailable on Windows. A job object is process control, not proof of credential or desktop isolation. |
| Unrestricted desktop agent | No reliable independent local human confirmation or credential secrecy | Use enforceable OS isolation or a separate trusted device and an authority outside the agent's control. Otherwise disable A3 claims and consequential human approvals. |
| Remote hosted agent | Signed workload credential, audience, and delegation can cross a network boundary | Use mTLS/X.509 or sender-constrained tokens. The remote host's isolation is a separate deployment property, not implied by SPIFFE. |

SEA-Forge's native `Isolated` implementation is Linux-only (`crates/sea-forge-sandbox/src/lib.rs:9-20,184-200`). On Linux ARM64, Landlock ABI below 9 has no Unix-socket supervisor and must fail closed; the supervisor exists only for x86-64 (`crates/sea-forge-sandbox/src/workload.rs:148-164`). This is directly relevant to Jetson qualification. The macOS backend ad-hoc-signs a launcher with App Sandbox entitlements and can deny network, while Windows uses job objects for local process lifetime (`crates/sea-forge-sandbox/src/jail.rs:526-538`, `src/local.rs:58-70,127-155`).

Configured CI has Windows identity/pipe/job tests and macOS App Sandbox escape tests (`.github/workflows/portability.yml:53-96,99-128`). Those lanes were not executed here, so this report does not claim their current results. The kernel-security workflow also permits unavailable fallback mechanisms and skipped PostgreSQL fixtures without failing (`.github/workflows/kernel-security.yml:229-234`); release qualification must require mechanism-specific observations. The current generated TypeScript delegated-principal DTO requires a UID while Rust can emit a SID, so the new transport must use a portable discriminated principal rather than carry that mismatch forward (`workbench/packages/contracts/generated/IdentityView.ts:68-74`). Tauri is an application shell, not an isolation guarantee. Terminal confirmation is valid only if the agent cannot reach that terminal, its input/output, process memory, pairing output, or authority storage.

## 8. Protocols and interoperability

- **OIDC:** preserve the Go gateway's verified authorization-code flow and fail-closed claim mapping as a donor for human login. Map verified claims to a durable human principal, then evaluate operation authority separately. Do not create OIDC users for executions and do not treat login-time roles as permanent delegated authority.
- **WebAuthn:** reuse the shared verifier, but add operation challenges alongside registration/authentication challenges. Current `attestation: none` means the design must not claim hardware-backed authenticator properties. High-assurance policy may require attested hardware or a separately managed device.
- **SPIFFE/SVID:** adopt SPIFFE-compatible identifiers, trust-domain separation, short-lived credentials, and trust bundles without making SPIRE, Docker, or Kubernetes mandatory. Prefer X.509-SVID/mTLS for service-to-service calls. A native broker is the first-version default issuer; a SPIRE Workload API adapter is an optional distributed deployment choice, not a new runtime requirement. SPIRE's release packaging and workload attestation do not cover every target uniformly, so each platform needs a separate feasibility gate rather than a SPIRE fork.
- **RFC 8693:** use delegation rather than impersonation at token-exchange boundaries. Map the human/delegating subject, `act` executor chain, `client_id`/`azp` gateway, narrowed scope, audience, expiry, and execution claims explicitly. Internal authority still evaluates the richer delegation links. Any JWT used across an untrusted channel should be sender-constrained; bearer `act` claims alone do not prevent replay.
- **Connect, AG-UI, MCP, A2A:** each adapter resolves an `AuthenticatedContext` at its own boundary and maps it to the same runtime contract. Tool arguments, A2A message metadata, forwarded props, and MCP client fields cannot override it. A2A security advertisements must match actual authentication.
- **SFWP:** retain the current human-gateway contract only for a human-only gateway under a distinct OS principal the agent cannot control, and disable it where the principal is shared. Add a versioned agent-executed contract with executor, execution/attempt, delegation head, credential, and grant. Never reinterpret old `on_behalf_of` records, and never allow new governed work to fall back to the legacy path after the new contract exists. SEA-Forge verifies the credential and exact grant independently on every governed call.

Authentication at one boundary is never authorization at the next. The receiving service validates issuer, trust domain, audience, expiry, key confirmation, revocation/freshness, and operation scope before using the propagated identity.

Standards consulted: [RFC 8693 §§1.1, 4.1 and 5](https://www.rfc-editor.org/rfc/rfc8693.html), [SPIFFE concepts](https://spiffe.io/docs/latest/spiffe-about/spiffe-concepts/), and [W3C WebAuthn Level 3](https://www.w3.org/TR/webauthn-3/). SPIFFE is a specification family; SPIRE is one implementation. WebAuthn signs challenge and client/authenticator data for an RP, not a human-readable transaction review.

## 9. Evidence, provenance, and shared interaction

Cognate's event envelope gains typed identity and authority references in metadata. `run.started` carries the root execution and delegation head; invocation events carry execution, attempt, grant, decision, and approval references. Credential material remains excluded from events, artifacts, traces, cognitive indexes, and snapshots.

SEA-Forge remains authoritative for decisions, grants, approvals, and its delegation audit. Its new audit record names executor, initiating/delegating principals, gateway, execution, attempt, grant, and operation digest. Separation of duty must name the principal from whom independence is required: an agent submitting work is not automatically the human requester, and an owner confirming their own reserved action is not the same case as an independent second-human rule.

Gauntlet adds the same context to `RunDefinition` and `RoleInvocationDefinition` and to their durable records. Keep `run_id`, execution ID, invocation ID, and attempt ID distinct. `runner` stays adapter configuration and `session_ref` stays adapter forensic data. A role invocation is a child execution or explicitly linked sub-execution; a runner retry is a new attempt. Gauntlet checks current grants at dispatch and records evidence but never mints identities or approvals.

RealityTrace receives these fields through the existing correlation extension path. It can independently report what was observed and settled. It cannot certify human comprehension, manufacture missing authority, or turn a replay into the original execution.

Horizon and Workbench should display separate **proposed by**, **modified by**, **authorized by**, **executed by**, and **settled by** fields, with `via` gateway and evidence references. Content from an agent execution stays agent-attributed. Content from a human session is shown as session-controlled with authorship unverified, including when an agent may have used that browser. Human-owned decisions show the evidence level actually present: session, operation-bound UV, or independent review. Legacy and ambiguous records show `unknown`, not a human name guessed from a cookie.

The same runtime policy applies to TUI, GUI, CLI, MCP, and A2A. Agent-owned presentation remains fluid when submitted through an agent identity. Existing owner pins and reserved layout decisions use P2 when policy requires human proof. A low-risk browser write authorized only by session must never be rendered as a verified personal human action or as verified agent authorship.

## 10. Minimum changes by project

### Cognate

- Consolidate `@godspeed/identity` as the identity contract and reference implementation: durable human, registered agent, ephemeral agent-instance, execution, attempt, session, credential, and revocation records. Keep product policy outside it.
- Add a language-neutral `AuthenticatedContext` and `ExecutionIdentity`, with issuer-qualified IDs, authentication provenance, audience, authentication/session references, delegation reference, and expiry. Preserve `Principal`/`Caller` compatibility through adapters rather than silently widening old fields.
- Make `startRun` derive the execution identity on the server; separate `startedBy` from executing actor; propagate the context through `RunContext`, nested invocations, continuations, protocol adapters, events, and recovery.
- Add a trusted local issuer/broker with short-lived credentials, renewal, cancellation, revocation epochs, and protected IPC. It must be replaceable by a configured issuer; it is not a new account database or workflow engine.
- Bind operations to a canonical digest and pending continuation for local reserved decisions; reference, do not duplicate, SEA-Forge approvals.
- Add an explicit shared-budget/freshness contract for delegated work and keep credentials out of events, logs, indexes, and child process environments.

### SEA-Forge

- Add a versioned agent-executed delegation contract that preserves executor, execution/attempt, delegator, initiator, gateway/service, grant chain, exact operation, and evidence. Retain the legacy human-gateway meaning only under its old version; do not reinterpret existing ledger records.
- Keep `identity_minting` as an authority action for authenticated workload or delegation issuance. Separate identity proof from grant evaluation and validate both independently.
- Extend grants with audience, resource/operation set, parent link, shared aggregate budget, offline allowance, redelegation/revocation relationships, and durable consumption. A child may only narrow the parent.
- Extend approval validation with human-verification evidence and operation/world/revision binding, while preserving existing exact-action, one-use, and separation-of-duty checks. Make the separation-of-duty subject explicit.
- Generalize the PostgreSQL broker's renew/revoke/reap pattern to a common broker contract, including connected revocation and reconnect reconciliation. Preserve per-resource brokers where their native controls are stronger.
- Replace platform-conditioned UID-only delegated DTOs with a portable discriminated principal and capability fields. Keep production readiness honest: the private-connection path is not generally exercised by the production executable today.

### Cognate Workbench

- Migrate its `auth:identity:v1` / `wbs1.` ledger into the shared identity service with a specified conversion or explicit invalidation of sessions. One writer after cutover. Preserve operator generations, revoked devices, and tenant mapping; rollback must not reactivate revoked sessions.
- Map Expert IDs to registered agent principals and each assignment execution to an independent execution/attempt. The completion bridge remains a scheduler/continuation bridge, not the authenticator.
- Replace caller-kind checks for approvals with the verified human-assurance context. Do not assume a `user` kind means fresh human participation.
- Apply revocation to open terminal/browser WebSockets and active runs, not just future HTTP requests.

### Horizon

- Remove the security meaning of `x-horizon-source`. Use a separately authenticated agent channel or execution credential for agent operations; never infer an agent from a page header. A browser session controls only what its policy permits and remains labelled session-authorized.
- Add operation classification to the interaction model and derive route/assurance checks from it. Replace the three-entry consequential list as the only source of meaning.
- Reuse the phone remote as a candidate A3 surface: WebAuthn per operation, canonical operation fetched from the authority, one-use challenge, exact revision/parameter binding, and no terminal requirement for ordinary A2 decisions.
- Keep owner pins, reserved layout controls, and human-owned decisions protected by exact owner/authority checks. Submit agent content through the agent identity when agent authorship is claimed; a human-session write is labelled session-controlled and authorship-unverified.
- Store human verification and authority references through Cognate/SEA-Forge; Horizon displays them and stores no competing approval authority.

### Gauntlet

- Add a runtime-written external binding record for tenant/principal, execution/generation, run, durable attempt, invocation, frozen reference identity/digest, delegation/grant references, and evidence references. Keep it versioned and outside `role_result@v1`'s strict runner document; old runners remain readable at their old contract.
- Add a durable attempt ledger instead of reconstructing limits from evidence counts, and keep `RunId`, execution ID, invocation ID, and attempt ID separately typed.
- Preserve frozen references and existing settlement/verification responsibilities. Gauntlet consumes identity and authority; it does not issue either.
- Keep runtime attribution only in the protected execution record. The comparison/critic envelope contains no builder identity, attempt trajectory, or other denied field, unconditionally under the current Gauntlet answer key. A policy exception would require an explicitly approved governing-contract revision, not a deployment flag.

### RealityTrace

- Ingest identity/authority references in extensions and report only what it observes. It remains independent evidence, never an identity registry or approval store. Proof level, provenance, and limits remain explicit.

## 11. Migration sequence

**Stage 0 — contract decisions and baseline markers (no security claim).** Freeze the identity/delegation schema, issuer ownership, operation classes, assurance matrix, offline envelope, version negotiation, and rollback rules. Record that current `x-horizon-source`, session-only approvals, and human-only `on_behalf_of` are insufficient for the proposed guarantee. Keep the frozen Horizon spec hash untouched; a normative change goes through a new spec revision and plan rebind.

**Stage 1 — shared identity foundation.** Promote the operator/device/session package into Cognate, with adapters that preserve existing IDs and one authoritative writer. Add agent/instance/execution/attempt issuance and versioned context propagation. Prove restart, continuation, nested invocation, and protocol propagation before granting any new authority.

Pre-migration Cognate runs, recovery queues, queued outbox deliveries, and open continuations become `legacy/unbound`. They remain readable. A run may resume only with an explicitly rebound execution identity and current authority; otherwise it may complete internal read-only or deterministic replay work but must not perform a new capability, external effect, continuation resolution, or governed approval. Historical `startedBy` is displayed as legacy provenance and is never passed to a capability as a newly authenticated actor. Existing approvals are revalidated or left pending, never treated as consent to a rebind. Migration records the exact cutoff and preserves uncertain external-effect reconciliation. Rollback refuses new identities and unbound work rather than reviving old authority.

**Stage 2 — SEA-Forge authority bridge.** Implement the versioned agent-executed contract, bounded grant chain, shared budgets, renewal/revocation, and exact operation binding. The legacy human-gateway path is limited to a human-only gateway under a distinct OS principal; disable it wherever an agent can share that principal, including through the operator's browser session. No mixed-version request may fall back to human effective actor or to the gateway service.

**Stage 3 — Gauntlet binding.** Add the external binding record and attempt ledger before process launch; extend controller resume, delegation, and PostgreSQL migration/codec paths. Old runs become `legacy/unbound` for inspection; new consequential work requires explicit rebinding, never invented identity.

**Stage 4 — consumer migration.** Migrate Workbench sessions/Experts and Horizon operator mappings and agent doors. Cut over one writer at a time. Existing sessions are migrated only if their generation and revocation state are preserved; otherwise invalidate and require reauthentication. Horizon's header is downgraded before the new agent channel is relied on.

**Stage 5 — qualification.** Run real-boundary and platform tests with required fixtures forced to execute. A skipped isolation or PostgreSQL prerequisite is unqualified, not green. Only then can the deployment advertise the corresponding assurance and offline capability.

Rollback is capability-scoped. Old code may inspect new records only if it understands their version. It must refuse new authority, execution, or offline work rather than map unknown identity to a legacy principal. Revocation and generation barriers survive rollback.

## 12. Adversarial conformance tests

These are acceptance tests for the future implementation; none is claimed passing now. Every negative test must also prove the side effect did not occur, not merely that an error was returned.

| Area | Attack or ambiguity | Required observation |
|---|---|---|
| Identity | Same Expert, two executions, then a retry and restart | Distinct execution IDs; distinct attempt IDs where applicable; credential rotation preserves execution correlation; old attempt cannot act |
| Identity | Ad hoc agent with no account; forged agent name/role/header; Connect/MCP/A2A body claims | Ephemeral instance exists without OIDC user; forged fields cannot become `Caller`; all entry points resolve the same server-built context |
| Attribution | Swap tenant, principal kind, initiator, executor, gateway, execution, attempt, run, invocation, world, or producer one at a time | Each mismatch is typed and refused without effect; historical `startedBy` never becomes a fresh credential |
| Delegation | Child asks for a wider role, operation, resource, audience, expiry, budget, or depth; foreign parent; malformed delegation | Child is refused; no fallback to service/human actor; valid siblings remain unaffected |
| Execution | Agent uses another execution's credential; token replay at another audience; copied bearer in child environment | Audience/issuer/subject/holder checks refuse; credentials absent from environment/logs/evidence; cross-process tests use real stores |
| Human proof | Header says human; click event says human; valid session replays an old WebAuthn assertion; wrong user/credential/origin/RP/challenge/sign count | Only the operation-bound fresh ceremony passes; all replay and substitution cases refuse |
| Human proof | Operation parameters, target, owner revision, frame/world, approval ID, or delegation head changes after ceremony | Ceremony is invalid; no commit; new ceremony required |
| Human proof | Passkey is backed up/synced or `attestation: none`; agent controls the page or desktop | Evidence is labelled at its true level; A3 is unavailable or requires an independently trusted surface/device |
| Human proof | Agent controls/forwards the trusted device, or local authority is modified by the desktop | Deployment refuses the assurance claim; separate device alone does not create independence from a compromised authority |
| Approval | Same human via another session/gateway self-approves; two approvals consume concurrently; old approval replayed after expiry/revocation | Separation of duty applies to the named subject; exactly one consumption; replay refused |
| SEA authority | Offline/unavailable/corrupt authority at admission, before effect, and after approval | No P3 effect; pending remains pending; no old decision authorizes a changed operation; evidence records unknown/unavailable |
| Revocation | Revoke after authorization but before dispatch, after effect-admission fencing, while a socket is open, or during retry | Pre-dispatch revocation produces no effect; in-flight irreversible work becomes `uncertain` and is reconciled/compensated, never reported as clean cancellation; channels close; connected completion has a measured bound and disconnected work stops at its deadline |
| Renewal | Renew after grant consumption, revocation, clock rollback, stale cache, or issuer outage | Renewal refused or revoked; old credential no longer works; budgets/approvals are not reset; no fallback secret |
| Offline | Restart, sleep, copied lease, new device, shared budget exhausted, reconnect with changed policy | Offline window does not reset; shared limit is pre-allocated; new authority fails closed; reconnect reconciliation precedes execution |
| Replay/recovery | Crash before spawn, after external effect, before result persistence, during settlement; replay recorded steps | Uncertain effect is reconciled; no duplicate commitment; replay never reuses execution permission; attempt attribution remains truthful |
| Evidence | Tamper with event metadata, decision, grant, approval, identity binding, Gauntlet binding, or observation | Independent verification rejects; legacy unknown stays unknown; no subsystem invents missing authority |
| Migration | Resume pre-cutover Cognate run/continuation/outbox/approval; old `startedBy` requests a capability; rollback | Legacy work cannot acquire new effects or approval without explicit rebinding; old metadata never becomes a fresh authenticated actor; revoked/unknown remains refused |
| Interoperability | Connect/AG-UI/MCP/A2A cross a boundary with a valid identity but no grant; OIDC role changes; token-exchange audience mismatch | Authentication alone does not authorize; role/audience is re-evaluated; no external dependency is required for unrelated local reads |
| Platform | Linux sibling workload attempts key/socket/process access; Landlock below ABI 9; ARM64 Jetson; Windows pipe SID spoof and job escape; macOS jailed workload; same-user WSL/SSH | Only platform-supported guarantees pass; unavailable mechanisms refuse rather than degrade; tests report actual execution |
| Critic isolation | Critic receives builder identity/attempt trajectory; audit needs attribution | Critic envelope unconditionally rejects any denied identity field; protected audit record retains attribution outside the critic context |

Test suites should span the existing real boundaries: shared identity package tests, Workbench auth journeys, SEA-Forge identity/delegation/approval tests, Cognate Connect/runtime conformance, and Gauntlet recovery/settlement tests. Existing skips remain unmet prerequisites. Add a cross-stack live test with a real issuer, SEA-Forge, Cognate runtime, Horizon operation, and Gauntlet run; a fake wire cannot establish the end-to-end claim.

## 13. Operational cost and extensibility

The expensive checks occur per authentication, execution admission, renewal, and governed effect, not per event. Local credential/trust checks can avoid network calls on every read. Round trips occur at roughly execution admissions per credential lifetime plus active grants per freshness interval; revocation notifications add bursts. Jitter renewals and revalidations, cap retained command/event state, and share one change notification instead of polling identity and workspace state once per open stream. Horizon's current per-second stream poll and in-process command maps are examples to replace (`src/remote/server.ts:147-153,464-490`).

Do not claim a runtime-overhead number before measurement. Measure issuer/broker latency, credential verification, memory per execution, renewal failure rate, revocation propagation, open-channel closure, approval ceremony latency, and offline reconciliation. No LLM belongs on the enforcement path.

Add `traceparent` or equivalent transport tracing alongside durable correlation, but never use a trace ID as authority. Emit identity-free metrics for authentication outcomes, authority disposition/latency, renewal failures, revocation lag, confirmation expiry, and reconciliation. Use bounded reason codes internally while keeping externally indistinguishable authentication refusals. Identity IDs are not metric labels.

Use one refusal shape across surfaces: reason code, failing boundary, affected operation, missing/expired prerequisite, side-effect status (`none | uncertain | committed`), and next lawful action. “Approval required” is wrong when the actual cause is an unmapped principal, expired grant, unavailable authority, or insufficient confirmation surface.

New apps consume the same schemas and adapters. New agents need registration or ephemeral issuance, not a new identity mechanism. New protocols authenticate at their boundary and map into the context; they do not define authority. New deployment modes add trust domains and issuer adapters, not new principal semantics.

## 14. Alternatives considered

| Alternative | Why not chosen |
|---|---|
| Put all identity and approval in SEA-Forge | Couples ordinary authentication to consequential authority and duplicates application identity/session needs. SEA-Forge remains the independent authority, not the account directory for every local run. |
| Let Cognate issue all authority as well as identity | Creates two governance authorities and lets the runtime enlarge its own grants. Cognate may prove identity; SEA-Forge decides bounded authority. |
| Inherit the initiating human as the executor | Current behavior is simple but makes every agent look human and loses agent accountability. It cannot express attenuation, revocation, or independent execution identity. |
| Keep Horizon agent bearer keys as the main agent model | Long-lived caller-selected keys do not distinguish executions, retry attempts, or delegation and are opaque under a shared OS account. They can be a registered-agent enrollment donor, not the execution credential. |
| A dedicated new identity service/daemon | Adds operations and a new trust root before evidence requires it. Start with a shared contract and a default local issuer; allow a configured service later. |
| SPIRE as a mandatory dependency | Provides strong SVID concepts but adds platform, installation, and operational constraints that do not fit every local-first target. Adopt compatible semantics and keep SPIRE optional. |
| RFC 8693 token exchange on every local call | Adds token-service hops to local collaboration and does not itself define operation authority. Use it at external/delegated boundaries and preserve the richer internal chain. |
| WebAuthn for every mutation | Confirms authenticator participation, not intent, and adds friction where session policy is sufficient. Use proportional assurance. |
| Confirm only on the desktop page or terminal | Both fail against an agent that controls that surface. Use A2 only when the page is trustworthy; use A3 where independent review is required. |
| Keep approval in every subsystem | Creates competing records and ambiguity about which one is authoritative. Reuse Cognate continuations locally and SEA-Forge approvals for governance. |
| Treat Gauntlet's runner/model IDs as principals | They are adapter/model metadata. Using them as identity would fake authentication and misstate provenance. |

## 15. Limitations and open decisions

1. **Threat model:** the owner must choose which adversary each deployment resists: naive header-omitting agent, browser automation, same-user process, unrestricted desktop, stolen device, local administrator/root, or remote host compromise. A3 without enforceable isolation is only a label.
2. **Local trust-root custody:** the design requires platform-specific protection for issuer keys (TPM/DPAPI/Keychain or a segregated service account). No such implementation was inspected. A `0600` file under the agent's OS account is not an isolation boundary.
3. **Independent surface:** the phone remote is a candidate, not proof. Its WebAuthn currently opens a session and `attestation: none` does not establish authenticator hardware. A3 needs per-operation binding, canonical authority-sourced display, isolated/remote authority, and platform validation.
4. **Human intent:** WebAuthn cannot prove comprehension. Synced/backed-up passkeys can move between devices. Policy must state what A2 means and when only A3 is acceptable.
5. **Platform guarantees:** Linux per-workload isolation depends on host facilities and ARM64 fallback limits; Windows lacks the isolated/jail backend; macOS App Sandbox is not per-UID workload identity. Tauri and WSL do not remove those limits without separate evidence.
6. **Offline revocation:** disconnected immediate revocation is impossible. The five-minute low-risk window and 15-minute credential maximum are proposed policy values, not measured safety thresholds. Clock rollback and copied leases require explicit mechanism tests.
7. **Budget semantics:** offline shared budgets require pre-allocation. Multi-device enforcement cannot be globally current while disconnected; such operations must stay online.
8. **Versioning:** Horizon/Cognate 0.9, Workbench/Cognate 0.8, the vendored identity package, SFWP, A2A, Gauntlet result contracts, and persisted ledgers need a supported compatibility matrix and negotiation rules. A mixed-version fallback must never widen authority.
9. **Gauntlet strict result codec:** `role_result@v1` rejects unknown fields and old runners cannot be changed in place. Use the external binding record or negotiate a new result version; do not append untrusted identity claims to v1.
10. **SEA-Forge production wiring:** `run_authenticated` and private connection issuance are not exercised by the normal production executable. The design reuses the mechanism, not an unproven deployment.
11. **Availability policy:** the exact offline window, renewal cadence, grant budgets, delegated depth, and approval expiry need owner approval after measured operational trials.
12. **Human-reserved operation catalog:** the precise P2 set must be derived and reviewed per operation in `.sea`; the examples here are design guidance, not specification.
13. **No implementation or security qualification:** this report is a design. No issuer, delegation protocol, operation-bound assertion, platform isolation guarantee, or cross-stack live test has been implemented or passed.

## 16. Investigation evidence

Focused tests actually run against the recorded worktrees:

| Area | Command (repository root) | Observed result |
|---|---|---|
| Horizon WebAuthn, pairing, sessions, agent/human boundary | `bun test test/remote-webauthn.test.ts test/remote-pairing.test.ts test/remote-sessions.test.ts test/desk-write-token.test.ts` | 42 pass, 0 fail |
| Shared operator identity | `bun test packages/identity/test` in the shared-identity worktree | 36 pass, 0 fail |
| Workbench auth and WebAuthn | `bun test test/J-AUTH-SESSION.test.ts test/J-AUTH-TENANT-ISOLATION.test.ts test/J-AUTH-REBIND.test.ts test/remote-webauthn.test.ts` | 17 pass, 0 fail, with HEAD `65510bb...` unchanged before and after |
| Cognate Connect runtime conformance | `bun test packages/protocol-connect/test/service.test.ts` | 56 pass, 0 fail |
| SEA-Forge identity conformance | `cargo test --locked -p sea-forge-server --test conformance_identity` | 15 pass, 0 fail |
| SEA-Forge legacy delegated identity | `cargo test --locked -p sea-forge-server --test sfwp_delegated_identity` | 9 pass, 0 fail |
| Gauntlet role invocation domain | `cargo test --locked -p gauntlet-domain role_invocation` | 4 pass, 0 fail in the filtered suite |

These are source-level and focused contract observations, not full `just verify` runs and not cross-stack, live-issuer, live-authority, Windows, macOS, WSL, SSH, or Jetson evidence. Workbench advanced concurrently during review: source reviewers inspected `32582af...`, and the final 17-test run was bound to `65510bb...`, unchanged before and after that run. No implementation file, specification, or frozen hash was changed.

Six fresh-context Goldfish reviews were requested. Native subagent dispatch hit provider rate limits; the same six lenses were rerun as independent ephemeral Codex processes, each instructed to read its EGM persona and standard, with no parent transcript. Design, codebase-details, zoom-out, comprehension, implementation-readiness, and structural reports completed. Their objections were incorporated above, notably contract-versus-daemon ownership, open-channel revocation, durable attempt records, strict codec migration, per-device offline budgets, platform capability matrices, and the difference between authentication assurance and ledger assurance. A final fresh review of this artifact follows before delivery.

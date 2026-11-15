# Unified human and agent identity, delegation, and authority

**Status:** coherent candidate predecessor ready for formal drafting; owner selected S1 as the initial browser-agent profile and preserved S2 for hostile desktop/local-process deployments; 15-minute credentials and five-minute low-risk offline continuation are owner-selected provisional defaults subject to measurement; issuer topology and the exact operation catalog remain design choices in U1–U6; focused contradiction and owner-synchronization checks returned `ACCEPT` on the reviewed versions, with manifest/evidence linkage added after the last check; not implemented  
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

### Acceptance condition and trust profiles

The owner selected S1 as the initial browser-agent profile and preserved S2 as the stronger required profile for hostile desktop or same-user process deployments. That selection defines the target, not an implementation claim. The design must remain usable under S1: ordinary collaboration stays available, while only operations whose required evidence is unavailable are refused.

- **S1 — browser-controlling agent:** defend against an agent that controls an authenticated browser or page, omits caller labels, replays credentials/approvals, or attempts to submit an ordinary browser request as a human decision. S1 does not claim to resist an arbitrary hostile process running as the operator; that is S2. The issuer and operation authority must still hold their keys and make decisions outside code or files that the browser agent can control.
- **S2 — hostile local process:** additionally defend against a local process that can read ordinary operator files, inspect same-user processes, automate the desktop, or intercept the operator's authenticator path. The issuer, SEA-Forge authority, and confirmation service must be outside that adversary's security boundary, with enforceable workload separation and an independently trusted confirmation device.

Neither profile claims to resist compromised kernel/root or administrator, a compromised issuer or authority host after compromise, a malicious or cloned authenticator, physical coercion, or a human who intentionally approves the wrong thing. Those require separate controls. S1 is not a claim that a hostile same-account process is safe.

**Usable human authorization under S1.** Because S1 assumes the page may be agent-controlled, an A2 ceremony on that page can prove authenticator participation but cannot prove that the human reviewed the true operation. S1 therefore uses this split:

- P0/P1 reads, navigation, ordinary layout, drafts, and agent-owned reversible work remain available under their normal session/execution policy.
- P2/P3 human-reserved decisions require **A3**: a confirmation channel that receives the canonical operation directly from the protected authority, displays it without an agent-controlled renderer, obtains fresh operation-bound verification, and is the only path that creates the pending verification. A3 has two candidate evidence classes: **A3-UV** WebAuthn UP+UV, and **A3-T** protected-terminal presence. A3-T is not WebAuthn or user verification and is usable under S1 only where policy explicitly accepts that weaker class; it never satisfies a WebAuthn/UV requirement. A paired phone, a protected terminal, or an isolated native surface can satisfy A3 if that channel is outside the S1 browser adversary's control. The channel and evidence class are candidate mechanisms; the property is mandatory.
- P3 still requires online SEA-Forge authorization. A3 establishes human participation in an exact human-reserved decision; it does not grant authority. Bounded autonomous P3 execution uses the existing SEA-Forge grant and does not require A3 unless policy requires human participation for that operation.
- A2 on a browser page is not sufficient for a human-reserved P2/P3 decision under S1. A2 remains usable for authentication or for operations where policy establishes that the page is outside the agent's control.
- If no A3 channel is available, human-reserved P2/P3 decisions are refused; P0/P1 and P3 work already inside a valid bounded grant remain available. The product must say which reserved action is unavailable and how to restore a trusted channel; it must not pretend the signed-in session is human authorization. This blocks reserved decisions, not ordinary collaboration.
- S2 does not redefine A3. It tightens the required channel: a local terminal or same-desktop native surface is not independent if the S2 adversary can automate it. A separate trusted confirmation device is required; an independently isolated service may hold or verify authority, but it cannot substitute for the human review surface itself.

**Issuer security property.** A trusted component must exclusively hold and use issuer signing/key material; the agent must not be able to read, export, replace, signal, or inject code into that component. Enrollment, recovery, and trust-root rotation require a human or SEA-Forge authorization that does not depend on the agent's claim. The property matters more than the topology. Candidate implementations are: reuse the existing SEA-Forge service principal and protected socket/named-pipe channel; reuse another already-isolated host service; or add a dedicated issuer only if those cannot satisfy the property. No new daemon is mandated by this report.

**Issuer compromise:** the trust root can issue false identities, so recovery requires trust-root rotation, revocation of the issuer generation, invalidation of its credentials and grants, re-enrolment of agents/devices, and preservation of evidence with a compromised-issuer marker. Naming TPM, DPAPI, or Keychain does not settle which process may use the key.

**Legacy gateway:** the current SEA-Forge human-gateway path does not authenticate the target human's participation. It may remain for a human-only gateway running under a distinct, non-agent-controlled OS principal, and must be disabled wherever an agent shares that principal. Once the agent-executed contract exists, no new governed work may fall back to the legacy path; old records remain versioned history.

A deployment that has not selected a profile and demonstrated its required channel may run low-risk local work, but must not claim authenticated agent attribution, immediate revocation, or independent human confirmation.

## Consolidated drafting context

This report and the [concepts brief](2026-11-08-unified-human-agent-identity-concepts-brief.md) form one predecessor context for formal design. They have separate jobs and no competing decisions:

| Fact or decision | Single owner |
|---|---|
| Product problem, value, goals, non-goals, alternatives, candidate decision summary | Concepts brief |
| Canonical identity model, ownership boundaries, assurance levels, operation binding, lifecycle, offline and revocation rules | This report, sections 2–8 |
| Source capability findings, gaps, and evidence status | This report, section 2 |
| Reusable contracts and presentation semantics | This report, sections 3–4 and 9 |
| Per-project changes, migration, rollback, and adversarial acceptance tests | This report, sections 10–12 |
| Operational cost, alternatives, limitations, owner gates, and retained evidence | This report, sections 13–17 |

The concepts brief is the readable transfer layer: it states the problem and decisions without redefining mechanisms. This report is authoritative where a technical detail or acceptance rule is at issue. The best approaches retained from both are: proportional assurance; stable agent identity with distinct ephemeral instances, executions, and attempts; agent-preserving delegation; session-controlled authorship honesty; effect-bound revocation ordering; S1/S2 deployment honesty; isolated human-gateway compatibility; legacy/unbound migration; unconditional critic blindness; and evidence-linked tests and reviews.

## Decision status and evidence labels

The owner accepted the architectural direction and selected S1 as the initial threat profile while preserving S2. That is not approval of a process topology, policy constant, or implementation mechanism. Every substantive statement below has one of these statuses:

- **Fact:** observed in source, a focused test, or the named host inspection.
- **Constraint:** an accepted environmental, evidence, or governance limit.
- **Owner decision:** a direction or policy bound chosen by the owner for the design, not an implementation approval.
- **Candidate decision:** a design choice carried into `/egm-draft` for evaluation; it may change before approval.
- **Open decision:** genuinely unresolved and requiring an owner or design choice.

| ID | Status | Statement |
|---|---|---|
| F1 | Fact | Cognate reconstructs a run actor from `startedBy`; it does not create an independent executor identity. |
| F2 | Fact | Workbench Expert runs are started through the system caller and are not independently authenticated as Experts. |
| F3 | Fact | SEA-Forge's existing `on_behalf_of` path records the end user as the effective actor and is not agent-preserving. |
| F4 | Fact | Horizon's `x-horizon-source` header is caller-controlled; phone approval uses the signed-in session without fresh operation binding. |
| F5 | Fact | The inspected Jetson runs Ubuntu 22.04 on `5.15.185-tegra` aarch64; Landlock is absent from the active LSM list, its version syscall returns `ENOSYS`, and `newuidmap` is missing. SEA-Forge `Isolated` prerequisites are not met there. |
| F6 | Fact | Focused existing tests pass at the retained commits; they do not establish live cross-stack or platform security qualification. See section 17. |
| C1 | Constraint | The product targets native Windows x64, macOS x64/arm64, Linux x86-64, and Linux ARM64/Jetson, with bounded local-first operation and no mandatory Docker, Kubernetes, or SPIRE. |
| C2 | Constraint | The identity contract must interoperate across platforms independently of whether a platform can enforce workload isolation. |
| C3 | Constraint | Pending and committed authority must remain authoritative in Cognate continuations and SEA-Forge approvals; Horizon and Workbench do not create competing records. |
| C4 | Constraint | Gauntlet's critic comparison envelope remains unconditionally free of builder identity; attribution stays in protected audit records. |
| C5 | Constraint | Human-session content has unverified authorship and cannot later become proof of human intent merely by crossing a workflow boundary. |
| C6 | Constraint | A platform may claim only the security properties its measured mechanisms enforce. Unsupported isolation does not prevent identity issuance or attribution. |
| D1 | Owner decision | Cognate owns the language-neutral identity contract, default local issuer integration, and runtime propagation; SEA-Forge owns bounded delegation and consequential authority. Minimum issuer topology remains U1. |
| D2 | Candidate decision | Registered agents retain stable principals; ephemeral instances, logical executions, and process attempts have separate identities. |
| D3 | Owner decision | Operations use P0–P3/Px classes and A0–A3 assurance, with assurance derived from authority and deployment capability rather than mutation. Exact mapping remains U2. |
| D4 | Candidate decision | Local reserved decisions use Cognate continuations; governed decisions use SEA-Forge approvals; WebAuthn binds to those exact records. |
| D5 | Owner decision | Horizon's interim containment refuses human-reserved browser actions without a trusted per-operation confirmation path while retaining low-risk interaction; it precedes full cross-stack migration. |
| D6 | Candidate decision | Pre-migration Cognate and Gauntlet work is `legacy/unbound` and cannot acquire new effects without explicit rebinding. |
| O1 | Owner decision | S1 is the initial browser-agent profile. S2 remains the required stronger profile for hostile desktop or same-user process deployments. S1 never claims protection on an S2 surface. |
| O2 | Owner decision | Prefer existing trusted Cognate/SEA-Forge infrastructure over a new daemon. The issuer must prevent agent-controlled processes from using or replacing signing authority; the minimum process/service topology remains U1. |
| O3 | Owner decision | Adopt P0–P3/Px classified from semantics and authority. P3 requires SEA-Forge authorization but not universal human confirmation when bounded delegation permits autonomous execution. Exact operation mapping remains U2. |
| O4 | Owner decision | 15-minute execution credentials and five-minute low-risk offline continuation are provisional design defaults, subject to measurement; they do not create authority. |
| O5 | Owner decision | Prefer operation-bound WebAuthn through an independent trusted channel. A3-T protected-terminal presence is weaker and never equivalent to WebAuthn/UV. Exact surfaces remain U3. |
| O6 | Owner decision | Preserve one identity contract across Windows x64, macOS x64/arm64, Linux x86-64, and Linux ARM64/Jetson; qualify workload isolation separately. |
| O7 | Owner decision | Preserve separate guarantees for stopping admission, preventing dispatch, and preventing external commitment. A resource that cannot check revocation-aware authority at commit cannot promise commitment prevention. |
| O8 | Owner decision | Restart, clock rollback, renewal, and revocation cannot create new authority. Uncertain operations are reconciled, not treated as cancelled. |
| U1 | Open decision | Which existing trusted process or service hosts the issuer and protected key material, and what is the minimum topology per supported platform? |
| U2 | Open decision | Exactly which operations are P0, P1, P2, P3, or Px, and which P2 operations require A3-UV rather than A3-T? |
| U3 | Open decision | Which independent confirmation surfaces are qualified for S1 and S2, and how are pairing, loss, and recovery handled without creating authority? |
| U4 | Open decision | Which grant budgets, delegation depth, approval expiry, and revocation-propagation targets are supportable after measurement? |
| U5 | Open decision | What contract-conformance and platform-security qualification tests are required per release, including Jetson identity with `Isolated` unsupported? |
| U6 | Open decision | Which evidence fields may each subsystem retain without duplicating authority or exposing credentials or private content? |

The thematic sections below retain the accepted architectural direction. Owner decisions O1–O8 are fixed constraints for drafting; this report may refine mechanisms but cannot contradict them. Mechanism details that remain unresolved are tracked as U1–U6.

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

### 3.3 Standing, delegated authority, and authorization are different

**Standing** is durable eligibility: a registered agent exists, is active, belongs to a trust domain, and may hold named roles or capabilities. **Delegation** is a bounded SEA-Forge grant made to one execution, derived from a delegator that already holds the authority and narrowed to operations, resources, audience, time, and budget. **Authorization** is the operation-time decision using current policy, revocation, state, and evidence. None is interchangeable with the others.

An agent's standing never authorizes a specific operation, and being listed as eligible never places authority in its execution. Effective authority is the intersection of the agent's own eligible capabilities, every delegation link, runtime scope, and the exact operation rule. A gateway's standing lets it submit a request; it does not lend that standing to the represented agent. A model's role name, runner identity, or presence in an allowlist is not authority.

Session-controlled, authorship-unverified content is the weakest evidence. It may inform a human or be shown as a proposal, but it cannot be passed into another workflow as a human decision, can never satisfy a P2/P3 human-assurance rule, and cannot create, widen, or renew a delegation. Downstream systems must receive a typed `observed_session_content` record (or equivalent) that preserves `authorship: unverified`, not a generic `human_decision`. If a new delegation is required, the human must give fresh verified participation and SEA-Forge must issue the grant; provenance conversion at a boundary is an authority-laundering defect and must be refused.

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
| **P2 — shared or operator-reserved decision** | Modify another actor's content, change an existing owner pin, answer an operator question, route a reserved decision, enrol a device | Exact operation policy; local Cognate continuation for local decisions or SEA-Forge when governed | A3 under S1; A2 only when the review path is provably outside agent control; no header or click substitute | No new reserved decision while its required verifier/authority is unavailable |
| **P3 — consequential governed commitment** | External publish/send, payment, irreversible operation, credential access, privileged delegation, access-policy change | Online SEA-Forge decision and exact bounded grant at commitment, plus duplicate protection | Policy chooses none, A2 on a trusted path, or A3 independent confirmation | No offline authorization grace; pending work remains pending |
| **Px — unknown or sensitive** | Sensitive read, unclassified external effect, unknown reversibility or ownership | Refuse until classified; never infer P1 from a route or UI label | Determined by policy, not by convenience | Fail closed for mutations and sensitive reads |

Content submitted through an agent execution credential is agent-authored and attributable. Content submitted through a human session is **session-controlled**: the server knows the durable human on whose authority the session acts, not who wrote or caused it. Such records must say `session-authorized` and `authorship: unverified`, never `human-verified`. An agent controlling that browser can write low-risk content and cannot be distinguished; it receives no agent attribution and cannot use that path for P2/P3. A human session may perform P0/P1 without proving that each event was a personal click. Existing owner-pinned views and other explicitly human-owned controls can be P2 without making every layout change P2. Revoking an agent execution therefore cannot revoke low-risk access through a still-valid human session; the session's own policy and revocation govern it. This is the honest boundary that preserves fluid collaboration while protecting the controls whose ownership matters.

### 5.2 Assurance levels

- **A0 — authenticated session/connection:** local verification of a durable session or workload credential. Establishes the caller only.
- **A1 — authenticated execution and scoped grant:** verifies the execution, attempt, audience, and current local or SEA-Forge bounds. Suitable for autonomous work.
- **A2 — operation-bound human verification on a trusted review path:** fresh WebAuthn UP+UV bound to a server-created pending operation, used only where policy establishes that the review UI is outside the current agent's control. It establishes participation in that exact ceremony, not comprehension of an untrusted display.
- **A3 — independently reviewed human intent:** the canonical operation is obtained directly from the protected authority and rendered on a separately authenticated surface or isolated native channel outside the selected threat's control, then bound to fresh verification. A3-UV uses WebAuthn UP+UV. A3-T uses a protected-terminal presence challenge and is recorded as that weaker evidence class, never as WebAuthn or UV. A3 is a property, not a named device. SEA-Forge authorization remains a separate decision and is required wherever policy says so.

Horizon's current `ApprovalAssurance` is derived from an environment string (`src/ui/workspace/model.ts:108-115`). Replace that declaration with measured deployment capabilities and the evidence actually available for the operation. A deployment that cannot prove A3 must not offer an A3-labelled approval.

### 5.3 Exact operation binding

For A2/A3, the server first creates the pending operation: a Cognate continuation for a local reserved decision or a SEA-Forge approval for a governed one. There is no third Horizon proposal ledger. Canonically bind:

- schema/domain-separation version and a fresh server nonce;
- authenticated human principal, tenant, device/session, and requesting execution;
- operation kind, exact parameters, target resources, and requesting delegation head;
- relevant record/owner/state revisions, world/frame references, policy digest, and approval/continuation ID;
- issue time, short expiry, and one consumption.

The WebAuthn challenge is a domain-separated hash of that canonical record and nonce. Verify credential ownership, origin, RP ID, UP+UV, signature, sign count where supported, one-time challenge, pending record, and all preconditions again at consumption. Store enough assertion material or a trusted-verifier receipt for independent checking. Any changed parameter or revision needs a new ceremony. An A3 protected-terminal challenge uses the same pending record and binding, is single-use and short-lived, and is recorded as `protected_terminal_presence`, not as UP/UV or WebAuthn. It is acceptable only where policy allows that evidence level and the selected threat cannot reach the terminal.

A normal browser is acceptable for A2 only when the threat model accepts its review surface. A3 requires the surface to fetch and render the canonical operation directly from the trusted authority, not accept agent-authored HTML or a summary posted by the browser. A separate phone is insufficient if the same hostile desktop can also modify the local authority or the operation sent to that phone; in that case the authority must be isolated or remote as well.

### 5.4 Interim Horizon containment before the cross-stack migration

Horizon has a present request-boundary defect: a browser session authenticates a person, but it does not prove who initiated or reviewed a reserved action; `x-horizon-source` is only a caller label (`src/app.ts:3430-3438,3468-3477`). Existing tests distinguish the label from a session but cannot distinguish a person from an agent controlling that session (`test/desk-write-token.test.ts:33-38`). The full identity migration cannot be the first mitigation. This is owner decision D5 and must be delivered as an early, self-contained step.

- **Keep available:** reads, navigation, view composition, ordinary layout, personal annotations, drafts, and agent-owned reversible work under existing ownership and scope checks. Agent operations continue through the authenticated agent door under their own keys.
- **Refuse by default:** browser-session `human.answer`, reserved routing/reassignment/withdrawal/removal, owner-pin changes that policy marks reserved, and every Horizon approve/reject path that lacks fresh exact-operation evidence. They return a typed `human_confirmation_unavailable` refusal, perform no write, and tell the person which trusted confirmation channel is needed. This is not a generic state-mutation ban.
- **Trusted interim path:** an existing protected phone or terminal challenge may authorize one exact pending operation and revision, with one use, short expiry, and a visible canonical summary. If no such path is available, affected reserved actions stay blocked rather than falling back to the session.
- **Never sufficient:** the session cookie, a page click or DOM event, `x-horizon-source`, an agent name/header, an agent door key used as a human session, or a previous approval. Agent-door operations remain owned by the agent and cannot answer or approve as the person.
- **Pinned and shared state:** ordinary personal layout remains low risk, while an existing owner pin and another actor's content retain exact ownership checks. The browser agent cannot gain extra layout authority by omitting a header.
- **Observable outcome:** the UI distinguishes unavailable confirmation from denied authority and tells the operator what will make the action available. The refusal must not discard already-entered text without an opportunity to preserve it as a draft.

The interim tests must prove both sides of the boundary: low-risk interaction still works with no new prompt, while each reserved route is refused without a trusted challenge even when the caller carries a valid session and omits or forges caller labels. The agent door must still enforce ownership and must never become a human-approval surrogate.

## 6. Identity, delegation, renewal, and revocation lifecycle

### 6.1 Issuance and delegation

1. The configured trusted issuer, using an existing protected service where it satisfies the custody property (O2/U1), resolves the caller from the connection, never a role or name in the request.
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

Revocation has three distinct guarantees. They must not be reported as one status:

| Boundary | What the identity/runtime layer can do | What must also participate |
|---|---|---|
| **Admission** | Refuse to create or renew the effect grant after revocation; no reservation or approval consumption | The authoritative revocation state and issuing broker must be reachable and current. |
| **Dispatch** | Cancel queued work, reject a stale effect fence, close channels, and prevent the local process from calling the resource | The process supervisor or resource broker must honor the fence and terminate or deny the caller. |
| **External commitment** | Prevent a call that has not started; record an in-flight call as uncertain once sent | The downstream resource or its broker must verify the revocation-aware authority lease/token at commit. A bare idempotency key prevents duplicate commit but cannot prevent the first commit after revocation. Without authority participation, revocation cannot prevent a commitment already in flight. |

Every governed effect therefore follows this order: prepare the exact operation, revalidate authority and revocation, atomically consume the approval/grant and reserve budget, acquire an effect-admission fence, then dispatch. The fence carries the broker revocation epoch and SEA-Forge decision. Revocation before dispatch produces no effect. After irreversible dispatch begins, the system records `none`, `uncertain`, or `committed`, prevents duplicate retry, and compensates where policy allows. Connected revocation is complete only when the broker generation advances, active fences are rejected, channels close or reauthenticate, and no uncommitted grant can be consumed. Disconnected completion is bounded by the offline deadlines, not claimed as immediate. An external provider that cannot check authority at commit cannot support a guarantee of revocation at commitment.

### 6.4 Offline, restart, and clock rules

The five-minute low-risk window and 15-minute credential maximum are owner-selected provisional defaults, not measured constants or durable policy. Keep two independent bounds in addition to grant expiry: `credential_expires_at` and `authority_fresh_until`. Start the offline window at the last successful authoritative validation, never at last activity, restart, resume, or credential renewal. P0/P1 work may continue only while all bounds remain valid and no fresh decision is needed. P2/P3, new delegation, and privilege expansion never acquire offline grace.

A restart does not extend or automatically resume delegated work. The new process must obtain a new attempt identity from the issuer, reload the persisted execution/grant/revocation records, and verify the current attempt against them. If the issuer is unavailable, no new agent attempt starts. If the wall clock is earlier than the last validated time, if elapsed time cannot be established within the permitted window, or if a newer known revocation marker exists, all agent effects fail closed. Monotonic clocks may support within-boot checks, but a persisted wall deadline, last trusted observation, boot identity, and revocation epoch are still required for restart. A detected rollback never refreshes authority. Moving the clock forward only expires access earlier, which is safe; moving it back is refused.

Existing interactive P0/P1 human sessions may continue read/presentation work when their durable session and clock checks remain valid. A new shared-state or agent effect after restart requires the applicable session/execution verification; it does not inherit an unbounded offline window. Reconnection requires revocation and authority reconciliation before governed work. Losing SEA-Forge disables governed capabilities rather than the whole application; losing the local issuer prevents new agent attempts but does not itself invalidate already verified low-risk human sessions. An unavailable organizational issuer must not be replaced silently with a different trust root. Offline budgets are pre-allocated to a device or execution because disconnected peers cannot enforce a shared global limit.

## 7. Cross-platform identity contract and security qualification

Identity-contract compatibility and deployment security are separate claims. The same versioned identity/delegation messages, canonical operation digest, signatures, and failure vocabulary should work on every target. Whether an execution is isolated, which credential can be stolen by another local process, and which human-confirmation surface is independent depend on the operating system and measured configuration.

### 7.1 Target qualification matrix

| Target | Identity-contract position | Deployment security position |
|---|---|---|
| **Linux x86-64** | Same contract and local verification implementation; native peer principal is the UID. | Per-workload isolation is conditional on delegated subordinate IDs, setuid mapping helpers, usable namespaces, and kernel controls. With Landlock ABI 9 or later the native socket-containment path applies; older x86-64 kernels use only the seccomp supervisor when installable. Otherwise identity still works, but no equivalent workload-isolation claim is made. |
| **Linux ARM64 / Jetson** | Same contract; native peer principal is the UID. Identity issuance, signatures, attribution, and low-risk work can run on the host. | **Inspected on 2026-11-09:** Ubuntu 22.04, kernel `5.15.185-tegra`, aarch64. `landlock` is absent from the active LSM list, the Landlock version syscall returns `ENOSYS`, and `newuidmap` is missing. SEA-Forge `Isolated` prerequisites therefore fail; identity remains implementable, but per-workload isolation cannot be claimed without a qualified kernel/BSP and mapping helpers. The actual evidence is [`jetson-kernel.txt`](../evidence/2026-11-08-identity-authority/jetson-kernel.txt). |
| **Windows x64** | A portable principal must represent a SID without pretending it is a numeric UID. The existing Windows contract uses named-pipe SID identity; identity can run without isolation. | `Isolated` and `Jail` are unavailable. A kill-on-close job object controls process lifetime; it is not credential or desktop isolation. Windows identity and job tests are configured in CI but were not run here, so no live Windows security claim is made. |
| **macOS x64 / arm64** | The contract is portable; a macOS adapter must be qualified separately. Current native peer-identity evidence is not equivalent to the Linux/Windows tests. | The App Sandbox jail can constrain filesystem/network for a workload; the Linux-only `Isolated` class is unavailable. App Sandbox is not per-UID credential identity or desktop isolation. The configured macOS CI jail test was not run here. |
| **Paired browser/device** | HTTP/WebAuthn transport with operation-bound assertion; the device credential and canonical operation digest cross the boundary. | Security depends on A3 isolation. A phone is not independent if the same adversary can alter the authority, operation, or credential path it relies on. |
| **Remote hosted agent** | Signed workload credential, audience, and delegation chain; X.509/mTLS or a sender-constrained token is preferred. | The remote host's process and credential isolation is a deployment property. A valid SPIFFE ID does not imply host security. |

The actual Jetson probe is a fact, not a platform-wide conclusion: an ARM64 identity deployment can be correct while isolation is unavailable. A kernel or BSP change is an open option for stronger security, not an identity prerequisite. The current WSL2 test host is not Windows-native security evidence.

### 7.2 Execution-form boundaries

| Execution form | What identity can prove | Remaining boundary and risk |
|---|---|---|
| Brokered API agent | Issuer, execution, audience, grant, and exact attributed call | Protect the broker channel and keys. A stolen bearer token remains replayable unless sender-constrained. |
| Browser-controlling agent | Human session authentication is ambiguous; A3 can prove participation through a separate trusted channel | The page is not a trusted review surface under S1. Agent operations need an agent credential, not the human cookie. |
| Local process under the operator account | OS peer identity identifies only that shared account | It may read keys, sockets, files, or process memory. Per-execution credentials alone do not provide isolation. |
| Linux isolated workload | Distinct subordinate UID/GID plus namespace and kernel controls can separate sibling workloads | Requires delegated IDs, setuid mapping helpers, usable namespaces, and supported kernel controls. Fail closed when unavailable. |
| macOS jailed workload | App Sandbox can constrain filesystem/network for one workload | Not per-UID credential identity. Same-desktop automation is outside that boundary. |
| Windows local workload | Named-pipe SID and job-object lifecycle controls exist | A job object is process control, not credential or desktop isolation. |
| Unrestricted desktop agent | No reliable independent local human confirmation or credential secrecy | Use enforceable OS isolation or a separate trusted device and an authority outside the agent's control. Otherwise A3 is unavailable and so are consequential human approvals. |

### 7.3 Qualification rules and known limits

SEA-Forge's native `Isolated` implementation is Linux-only (`crates/sea-forge-sandbox/src/lib.rs:9-20,184-200`). On Linux ARM64, Landlock ABI below 9 has no Unix-socket supervisor and must fail closed; the fallback supervisor exists only for x86-64 (`crates/sea-forge-sandbox/src/workload.rs:148-164`). The actual Jetson is older still: Landlock is disabled/absent, so even filesystem isolation is not available there. The macOS backend ad-hoc-signs a launcher with App Sandbox entitlements and can deny network, while Windows uses job objects for local process lifetime (`crates/sea-forge-sandbox/src/jail.rs:526-538`, `src/local.rs:58-70,127-155`).

Configured CI has Windows identity/pipe/job tests and macOS App Sandbox escape tests (`.github/workflows/portability.yml:53-96,99-128`). Those lanes were not executed here, so this report does not claim their current results. The kernel-security workflow also permits unavailable fallback mechanisms and skipped PostgreSQL fixtures without failing (`.github/workflows/kernel-security.yml:229-234`); release qualification must require mechanism-specific observations. The generated TypeScript delegated-principal DTO requires a UID while Rust can emit a SID, so the new transport must use a portable discriminated principal (`workbench/packages/contracts/generated/IdentityView.ts:68-74`).

Tauri is an application shell, not an isolation guarantee. A terminal or native prompt is valid A3 only if the selected threat cannot reach its input/output, process memory, pairing output, or authority data. Contract conformance and platform-security qualification are separate release gates (U5). A platform that cannot enforce a channel may still issue and verify identities, delegate bounded low-risk authority, and record attribution; it must not advertise the unavailable guarantee.

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

Horizon and Workbench should display separate **proposed by**, **modified by**, **authorized by**, **executed by**, and **settled by** fields, with `via` gateway and evidence references. Content from an agent execution stays agent-attributed. Content from a human session is shown as session-controlled with authorship unverified, including when an agent may have used that browser. A P2/P3 decision cannot display session-only authorization as human participation; it shows A3 evidence where policy requires it, and otherwise shows that confirmation was unavailable. Legacy and ambiguous records show `unknown`, not a human name guessed from a cookie.

The same runtime policy applies to TUI, GUI, CLI, MCP, and A2A. Agent-owned presentation remains fluid when submitted through an agent identity. Existing owner pins and reserved layout decisions use P2 when policy requires human proof. A low-risk browser write authorized only by session must never be rendered as a verified personal human action or as verified agent authorship.

## 10. Minimum changes by project

### Cognate

- Consolidate `@godspeed/identity` as the identity contract and reference implementation: durable human, registered agent, ephemeral agent-instance, execution, attempt, session, credential, and revocation records. Keep product policy outside it.
- Add a language-neutral `AuthenticatedContext` and `ExecutionIdentity`, with issuer-qualified IDs, authentication provenance, audience, authentication/session references, delegation reference, and expiry. Preserve `Principal`/`Caller` compatibility through adapters rather than silently widening old fields.
- Make `startRun` derive the execution identity on the server; separate `startedBy` from executing actor; propagate the context through `RunContext`, nested invocations, continuations, protocol adapters, events, and recovery.
- Integrate a trusted issuer/broker selected under O2/U1. Reuse an existing SEA-Forge or isolated host service when it satisfies exclusive key custody; add a new process only if no existing component can. The issuer provides short-lived credentials, renewal, cancellation, revocation epochs, and protected IPC without becoming a new account database or workflow engine.
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

**Stage 0A — owner decisions and baseline markers (no security claim).** Record owner decisions O1–O8 and resolve U1–U6 sufficiently to preregister the issuer topology, operation classes, assurance matrix, offline envelope, and version/rollback rules. No unapproved mechanism is assumed. Record that current `x-horizon-source`, session-only approvals, and human-only `on_behalf_of` are insufficient for the proposed guarantee. Keep the frozen Horizon spec hash untouched; a normative change goes through a new spec revision and plan rebind.

**Stage 0B — interim Horizon containment.** Before the shared identity migration, implement owner decision D5 in section 5.4: retain low-risk session interaction, make caller labels non-authoritative, and refuse reserved human actions and unsupported approvals without a one-use exact-operation trusted challenge. This closes the present confused-deputy path without waiting for new issuer, delegation, or workload contracts. Prove both the preserved low-risk journeys and every refusal/no-effect case.

**Stage 1 — shared identity foundation.** Promote the operator/device/session package into Cognate, with adapters that preserve existing IDs and one authoritative writer. Add agent/instance/execution/attempt issuance and versioned context propagation. Prove restart, continuation, nested invocation, and protocol propagation before granting any new authority.

Pre-migration Cognate runs, recovery queues, queued outbox deliveries, and open continuations become `legacy/unbound`. They remain readable. A run may resume only with an explicitly rebound execution identity and current authority; otherwise it may complete internal read-only or deterministic replay work but must not perform a new capability, external effect, continuation resolution, or governed approval. Historical `startedBy` is displayed as legacy provenance and is never passed to a capability as a newly authenticated actor. Existing approvals are revalidated or left pending, never treated as consent to a rebind. Migration records the exact cutoff and preserves uncertain external-effect reconciliation. Rollback refuses new identities and unbound work rather than reviving old authority.

**Stage 2 — SEA-Forge authority bridge.** Implement the versioned agent-executed contract, bounded grant chain, shared budgets, renewal/revocation, and exact operation binding. The legacy human-gateway path is limited to a human-only gateway under a distinct OS principal; disable it wherever an agent can share that principal, including through the operator's browser session. No mixed-version request may fall back to human effective actor or to the gateway service.

**Stage 3 — Gauntlet binding.** Add the external binding record and attempt ledger before process launch; extend controller resume, delegation, and PostgreSQL migration/codec paths. Old runs become `legacy/unbound` for inspection; new consequential work requires explicit rebinding, never invented identity.

**Stage 4 — consumer migration.** Migrate Workbench sessions/Experts and Horizon operator mappings and agent doors. Cut over one writer at a time. Existing sessions are migrated only if their generation and revocation state are preserved; otherwise invalidate and require reauthentication. The caller label is already non-authoritative from Stage 0B; replace remaining privacy/display uses and complete the authenticated agent channel before claiming agent attribution.

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
| Human proof | Passkey is backed up/synced or `attestation: none`; agent controls the page or desktop | Evidence is labelled at its true level; S1 refuses page-based A2 for human-reserved P2/P3 and requires an A3 channel outside browser control; bounded autonomous P3 remains under its SEA-Forge grant and does not claim human confirmation |
| Human proof | Agent controls/forwards the trusted device, or local authority is modified by the desktop | Deployment refuses the assurance claim; separate device alone does not create independence from a compromised authority |
| S1 usability | Ordinary reads/layout/drafting; reserved decision with and without an A3 channel | Low-risk interaction completes without a new prompt; with A3 the exact decision completes; without A3 only the reserved action is blocked with a truthful repair path |
| Authority laundering | Export session-controlled content as `human_decision`; reuse it to start delegation or satisfy approval | Typed provenance is preserved; downstream refuses it as intent/authority; no grant, approval, or widened scope is created |
| Issuer custody | Agent reads, exports, replaces, signals, or injects into the issuer; issuer key/store unavailable at start | Issuer property is tested at the OS boundary; no credential minted through an agent-controlled path; startup fails closed rather than using an agent-accessible fallback key |
| Interim containment | Valid paired session, omitted/forged page header, reserved route, low-risk route, agent-door key used as human | Reserved action returns `human_confirmation_unavailable` with no write; low-risk route still works; header and agent key cannot become human approval |
| Approval | Same human via another session/gateway self-approves; two approvals consume concurrently; old approval replayed after expiry/revocation | Separation of duty applies to the named subject; exactly one consumption; replay refused |
| SEA authority | Offline/unavailable/corrupt authority at admission, before effect, and after approval | No P3 effect; pending remains pending; no old decision authorizes a changed operation; evidence records unknown/unavailable |
| Revocation | Revoke after authorization but before dispatch, after effect-admission fencing, while a socket is open, or during retry | Pre-dispatch revocation produces no effect; in-flight irreversible work becomes `uncertain` and is reconciled/compensated, never reported as clean cancellation; channels close; connected completion has a measured bound and disconnected work stops at its deadline |
| Renewal | Renew after grant consumption, revocation, clock rollback, stale cache, or issuer outage | Renewal refused or revoked; old credential no longer works; budgets/approvals are not reset; no fallback secret |
| Offline | Restart, sleep, copied lease, new device, shared budget exhausted, reconnect with changed policy | Offline window does not reset; shared limit is pre-allocated; new authority fails closed; reconnect reconciliation precedes execution |
| Replay/recovery | Crash before spawn, after external effect, before result persistence, during settlement; replay recorded steps | Uncertain effect is reconciled; no duplicate commitment; replay never reuses execution permission; attempt attribution remains truthful |
| Evidence | Tamper with event metadata, decision, grant, approval, identity binding, Gauntlet binding, or observation | Independent verification rejects; legacy unknown stays unknown; no subsystem invents missing authority |
| Migration | Resume pre-cutover Cognate run/continuation/outbox/approval; old `startedBy` requests a capability; rollback | Legacy work cannot acquire new effects or approval without explicit rebinding; old metadata never becomes a fresh authenticated actor; revoked/unknown remains refused |
| Interoperability | Connect/AG-UI/MCP/A2A cross a boundary with a valid identity but no grant; OIDC role changes; token-exchange audience mismatch | Authentication alone does not authorize; role/audience is re-evaluated; no external dependency is required for unrelated local reads |
| Platform | Same identity contract on Windows, macOS, Linux x86-64, and Linux ARM64; attempt sibling credential/key access and unavailable isolation mechanisms; probe actual Jetson kernel | Contract tests pass where implemented; security claims match measured adapters; Jetson 5.15.185-tegra successfully issues/verifies identity while refusing isolation; Windows/macOS run their native adapters and report missing guarantees honestly |
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

1. **Threat model:** the owner selected S1 as the initial browser-agent profile and preserved S2 for hostile desktop or same-user process deployments. S1 does not claim to resist an S2 adversary. Under S1, human-reserved P2/P3 decisions require an A3 channel; without one those reserved actions are refused while low-risk work and already-bounded autonomous P3 work continue. Exact A3 channels and the S2 implementation remain qualification work.
2. **Local trust-root custody:** the required property is exclusive use of issuer key material by a trusted component that the agent cannot read, replace, signal, or inject into. The minimal process/service topology and platform custody mechanism remain open (U1). No such implementation was inspected. A `0600` file under the agent's OS account is not an isolation boundary.
3. **Independent surface:** the phone remote is a candidate, not proof. Its WebAuthn currently opens a session and `attestation: none` does not establish authenticator hardware. A3 needs per-operation binding, canonical authority-sourced display, isolation appropriate to the threat, and platform validation.
4. **Human intent:** WebAuthn cannot prove comprehension. Synced/backed-up passkeys can move between devices. Policy must state what A2 means and when only A3 is acceptable.
5. **Platform guarantees:** identity-contract compatibility is broader than deployment security. Linux per-workload isolation depends on host facilities; the inspected Jetson `5.15.185-tegra` lacks Landlock and `newuidmap`, so identity is implementable but `Isolated` is unavailable. Windows lacks the isolated/jail backend; macOS App Sandbox is not per-UID workload identity. Tauri and WSL do not remove those limits without separate evidence.
6. **Offline revocation:** disconnected immediate revocation is impossible. The five-minute low-risk window and 15-minute credential maximum are owner-selected provisional defaults, not measured safety thresholds. Clock rollback and copied leases require explicit mechanism tests.
7. **Budget semantics:** offline shared budgets require pre-allocation. Multi-device enforcement cannot be globally current while disconnected; such operations must stay online.
8. **Versioning:** Horizon/Cognate 0.9, Workbench/Cognate 0.8, the vendored identity package, SFWP, A2A, Gauntlet result contracts, and persisted ledgers need a supported compatibility matrix and negotiation rules. A mixed-version fallback must never widen authority.
9. **Gauntlet strict result codec:** `role_result@v1` rejects unknown fields and old runners cannot be changed in place. Use the external binding record or negotiate a new result version; do not append untrusted identity claims to v1.
10. **SEA-Forge production wiring:** `run_authenticated` and private connection issuance are not exercised by the normal production executable. The design reuses the mechanism, not an unproven deployment.
11. **Availability policy:** the exact offline window, renewal cadence, grant budgets, delegated depth, and approval expiry need owner approval after measured operational trials.
12. **Human-reserved operation catalog:** the precise P2 set must be derived and reviewed per operation in `.sea`; the examples here are design guidance, not specification.
13. **No implementation or security qualification:** this report is a design. No issuer, delegation protocol, operation-bound assertion, platform isolation guarantee, or cross-stack live test has been implemented or passed.
14. **Interim exposure remains open:** until owner decision D5 is implemented, a valid Horizon browser session still cannot distinguish a person from a browser-controlling agent for reserved actions. That is the highest-priority containment gap; the full identity migration is not a substitute for closing it early.

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
| Jetson platform prerequisites | Read-only non-interactive host probe recorded in `../evidence/2026-11-08-identity-authority/jetson-kernel.txt` | Ubuntu 22.04, `5.15.185-tegra`, aarch64; Landlock absent/`ENOSYS`; `newuidmap` missing; `unshare` present |

These are source-level and focused contract observations, not full `just verify` runs and not cross-stack, live-issuer, live-authority, Windows, macOS, WSL runtime-security, or SSH runtime-security evidence. The separate Jetson host probe in this section establishes kernel/prerequisite state only; no identity or isolation runtime was executed there. Workbench advanced concurrently during review: source reviewers inspected `32582af...`, and the final 17-test run was bound to `65510bb...`, unchanged before and after that run. No implementation file, specification, or frozen hash was changed.

Six fresh-context Goldfish reviews were requested. Native subagent dispatch hit provider rate limits; the same six lenses were rerun as independent ephemeral Codex processes, each instructed to read its EGM persona and standard, with no parent transcript. Design, codebase-details, zoom-out, comprehension, implementation-readiness, and structural reports completed. Their raw outputs and invocation identifiers were not retained; they are therefore a **historical report, not independently verifiable evidence**. Their objections were incorporated above, notably contract-versus-daemon ownership, open-channel revocation, durable attempt records, strict codec migration, per-device offline budgets, platform capability matrices, and the difference between authentication assurance and ledger assurance.

## 17. Retained review and evidence record

The review and test inputs are retained at [`../evidence/2026-11-08-identity-authority/README.md`](../evidence/2026-11-08-identity-authority/README.md), with sanitized outputs, SHA-256 hashes, repository HEAD before/after, exit codes, and tracked worktree state. The technical version accepted before the owner-decision register was added is retained as [`reviewed-authority-3b7bc18f.md`](../evidence/2026-11-08-identity-authority/reviewed-authority-3b7bc18f.md), SHA-256 `3b7bc18ff913b4f37f99e32007d9316f473467ea5dc201a8de6736a786436018`; its brief is [`reviewed-brief-c7d1144e.md`](../evidence/2026-11-08-identity-authority/reviewed-brief-c7d1144e.md), SHA-256 `c7d1144e9638b27efba4238cf2c1ece6c72cfe03ce05f9fca6508f997e07e0b8`. The current owner-synced predecessor is retained as [`reviewed-authority-d302b5ae.md`](../evidence/2026-11-08-identity-authority/reviewed-authority-d302b5ae.md), SHA-256 `d302b5ae3133fbd4bc79a7113fb4c8332fefdd2caa3218f2901f5240790246e1`, and its brief as [`reviewed-brief-e5887404.md`](../evidence/2026-11-08-identity-authority/reviewed-brief-e5887404.md), SHA-256 `e5887404b865ad65214aa74e5db16eff1685395b58c687dd6ac0bb4ff74c7237`.

Review history:

1. The first final adversarial review returned `REJECT` with seven findings. Its raw output was not retained. The findings were: trust boundary/issuer custody; legacy gateway admission; browser-session authorship ambiguity; revocation ordering at the effect boundary; Cognate legacy runs; critic identity conflict; and evidence traceability.
2. The corrected artifact was reviewed in fresh ephemeral Codex session `01a1bdb5-2835-7670-9dea-fb63e6722146`; the sanitized output is [`final-rereview.md`](../evidence/2026-11-08-identity-authority/final-rereview.md), SHA-256 `148f8e0913abd726666d0946ad4d02dfa868707019c555dd943a2564e75c3be5`. It found the first six corrections adequate, required improved evidence traceability, and returned `ACCEPT WITH REQUIRED CORRECTIONS`.
3. The owner-requested focused contradiction check round 1 (session `01a1bdd0-3a76-7363-8b58-3b8fd3f3891b`) is retained at [`contradiction-check-round1.md`](../evidence/2026-11-08-identity-authority/contradiction-check-round1.md). It found three major ambiguities in A3 evidence, S2 confirmation, and commitment enforcement, plus one minor evidence-disclaimer issue. Verdict: `CHANGES REQUIRED`.
4. Round 2 (session `01a1bdd3-8686-7693-8656-2be8823203d4`) is retained at [`contradiction-check-round2.md`](../evidence/2026-11-08-identity-authority/contradiction-check-round2.md). It found the substantive corrections consistent and one remaining minor disclaimer wording issue. Verdict: `CHANGES REQUIRED`.
5. The final narrow wording check (session `01a1bdd6-4d48-72e2-a6a0-7fc26a676b73`) is retained at [`contradiction-check-final.md`](../evidence/2026-11-08-identity-authority/contradiction-check-final.md) and returned `ACCEPT`.
6. The owner then accepted the architectural direction and resolved O1–O8. The first synchronization check (session `01a1bdec-133f-7ca2-8ade-c5407419d406`) is retained at [`owner-sync-check-round1.md`](../evidence/2026-11-08-identity-authority/owner-sync-check-round1.md), SHA-256 `5941c0d7c4e148cbda9cc68535e35fb5c86e928d471f28b2a6bb7f6f76daf676`; it found stale labels denying profile approval, universal A3 wording over P3, and candidate labels on settled decisions. Verdict: `CHANGES REQUIRED`.
7. The second synchronization check (session `01a1bdef-a8e8-7ae2-9572-b60421b283e2`) is retained at [`owner-sync-check-round2.md`](../evidence/2026-11-08-identity-authority/owner-sync-check-round2.md), SHA-256 `3000d02aeffe77213c8a360cae28f37073d9eedc0dc9e944aab844aad3643df1`; it found four residual stale labels for D5, P3, D1, and provisional defaults. Verdict: `CHANGES REQUIRED`.
8. The final narrow synchronization check (session `01a1bdf1-71ac-74b3-959a-1edbd66d4ad0`) is retained at [`owner-sync-check-final.md`](../evidence/2026-11-08-identity-authority/owner-sync-check-final.md), SHA-256 `c8f8cb0a5de24d794983a71109d9b5fa457a349ce9ce0ad1b0ee71fa3c8d53d7`. It verified the exact current files against hashes `d302b5ae...` and `e5887404...` and returned `ACCEPT` with no remaining synchronization defect.
9. This section and the evidence manifest were updated after that accepted version to bind the current hashes. The checks confirm internal consistency and owner-decision synchronization; they do not approve implementation or resolve U1–U6.

The test evidence was rerun at recorded commits after concurrent Workbench movement, with HEAD captured before and after. Workbench's six pre-existing tracked screenshot changes are recorded; they are not inputs to the auth suite. These findings remain focused contract observations, not a whole-stack qualification.


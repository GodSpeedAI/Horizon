# Unified Human and Agent Identity, Delegation, and Authority

* **Author:** Sam Prime (owner) · Cline agent, EGM draft
* **Status:** Draft for implementation planning; independent adversarial review completed; no implementation
* **Date:** 2026-11-08

--------------------------------------------------------------------------------

## Overview

Horizon is a shared workspace where people and agents navigate, compose views, exchange proposals, and initiate work. Today a valid browser session proves that a session is authenticated, but not that the person personally initiated or reviewed a particular action. Caller-supplied labels such as `x-horizon-source` cannot close that gap. Across the stack, Cognate runs inherit the initiating actor, Workbench Expert runs use a system caller, SEA-Forge's existing gateway delegation resolves the effective actor to the human, and Gauntlet's runner identity describes adapter configuration rather than an authenticated agent execution.

This design establishes one identity and delegation contract for Cognate, Cognate Workbench, Horizon, SEA-Forge, Gauntlet, and RealityTrace. Cognate owns the application-level identity contract, the default issuer integration, and propagation through sessions, agents, executions, and attempts. SEA-Forge remains the independent authority for bounded delegation, consequential operations, approvals, separation of duty, and governed revocation. Horizon, Workbench, and Gauntlet consume verified identity and authority outcomes without creating competing identity or approval systems.

The first supported security profile is **S1**, which assumes an agent can control an authenticated browser. S1 keeps ordinary collaboration available. Human-reserved decisions require independently reviewed operation-bound confirmation rather than page WebAuthn or a click. A stronger **S2** profile remains required where an agent may control the operator's desktop or share a hostile local process boundary. No S1 deployment may claim protection against an S2 adversary.

The design preserves the central product behavior: humans and agents work together fluidly; agents keep independent identities and bounded delegated authority; reserved human decisions cannot be impersonated; and consequential operations remain governed without adding confirmation to work that an existing bounded grant already authorizes.

## The Problem

1. **A browser session is not proof of human intent.** Any code or automation controlling the browser can submit requests with the session cookie. A header that labels an agent is an unverified caller assertion, not an authorization boundary.
2. **Agent identity is not independently represented.** Cognate reconstructs a run actor from the initiating principal. Workbench Expert runs are system-started. The same agent definition may execute many times without a distinct execution identity, and retries are not consistently distinguishable from new work.
3. **Delegation does not preserve the agent.** SEA-Forge's existing gateway `on_behalf_of` path deliberately records the human as the effective actor. That is useful for a human-only gateway but cannot identify an agent acting with bounded authority on the human's behalf.
4. **Human-verification evidence is too coarse.** Horizon has WebAuthn for pairing and session authentication, but approval later relies on the session. Authentication, human presence, user verification, operation binding, intent, and authorization are different claims and are currently easy to conflate.
5. **Authority can be laundered across boundaries.** Session-controlled content can be re-described as a human decision by a downstream workflow. An agent's eligibility or a portal role can be mistaken for authority actually delegated to its execution.
6. **Revocation is described too broadly.** Stopping new admission, preventing dispatch, and preventing an external commitment are different guarantees. A downstream resource that cannot check revocation-aware authority at commit cannot promise the last one.
7. **Offline continuation lacks one rule.** Credential expiry, grant freshness, restart, local clock changes, and revocation must not create new authority or extend a disconnected window.
8. **Platform compatibility is being confused with platform security.** The identity contract can be portable even where a host cannot enforce workload isolation. The inspected Jetson is one concrete example: it can run identity flows, but its current kernel and mapping prerequisites cannot support SEA-Forge `Isolated`.
9. **The current Horizon defect needs early containment.** Waiting for the full cross-stack migration leaves reserved human actions exposed. Low-risk collaboration must remain available while unsupported reserved decisions fail closed.

## Goals

1. **One portable identity model.** Distinguish durable humans, registered agents, ephemeral agent instances, logical executions, process attempts, authenticated connections, initiators, delegates, executors, gateways, grants, authorization decisions, human verification, and evidence.
2. **Independent agent identity.** Give each agent execution a distinct authenticated identity without requiring a conventional OIDC account for every run. Persistent Experts retain stable identities; ephemeral agents remain identifiable without permanent accounts.
3. **Agent-preserving delegation.** Keep the executing agent visible alongside the human delegator, gateway, grant chain, and operation. Delegation may only narrow authority and never turns the agent into the person.
4. **Proportional human assurance.** Preserve low-friction P0/P1 collaboration. P2 reserved decisions require operation-bound evidence appropriate to the threat. P3 operations require SEA-Forge authorization, but a valid bounded grant may permit autonomous execution without another human confirmation.
5. **Operation-derived policy.** Classify operations by semantic effect, reversibility, ownership, sensitivity, external commitment, and authority. Do not classify by HTTP route, mutation shape, UI label, or client declaration.
6. **Exact human confirmation where required.** Prefer operation-bound WebAuthn through an independent trusted channel. Protected-terminal presence is a weaker evidence class and is never represented as equivalent to WebAuthn user verification.
7. **Bounded offline work.** Use 15-minute execution credentials and a five-minute low-risk offline continuation as provisional defaults. No new privilege, delegation, or consequential commitment occurs while disconnected from required authority; renewal, restart, revocation, and clock rollback cannot create authority.
8. **Three-stage revocation semantics.** State separately whether admission is stopped, dispatch is prevented, or an external commitment is prevented. Reconcile uncertain effects; never describe them as cleanly cancelled.
9. **Portable contract, qualified security.** Preserve the same identity and delegation contract across Windows x64, macOS x64/arm64, Linux x86-64, and Linux ARM64/Jetson. Qualify isolation separately, including the actual Jetson limitations.
10. **Early Horizon containment.** Land Stage 0B before the full migration so ordinary collaboration continues while existing human-approval and authority-laundering paths are closed.
11. **Evidence with honest provenance.** Preserve who initiated, executed, delegated, authorized, observed, and settled an operation. Keep credentials out of evidence. Do not let an observation become authority merely because it crossed a workflow boundary.

## Non-Goals

1. Replace SEA-Forge as the authority for consequential operations.
2. Make Cognate a second governance system or let it widen its own grants.
3. Make Horizon, Workbench, Gauntlet, or RealityTrace a competing identity or approval authority.
4. Require WebAuthn, terminal confirmation, or another ceremony for every interaction or low-risk state change.
5. Require OIDC accounts for ephemeral agents or every execution.
6. Require Docker, Kubernetes, SPIRE, or a new daemon by default.
7. Claim workload isolation, independent human confirmation, or immediate revocation on a platform or deployment that cannot enforce it.
8. Treat `on_behalf_of`, an agent header, a user-agent string, a client role, or a portal label as authenticated identity.
9. Rewrite historical identity, approval, or execution records to fit the new model.
10. Implement code during this design phase.

## Owner Decisions Applied

These owner decisions define the design baseline and supersede the earlier open-decision labels:

- **O1 resolved:** S1 is the initial browser-agent profile. S2 is preserved as the stronger profile for hostile desktop or same-user process boundaries. S1 never protects an S2 surface.
- **O2 resolved:** prefer existing trusted Cognate/SEA-Forge infrastructure over a new daemon. The issuer must prevent agent-controlled processes from using or replacing signing authority. The minimum topology is a design choice in the Technical Plan.
- **O3 resolved:** adopt P0–P3/Px, classified from semantics and authority. P3 requires SEA-Forge authorization, not universal human confirmation.
- **O4 provisional:** 15-minute execution credentials and five-minute low-risk offline continuation are provisional defaults. The v1 constants in section 14 freeze them; measurement may tighten, not loosen, them without owner approval.
- **O5 resolved:** operation-bound WebAuthn is preferred for stronger human assurance; protected-terminal presence is weaker and distinct.
- **O6 resolved:** the identity contract is portable across the four target platform families; workload isolation is qualified separately.
- **O7 resolved:** stopping admission, preventing dispatch, and preventing external commitment are separate claims; a downstream resource must participate for the last.
- **O8 resolved:** restart, clock rollback, renewal, and revocation cannot create new authority; uncertain effects are reconciled.

## Alternatives Considered

The rejected structural alternatives are retained because they constrain later implementation choices:

| Alternative | Why rejected |
|---|---|
| Put identity and approval in SEA-Forge | Couples ordinary local authentication to consequential authority and makes SEA-Forge the account directory for every run. SEA-Forge remains the authority, not the local session and execution issuer. |
| Let Cognate issue authority as well as identity | Creates two governance authorities and lets the runtime enlarge its own grants. Cognate proves identity; SEA-Forge decides bounded authority. |
| Keep the initiating human as executor | Loses agent accountability, delegation attenuation, revocation, and retry identity. The human remains `acting_for`/initiator, never the executor. |
| Keep long-lived Horizon agent bearer keys | Cannot distinguish execution, attempt, audience, holder, or delegation, and is opaque under a shared OS account. Existing keys may seed enrollment, not authorize execution. |
| Add a mandatory new identity daemon | Adds operations and a new trust root before an existing protected service is tested. A dedicated broker is a fallback, not the default. |
| Require SPIRE or RFC 8693 on every call | Adds platform and token-service hops without defining operation authority. Adopt compatible semantics where a boundary needs them; keep both optional. |
| Require WebAuthn or terminal confirmation for every mutation | Confirms participation, not intent, and destroys fluid P0/P1 collaboration. Use proportional assurance. |
| Confirm only on the desktop page or terminal | Both fail when the agent controls that surface. A2 is valid only where the review path is outside agent control; human-reserved decisions need A3. |
| Keep approval in every subsystem | Creates competing ledgers. Cognate holds local continuations; SEA-Forge holds governed approvals; Horizon and Workbench display only. |
| Treat Gauntlet runner/model IDs as principals | They are adapter metadata. Using them as identity would fake authentication and misstate provenance. |
| Grant per operation without shared ancestor budgets | Individual attenuation permits aggregate amplification. Parent budgets reserve atomically across children and attempts. |


## Technical Plan

### 1. Architecture and ownership

The design uses one identity contract and two independent decisions:

1. **Who is acting?** Cognate's issuer establishes the human session, agent principal, ephemeral agent instance, logical execution, and process attempt. Every downstream service verifies that proof rather than trusting a name, role, header, or portal label.
2. **What may this execution do?** SEA-Forge evaluates the bounded delegation grant, operation, resource, policy, budget, and current authority state. A verified identity does not imply authority.

| Component | Owns | Must not own |
|---|---|---|
| Cognate | Language-neutral identity contract, issuer client and default integration, execution/attempt issuance, context propagation, local reserved-decision continuation records | Consequential authority, independent approval, or a second governance ledger |
| Workbench | Human session presentation, Expert registration and execution launch, identity/authority display | Agent authentication by system caller, authority grants, or approval records |
| Horizon | Observer navigation, exact-operation review surface, passkey pairing, refusal and recovery UX | Identity issuance, authority decisions, or a competing approval record |
| SEA-Forge | Verification of identity proof; delegation grants; P3 authority decisions; human-reserved approvals; separation of duty; governed revocation | Application event storage or UI session semantics |
| Gauntlet | Durable run and attempt binding, frozen execution references, external identity binding record | A new identity issuer, approval ledger, or critic-visible builder identity |
| RealityTrace | Independent observations and evidence references | Identity, delegation, or approval truth |

The contract is a reference graph, not a universal user record. Services exchange bounded references and signed proofs; they do not copy credentials or invent local principal IDs.

### 2. Canonical identity and operation contract

| Reference | Meaning | Stability |
|---|---|---|
| `principal` | Human, registered agent, service, device, or system principal | Stable for the principal's lifetime |
| `agent_instance` | One enrolled instance of an agent definition/version | Stable until replaced or revoked |
| `session` | Human authentication session | Bounded by session policy |
| `execution` | One logical unit of delegated work | Survives credential rotation, restart, resume, and retry correlation |
| `attempt` | One process dispatch of an execution | Unique per process start |
| `connection` | One transport or gateway connection | Bounded by connection policy |
| `delegation` | SEA-Forge grant chain head | Immutable once issued; narrowed only by children |
| `decision` | SEA-Forge authority decision for an exact operation | Single decision record |
| `approval` | Human decision for a human-reserved operation | Single-use, exact-operation record |
| `observation` | RealityTrace or Gauntlet evidence reference | Append-only observation |
| `trace` | End-to-end correlation | Non-authoritative |

Every execution context carries: initiator, executor, agent instance, execution, attempt, optional human session, delegation head, authority decision, world/case/frame references, and provenance. The **initiator** is who asked; the **executor** is the agent or service acting; the **authorizer** is the principal or policy that granted authority. These must never collapse into one `actor` field.

An **operation descriptor** contains the operation ID, canonical parameters, resource identifiers, expected revisions, world reference, case, frame, delegation head, requested effect, risk class, required assurance, and idempotency key. Its canonical digest excludes display-only formatting. The digest is the binding unit for authority decisions, human confirmation, dispatch fences, and evidence.

A **provenance envelope** accompanies content and records origin (`human_session`, `agent_execution`, `system`, `imported`), `authorship: verified | unverified`, assurance evidence, and the producing reference. Content produced through a human session that an agent could control remains `authorship: unverified`. Crossing a boundary never upgrades it.

#### Contract v1 wire rules

The shared contract is `horizon.identity.v1`, versioned independently from the protocol carrying it. Unknown major versions and unknown signed-envelope fields are rejected; a minor version may add only fields listed as optional in the schema. Every record carries `schema_version`, `tenant_ref`, and `trust_domain_ref`.

References are opaque issuer/authority-scoped ASCII identifiers with stable prefixes: `principal:<kind>:<id>`, `agent:<id>`, `execution:<issuer>:<id>`, `attempt:<execution>:<id>`, `connection:<id>`, `grant:<authority>:<id>`, `decision:<authority>:<id>`, `approval:<authority>:<id>`, `observation:<producer>:<id>`, and `trace:<id>`. A service may not mint an ID in another service's namespace.

Canonical bytes use JSON Canonicalization Scheme (RFC 8785), followed by SHA-256 over the domain separator `horizon.identity.v1\n` and the canonical bytes. The resulting `operation_digest` is the only operation identity used by grants, approvals, fences, and evidence. It binds the schema version, tenant, trust domain, operation ID, canonical parameters, resource identifiers, expected revisions, world/case/frame references, requesting execution, delegation head, policy digest, nonce where required, and expiry.

Issuer and authority signatures use compact JWS with ES256 (P-256) and an explicit `kid`; no other algorithm is accepted in v1. Credentials are holder-bound: the caller proves possession of a registered P-256 key over the HTTP method or local operation name, audience, `operation_digest`, nonce, issue time, and expiry. A credential presented without that proof is a bearer token and is refused.

A refusal has one shape: `code`, `boundary`, `operation_id`, `effect: none | uncertain | committed`, `missing_or_expired`, and `repair`. It never contains a secret, a raw assertion, or a human name inferred from a cookie.


### 3. Trust boundaries and issuer topology

**S1 — browser-controlling agent.** The browser, page renderer, and any content displayed there are untrusted. The issuer, SEA-Forge authority service, and the A3 confirmation channel must be outside browser control. A page ceremony is at most A2 and cannot authorize a human-reserved operation.

**S2 — hostile desktop or same-user process.** The local desktop account is untrusted. The issuer and authority path must be outside that process boundary, and A3 requires a separate trusted device. A local terminal or native window on the same desktop is not an independent surface. S1 deployments must state that they do not provide S2 protection.

The **issuer security property** is exclusive custody: only a trusted component can use or replace signing material; the agent cannot read, export, replace, signal, or inject into it. A key file readable by the agent's OS account fails this property even with restrictive permissions.

| Profile | Use | Custody requirement | Claim |
|---|---|---|---|
| Existing protected host service | **v1 first choice**: SEA-Forge's protected local service when installed, or another already-isolated host service | Service-specific OS peer identity on a protected socket/pipe; issuer signing key in a separate key domain from the authority decision key | S1 after custody and authorization qualification; S2 only with out-of-boundary authority and confirmation |
| Dedicated Cognate authority broker | Local-first hosts without a qualified existing service | Separate service account, OS service manager, protected IPC, key ACL restricted to that account; TPM/CNG/Keychain when available, otherwise a service-only key file with no agent-account access | S1 after custody and authorization qualification; never S2 by itself |
| Organizational remote issuer | Managed or multi-user deployments | Remote trust root, device enrolment, audience-bound proofs, separate authority deployment | S1 or S2 according to deployment review |

A new daemon is not the default. The implementation selects the first profile that meets custody on the target platform; adding one is justified only if no existing service does. The application must not silently fall back to a local file or a user-owned process when the configured issuer is unavailable. If custody cannot be established, the host runs without agent authority rather than claiming S1.

**Issuance authorization.** Custody alone is not authorization. An agent instance is enrolled once with an issuer-registered P-256 public key, an explicit `principal` and `agent_instance`, and a human or SEA-Forge sponsor proof. An issuance request carries the enrollment signature, execution descriptor, holder key, audience, and requested initiator. The issuer resolves the executor and initiator from the enrollment and the verified human-session/grant reference; it never accepts a caller-supplied principal, role, or actor. It refuses to issue a human credential, an unregistered agent, an execution outside the enrolled agent, or an attempt whose holder key differs from the enrollment. A protected signer that can be asked to mint arbitrary principals is an issuance oracle and fails qualification.

**Platform custody v1.** Linux uses a systemd service under a dedicated account, a Unix socket with `SO_PEERCRED`, and a TPM2/keyring key where available; otherwise a service-only key file with mode `0600`, owned by that account, and never readable by the agent account. Windows uses a service SID, a named pipe with client-SID checks and remote-client rejection, and a non-exportable CNG key protected by a DPAPI-NG descriptor restricted to that service SID; machine-scoped DPAPI alone is insufficient because other local users may decrypt it. macOS uses a LaunchDaemon under a dedicated `_horizon` account, an XPC service with a code-signing requirement, and a System Keychain item ACL-restricted to that service. These are preferred mechanisms; the platform investigation below decides whether each host qualifies or must run without agent authority.

Human authentication (OIDC, passkey, local account) establishes the human principal. The issuer does not become the human identity provider; it attests the binding from a verified human session or grant to an agent execution. Enrollment, recovery, and trust-root rotation require a human or SEA-Forge authorization that is independent of the agent's claim.


### 4. Authorization pipeline

An operation takes exactly one of the explicit branches below. There is no third path and no fallback from governed to local.

| Path | Used for | Required proof | Authority record |
|---|---|---|---|
| Local human | P0/P1 human-session work and a **local** P2 reserved decision | Durable human session, local ownership/scope policy, plus A3 for local P2 | None for P0/P1; Cognate continuation for local P2 |
| Local agent | P0/P1 agent-owned work inside an existing local scope | Issuer execution proof plus local ownership/scope policy | None; `authority_ref` is null |
| Governed human | A SEA-Forge-owned P2 decision and any P3 operation whose catalog row permits a human session (for example `approval.approve`, `workspace.export`) | Durable human session, the row's assurance predicate (A3 where human-reserved), and a SEA-Forge entitlement/decision (the entitlement is the external interface of section 9.1); the fence where the row is P3 | SEA-Forge approval/decision; execution/attempt/delegation references stay null, entitlement/fence references are explicit, `grant_ref` stays null |
| Governed agent | Every P3 commitment whose catalog row permits an agent execution | Issuer execution proof, SEA-Forge grant, and policy-required human evidence | SEA-Forge decision/fence |

There is no local path for agent P2/P3 or for a P3 commitment, and no fallback from governed to local. A local human path does not require an agent execution proof; it does require the A3 receipt for a P2 decision. A local P2 continuation and a governed P2 approval are never both written.

The governed pipeline has seven ordered stages. Failure at any stage is a typed refusal, not a fallback to a broader identity.

1. **Establish the connection.** The resource authenticates the transport and resolves the caller from the connection, never from a request-supplied role or name. Local IPC uses OS peer identity; remote calls use mutually authenticated transport or a holder-bound token.
2. **Verify execution proof.** For an agent caller, the issuer-signed credential binds principal, agent instance, execution, attempt, audience, holder key, issue and expiry times, and delegation head; replay at another audience, attempt, or holder fails. A human caller uses the durable session/A3 receipt and has no execution proof; a missing execution proof on an agent caller is a refusal, not a downgrade to a human session.
3. **Classify the operation.** The `.sea` operation declaration and SEA policy assign P0–P3 or Px from semantics, resources, effect, reversibility, external commitment, data sensitivity, and amount. Client labels and route names are not classification inputs. Unknown or contradictory classification becomes Px and fails closed.
4. **Evaluate authority.** SEA-Forge intersects the agent's eligible capability with the exact grant, resource scope, operation scope, budget, time, policy, and current revocation state. Children cannot widen parents. Being registered, having a role, or having previously executed a similar operation is not authority.
5. **Obtain required human evidence.** P0/P1 require the session or execution policy only. P2 human-reserved decisions require A3. P3 requires SEA-Forge authority and human evidence only where policy marks that operation human-reserved. Px refuses until classified. A3 never substitutes for authority.
6. **Commit atomically.** The authority service consumes the decision or approval once, reserves budget, records the operation digest, and creates an `effect_fence` carrying both epochs and commit requirements.
7. **Dispatch and observe.** The execution dispatches with an attempt identity. The resource verifies the fence at commit where external commitment prevention is claimed. Evidence records references and outcomes, not credentials.

#### Governed effect protocol

There is no “lease or fence” choice. The protocol is fixed:

| Step | Writer | Durable result |
|---|---|---|
| Prepare | Cognate/SEA-Forge | Pending operation with canonical digest, requested budget, resource revisions, and idempotency key |
| Authorize | SEA-Forge | One atomic transaction records the decision, consumes the approval if any, reserves ancestor budget, and creates a single-use `effect_fence` |
| Fence | Local broker | Records the fence against the attempt, checks `authority_epoch` and supersession, and returns a dispatch token to the resource; one fence has one dispatch |
| Commit | Downstream resource or broker | Verifies the dispatch token, operation digest, amount, expiry, and both epochs, then records `committed`; a resource without this check cannot claim commitment prevention |
| Reconcile | Execution owner | Resolves `uncertain` after crash or provider failure into `committed` or `none`; releases only reservations proven unused |

The fence is immutable and names the execution, attempt, decision, grant, resource, amount, digest, expiry, `authority_epoch`, `dispatch_epoch`, and `supersedes`. A second dispatch of the same fence is refused. A crash between reserve and fence leaves a reconcilable pending reservation, not a consumable grant. A crash after dispatch is `uncertain` until the provider is queried. The resource commit token is the fence plus the broker receipt; the provider does not accept the raw issuer credential.

The **risk classes** are semantic:
| Class | Meaning | Minimum policy |
|---|---|---|
| P0 | Local presentation, reading, navigation, or ephemeral private layout | Authenticated session or execution where required; no shared effect |
| P1 | Reversible collaboration, drafts, annotations, agent-owned work | Authenticated execution inside its existing ownership and scope |
| P2 | Shared, visibility-changing, routing, or operator-reserved decision | Exact-operation check; A3 under S1 when human-reserved. An agent needs a grant permitting the operation; a human decision may instead rest on a current SEA-Forge entitlement (`grant_ref` null, `entitlement_ref` required) |
| P3 | Consequential external commitment, spend, deletion, publication, deployment, or irreversible state change | Online SEA-Forge decision, plus either a bounded grant for an agent caller or a current bounded SEA-Forge entitlement for a human caller; human evidence if policy requires |
| Px | Unknown, conflicting, or unclassified | Fail closed; classify before retry |

A P3 operation authorized by an existing bounded grant does not require a human ceremony merely because it is P3. Conversely, a low-dollar or apparently routine operation cannot be reclassified downward to avoid an approval when its effect is externally binding.

**Dispatch operations add no authority.** `capability.invoke` and `run.start` are dispatchers, not authorities. Each resolves its target to exactly one reviewed operation row — `capability.invoke` from `target_operation`, `run.start` from the pinned plan — and then the *target* row supplies the classification, the permitted caller kinds, the authority requirement, and the assurance predicate. A resolved target that is P0/P1 therefore runs on the local path with no SEA-Forge dependency, which is how ordinary low-risk autonomous work stays fluid. A resolved target that is P2/P3 requires that row's authority and evidence; the dispatcher neither relaxes nor inherits anything beyond it. An unknown, ambiguous, or multiple-target dispatch resolves to Px. A caller kind the target row does not permit is refused even though the dispatcher row permits it.

**Redelegation has two permitted callers.** `grant.redelegate` is a P2 authority write, not a human-reserved decision. A human session may redelegate under A3-UV. An agent execution may redelegate only while its parent grant is live, sets `redelegate: true`, has `depth_remaining > 0`, and still holds ancestor budget, and the child must strictly narrow operations, resources, audience, time, budget, and depth. Redelegation is a narrowing operation, so it can never create, widen, or transfer a human-reserved decision, an approval, a scope the parent did not hold, or an offline allocation not partitioned from the ancestor budget. An agent that redelegates does so as itself, under its own execution identity, with its own grant as parent — the child never names the human as executor.

### 5. Identity and credential lifecycle

A registered Expert has a stable principal and agent instance. An ad hoc agent receives an ephemeral agent instance that cannot outlive its enrollment window. Each logical execution receives a distinct execution ID even when the same agent instance is reused. Each process start receives a new attempt ID. Retries preserve the execution ID and create new attempt IDs; a retry never inherits the prior attempt's liveness or budget consumption.

Execution credentials have an owner-selected provisional maximum of 15 minutes. They are audience-specific and holder-bound: possession of the bytes alone is insufficient. Renewal goes through the trusted issuer, preserves execution identity, and rechecks the grant and revocation state. Renewal may shorten or refuse; it cannot widen scope, extend the grant, or create a new delegation.

The issuer maintains `issuer_generation`; SEA-Forge maintains `authority_epoch`; the broker maintains `dispatch_epoch`. A credential names the issuer generation and the authority epoch it was issued against. Rotating the trust root invalidates prior generations through explicit policy, not by silently trusting a new key. Revocation cascades to child grants, active executions where policy requires, open channels, and queued attempts. Once revocation is known, expired or revoked credentials get no grace period. Before revocation is known, a disconnected low-risk execution may use only its bounded offline window; reconciliation happens before any further governed work.

A restart does not resume authority. The new process obtains a new attempt identity, reloads the persisted execution, grant, and revocation records, and proves the current attempt to the issuer. The issuer and local broker mark the previous attempt superseded and reject its credential before the new attempt may act; a still-running old process therefore cannot race the resumed one. If the issuer is unavailable, no new agent attempt starts. If the execution was uncertain at interruption, it is reconciled rather than replayed as a fresh effect. Sleep, suspend, and clock jumps are treated as elapsed-time uncertainty: the process revalidates the earliest credential, grant, and freshness deadline before any new effect.


### 6. Delegation and authority

A delegation grant is issued and signed by SEA-Forge. It binds: delegator, delegated agent principal, optional execution, audience, allowed operations, resource selectors, permitted data labels, spend or quota budget, start and expiry, maximum delegation depth, redelegation permission, offline permission, required human evidence, parent grant, and revocation epoch.

Delegation invariants:

- The effective actor remains the agent execution, with an explicit `acting_for` human or organizational principal. It is never rewritten to the human as if the human executed the operation.
- A child grant is the intersection of its parent and its request. It cannot add operations, resources, audiences, budget, time, or depth.
- Budget is a single ancestor counter, not a per-child allowance copied from the parent. Every child reservation is atomically deducted from the parent and every intervening ancestor; sibling reservations plus committed consumption never exceed the parent ceiling. An execution-level commitment consumes once across retries; failed-before-effect reservations release; uncertain commitments remain consumed until provider reconciliation.
- Delegation depth decreases by one per child and never increases. Offline allocations are explicit partitions of the same ancestor budget, not additional budget.
- An execution cannot use a grant issued to another execution unless the grant explicitly permits an execution family.
- An agent cannot delegate to another agent unless the parent permits redelegation. Redelegation never launders a human-reserved decision.
- Human-reserved approval is consumed once and binds the exact operation digest, including the delegation head. A grant change invalidates the approval.
- A grant can authorize autonomous P3 work only when its operation, resource, budget, and policy explicitly allow it. It cannot authorize Px.
- Standing eligibility, registration, role, or reputation is not delegated authority.

SEA-Forge remains the single writer for this grant chain. Cognate, Workbench, Horizon, and Gauntlet may cache verified references, but they cannot mint, widen, or repair authority locally.

**First-grant bootstrap.** `grant.create` is SEA-Forge-only. It authenticates the human sponsor, requires exact-operation A3-UV, verifies the sponsor's existing SEA-Forge entitlement to delegate the requested operations, resources, budget, and duration, and issues a root grant within that entitlement. The grant being created is not required as its own authority. The requesting agent/service is identified separately from the sponsor. A child grant requires a live parent that permits redelegation and is subject to the ancestor budget and depth rules. A session, an agent, or an A3 ceremony without the SEA entitlement cannot create a root grant. Root `grant.create` is an authority write and uses the decision/entitlement records; it does not create an `effect_fence` because it commits no external resource.

**A parameter that names a delegation is registered, not assumed.** The record contract carries a register of delegation-reference parameters. The register has two parts: a **vocabulary** — the parameter names that name a delegation, `grant_ref` and `parent_ref` — and **entries**, one per schema and field, saying what the reference means to each caller kind: `authority` (the delegation the caller acts under, so the record's own `delegation_ref` must be that same reference), `target` (the delegation the operation acts on, so naming it claims nothing), or `forbidden` (the caller may not name it in this operation). The vocabulary decides which parameters are delegation references at all, so a request cannot smuggle one under a schema that forgot to register it; a schema and field the register does not list is `forbidden` to every caller kind, because a parameter whose meaning is not stated is a parameter whose authority is not stated. `sponsor_ref` is not in the vocabulary: it declares who a grant is for, and the authenticated session is checked against it — a declaration, never a delegation the caller holds.

The register is what makes `grant.revoke` possible without fabricating a grant. The grant a revocation revokes is the operation's **target**, so a human session may name it; the delegation an agent spends on `run.start` is that execution's own **authority**, so the record must hold that same reference and a mismatch is refused; a console holds no delegation at all, so it may never be the authority for one. A build check reads the frozen parameter contract and the frozen record contract together and fails if a schema declares a delegation reference the register does not cover, if an entry names a schema or a field that does not exist, if an entry governs a name outside the vocabulary, or if a vocabulary name that nothing carries is left behind.

### 7. Human confirmation and reserved decisions

Authentication, presence, user verification, operation binding, intent, and authorization are separate claims. The design records them separately.

| Level | Evidence predicate | Valid use |
|---|---|---|
| A0 | Authenticated durable session or workload connection; caller identity only | P0 with no shared effect; never an external commitment |
| A1 | Authenticated execution, attempt, audience, holder key, and current local or SEA-Forge bounds | P0/P1 within the execution's scoped grant or local scope; autonomous work |
| A2 | Fresh WebAuthn UP+UV bound to a server-created pending operation on a review path proven outside the current agent's control | Operations where policy establishes a trusted review path; never a human-reserved decision under S1 |
| A3 | Canonical operation fetched directly from the protected authority and reviewed on a separately authenticated surface outside the selected threat, then bound to fresh verification | Human-reserved decisions; A3-UV and A3-T are distinct evidence classes |
| A3-UV | A3 plus WebAuthn UP+UV, domain-separated challenge, and trusted-verifier receipt | Preferred human-reserved confirmation |
| A3-T | A3 plus protected-terminal presence, recorded as `protected_terminal_presence`; never WebAuthn or UV | Only where policy explicitly accepts the weaker class and the terminal is outside agent control |

Assurance is evaluated by the predicate identifier, not by ordinal comparison. A service that receives an unknown predicate, a weaker predicate than the operation requires, or a predicate whose evidence cannot be verified fails closed. A2 remains useful for authentication and trusted review paths; it does not become A3 by being displayed on a page.

**V1 A3 mechanism.** The initial human-reserved channel is **A3-UV through the paired phone remote**. The phone fetches the canonical pending operation from the authority, renders it in the phone client (not in agent-authored HTML), obtains WebAuthn UP+UV, and submits the assertion only to the A3 endpoint authenticated by the paired device session. A page session, a relayed challenge, a browser WebAuthn assertion, or a phone session that has no operation-bound pending record cannot create approval. The trusted verifier runs in the issuer/authority trust domain and signs a receipt containing the verified challenge digest, operation digest, device, principal, tenant, trust domain, policy digest, and verifier key ID.

Pairing creates one or more single-use recovery codes stored offline by the human. Initial pairing and recovery follow the bootstrap ceremonies in section 11: initial pairing is local-console only; replacement requires the recovery code and local console plus a fresh passkey, or a different already-paired device through A3-UV. Recovery can never approve an operation, create a grant, or authenticate a browser session. Without a valid anchor, reserved actions stay blocked. A browser session, an agent, or an administrator cannot bootstrap replacement authority.

**Stage 0B interim confirmation.** Before the phone path is upgraded, Stage 0B uses an exact-operation local terminal challenge: the pending record is read from the local store, rendered in a terminal the browser agent cannot control, and confirmed once with a short expiry. This is A3-T, labelled as such, and is limited to the local S1 containment scope. It is not offered on an S2 deployment and is not a substitute for the v1 A3-UV path.

The A3 challenge binds the authenticated human, tenant, trust domain, device/session, requesting execution, operation ID, exact parameters, targets, resource revisions, world/frame, delegation head, policy digest, approval/continuation ID, nonce, and expiry. Consumption rechecks all of them. The verifier stores a receipt, not the raw assertion.

Under S1, a page WebAuthn assertion can authenticate a session but cannot prove that the human reviewed the true operation; the page is agent-controlled. Under S2, the confirmation device must be separate from the hostile desktop, and the local authority itself must be outside that boundary. Synced passkeys and `attestation: none` are labelled at their actual assurance; they are not evidence of hardware isolation.

If no qualified A3 channel exists, human-reserved P2/P3 actions are refused with a truthful repair path. Ordinary collaboration and work already authorized by a valid bounded grant continue. The refusal is not a generic mutation ban.


### 8. Revocation, offline work, and uncertainty

| Guarantee | Required participation | Honest statement |
|---|---|---|
| Stop admission | SEA-Forge `authority_epoch` for grants and issuer `generation` for identity | No new grant, lease, approval consumption, or attempt after the applicable epoch advances; the issuer and authority are not interchangeable |
| Prevent dispatch | Local broker `dispatch_epoch`, process supervisor, and channel holder | Queued work is cancelled, stale fences are rejected, channels close or reauthenticate, and new process dispatch is denied |
| Prevent external commitment | Downstream resource or its broker checks revocation-aware authority at commit | A not-yet-started call is prevented; an in-flight call may become `uncertain`. Without resource participation, prevention cannot be promised |

**Epoch ownership.** SEA-Forge owns `authority_epoch`; it advances on grant revocation, approval cancellation, or policy invalidation. The issuer owns `issuer_generation`; it advances on identity revocation, enrollment replacement, or trust-root rotation. A credential carries both; either invalidation refuses admission. The local broker advances `dispatch_epoch` when it acknowledges and enforces a revocation, and reports `pending` until that acknowledgement completes. An issuer partition cannot admit work after the broker has acknowledged SEA's higher epoch; a broker that has not acknowledged reports the guarantee as pending rather than complete.

Every governed effect is prepared, revalidated, atomically consumed and reserved, fenced, then dispatched. The fence carries the SEA-Forge decision, `authority_epoch`, `dispatch_epoch`, and the attempt's supersession token. After dispatch the system records `none`, `uncertain`, or `committed`, prevents duplicate retry, and compensates only where policy allows. A bare idempotency key prevents duplicate commit but not the first commit after revocation. A resource that checks only the grant ID, not both epochs, does not provide commitment prevention.

P0/P1 work already authenticated locally may continue for no more than the owner-selected provisional five-minute offline window, and never past its grant or credential. The window starts at the last successful authoritative validation, not at last activity, resume, renewal, or restart. `credential_expires_at` and `authority_fresh_until` are independent bounds. P2/P3, new delegation, privilege expansion, and pending approval commitment never acquire offline grace.

Disconnected budgets are pre-allocated per device or execution; disconnected peers cannot enforce a shared global limit. On reconnection, revocation and authority are reconciled before governed work. Losing SEA-Forge degrades governed capabilities but never enables a bypass. Losing the local issuer prevents new agent attempts but does not invalidate already verified low-risk human sessions.

A wall clock earlier than the last validated time, an unverifiable elapsed time, a changed boot identity without reconciliation, or a newer known revocation marker fails closed. Monotonic clocks may support within-boot checks but cannot replace the persisted wall deadline, boot identity, last trusted observation, and revocation epoch. A detected rollback never refreshes authority.


### 9. Subsystem contracts

**Cognate.** The identity package becomes the language-neutral contract and client boundary. It issues execution and attempt identities through the configured issuer, propagates the execution context through local invocation, continuations, protocol messages, and nested agents, and records identity references in events. It must not treat `startedBy` as the executor. Local continuation records may hold a pending human-reserved decision, but the confirmation evidence must come from the protected channel; a continuation is not an approval.

**Workbench.** Expert registration creates a registered agent principal. Launching an Expert creates an agent instance, execution, and attempt rather than a system caller. The human session is recorded as `acting_for` or initiator, not as the executor. Workbench displays verified attribution and authority but cannot promote session content to human intent.

**Horizon.** Horizon consumes identity, delegation, and decision references. It shows separate `proposed by`, `modified by`, `authorized by`, `executed by`, and `settled by` fields. Passkey pairing and session authentication remain useful, but an approval must bind the canonical operation from the authority, not the page. During Stage 0B, Horizon keeps low-risk interaction, stops treating `x-horizon-source` as authority, and refuses reserved actions without fresh exact-operation evidence. It does not create a third proposal or approval ledger.

**SEA-Forge.** SEA-Forge verifies the issuer proof, resolves the agent execution and delegation head, and issues the authority decision, grant, or approval record. The existing human-only gateway `on_behalf_of` behaviour remains valid for human-controlled gateways; agent paths use an agent-preserving `acting_for` plus delegation chain. SEA-Forge does not trust a Cognate-local role as authority. Its revocation state is authoritative for admission and grant validity.

**Gauntlet.** Gauntlet stores a durable attempt ledger and an external binding record that references the identity, delegation, decision, and operation digest without changing `role_result@v1`. The critic envelope remains free of builder identity. Audit attribution lives in protected records outside the comparison envelope.

**RealityTrace.** RealityTrace records its own observations and references the execution and attempt that produced the observed artifact. It never converts an observation into authority or approval.

### 9.1 External interfaces Horizon consumes

Horizon consumes authority from systems it does not own. Those systems mint their own records, and Horizon neither mints nor defines them. The contract that names them is `contracts/identity/v1/external-interfaces.json`: for each interface it states the owner, the version, the commit the interface was read at, the facts the interface must carry, the checks Horizon applies to those facts, and the rule that applies when the interface cannot be read or does not cover the operation. An interface that is not named there is not consumed, and a named interface whose owner has not published it fails closed rather than degrading to a local policy, a session, or a grant. Horizon's own records never stand in for an external one: an `entitlement_ref` names a SEA-Forge entitlement, and nothing in Horizon mints one.

<!-- BEGIN GENERATED: external-interface-table -->
| Interface | Version | Owner | Pin | Publication | Horizon binding | Facts the interface must carry |
|---|---|---|---|---|---|---|
| `sea_forge.authority_decision` | `1` | GodSpeedAI/SEA-Forge | `b072ec50` | published | `AuthorityDecision.decision_ref` | `decision_id`, `operation`, `identity_binding`, `outcome`, `policy_refs`, `decided_at`, `resource_scope`, `amount`, `issuer_key_id`, `signature` |
| `sea_forge.action_grant` | `1` | GodSpeedAI/SEA-Forge | `b072ec50` | published | `DelegationGrant.grant_ref, AuthorityDecision.grant_ref` | `action`, `boundaries`, `amount`, `expires_at`, `committed_decision`, `issuer_key_id`, `signature` |
| `sea_forge.human_entitlement` | `1` | GodSpeedAI/SEA-Forge | no pin | specified_not_published | `AuthorityDecision.entitlement_ref, EffectFence.entitlement_ref` | `entitlement_ref`, `subject_ref`, `issuer_ref`, `issuer_key_id`, `signature`, `operation_digest`, `resource_refs`, `amount`, `authority_epoch`, `expires_at`, `revocation_state` |
<!-- END GENERATED: external-interface-table -->

The human entitlement is the one interface Horizon consumes that SEA-Forge has not published, so it is specified rather than assumed. `sea_forge.human_entitlement` version `1` names the facts an entitlement must carry — its own reference, the subject it was issued to, its issuer, the key the issuer signed it with, the issuer's signature over it, the operation it permits, the resource scope and spend ceiling it covers, the authority epoch, its expiry, and its revocation state — and the record contract binds a Horizon `AuthorityDecision` or `EffectFence` to those facts rather than to a name. An entitlement that is absent, names another subject or operation, covers a narrower scope or a smaller ceiling, carries another epoch, expires before the record it authorizes, is not active, or carries no issuer key and no issuer signature is refused. The subject a fact binds to is named per record kind — `AuthorityDecision` binds it to `approver_ref` and `EffectFence` to `caller_ref` — so no fact points at a field the record does not carry. Whether an entitlement is still current is a property of the authority that owns it, so it is named in the record contract's `not_enforceable_from_one_record` rather than pretended into a field. While the interface is unpublished, no human authority may rest on an entitlement: the governed human path refuses rather than falling back to a grant, a session, or a policy decision, and SEA-Forge publishing the artifact is an external dependency of that path, whose commit Horizon pins when it exists.

### 10. Evidence and user-facing truth

The evidence contract is versioned with the identity contract. Each record contains `schema_version`, producer, producer record ID, `tenant_ref`, `trust_domain_ref`, `trace_id`, `operation_digest`, the reference graph, assurance predicate, `authority_epoch`, `issuer_generation`, two outcomes, and timestamps. It excludes credentials, private keys, cookies, raw WebAuthn assertions, private content, and any field not needed for audit.

**Two outcomes, not one.** `observation_outcome` says what the producer saw — `observed`, `failed`, or `refused` — and `effect_outcome` says what changed — `none`, `uncertain`, or `committed`. One field cannot carry both, because a producer that observed the attempt and refused it has an observation but no effect, and a producer whose effect is uncertain has an observation that says nothing about what changed. A record that names one outcome and not the other is refused rather than repaired.

| Producer | Authoritative record | Independent verification |
|---|---|---|
| SEA-Forge | Grant, decision, approval, revocation receipt, both epochs | Verify the SEA-Forge ES256 signature and recompute the operation digest; no UI assertion is accepted |
| Cognate | Execution/attempt identity, event references, local continuation | Verify the issuer proof and compare the execution/attempt against SEA-Forge or Gauntlet; the event is attribution, not authority |
| A3 verifier | Signed trusted-verifier receipt: verifier/key ID, challenge digest, operation digest, device, principal, tenant, trust domain, policy digest, UP/UV, sign count, class, time | Verify the verifier signature and that the receipt matches the exact pending record; a missing receipt is `verification_unavailable` |
| Gauntlet | Run/attempt binding record and run hash | Verify the binding fields and run hash against the issuer and SEA-Forge records; critic envelope remains identity-free |
| RealityTrace | Observation reference and observation hash | Verify against the producer's record; an observation never becomes authority |
| Horizon/Workbench | Display cache of references and outcomes | Never authoritative; invalid or expired references render `verification_unavailable` |

Retention defaults are policy, not discovery: authority decisions, approvals, revocations, and their receipts are retained for at least 365 days; execution/attempt records and verifier receipts for at least 180 days; observations for at least 90 days or the source system's longer period; traces for 30 days. A tenant may extend retention but may not shorten it below the applicable policy. Deletion of expired content leaves a digest-only tombstone; authority, approval, and revocation records are not deleted while any referenced grant is live. If referenced evidence has expired or disappeared, the consumer shows `verification_unavailable` and cannot infer confirmation, settlement, or authority.

**Access and freshness.** Current authority is checked against SEA-Forge or the issuer at decision time; a cached receipt is not current authority. A cached signed receipt may be shown for at most 5 minutes and must be marked `cached`; after that it is `historical` and cannot authorize an operation. The authority record is readable by the tenant's security administrator, the issuer, and the named approver/executor; Cognate execution records by the tenant runtime and the named execution; Gauntlet/RealityTrace records by their owning service and authorized auditors. Horizon and Workbench have read-only display access to their tenant's references. Agents never read another execution's receipt, approval, or credential.

Evidence is append-only; corrections are new records with a `supersedes` reference. A record that cannot be authenticated is not evidence of its claimed assurance. A consumer that cannot reach the authoritative producer may use a cached signed receipt only until its policy freshness limit; otherwise it fails closed for the affected operation.

The UI never guesses attribution:
- Session-controlled content is labelled `authorship: unverified`, even when a human is signed in.
- Agent content remains agent-attributed and shows the execution and delegation.
- A human-reserved decision shows the A3 evidence and the exact operation revision; if unavailable, it shows `human confirmation unavailable`.
- Legacy or ambiguous records show `unknown`, not a name inferred from a cookie or header.
- Refusals use the typed refusal shape and explain the failing boundary, side-effect status, and lawful repair.

### 11. V1 operation catalog

The catalog is closed. An operation not listed here, or a route/handler not mapped to one of these IDs, is **Px** and fails closed. Semantic effect determines the class; a route name, HTTP method, client label, or caller role cannot move an operation to a weaker class.

| Class | Operation IDs | Human evidence | Authority writer |
|---|---|---|---|
| P0 | `horizon.health`, `horizon.diagnostics.read`, `remote.health`, `remote.state.read`, `remote.events.read`, `horizon.research.health`, `horizon.workspace.read`, `horizon.case.read`, `horizon.evidence.read`, `horizon.economics.read`, `horizon.inspect.focus`, `horizon.inspect.neighborhood`, `horizon.navigation.inspect`, `horizon.context.query_reference`, `horizon.remote.status`, `workbench.view.read`, `gauntlet.run.read`, `realitytrace.observation.read`, `horizon.search.read`, `agent.response.read` | A0 session/connection | Local read policy only |
| P1 | `horizon.navigation.defer`, `horizon.navigation.reframe`, `horizon.navigation.disagree`, `horizon.navigation.intent.commit`, `horizon.surface.intent.commit`, `horizon.note.save`, `horizon.note.remove`, `horizon.draft.save`, `horizon.conversation.discard`, `horizon.case.open`, `horizon.lesson.propose`, `horizon.onboarding.skip`, `horizon.onboarding.resume`, `horizon.workspace.presenting`, `workbench.draft.save`, `workbench.conversation.discard`, `workbench.expert.launch`, `horizon.search.record`, `session.pair`, `session.logout`, `agent.surface.publish`, `agent.surface.arrange`, `agent.surface.annotate`, `agent.question.ask`, `remote.pair.redeem`, `remote.session.challenge`, `remote.session.authenticate`, `remote.session.logout`, `decision.hold`, `decision.release`, `horizon.settlement.observe`, `human.panel.open`, `human.panel.close` | A0/A1, with existing local scope | Cognate local policy; no grant creation |
| P2 human-reserved | `human.answer`, `ask.route`, `ask.reassign`, `ask.withdraw`, `owner.pin`, `workspace.label`, `handoff.send`, `case.task.complete`, `lesson.decide`, `remote.start`, `remote.refresh`, `remote.stop`, `device.pair`, `device.remove`, `device.recover`, `expert.install`, `expert.configure`, `expert.answer`, `expert.remove`, `grant.create`, `grant.revoke`, `gauntlet.run.cancel`, `trust.rotate`, `grant.redelegate` | A3-UV; A3-T only for Stage 0B local containment | Cognate continuation for a local decision; SEA-Forge for a governed decision |
| P2 redelegation | `grant.redelegate` | Agent execution: gated by the parent's `redelegate` permission, remaining depth, and ancestor budget; human session: A3-UV | SEA-Forge decision on the narrowing check; no human-reserved decision is created or transferred |
| P3 | `approval.approve`, `approval.reject`, `case.task.decide`, `horizon.settlement.rule`, `external.commit`, `workspace.export`, `isolation.request`, and every `.sea` operation with `external_commitment=true` | Policy: none, A2 on a trusted path, A3 for human-reserved; never implied by P3 | SEA-Forge decision and epoch, plus a bounded grant for an agent caller or a current entitlement for a human caller |
| Dispatch | `capability.invoke`, `run.start` | Inherit the classification, authority, and assurance predicate of every resolved target operation; a dispatch carrying no target class is Px | The target rows' requirement applies; the dispatch adds no authority and removes none |

**The shared execution route is a dispatcher, not a P1 row.** `POST /desk/start` performs `run.start`, and `run.start` is a **Px** dispatcher whose class is inherited from every operation its plan resolves to: a plan whose targets are all local P0/P1 resolves in Cognate with no grant and no SEA-Forge call, and any governed target binds the whole run at the highest class present. The catalog carries no `cognate.execution.start` row, because a shared execution entry point that started governed work at P1 would be the downgrade this catalog exists to prevent.

**The decision route is a dispatcher, and the card kind is resolved by the server.** `POST /desk/decide` performs one of several effects, and the request never says which: the person names a card and chooses an action, and the server looks the card up and resolves its kind. The catalog then pairs that kind with the action — an escalation with accept or reject is `approval.approve` or `approval.reject`, a lesson is `lesson.decide`, a case task is `case.task.decide`, a human step is `case.task.complete`, an acceptance card is `horizon.settlement.observe` or `horizon.settlement.rule` by its phase — and a pair the catalog does not list is **Px** and is refused before any effect runs. Holding and releasing a card are `decision.hold` and `decision.release`: the person's own P1 state, independent of what the card is. The route carries no class of its own, so no card can be downgraded by taking a weaker path to it, and no card kind is read from the request.

**The phone's command route is a dispatcher too, and it cannot answer an escalation.** `POST /m/api/command` names a kind, and the catalog says which row it selects: `open_case` is `horizon.case.open`, `commit` is `horizon.surface.intent.commit`, and `settle` is `horizon.settlement.observe` or `horizon.settlement.rule` by its phase. A kind or a pair the catalog does not list is **Px**. `approve` and `reject` resolve to `approval.approve` and `approval.reject`, and the remote path **refuses** them: a governed approval needs the operation-bound pending record, the protected confirmation and its own A3-UV evidence, and the remote has none of them. The refusal is a refusal, not a downgrade — the phone's session cannot answer an escalation, and the desk, where the confirmation is protected, still can.

**The liveness probe and the diagnostics read are two operations.** `GET /health` is public and answers `{ ok: true }` to every caller, paired or not: it says the process is up and reports no deployment profile, operator reference, semantic world, research state or transport to anyone. `GET /diagnostics` is the authenticated read that carries that detail, it writes nothing, and it is refused to an unpaired caller by the same central rule that guards every other route. The phone has its own pair: `GET /m/health` is the transport's public probe and `GET /m/api/state` and `GET /m/api/events` are the signed-in device's reads.

`approval.approve` and `approval.reject` are **P3 human-reserved**, not autonomous. They require A3-UV, never a session or agent credential, and must satisfy separation of duty: the approver is distinct from the initiating human, the requesting execution, and the executor. A P3 grant may authorize an execution, but it never authorizes that execution to approve its own commitment. The authority decision records the three identities separately.

`params.grant_create` declares `sponsor_ref` and `params.grant_redelegate` declares `parent_ref`; both are declarations checked against the authenticated caller, never sources of identity. SEA-Forge refuses a `sponsor_ref` that does not match the authenticated human session. For an agent caller it refuses a `parent_ref` that is not that execution's own live delegation head; for a human caller it verifies the authenticated principal's current SEA-Forge entitlement to redelegate the named live parent, since a human session has no delegation head of its own. Where the contract carries any principal, role, or authority reference, the value is compared with the authenticated context and a mismatch is a refusal rather than a correction.

A field absent from `grant_redelegate`'s `child` grants nothing; it is not inherited from the parent. Absent `operations`, `resources`, `budget`, `expires_at`, `depth_remaining`, `audience`, `data_labels`, `redelegate`, and `offline` therefore mean empty, zero, or false, and the child is a strict subset of the parent by construction rather than by subtraction at runtime.

`capability.invoke` is a family: its target operation ID, resource, amount, and effect are part of the operation descriptor and the resolved catalog row. A target without a reviewed catalog row is Px. `workspace.export` is P3 because it can leave the trust domain; a purely local presentation export must be declared as a separate P1 operation, not inferred from the route.

The catalog is released in Stage 0A as a checked manifest with one row per operation and one route/handler mapping. CI fails if a write route has no exact row, if a row names an unknown authority writer, or if a downgrade test can make a P2/P3 operation execute at P0/P1. The operation declarations in `.sea` are the semantic source; the manifest is the implementation binding.

**Bootstrap exceptions.** `device.pair`, `device.recover`, and `trust.rotate` are P2 but cannot require an already-qualified A3 device without circularity. Their ceremonies are distinct:

- `device.pair` (initial enrollment) is the phone's own enrollment: the pairing ticket issued by the one-time code is exchanged for a verified WebAuthn registration, and the previous device and its sessions are revoked in the same commit. Its caller path is the code holder, because the route proves possession of the code and the registration and never who presented them. It records `local_enrollment_presence`, never A3. It is not the browser's pairing route, which is `session.pair`.
- `device.recover` requires the one-time recovery code **and** the local console **and** a fresh passkey enrollment. A second already-paired device may authorize replacement through A3-UV only if it is not the device being replaced. A recovery code alone, a browser, an agent, or a remote session cannot replace a device.
- `trust.rotate` requires the local console plus an independent human administrator confirmation; it cannot be initiated by an agent or a browser session.

These exceptions do not create authority to perform any other operation, and their receipts are marked `local_enrollment_presence` or `admin_presence`, never A3.

**The class is what a row must be; the freeze also states what the running code enforces today.** A catalog that names only a class lets a reader assume the class is already enforced. The frozen manifest therefore carries, for every live-bound row, the caller path it runs on, whether the runtime enforces it at this freeze, what enforces it, what is still missing, and the stage that must close the gap. The manifest loader refuses a governed row that claims enforcement it does not have, a live-bound row with no enforcement entry, and an entry that lists nothing as missing while claiming no enforcement. The statement at this freeze is generated from the manifest, so the design cannot claim a row is enforced when the manifest says otherwise, or omit a row the manifest carries:

<!-- BEGIN GENERATED: live-enforcement-tables -->
| Operation | Caller path | Enforced by |
|---|---|---|
| `horizon.health` | `none` | The route answers before any authentication and answers every caller the same way: the process is up, and nothing else. It reports no deployment profile, operator reference, semantic world, research state or transport, to a paired caller or an unpaired one. |
| `horizon.diagnostics.read` | `human_session` | The paired desk session cookie. The read is refused to an unpaired caller by the same central rule that guards every other route, and it writes nothing. |
| `remote.health` | `none` | The route answers before any device is paired and says only that the transport is up and which schema it speaks. It reads no device, no operator and no workspace. |
| `remote.state.read` | `device_credential` | The device session cookie, resolved against the enrolled device, the operator and the tenant before the snapshot is read. |
| `remote.events.read` | `device_credential` | The device session cookie, resolved against the enrolled device before the stream is opened. |
| `remote.pair.redeem` | `code_holder` | The one-time pairing code, which is single use and expires. The route proves possession of the code and nothing else: it does not claim who presented it, and it enrols no device and issues no session. |
| `remote.session.challenge` | `none_unauthenticated` | The route proves nothing about the caller. It reveals only whether a device is enrolled and issues a single-use challenge. |
| `remote.session.authenticate` | `device_credential` | The WebAuthn assertion is verified against the issued challenge, the enrolled device's credential and the transport's origin before a session is issued. |
| `remote.session.logout` | `device_credential` | The session revoked is the one the caller presented, resolved from its own cookie. |
| `horizon.economics.read` | `human_session` | The paired desk session cookie. The read reaches the local workspace economics only. |
| `horizon.remote.status` | `human_session` | The paired desk session cookie. |
| `horizon.search.read` | `human_session` | The paired desk session cookie, and the dispatch rule: a `record` value outside the catalog's two actions is refused before the search runs, so an unlisted action never executes this read. |
| `agent.response.read` | `agent_execution` | The agent key in the Authorization header, checked against the key registry when the command runs. A page-agent label is refused. |
| `horizon.navigation.intent.commit` | `human_session` | The paired desk session cookie; the intent commits as the configured operator. |
| `horizon.surface.intent.commit` | `human_session` | The paired desk session cookie, and the actor rule: a body that names its own role or actor is refused (400 forbidden_field), so the role always comes from the session. |
| `horizon.note.save` | `human_session` | The paired desk session cookie; the note is the caller's own. |
| `horizon.draft.save` | `human_session` | The paired desk session cookie; the draft is the caller's own. |
| `horizon.conversation.discard` | `human_session` | The paired desk session cookie; only the caller's own rows are discarded. |
| `horizon.case.open` | `human_session` | The paired desk session cookie; the case is opened for the configured operator. |
| `horizon.lesson.propose` | `human_session` | The paired desk session cookie; the proposal is the caller's own. |
| `horizon.onboarding.skip` | `human_session` | The paired desk session cookie. |
| `horizon.onboarding.resume` | `human_session` | The paired desk session cookie. |
| `horizon.workspace.presenting` | `human_session` | The paired desk session cookie. |
| `horizon.search.record` | `human_session` | The paired desk session cookie, and the dispatch rule: the find is recorded only for the catalog's recorded-find action, and the row is the caller's own. |
| `session.pair` | `code_holder` | Possession of the one-time code shown at the local console. The cookie it returns is the session's only credential; no credential is enrolled and no authority is granted. The route does not establish that the caller is at the console, and the row does not claim it. |
| `session.logout` | `human_session` | The paired desk session cookie; the session it clears is the caller's own. |
| `agent.surface.publish` | `agent_execution` | The agent key in the Authorization header. A body that names an executor, a role or an actor is refused, so the recorded executor is the authenticated key. |
| `agent.surface.arrange` | `agent_execution` | The agent key in the Authorization header. |
| `agent.surface.annotate` | `agent_execution` | The agent key in the Authorization header. |
| `agent.question.ask` | `agent_execution` | The agent key in the Authorization header, which owns the question it puts up. |
| `human.panel.open` | `human_session` | The paired desk session cookie. |
| `human.panel.close` | `human_session` | The paired desk session cookie. |
| `decision.hold` | `human_session` | The paired desk session cookie, and the dispatch rule: the hold is a P1 effect on the caller's own card, and a hold without a reason is refused. |
| `decision.release` | `human_session` | The paired desk session cookie, and the dispatch rule: only a held card can be released. |

| Operation | Caller path | Missing | Closed by |
|---|---|---|---|
| `human.answer` | `human_session` | durable_principal_binding, evidence_A3_UV, authority_cognate_local_continuation, pending_record | Stage 0B — Stage 3 for the production path |
| `ask.route` | `agent_execution` | execution_proof, live_bounded_grant, pending_record, evidence_A3_UV | Stage 3 |
| `ask.reassign` | `human_session` | durable_principal_binding, evidence_A3_UV, authority_cognate_local_continuation, pending_record | Stage 0B — Stage 3 for the production path |
| `ask.withdraw (human.stop_waiting)` | `human_session` | durable_principal_binding, evidence_A3_UV, authority_cognate_local_continuation, execution_proof, live_bounded_grant, pending_record | Stage 0B — Stage 3 for the production path |
| `ask.withdraw (ask.withdraw)` | `agent_execution` | durable_principal_binding, evidence_A3_UV, authority_cognate_local_continuation, execution_proof, live_bounded_grant, pending_record | Stage 2 |
| `owner.pin` | `human_session` | durable_principal_binding, evidence_A3_UV, authority_cognate_local_continuation, pending_record | Stage 0B — Stage 3 for the production path |
| `workspace.label` | `human_session` | durable_principal_binding, evidence_A3_UV, authority_cognate_local_continuation, pending_record | Stage 0B — Stage 3 for the production path |
| `handoff.send` | `human_session` | durable_principal_binding, evidence_A3_UV, authority_sea_forge, pending_record | Stage 3 |
| `lesson.decide` | `human_session` | durable_principal_binding, evidence_A3_UV, authority_cognate_local_continuation, pending_record | Stage 0B — Stage 3 for the production path |
| `case.task.decide` | `human_session` | durable_principal_binding, evidence_A3_UV, pending_record, separation_of_duty_check | Stage 0B — Stage 3 for the production path |
| `case.task.complete` | `human_session` | durable_principal_binding, evidence_A3_UV, pending_record | Stage 0B — Stage 3 for the production path |
| `horizon.settlement.observe` | `human_session` | durable_principal_binding, evidence_A3_UV, pending_record | Stage 0B — Stage 3 for the production path |
| `horizon.settlement.rule` | `human_session` | durable_principal_binding, evidence_A3_UV, pending_record, authority_sea_forge_confirmation | Stage 0B — Stage 3 for the production path |
| `approval.approve` | `human_session` | durable_principal_binding, evidence_A3_UV, pending_record, separation_of_duty_check | Stage 0B — Stage 3 for the production path |
| `approval.reject` | `human_session` | durable_principal_binding, evidence_A3_UV, pending_record, separation_of_duty_check | Stage 0B — Stage 3 for the production path |
| `device.pair` | `code_holder` | durable_principal_binding, evidence_A3_UV, pending_record | Stage 0B — Stage 3 for the production path |
| `remote.start` | `human_session` | durable_principal_binding, evidence_A3_UV, authority_cognate_local_continuation, pending_record | Stage 0B — Stage 3 for the production path |
| `remote.refresh` | `human_session` | durable_principal_binding, evidence_A3_UV, authority_cognate_local_continuation, pending_record | Stage 0B — Stage 3 for the production path |
| `remote.stop` | `human_session` | durable_principal_binding, evidence_A3_UV, authority_cognate_local_continuation, pending_record | Stage 0B — Stage 3 for the production path |
| `workspace.export` | `human_session` | durable_principal_binding, evidence_A3_UV, authority_sea_forge, separation_of_duty, pending_record | Stage 3 |
| `run.start` | `human_session` | target_resolution, resolved_row_evidence, resolved_row_authority | Stage 1 |

The missing-fact ids mean:

- `authority_cognate_local_continuation` — the Cognate local continuation authority
- `authority_sea_forge` — the SEA-Forge authority
- `authority_sea_forge_confirmation` — the SEA-Forge authority's confirmation
- `durable_principal_binding` — the durable human principal binding
- `evidence_A3_UV` — A3-UV evidence
- `execution_proof` — the execution proof
- `live_bounded_grant` — the live bounded grant
- `pending_record` — the operation-bound pending record
- `resolved_row_authority` — the resolved row's authority
- `resolved_row_evidence` — the resolved row's evidence
- `separation_of_duty` — separation of duty
- `separation_of_duty_check` — the separation-of-duty check
- `target_resolution` — the target resolution
<!-- END GENERATED: live-enforcement-tables -->

An interim A3-T receipt is A3-T and not A3-UV, and it never stands in for the SEA-Forge decision, the separation of duty, or a live bounded grant. The `device.pair` row is live-bound to the phone's enrollment route, and the browser's pairing route is still `session.pair`: a browser that presents the console code has obtained a session and not a device.


### 12. Migration and vertical slice

| Stage | Work | Dependency | Exit gate |
|---|---|---|---|
| 0A | Freeze `horizon.identity.v1`, the operation manifest, issuer profile, A3 mechanism, evidence schema, policy constants, and platform-claim matrix | None | Cross-language fixtures, downgrade tests, signed schemas, and an independently reviewed manifest; no phone/runtime claim |
| 0B | Horizon interim containment, independently releasable | 0A catalog | Low-risk journeys pass; every reserved operation without an exact local confirmation refuses with no write; a local A3-T confirmation succeeds |
| 1 | Cognate identity foundation: issuer client/service, enrollment, execution/attempt credentials, propagation, supersession, restart | 0A and **0B released** | Issuer substitution/access tests and execution/attempt tests pass; all pre-cutover work is marked `legacy/unbound` |
| 2 | SEA-Forge authority bridge: verify issuer proof, grants, decisions, approvals, epochs, ancestor budgets, fences | 1 | Session-only grant creation produces zero grants; attenuation and revocation races pass; gateway is restricted to a distinct non-agent principal |
| 3 | A3-UV phone challenge plus Horizon/Workbench consumers: canonical review, attribution, refusal UX, local/governed split | 1, 2 | Page assertions and relayed challenges produce zero approvals; phone A3 succeeds; existing low-risk behavior remains |
| 4 | **Minimum end-to-end vertical slice**: one issuer execution, Cognate propagation, SEA grant, one Horizon operation, real effect, revoke, evidence | 1, 2, 3 | All six slice observations below pass; A3-UV, not A3-T; no mock or simulated boundary counts |
| 5 | Gauntlet and RealityTrace binding: attempt record, verifier receipt, observation references, critic blindness | 4 | Altered/substituted evidence is rejected; no builder identity reaches the critic envelope |
| 6 | Platform qualification: S1/S2 lanes, unsupported modes, custody probes, A3 independence | 4 | Each advertised claim has recorded native results; unsupported claims are disabled |
| 7 | Consumer rollout and legacy drain: Workbench, Horizon, remaining protocols, rebind or expire old work | 4–6 | Each subsystem's effect barrier is active before its cutover; no unbound continuation, outbox, or approval can create a new effect; mixed-version fallback is refused |

**Legacy barriers are cutover gates, not a final cleanup.** At Stage 1 every pre-cutover execution, continuation, outbox, queued attempt, and pending approval is marked `legacy/unbound`; its effect path is disabled before any new authority is issued. At Stage 2 the human-only gateway is restricted to a distinct non-agent-controlled OS principal; an agent key can never use it. Each consumer cutover at Stage 7 must first prove that its old queue/outbox/approval cannot create an effect. Rebinding requires an explicit human A3 or SEA-Forge authorization and a fresh execution; old approvals are expired rather than reused. Session conversion preserves the human principal but never converts session content into intent. Revocation generations are preserved across migration, mixed-version peers are refused rather than downgraded, and a rollback that would restore an unbound path is refused; if rollback is unavoidable, new effects stay disabled until re-cutover.

**Stage 0B is independently executable.** Its scope is Horizon only and must not depend on the new issuer or SEA-Forge bridge. The initial file/handler map is:

- New `src/capabilities/pending-confirmations.ts` owns the immutable pending descriptor: `pending_id`, tenant, operation ID, `params_schema_ref`, canonical parameters, nonce, canonical digest, resource/revision, world/case/frame, `case_authority`, policy digest, delegation if any, requester/session, execution if any, `confirmer_ref` and `presence_evidence` written only by the confirmation step and never by the caller, created/expires, one-use `confirmation_code`, `launch_generation`, state (`pending`/`confirmed`/`dispatching`/`applied`/`uncertain`/`expired`), and local receipt. Creation and consumption are separate SQLite transactions; a confirmed record cannot be reopened, an applied record cannot be applied twice, and `uncertain` is terminal until reconciled.
- `src/main.ts` adds `horizon confirm --pending <id>`. It requires a controlling TTY that is not a browser, remote PTY, or SSH session, plus the configured durable operator actor of REQ-SEC-006; the OS session it observes is recorded only as presence evidence (see the OS authentication bullet below) and never as identity. It reads only the local store, displays the canonical operation and digest, requires the human to type the one-use code, and records a signed `interim_local` receipt. It does not execute the operation. Redemption is class-dependent and never overclaims: for a `db_local` operation the receipt check, the descriptor/revision/expiry/state recheck, the state write, and the transition to `applied` occur in one SQLite transaction, so an application is atomic. For an `external` operation no database transaction can span the effect, so redemption is a two-phase claim: one transaction rechecks the descriptor and moves `confirmed → dispatching`, then dispatch occurs outside any transaction under the record's `effect_idempotency_key`, then a second transaction records the terminal `applied` or leaves `uncertain`. A crash after confirmation but before the claim leaves `confirmed` and may be redeemed once; the handler may retry with the same receipt, but re-confirmation or a second application is refused.
- Receipt signing uses the per-launch local secret from `HORIZON_SECRET_FILE`. On restart, every `pending`/`confirmed` record from the prior `launch_generation` becomes `expired`; the next attempt creates a replacement record with a fresh nonce, code, and `supersedes` reference. Old receipts are rejected, and the replacement must be confirmed independently. A `dispatching` record is not expired and not replayed: it becomes `uncertain`, because restart cannot establish whether the external effect landed. There is no `--json`, remote, HTTP, or browser entry point.
- OS authentication and identity are separate. On Linux/macOS require `isatty(stdin)`, a controlling terminal where `tcgetpgrp(stdin) == getpgrp()`, a local session, and `SSH_CONNECTION`/`SSH_TTY` both absent; reject a remote PTY even if it has a TTY. On Windows require `GetConsoleWindow()` plus `!GetSystemMetrics(SM_REMOTESESSION)` and a console process list containing the CLI. Unsupported platforms fail closed for Stage 0B rather than using a browser or remote fallback. These checks establish **presence**, not identity. The authorizing principal recorded as `confirmer_ref` is the configured durable operator actor that REQ-SEC-006 binds to a registered WebAuthn credential and maps to a SEA-Forge actor, resolved through the existing operator-actor validation; it must equal the pending record's requester actor, and the receipt binds that actor together with its registered credential reference. The OS login principal is recorded separately as `presence_evidence.os_session` and is **diagnostic only**: it corroborates that a local session was used and never establishes identity, membership in the operator set, or authority. A local terminal with the wrong operator actor fails exactly as a remote PTY does.
- `src/app.ts` page-agent gate and request router: remove caller-label authority at the `x-horizon-source` boundary; route reserved actions through the pending-operation check.
- `src/remote/server.ts` approval/rejection command: refuse a browser/phone session that lacks an operation-bound receipt; do not treat a signed-in session as A3.
- `src/capabilities/panel-answers.ts`, `src/capabilities/decisions.ts`, `src/capabilities/handoff.ts`, and the existing `desk`/workspace write handlers: require an exact pending record before Cognate-owned local P2 operations (`human.answer`, local `ask.reassign`, local `ask.withdraw`, `owner.pin`, `workspace.label`, `lesson.decide`, `remote.start`, `remote.refresh`, `remote.stop`, `device.remove`, and local expert settings). `handoff.send`, `approval.approve`, `approval.reject`, `grant.create`, `grant.revoke`, and every P3 operation remain refused in Stage 0B until their SEA-Forge authorization and human evidence exist; a local pending record or interim A3-T receipt cannot enable them.
- Reads, navigation, private notes, drafts, ordinary layout, and agent-owned reversible work remain on their existing ownership and scope checks. A refusal preserves any entered draft text; it performs no write and reports the missing confirmation.

**Stage 0B effect classes.** A single transaction claim is only true for effects inside the same SQLite database. Every Stage 0B operation is therefore classified, and the confirmation record carries its class:

| Class | Stage 0B operations | Guarantee | Failure handling |
|---|---|---|---|
| `db_local` | `human.answer`, `ask.reassign`, `ask.withdraw`, `owner.pin`, `workspace.label`, `lesson.decide` | Atomic: recheck, effect, and `applied` commit together, so exactly one application or none | Crash rolls back the effect; within the same launch the record remains `confirmed` and redeemable once; restart expires it under the launch-generation rule |
| `external` | `remote.start`, `remote.refresh`, `remote.stop`, `expert.install`, `expert.configure`, `expert.remove`, and the transport-revocation half of `device.remove` | At-most-once dispatch under `effect_idempotency_key`; not exactly-once delivery | Crash after the claim leaves `uncertain`; reconciliation queries the effect sink before any retry |

**`ask.route` is not a Stage 0B operation.** The row is agent-executed, its authority is the case record's, and it needs a live bounded grant, which Stage 0B does not have and Stage 2 supplies. Listing it as a Stage 0B success would claim an execution Stage 0B cannot authorise, so it stays refused there and its closure belongs to the stage that supplies both the grant and the evidence. The two tables above therefore name the operations Stage 0B can actually run, and a request for `ask.route` refuses with the missing grant named.
`effect_idempotency_key` is derived from the pending ID and descriptor digest, so a retry of the same confirmation reuses it and a replacement confirmation produces a different key. A sink that cannot be queried leaves the record `uncertain` rather than failed. `uncertain` is a reported state, never a silent retry: the human sees that the effect may have landed, and the operation is not re-dispatched under a new key without an explicit decision. `device.remove` is split because its store change is `db_local` while its session-termination effect is `external`; the store change commits first and the transport revocation is dispatched idempotently, so a failed revocation leaves a visible `uncertain` record rather than a removal that silently did not take effect.

**Stage 0B boundary.** Successful interim A3-T is restricted to Cognate-owned local P2 operations. Governed P2 and all P3 operations, including `handoff.send`, `approval.approve`, and `approval.reject`, stay refused until Stage 2/3. Initial `device.pair` follows the local bootstrap ceremony and records `local_enrollment_presence`, never A3-T. The Stage 0B gate must demonstrate each of these refusals even when a valid interim receipt exists.

**The browser's pairing route is `session.pair`, not `device.pair`.** `POST /desk/pair` exchanges the one-time code printed at the local console for a session cookie. It enrolls no credential, holds no delegation, and grants no authority beyond the caller's own local scope; the catalog classifies it P1 with the code holder as its caller path, because the route proves possession of the one-time code and cannot prove who presented it, so it never claims local-console presence. `device.pair` is the **phone's** enrollment row, live-bound to `POST /m/api/pair/finish`: it enrols a credential, revokes the previous device in the same commit, and records `local_enrollment_presence` rather than A3 or A3-T. A browser that presents the console code has therefore obtained a session and not a device, and a Stage 0B confirmation never turns that session into an enrolled device.

The interim confirmation is the local A3-T terminal challenge in section 7. It reads the pending record from the local store, displays the canonical operation and revision, requires the one-use code shown only in that terminal, and consumes the record atomically. Its receipt is marked `interim_local`, signed with the per-launch local secret, and is not accepted by SEA-Forge or after Stage 3 as a production A3 claim. It is not an issuer credential and does not create a delegation. The phone A3-UV path may replace it for local reservations only after Stage 3 without changing the pending-record or refusal semantics.

Standalone Stage 0B tests are `test/pending-confirmations.test.ts` (create/confirm/apply/replay/expiry/code mismatch, concurrent redemption, changed parameter, changed revision, crash between confirm and apply, restart invalidation plus fresh replacement confirmation, `db_local` rollback leaving exactly one application or none, `external` two-phase claim with at-most-once dispatch under a reused `effect_idempotency_key`, `dispatching → uncertain` on restart with no replay and no silent retry, and an unqueryable sink reported as `uncertain` rather than failed), `test/containment.test.ts` (reserved route with/without confirmation; no write; draft preserved; governed/P3 refusal even with a valid interim receipt; every `external` operation asserted idempotent on repeat dispatch), and `test/desk-write-token.test.ts` (the existing cases where a caller label cannot authorize and a session does not turn an agent into the person, plus Stage 0B additions: a remote PTY or SSH session refuses for lack of presence, and a local terminal whose configured operator actor differs from the pending record's requester refuses whatever the OS session is). All must pass without a running issuer or SEA-Forge.

**Minimum vertical slice (Stage 4).** Use one registered test agent, one local issuer, one SEA-Forge grant, one Horizon P3 operation against a controlled resource, and the same operation with a P2 A3 confirmation. The proof must show, in order:

1. The issuer creates a distinct agent execution and attempt; the initiating human is recorded as `acting_for`, never substituted.
2. Cognate propagates the same execution/attempt through the runtime and the Horizon request; a nested call cannot change it.
3. SEA-Forge issues a bounded grant, evaluates the exact operation, reserves ancestor budget, and a controlled real resource records `committed`; an out-of-grant variant is denied with no effect.
4. Horizon displays the correct attribution; the P2 variant obtains canonical **A3-UV**, not A3-T, and refuses a page/relayed approval.
5. Revocation advances the authority epoch, the broker acknowledges, dispatch is rejected, and a resource that checks authority refuses; an already-sent call is recorded `uncertain`. A crash between dispatch and commit is reconciled to `committed` or `none`; duplicate retry is refused.
6. Cognate, SEA-Forge, and the resource/observation produce signed evidence that a separate verifier can check without trusting the UI.

No protocol, app, or subsection is extended before this slice passes. Failure preserves the failed evidence and classifies the defect before retry.


### 13. Platform guarantees and unsupported modes

| Platform | S1 mechanism | S1 claim | Unsupported / fallback |
|---|---|---|---|
| Windows x64 | Service SID + named pipe with client-SID check; non-exportable CNG key with DPAPI-NG service-only descriptor | Identity/issuance after custody and authorization probes | No `Jail`/`Isolated`; no local S2; if no qualified service custody, no agent authority |
| macOS x64/arm64 | LaunchDaemon under `_horizon`, XPC code-signing requirement, System Keychain ACL | Identity/issuance after custody and authorization probes | No `Isolated`; App Sandbox is not per-workload identity; no local S2; otherwise no agent authority |
| Linux x86-64 | Systemd dedicated account, Unix socket `SO_PEERCRED`, TPM2/keyring or service-only key | Identity/issuance after custody and authorization probes | `Isolated` only where the measured Landlock/user-namespace/mapping prerequisites pass; no local S2 |
| Linux ARM64/Jetson | Same contract as Linux, measured on the host | Identity/attribution and non-isolated bounded work after probes | `Isolated` unavailable on the inspected Ubuntu 22.04 `5.15.185-tegra` host (Landlock absent/`ENOSYS`, `newuidmap` missing); no S2 |
| Browser only, no qualified issuer | No agent execution issuance | P0/P1 local human work only | No agent identity or P3 authority; reserved actions refuse |

S1 requires a qualified issuer service plus A3-UV for new human-reserved decisions after Stage 3. During Stage 0B only, the local A3-T path is the interim confirmation for the local containment scope; it is retired as the production path when A3-UV is available. S2 is a separate deployment profile: the issuer and SEA-Forge authority must be outside the hostile desktop boundary and A3 must be a separate trusted device. **A local single-host desktop is never S2**, even if the issuer runs as a service. S2 on a managed/remote deployment is claimed only after the S2 lane passes.

Portable identity does not imply portable isolation. An `Isolated` request on an unsupported host fails closed with `isolation_unavailable`; identity, attribution, P0/P1 work, and non-isolated P3 work that policy permits continue. Windows and macOS never inherit Linux isolation. WSL and Tauri inherit host limitations unless separately measured. A host with no qualified issuer serves P0/P1 local human sessions and refuses new agent authority; it does not disable unrelated human work.

### 14. Resolved U1–U6

The three categories are now explicit: **S** decisions are frozen before implementation; **I** investigations are timeboxed and produce a preferred mechanism plus a measurable fallback; **Q** gates are necessarily measured after implementation. No U item remains an open design choice.

| ID | Category | Decision | Dependency and closure gate |
|---|---|---|---|
| U1.A | S | Issuer is a protected service with exclusive custody and an enrollment/issuance authorization model. First choice is an existing protected host service; second is a dedicated Cognate broker under a separate service account; third is a remote organizational issuer. It never accepts a caller-supplied principal, role, or actor, and never exposes key material. | Stage 0A freezes the contract and profile; Q2 at Stage 1 closes enrollment, principal mapping, holder binding, rotation, and zero unauthorized issuance. |
| U1.B | I | Probe each platform for service identity, IPC peer authentication, key ACL/non-exportability, agent-account read/write/signal access, and restart/rotation. Preferred and fallback are in section 3. Timebox: 2 engineer-days per native lane, 8 total. | Before Stage 1. Pass requires zero agent-account signing attempts, zero key export, zero principal substitution, and a clean restart/rotation. Failure selects the fallback or withholds agent authority. |
| U2.A | S | The v1 catalog in section 11 is closed. Any unlisted operation or unmapped handler is Px. The manifest is generated from `.sea` declarations and reviewed at 0A. | Stage 0A. Pass requires exhaustive write-handler coverage and no P2/P3 downgrade path. |
| U2.B | S | A2/A3 bind the exact operation, tenant, trust domain, requesting execution, policy digest, schema/domain separator, nonce, revisions, and approval/continuation ID. Unknown predicates or weaker evidence fail closed. | Stage 0A fixtures; enforced in Stages 2–3. |
| U3.A | S | V1 human-reserved confirmation is A3-UV through the paired phone remote, with an authority-sourced canonical operation and a trusted-verifier receipt. Recovery is a single-use offline recovery code plus new-device enrollment at the local console; recovery cannot approve or create authority. Stage 0B uses the local A3-T terminal path only. | Stage 0A freezes the schema and fixtures only. Runtime phone success, page/relayed refusal, and recovery are Q4 at Stage 3. |
| U3.B | I | Qualify phone/terminal independence, pairing, loss, replacement, compromised-device response, and recovery-code replay. Preferred phone A3-UV; fallback is no confirmation for the affected reserved operation. Timebox: 3 engineer-days. | Before Stage 3. Pass requires zero browser-controlled enrollment/display/consumption and blocked recovery without an independent anchor. |
| U4.A | S | V1 constants: credential maximum 15m; offline 5m; A3 challenge 2m; pairing 5m; pending approval 10m; P2/P1 grant maximum 8h; P3 external-commitment grant maximum 1h; delegation depth maximum 2; clock tolerance 60s. A P3 grant without an explicit numeric budget is refused. | Stage 0A policy file. Constants may be tightened by measurement, never loosened without owner approval. |
| U4.B | Q | Renewal, revocation, budget, and commit thresholds are measured only after implementation. Targets: renewal p99 ≤250ms local and ≤1s remote; connected admission revocation p99 ≤2s local and ≤10s remote; dispatch rejection p99 ≤5s; channel closure p99 ≤10s; resource commit decision p99 ≤5s or the resource is marked unsupported. Sample 1,000 operations per lane with forced failures; zero stale admissions, zero duplicate commitments, and zero budget overruns. | Stages 2, 4, 6. Failure retains the conservative setting or disables the affected capability. |
| U5.A | S | Platform guarantees in section 13 are the v1 claim matrix. Unsupported isolation or custody disables only the affected authority, never local reads or unrelated P0/P1 work. | Stage 0A preregistration; Stage 6 native lanes. |
| U5.B | I | Jetson and any host below the measured Landlock/namespace/mapping floor are verified as `Isolated`-unsupported. Preferred: run on a qualified host; fallback: identity plus non-isolated operations whose policy row permits them; no silent isolation downgrade. Timebox: 1 engineer-day for the existing Jetson probe, repeated after kernel changes. | Before Stage 6 claim. Pass requires a typed `isolation_unavailable` and no spawn of an isolation-required operation. |
| U6.A | S | Evidence fields, authority, retention, tombstones, and unavailability behavior are fixed in section 10. No raw assertion or credential is retained; a signed verifier receipt is. | Stage 0A schema. Pass: every field has an owner, reader, writer, retention, and redaction rule. |
| U6.B | Q | Access and deletion qualification: cross-tenant reads, unauthorized reads, expired-record behavior, tombstone integrity, and verifier-receipt verification. 1,000 sampled records per producer; zero unauthorized reads, zero unverifiable records accepted as authority, and 100% of deleted authority records leave valid tombstones. | Stages 4–6. Failure blocks the affected evidence claim. |

The policy constants are the v1 contract, not production measurements. The investigation timeboxes are estimates for planning; exceeding one does not authorize an open-ended design choice—the named fallback applies and the affected claim is withheld.


### 15. S1 acceptance criteria and S2 limits

**S1 is accepted only when all of the following hold:**

1. **Issuer:** a protected service has exclusive key custody, enrollment is independent of the agent, issuance rejects caller-selected principals, and an agent-account process cannot read, replace, signal, or use the issuer key.
2. **Execution identity:** Cognate creates and propagates distinct execution and attempt identities; the human initiator is `acting_for`/initiator, never the executor; retries, restarts, and nested calls preserve the execution and supersede old attempts.
3. **Local path:** P0/P1 human and agent-owned work continues without SEA-Forge or a new ceremony while the session/execution and local scope are valid; a local reserved decision has exactly one Cognate continuation writer.
4. **Human-reserved decisions:** a page session, page WebAuthn, agent label, relayed challenge, or session content cannot produce A3; the paired phone A3-UV canonical challenge succeeds; an unavailable or lost channel refuses only the affected reserved action.
5. **P3 autonomy:** a bounded SEA-Forge grant authorizes exact P3 work without a redundant human ceremony; an operation outside the grant, budget, resource, or policy is refused with no effect.
6. **Revocation:** admission, dispatch, and external commitment are reported separately; the authority and issuer epochs are distinct; acknowledged revocation yields zero new admissions/dispatches; an in-flight effect is `uncertain`; an unacknowledged boundary is not reported complete.
7. **Restart, offline, clock:** no authority is created by restart, resume, renewal, rollback, offline time, or a copied credential; the five-minute low-risk window and 15-minute credential ceiling are enforced; P2/P3 gain no offline grace.
8. **Evidence:** every governed operation has attributable, signed authority/verifier records and an independently checkable digest; missing or expired evidence renders `verification_unavailable` and cannot establish authority.
9. **Legacy:** no `legacy/unbound` continuation, outbox, approval, or gateway can create a new effect; rebinding is explicit and revocable; rollback cannot restore an unbound path.
10. **Platform truth:** every claim is backed by a native lane; unsupported `Isolated`, custody, or A3 disables only the affected operation and never claims S2.
11. **Evidence of testing:** no required test is skipped, no fake wire or mock establishes a boundary claim, and the minimum vertical slice passes before consumer rollout.

**S2 limits.** S2 is not claimed on a local single-host desktop, a same-user agent, a page ceremony, or an A3-T terminal. It requires an issuer and SEA-Forge authority outside the hostile desktop boundary and a separate trusted A3 device. S2 remains a stronger deployment profile, not a prerequisite for S1. A deployment that cannot meet S2 continues at S1 only where the S1 threat assumptions still hold; otherwise it refuses the affected protected operations. Unrelated local P0/P1 work remains available, but no S2-only control is silently downgraded.

### 16. Qualification gates

These gates follow implementation; they do not reopen the design.

| Gate | When | Procedure | Pass threshold |
|---|---|---|---|
| Q1 contract | 0A | Cross-language fixtures for every record, canonical vector, unknown version, unknown field, holder proof, human/agent/console variants, entitlement-backed root grant, caller-discriminated `params.run_start` (human without `grant_ref`, agent with, human supplying `grant_ref` rejected), dispatch resolution (P0/P1 target stays local, P2/P3 target governed, unknown target is Px, forbidden caller kind refused), agent redelegation inside a redelegable parent, and tamper case | Every fixture matches; no unknown/weak record is accepted; no human request ever carries a fabricated grant |
| Q2 custody/issuance | 1 | Agent-account read/write/signal attempts; forged principal/role; wrong holder; restart; rotation; enrollment replay | Zero signing/key access/issuance substitution; restart refuses without issuer |
| Q3 local/governed | 2 | SEA outage, local P0/P1, governed P2/P3 refusal, entitlement-backed human P2, root grant creation, grant amplification, concurrent siblings, crash reservation, gateway identity, `capability.invoke` resolving a P1 target with SEA-Forge down, and an agent redelegation that attempts to widen, exceed depth, or redelegate a human-reserved decision | Local P0/P1 survive, including through a dispatch; entitlement-backed human P2 succeeds; governed work fails closed without its required entitlement/decision; zero amplification or duplicate effect; every widening redelegation refused at SEA-Forge |
| Q4 A3 | 3 | Page assertion, relayed challenge, wrong tenant/operation/revision, expiry, replay, lost device, recovery code, local P2 | Zero page/relay approval; exact phone A3 and local P2 succeed; recovery only enrolls |
| Q5 vertical slice | 4 | The six observations in section 12 against a controlled resource | All six pass; no mock/simulated boundary |
| Q6 evidence | 5 | Altered, substituted, expired, cross-execution, and unsigned records; producer unavailable | Zero unverifiable record accepted as authority; tombstones valid |
| Q7 platform | 6 | Native Windows x64, macOS x64/arm64, Linux x86-64, Linux ARM64; unsupported isolation/custody; S2 remote lane | Each advertised claim has a recorded result; zero required skips; unsupported claims disabled |
| Q8 legacy | 7 | Unbound continuation/outbox/approval, mixed-version, rollback, gateway fallback | Zero new effects from unbound work; mixed-version/rollback refused |

Latency and load measurements use 1,000 operations per lane after warm-up, with forced revocation, renewal, crash, and provider-failure cases. Zero-tolerance security cases are repeated 100 times; any success is a failure. A threshold miss keeps the conservative policy value or disables the affected capability; it never silently relaxes the guarantee.



## Critical User Journeys

These journeys define observable product behavior, not implementation steps. Every journey must also be exercised in blocked, unknown, denied, contradicted, duplicate, interruption, and recovery states.

### J01 — Explore: a human and an agent navigate together

**Actor:** human operator and a registered research Expert. **Profile:** S1.

1. The human opens Horizon. The browser session resolves to the human principal; the agent connects through its own agent instance.
2. The human asks the agent to compare two related cases. The agent reads the visible world and proposes a composed view.
3. Horizon shows the proposal as agent-authored with its execution reference. The human opens, edits, and saves a private annotation.
4. No shared authority is created. The agent cannot execute a consequential operation from the page, and the human's click does not become a delegation grant.

**Expected:** fluid exploration; independent agent attribution; `authorship: unverified` on any session-controlled text an agent could influence; no confirmation prompt for P0/P1. **Negative:** if the agent labels content `human_decision`, Horizon shows it as unverified and SEA-Forge refuses it as authority. **Evidence:** agent instance, execution, proposal reference, provenance envelope.

### J02 — Operate: bounded reversible work without ceremony

**Actor:** human operator and a Workbench Expert. **Profile:** S1.

1. The human opens a case and starts the Expert with a local P1 scope for annotations and drafts on that case until the end of the session. This is local scope, not a SEA-Forge delegation; if a durable delegation is desired, that is `grant.create` and requires A3.
2. The human asks the Expert to reorganize the case notes. The Expert creates an execution and attempts the work.
3. Cognate's local policy confirms the execution covers the operation and resource. No A3 ceremony appears because the work is reversible and inside the local scope.
4. Horizon shows `executed by` the Expert, `acting for` the human, and the local scope reference. The human can revert the change.

**Negative:** the Expert asks to change case visibility to the whole organization. That is P2 and human-reserved; the request refuses with `human_confirmation_unavailable` until an A3 channel confirms the exact change. The unchanged P1 work remains available.

### J03 — Build: autonomous consequential work inside a grant

**Actor:** human sponsor and a build Expert. **Profile:** S1.

1. The sponsor has an existing SEA-Forge entitlement to delegate the requested bounds. After an A3-UV confirmation of the exact `grant.create` operation and SEA entitlement check, the sponsor creates a bounded P3 grant for a build-and-deploy operation, with a named environment, a spend ceiling, an expiry, and an explicit autonomous-execution policy. A page session alone cannot create it.
2. The Expert plans the change, requests SEA-Forge authorization for the exact operation, and receives a decision and effect fence inside the grant.
3. The build proceeds without a redundant human ceremony. Gauntlet records the run and attempt bound to the execution; the critic envelope contains no builder identity.
4. The deploy reaches a resource that checks the authority lease at commit and records `committed`.

**Negative:** the plan exceeds the spend ceiling or targets another environment. SEA-Forge refuses before dispatch; the refusal names the failed bound and does not offer a silent fallback to the human's broader authority. **Recovery:** rerunning requires a new operation and, if policy requires, a new grant or A3 decision.


### J04 — Monitor: revocation during an active operation

**Actor:** human operator, build Expert, and an external resource. **Profile:** S1.

1. The operator revokes the Expert's delegation while a long build is running.
2. SEA-Forge advances the authority epoch and stops new admission. The issuer mirrors the revocation for identity, the local broker acknowledges with its dispatch epoch, rejects the stale fence, and cancels queued attempts. Open channels close or reauthenticate. Until acknowledgement, Horizon reports the connected guarantee as pending, not complete.
3. The resource checks the authority token at commit. A call that had not started is prevented. A call already sent returns `uncertain`, not `cancelled`.
4. Horizon presents three separate states: admission stopped, dispatch prevented, commitment `uncertain`. It does not claim the external effect was undone.
5. On reconnection, the execution reconciles the provider outcome and records `committed` or `none`; duplicate retry is refused.

**Negative:** a provider that cannot check authority at commit is labelled as not supporting commitment prevention, even if admission and dispatch stopped.

### J05 — Compare: a human-reserved choice on an independent channel

**Actor:** human operator, two proposal agents, and a paired phone. **Profile:** S1.

1. Horizon displays two proposals and a reserved decision to select one for publication.
2. The authority creates one pending approval for the exact operation digest: selected proposal, revision, world, frame, and delegation head.
3. The phone fetches the canonical operation directly from the authority, shows both proposals and the effect, and obtains WebAuthn UP+UV.
4. One agent modifies a proposal revision before the human confirms. The approval becomes stale; consumption refuses with `operation_changed`.
5. The human reviews the new revision through a fresh challenge and confirms. The approval is consumed once and the publication is authorized.

**Negative:** the browser page shows a different proposal or a reworded summary. The signed digest does not match the authority record, so the page display cannot create approval. **Denied:** the human rejects; no publication and no delegation change. **Duplicate:** replaying the assertion or confirmation consumes nothing and creates no second effect.

### J06 — Develop: platform truth and qualification

**Actor:** developer, qualification harness, and a Jetson host. **Profile:** identity capability with S1 limits.

1. The developer registers an agent on the Jetson host. The issuer proves the agent instance and execution; SEA-Forge issues a bounded grant for non-isolated work.
2. The agent requests an operation that requires SEA-Forge `Isolated`. The host reports `isolation_unavailable` because Landlock is absent and `newuidmap` is missing. The request fails closed; identity and audit still work.
3. Horizon shows the claim as `identity: available`, `isolation: unsupported`, and does not display S2 protection.
4. The qualification harness runs the same contract tests on Windows, macOS, Linux x86-64, and Linux ARM64. Each platform reports its own custody, isolation, and A3 results.
5. A Windows or macOS host that cannot satisfy the per-workload backend reports the same honest limitation rather than inheriting Linux claims.

**Negative:** a configured CI lane that did not run is not evidence. A local single-user desktop with a user-owned issuer key is reported as not S1, regardless of a passing login test.


### Journey state matrix

| State | J01 Explore | J02 Operate | J03 Build | J04 Monitor | J05 Compare | J06 Develop |
|---|---|---|---|---|---|---|
| Happy | view composed | bounded note change | deploy committed | three guarantees shown | A3 approval consumed | identity and limits shown |
| Blocked | agent cannot write shared state | P2 needs A3 | over-budget refused | stale fence rejected | no A3 channel | `Isolated` unsupported |
| Unknown | unclassified action shown as unavailable | Px refused | Px refused | `uncertain` outcome | stale revision | custody unmeasured |
| Denied | caller label ignored | agent self-approval refused | policy denies | revocation refuses admission | human rejects | platform claim denied |
| Contradicted | session text not human intent | grant scope conflicts | operation digest mismatch | provider says committed, local says uncertain | displayed op differs from canonical | CI claim conflicts with measured host |
| Duplicate | repeated proposal keeps one reference | repeated click no second effect | idempotency does not bypass authority | duplicate retry refused | assertion replay refused | duplicate qualification run does not alter claims |
| Interruption | reconnect reloads attribution | execution resumes with new attempt | restart requires issuer | in-flight call reconciled | approval expires | probe interrupted, no claim recorded |
| Recovery | read-only until current | revalidate grant | new attempt, same execution | reconcile before governed work | fresh A3 on new revision | rerun qualification before claim |


## Appendix A — Record Schemas and Operation Rows

All records use the common envelope: `schema_version: string`, `tenant_ref: string`, `trust_domain_ref: string`, `issued_at: timestamp`, `issuer_ref: string`, and a base64url `signature` where the producer signs. Epochs are unsigned 64-bit integers; money/quota values are decimal strings with an explicit unit, never floating point; timestamps are RFC 3339 UTC. Any operation row that names `case_record.authority` also requires `case_authority: local | governed` in its pending record; the field is immutable for that pending record, and a replacement record named by `supersedes_ref` carries the same `case_authority` and the same `operation_id` as the record it replaces. A row whose authority comes from outside the local continuation — every P3 row, and any row whose authority writer is SEA-Forge or the issuer root — requires `case_authority: governed`; a local pending record and an interim A3-T receipt may not stand in for a governed decision. A row that takes its authority from the case record must state the authority the case record carries, and a pending record that claims a different one is refused.

| Record | Required fields | Nullability / rule |
|---|---|---|
| `Credential` | `iss`, `sub`, `aud`, `jti`, `iat`, `nbf`, `exp`, `execution_ref`, `attempt_ref`, `holder_jwk`, `delegation_ref`, `authority_epoch`, `issuer_generation` | `delegation_ref` is required and nullable only for a local P0/P1 execution; it is non-null for governed execution. A human caller has no credential. |
| `OperationDescriptor` | `operation_id`, `caller_kind` (`human_session`, `agent_execution`, or `local_console`), `caller_ref`, `parameters`, `params_schema_ref`, `nonce`, `issued_at`, `expires_at`, `resource_refs`, `expected_revision`, `world_ref`, `case_ref`, `frame_ref`, `execution_ref`, `delegation_ref`, `policy_digest`, `idempotency_key` | `execution_ref`/`delegation_ref` required for `agent_execution` except a local P0/P1 execution may have null delegation; null for human/console. `case_ref`/`frame_ref` required for P2/P3 and per row for P0/P1. `caller_ref` is the session, execution, or console principal, never a target execution |
| `DelegationGrant` | `grant_ref`, `parent_ref`, `delegator_ref`, `agent_ref`, `execution_ref`, `audience`, `operations[]`, `resource_selectors[]`, `data_labels[]`, `budget` (`amount`,`unit`,`remaining`), `not_before`, `expires_at`, `depth_remaining`, `redelegate`, `offline`, `human_evidence`, `authority_epoch` | `parent_ref` and `execution_ref` are null for a root grant; a child grant requires a live parent and may bind an execution |
| `AuthorityDecision` | `decision_ref`, `grant_ref`, `entitlement_ref`, `operation_digest`, `resource_refs`, `amount`, `decision`, `policy_digest`, `authority_epoch`, `expires_at`, `approver_ref` (null if policy-only), `reservation_ref` | `grant_ref` null only for root `grant.create` or an entitlement-backed human P2/P3; `entitlement_ref` must then be non-null and current, and it names a record of the `sea_forge.human_entitlement` interface that binds the same subject, operation, scope, ceiling, epoch, and expiry (section 9.1). `approver_ref` null only for an autonomous policy decision; a human-reserved decision requires it |
| `Approval` | `approval_ref`, `operation_digest`, `requester_ref`, `executor_ref`, `approver_ref`, `tenant_ref`, `policy_digest`, `expires_at`, `nonce`, `state` (`pending`,`consumed`,`rejected`,`expired`) | `approver_ref` must differ from requester/executor; `executor_ref` is null for a human-only decision; `nonce` single use |
| `EffectFence` | `fence_ref`, `caller_ref`, `decision_ref`, `grant_ref`, `entitlement_ref`, `execution_ref`, `attempt_ref`, `resource_refs`, `amount`, `operation_digest`, `expires_at`, `authority_epoch`, `dispatch_epoch`, `supersedes_ref` | `grant_ref` null for an entitlement-backed human P2/P3; `entitlement_ref` is then required and names a record of the `sea_forge.human_entitlement` interface that binds the same subject, operation, scope, ceiling, epoch, and expiry (section 9.1). `execution_ref`/`attempt_ref` null for a human/console caller; `supersedes_ref` null only for the first attempt; fence is immutable |
| `A3Receipt` | `verifier_ref`, `key_id`, `device_ref`, `principal_ref`, `tenant_ref`, `trust_domain_ref`, `operation_digest`, `challenge_digest`, `policy_digest`, `up`, `uv`, `sign_count`, `assurance_predicate`, `protected_terminal_presence`, `verified_at`, `expires_at` | No raw assertion. `assurance_predicate` is exactly `A3-UV` or `A3-T`. `uv` must be true for A3-UV. `protected_terminal_presence` is a separate boolean claim: true for A3-T, false for A3-UV. A receipt that claims one without the other is refused, and the claim is never spelled as a predicate |
| `EvidenceRecord` | `producer`, `producer_record_id`, `trace_id`, `operation_digest`, `refs[]`, `assurance_predicate`, `authority_epoch`, `issuer_generation`, `observation_outcome`, `effect_outcome`, `content_hash`, `supersedes_ref` | `supersedes_ref` null for first record; no credential or private content; `observation_outcome` is `observed`/`failed`/`refused` and `effect_outcome` is `none`/`uncertain`/`committed` |
| `PendingOperation` | `pending_id`, `operation_id`, `caller_kind`, `requester_ref`, `params_schema_ref`, `parameters`, `nonce`, `operation_digest`, `resource_refs[]`, `expected_revision`, `world_ref`, `case_ref`, `frame_ref`, `case_authority` (`local`,`governed`), `policy_digest`, `execution_ref`, `delegation_ref`, `session_ref`, `confirmer_ref`, `presence_evidence`, `created_at`, `expires_at`, `confirmation_code`, `launch_generation`, `state` (`pending`,`confirmed`,`dispatching`,`applied`,`uncertain`,`expired`), `effect_class` (`db_local`,`external`), `effect_idempotency_key`, `supersedes_ref`, `local_receipt` | `confirmer_ref`, `presence_evidence`, and `local_receipt` are null while the state is `pending` and are written only by the confirmation step, never by the caller; a `confirmed`, `dispatching`, `applied`, or `uncertain` record carries all three. `execution_ref`/`delegation_ref` are null for a human or console caller. `case_authority` is immutable for the record. The confirmation code is single use |
| `Refusal` | `code`, `boundary`, `operation_id`, `effect` (`none`,`uncertain`,`committed`), `missing_or_expired`, `repair` | `repair` may be null only when no lawful repair exists |

`params_schema_ref` is `params.<operation_id with dots replaced by underscores>` for every P2/P3 row, except the explicit aliases: `remote.start`, `remote.refresh`, `remote.stop` → `params.remote_control`; `approval.approve`, `approval.reject` → `params.approval`; `gauntlet.run.cancel` → `params.run_cancel`. The alias operation ID fixes `action`/`choice`; a supplied value that disagrees with the operation ID is refused. `expert.install`, `expert.configure`, `expert.answer`, and `expert.remove` have separate schemas. **Every live-bound P0/P1 row names its own schema.** `params.read` and `params.local_write` are the class defaults for a row that has no parameters of its own, and a live-bound row that reads a body, a form or a query names the schema that describes exactly those fields: the generic defaults do not name `operation_ref`, `expected_outcome`, `row_id`, `draft_id`, `text` or `mode`, so a confirmation digest made from a generic default would be made from a description of the operation other than the one that runs. The build check compares every one of the thirty-seven verified rows against the handler that reads it.

**A parameter schema names the wire fields the handler consumes.** A schema that names a field the handler does not read describes an effect that cannot happen; a schema that omits a field the handler reads cannot cover the effect it does. The frozen schemas therefore carry each field's **wire name** (the name on the wire, which differs from the contract's own name where the protocol uses another), and the manifest's binding check compares every governed row and every agent-door row against the live source: a field the handler reads and the schema does not name, or a field the schema names and the handler does not read, fails the build. The `op` and `tool` selectors and the `request_id` are the protocol's own and are excluded from that comparison.

The frozen parameter schemas are:

<!-- BEGIN GENERATED: parameter-table -->
| Schema | Fields (wire names) |
|---|---|
| `params.read` | `target_ref:string`, `query:string|null`, `expected_revision:uint64|null` |
| `params.local_write` | `target_ref:string`, `expected_revision:uint64`, `value:json` |
| `params.human_answer` | `panel:string`, `ask:string`, `outcome:"answered"\|"deferred"\|"cancelled"`, `value:string_or_string_array`, `version:string`, `owner_rev:integer`, `note:string|null?` |
| `params.ask_route` | `panel_id:string`, `ask_id:string`, `routed_as:string` |
| `params.ask_reassign` | `panel:string`, `ask:string`, `from_key_id:string|null`, `to_key_id:string`, `confirmed:boolean` |
| `params.ask_withdraw` | discriminated by `code_op`: **`ask.withdraw`** → `panel_id:string`, `ask_id:string`, `reason:string`; **`human.stop_waiting`** → `step:string` |
| `params.owner_pin` | `id:string`, `pinned:boolean` |
| `params.workspace_label` | `session:string`, `event:string`, `record_seq:uint64|null`, `verdict:string|null`, `first_failure:string`, `return:string?` |
| `params.handoff_send` | `draft_id:string`, `text:string`, `case_id:string`, `review:{step_id:string}`, `also_starts:string_array?`, `plan_precondition:{ref:string, expected_digest:string}`, `assign:boolean?` |
| `params.lesson_decide` | `card_id:string`, `choice:"accept"\|"reject"`, `preview_code:string`, `records:[{ref:string, expected_digest:string}]`, `reason:string?` |
| `params.case_task_complete` | `card_id:string`, `choice:"accept"`, `preview_code:string`, `records:[{ref:string, expected_digest:string}]`, `reason:string` |
| `params.case_task_decide` | `card_id:string`, `choice:"accept"\|"reject"`, `preview_code:string`, `records:[{ref:string, expected_digest:string}]`, `reason:string?` |
| `params.decision_hold` | `card_id:string`, `choice:"hold"`, `preview_code:string`, `records:[{ref:string, expected_digest:string}]`, `reason:string` |
| `params.decision_release` | `card_id:string`, `choice:"release"`, `preview_code:string`, `records:[{ref:string, expected_digest:string}]`, `reason:string?` |
| `params.approval` | `card_id:string`, `choice:"accept"\|"reject"`, `preview_code:string`, `records:[{ref:string, expected_digest:string}]`, `reason:string?` |
| `params.remote_control` | `action:"start"\|"refresh"\|"stop"` |
| `params.device_pair` | `ticket:string`, `credential:json` |
| `params.device_remove` | `device_ref:string`, `expected_revision:uint64` |
| `params.device_recover` | discriminated by `via`: **`code_console`** → `recovery_code:string`, `new_credential_id:string`, `public_key:jwk`; **`paired_device`** → `approving_device_ref:string`, `new_credential_id:string`, `public_key:jwk` |
| `params.expert_install` | `expert_id:string`, `manifest_ref:string`, `public_key:jwk`, `expected_revision:uint64` |
| `params.expert_configure` | `expert_id:string`, `config:json`, `expected_revision:uint64` |
| `params.expert_answer` | `expert_id:string`, `ask_id:string`, `value:string_or_string_array`, `expected_revision:uint64` |
| `params.expert_remove` | `expert_id:string`, `reason:string`, `expected_revision:uint64` |
| `params.grant_create` | `sponsor_ref:string`, `agent_ref:string`, `operations:string_array`, `resources:string_array`, `budget:{amount:decimal, unit:string}`, `audience:string`, `expires_at:timestamp`, `depth_remaining:uint64`, `redelegate:boolean`, `offline:boolean` |
| `params.grant_revoke` | `grant_ref:string`, `reason:string`, `expected_revision:uint64` |
| `params.grant_redelegate` | `parent_ref:string`, `child:{agent_ref:string, operations:string_array, resources:string_array, budget:{amount:decimal, unit:string}, expires_at:timestamp, depth_remaining:uint64}` |
| `params.run_cancel` | `run_ref:string`, `reason:string`, `expected_revision:uint64` |
| `params.trust_rotate` | `new_root_ref:string`, `reason:string` |
| `params.capability_invoke` | `target_operation:string|null`, `parameters:json`, `resource_refs:string_array`, `amount:{value:decimal, unit:string}|null`, `idempotency_key:string` |
| `params.external_commit` | `target_operation:string`, `parameters:json`, `resource_refs:string_array`, `amount:{value:decimal, unit:string}` |
| `params.run_start` | discriminated by `caller_kind`: **`agent_execution`** → `case_id:string`, `also_starts:string_array`, `grant_ref:string|null`; **`human_session`** → `case_id:string`, `also_starts:string_array` |
| `params.workspace_export` | `kind:"labels"\|"comparison"`, `standins:string?`, `source:string?`, `day:string?`, `only:string?`, `repo:string?`, `session:string?`, `label_error:string?` |
| `params.isolation_request` | `operation_ref:string`, `isolation_class:"isolated"` |
| `params.horizon_search_read` | `q:string|null`, `day:string|null`, `tag:string|null` |
| `params.horizon_search_record` | `q:string`, `day:string|null`, `tag:string|null`, `record:true` |
| `params.agent_response_read` | no fields |
| `params.session_pair` | `code:string` |
| `params.session_logout` | no fields |
| `params.agent_surface_publish` | `surface:{id:string, title:string?, step:string|null?, blocks:[json]}` |
| `params.agent_surface_arrange` | `action:{op:"surface.remove"\|"view.focus"\|"view.place", id:string}` |
| `params.agent_surface_annotate` | `panel:string`, `text:string`, `tone:string?` |
| `params.agent_question_ask` | `panel:string`, `ask:{id:string, question:string, input:"select"\|"multiselect"\|"confirm"\|"text"?, why_needed:string?, options:[{option_id:string, label:string?, consequence:string?}]?, resolves:string|null?}`, `step:string|null?` |
| `params.human_panel_open` | `template:string`, `title:string?` |
| `params.human_panel_close` | `id:string` |
| `params.horizon_health` | no fields |
| `params.horizon_settlement_request` | `intent_id:string`, `phase:"observe"\|"rule"` |
| `params.horizon_diagnostics_read` | no fields |
| `params.horizon_economics_read` | no fields |
| `params.horizon_remote_status` | no fields |
| `params.horizon_navigation_intent_commit` | `operation_ref:string`, `expected_outcome:json|null?` |
| `params.horizon_surface_intent_commit` | `transport:"gui"\|"cli"\|"mcp"`, `node_id:string?`, `operation:string?`, `frame_id:string?`, `intent_id:string?` |
| `params.horizon_note_save` | `body:string`, `case_ref:string|null?`, `tags:string_array?`, `links:object_array?`, `note_id:string?`, `shared_with_agents:boolean?` |
| `params.horizon_draft_save` | `draft_id:string`, `text:string`, `mode:string?` |
| `params.horizon_conversation_discard` | `row_id:string` |
| `params.horizon_case_open` | `purpose:string` |
| `params.horizon_lesson_propose` | `text:string`, `source:string?`, `proposed_by:string?` |
| `params.horizon_onboarding_skip` | no fields |
| `params.horizon_onboarding_resume` | no fields |
| `params.remote_health` | no fields |
| `params.remote_state_read` | no fields |
| `params.remote_events_read` | no fields |
| `params.remote_pair_redeem` | `secret:string` |
| `params.remote_session_challenge` | no fields |
| `params.remote_session_authenticate` | `ticket:string`, `credential:json` |
| `params.remote_session_logout` | no fields |
| `params.horizon_workspace_presenting` | `on:string?`, `return:string|null?` |
<!-- END GENERATED: parameter-table -->

The table is generated from `contracts/identity/v1/params.yaml` and checked field for field by
`scripts/check-design-contract-consistency.ts`, so the design and the frozen contract cannot
disagree about what a parameter is. A field marked `?` is optional and a field marked `|null`
may be null; the two are independent, so a field may be both. A parameter is declared with the
type its value carries across the boundary: a JSON body field the handler reads as a number is
`integer`, and a form field the handler reads as text is `uint64` or `string`. The
`remote.start`, `remote.refresh` and `remote.stop` rows fix `action` and the
`approval.approve` and `approval.reject` rows fix `choice`; the field is named in the
schema so the fixed value has one home, and a supplied value that disagrees with the row's
operation ID is refused rather than ignored. The `device.recover` row is discriminated by
`via`: `code_console` is the local console path with the recovery code, and `paired_device`
is authorised by A3-UV from a different already-paired device, each with a fresh passkey
enrollment. The `grant.redelegate` row's agent variant needs no human evidence: it is gated by
the parent's `redelegate` permission, its remaining depth and the ancestor budget.

**The decision route carries one body, and each effect pins its own choice.** `POST /desk/decide`
is a dispatcher: the person names a card and a choice, and the server looks the card up and
resolves its kind. Every decision therefore arrives in the same body — `card_id`, `choice`,
`preview_code`, `records` and `reason` — and each effect's schema names that body with the
choice it allows and whether a reason is required. A hold carries a reason; a release carries
none; a lesson, an approval and a case task carry a reason the rules may refuse. The body is the
route's; the effect is the pair the catalog resolves.

**The settlement parameters are the intent and the phase, and the desk never reads them from the
request.** `horizon.settlement.observe` and `horizon.settlement.rule` name the intent they settle
and the half they settle; the phase is fixed by the operation the dispatch resolved. The phone
sends the intent in its command; the desk's settlement card carries the same two values inside
the card the server resolved, so the desk derives them rather than accepting them. The parameter
contract names the operation's parameters, and the build check compares them with the handler
that reads them.

Integer values are encoded as JSON strings, never JavaScript numbers; `uint64` and monetary decimals are strings. A nonce is a 128-bit base64url value generated by the authority; it is never reused for another operation.

`run.start` resolves its target operations from the pinned plan before authorization: every target must have exactly one reviewed operation row and one assurance predicate. Resolution authority follows the target classes, so a SEA-Forge outage never disables local work. A plan whose every target is local P0/P1 is resolved against the 0A manifest by Cognate, needs no grant, and makes no SEA-Forge call; a local P0/P1 execution therefore starts normally while SEA-Forge is unreachable. A plan containing any governed target is resolved and verified by SEA-Forge, and a mixed plan is bound at the highest class present and takes the SEA-Forge path for the whole run. **The caller never supplies the resolution.** The request names the case and the steps the person previewed, and the handler resolves the plan itself from the pinned plan; in the governed path SEA-Forge re-derives the same resolution and a request has nothing to disagree with. The resolved IDs and predicates are bound into the descriptor. A missing, duplicate, or conflicting target mapping makes the whole run Px; `run.start` has no generic fallback. Authority is never taken from the request: for an agent caller SEA-Forge verifies the declared `grant_ref` against the credential's delegation head and rejects a mismatch, while in the local-only path `grant_ref` must be null and the execution acts under its own local scope; for a human caller the entitled path resolves the caller's entitlement server-side from the authenticated principal. A human caller has no grant, so no grant is fabricated, defaulted, or synthesized to satisfy a shared schema.

#### P2/P3 policy rows


`params_schema_ref` is the exact parameter schema frozen at 0A; this table fixes executor, authority, evidence, and expiry. `offline` is never allowed for P2/P3.

| Operation | Executor | Authority writer | Human evidence | Pending expiry |
|---|---|---|---|---|
| `human.answer` | `human_session` | `cognate_local_continuation` | `A3-UV` | 10m |
| `ask.route` | `agent_execution` | `case_record.authority` | `A3-UV` | 10m |
| `ask.reassign` | `human_session` | `case_record.authority` | `A3-UV` | 10m |
| `ask.withdraw` | `agent_execution_or_human_session` | `case_record.authority` | `A3-UV` | 10m |
| `owner.pin` | `human_session` | `cognate_local_continuation` | `A3-UV` | 10m |
| `workspace.label` | `human_session` | `cognate_local_continuation` | `A3-UV` | 10m |
| `handoff.send` | `human_session` | `sea_forge` | `A3-UV` | 10m |
| `case.task.complete` | `human_session` | `case_record.authority` | `A3-UV` | 10m |
| `lesson.decide` | `human_session` | `cognate_local_continuation` | `A3-UV` | 10m |
| `remote.start`, `remote.refresh`, `remote.stop` | `human_session` | `cognate_local_continuation` | `A3-UV` | 10m |
| `device.pair` | `code_holder` | `cognate_local_continuation` | `LOCAL_ENROLLMENT_PRESENCE` | 5m |
| `device.remove` | `human_session` | `cognate_local_continuation` | `A3-UV` | 10m |
| `device.recover` | `local_console` | `cognate_local_continuation` | `RECOVERY_CODE_PRESENCE_FRESH_PASSKEY` | 5m |
| `expert.install`, `expert.configure`, `expert.answer`, `expert.remove` | `human_session` | `cognate_local_continuation` | `A3-UV` | 10m |
| `grant.create`, `grant.revoke` | `human_session` | `sea_forge` | `A3-UV` | 10m |
| `grant.redelegate` | `agent_execution_or_human_session` | `sea_forge` | `AGENT_NONE_HUMAN_A3_UV` | bound by parent grant expiry for an agent execution; 10m for a human session |
| `gauntlet.run.cancel` | `human_session` | `sea_forge` | `A3-UV` | 10m |
| `trust.rotate` | `local_console` | `issuer_root` | `ADMIN_PRESENCE_INDEPENDENT_ADMIN` | 30m |
| `approval.approve`, `approval.reject` | `human_session` | `sea_forge` | `A3-UV` | 10m |
| `case.task.decide` | `human_session` | `case_record.authority` | `A3-UV` | 10m |
| `horizon.settlement.rule` | `human_session` | `sea_forge` | `A3-UV` | 10m |
| `capability.invoke` | inherited from the resolved target row | inherited from the resolved target row | `PER_TARGET_ROW` | the resolved target row's expiry evaluated for the actual caller kind; an unresolvable target is Px and has no expiry |
| `external.commit` | `agent_execution` | `sea_forge` | `PER_TARGET_ROW` | grant expiry |
| `run.start` | inherited from the resolved target rows | inherited from the resolved target rows | `PER_TARGET_ROW` | the strictest expiry among the resolved target rows; an unresolvable plan is Px and has no expiry |
| `workspace.export` | `human_session` | `sea_forge` | `A3-UV` | 15m |
| `isolation.request` | `agent_execution` | `sea_forge` | `NONE` | grant expiry |

The executor, authority writer and human evidence columns use the canonical vocabulary the contracts declare: the executors `human_session`, `agent_execution`, `agent_execution_or_human_session`, `local_console` and `code_holder`; the authority writers `cognate_local_continuation`, `case_record.authority`, `sea_forge` and `issuer_root`; and the evidence requirement ids the A3 mechanism declares, which are the only ids a catalog row may name. `case_record.authority` is `local` when the case record carries a local continuation and `governed` when it carries a SEA-Forge decision. The `approval.approve` and `approval.reject` rows additionally require separation of duty: the approver is distinct from the initiating human, the requesting execution and the executor. The `isolation.request` row's capability gate fails closed where isolation is unsupported. `PER_TARGET_ROW` means the resolved target row's requirement, and `NONE` means the row needs no human evidence because its authority comes from somewhere else.
P0/P1 operations use the common local rules: P0 A0 read authority, P1 A0/A1 local scope, no delegation creation, no pending approval; `offline` is allowed only for P0/P1 under the five-minute rule. Their per-operation parameter schemas and route mappings are part of the same 0A manifest.

Two catalog clarifications are normative rather than descriptive. Dispatcher rows (`capability.invoke`, `run.start`) carry no authority of their own, so they previously stated per-caller expiry here; that phrasing was replaced because the invariant it protected — no grant for a human caller — is carried by the resolved target row, which already sets `grant_ref` null for a human caller. `grant.redelegate` moved out of the `grant.create`/`grant.revoke` row because those two remain human-only while redelegation is a narrowing operation an agent may perform inside a redelegable parent.
A third clarification is normative. `ask.route` and `ask.withdraw` name a human session as their executor because the wait they end is human-reserved, but the executor is the principal whose authenticated call acts (section 2): the agent's route claim is made on the agent door under a registered key, and the person's stopping the wait is made on the desk route under the signed-in session. The executor cell therefore names the agent execution for `ask.route`, and both callers for `ask.withdraw`; the class, the authority writer, the human predicate and the expiry are unchanged, so the agent proposes and the human authorises. A request-supplied role or executor never names either of them: the executor is the authenticated key, and it is recorded in the durable record.


## Review Record

The pre-revision draft was reviewed independently against the accepted authority report and brief by three fresh EGM lenses: design critic, implementation readiness, and adversarial security/platform. All 33 findings were consolidated into 16 dispositions; none were waived. The review found real blockers, principally the absence of a closed operation catalog and wire contract, incomplete issuance authorization, an underspecified A3 recovery channel, late legacy containment, and a sequence without a vertical slice. Those are resolved in sections 2–16 and Appendix A.

Five bounded closure rounds then ran against successive revisions, finding 34 defects. One final acceptance check against an immutable copy found one more and prescribed its exact correction. All 35 were local: caller discriminators, nullability rules, per-operation parameter schemas, alias constraints, Stage 0B restart recovery, `run.start` target resolution, entitlement-backed authority for human callers, and two catalog expiry cells that named a grant for a caller that has none.

A single focused check of the owner-identified corrections then ran against an immutable hash-pinned copy. It returned four defects — an incomplete Stage 0B state enum, a `db_local` restart rule that contradicted the launch-generation rule, a human redelegation path that assumed an agent delegation head, and a `run.start` schema that still forced a grant on local-only plans. All four were corrected exactly as the reviewer prescribed and each correction was verified structurally: the state enum now covers every state the text uses, `db_local` recovery is launch-scoped, human redelegation resolves through SEA entitlement rather than a fabricated delegation head, and a plan whose targets are all local P0/P1 resolves in Cognate with no SEA-Forge call.

A fifth correction was applied after that check, against the frozen specification rather than a reviewer. Stage 0B had bound `confirmer_ref` to the OS login and required it to match, which contradicts REQ-SEC-006: operator identity is "a configured, durable operator actor bound to a registered WebAuthn credential and mapped to a SEA-Forge actor (the OS account is diagnostic only)". The bullet now separates presence from identity, resolves `confirmer_ref` through the repo's existing operator-actor validation, records the OS session as `presence_evidence.os_session`, and refuses on operator-actor mismatch rather than OS-user mismatch. The edit stopped there: the session that made it terminated on an account quota before the surrounding Stage 0B text was swept, so the test description was still worded for OS-user refusal. That residue and the `horizon confirm` precondition are corrected above.

**None of the corrected text was independently re-verified.** Rather than a further prose review, all five corrections move to Stage 0A as machine-checked contract fixtures and negative tests, where a regression fails a test instead of requiring a reader. That is the stronger guarantee and it is why no further design-review cycle is planned.

Two findings are worth carrying forward as limits, not achievements:

- Closure rounds 2 and 3 were invalidated because this file changed while the reviewer was reading it. The final check therefore ran against a frozen `0444` copy with a declared hash. Reviewing a live-editing file does not produce a valid verdict.
- Reviewer acceptance establishes internal consistency and implementation sufficiency of the authority model. It establishes nothing about runtime behaviour, platform security, revocation latency, or cross-stack integration. Those are Q1–Q8 and the native platform lanes.

The Stage 0A contract set was then reviewed independently against a frozen, hash-pinned copy by a fresh critic, and the verdict was **REJECT**: five blocking findings, six must-fix findings, and two advisories. The five blocking findings were real and are recorded rather than argued away. The design's own catalog tables omitted ten reconciled operation IDs, so the design and the manifest disagreed about what exists; the evidence vocabulary did not match the A3 mechanism's canonical spelling, so a catalog row could name a requirement the mechanism contract never declared; the P2 parameter schemas did not bind the fields their handlers actually consume, so a confirmation digest could be made from a description of the operation other than the one that runs; the agent P2 path authenticated a registered key and then wrote, with no execution proof and no bounded delegation; and the pending record had no place in which to freeze `case_authority`.

Each correction was made in the contract set, not in prose alone. The manifest carries a `live_enforcement` block that states, for every live-bound row, the caller path it runs on, whether the runtime enforces it at this freeze, what enforces it, what is still missing, and the stage that closes the gap; the manifest loader refuses a governed row that claims enforcement it does not have. The parameter schemas are checked against the live handlers by a build check that compares every governed row and every agent-door row field by field, so a schema that drifts from its handler fails the build. The `PendingOperation` record kind and its three constraints are in the record contract, with cross-language fixtures on both sides. This file's section 11 names every reconciled row, its section 12's frozen parameter table matches the frozen schemas field for field, its Appendix A names the pending record and its authority rule, and the Stage 0B boundary states that the browser's pairing route is `session.pair` and not the reserved `device.pair`.

A second independent review against a re-frozen copy of the corrected contract set did run, on a fresh critic reading only the frozen tree, and its verdict was **REJECT**: five blocking findings, seven must-fix findings, and four advisories. The blocking findings were real. The A3-T receipt named `protected_terminal_presence` both as a predicate and as a claim that cannot satisfy it; the pending record's anti-substitution rules were listed in prose but excluded the pending record itself from their own `applies_to`; an operation the identity catalog did not know was not refused at the live intent boundary, so a current frame could turn it into a real write; the governed fixtures and the live wire types disagreed about `owner_rev` and about the fields a workspace-label descriptor carries; and Stage 0B listed `ask.route` as a success while the same catalog row required a bounded grant that Stage 0B does not have. The must-fix findings added the missing operation-specific schemas for every verified live P0/P1 handler, made the design's parameter table field-for-field with the contract, made the approval aliases data rather than prose, split the pairing caller path from local-console presence, checked the agent door's refused prefixes against the field the route actually uses, declared separation of duty on the export row, and stopped the two exceptional P2 ceremonies from inheriting A3-T. The advisories separated a candidate's observed locators from its bindings, registered the ninth signed record, froze a versioned external entitlement interface reference, removed a reference to a field the record does not carry, and encoded the A0-or-A1 disjunction as an explicit `any_of` rather than a list that read as a conjunction. The entitlement reference is now a frozen interface contract and not a name: section 9.1 names the owner, the version, the facts an entitlement must carry, and the rule that refuses while the owner has not published one.
Each correction was made in the contract set and in this file together. The A3 vocabulary is exactly two predicates with the terminal-presence claim beside them; the pending record carries the descriptor's own anti-substitution rules; the intent boundary classifies every reference before anything runs and refuses one the catalog does not know; the live P0/P1 handlers each name their own parameter schema and the binding check compares all thirty-seven verified rows against the source; the design's parameter table is generated from the contract and checked; the Stage 0B tables name only the operations Stage 0B can actually run; the pairing route's caller path is the code holder rather than the local console; and an entitlement-backed decision or fence binds to the facts the external interface declares, so a name alone is not authority. A third independent review against a re-frozen copy of this corrected set is the condition for Stage 0A to settle. **This file is frozen with the contract set, so the third verdict is recorded beside the frozen copy it read rather than in this document.** A verdict binds the bytes it read; editing this file afterwards to record the verdict would break that binding and invalidate the design hash the remediation preregistration pins. The first and second verdicts, the third verdict when it lands, the frozen copies they read, and the disposition of every finding are retained in [`.agents/evidence/2026-11-09-stage-0a-defects/`](.agents/evidence/2026-11-09-stage-0a-defects/).

A third independent review did run, on a fresh critic reading only a re-frozen copy of that set, and its verdict was **REJECT**: six blocking findings and four must-fix findings. The blocking findings were real. The live remote router — the phone's pairing, sign-in, session, command and read routes — was outside the catalog entirely, so the reconciliation that claimed no gap was false. `/desk/decide` multiplexed a P3 approval, a P2 lesson decision and a settlement through one handler and one class, so a card's effect depended on the body rather than on the server's resolution of the card. A deployment-bound reference was allowed on the plain intent path, which carries no pending record and no authority writer, so it could bypass the catalog's own minimum-P2 rule. The pending record did not make the caller channels mutually exclusive, so one record could name two callers. The evidence record's single outcome field carried two incompatible meanings, so a record could not say that an attempt was observed and refused at once. And the entitlement path accepted, in its own fixture, an artifact that no owner has published and that names no issuer key and no signature, so it was not independently authenticatable. The must-fix findings added the caller-channel exclusivity rule, the delegation-reference register that makes a human revocation possible without fabricating a grant, the pending replay and terminal-state rules, and the split of the liveness probe from the diagnostics read.

Each correction was made in the contract set and in this file together. The remote's routes are catalogued rows with their own caller paths, and the phone's approval command is **refused** rather than downgraded, because the remote path has no operation-bound pending record and no protected confirmation. `/desk/decide` and `/m/api/command` are dispatchers: the server resolves the card kind or the command phase, the catalog pairs it with the action, and a pair the catalog does not list is Px. A deployment-bound reference is refused on the plain intent path with its own reason. The pending record names exactly one caller channel, and the channel is the one its caller kind implies. The evidence record carries `observation_outcome` and `effect_outcome` separately. The external entitlement interface names the issuer key and the issuer's signature as facts it must carry, binds the subject per record kind, and refuses the path outright while the owner has published no artifact. The parameter table, the live-enforcement tables, and the external-interface table in this file are generated from the contract set and compared byte for byte, so a restatement cannot drift from the contracts it restates.

**This file is frozen with the contract set, so a verdict is recorded beside the frozen copy it read rather than in this document.** A verdict binds the bytes it read; editing this file afterwards to record the verdict would break that binding and invalidate the design hash the remediation preregistration pins. The first, second and third verdicts, the frozen copies they read, and the disposition of every finding are retained in [`.agents/evidence/2026-11-09-stage-0a-defects/`](.agents/evidence/2026-11-09-stage-0a-defects/). A fourth independent review against a re-frozen copy of this corrected set is the condition for Stage 0A to settle.

Implementation has begun at Stage 0A: the contract set, the issuer profile, the A3 mechanism, the cross-language fixtures, and the negative tests for the two recorded identity defects exist and are checked. The full finding-to-disposition record, the closure-round findings, reviewer identities, retained outputs, and the final acceptance verdict are in [`.agents/reports/2026-11-08-identity-authority-adversarial-review.md`](.agents/reports/2026-11-08-identity-authority-adversarial-review.md).

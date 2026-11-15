# Unified human and agent identity, delegation, and authority

* **Author:** Horizon agent investigation
* **Date:** 2026-11-08
* **Status:** candidate consolidated predecessor for formal drafting; architectural direction retained, open decisions and implementation mechanisms not owner-settled
* **Consolidated architecture:** [unified-human-agent-identity-authority.md](2026-11-08-unified-human-agent-identity-authority.md)

This brief owns the product problem, value, goals, non-goals, alternatives, and decision summary. The architecture report owns the canonical facts, constraints, candidate decisions, open questions, technical model, assurance rules, platform boundaries, migration, tests, and evidence. The report wins where a technical detail or acceptance rule is at issue.

## Overview

Horizon lets people and agents work in one shared workspace. A valid browser session currently cannot distinguish a person's action from an agent driving that browser, and an `x-horizon-source` header is only a caller claim. Across the stack, Cognate runs inherit the person who started them, Workbench Expert runs use a shared system actor, SEA-Forge's existing gateway delegation makes the human the effective actor, and Gauntlet's runner identity is configuration rather than authenticated identity.

The proposal creates one identity envelope and one delegation chain. Cognate owns the application identity contract, sessions, agents, executions, attempts, and propagation, with a default local issuer that can be replaced by a configured issuer. SEA-Forge independently owns bounded delegation, consequential authority, approvals, separation of duty, and revocation of governed grants. Horizon, Workbench, and Gauntlet consume verified contexts and display or record attribution; they do not become new identity or approval authorities.

Assurance follows the authority an operation exercises, not whether it writes state. Ordinary navigation, view work, annotations, and agent-owned reversible work remain fluid. Human-reserved decisions require fresh operation-bound verification on a review path trusted for the selected threat; under S1 that means A3. A3-UV uses WebAuthn; A3-T records protected-terminal presence as weaker evidence and never as WebAuthn or user verification. Consequential commitments require SEA-Forge online. Content sent through a human session is session-controlled and its authorship is unverified; agent authorship is claimed only through an agent execution identity.

The owner selected S1 as the initial browser-agent profile and preserved S2 as the required stronger profile for hostile desktop or same-user process deployments. Ordinary collaboration remains available under S1; human-reserved decisions require A3, an independent channel that reads the canonical operation directly from the protected authority and obtains fresh exact-operation verification. A3-UV uses WebAuthn; A3-T protected-terminal presence is allowed only where policy explicitly accepts that weaker evidence. The page is not a trusted review surface for human-reserved P2/P3 decisions under S1. A paired phone, protected terminal, or isolated native channel can satisfy A3 only when the browser agent cannot control it; without A3, only the reserved action is refused. Under S2, the issuer, authority, and confirmation channel must be outside the hostile process boundary and a separate trusted device is required. Root/kernel, issuer compromise after the fact, malicious authenticators, and coercion remain out of scope.

The issuer security property is that only a trusted component can use or replace its key material; the agent cannot read, signal, or inject into it. The topology is open: reuse an existing SEA-Forge or isolated host service when it meets the property, and add a dedicated issuer only if those cannot. A new daemon is not mandated. Enrollment, recovery, and trust-root rotation need independent human/authority approval.

## Analysis

**Current foundation.** Cognate has transport-resolved `Caller`, denial by default, scoped state, durable runs, correlation, replay, and continuations. The shared `@godspeed/identity` package has durable operator sessions, devices, WebAuthn UP+UV, generation-based revocation, and 36 passing focused tests. Workbench has a separate durable session ledger and 17 passing auth tests. Horizon has passkey pairing, operation ownership rules, and 42 passing focused tests. SEA-Forge has OS peer identity, exact-action move-only grants, single-use request-bound workload connections, and PostgreSQL renewal/revocation. Gauntlet has frozen references and role invocations; four focused domain tests passed.

**The gaps are semantic, not just wiring.** Cognate reconstructs an agent run's actor from `startedBy`, so it does not independently authenticate the executor. Workbench Expert runs require the system caller. SEA-Forge's delegated path intentionally records the end user as the effective actor, which must not be silently reused for agents that need to remain identifiable. Horizon's phone approval uses the signed-in session rather than a fresh operation-bound assertion. There is no common execution/attempt identity across Cognate and Gauntlet.

**Proportional policy.** Classify operations as P0 local presentation, P1 reversible collaboration, P2 shared or operator-reserved decisions, P3 consequential governed commitments, or Px unknown/sensitive. P0/P1 need only an authenticated session or execution and local policy. P2 needs exact operation checks and, under S1, A3 independent confirmation. P3 requires online SEA-Forge authorization plus any human evidence policy requires. Px fails closed. Unknown or contradictory classifications take the stricter path; no LLM or client label decides. Before the cross-stack migration, Horizon must apply early containment: keep low-risk interaction, stop treating caller labels as authority, and refuse unsupported reserved decisions or approvals unless one exact pending operation is confirmed through a protected channel.

An agent's standing or eligibility is not delegated authority. Authority is the intersection of its own eligible capability, the exact execution grant, scope, policy, and current operation decision. Session-controlled content keeps `authorship: unverified` across every handoff; it can inform a proposal but cannot become human intent, satisfy approval, or create/widen delegation.

**Lifecycle.** A registered Expert keeps a stable principal. An ad hoc agent gets an ephemeral agent instance. Each logical execution gets a distinct execution identity that survives credential rotation, restart, resume, and retry correlation. Each process dispatch gets an attempt identity. Execution credentials have an owner-selected provisional 15-minute maximum, rotate through a trusted broker, and preserve the execution ID. SEA-Forge grants bound audience, operations, resources, expiry, budget, offline use, and redelegation; children only narrow parents. Revocation cascades to descendants and open channels as well as new requests. Expired or revoked credentials get no grace.

**Offline.** P0/P1 work already authenticated locally may continue. Previously delegated low-risk work may continue for no more than an owner-selected provisional five minutes without fresh authority/revocation checking and never past its grant. No new delegation, privilege expansion, pending approval commit, or consequential action happens offline. A restart does not refresh the window: a new agent attempt needs the issuer and persisted authority/revocation records, and unverifiable time or a clock rollback fails closed. Shared budgets are pre-allocated to a disconnected device. Reconnection reconciles revocation and authority before governed work. Revocation distinguishes admission cancellation, dispatch prevention, and external commitment prevention; an external commitment cannot be prevented without the resource or its broker checking authority at commit. Losing SEA-Forge degrades capabilities; it never enables a bypass.

**Human evidence.** Authentication, human presence, user verification, operation binding, intent, and authorization are distinct. A WebAuthn assertion proves an authenticator-backed ceremony for a challenge; it does not prove the person understood a page controlled by an agent. Current registration accepts attestation `none`; synced passkeys can move between devices. Cognate continuations hold local reserved decisions and SEA-Forge approvals hold governed decisions, so Horizon need not add a third proposal ledger. The challenge binds the principal, operation, exact parameters, targets, revisions, world/frame, delegation head, approval ID, nonce, and expiry; consumption rechecks all of them.

**Platform truth.** The identity contract is portable across Windows, macOS, Linux x86-64, and Linux ARM64; deployment security is not. SEA-Forge's isolated per-workload identity is Linux-only and fails closed without its kernel/mapping prerequisites. The inspected Jetson runs Ubuntu 22.04 on `5.15.185-tegra`, with Landlock absent and `newuidmap` missing, so it can issue and verify identities but cannot use SEA-Forge `Isolated`. Windows uses named-pipe SID identity plus job-process control, not isolated workload identity; macOS has App Sandbox jail but not the Linux per-UID backend. Configured CI lanes are not evidence that they passed. A separate device does not establish independence if the hostile desktop can modify the authority or operation shown there.

**Evidence.** Cognate events carry identity references and the delegation head; SEA-Forge owns decisions, grants, and approvals; Gauntlet adds a versioned external binding record and durable attempt ledger without changing `role_result@v1`; RealityTrace observes without becoming an identity or approval store. Horizon shows who proposed, modified, authorized, executed, and settled, and marks legacy records `unknown`.

## Goals vs. Non-Goals

**In-scope goals:**

- Native human, registered-agent, ephemeral-agent, execution, attempt, and session identities with one portable contract.
- Automatic per-execution agent identity without an OIDC account per run.
- Agent-preserving delegation and attenuation that never turns an agent into the human.
- Short-lived credentials, renewal, revocation, and bounded offline continuation.
- Operation-derived human assurance and exact binding to state and authority records.
- Consistent propagation through Connect, AG-UI, MCP, A2A, SFWP, Cognate events, Gauntlet, and RealityTrace.
- Honest cross-platform capability statements and adversarial conformance tests.
- A migration path from current Horizon, Workbench, and SEA-Forge records without rewriting history.

**Out-of-scope non-goals:**

- Requiring SPIRE, Docker, Kubernetes, or an external OIDC account for every execution.
- Making Cognate a competing authority for consequential actions.
- Making Horizon or Gauntlet an approval or identity database.
- Requiring terminal confirmation or WebAuthn for every mutation.
- Treating WebAuthn as proof of comprehension or authorization.
- Claiming isolation on a platform or deployment that cannot enforce it.
- Implementing the design in this task.

## Alternatives Weighed

- **All identity and approval in SEA-Forge:** rejected because ordinary application sessions and local collaboration would depend on the governance authority; SEA-Forge remains independent authority, not the account directory.
- **Cognate owns identity and authority:** rejected because it creates two governance authorities and lets the runtime enlarge its own grants.
- **Keep the initiating human as the executor:** rejected because agents become anonymous extensions of the person and cannot be revoked or audited independently.
- **Keep Horizon long-lived agent keys:** insufficient because they identify a caller-selected key, not an execution or delegation; they can support registered-agent enrollment only.
- **New standalone identity daemon:** deferred until a deployment or trust boundary demonstrates the need; start with a shared contract and default issuer.
- **Mandatory SPIRE:** rejected for the first version because packaging and attestation do not cover every target; adopt SPIFFE-compatible semantics and make SPIRE optional.
- **RFC 8693 on every local call:** rejected as unnecessary local token-service overhead; use it at delegated/external boundaries.
- **WebAuthn everywhere:** rejected because it adds friction without containing a hostile display.
- **Desktop-page or terminal-only confirmation:** rejected as universal mechanisms; they are valid only when the agent cannot control that surface.
- **Separate approval record in Horizon:** rejected because SEA-Forge already owns governed approval and Cognate already owns local pending continuations.

## Owner Decisions, Candidate Staging & Next Steps

These separate owner-settled requirements from candidate mechanisms for formal design; neither is implementation approval.

1. Adopt one context contract with distinct initiator, executor, execution, attempt, connection, delegator, gateway, and authority references.
2. **Owner settled:** Cognate owns the identity contract and default issuer integration; a configured issuer is replaceable. The minimum process/service and key-custody topology remains open (U1). SEA-Forge independently validates identity proof and owns bounded authority.
3. **Owner settled:** Use P0–P3 plus Px operation classes and A0–A3 assurance levels; under S1, human-reserved P2/P3 decisions require A3 rather than page-based A2. Classify in `.sea`, not route names or client labels. Exact operation mapping remains U2.
4. Preserve stable Expert identities, add ephemeral agent instances and per-execution/attempt identities, and keep credentials out of evidence.
5. Reuse Cognate continuations and SEA-Forge approvals. Bind A2/A3 verification to their canonical operation records and exact revisions.
6. Permit bounded P0/P1 offline work; deny new delegation and all P3 offline. Restart or unverifiable time cannot extend freshness.
7. Keep SPIRE optional, RFC 8693 at boundaries, and the existing OIDC/WebAuthn mechanisms as donors.
8. **Owner settled sequencing:** Land interim Horizon containment before the cross-stack migration: preserve low-risk interaction, stop trusting caller labels, and refuse unsupported reserved actions or approvals. Exact containment scope remains design work.
9. Migrate in stages after containment: Cognate propagation, SEA-Forge authority bridge, Gauntlet binding, consumer migration, then platform qualification. Classify pre-cutover runs/continuations as legacy/unbound and require rebinding before any new effect.
10. Keep the critic envelope unconditionally free of builder identity; audit attribution remains outside it.
11. Proceed to `/egm-draft` from this predecessor. Do not implement until the formal architecture and platform-specific guarantees are reviewed and U1–U6 are resolved.

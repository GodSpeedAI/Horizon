# Stage 0B: implementation status and integration dependencies

Branch `horizon-desk-gaps`, head `e95b83a` plus this round's uncommitted changes. Owner decision: Option B. Production device.pair stays refused until the authority, identity and permission integration below is implemented and validated. No PR is open. No critic is running. Re-review waits until integration evidence changes.

## 1. What is implemented and verified

Verified means a test or checker in this repository asserts it. Tests against the P3 double are labelled as such.

| Area | Status | Evidence |
|---|---|---|
| P2 remote lifecycle: start, refresh, stop, redeem, sign-in, sign-out | Implemented, verified | `remote-controller`, `remote-sessions`, `E2E-remote` (9 pass) |
| Containment: pending descriptors, confirmation codes for the generic gate, single use, wrong-code and expiry refusals | Implemented, verified | PE-53..59, NE-41..46 |
| Classification: observe rows P3 by effect; device settlement rows refused at the route | Implemented, verified | PE-37, identity-remediation-3, catalog checker |
| Revocation: stop and refresh end waiting and confirmed enrolments; stopped listener refuses old cookies, including after restart | Implemented, verified | PE-64..67, NE-65 |
| Races: serialized commands; CAS on pending state; abandon races; expiry | Implemented, verified | NE-51, NE-59..61, PE-71 |
| Designated writer and atomic local transition | Implemented, verified locally | NE-69, NE-70; store CAS only |
| Separated audit roles for a committed enrolment | Implemented, verified | NE-72 |
| Compensation after a failed identity or ledger step, audited | Implemented, verified | NE-71 |
| Production refusal: no P3 authority wired, so enrolment is refused with `authority_unavailable` before anything is held | Implemented, verified | NE-73, NE-74 |
| P3 decision required before approval and activation; digest-bound | Implemented, verified against the test double only | NE-75 |
| A3-UV controller approval of the exact operation digest | Implemented, verified against the test double only | NE-50..NE-54, NE-63 |

The enrolment mechanism is therefore verified only in test rigs that wire `test/support/p3-authority-double.ts`. That double approves everything. It is not SEA-Forge and carries no policy meaning. No production module imports it.

## 2. What is specified but unavailable

These are not implemented. They are the dependencies in section 4.

- A SEA-Forge P3 decision for device enrolment. `sea_forge.human_entitlement` is unpublished.
- Identity-service verification of authorization evidence before it issues a credential. The vendored API accepts none.
- Downstream enforcement of controller permissions.
- Bootstrap of the first controller.
- Recovery from zero active controllers.
- A cross-service saga with durable reconciliation.

## 3. Authority categories: no substitution

Each category below is a different kind of fact. Evidence from one category never counts as another.

| Category | What it establishes | Who produces it | What it cannot establish |
|---|---|---|---|
| A3-UV evidence | An independently verified human was present and user-verified, and signed this exact operation digest | The active controller's passkey, verified by Horizon against the identity service's stored key and sign count | That the operation is authorized by policy |
| SEA-Forge P3 decision | The operation is authorized under the applicable policy, by the designated P3 authority | SEA-Forge (unavailable) | That a person was present, or that a credential was issued |
| Identity-service issuance | A credential was created and is bound to an operator | The identity service | That the operation was authorized, or that the ledger activated it |
| Store CAS | A local transition from one state to the next happened exactly once, against the expected revision | Horizon's durable store | Any authorization, or any effect outside Horizon's store |
| Downstream permission enforcement | A route or service refused an action outside the controller's granted scope | Each downstream route or service | Anything about enrolment |

Current runtime state: the P3 decision is supplied only by a wired `P3Authority` (none in production). The A3-UV proof is verified. Issuance checks no evidence (gap 2). Store CAS enforces local transitions. Permissions are bound in the digest and audit only (gap 4).

## 4. Dependencies

Each row names the owning component, the contract it must meet, the implementation work, and the acceptance tests. Acceptance tests are the gate: a dependency is closed only when its tests pass in the component that owns it.

| ID | Owner | Required contract | Implementation work | Acceptance tests |
|---|---|---|---|---|
| D1 | SEA-Forge | `decide(operation_id, operation_digest, tenant, operator, pending_id)` returns `approved` with a signed `decision_id`, or `denied`, or `unavailable`. The decision is bound to the digest and expires. | Publish the device-enrolment entitlement and decision API. Horizon's `P3Authority` client wraps it. | A SEA-Forge contract test with a real signed decision. Refused on `denied`, `unavailable`, expiry, and digest mismatch. NE-73 is retired only when a real client is wired and a production build passes it. |
| D2 | Identity service (Cognate-owned, vendored) | `enrolDevice` and `replaceDevices` accept `{authorization_decision_id, approval_digest, a3uv_proof}`, verify them before issuance, and create the credential in a `pending_activation` state that cannot sign in. | Change the identity service, then re-vendor. Horizon passes the evidence and the decision reference. | Identity refuses a write with no evidence, a wrong digest, a missing decision, or a replayed proof. A `pending_activation` credential cannot authenticate until activation. |
| D3 | Horizon remote boundary now; Cognate/identity for session scope | Each controller session carries its granted permissions. Every remote route checks scope before it runs. | Horizon: a route-scope table for the remote surface, enforced in the remote server before dispatch. Identity: scope claims on the session. | For every remote route, a controller without the permission is refused. Route and transport tests cover the same operation via another path. No credential with restricted permissions activates until this passes. |
| D4 | SEA-Forge (decision), identity service (operator identity), local console (presence) | Bootstrap and recovery are a separate exceptional authority class, `bootstrap_controller` and `recovery_controller`. Each requires an independently verified operator, a SEA-Forge P3 decision of that class, a single use, an expiry, and an audit record. | Define the class in SEA-Forge policy. Identity records the operator. Horizon exposes it only on the local console. | First-controller enrolment succeeds only with the decision. An agent or `registered_agent` session is refused. A second use is refused. An expired decision is refused. The audit names each role. |
| D5 | Horizon store, identity service, SEA-Forge | Saga states: `requested` (unusable), `decided` (SEA-Forge), `approved` (A3-UV), `issued` (identity, pending activation), `activated` (ledger), `signed_in`. Each step is idempotent on `(pending_id, digest)`. Compensations revoke the issued credential and abandon the pending record. Uncertain outcomes fail closed and go to reconciliation. | Horizon: reconciliation job over incomplete records by age and state. | Crash injection after every step leaves no usable credential. Reconciliation completes a fully evidenced enrolment, or compensates the rest. Duplicate delivery of each step is idempotent. |
| D6 | Same as D4 | First controller can be created without an existing controller. | Same as D4. | Same as D4, plus: `device.pair` without a live controller is refused until a bootstrap decision exists. |

Mapping to the six gaps the critic named: gap 1 is D1. Gap 2 is D2. Gap 3 is D5. Gap 4 is D3. Gap 5 is D4 (recovery). Gap 6 is D6.

### What partial completion can and cannot do today

- Identity credential issued, ledger row not yet written: the phone cannot sign in through Horizon, because sign-in requires a live ledger row (`src/remote/server.ts` `liveDevice`). The identity service's own `authenticateDevice` is not gated by the ledger, so a direct call could still use the credential. This is a residual until D2 adds `pending_activation`.
- Ledger row written, identity credential revoked by compensation: the ledger row is revoked too (NE-71 path). No usable authority remains.
- Approval written, no P3 decision: impossible, since the P3 decision is a precondition of the request (NE-74, NE-75).

### Bootstrap and recovery, specified

Both are exceptional authority operations. They are not ordinary P2 pairing shortcuts.

- Bootstrap: the local console performs an operator-verified passkey registration. The identity service records the operator. SEA-Forge issues a `bootstrap_controller` decision for that exact credential and operator. That decision is single-use and expires quickly. Horizon accepts it only from the local console, never from a remote or agent session.
- Recovery: from zero active controllers, the same flow with a `recovery_controller` decision. It revokes nothing that is still live. It issues a fresh invitation only after the decision is recorded.
- Both are refused for any session of kind `registered_agent`, `agent_execution`, or `device_credential`, and both are audited with each role separate.

## 5. Controller permissions: the enforcement boundary

The permission bound into the digest is `remote_controller`. Its scope is the remote surface's P2 routes: start, refresh, stop, the phone's operations and its own sign-out. It does not include desk-only routes, delegation, grants, or any P3 operation.

Boundary: the remote server dispatch is the enforcement point for remote sessions. A route not in the controller's scope is refused before its handler runs, whatever transport delivered the request. Identity-side scope claims (D3) are the second layer.

Until D3's acceptance tests pass, no credential with a restricted permission activates. Production refusal (NE-73) guarantees this in production today.

## 6. Proposed split

The owner asked whether contained Stage 0B work can be a separate reviewable PR. Checked against history: it cannot be split at a commit boundary. `76312f3`, `1e9d287`, `977e2d2` and `c305010` introduced terminal-code enrolment, and `c64eb19` still carries it. Cutting at `c64eb19` would ship the design the owner rejected.

Proposed instead:

- PR-1, containment and classification: built as a new series on `main`. It carries the containment, classification, revocation and race work, with the enrolment hunks left out. The enrolment routes are absent in that PR. Estimated size: the containment and catalog hunks only. Needs a hunk-level extraction and a fresh validation run; not started.
- PR-2, enrolment: the A3-UV authority chain with the production refusal (NE-73 to NE-75). It stays non-executable in production because no P3 authority is wired. It opens only after D1 and D2 are available, or as a reviewable non-executable build.

Neither PR is opened in this round. Opening PR-1 needs a clean extraction first, which I can produce on your go-ahead.

## 7. What Horizon can complete locally now

- D3, the remote route-scope table and its enforcement at the remote dispatch layer.
- D5 (Horizon side): the saga state model over the existing pending and enrolment records, the reconciliation job, idempotent step keys, and crash-injection tests.
- The PR-1 extraction and validation.

## 8. What Cognate/identity must supply

- D2: evidence-verified issuance and the `pending_activation` state. Plus the scope claims for D3.
- D4 and D6 (identity side): operator recording for the bootstrap and recovery classes.

## 9. What requires SEA-Forge

- D1: the device-enrolment P3 decision, bound to digest and expiry.
- D4: the `bootstrap_controller` and `recovery_controller` policy classes and their decisions.

## 10. Gate state

- Production device.pair: refused (`authority_unavailable`). Remains refused until D1 and D2 pass.
- Critic: stopped. Resumes only after D1 or D2 changes the evidence.
- No PR opened, nothing merged, no branch deleted.

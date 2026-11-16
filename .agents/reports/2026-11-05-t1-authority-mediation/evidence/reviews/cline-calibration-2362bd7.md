## Findings

**1. Blocker — `decide`**
`delegation.onBehalfOf` is spread into `on_behalf_of` with no validation at all, while `resolveApproval` at least runs `isActor`. Failing input: `decide(op, "world-1", undefined, undefined, { onBehalfOf: undefined as any })` → `{...undefined}` is `{}`, so `on_behalf_of: {}` is written to the socket. Worse, `decide(op, "world-1", undefined, undefined, { onBehalfOf: { actor_id: "cognate-service", role: "service" } })` sends the **service** as the human — the one thing the domain forbids — because nothing compares `onBehalfOf.actor_id` with `this.actor.actor_id` or constrains `role`. Violates both "validation before bytes" and "service must never be sent as the human".

**2. Blocker — `resolveApproval`**
`isActor` accepts any non-empty actor, so the service identity passes as the resolver. Failing input: `resolveApproval({ approvalId: "ap-1", resolution: "approved", onBehalfOf: { actor_id: "cognate-service", role: "service" } })` → succeeds and records the service actor as the human who approved. Same for `{ actor_id: "cognate-service", role: "human" }` (role is not checked against a human/operator set). No `onBehalfOf.actor_id !== this.actor.actor_id` guard anywhere.

**3. Major — `listApprovals`**
The default `= {}` only covers `undefined`, and `options.timeoutMs` is then read unguarded. Failing input: `await authority.listApprovals(null as any)` rejects with `TypeError: Cannot read properties of null (reading 'timeoutMs')` instead of returning an `AuthorityFailure`, breaking the "new methods must never throw" contract (`approvalState` is only safe because it passes no argument).

**4. Major — `call` (via `listApprovals` / `approvalState`)**
`call` now requires `response.ok === true` before the caller sees the body, but the removed `authority_approvals` handling accepted any object with an `approvals` array. Failing input: response line `{"approvals":[{"approval_id":"ap-1","state":"pending", ...}]}` (no `ok` key) → `listApprovals` returns `{ ok: false, errorClass: "error", error: "no detail" }` and `approvalState("ap-1")` returns `"unknown"`, where the previous code returned `"pending"`/`"approved"` for the identical bytes. Any poll loop silently stops progressing.

**5. Major — `parseApprovalStanding` (and therefore `listApprovals` / `approvalState`)**
`resolved_by` is tolerated only when it is literally `null`. Failing input: row `{"approval_id":"ap-1","state":"pending","requester":"u1","world_ref":"w1","operation_kind":"k","operation_name":"n","resource_id":"r1","subject_actor_ref":"a1","request_ref":"q1","expires_at":"2026-11-05T00:00:00Z"}` with the key omitted rather than set to `null` → `resolvedRaw` is `undefined`, `undefined !== null` and `typeof undefined !== "string"`, so the whole row is dropped and counted in `excluded`. Pending escalations disappear from the listing and `approvalState("ap-1")` reports `"unknown"`.

**6. Major — `authorityClosure`**
The request id is derived from `operationId` alone (`${prefix}:closure:${operationId}`) while the request body carries the discrimination/verification observation ids. Failing input: `authorityClosure({ operationId: "op-1", discriminationObservationId: "d1", verificationObservationIds: ["v1"] })` followed by `authorityClosure({ operationId: "op-1", discriminationObservationId: "d1", verificationObservationIds: ["v1","v2"] })` → both use `request_id` `p:closure:op-1`; the second submission is collapsed onto the first by the server's per-id semantics, and the client reports `{ ok: true, b, c, committed_at, on_time }` for evidence it never actually submitted.

**7. Major — `resolveApproval`**
The request id `${prefix}:${approvalId}:${resolution}` omits the delegating operator, so two distinct humans resolving the same escalation produce byte-identical ids. Failing input: operator H1 sends `{ approvalId: "ap-1", resolution: "approved", onBehalfOf: { actor_id: "h1", role: "operator" } }`, then H2 sends the same with `onBehalfOf: { actor_id: "h2", … }` → identical `request_id` `p:ap-1:approved`; H2 receives `{ ok: true }` from the deduplicated exchange while H2's identity never reaches the audit trail. Two different logical operations, one id.

**8. Minor — `resolveApproval` / `authorityClosure`**
`requestIdPrefix` and `operationId` are never validated even though `APPROVAL_ID` (which permits `:`) is used for the middle segment, so ids are not injective. Failing input: config `requestIdPrefix: "p:x"` with `approvalId: "y"` yields `p:x:y:approved`, colliding with `requestIdPrefix: "p"` and `approvalId: "x:y"`. Likewise `operationId: "a:closure:b"` under prefix `p` collides with prefix `p:closure:a` and operation `b`. Also no length cap: `operationId: "o".repeat(5_000_000)` puts a 5 MB string into `request_id`.

**9. Minor — `listApprovals` / `resolveApproval` / `authorityClosure`**
Per-call `timeoutMs` is passed through unvalidated; `?? this.timeoutMs` only replaces `null`/`undefined`, so `NaN` survives into `setTimeout`. Failing input: `await authority.listApprovals({ timeoutMs: NaN })` (or `{ timeoutMs: 0 }`, `{ timeoutMs: -1 }`) → timer fires immediately and the call returns `{ ok: false, errorClass: "unreachable" }`, misreporting a bad argument as a network failure instead of `invalid_input`.

**10. Minor — `exchangeOnce`**
The oversize guard compares `buffered.length` (UTF-16 code units) against `maxBytes`, which is documented and used as a byte budget. Failing input: an `authority_approvals` page of 8 MiB of 3-byte UTF-8 characters (e.g. CJK) reports `buffered.length ≈ 8 Mi`… only after `~24 MB` of decoded string has been accumulated; `LIST_RESPONSE_LIMIT` therefore permits roughly triple the intended memory before `ResponseTooLargeError` fires.
# Goldfish Annotated Review Report — Stage 5 (v2 → v3)

Status: resolved
**Target:** `design_draft.md` v2 (full file) · Findings: `zoom_out_report.md`
Mode: operator-directed autonomous run ⇒ "auto accept" of PROPOSE FIX items. No ESCALATE items.
Every disposition below was checked by the Elephant against source at `sea-rs origin/main 22bf66a3`, `cognate 87333bce`, `Horizon 18f0c40`, `cognate-workbench 96f7fb0`.

### [1] egm-zoom-out — Blocker — exception orphaned by adapter deletion
* **Scope:** Goal 3, Goal 4, D4
* **AI Suggestion:** PROPOSE FIX
* **Justification (verified):** `Horizon/src/adapters/delegating-authority.ts:13,27` sends `authority_request` through `seaForgeCall` imported from the adapter D4 deletes; its envelope comes from the SDK's own `buildAuthorityRequest`, its request id is the SDK's `operationId`, and its answer is read by the SDK's `interpretDecision`. The only thing it adds over `SeaForgeAuthority.decide` (`cognate/packages/runtime-bun/src/sea-forge-authority.ts:324-328`) is the `on_behalf_of` block. The server parses `on_behalf_of` at the identity layer for every verb (`sea-forge-server/src/identity.rs:182, 704-785`: honoured only from the configured gateway uid, for an allowlisted actor and held role). So the SDK can carry it without new server work, and moving the transport does not change who is allowed to delegate. The "needs its decide path until T2" rationale has no support in source.
* **Proposed Edit:** SDK `decide` gains an optional delegated principal; Horizon's delegation guards (unmapped operator refused; service identity never sent as the human) stay in Horizon and call it. INV-2 becomes strict with **zero** exceptions; `docs/inv2-exceptions.md` is not created. Test/script raw sockets stay allowlisted by directory. `scripts/gateway-setup.ts` and `test/support/j02r2-rig.ts` added to the blast radius.

### [2] egm-zoom-out — Major — UUID request ids regress idempotency
* **AI Suggestion:** PROPOSE FIX
* **Justification (verified):** The server requires a caller-supplied `request_id` on every durable mutation and binds it to the payload hash: same id + same payload dedupes, same id + different payload is refused `request_id_reused` (`sea-forge-server/src/lib.rs:2010-2070, 2120-2165`). A fresh UUID per call means a caller-level retry or a process restart after an ambiguous timeout sends a new id, so dedup no longer applies. The current ids are already deterministic per logical operation (`horizon:${approvalId}:${resolution}`, `horizon:closure:${operationId}`, `workbench:${approvalId}:${resolution}`).
* **Proposed Edit:** Keep the existing id formats byte-for-byte, with the prefix taken from a required constructor `caller` option. That keeps dedup across retries, restarts and the upgrade itself (an in-flight pre-upgrade resolve retried post-upgrade sends the same id). `listApprovals` is read-only and has no id.

### [3] egm-zoom-out — Major — `listApprovals` actor claim contradicts code
* **AI Suggestion:** PROPOSE FIX
* **Justification (verified):** `Horizon/src/app.ts:1011` and the adapter send the **service** actor; Workbench (`governance.ts:125`) and SDK `approvalState` (`sea-forge-authority.ts:416`) send none. The server's `AuthorityApprovals` takes no filter (`lib.rs:917, 3003`): `actor` is the identity claim, not a filter. SDK `approvalState` parses the same rows.
* **Proposed Edit:** Drop the `actor` parameter. `listApprovals()` sends the constructor-configured identity like every other verb (Horizon: service; a client constructed without one sends none, preserving Workbench). `approvalState` is rebuilt on `listApprovals`, so there is one row parser.

### [4] egm-zoom-out — Major — `get_schema` wire change unacknowledged
* **AI Suggestion:** PROPOSE FIX
* **Justification (verified):** `sea-forge-server/src/sfwp/mod.rs:452-470` returns a hardcoded `workbench/packages/contracts/schema/{name}.schema.json` path and the `SCHEMA_TYPES` names. Both the home move and the rename change that response. The consumers are in-repo only (`workbench/apps/desktop/src/pages/SystemContractPage.tsx`, `tests/conformance_sfwp.rs`). A grep of Horizon/src, cognate/packages, cognate-workbench/src and SWE_SEED found no other consumer.
* **Proposed Edit:** Narrow the compatibility sentence to approval payloads, list the `get_schema` change as the one wire-visible change of 0.4.0, and put `mod.rs` path generation in PR 1's scope.

### [5] Nit — one operator-visible change; `onBehalfOf` should be required
* **AI Suggestion:** PROPOSE FIX (verified: `governance.ts:139-141` already sends `on_behalf_of`). Overview states one operator-visible change; `onBehalfOf` is required on `resolveApproval`.

### [6] Nit — reuse the existing checker and fake socket
* **AI Suggestion:** PROPOSE FIX. Teeth extend `scripts/check-boundaries.ts`; the fixture harness is extracted from the existing fakes in `sea-forge-authority.test.ts` and `sea-forge-busy.test.ts`.

### [7] Nit — label the contracts-home move as a rider
* **AI Suggestion:** PROPOSE FIX.

### [8] Nit — Δ codes without a legend; dangling Non-Goals reference; file detail
* **AI Suggestion:** PROPOSE FIX (legend and dangling reference). The review history moves out of the design body: v3 drops Δ markers and points to `RESOLUTION.md` and this file. File-level lists stay, but only in the Technical Plan (DetailedRange), where Stage 9 needs them.

**Counts:** 8 accepted (4 fixes to Blocker/Major, 4 Nits fixed), 0 contested, 0 escalated, 0 declined.

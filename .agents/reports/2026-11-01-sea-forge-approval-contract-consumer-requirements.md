# SEA-Forge approval contract: Horizon consumer requirements

Date: 2026-11-01. Status: draft for the SEA-Forge owners. Horizon consumes this contract; it does not define it.

## What already exists in SEA-Forge (`/home/sprime01/projects/sea-rs`)

- **Pending approval shape.** `workbench/packages/contracts/schema/PendingApproval.schema.json` defines one approval for an inbox: `approval_id`, `case_id`, `run_id`, `plan_item_id`, `decision_id`, `requested_at`, `expires_at`, `expired`, plus optional `criteria_ref`, `criteria_sha256`, and a `governance` context (eligible actors, evidence refs, matched rule, approval and decision source records). `ApprovalListResult.schema.json` wraps a list of these.
- **List verb.** `authority_approvals` (read-only, `crates/sea-forge-server/src/cep_authority.rs`, `list`) returns every approvable escalation and its state.
- **Resolve verb.** `authority_approval` (`cep_authority.rs`, `resolve`) records the approve or reject decision as the verified resolver. Horizon already uses this verb (`src/adapters/sea-forge-approvals.ts:64`).

Horizon should adopt these shapes and verbs. It should not add a parallel approval record.

## What Horizon does today, and where it falls short

| Need | Today in Horizon | Gap |
| --- | --- | --- |
| Name the escalation a human must answer | Regex on the attempt's free-text reason, `awaiting approval <id>` (`src/ui/workspace/model.ts`, `moveOf`) | The approval id is not a typed field on the attempt record. Any change to the wording breaks it silently. |
| Show who may answer | Not shown. Horizon checks only that the operator id is configured. | `governance.eligible_actors` exists in the schema but Horizon never reads it. |
| Show the escalation's state | Only the one commit's receipt | No inbox. `authority_approvals` is not called. |
| Show why a decision may be refused | Not shown | `expired` exists in the schema; Horizon does not read it. |
| Credit a commit to SEA-Forge | Fixed in this branch: uses `decisionEnvelopeId` from the governed invocation (`src/adapters/settlement.ts`, `authorityOf`) | The decision is recorded in the invocation metadata, not on the intent record. Horizon has to find it through the run stream. |
| Write a decision | `authority_approval` over a raw Unix socket, copied from Cognate Workbench (`sea-forge-approvals.ts`) | Cognate exports no approval call. The socket write lives in Horizon, which should not own it. |

## Requirements for SEA-Forge and Cognate (producers)

1. **R1: typed approval id on the commit attempt.** When a commit awaits approval, the recorded attempt carries `approval_id` as a structured field alongside the free-text reason. Horizon reads the field and stops parsing text.
2. **R2: decision reference on the commit.** The commit's record carries the SEA-Forge `decision_id` or `decisionEnvelopeId` in a typed field, so the receipt can name it without digging through the run stream.
3. **R3: eligibility and expiry in the list.** `authority_approvals` returns `eligible_actors` and `expired` for each row, which Horizon needs to show who may answer and whether an answer is still valid.
4. **R4: Cognate exports the approval call.** Cognate exports the `authority_approval` call so Horizon does not carry its own socket client. Until then, the Horizon adapter is a documented readiness debt, as its file header already says.

## Non-goals for this contract

- Horizon does not decide approvals and does not evaluate eligibility itself. It displays what SEA-Forge returns.
- Horizon does not define settlement criteria. `criteria_ref` and `criteria_sha256` are shown as SEA-Forge's values.

## Test expectations once the contract is adopted

- A pending approval appears in the inbox from `authority_approvals`, not from the commit's text.
- The approve and reject controls are shown only for actors listed in `eligible_actors`, and the refusal is shown when SEA-Forge refuses.
- An expired approval shows as expired and offers no approve control.
- A commit with no approval id and no decision id is never shown as approved or allowed.

## Next step

Send R1 to 4 to the SEA-Forge owners as a proposal in the `sea-rs` repository. Horizon makes no change to `sea-rs` from this repository.

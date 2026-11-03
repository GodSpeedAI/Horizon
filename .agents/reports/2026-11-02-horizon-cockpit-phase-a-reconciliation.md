# Horizon cockpit: Phase A reconciliation and design record

Date: 2026-11-02. Branch: `horizon-cockpit-projection-review` (head `db114ab` at start).
Inputs: four read-only reconnaissance passes (scratchpad files `recon-cognate-store.md`,
`recon-identity-approvals.md`, `recon-casework.md`, `recon-horizon-state.md`), the Goldfish brief v3
(`2026-11-02-horizon-cockpit-concepts-brief-v3.md`), and the owner decisions (three messages, 2026-11-02).

This record separates what is decided, what is verified, and what remains a hypothesis. Each later
phase must update its status here rather than treat this document as proof.

## 1. Source-of-truth decisions

| Concern | Authoritative owner | Horizon's role | Basis |
| --- | --- | --- | --- |
| Operator authentication (human) | Horizon WebAuthn session today; Cognate-carried identity target | Establishes session | `src/remote/webauthn.ts:266`, `sessions.ts:10-18` |
| Approval verdict and approval state | SEA-Forge (`authority_approval`, `authority_approvals`) | Displays and requests | `cep.rs:696-740, 1188, 1230-1240` |
| Delegated actor verification | SEA-Forge `resolve_delegated`, bound by SO_PEERCRED | Forwards a verified actor only | `identity.rs:58-66, 729-830` |
| Case declaration and governed case lifecycle | SEA-Forge Casework (`apps/godspeed-casework-go`) | Discovers and submits intents | `recon-casework.md` |
| Case binding (Horizon `case_ref` to Casework case id) | Cognate-hosted binding record (new) | Local purpose-only records remain navigation-only | owner decision; `workspace-records.ts:10-59` |
| Capacity reservation ledger and pending-intent record | Cognate-hosted capacity capability over one PostgreSQL store (new) | Consumes typed projection; advisory estimate only | owner decision; `payment.ts`, `pending-intent.ts:72-128` |
| Observation and evidence | RealityTrace | Displays | spec |
| Settlement ruling | SEA-Forge | Requests | spec, `INV-12` |
| Navigation, focus, presentation | Horizon | Owns | spec |

## 2. Corrections to earlier assumptions (verified in recon)

1. **The stale-approval premise is weaker than the owner assumed.** An approval id resolves to an
   immutable escalation ledger entry (`cep.rs` `resolve_approval`, recon item 3). A pending row cannot
   change its own request content. What is unverified is whether the operator's *displayed context*
   matches the entry. This is tested before any SEA-Forge change (Phase B, test T-A1).
2. **Cognate's PostgreSQL store exists in Cognate 0.8, not in the 0.7.0 that Horizon vendors.**
   `DurableStore.commit` is one PostgreSQL transaction with expected-version checks, idempotency
   rows, and transactional notify (`store-postgres/src/index.ts:289-462`). Horizon's current store is
   SQLite at `.cognate/app.sqlite` (`config/horizon.toml:6`).
3. **Cognate `pg0.ts` still runs bare `pg0 start --name`** (`pg0.ts:65`), with no data directory,
   password, version pin, or ownership record. Workbench `pg0Launch.ts` has those protections.
4. **Casework holds no durable state.** Sessions and revisions are in memory; there is no PostgreSQL
   in Casework. The kernel is the record. Casework is therefore a gateway, not a second case store.
5. **Identity: the gateway pattern exists.** SEA-Forge's `resolve_delegated` requires the gateway's
   uid to match the peer, the gateway actor and role to be bound, and the target actor to be in
   `delegable_actors`. Horizon and Workbench currently forward a configured environment actor
   (`COGNATE_SEA_FORGE_OPERATOR`), not the authenticated session's actor (`governance.ts:132,140`,
   `sea-forge-approvals.ts:69`).
6. **Horizon's session carries no actor.** `Session = {deviceId, generation, expiresAt, lastSeen,
   commands}`. The operator is a configured string (`deps.operator`).
7. **Horizon persistence is Cognate SQLite.** Collections: `horizon-navigation-intent-pending`
   (contract_version per record, absent means 1), `horizon.capacity-ledger` (allowances injected from
   `[[capacity]]`, not stored), `horizon.store-meta/contract_version` = 2, `horizon-cases`,
   `horizon-onboarding`, `horizon-remote-devices` and audit, and settlement collections.
8. **Terminal accounting is two commits.** `reserve` is one atomic commit (pending record plus ledger,
   `pending-intent.ts:72-106`). `terminate` is two (`pending-intent.ts:124-128`: stage terminal, then
   `consumeReservation`). A crash between them strands a hold with no sweep.
9. **Holds in `awaiting_authority` are never reclaimed.** No TTL, no startup sweep. Restart resumes
   only `executed` records with a window (`app.ts:323-326`).
10. **Spec 1.1.0 is frozen.** Its hash is checked through `requirements/ledger.yaml` and
    `scripts/check-ledger-freeze.sh` (justfile:48, 52). Stale 1.0.1 references: `AGENTS.md:13`,
    `docs/architecture.md:186`, `docs/glossary.md:154`, `.sea/interaction/README.md:5`, and prereg
    T05 to T07.

## 3. Staged plan (each stage is a checkpoint commit with its own tests)

**Stage 1. Terminal accounting and reconciliation (Horizon, local store, no upstream change).**
- Make the terminal stage write and the reservation consume one commit.
- Add a startup reconciler for `awaiting_authority` and stranded holds. It releases a hold only when
  abandonment or non-execution is established from the pending record and SEA-Forge's authoritative
  state. Otherwise it keeps the hold and exposes a blocker. It never releases on age alone.
- Use expected-version checks and idempotent operation ids.
- Tests: crash between each transaction boundary, duplicate delivery, failed acknowledgment, and
  concurrent commit, all against the local store.

**Stage 2. Typed approval reference (Horizon only).** Replace the regex at `model.ts:741` and the
audit-text write at `app.ts:411` with a typed `approvalId` field on the attempt record. Records written
before this change keep their text value and are marked unverified-identity, not backfilled.

**Stage 3. Identity binding and the gateway path.**
- Bind each Horizon registered credential to one operator actor at pairing time. The session then
  carries that actor, verified by the WebAuthn assertion.
- Forward the session's actor as `on_behalf_of` (gateway actor is the Horizon gateway identity, bound
  in SEA-Forge). Reject any request whose actor field does not match the session.
- Test T-A1 first: reproduce whether a resolve can act on a pending approval while the displayed
  context differs. Add an expected-reference precondition to `authority_approval` in `sea-rs` only if
  T-A1 reproduces. Upstream change follows the consumer-test-first rule.

**Stage 4. Cognate SDK upgrade and SDK-level capabilities.**
- Upgrade the vendored Cognate packages from 0.7.0 to a tested 0.8.x. Run Horizon's full suite
  against it before any capability is built on top.
- Port the Workbench pg0 lifecycle protections into the Cognate SDK driver (data directory, pinned
  version, ownership record, and refusal to replace a database silently).
- Add the typed Cognate capacity capability (reserve, consume, release, and projection) over the
  PostgreSQL store. Reserve and pending record share one commit.

**Stage 5. Casework binding.** A binding record maps each `case_ref` to a Casework case id. Formal
case creation goes through Casework. Purpose-only records stay navigation-only. The Casework client
goes in the Cognate SDK. Its creation shape (`PROPOSE_CASE`) is unverified and must be probed against
the running service before use.

**Stage 6. Migration.** Source-to-target reconciliation of `horizon-cases`, `horizon.capacity-ledger`,
and pending intents, using a resumable import with writer fencing. The SQLite store is kept as the
rollback source until the reconciliation passes. Rollback restores the SQLite store and the prior
contract version, not Git alone.

**Stage 7. Spec 1.2.0.** A versioned amendment recording the ownership changes in this record, with
the hash recalculated, plan and ledger re-bound, and stale references corrected. The owner authorized
this revision. The 1.1.0 history is preserved.

## 4. Open items that are not decided here

- Whether the Horizon gateway identity should be the Workbench-equivalent service identity or a
  dedicated Horizon gateway actor. Needs a SEA-Forge configuration entry; no value is chosen here.
- Whether Casework requires an OIDC session for Horizon-initiated creation, or whether the Horizon
  gateway identity is enough. Needs a probe of the running service.

## 5. Status of this record

Decisions 1 to 10 in section 2 are verified by recon with file:line evidence. Section 3 is a plan.
Nothing in section 3 is implemented or live-verified at the time of writing.

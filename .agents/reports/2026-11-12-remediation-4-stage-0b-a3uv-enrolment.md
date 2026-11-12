# Remediation-4 / Stage 0B: A3-UV device enrolment and critic items #5–#9

Branch `horizon-desk-gaps`. Checkpoint `0f25a38` on top of `c64eb19` and `c305010`.
No PR opened, no merge, no branch deletion. The blind critic result is recorded in the section below.

## Owner decision implemented

Device enrolment is authorized by the active controller's user-verified passkey, not by a terminal code.

- `remote.start` issues an invitation and grants no controller authority.
- The phone redeems the invitation and registers a passkey. The verified registration is held as a pending enrolment (`src/remote/enrollment.ts`). Its operation digest covers the new credential, public key, label, the controllers it replaces, the generation, the request time, the operator and the tenant.
- The active controller signs that digest with its own user-verified passkey (`POST /m/api/pair/authorize`). The proof is verified against the controller's stored key and sign count. The pending record moves pending → confirmed by one compare-and-swap. No session is issued by the proof.
- The commit (`POST /m/api/pair/await`) creates the credential only for a confirmed enrolment inside its 5-minute window, for the same generation and controller set. It applies the confirmation once and calls the identity writer `replaceDevices`.
- Stop, refresh and restart end waiting and confirmed enrolments in the store, not in memory.
- Ordinary P2 remote-session operations do not ask for a repeat confirmation.

Terminal typing and browser clicks cannot produce the proof. The proof needs the controller's own passkey.

## Catalog split (critic #8)

`contracts/identity/v1/operations.yaml`:

| Row | Requester | Approver | Executor | Caller path |
|---|---|---|---|---|
| `device.pair.request` (P2) | prospective device | none | `code_holder` | `POST /m/api/pair/finish` |
| `device.pair.authorize` (P3) | prospective device | `operator_with_active_controller` | `device_credential` | `GET /m/api/pair/pending`, `POST /m/api/pair/authorize` |
| `device.pair` (P3) | prospective device | `operator_with_active_controller` | `credential_issuer` | `POST /m/api/pair/await` |

The manifest rule that the approver differs from the requester and the executor, and that the separation executor equals the row's executor, passes. `credential_issuer` is a new executor with the caller path `authorized_pending_record`. It is not in the permitted kinds of any unexecuted row: `RECORD_CALLER_KINDS` still contains it, but a row with no executor no longer resolves to it.

## Items

| # | Finding | Status | Evidence |
|---|---|---|---|
| 5 | Abandonment must invalidate pending enrolment; serialize transitions; test the race | Fixed | Commands run in the controller's serial chain; `endWaiting` reads the store. Tests NE-59 (race with stop), NE-60 (proof after abandon), NE-61 (newer request ends older). |
| 6 | Fail-closed on `replaceDevices` failure; no partial authorization survives; recovery issues a fresh invitation | Fixed | NE-57 injects the identity-writer failure: no device, no session, the consumed authorization cannot be reused. Recovery is a new invitation (PE-63, PE-64). |
| 7 | Route-level tests: stop and refresh invalidate confirmed sessions and credentials, including after restart; stale requests cannot restore access | Fixed | PE-64, PE-65, PE-66, PE-67, NE-62 (a controller enrolled by another route after authorization makes the confirmed enrolment stale at commit), NE-65. |
| 8 | Requester and executor not both `code_holder` for the authority-granting operation | Fixed | Three rows above. The authority-granting commit is `credential_issuer`. |
| 9 | "NE-09 made semantic" is not in the Stage 0B prereg | Checked; no entry added | NE-09 is the title of `test/identity-contract.test.ts`. It cites `STAGE-0A NE-06` in `.agents/prereg/horizon/STAGE-0A.prereg.yaml`. The title now names that source. No Stage 0B entry was created for it. |

## Observe classification (owner item 4)

`horizon.settlement.observe` is P3, and the rationale now rests on its effects, not on its refused route:

- It reads the target through RealityTrace.
- It submits an evidence packet to SEA-Forge's ledger, which is an external write.
- It records a local settlement state "window open" that a later ruling uses.

The live-enforcement note states this. A strictly read-only observation would stay P2. This one is not read-only.

## Prereg (`.agents/prereg/horizon/STAGE-0B-CONTAINMENT.prereg.yaml`)

- PE-60 to PE-71 and NE-47 to NE-65 are restated to the controller-proof design. NE-54 to NE-56 keep their separation-of-duty meaning.
- The enrolment tests that had used NE-54, NE-55 and NE-56 were renamed to NE-63, PE-68 and NE-65, so each ID names one test title.
- NE-59 to NE-62 and PE-69 and PE-71 gained entries and tests.
- Design pin updated to `24d753ea4a159f2fdd316d536a067d0d6048c67daae5c6ebabe2e2a9de60a51c`, 969 lines. The pin in the prior draft (`12159169…`, 963 lines) and the earlier target (`900fd922…`, 967 lines) are both superseded by the file as it stands now after regeneration.
- The previous prereg text is in commit `c64eb19`: `git show c64eb19:.agents/prereg/horizon/STAGE-0B-CONTAINMENT.prereg.yaml`.
- The original prereg entries were `recorded_before_artifacts: false`, which is unchanged. This rewrite happened after the artifacts, so the amendment is recorded here rather than hidden in the prereg.

## Architectural dependency (owner-level, not resolved in code)

No production path creates the first controller, so `finish` returns 409 `no_controller`. After a refresh or stop, no controller exists, and re-pairing is impossible until one exists. Tests seed the first controller directly through `test/support/controller.ts`.

The smallest feasible production solution is a loopback local-console WebAuthn registration, with user verification required, performed by the operator's OS authenticator. The choice of trust root is the owner's. Until that exists, the enrolment flow is refused in production when no controller exists. This is recorded, not hidden.

## Validation at `0f25a38`

- `bun run tsc --noEmit`: clean.
- `bun test`: 1622 pass, 0 fail, 16 skip (skips are environment-gated: the gateway installer xattr test and the Chromium-gated paths).
- `bun run scripts/teeth-t23-mutation.ts`: 46 of 46 caught. M9 retargeted to STAGE-0A NE-06. M43–M46 retargeted to current titles; M46 targets the commit's stale check through NE-62.
- `check-design-contract-consistency.ts`: 14 comparisons agree.
- `check-param-schema-binding.ts`: 72 handlers agree.
- `check-external-interface-facts.ts`: ok.
- `check-stage0b-containment-prereg-coverage.ts`: 43 expectations linked.
- `check-stage0a-remediation-4-prereg-coverage.ts`: 14 expectations linked.
- `check-prereg-shape.ts` on the Stage 0B prereg: ok.
- Python identity fixtures: 146 passed.
- E2E remote (Chromium, `test/E2E-remote.test.ts`): 9 pass.

## Changes made to existing tests and fixtures

- `contracts/identity/v1/fixtures/record-cases.json`: the three cases that describe the request step (ticket and credential) were re-keyed from `device.pair` to `device.pair.request`, class P2. Only 9 lines changed (`git diff`). The expectation sets were not altered.
- Stale expectations in `identity-remediation*.test.ts`, `identity-contract.test.ts` and `separation-of-duty` were updated to the three-row split.

## Blind critic and EGM review

Recorded in the section appended after the critic and EGM runs complete.

## Review round (EGM and blind critic on 0f25a38)

EGM (mechanism review): no path creates a credential without a verified controller proof, none commits a stale or abandoned enrolment, none double-applies. Two points were acted on: the commit now re-derives the request digest and refuses a mismatch; a fresh start ends waiting enrolments left by a previous process.

Blind critic (0f25a38): REJECT. Findings and disposition, commit `6a828df`:

| Severity | Finding | Disposition |
|---|---|---|
| High | Post-apply failure after `replaceDevices` leaves an identity device without a ledger row | Fixed: the new identity device is revoked on failure; the refusal says to refresh and scan again. Compensation is best-effort (`catch`). |
| High | Requirements 4 and 5: `cognate_local_continuation` is catalog text; no runtime writer is called | **Open, architectural.** The commit applies the pending record through the store CAS and calls the identity service directly. No designated writer exists in code. See the owner question below. |
| Medium | Approver sees only the label from the phone's User-Agent, not the public key or credential | Open. The digest is signed opaquely; showing more needs a design choice about what the controller displays. |
| Medium | No test names the separation values of `device.pair` and `device.pair.authorize` | Fixed: test added in `test/identity-remediation-4.test.ts`. |
| Medium | Restart not tested as a restart | Fixed in code: fresh start ends waiting enrolments. PE-64 and PE-65 exercise stop then start. |
| Medium | NE-59 weak | Strengthened: the race result is asserted, and a stop that lands first is accepted. |
| Low | `/m/api/pair/await` is unauthenticated but the catalog says `caller_own_session` | Open. Catalog text needs correcting. |
| Low | Filler assertion in PE-68 | Fixed. |
| Low | NE-41 and NE-42 reused with different meanings in two files | Open. Pre-existing IDs; renaming needs the prereg updated too. |
| Low | `pending-confirmations.ts` gate auto-confirms when a code sink is installed | Open. Test-only seam; production leaves the sink unset. |

Owner question for the open High item: what is the designated authority writer for device enrolment? Options: (a) a named Horizon-local writer that is the only caller of `replaceDevices` and `applyConfirmed` for `device.pair`, so the catalog claim is true in code; (b) correct the catalog to say the store CAS and the identity service are the writers, with no third party. The critic cannot accept until one of these is chosen.

## Owner decision B: designated writer (commit d0ca846)

The identity service is the designated device-enrolment state writer. Store compare-and-swap enforces the atomic transition. Horizon presents and orchestrates. No Horizon-local writer and no competing approval system was added.

Three responsibilities, kept separate:

1. **Authorization.** The P3 approver (`operator_with_active_controller`) approves the exact operation digest by an A3-UV proof. The digest binds the proposed credential, label, the permissions it would hold (`remote_controller`), the controllers it replaces, the generation and the request time. **Gap:** no SEA-Forge P3 authority decision exists for enrolment in Stage 0B (`sea_forge.human_entitlement` is unpublished). This is recorded as `authority_sea_forge` in the live enforcement entry. No success of the identity write or the CAS is read as a SEA-Forge decision.
2. **Identity lifecycle.** The identity service performs credential enrolment and replacement (`replaceDevices`). **Gap:** its vendored API accepts no authorization evidence. Horizon verifies the A3-UV proof before calling it. Recorded as `identity_service_evidence_check`.
3. **Atomic persistence.** Store CAS moves the pending record pending → confirmed → applied, once. The approval record is written with the confirmation. The commit requires that approval, and its approver must still be a current controller. The commit re-derives the request digest and refuses a mismatch.

Enforcement added and tested (`test/remote-enrollment.test.ts`):

| ID | Property | Result |
|---|---|---|
| NE-68 | Only the enrolment commit writes a device credential (source scan of `src/`) | pass |
| NE-69 | A confirmation with no approval by a current controller is refused at commit | pass |
| NE-70 | An altered stored grant fails the digest check and creates nothing | pass |
| NE-71 | A failure after identity enrolment leaves no active ledger device, and the identity device is revoked | pass |
| NE-72 | The commit audit names requester, authorizer, decision and issuer as four roles | pass |

Catalog: `identity_service` is in the authority-writer vocabulary. `device.pair` and `device.pair.authorize` name it. Design draft Appendix A and a responsibilities paragraph are updated. `check-design-contract-consistency` agrees 14/14.

Validation at d0ca846: `tsc` clean; `bun test` 1628 pass, 0 fail (before the final typing fix; the E2E suite is included); teeth 46/46 (M46 retargeted to the approver membership guard, which NE-69 now covers; the older stale-check mutant is no longer independently killed because the approver guard also refuses it); prereg coverage 48 linked; Stage 0A coverage 14; param binding 72; external facts ok; Python fixtures 146 pass.

Design pin: `68f11d7832ad254703f10e3bb57d52c70979f911dcaeb992ef54508e46973365`, 972 lines.

Preserved: the P2 remote lifecycle (`remote.start`, `device.pair.request`, `remote.refresh`, `remote.stop`) and the P3 classification of `device.pair`.

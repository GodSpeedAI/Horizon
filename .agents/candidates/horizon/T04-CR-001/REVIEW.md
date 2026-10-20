# T04-CR-001 review notes

Revision 2 — corrected after criticism round 1 (`.agents/evidence/horizon/T04/criticism-round1.md`,
which is a build-session record, **not** an independent verdict). Generated from
`requirements/ledger.yaml` (frozen) and the candidate ledger.

## The three witness-bound contracts

Each contract below is a **verbatim restatement** of its requirement. What the witness supplies
is recorded in `scripts/ledger-policy.candidate.yaml` as `witness_supplies`, and is never
restated as policy. Nothing ratified is implied: `introduced` is empty for every entry, and
`scripts/apply-candidate-revision.py` refuses to compose an entry whose `introduced` is not
empty.

| Requirement | Contract (verbatim restatement) | Witness supplies | Witness |
| --- | --- | --- | --- |
| REQ-CASE-002 | "The next primary move responds to material deviation. No primary recommendation is required when only optional choices remain." | which operations deviated from a visible settleable path, and the frame's ordered typed choices | `test/acceptance.test.ts :: AC-CASE-002-01` |
| REQ-CONFIG-004 | "Configured provider endpoints, credentials, timeouts and scope remain below stable behavior contracts." | typed choices, intent ids and surface blocks from two differently configured applications | `test/acceptance.test.ts :: AC-CONFIG-004-01` |
| REQ-NAV-005 | "The navigation controller avoids asking for context it can resolve without user burden." | the reference classes a supplied frame carries | `test/acceptance.test.ts :: AC-NAV-005-01` |

The witnesses were also corrected, not only the text:

- `AC-CASE-002-01` now implements the frozen spec's own reference algorithm
  (`derive_navigation_frame` → `firstAvailableThatAddressesMaterialDeviationOrNone`, with INV-01
  defining availability). It proves that a *blocked* choice is never the primary move, so the
  witness has teeth; it no longer computes the `changed_from` field the first draft invented.
- `AC-CONFIG-004-01` reads both configurations back from `app.loaded.config` (an earlier draft
  compared two object literals nothing read, then asserted they differed). It records what it
  does not cover: `HorizonConfig` has no provider timeout or scope (DEBT D-019).
- `AC-NAV-005-01` is unchanged as a test; only the claim around it was narrowed.

These were *not* applied to the frozen ledger.

## Review questions for an independent critic

1. Does any changed contract add an obligation the requirement does not carry? (Look for a
   verb or condition absent from the spec text.)
2. Do the three witness-bound contracts bind evaluation without inventing policy — in
   particular, does `AC-CASE-002-01` claim a materiality threshold the ruler never sets?
3. Does the polarity restoration preserve every prohibition, including the six that carried
   a second `MUST NOT` inside the restated body?
4. Is the prereg patch (`composed/prereg.patch`) a faithful correction — does it remove only
   the claim that "0 violations" verifies semantic fidelity, and add nothing false?
5. Is the scope limit on `REQ-CMP-001` (`scripts/idm-integrity-debt.yaml`) acceptable, or
   must the reference be corrected before any re-freeze?
6. Does `evaluateDeviation` implement the spec's algorithm (`derive_navigation_frame` →
   `firstAvailableThatAddressesMaterialDeviationOrNone`, INV-01), or has one invented rule merely
   replaced another?
7. Is `AC-CONFIG-004-01` an honest witness for `REQ-CONFIG-004` while provider timeouts and
   scopes do not exist in `HorizonConfig` (DEBT D-019)?
8. Is baselining the nine pre-existing findings acceptable (DEBT D-020), given none is in a
   contract this revision changes, and does the baseline hide anything it should not?
9. Is "should be observed to respond" the right way to keep `REQ-UX-009`'s SHOULD soft, or does
   a SHOULD need a different contract shape altogether?

## Regeneration

```
python3 scripts/apply-candidate-revision.py            # compose the policy + ledger + prereg patch
python3 scripts/gen-wayfinder.py --ledger .agents/candidates/horizon/T04-CR-001/ledger.yaml \
  --out .agents/candidates/horizon/T04-CR-001/answer-key.md \
  --freeze-id T04-CR-001-candidate --frozen-at pending-owner-authorization
python3 scripts/check-acceptance-claims.py --ledger .agents/candidates/horizon/T04-CR-001/ledger.yaml --require-candidate
python3 scripts/check-witness-claims.py              # no new policy; pre-existing findings are D-020
python3 scripts/measure-contract-modals.py --ledger .agents/candidates/horizon/T04-CR-001/ledger.yaml
git diff --check -- .agents/candidates/horizon/T04-CR-001/composed/prereg.patch
git apply --check .agents/candidates/horizon/T04-CR-001/composed/prereg.patch
```

`apply-candidate-revision.py` is the only step that writes the candidate; the rest verify it.
Re-running `apply-candidate-revision.py` is idempotent and reproduces the committed ledger,
Wayfinder and patch byte-for-byte.

# T04-CR-001 itemized diff (revision 2)

Generated from `requirements/ledger.yaml` and the candidate ledger by the command in
`## Regeneration`. The ruler (`spec`, `plan`, `world_ref`) is untouched.

counts: {'subject/polarity restored': 69, 'witness-bound': 3, 'unchanged': 26}

| Requirement | Class | Frozen expected (abridged) | Candidate expected (abridged) |
| --- | --- | --- | --- |
| REQ-CASE-001 | subject/polarity restored | Observed in the runtime's own terms: remain a purpose-relative derived view anchored in authoritative facts and declared direction, not a co | A Case is observed to remain a purpose-relative derived view anchored in authoritative facts and declared direction, not a competing ontolog |
| REQ-CASE-002 | witness-bound | Observed in the runtime's own terms: respond to material deviation; no primary recommendation is required when only optional choices remain. | The next primary move responds to material deviation. No primary recommendation is required when only optional choices remain. |
| REQ-CASE-003 | subject/polarity restored | Observed in the runtime's own terms: be separate; the latter requires an authorized judgment. | Settlement reachable and should settle now is observed to be separate; the latter requires an authorized judgment. |
| REQ-CONFIG-002 | subject/polarity restored | Observed in the runtime's own terms: pin a valid DomainForge world_ref, and operations MUST carry a checkpoint reference. | Semantic world selection is observed to pin a valid DomainForge world_ref, and operations MUST carry a checkpoint reference. |
| REQ-CONFIG-004 | witness-bound | Observed in the runtime's own terms: remain below stable behavior contracts. | Configured provider endpoints, credentials, timeouts and scope remain below stable behavior contracts. |
| REQ-DEV-003 | subject/polarity restored | Observed in the runtime's own terms: have exactly one authoritative implementation. If ported from GodSpeed Agent, its golden fixtures and t | Developmental settlement scoring and capability-promotion rules are observed to have exactly one authoritative implementation. If ported fro |
| REQ-GOAL-001 | subject/polarity restored | Observed in the runtime's own terms: provide a navigable shared semantic and operational world independent of chat. | Horizon is observed to provide a navigable shared semantic and operational world independent of chat. |
| REQ-GOAL-002 | subject/polarity restored | Observed in the runtime's own terms: derive contextual interactions from source-grounded objects, relationships, cases, and capabilities. | Horizon is observed to derive contextual interactions from source-grounded objects, relationships, cases, and capabilities. |
| REQ-GOAL-003 | subject/polarity restored | Observed in the runtime's own terms: preserve behavioral equivalence between sequential Clack and richer atomic GUI projections. | Horizon is observed to preserve behavioral equivalence between sequential Clack and richer atomic GUI projections. |
| REQ-GOAL-004 | subject/polarity restored | Observed in the runtime's own terms: maintain separate governance, execution, evidence, operational settlement, and developmental claims. | Horizon is observed to maintain separate governance, execution, evidence, operational settlement, and developmental claims. |
| REQ-GOAL-005 | subject/polarity restored | Observed in the runtime's own terms: preserve navigation context across focus changes, renderer changes, interruption, and replay. | Horizon is observed to preserve navigation context across focus changes, renderer changes, interruption, and replay. |
| REQ-INT-001 | subject/polarity restored | Observed in the runtime's own terms: project the IS1–IS8 Behavioral IR responsibilities and identify unresolved bindings explicitly. | Every canonical journey is observed to project the IS1–IS8 Behavioral IR responsibilities and identify unresolved bindings explicitly. |
| REQ-INT-002 | subject/polarity restored | Observed in the runtime's own terms: preserve persistent case/world/focus context while Clack presents one next meaningful decision at a tim | The GUI is observed to preserve persistent case/world/focus context while Clack presents one next meaningful decision at a time. |
| REQ-INT-004 | subject/polarity restored | Observed in the runtime's own terms: be misrepresented as independent approval or a world mutation. | An answer, choice or confirmation is never observed to be misrepresented as independent approval or a world mutation. |
| REQ-NAV-003 | subject/polarity restored | Observed in the runtime's own terms: only eligible paths MAY be recommended as spendable; blocked paths MUST expose material reasons and rea | Only eligible paths may be observed to be recommended as spendable. Blocked paths are observed to expose material reasons and reachable prer |
| REQ-NAV-004 | subject/polarity restored | Observed in the runtime's own terms: retain discretion to inspect alternatives, defer, reframe or disagree with the representation. | The observer is observed to retain discretion to inspect alternatives, defer, reframe or disagree with the representation. |
| REQ-NAV-005 | witness-bound | Observed in the runtime's own terms: avoid asking for context it can resolve without user burden. | The navigation controller avoids asking for context it can resolve without user burden. |
| REQ-NAV-007 | subject/polarity restored | Observed in the runtime's own terms: see the operation's reversibility class, payment, expected evidence and what happens if authority escal | Before any consequential commitment the observer is observed to see the operation's reversibility class, payment, expected evidence and what |
| REQ-OUT-001 | subject/polarity restored | Observed in the runtime's own terms: identify observer, pinned semantic world, operational checkpoint or explicit unknown, current focus, vi | Every frame is observed to identify observer, pinned semantic world, operational checkpoint or explicit unknown, current focus, view mode, a |
| REQ-OUT-002 | subject/polarity restored | Observed in the runtime's own terms: bind a typed semantic operation and its current affordance assessment; it MUST NOT gain authority from  | Every choice is observed to bind a typed semantic operation and its current affordance assessment. It is never observed to gain authority fr |
| REQ-OUT-003 | subject/polarity restored | Observed in the runtime's own terms: preserve predeclared expectations, authorization correlation, execution references, and observation sta | Each consequential attempt is observed to preserve predeclared expectations, authorization correlation, execution references, and observatio |
| REQ-OUT-004 | subject/polarity restored | Observed in the runtime's own terms: project the same behavior without duplicating source-of-truth rules or creating a second approval path. | Both renderers are observed to project the same behavior without duplicating source-of-truth rules or creating a second approval path. |
| REQ-RES-002 | subject/polarity restored | Observed in the runtime's own terms: be navigable world objects with content-hash provenance. Migrated results MUST keep their original clai | Research artifacts (datasets and corpora, preregistrations, experiment runs, results and verdicts, models, shadow evaluations) are observed  |
| REQ-RES-003 | subject/polarity restored | Observed in the runtime's own terms: be a consequential governed operation with a compute/payment gate and a preregistration frozen before e | Starting a research run is observed to be a consequential governed operation with a compute/payment gate and a preregistration frozen before |
| REQ-RES-004 | subject/polarity restored | Observed in the runtime's own terms: predictive estimates MAY inform payment, consequence or ranking only after governed activation: a froze | Predictive estimates may be observed to inform payment, consequence or ranking only after governed activation: a frozen preregistered held-o |
| REQ-RES-005 | subject/polarity restored | Observed in the runtime's own terms: be exportable to the research subsystem as versioned, scope-filtered datasets with provenance and witho | Settled, failed and contradicted Horizon episodes are observed to be exportable to the research subsystem as versioned, scope-filtered datas |
| REQ-RES-006 | subject/polarity restored | Observed in the runtime's own terms: existing agent workflows using the cybernetic_nav MCP tools and godspeed-nav CLI MUST receive an explic | Existing agent workflows using the cybernetic_nav MCP tools and godspeed-nav CLI is observed to receive an explicit mapping to Horizon equiv |
| REQ-RES-007 | subject/polarity restored | Observed in the runtime's own terms: preserve append-only history, original timestamps and content hashes; large data MUST be referenced by  | Migrated ledgers, data and reports are observed to preserve append-only history, original timestamps and content hashes. Large data are obse |
| REQ-SAFE-001 | subject/polarity restored | Observed in the runtime's own terms: fail closed on unknown runtime authorization, unsafe world revision or unreconciled duplicate commit. | Horizon is observed to fail closed on unknown runtime authorization, unsafe world revision or unreconciled duplicate commit. |
| REQ-SAFE-002 | subject/polarity restored | Observed in the runtime's own terms: preserve immutable expectation, evidence and error history during recovery and reframing. | Horizon is observed to preserve immutable expectation, evidence and error history during recovery and reframing. |
| REQ-SAFE-003 | subject/polarity restored | Observed in the runtime's own terms: distinguish source unavailable, access denied, empty result and no matching object. | Horizon is observed to distinguish source unavailable, access denied, empty result and no matching object. |
| REQ-SAFE-004 | subject/polarity restored | Observed in the runtime's own terms: permit valid read-only navigation and diagnostics when an unrelated executor is unavailable. | Horizon is observed to permit valid read-only navigation and diagnostics when an unrelated executor is unavailable. |
| REQ-SAFE-005 | subject/polarity restored | Observed in the runtime's own terms: prevent a candidate, historical view or simulated outcome being presented as current observed fact. | Horizon is observed to prevent a candidate, historical view or simulated outcome being presented as current observed fact. |
| REQ-SEC-002 | subject/polarity restored | Observed in the runtime's own terms: remain separated in transport and reducer enforcement. | Agent, human and system presentation roles are observed to remain separated in transport and reducer enforcement. |
| REQ-SEC-003 | subject/polarity restored | Observed in the runtime's own terms: be schema-validated, scoped, and escaped; no arbitrary executable markup may be submitted. | All untrusted source and UI strings are observed to be schema-validated, scoped, and escaped; no arbitrary executable markup may be submitte |
| REQ-SEC-005 | subject/polarity restored | Observed in the runtime's own terms: never be exposed through shared UI context, logs or evidence. | Credential and private reference material is never observed to be exposed through shared UI context, logs or evidence. |
| REQ-SEC-006 | subject/polarity restored | Observed in the runtime's own terms: initial conformance targets the local_operator profile: loopback-bound, per-launch secrets, operator id | Initial conformance targets the local_operator profile: loopback-bound, per-launch secrets, operator identity from the OS session, and agent |
| REQ-STACK-001 | subject/polarity restored | Observed in the runtime's own terms: own canonical semantic compilation and world_ref identity. | DomainForge alone is observed to own canonical semantic compilation and world_ref identity. |
| REQ-STACK-002 | subject/polarity restored | Observed in the runtime's own terms: own app events/capability invocation/projection state; adapters MUST not create a second authoritative  | Cognate is observed to own app events/capability invocation/projection state. Adapters are never observed to create a second authoritative e |
| REQ-STACK-003 | subject/polarity restored | Observed in the runtime's own terms: authorize each consequential invocation; preflight MUST NOT substitute for invocation authorization. | SEA-Forge is observed to authorize each consequential invocation. Preflight is never observed to substitute for invocation authorization. |
| REQ-STACK-005 | subject/polarity restored | Observed in the runtime's own terms: remain scoped/cited and MUST NOT be interpreted as canonical organizational truth. | Context Kernel results are observed to remain scoped/cited and MUST NOT be interpreted as canonical organizational truth. |
| REQ-STACK-006 | subject/polarity restored | Observed in the runtime's own terms: be treated as evidence derivation or settlement. | RealityTrace delivery receipts are never observed to be treated as evidence derivation or settlement. |
| REQ-STACK-007 | subject/polarity restored | Observed in the runtime's own terms: be separately referenced. | Operational obligation settlement and GodSpeed developmental interpretation is observed to be separately referenced. |
| REQ-STACK-008 | subject/polarity restored | Observed in the runtime's own terms: preserve correlation through observer/world/case/intent/authority/execution/evidence/settlement refs. | Every cross-system episode is observed to preserve correlation through observer/world/case/intent/authority/execution/evidence/settlement re |
| REQ-STACK-009 | subject/polarity restored | Observed in the runtime's own terms: only a SEA-Forge allow disposition with a matching invocation grant (bound to the exact action, targets | Only a SEA-Forge allow disposition with a matching invocation grant (bound to the exact action, targets, world_ref and unexpired) may be obs |
| REQ-STACK-010 | subject/polarity restored | Observed in the runtime's own terms: reach SEA-Forge, Gauntlet, RealityTrace, Context Kernel and the research subsystem only through Cognate | Horizon is observed to reach SEA-Forge, Gauntlet, RealityTrace, Context Kernel and the research subsystem only through Cognate capabilities  |
| REQ-STACK-012 | subject/polarity restored | Observed in the runtime's own terms: be required to adopt Horizon's language, storage or UI; non-TypeScript products integrate through proce | Products are never observed to be required to adopt Horizon's language, storage or UI; non-TypeScript products integrate through process, CL |
| REQ-STACK-013 | subject/polarity restored | Observed in the runtime's own terms: a product with its own UI MAY be reachable as a hosted surface via deep links that carry focus refs in  | A product with its own UI may be observed to be reachable as a hosted surface via deep links that carry focus refs in and return typed inten |
| REQ-UI-002 | subject/polarity restored | Observed in the runtime's own terms: reject unknown blocks, unauthorized actions, invalid refs and unsafe source expressions. | Schema validation is observed to reject unknown blocks, unauthorized actions, invalid refs and unsafe source expressions. |
| REQ-UI-003 | subject/polarity restored | Observed in the runtime's own terms: define displayed facts and resulting intents. | Deterministic source-binding and pure composition/reducer behavior is observed to define displayed facts and resulting intents. |
| REQ-UI-004 | subject/polarity restored | Observed in the runtime's own terms: consume the same behavioral contract and produce equivalent typed intents for equivalent frames. | Clack and GUI is observed to consume the same behavioral contract and produce equivalent typed intents for equivalent frames. |
| REQ-UI-005 | subject/polarity restored | Observed in the runtime's own terms: derive elements, groups, regions and views from proved behavioral necessities, preserving accessible lo | Atomic UI is observed to derive elements, groups, regions and views from proved behavioral necessities, preserving accessible loading, empty |
| REQ-UI-006 | subject/polarity restored | Observed in the runtime's own terms: reorder owner-pinned surfaces or seize presentation control; owner choices govern layout. | Agent-composed content is never observed to reorder owner-pinned surfaces or seize presentation control; owner choices govern layout. |
| REQ-UI-007 | subject/polarity restored | Observed in the runtime's own terms: be inspectable, and agent-supplied values MUST be visibly marked as such. | The source of every substantive value is observed to be inspectable, and agent-supplied values MUST be visibly marked as such. |
| REQ-UI-008 | subject/polarity restored | Observed in the runtime's own terms: share the same validation and role boundaries; tool discovery MUST NOT imply authorization. | Contextual MCP, WebMCP and CLI tools are observed to share the same validation and role boundaries. Tool discovery is never observed to impl |
| REQ-UX-002 | subject/polarity restored | Observed in the runtime's own terms: reach search, focus, traversal and every currently derived choice; it is a renderer of the same frame a | A keyboard-first command palette is observed to reach search, focus, traversal and every currently derived choice. It is a renderer of the s |
| REQ-UX-003 | subject/polarity restored | Observed in the runtime's own terms: be addressable by a stable link pinning world_ref, checkpoint and focus; opening a link reproduces that | Every focus and frame is observed to be addressable by a stable link pinning world_ref, checkpoint and focus; opening a link reproduces that |
| REQ-UX-004 | subject/polarity restored | Observed in the runtime's own terms: keep a traversal trail with back/forward and breadcrumbs that preserve selections; read-only navigation | Navigation is observed to keep a traversal trail with back/forward and breadcrumbs that preserve selections; read-only navigation is always  |
| REQ-UX-005 | subject/polarity restored | Observed in the runtime's own terms: lead with plain language (what this is, why it is blocked, the single next prerequisite) with progressi | Explanations are observed to lead with plain language (what this is, why it is blocked, the single next prerequisite) with progressive drill |
| REQ-UX-006 | subject/polarity restored | Observed in the runtime's own terms: show its actor; an agent acting for a human MUST be visibly distinct from the human. | Every action, answer and composition is observed to show its actor. An agent acting for a human is observed to be visibly distinct from the  |
| REQ-UX-007 | subject/polarity restored | Observed in the runtime's own terms: be presented and resolved as SEA-Forge approval records under the approver's own authenticated identity | SEA-Forge approvals are observed to be presented and resolved as SEA-Forge approval records under the approver's own authenticated identity. |
| REQ-UX-008 | subject/polarity restored | Observed in the runtime's own terms: be fully keyboard operable, meet WCAG 2.2 AA for the GUI, respect reduced motion, support light and dar | The GUI and terminal renderers are observed to be fully keyboard operable, meet WCAG 2.2 AA for the GUI, respect reduced motion, support lig |
| REQ-UX-009 | subject/polarity restored | Observed in the runtime's own terms: read-only navigation interactions SHOULD respond within 300 ms p95 on the local_operator profile; opera | Read-only navigation interactions should be observed to respond within 300 ms p95 on the local_operator profile. Operations exceeding 1 s ar |
| REQ-UX-010 | subject/polarity restored | Observed in the runtime's own terms: guide the observer to connect a world and a product, and MUST explain each unavailable capability with  | First run and empty states are observed to guide the observer to connect a world and a product, and MUST explain each unavailable capability |
| REQ-UX-011 | subject/polarity restored | Observed in the runtime's own terms: open fit-to-content, aggregate beyond a bounded node count, and always offer an equivalent table or lis | Graph and lineage views are observed to open fit-to-content, aggregate beyond a bounded node count, and always offer an equivalent table or  |
| REQ-UX-012 | subject/polarity restored | Observed in the runtime's own terms: be deduplicated by source identity and severity-ranked; repeated identical conditions update one notice | Notices are observed to be deduplicated by source identity and severity-ranked; repeated identical conditions update one notice rather than  |
| REQ-WORLD-002 | subject/polarity restored | Observed in the runtime's own terms: filter typed operational sets and traverse declared relationships at a known checkpoint. | Horizon is observed to filter typed operational sets and traverse declared relationships at a known checkpoint. |
| REQ-WORLD-003 | subject/polarity restored | Observed in the runtime's own terms: preserve focus, object-set selection, observer and world across surfaces and journeys. | Horizon is observed to preserve focus, object-set selection, observer and world across surfaces and journeys. |
| REQ-WORLD-005 | subject/polarity restored | Observed in the runtime's own terms: retain distinct identities and semantics. | The import graph, operational relation graph, and data lineage is observed to retain distinct identities and semantics. |
| REQ-WORLD-006 | subject/polarity restored | Observed in the runtime's own terms: be typed Cognate projections over durable events and connector observations, keyed by DomainForge seman | Operational objects and links are observed to be typed Cognate projections over durable events and connector observations, keyed by DomainFo |
| REQ-WORLD-007 | subject/polarity restored | Observed in the runtime's own terms: expose its owning product, connector, checkpoint age and integration level, and stale or degraded sourc | Every object, set and link is observed to expose its owning product, connector, checkpoint age and integration level, and stale or degraded  |
| REQ-WORLD-008 | subject/polarity restored | Observed in the runtime's own terms: be selected through a DomainForge world alias pinned to an immutable world_ref; a candidate-versus-acti | An active world is observed to be selected through a DomainForge world alias pinned to an immutable world_ref. A candidate-versus-active sem |

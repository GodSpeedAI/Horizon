# T04-CR-001 review notes

Revision 3 — prepared after independent verdict r2
(`.agents/evidence/horizon/T04/verdicts/codex-adversarial-r2-20261019.md`, verdict **fail**,
R1 revise_again). Revision 2 was corrected after criticism round 1
(`.agents/evidence/horizon/T04/criticism-round1.md`, a build-session record, **not** an independent
verdict). Nothing here is applied to a frozen artifact.

## What revision 3 changes

| Verdict r2 finding | Change | Re-freeze needed |
| --- | --- | --- |
| F1 frozen E2E falsifier still triggers | `test/app.test.ts` structural E2E now asserts every required Cognate package (`src/runtime/required-cognate.ts`) and every Cognate package `src/` imports is a declared dependency; `scripts/teeth.ts` asserts the metadata-only E2E arm now fails | no (mutable test; the frozen falsifier is unchanged and no longer true) |
| F2 five inherited contracts alter their ruler | `AC-DEV-001-01`, `AC-NAV-002-01`, `AC-STACK-004-01`, `AC-STACK-011-01`, `AC-STACK-014-01` restate their own ruler (`scripts/ledger-policy.candidate.yaml`) | yes (candidate ledger) |
| F3 witness claims exceed observation | `src/domain/contracts.ts` (two uncalled helpers) and their six tests removed; CASE-002 and NAV-005 unbound, proof open until T07; CONFIG-004 witness varies the research provider endpoint and is recorded PARTIAL | yes (candidate policy `evaluated_by` / `witness_supplies`) |
| F4 baseline hides a repaired-contract regression | baseline keys are full ledger path + contract-text digest; stale entries fail; candidate baseline is one entry (REQ-RES-001, ruled acceptable); `gate-t04` now runs `contract-modals` | no (mutable scripts) |
| F5 inverted prohibitions and integrity overclaim active | unchanged from revision 2: the candidate keeps the four restored prohibitions and the prereg patch | yes (as before) |
| F6 boundary gate exempts `.sea/` | `scripts/check-boundaries.ts` admits only the import closure of `.sea/interaction/interaction-model.sea`; new tooth `duplicate-canonical-subtree` with a control | no (mutable checker) |
| F7 records ahead of evidence | correction notes appended to `criticism-round1.md` and `SUMMARY.md`; the gate recorder distinguishes expected-red targets | no |
| F8 pre-freeze criticism order | accepted deviation (DEC-T04-01); revision 3 is reviewed *before* any freeze | no |

## Witness bindings

Each contract restates its requirement. What a witness supplies is recorded in
`scripts/ledger-policy.candidate.yaml` as `witness_supplies`, never as policy; `introduced` is
empty for every entry and `scripts/apply-candidate-revision.py` refuses a non-empty one.

| Requirement | Witness | Covers | Does not cover |
| --- | --- | --- | --- |
| REQ-CONFIG-004 | `test/acceptance.test.ts :: AC-CONFIG-004-01` (PARTIAL) | a configured provider endpoint (`research_command`, relative vs absolute project) leaves typed choices, the committed intent and surface blocks unchanged, both providers healthy | provider credentials, timeouts, scope: no provider declares them (DEBT D-019) |
| REQ-CASE-002 | none | — | proof open until T07 (navigation controller; the spec's `firstAvailableThatAddressesMaterialDeviationOrNone` needs an addressing relation no code has) |
| REQ-NAV-005 | none | — | proof open until T07 (no controller decides whether to ask) |
| DEV-001, NAV-002, STACK-004, STACK-011, STACK-014 | none | — | owned by T17, T07, T12, T20, T19/T20 respectively |

## Review questions for an independent critic

> **Where these are answered:** `.agents/evidence/horizon/T04/REVIEW_REQUEST.md` is the single
> review entry point. This file is supporting material, not a second request.

1. Do the five F2 rewrites restate their ruler without adding policy? In particular: does
   AC-STACK-004-01's last sentence ("does not make Gauntlet the sole executor") add a rule, or only
   state the direction REQ-RES-003 already gives? Does AC-STACK-011-01's "is refused" overstate
   "joins ... only through"?
2. Is withdrawing the CASE-002 and NAV-005 witnesses (open proof) the right disposition, and is
   anything still claiming them as observed?
3. Is AC-CONFIG-004-01 an honest PARTIAL witness: does varying `research_command` vary a
   configured provider endpoint, and is anything beyond that claimed?
4. Can any baseline entry now suppress a finding it should not (path, digest, stale handling)?
5. Does the structural E2E now discriminate the prereg falsifier, without asserting something the
   prereg did not name?
6. Does the canonical-closure boundary reject every `.sea` authority outside the closure while
   accepting the real tree?

## Regeneration

```
python3 scripts/apply-candidate-revision.py            # compose the policy + ledger + prereg patch
python3 scripts/gen-wayfinder.py --ledger .agents/candidates/horizon/T04-CR-001/ledger.yaml \
  --out .agents/candidates/horizon/T04-CR-001/answer-key.md \
  --freeze-id T04-CR-001-candidate --frozen-at pending-owner-authorization
python3 scripts/check-acceptance-claims.py --ledger .agents/candidates/horizon/T04-CR-001/ledger.yaml --require-candidate
python3 scripts/check-witness-claims.py --ledger .agents/candidates/horizon/T04-CR-001/ledger.yaml --baseline /dev/null
python3 scripts/measure-contract-modals.py --ledger .agents/candidates/horizon/T04-CR-001/ledger.yaml --baseline /dev/null   # expect only REQ-RES-001
git apply --check .agents/candidates/horizon/T04-CR-001/composed/prereg.patch
```

`apply-candidate-revision.py` is the only step that writes the candidate ledger and policy;
re-running it reproduces them byte-for-byte.

# T04-CR-001 itemized diff (revision 3)

Generated from `requirements/ledger.yaml` and the candidate ledger. The ruler (`spec`, `plan`,
`world_ref`) is untouched.

counts: {'restated, proof open (T07)': 2, 'ruler restored (verdict r2 F2)': 5, 'subject/polarity restored': 69, 'unchanged': 21, 'witness-bound (partial)': 1}

| Requirement | Class | Frozen expected (abridged) | Candidate expected (abridged) |
| --- | --- | --- | --- |
| REQ-CASE-001 | subject/polarity restored | Observed in the runtime's own terms: remain a purpose-relative derived view anchored in authoritative facts and declared direction, not a co | A Case is observed to remain a purpose-relative derived view anchored in authoritative facts and declared direction, not a competing ontolog |
| REQ-CASE-002 | restated, proof open (T07) | Observed in the runtime's own terms: respond to material deviation; no primary recommendation is required when only optional choices remain. | The next primary move responds to material deviation. No primary recommendation is required when only optional choices remain. |
| REQ-CASE-003 | subject/polarity restored | Observed in the runtime's own terms: be separate; the latter requires an authorized judgment. | Settlement reachable and should settle now is observed to be separate; the latter requires an authorized judgment. |
| REQ-CONFIG-002 | subject/polarity restored | Observed in the runtime's own terms: pin a valid DomainForge world_ref, and operations MUST carry a checkpoint reference. | Semantic world selection is observed to pin a valid DomainForge world_ref, and operations MUST carry a checkpoint reference. |
| REQ-CONFIG-004 | witness-bound (partial) | Observed in the runtime's own terms: remain below stable behavior contracts. | Configured provider endpoints, credentials, timeouts and scope remain below stable behavior contracts. |
| REQ-DEV-001 | ruler restored (verdict r2 F2) | Every operation's outcome, including refusals and failed attempts, is retained with its references and remains available to later developmen | Failure, contradictions, recovery, payment and orchestration burden each remain available to developmental evaluation; none of the five is o |
| REQ-DEV-003 | subject/polarity restored | Observed in the runtime's own terms: have exactly one authoritative implementation. If ported from GodSpeed Agent, its golden fixtures and t | Developmental settlement scoring and capability-promotion rules are observed to have exactly one authoritative implementation. If ported fro |
| REQ-GOAL-001 | subject/polarity restored | Observed in the runtime's own terms: provide a navigable shared semantic and operational world independent of chat. | Horizon is observed to provide a navigable shared semantic and operational world independent of chat. |
| REQ-GOAL-002 | subject/polarity restored | Observed in the runtime's own terms: derive contextual interactions from source-grounded objects, relationships, cases, and capabilities. | Horizon is observed to derive contextual interactions from source-grounded objects, relationships, cases, and capabilities. |
| REQ-GOAL-003 | subject/polarity restored | Observed in the runtime's own terms: preserve behavioral equivalence between sequential Clack and richer atomic GUI projections. | Horizon is observed to preserve behavioral equivalence between sequential Clack and richer atomic GUI projections. |
| REQ-GOAL-004 | subject/polarity restored | Observed in the runtime's own terms: maintain separate governance, execution, evidence, operational settlement, and developmental claims. | Horizon is observed to maintain separate governance, execution, evidence, operational settlement, and developmental claims. |
| REQ-GOAL-005 | subject/polarity restored | Observed in the runtime's own terms: preserve navigation context across focus changes, renderer changes, interruption, and replay. | Horizon is observed to preserve navigation context across focus changes, renderer changes, interruption, and replay. |
| REQ-INT-001 | subject/polarity restored | Observed in the runtime's own terms: project the IS1–IS8 Behavioral IR responsibilities and identify unresolved bindings explicitly. | Every canonical journey is observed to project the IS1–IS8 Behavioral IR responsibilities and identify unresolved bindings explicitly. |
| REQ-INT-002 | subject/polarity restored | Observed in the runtime's own terms: preserve persistent case/world/focus context while Clack presents one next meaningful decision at a tim | The GUI is observed to preserve persistent case/world/focus context while Clack presents one next meaningful decision at a time. |
| REQ-INT-004 | subject/polarity restored | Observed in the runtime's own terms: be misrepresented as independent approval or a world mutation. | An answer, choice or confirmation is never observed to be misrepresented as independent approval or a world mutation. |
| REQ-NAV-002 | ruler restored (verdict r2 F2) | An affordance assessment carrying any key outside visibility, reach, payment, authority, capability, recovery and settlement_access is rejec | Affordance gates use exactly the canonical keys visibility, reach, payment, authority, capability, recovery and settlement_access: an assess |
| REQ-NAV-003 | subject/polarity restored | Observed in the runtime's own terms: only eligible paths MAY be recommended as spendable; blocked paths MUST expose material reasons and rea | Only eligible paths may be observed to be recommended as spendable. Blocked paths are observed to expose material reasons and reachable prer |
| REQ-NAV-004 | subject/polarity restored | Observed in the runtime's own terms: retain discretion to inspect alternatives, defer, reframe or disagree with the representation. | The observer is observed to retain discretion to inspect alternatives, defer, reframe or disagree with the representation. |
| REQ-NAV-005 | restated, proof open (T07) | Observed in the runtime's own terms: avoid asking for context it can resolve without user burden. | The navigation controller avoids asking for context it can resolve without user burden. |
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
| REQ-STACK-004 | ruler restored (verdict r2 F2) | Bounded long-horizon work runs only through Gauntlet, and the run's Reference is frozen at start and preserved unchanged through every later | Gauntlet is used only for tasks that require bounded long-horizon work: a task that does not require bounded long-horizon work is never obse |
| REQ-STACK-005 | subject/polarity restored | Observed in the runtime's own terms: remain scoped/cited and MUST NOT be interpreted as canonical organizational truth. | Context Kernel results are observed to remain scoped/cited and MUST NOT be interpreted as canonical organizational truth. |
| REQ-STACK-006 | subject/polarity restored | Observed in the runtime's own terms: be treated as evidence derivation or settlement. | RealityTrace delivery receipts are never observed to be treated as evidence derivation or settlement. |
| REQ-STACK-007 | subject/polarity restored | Observed in the runtime's own terms: be separately referenced. | Operational obligation settlement and GodSpeed developmental interpretation is observed to be separately referenced. |
| REQ-STACK-008 | subject/polarity restored | Observed in the runtime's own terms: preserve correlation through observer/world/case/intent/authority/execution/evidence/settlement refs. | Every cross-system episode is observed to preserve correlation through observer/world/case/intent/authority/execution/evidence/settlement re |
| REQ-STACK-009 | subject/polarity restored | Observed in the runtime's own terms: only a SEA-Forge allow disposition with a matching invocation grant (bound to the exact action, targets | Only a SEA-Forge allow disposition with a matching invocation grant (bound to the exact action, targets, world_ref and unexpired) may be obs |
| REQ-STACK-010 | subject/polarity restored | Observed in the runtime's own terms: reach SEA-Forge, Gauntlet, RealityTrace, Context Kernel and the research subsystem only through Cognate | Horizon is observed to reach SEA-Forge, Gauntlet, RealityTrace, Context Kernel and the research subsystem only through Cognate capabilities  |
| REQ-STACK-011 | ruler restored (verdict r2 F2) | For a joined product, each proven facet (types and links, provenance-bearing read observations, SEA-Forge-covered action bindings, RealityTr | A product joins the world only through the product integration contract: a DomainForge module for its types, links and operations; a read co |
| REQ-STACK-012 | subject/polarity restored | Observed in the runtime's own terms: be required to adopt Horizon's language, storage or UI; non-TypeScript products integrate through proce | Products are never observed to be required to adopt Horizon's language, storage or UI; non-TypeScript products integrate through process, CL |
| REQ-STACK-013 | subject/polarity restored | Observed in the runtime's own terms: a product with its own UI MAY be reachable as a hosted surface via deep links that carry focus refs in  | A product with its own UI may be observed to be reachable as a hosted surface via deep links that carry focus refs in and return typed inten |
| REQ-STACK-014 | ruler restored (verdict r2 F2) | Every stack owner and joined product continues to operate through its own public surface with Horizon stopped or uninstalled, and Horizon ho | Dependency is one-way: every stack owner (DomainForge, Cognate, SEA-Forge, Gauntlet, RealityTrace, Context Kernel) and every joined product  |
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

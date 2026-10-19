# Atomic UI Handoff (T03)

Renderer-neutral projection of the proven Behavioral IR. This is not a rendered UI and does not select a framework.

## Inputs a renderer must preserve

- Canonical meaning: `.sea/interaction/interaction-model.sea`
- Behavior: `behavioral/journeys/J01.yaml` … `J06.yaml`
- Proof: `behavioral/PROOF-REPORT.md`, `behavioral/proof/transcripts/`
- Projection pressure: `behavioral/projection-pressure.yaml`
- Contract: `ui-model/atomic-ui-contract.yaml`
- Views: `ui-model/views/*.yaml`
- Traceability: `ui-model/traceability.yaml`
- Representation decisions: `ui-model/projection-decisions.yaml`

## Renderer mappings

| Renderer | Mapping | Must preserve |
|---|---|---|
| terminal / Clack | one question at a time with a persistent context strip | focus order, blocked reason, cancellation, next affordance |
| graphical | persistent regions with an evidence inspector | focus order, blocked reason, cancellation, next affordance, comparison |
| voice | spoken prompt with explicit confirmation and summary | blocked reason, cancellation, settlement separation |

At least two mappings must preserve the same meaning. A renderer may choose mechanisms freely but may not:

- turn a capability call into permission;
- enable an action from local state;
- present an execution record as settlement;
- present a simulated or developmental verdict as operational settlement;
- collect or simulate human approval;
- hide `unknown`, `unreachable`, `conflicted` or `denied` as a generic error;
- add a metric or action with no behavioral trace.

## Behavioral-fidelity acceptance criteria

1. Every consequential action names its semantic action, availability source, commitment, authority binding, evidence requirement and recovery relation.
2. Resolved context is never re-asked; the prompt view asks one unresolved decision at a time.
3. `blocked`, `unknown`, `conflicted`, `cancelled`, `executed_unsettled` and `settled` remain distinguishable in the rendered interface and in assistive output.
4. Evidence and settlement remain inspectable while a decision is pending.
5. Focus order and non-color status are honoured in both terminal and graphical mappings.
6. Comparison keeps baseline and alternatives simultaneously visible; it never implies a world change.
7. Breadcrumbs, command palette and deep-link entry resolve to the same behavioral frame.

## Unresolved for renderer work

- UIQ-01: which deferred build, monitor and research representations are earned (deferred to T04/T05).
- UIQ-02: concrete Clack focus and screen-reader semantics (deferred to renderer verification).
- Platform constraints are assumptions, not verified conformance.
- No accessibility conformance test was run; only semantic obligations are declared.

# Sequential Proof, Testing, and Projection Pressure

## Contents
- Sequential proof
- Testing
- Projection pressure

## Sequential proof

The lowest-bandwidth executable projection of the Behavioral IR. It answers: can a person navigate this modeled behavior coherently?

```text
identify/resolve case → establish context → expose missing information → derive current affordances
→ select semantic action → validate preconditions → resolve authority → expose commitment consequences
→ execute or simulate → inspect evidence → evaluate settlement → expose resulting state → derive next affordances
```

Entry modes:
- **Journey catalog** ("Where do you want to start?" listing canonical journeys): validates canonical coverage. Use for development and domain review.
- **Case-aware** ("What needs your attention?" listing current case + affordance, plus "Start new work"): represents current spendable action. Use for operational use.

## Testing

Test behavior, not screenshots. For each journey, exercise the applicable cases: happy settlement; missing-precondition block; authority block; missing-information route; safe cancellation; execution failure and recovery; execution success with settlement failure; unknown semantic rule; contradictory semantic rule; known journey variant; affordance dependency.

**Affordance-dependency test**: a higher-level action is available only when lower-level states, evidence, authority, capability, or settlement supply the substrate. Example chain: `identify_case → establish_context → inspect_evidence → determine_valid_actions → authorize_commitment → execute → settle → close_or_continue`. Remove or invalidate a lower dependency and assert the higher affordance disappears.

## Projection pressure

Record evidence that a richer representation is warranted in `projection-pressure.yaml`; do not implement the richer interface here. It is a primary input to `deriving-atomic-ui-models`.

| Observation | Candidate `kind` |
|---|---|
| repeatedly revisits prior context | `persistent_context` |
| repeatedly compares two artifacts | `simultaneous_comparison` |
| many records scanned together | `collection` |
| relationships determine judgment | `relationship_view` |
| history determines judgment | `temporal_view` |
| artifact must stay visible during action | `artifact_context` |

Entry shape (the atomic skill reads exactly these fields):

```yaml
- id: PP01
  kind: persistent_context
  journey: CJ04
  phases: [IS1, IS7]
  observation: actor returned to case identity 3 times during decision
  evidence_ref: proof/tests/cj04_decision.transcript
```

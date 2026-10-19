# T03 Evidence — Renderer-neutral Atomic UI IR

- Claim: every persistent or spatial UI element is justified by a behavioral obligation, accessibility requirement, explicit platform constraint, or recorded projection pressure, and every action projects Behavioral IR availability without duplicating gate policy.
- Preregistration: `.agents/prereg/horizon/T03.prereg.yaml` (authored before views).
- Upstream: Behavioral IR `behavioral/journeys/J01..J06.yaml`, proof `.agents/evidence/horizon/T02/`, pressure `behavioral/projection-pressure.yaml`.

## Gate runs

| Command | Result |
|---|---|
| `validate_atomic_ui_ir.py ui-model/views/*.yaml` | exit 0; six views `ok` |
| `scripts/check-ui-traceability.py` | exit 0; every element traced, every action sourced from `behavioral_ir` |
| `scripts/teeth-ui-traceability.py` | exit 0; all four attacks rejected and real views remain valid |
| YAML parse (contract, traceability, decisions, views) | exit 0 |
| `git diff --check` | exit 0 |

Logs: `atomic-ui-validation.log`, `traceability-check.log`, `teeth-ui-traceability.log`, `git-diff-check.log`.

## Positive observations

- Six views: `home_attention`, `sequential_prompt`, `evidence_inspector`, `history_timeline`, `comparison`, `navigation_entry`.
- Every element carries `traces_to {journey, phase, ref?}`; actions carry `availability.source: behavioral_ir` and a behavioral reference.
- Consequential actions declare commitment, authority binding, evidence requirement and recovery relation.
- Three renderer mappings (terminal/Clack, graphical, voice) preserve the same meaning; accessibility focus order is declared per view.
- Projection pressure is adopted, simplified or deferred with reasons (`ui-model/projection-decisions.yaml`), including explicit rejection of a dashboard and of any UI approval control.

## Teeth

1. Untraceable `dashboard_metric` rejected: `untraceable element (traces_to required)`.
2. Unknown `approve_payment` action rejected: `not in the Behavioral IR`.
3. Local `enabled_when` availability rejected: `forbidden local policy key`.
4. Missing accessibility rejected: `accessibility.focus_order required`.

## Limits

- No renderer was implemented or rendered; fidelity to a real Clack/terminal or graphical stack is unverified.
- Deferred views (J03 build, J04 monitor, J06 research) are recorded as reverse-coverage gaps, not claimed.
- Accessibility obligations are declared, not conformance-tested.
- Fixture-backed behavioral evidence remains simulation, not live settlement.

## Artifact hashes (SHA-256)

```
5563838db694c83148e031503aedacfec8d0b313b025e73b37539acd94eb8ac9  ui-model/atomic-ui-contract.yaml
f3c370b074cb2ea121aadd707f92a8404cdf723be35e606f3e2730bbf032ba32  ui-model/traceability.yaml
b5e1d07ef18615a565579707d7affb9fd1060f1ed69ebd4eec13dfb8f5e532bc  ui-model/projection-decisions.yaml
05e05474241f01451dfbaa75cf8b8e73356e947f6029ef6b3e1e4d248cef3eaf  ui-model/handoff.md
e3b5578421a61a87f3b47e87fd4ec9c1e17ac49a3b8061ea626b97f457c0962c  ui-model/views/comparison.yaml
e612839dc62c5b2cfdc8c64cadf3fe431ee433d1bed9025792209faedfdd47aa  ui-model/views/evidence_inspector.yaml
dba600dccd2ec9dd7f1fd1dd7f6da3c475ae99aa0cf79c449eb93d5552306158  ui-model/views/history_timeline.yaml
14951d9698eff1c7b2b53b0b915af6ddb54881c3e74c4ac7f1108c2df4714a62  ui-model/views/home_attention.yaml
f3ca2b389dffde74e907167759f12755407d1d8f4a775b931d4f9cccf97b9941  ui-model/views/navigation_entry.yaml
0b1f6e6b31829260395fcc8de1e6b1f74c44a43e61e94ef3ee52bb2c6c5bb431  ui-model/views/sequential_prompt.yaml
6ca2c787f8b0b77d054a25ae7bd2ce21c444f03c5b8593d88dfc3613be3f0994  scripts/check-ui-traceability.py
5d16c7d5e50230a70efd1ccfdcbaf5bef93d61c7b276d0f703fb1e0625ef6684  scripts/teeth-ui-traceability.py
bcdaaabdd12606c4edfd4defb2b74ed6df394414fe1e214e9c99857ed860976c  .agents/prereg/horizon/T03.prereg.yaml
```

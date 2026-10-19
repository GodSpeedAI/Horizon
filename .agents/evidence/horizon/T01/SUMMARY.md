# T01 Evidence Summary — Canonical DomainForge Interaction Model (P1)

Predecessor: T00 (settled, commit `4dbc06c`). Preregistration:
`.agents/prereg/horizon/T01.prereg.yaml` (authored before any `.sea`).

## Proof level

P2, confirmation `builder_with_adversarial_teeth`.

## What was proven

The frozen spec's six canonical journeys J01–J06, the seven canonical affordance
gate keys, the closed authority vocabulary, the world-state distinction and the
material unknowns are encoded in valid, validated `.sea`, and `world_ref` is
composed from DomainForge-owned identity only (REQ-STACK-001, REQ-WORLD-004,
REQ-GOAL-001).

## Narrow gates (all green)

| Gate | Command | Result | Log |
| ---- | ------- | ------ | --- |
| validate | `domainforge validate .sea/interaction/interaction-model.sea --application --format human` (0.21.1) | exit 0; 0 violations; app contract valid | `gate-01-validate-application.log` |
| diff | `git diff --check` | exit 0 | `gate-02-git-diff-check.log` |
| contract | `domainforge contract .sea/interaction/interaction-model.sea` | exit 0; closure hash present | `gate-03-contract.log` |
| coverage | `python3 scripts/check-idm-coverage.py` | exit 0; 6 journeys/7 gates/4 ops/6 unknowns | `gate-04-coverage.log` |
| world-ref | `python3 scripts/world-ref.py .sea/interaction/interaction-model.sea` | exit 0; `world:horizon@sha256:b0f31fcc…4ca1` | `gate-05-world-ref.log` |

## Teeth (all blocked as claimed)

| Teeth | Attack | Observed | Log |
| ----- | ------ | -------- | --- |
| 01a | guessed `Relation` with undeclared Role | `Undefined object role 'UndeclaredApproverRole'`, exit 1 | `teeth-01a-guessed-relation.log` |
| 01b | guessed `Flow` with undeclared Resource | `Undefined resource: GuessedMagicCapabilityToken`, exit 1 | `teeth-01b-guessed-flow.log` |
| 02 | changed closure asserted as same identity | changed hash `7c2dff6e…`, `assert-same` exit 1; unchanged exit 0 | `teeth-02-world-identity.log` |
| 03 | coverage with J06 removed | `missing canonical journey J06`, exit 1 | `teeth-03-coverage-missing-journey.log` |

## Artifacts

`.sea/interaction/` — `interaction-model.sea` (entry), `research-artifacts.sea`,
`product-integration-contract.sea`, `products/{godspeed-research,strategist}.sea`,
README, journey catalog, source translation map, assumptions/unknowns, handoff,
`validation/`. Scripts: `scripts/world-ref.py`, `scripts/check-idm-coverage.py`.
Hashes: `artifact-hashes-and-final-rerun.log`.

## Remaining unknowns

OQ-IDM-01..06 (See `../../../../.sea/interaction/assumptions-and-unknowns.md`).
No operational binding, instance query, UI or live integration is claimed.

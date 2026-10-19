# Diagnostics

Pinned toolchain: DomainForge `0.21.1`
(`/home/sprime01/projects/domainforge/target/release/domainforge`, built from
`~/projects/domainforge` HEAD `6e941ff`). The PATH `domainforge` is stale
`0.19.0` (DEBT D-007); all T01 commands used `DOMAINFORGE_BIN` pointing at the
0.21.1 release binary.

| Command | Result |
| ------- | ------ |
| `domainforge validate .sea/interaction/interaction-model.sea --application --format human` | exit 0 — `Validation succeeded: 0 violations total`; `Application contract valid: 4 operation(s), 8 record(s), 16 enum(s), 24 entities` |
| `domainforge contract .sea/interaction/interaction-model.sea` | exit 0 — `domainforge-application-contract/v1` with DomainForge-owned `semantic_closure_hash` |
| `domainforge envelope … --emit representation` | exit 0 — closure hash used to compose `world_ref` |
| `python3 scripts/check-idm-coverage.py` | exit 0 — 6 journeys, 7 gates, 4 operations, 6 open questions |
| `git diff --check` | exit 0 |

## Errors discovered and corrections made

Iterative authoring against 0.21.1 surfaced and fixed:

1. Imports resolved by namespace, not file path, unless the specifier is a
   relative `.sea` path. Correction: relative path imports.
2. `@profile "horizon-idm"` rejected — available profiles are `default|cloud|data`.
   Correction: `@profile "default"`.
3. Typed-entity instances must live in the same namespace as the entity.
   Correction: moved research/product instances into their owning modules.
4. Application Contract §4 requires input fields to match state fields
   (name/type/constraints), an input field equal to the entity key for reads, an
   InputValidation failure code, and constructible/defaulted required state
   fields. Correction: aligned records, added defaults, added `input_validation`
   failure codes.
5. A `state` clause cannot reference an entity via a wildcard import alias in
   the observed build. Correction: moved `run_preregistered_experiment` into the
   research module that owns `ExperimentRun`.

## Remaining diagnostics

None for the pinned 0.21.1 binary. See `limitations.md` for semantic (not
diagnostic) compromises.

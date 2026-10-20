set shell := ["bash", "-uc"]

domainforge_bin := env_var_or_default("DOMAINFORGE_BIN", "../domainforge/target/release/domainforge")
world_ref := "world:horizon@sha256:6c18d6a608bd9d83e6aa354d5a8cc804009ca208562021c1736ee429412309f0"

default:
    @just --list

setup:
    bun install
    uv sync --project research --all-groups

check:
    bun run scripts/check.ts

boundaries:
    bun run scripts/check-boundaries.ts

idm-integrity:
    python3 scripts/check-idm-integrity.py

acceptance-claims:
    python3 scripts/check-acceptance-claims.py --ledger .agents/candidates/horizon/T04-CR-001/ledger.yaml --require-candidate

acceptance-claims-frozen:
    @echo "acceptance-claims-frozen: the ACTIVE frozen ledger does not preserve its prohibitions; expected to fail until T04-CR-001 is authorized and re-frozen"
    python3 scripts/check-acceptance-claims.py

test:
    bun test
    uv run --project research pytest -q

ledger:
    python3 .agents/skills/project-topology-architect/scripts/validate-requirement-ledger.py requirements/ledger.yaml --project-root . --require-freeze
    ./scripts/check-ledger-freeze.sh

wayfinder:
    python3 .agents/skills/project-topology-architect/scripts/validate-wayfinder.py . --ledger requirements/ledger.yaml
    ./scripts/check-ledger-freeze.sh

teeth:
    bun run scripts/teeth.ts
    bash scripts/teeth-ledger-freeze.sh
    python3 scripts/teeth-domainforge-gate.py
    python3 scripts/teeth-idm-integrity.py

status:
    tail -n 1 .agents/CURRENT_STATUS.jsonl

# `verify` is T04's declared gate (`.agents/plans/horizon.plan.yaml` T04.gate lists
# `just check`, `just boundaries`, `just verify`), so it carries every required proof:
# the baseline checks AND the adversarial teeth. It reads the ACTIVE frozen artifact set.
verify: check boundaries idm-integrity test ledger wayfinder teeth
    @echo "verify: ok (active frozen artifacts: requirements/ledger.yaml + .wayfinder/answer-key.md)"

check-toolchain:
    @test -x "{{domainforge_bin}}" || (echo "domainforge missing: set DOMAINFORGE_BIN to the 0.21.1 binary" && exit 1)
    @test "$({{domainforge_bin}} --version | tr -d '[:space:]')" = "domainforge0.21.1" || (echo "domainforge must be 0.21.1" && exit 1)

gate-t01: check-toolchain
    {{domainforge_bin}} validate .sea/interaction/interaction-model.sea --application --format human
    python3 scripts/world-ref.py --expect "{{world_ref}}" .sea/interaction/interaction-model.sea
    python3 scripts/check-idm-coverage.py
    python3 scripts/check-idm-integrity.py

gate-t02:
    python3 behavioral/proof/run.py --out .tmp/t02-transcripts
    python3 behavioral/proof/teeth_authority.py
    python3 behavioral/proof/teeth_prompt_burden.py

gate-t03:
    python3 .agents/skills/deriving-atomic-ui-models/scripts/validate_atomic_ui_ir.py ui-model/views/*.yaml
    python3 scripts/check-ui-traceability.py
    python3 scripts/teeth-ui-traceability.py

gate-t04: check boundaries idm-integrity acceptance-claims test ledger wayfinder teeth
    @echo "gate-t04: ok — active frozen artifacts verified; T04-CR-001 candidate contracts verified; T04 settlement still requires an independent verdict"

freeze-t04:
    ./scripts/freeze-formation.sh

gate-t05:
    @echo "gate-t05: not implemented; fails closed until T05 settles"
    @exit 1

gate-t06:
    @echo "gate-t06: not implemented; fails closed until T06 settles"
    @exit 1

gate-t07:
    @echo "gate-t07: not implemented; fails closed until T07 settles"
    @exit 1

gate-t08:
    @echo "gate-t08: not implemented; fails closed until T08 settles"
    @exit 1

gate-t09:
    @echo "gate-t09: not implemented; fails closed until T09 settles"
    @exit 1

gate-t10:
    @echo "gate-t10: not implemented; fails closed until T10 settles"
    @exit 1

gate-t11:
    @echo "gate-t11: not implemented; fails closed until T11 settles"
    @exit 1

gate-t12:
    @echo "gate-t12: not implemented; fails closed until T12 settles"
    @exit 1

gate-t13:
    @echo "gate-t13: not implemented; fails closed until T13 settles"
    @exit 1

gate-t14:
    @echo "gate-t14: not implemented; fails closed until T14 settles"
    @exit 1

gate-t15:
    @echo "gate-t15: not implemented; fails closed until T15 settles"
    @exit 1

gate-t16:
    @echo "gate-t16: not implemented; fails closed until T16 settles"
    @exit 1

gate-t17:
    @echo "gate-t17: not implemented; fails closed until T17 settles"
    @exit 1

gate-t18:
    @echo "gate-t18: not implemented; fails closed until T18 settles"
    @exit 1

gate-t19:
    @echo "gate-t19: not implemented; fails closed until T19 settles"
    @exit 1

gate-t20:
    @echo "gate-t20: not implemented; fails closed until T20 settles"
    @exit 1

gate-t21:
    @echo "gate-t21: not implemented; fails closed until T21 settles"
    @exit 1

gate-t22:
    @echo "gate-t22: not implemented; fails closed until T22 settles"
    @exit 1

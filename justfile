set shell := ["bash", "-uc"]

domainforge_bin := env_var_or_default("DOMAINFORGE_BIN", "../domainforge/target/release/domainforge")
world_ref := "world:horizon@sha256:0a10c20d22ee11a184165005a553390e7a45ce0b858773e2220e442eb0cf9d2b"

default:
    @just --list

setup:
    bun install
    uv sync --project research --all-groups

check:
    bun run scripts/check.ts

# Desktop (Tauri v2) shell. `desktop-sidecar` compiles the server for this host and stages it where Tauri bundles it.
# `desktop-build` then builds the installer bundles; CI (desktop.yml) does the same per platform.
desktop-sidecar:
    bun run build:sidecar

desktop-build: desktop-sidecar
    bun x @tauri-apps/cli@2.12.4 build

desktop-supervisor-test:
    cargo test --manifest-path src-tauri/Cargo.toml -p horizon-supervisor


# Refuse to start a 1.0.1 build against a store holding contract_version 2 state (SPEC-CR-002 Rollback).
rollback-guard store:
    bun run scripts/rollback-guard.ts {{store}}

boundaries:
    bun run scripts/check-boundaries.ts

idm-integrity:
    python3 scripts/check-idm-integrity.py

acceptance-claims:
    python3 scripts/check-acceptance-claims.py

# A contract can keep its polarity and still add policy (a MAY or SHOULD made absolute, a
# behaviour, authority or quantifier the requirement does not name). This check fails on a
# NEW finding and on a stale baseline entry. Baseline entries are keyed by full ledger path
# and contract-text digest (DEBT D-020), so a repaired contract cannot regress silently.
witness-claims:
    python3 scripts/check-witness-claims.py

# The mechanical measure behind the check: which contracts drop a requirement's modal.
# Only REQ-RES-001 is baselined (a lexical false positive the independent verdict r2 ruled
# acceptable); any other loss, or a stale entry, fails.
contract-modals:
    python3 scripts/measure-contract-modals.py --ledger requirements/ledger.yaml --baseline scripts/witness-claims-baseline.txt

test: test-bun test-py

test-bun:
    bun test

test-py:
    uv run --project research pytest -q

ledger:
    python3 .agents/skills/project-topology-architect/scripts/validate-requirement-ledger.py requirements/ledger.yaml --project-root . --require-freeze
    python3 scripts/check-ledger-invariants.py
    ./scripts/check-ledger-freeze.sh

wayfinder:
    python3 .agents/skills/project-topology-architect/scripts/validate-wayfinder.py . --ledger requirements/ledger.yaml
    ./scripts/check-ledger-freeze.sh

# T05: one closed grammar, one binder, one reducer, one projection. The narrow proof is the
# topology check (`check-t05`), its teeth (`teeth-t05-boundaries`, which must catch a *second*
# grammar, a route that binds for itself, or a renderer beside the authority) and the live
# cross-transport equivalence (`teeth-t05-equivalence`, which starts the real server and runs
# the real CLI rather than trusting a mock). Then the applicable global gates.
#
# `check-t05-prereg-coverage` proves *linkage* only (each registered expectation is named by a
# test that names its anchors). `teeth-t05-mutation` proves strength: it breaks a property and
# requires the named test to fail. The two are deliberately separate targets so neither result
# can be read as the other.
check-t05:
    bun run scripts/check-t05-boundaries.ts
    bun run scripts/check-t05-prereg-coverage.ts

teeth-t05-boundaries:
    bun run scripts/teeth-t05-boundaries.ts

teeth-t05-equivalence:
    bun run scripts/teeth-t05-equivalence.ts

teeth-t05-coverage: teeth-t05-prereg-coverage
teeth-t05-prereg-coverage:
    bun run scripts/teeth-t05-prereg-coverage.ts

teeth-t05-mutation:
    bun run scripts/teeth-t05-mutation.ts

teeth-t05: teeth-t05-boundaries teeth-t05-equivalence teeth-t05-prereg-coverage teeth-t05-mutation

# T06: the operational object layer. The shape check runs first because a preregistration whose
# expectations a parser cannot see would make every count below meaningless (DEC-T05-09). Coverage
# proves linkage; mutation proves strength; neither stands for the other.
check-t06:
    bun run scripts/check-prereg-shape.ts .agents/prereg/horizon/T06.prereg.yaml
    bun run scripts/check-t06-prereg-coverage.ts

teeth-t06-shape:
    bun run scripts/teeth-t06-shape.ts

teeth-t06-mutation:
    bun run scripts/teeth-t06-mutation.ts

teeth-t06: teeth-t06-shape teeth-t06-mutation

gate-t06: check-t06 teeth-t06 test check boundaries idm-integrity acceptance-claims witness-claims contract-modals ledger wayfinder teeth
    @echo "gate-t06: ok — operational object layer on Cognate's public Projection API"

gate-t05: check-t05 teeth-t05 check boundaries idm-integrity acceptance-claims witness-claims contract-modals test ledger wayfinder teeth
    @echo "gate-t05: ok — horizon.surface/2 + horizon.gui-view/1 verified across GUI/CLI/MCP"

teeth: teeth-t05-boundaries
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

# CI runs `verify` as two parallel parts: the bun suite in shards (`bun run scripts/ci-test-shard.ts <i> <n>`)
# and everything else here. Together they are exactly `verify`; the aggregate job fails if either part does.
verify-static: check boundaries idm-integrity test-py ledger wayfinder teeth
    @echo "verify-static: ok (everything in verify except the bun suite)"

check-toolchain:
    @test -x "{{domainforge_bin}}" || (echo "domainforge missing: set DOMAINFORGE_BIN to the 0.22.0 binary" && exit 1)
    @test "$({{domainforge_bin}} --version | tr -d '[:space:]')" = "domainforge0.22.0" || (echo "domainforge must be 0.22.0" && exit 1)

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

gate-t04: check boundaries idm-integrity acceptance-claims witness-claims contract-modals test ledger wayfinder teeth
    @echo "gate-t04: ok — frozen artifacts (T04-CR-001@2026-10-20) verified"

freeze-t04:
    ./scripts/freeze-formation.sh

# T07: the navigation controller. Shape first, then linkage, then strength. The mutation teeth run
# the named test against a broken controller, so a passing coverage count is never read as proof.
check-t07:
    bun run scripts/check-prereg-shape.ts .agents/prereg/horizon/T07.prereg.yaml
    bun run scripts/check-t07-prereg-coverage.ts

teeth-t07-mutation:
    bun run scripts/teeth-t07-mutation.ts

teeth-t07: teeth-t07-mutation

gate-t07: check-t07 teeth-t07 test check boundaries idm-integrity acceptance-claims witness-claims contract-modals ledger wayfinder teeth
    @echo "gate-t07: ok — deterministic navigation and observer-relative affordance controller"

# T08: the Clack-style sequential renderer. The narrow suites exercise the controller, the real
# OpenTUI keyboard path, the T06 projection adapter and `horizon frame`; the teeth are a separate
# target so a green consumer path cannot stand in for an adversarial refusal.
check-t08:
    bun test test/sequential-controller.test.ts test/sequential-terminal.test.tsx test/sequential-source.test.ts test/sequential-cli.test.ts

teeth-t08:
    bun test test/sequential-teeth.test.ts

gate-t08: check-t08 teeth-t08 test check boundaries idm-integrity acceptance-claims witness-claims contract-modals ledger wayfinder teeth
    @echo "gate-t08: ok — sequential Clack renderer over the shared navigation frame"

# T09: the server-rendered atomic GUI over the shared frame and closed surface. The narrow target
# proves the model and semantic HTML; the teeth separately attack forged/stale forms, agent
# proposals, missing evidence and escaping.
check-t09:
    bun run scripts/check-prereg-shape.ts .agents/prereg/horizon/T09.prereg.yaml
    bun test test/workspace-model.test.ts test/desk-render.test.tsx

teeth-t09:
    bun test test/desk-teeth.test.tsx

gate-t09: check-t09 teeth-t09 test check boundaries idm-integrity acceptance-claims witness-claims contract-modals ledger wayfinder teeth
    @echo "gate-t09: ok — atomic GUI projection in Cognate React"

# T10: the seven-operation world debugger over the shared frame, and CK retrieval through the
# boot-registered capability. The narrow target proves shape and coverage; the teeth separately
# attack untrusted citations, counterfactual authority, denied/absent retrieval, unbounded
# traversal and unreadable checkpoints, and a mutation runner proves those teeth actually bite.
check-t10:
    bun run scripts/check-prereg-shape.ts .agents/prereg/horizon/T10.prereg.yaml
    bun test test/retrieval-debugger.test.ts

teeth-t10:
    bun test test/retrieval-debugger-teeth.test.ts

teeth-t10-mutation:
    bun run scripts/teeth-t10-mutation.ts

gate-t10: check-t10 teeth-t10 teeth-t10-mutation test check boundaries idm-integrity acceptance-claims witness-claims contract-modals ledger wayfinder teeth
    @echo "gate-t10: ok — source-grounded seven-operation world debugger with CK retrieval"

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

# T23: the unified human and agent identity, delegation and authority contract. The narrow target
# proves the closed operation catalog, the frozen record schemas and the cross-language fixtures:
# an unlisted operation, a lowered class, a substituted caller or a human-session grant fails
# them. The prereg linkage is checked so a Stage 0A expectation cannot drift out of a named test,
# and the mutation teeth attack the catalog and the record rules one property at a time.
# The defect-remediation unit and the issuer profile are Stage 0A units of the same task, so they
# are gated here too: a unit whose expectations are unlinked, or whose negative tests would pass
# against the undone fix, blocks the task.
check-t23:
    bun run scripts/check-prereg-shape.ts .agents/prereg/horizon/T23.prereg.yaml
    bun run scripts/check-t23-prereg-coverage.ts
    bun run scripts/check-prereg-shape.ts .agents/prereg/horizon/STAGE-0A-DEFECTS.prereg.yaml
    bun run scripts/check-stage0a-defects-prereg-coverage.ts
    bun run scripts/check-prereg-shape.ts .agents/prereg/horizon/STAGE-0A-REMEDIATION.prereg.yaml
    bun run scripts/check-stage0a-remediation-prereg-coverage.ts
    bun run scripts/check-prereg-shape.ts .agents/prereg/horizon/STAGE-0A-REMEDIATION-2.prereg.yaml
    bun run scripts/check-stage0a-remediation-2-prereg-coverage.ts
    bun run scripts/check-prereg-shape.ts .agents/prereg/horizon/STAGE-0A-REMEDIATION-3.prereg.yaml
    bun run scripts/check-stage0a-remediation-3-prereg-coverage.ts
    bun run scripts/check-prereg-shape.ts .agents/prereg/horizon/STAGE-0A-REMEDIATION-4.prereg.yaml
    bun run scripts/check-stage0a-remediation-4-prereg-coverage.ts
    bun run scripts/check-prereg-shape.ts .agents/prereg/horizon/STAGE-0B-CONTAINMENT.prereg.yaml
    bun run scripts/check-stage0b-containment-prereg-coverage.ts
    bun run scripts/check-param-schema-binding.ts
    bun run scripts/check-design-contract-consistency.ts
    bun run scripts/check-delegation-register.ts
    bun run scripts/check-dispatch-coverage.ts
    bun run scripts/check-route-census.ts
    bun run scripts/check-external-interface-facts.ts
    bun test test/identity-contract.test.ts test/identity-records.test.ts
    bun test test/identity-defects.test.ts
    bun test test/identity-issuer.test.ts
    bun test test/identity-remediation.test.ts
    bun test test/identity-remediation-2.test.ts
    bun test test/identity-remediation-3.test.ts
    bun test test/identity-remediation-4.test.ts
    bun test test/pending-confirmations.test.ts test/containment-routes.test.ts
    uv run --project research pytest research/tests/test_identity_fixtures.py -q

teeth-t23-mutation:
    bun run scripts/teeth-t23-mutation.ts

teeth-t23: teeth-t23-mutation

gate-t23: check-t23 teeth-t23 test check boundaries idm-integrity acceptance-claims witness-claims contract-modals ledger wayfinder teeth
    @echo "gate-t23: ok — closed operation catalog, frozen record schemas and cross-language identity fixtures"

# SEA-Forge gateway and Horizon runtime, two service accounts (Linux/WSL). Nothing here runs privileged
# commands on its own; the only privileged step is the sudo command gateway-install prints.
# gateway-stage [--development]: unprivileged. Writes the staging bundle (plan, runtime tree, manifest, units, status).
gateway-stage *args:
    bun run scripts/gateway-setup.ts stage {{args}}

# gateway-plan [--development]: stages, then prints the full privileged plan as a dry run. Changes nothing.
gateway-plan *args:
    bun run scripts/gateway-setup.ts stage {{args}}
    scripts/install-sea-forge-gateway.sh --dry-run

# gateway-install BINARY SHA256 BUN BUN_SHA256: dry run with the server binary and the runtime's bun verified (bun is
# copied to a root-owned path by the owner's sudo step; nothing is downloaded), then prints the exact sudo command.
gateway-install binary="" sha256="" bun="" bun_sha256="":
    scripts/install-sea-forge-gateway.sh --dry-run --binary "{{binary}}" --sha256 "{{sha256}}" --bun "{{bun}}" --bun-sha256 "{{bun_sha256}}"
    @echo "Then start the services (as you): sudo systemctl daemon-reload && sudo systemctl enable --now godspeed-sea-forge.service godspeed-horizon.service"

# gateway-check: read-only ownership, mode, membership and socket-access check. Expects the agent to be denied the socket.
gateway-check:
    scripts/install-sea-forge-gateway.sh --check

# Seed data for the TEST setup only (technical annex J.2). Each recipe loads the test setup's environment first;
# the script itself refuses anything but HORIZON_SETUP=testing with the test setup's SETUP.json marker.
# Everything is made through real interfaces (case keeper, realitytrace CLI, the Horizon store, gh on the sandbox repository).
seed:
    #!/usr/bin/env bash
    set -euo pipefail
    set -a; eval "$(bun run scripts/setup-env.ts testing --service horizon)"; set +a
    # A fresh test setup has no test board yet: make it first (sandbox repository only).
    if [ ! -f "${HORIZON_SETUPS_BASE:-$HOME/.horizon/setups}/testing/github.json" ]; then bun run scripts/setup-github.ts --setup testing; fi
    bun run scripts/seed.ts

# Prints each seeded part and whether it is present.
seed-status:
    #!/usr/bin/env bash
    set -euo pipefail
    set -a; eval "$(bun run scripts/setup-env.ts testing --service horizon)"; set +a
    bun run scripts/seed.ts --status

# Records cannot be removed one by one: this clears the whole TEST setup. It shows the full list, asks you to type yes
# (or pass --yes), clears, then runs setup-init so the setup is empty again. Stop the test setup first.
seed-clear *flags:
    #!/usr/bin/env bash
    set -euo pipefail
    set -a; eval "$(bun run scripts/setup-env.ts testing --service horizon)"; set +a
    bun run scripts/seed.ts --clear {{flags}}

# seed-clear, then seed. The test setup must be stopped for the clear and started again before the seed.
seed-reset *flags: (seed-clear flags) seed

# Sequential Behavioral Proof Engine

## Overview

Fixture-backed PROVE-mode harness for Horizon's six canonical journeys. It walks one
decision at a time across interaction stages IS1–IS8 and compares the observed
outcome against a preregistered expectation. A `settled` result is a fixture
outcome only; `engine.py:run_scenario` never claims live external settlement.

Three entry points share the same engine: a scenario-matrix runner, an
authority-removal teeth script, and a prompt-burden teeth script.

## Interface

- `AUTHORITY_PASS`, `AUTHORITY_PENDING`, `AUTHORITY_BLOCK`, `PAYMENT_PASS`, `RECOVERY_PASS`, `SETTLEMENT_PASS` — module-level policy sets that classify gate values `[engine.py:AUTHORITY_PASS]`
- `load_journey(path)` — reads and YAML-parses a journey document `[engine.py:load_journey]`
- `run_scenario(journey, scenario, *, all_mandatory=False)` — evaluates IS1–IS7 for one scenario and returns a result dict `[engine.py:run_scenario]`
- `run_file(journey_path, scenario, **kwargs)` — `load_journey` + `run_scenario` composition `[engine.py:run_file]`
- `dumps(result)` — stable JSON serialisation (`indent=2`, `sort_keys=True`) `[engine.py:dumps]`
- `clone_journey(journey)` — `copy.deepcopy` wrapper used to build degraded fixtures `[engine.py:clone_journey]`
- `_present(scenario)` — flattens `context`, `preflight`, `state` into one mapping `[engine.py:_present]`
- `_next_affordances(journey, final_status)` — filters IS8 candidates against their gate values `[engine.py:_next_affordances]`
- `_result(...)` — assembles the transcript-bearing result record `[engine.py:_result]`
- `main()` — scenario matrix runner; flags `--scenarios` (default `./scenarios.yaml`) and `--out` (default `./transcripts`) `[run.py:main]`
- `scenarios.yaml` — fixture matrix parsed by `run.py:main` via `yaml.safe_load`, by `teeth_authority.py:main`, and by `teeth_prompt_burden.py:main` `[run.py:main]`
- `main()` — authority-removal teeth; patches `IS3_authority_resolution.approval.status` and `IS7_settlement_or_decision.settlement_binding.status` to `unresolved_in_source` `[teeth_authority.py:main]`
- `main()` — prompt-burden teeth; compares contextual against `all_mandatory=True` runs `[teeth_prompt_burden.py:main]`
- `transcripts/` — generated per-scenario result JSON, written by `run.py` `--out`; no EGM contract is maintained for this directory.

## Invariants

- `_result` always emits `inferred_authority: False`, `authority_granted: False`, `simulated: True`, `execution_distinct_from_settlement: True`, `settlement_distinct_from_evidence: True` `[engine.py:_result]`
- A consequential journey (`journey.consequential` truthy) whose `IS3_authority_resolution.approval.status` is not `bound` returns `blocked` with `unauthorized_or_unresolved` before any authority value is read `[engine.py:run_scenario]`
- Missing IS1 required field returns `blocked` with `missing_context` immediately, before IS2 runs `[engine.py:run_scenario]`
- An IS2 check whose `resolved_by` value is absent, `None`, `""` or `False` returns `blocked` with that check's declared `failure` `[engine.py:run_scenario]`
- `unknown` and `blocked` are kept distinct: `unknown`/`unreachable` authority, `unknown` capability, `payment == "unknown"` and `recovery == "unknown"` yield status `unknown`; other non-pass values yield `blocked` `[engine.py:run_scenario]`
- The settlement gate requires `IS7_settlement_or_decision.settlement_binding.status == "bound"` **and** `settlement_access` in `SETTLEMENT_PASS` **and** not `not_required`, else `blocked` with `no_settlement_access` `[engine.py:run_scenario]`
- `contradictory` yields `conflicted`/`contradictory_evidence`; `cancelled` yields `cancelled`/`observer_cancelled`; both are explicit outcomes rather than silent passes `[engine.py:run_scenario]`
- Required evidence not observed returns `unknown` with `evidence_incomplete`; the literal name `citations` is exempt from the requirement `[engine.py:run_scenario]`
- A non-consequential journey terminates as `available` and records settlement as `not_applicable_read_only` `[engine.py:run_scenario]`
- `_next_affordances` only offers navigation-class candidates once the run has failed to pass, and withholds non-navigation candidates when the outcome is `cancelled` `[engine.py:_next_affordances]`
- `all_mandatory=True` re-asks every IS1 required field, recording `redundant_already_resolved` for those already present `[engine.py:run_scenario]`
- `run.py:main` forces exit code `1` when any status or `expected_reason` mismatches, or when the engine reports inferred/granted authority `[run.py:main]`
- `teeth_authority.py:main` requires the intact J02 fixture to settle, the degraded fixture to not settle, the blocker to be one of `unauthorized_or_unresolved`/`no_settlement_access`, and no inferred authority `[teeth_authority.py:main]`
- `teeth_prompt_burden.py:main` requires the contextual run to ask nothing, remain `available`, and the mandatory run to ask exactly 4 questions with 4 `redundant_already_resolved` transcript entries `[teeth_prompt_burden.py:main]`

## Side Effects

- Reads journey YAML from disk with `Path(path).read_text(encoding="utf-8")` `[engine.py:load_journey]`
- Reads the scenario matrix with `yaml.safe_load(Path(args.scenarios).read_text(...))` `[run.py:main]`
- Creates the transcript output directory with `mkdir(parents=True, exist_ok=True)` and writes one `<scenario_id>.json` per scenario `[run.py:main]`
- Mutates `sys.path` at import time to resolve the sibling `engine` module `[run.py:main]` (also `[teeth_authority.py:main]`, `[teeth_prompt_burden.py:main]`)
- Emits per-scenario `PASS`/`FAIL` lines and a match summary to stdout `[run.py:main]`
- Emits teeth check lines and observed status/reason text to stdout `[teeth_authority.py:main]`
- Reads process argv through `argparse` `[run.py:main]`
- Resolves repository paths from `Path(__file__).resolve()` and reads `behavioral/journeys/J01.yaml` / `J02.yaml` `[teeth_authority.py:JOURNEY]`
- No subprocess execution, no clock or randomness reads, and no environment-variable reads observed in source.

## Verification

- Run: `just gate-t02`

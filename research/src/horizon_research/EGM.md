# horizon_research

## Overview

Transport and schema-validation package for the process contract between Cognate
and Horizon's Python developmental research subsystem. This package ships the
typed envelope only: `contract.py` exposes a health probe and a ping exchange over
stdin/stdout. No datasets, models, calibration or experiment execution are
implemented here.

## Interface

- `CONTRACT = "horizon.research/1"` — protocol version string embedded in every response `[contract.py:CONTRACT]`
- `Health` — `TypedDict` with keys `contract`, `status`, `capabilities`, `ml` `[contract.py:Health]`
- `Pong` — `TypedDict` with keys `contract`, `kind`, `echo` `[contract.py:Pong]`
- `ContractError(ValueError)` — raised for any malformed request document `[contract.py:ContractError]`
- `health()` — returns the static health payload `[contract.py:health]`
- `ping(document)` — validates a request document and returns a pong payload `[contract.py:ping]`
- `main(argv=None)` — CLI dispatch for `--health` and `--ping` `[contract.py:main]`
- `horizon-research` — installed console script entry point mapped to `horizon_research.contract:main` `[../../pyproject.toml:project.scripts]`
- `__init__.py` carries a module docstring only and exports no symbols `[__init__.py]`.

## Invariants

- `ping` raises `ContractError("request must be a JSON object")` when the document is not a `dict` `[contract.py:ping]`
- `ping` raises `ContractError` when `document["kind"] != "ping"` `[contract.py:ping]`
- `ping` raises `ContractError` when `echo` is not a `str` or is empty `[contract.py:ping]`
- `health()` always reports `status: "ok"`, `ml: False`, and `capabilities: ["health", "typed-process-contract"]` `[contract.py:health]`
- `main` accepts arguments only as exact lists `["--health"]` or `["--ping"]`; any other argv prints usage and returns `2` `[contract.py:main]`
- `main` returns `1` on `json.JSONDecodeError` or `ContractError`, `0` on success `[contract.py:main]`
- The protocol version reported by `health()` and every pong/error envelope is the module constant `CONTRACT` `[contract.py:CONTRACT]`

## Side Effects

- Writes JSON payloads to stdout with `print(json.dumps(..., sort_keys=True))` `[contract.py:main]`
- Writes the usage line to stderr `[contract.py:main]`
- Reads the request document from stdin via `json.load(sys.stdin)` `[contract.py:main]`
- Reads `sys.argv[1:]` when `argv` is `None` `[contract.py:main]`
- No filesystem writes, no subprocess execution, no clock or randomness reads, and no environment-variable reads observed in source.

## Verification

- Run: `uv run --project research pytest -q`

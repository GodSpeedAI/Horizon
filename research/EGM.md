# research

## Overview

Horizon's developmental research subsystem, shipped at T04 as a typed process
contract only. The Python package lives under `src/horizon_research`, the test
suite under `tests`, and packaging is declared by `pyproject.toml` with pytest
configured for `testpaths = ["tests"]` and `pythonpath = ["src"]`
`[pyproject.toml:tool.pytest.ini_options]`.

No datasets, models, calibration or experiment execution are implemented in this
directory; the package reports `ml: False` in its health payload
`[src/horizon_research/contract.py:health]`.

## Subdirectories & Boundaries

- src: [./src/EGM.md](./src/EGM.md) — source root for the `horizon_research` package `[pyproject.toml:tool.hatch.build.targets.wheel]`
- tests — pytest suite for the contract module (`test_contract.py`); no EGM contract is maintained for this directory. Collected through `[pyproject.toml:tool.pytest.ini_options]`.
- `pyproject.toml` — package manifest, console script `horizon-research` and pytest configuration `[pyproject.toml:project.scripts]`.
- `uv.lock` — lockfile; not a contract file.

## Verification

- Run: `uv run --project research pytest -q`

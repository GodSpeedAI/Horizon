# src

## Overview

Source root of the `horizon-research` package. It contains no direct source files;
the package itself is the `horizon_research/` child. The package is installed from
this directory via the hatchling wheel target `packages = ["src/horizon_research"]`
`[../pyproject.toml:tool.hatch.build.targets.wheel]`.

## Subdirectories & Boundaries

- horizon_research: [./horizon_research/EGM.md](./horizon_research/EGM.md) — typed process contract between Cognate and the Python research subsystem; health probe and ping exchange `[horizon_research/contract.py:main]`

## Verification

- Run: `uv run --project research pytest -q`

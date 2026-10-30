# Horizon Evidence Root

## Overview

The evidence partition of the agent workbench. Its only subdirectory is
`horizon/`, which carries the per-task settlement evidence for the Horizon plan.
This directory holds no files of its own.

## Subdirectories & Boundaries

- `horizon`: [Contract](./horizon/EGM.md) - Per-task settlement evidence `T00`–`T10`: summaries, gate and teeth logs, frozen artifact hashes, and (in `T04`) the executable gate recorder plus its review rounds.

## Verification

- Run: `just verify`

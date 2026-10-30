# behavioral

## Overview

Interaction-proof layer for Horizon. This directory holds the journey fixtures,
interaction catalog and projection-pressure notes that describe one-decision-at-a-time
behavior, plus the executable fixture-backed proof engine that evaluates those
journeys. It contains no direct source files; the executable proof lives in `proof/`.

Journey fixtures `J01`–`J06` in `journeys/` are the inputs consumed by the proof
engine: `run.py` loads them from `behavioral/journeys/<journey_id>.yaml`, and the
teeth scripts pin `J01.yaml` and `J02.yaml` directly `[proof/run.py:JOURNEYS]`
`[proof/teeth_authority.py:JOURNEY]`.

## Subdirectories & Boundaries

- proof: [./proof/EGM.md](./proof/EGM.md) — fixture-backed sequential behavioral proof engine over IS1–IS8, scenario matrix runner and two teeth scripts `[proof/engine.py:run_scenario]`
- journeys — six journey fixture documents (`J01.yaml` … `J06.yaml`); no EGM contract is maintained for this directory. Loaded by `[proof/run.py:main]` and `[proof/teeth_authority.py:main]`.
- `catalog.yaml` — interaction catalog artifact; no EGM contract file is present for it.
- `contract.yaml` — behavioral contract artifact; no EGM contract file is present for it.
- `projection-pressure.yaml` — projection-pressure artifact; no EGM contract file is present for it.
- `PROOF-REPORT.md` — prose proof report; not a contract file.

## Verification

- Run: `just gate-t02`

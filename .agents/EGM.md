# .agents Agent Workbench

## Overview

Durable operational memory for coding agents working in Horizon: normative
specifications, the execution plan, prospective preregistrations, retained
settlement evidence, read-only reports, bundled skills, and the append-only
status ledger. The directory holds no source code and executes nothing itself;
its authority is documentary. Governance for the tree is stated in `AGENTS.md`
and the durable handoff state is `CURRENT_STATUS.jsonl` plus its human mirror
`CURRENT_STATUS.md` [AGENTS.md:Handoff Contract].

## Subdirectories & Boundaries

- `evidence`: [Contract](./evidence/EGM.md) - Retained per-task settlement evidence; `evidence/horizon/` holds `T00`–`T10` gate logs, teeth logs, frozen hashes, and the `T04` gate recorder.
- `skills`: [Contract](./skills/EGM.md) - Six bundled agent skills (topology formation, interaction-domain, behavioral-proof, atomic-UI, DomainForge, neatcode) with their reference material and deterministic validators.
- `specs`: Unlinked normative contracts directory (no contract file): contains `horizon.agent.spec.yaml`.
- `plans`: Unlinked execution-aid directory (no contract file): contains `horizon.plan.yaml`; explicitly non-normative.
- `prereg`: Unlinked preregistration directory (no contract file): contains a `horizon/` subdirectory of pre-recorded expectations.
- `reports`: Unlinked read-only directory (no contract file): audits, investigations, decision and integration registers, and analysis summaries.
- `candidates`: Unlinked change-candidate directory (no contract file): `candidates/horizon/{SPEC-CR-001,SPEC-CR-002,T04-CR-001}`, each pairing `CANDIDATE.yaml` with `DELTA.md` and, for `SPEC-CR-002`, retained codex review rounds.
- `prompts`: Unlinked directory (no contract file): agent prompt documents.
- Root records: [AGENTS.md](./AGENTS.md) (workbench maintenance rules), [CURRENT_STATUS.md](./CURRENT_STATUS.md) (current snapshot mirror), `CURRENT_STATUS.jsonl` (append-only history), `DEBT.md` (observed debt), `OPEN_QUESTIONS.md` (open questions).

## Boundaries

- Normative meaning lives in `specs/`; `plans/`, `reports/`, `prereg/`, and this contract file are execution aids and cannot override a frozen specification [AGENTS.md:Directory Roles & Authority].
- `CURRENT_STATUS.jsonl` is append-only and history entries are never edited; only `CURRENT_STATUS.md` is updated in place [AGENTS.md:Handoff Contract].
- Evidence recorded here must correspond to commands actually executed; a claim without an observed result is not evidence [AGENTS.md:Invariants].

## Verification

- Run: `just verify`

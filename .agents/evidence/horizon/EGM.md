# Horizon Task Evidence

## Overview

Retained settlement evidence for the Horizon plan's tasks, one directory per
task (`T00`–`T10`). Each task directory holds its own summary, gate logs, teeth
(negative/falsifier) logs, and frozen hashes; task `T04` additionally carries an
EGM contract because it also ships an executable gate recorder. Apart from that
recorder, nothing here is executable and no directory holds application code —
these are records of what was actually run and observed, kept so a later reader
can re-read the result instead of trusting a claim.

## Subdirectories & Boundaries

- `T04`: [Contract](./T04/EGM.md) - T04 settlement bundle: `run-gates.sh` recorder plus frozen records, per-target gate logs, teeth logs, review requests, and criticism rounds.
- `T00`: Unlinked task records (no contract file): `SUMMARY.md`, `artifact-hashes.log`, and readiness/spec-hash/diff/register gate logs.
- `T01`: Unlinked task records (no contract file): `SUMMARY.md` and validate/diff/contract/coverage gate logs.
- `T02`: Unlinked task records (no contract file): `SUMMARY.md`, behavioral-IR validation and scenario-matrix logs, and teeth logs.
- `T03`: Unlinked task records (no contract file): `SUMMARY.md`, atomic-UI validation, traceability, and teeth-UI-traceability logs.
- `T05`: Unlinked task records (no contract file): `SHA256SUMS`, `SUMMARY.md`, `gate-t05.log`, `just-verify.log`, donor-inventory, rerun, and teeth/finding logs.
- `T06`: Unlinked task records (no contract file): `SUMMARY.md`, `gate-t06.log`, `just-verify.log`, pinned-API-inspection, T05-regression, and teeth logs.
- `T07`: Unlinked task records (no contract file): `SUMMARY.md`, `gate-t07.log`, `just-verify.log`, and navigation test logs.
- `T08`: Unlinked task records (no contract file): `SUMMARY.md`, `check-t08.log`, `gate-t08.log`, `just-verify.log`, and teeth logs.
- `T09`: Unlinked task records (no contract file): `SUMMARY.md`, `check-t09.log`, `gate-t09.log`, `just-verify.log`, and teeth logs.
- `T10`: Unlinked task records (no contract file): `SUMMARY.md`, `check-t10.log`, `check-t10-prereg.log`, `gate-t10.log`, `typecheck.log`, `just-verify.log`, and teeth logs.

## Boundaries

- Records are evidence, not configuration: no application or gate script reads
  files in this tree. The only references from outside are prose comments that
  cite the criticism and verdict records by path
  [scripts/ledger-policy.candidate.yaml:9], and only `T04/run-gates.sh` writes
  files when executed by hand [T04/run-gates.sh:16].
- The task-level verdict of record is not inferred from a `SUMMARY.md`; it is
  whatever the corresponding `just gate-tNN` recipe reports, as recorded in each
  task's `gate-tNN.log` [T04/gates.txt:reproduce].

## Verification

- Run: `just verify`

# Behavioral IR Validation Script

## Overview

A single-file validator for Behavioral IR journey documents. It parses a YAML
journey contract, enforces the required journey identity fields, requires all
eight `IS1`–`IS8` phases to be present and non-empty, restricts `proof_mode` to
the three declared modes, and rejects interaction kinds that name
renderer-specific widgets instead of semantic vocabulary. It is invoked by the
skill's workflow step as `python scripts/validate_behavioral_ir.py <journey.yaml>...`
and writes nothing beyond stdout/stderr.

## Interface

- `validate_behavioral_ir.py <journey.yaml>...`: validates each file, prints `ok  <file>` or `FAIL <file>` followed by one indented finding per error, and exits 1 if any file failed [validate_behavioral_ir.py:check]
- `check(path)` returns a list of error strings; an unparseable file yields a single `cannot parse: <error>` entry rather than raising [validate_behavioral_ir.py:check]
- `PHASES` fixed to `IS1`–`IS8` and `MODES` fixed to `{IR_ONLY, PROTOTYPE, PROVE}` [validate_behavioral_ir.py:PHASES]
- `WIDGET` renderer-specific word pattern (`button|dialog|modal|prompt|select|textbox|component`) applied to each `interaction_kinds` entry [validate_behavioral_ir.py:WIDGET]

## Invariants

- `journey.id`, `journey.title`, `journey.semantic_source`, and `journey.semantic_authority` must each be present and truthy [validate_behavioral_ir.py:check]
- `proof_mode` must be one of `IR_ONLY`, `PROTOTYPE`, or `PROVE` [validate_behavioral_ir.py:check]
- Every phase `IS1`–`IS8` must be keyed in `phases`; a missing phase is an error whose message requires explicit marking rather than omission [validate_behavioral_ir.py:check]
- A present but falsy phase value is an error, so a phase cannot be satisfied by an empty body [validate_behavioral_ir.py:check]
- Any `interaction_kinds` entry matching the widget pattern is rejected as renderer-specific [validate_behavioral_ir.py:check]
- The process exits 1 when at least one file produced errors and 0 otherwise; invoking with no arguments exits with the usage string [validate_behavioral_ir.py:main]

## Side Effects

- Reads each argument path with `open(path)` and `yaml.safe_load`; the file handle is not explicitly closed by the script [validate_behavioral_ir.py:check]
- Writes validation lines to stdout and the usage/exit message via `sys.exit` to stderr [validate_behavioral_ir.py:main]
- No files, directories, network connections, subprocesses, clock reads, or random values are produced.

## Verification

- Run: `just verify`

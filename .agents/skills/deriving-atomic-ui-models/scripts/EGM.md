# Atomic UI IR Validation Script

## Overview

A single-file validator for Atomic UI view documents. It parses a YAML view
contract and enforces traceability to the upstream Behavioral IR, membership of
every element primitive in a fixed semantic primitive set, declared-region
membership, the extra obligations attached to `action` primitives, and the
absence of framework-specific component names anywhere in the document. It is
invoked as `python scripts/validate_atomic_ui_ir.py <view.yaml>...` and writes
nothing beyond stdout/stderr.

## Interface

- `validate_atomic_ui_ir.py <view.yaml>...`: validates each file, prints `ok  <file>` or `FAIL <file>` plus one indented finding per error, and exits 1 if any file failed [validate_atomic_ui_ir.py:check]
- `check(path)` returns a list of error strings; an unparseable file yields a single `cannot parse: <error>` entry [validate_atomic_ui_ir.py:check]
- `PRIMITIVES`: the closed set `identity, label, value, status, metric, message, evidence_item, artifact_reference, action, choice, input, collection, tree, table, graph, timeline, progress, navigation, notification, inspector, comparison, command, workspace, viewport` [validate_atomic_ui_ir.py:PRIMITIVES]
- `FRAMEWORK`: case-insensitive pattern `(React|OpenTUI|Radix|Tauri|Tailwind|Material|Swift|Compose)` [validate_atomic_ui_ir.py:FRAMEWORK]
- `walk(node)`: yields every key/value pair in a nested document, recursing through dicts and lists [validate_atomic_ui_ir.py:walk]

## Invariants

- `view.id` and `view.purpose` are both required [validate_atomic_ui_ir.py:check]
- `sources.journey` and `sources.behavioral_phases` are both required, so a view cannot be validated without an upstream Behavioral IR trace [validate_atomic_ui_ir.py:check]
- Every entry in `sources.behavioral_phases` must fully match `IS[1-8]` [validate_atomic_ui_ir.py:check]
- Every element `primitive` must be a member of `PRIMITIVES`; an unknown primitive is an error naming the element id [validate_atomic_ui_ir.py:check]
- An element that names a `region` must reference an id declared in `regions` [validate_atomic_ui_ir.py:check]
- An `action` element must carry `semantic_action`, a `consequence`, and `availability.source == "behavioral_ir"`, so affordance availability cannot originate in the UI model [validate_atomic_ui_ir.py:check]
- Any key named `component`, or any `primitive` value matching `FRAMEWORK`, is rejected as framework-specific [validate_atomic_ui_ir.py:check]
- The process exits 1 when at least one file produced errors and 0 otherwise; no arguments exits with the usage string [validate_atomic_ui_ir.py:main]

## Side Effects

- Reads each argument path with `open(path)` and `yaml.safe_load`; the handle is not explicitly closed [validate_atomic_ui_ir.py:check]
- Writes validation lines to stdout and the usage/exit message via `sys.exit` [validate_atomic_ui_ir.py:main]
- No files, directories, network connections, subprocesses, clock reads, or random values are produced.

## Verification

- Run: `just verify`

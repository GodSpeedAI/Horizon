# Deterministic Validation Scripts

## Overview

Six standalone Python 3 CLI scripts that make a Project Topology Architect
substrate mechanically checkable: content hashing for frozen artifacts, portable
SXR (RealityTrace) binary resolution, generated-substrate structural checks,
requirement-ledger validation, Wayfinder freeze validation, and plugin-layout
validation. Each script is invoked directly from the operating surface (for
example `justfile` recipes `ledger` and `wayfinder`, which call
`validate-requirement-ledger.py` and `validate-wayfinder.py`); none is imported as
a library by the repository's own TypeScript or Python code.

## Interface

- `freeze-hash.py <file...>`: prints `sha256:<hex>  <path>` once per input file; `--check <digest> <file>` verifies a single file against a digest [freeze-hash.py:main]
- `freeze-hash.py:digest_of`: streams the file in 65536-byte chunks into `hashlib.sha256` and prefixes the result with `sha256:` [freeze-hash.py:digest_of]
- `sxr-resolve.py --report`: prints a JSON resolution report (`resolved`, `executable`, `source`) to stdout, exit 0 when resolved and 2 when not [sxr-resolve.py:report]
- `sxr-resolve.py <args...>`: resolves the `sxr` executable then runs it via `subprocess.run`, passing through its exit code [sxr-resolve.py:main]
- `sxr-resolve.py:resolve`: resolution order `$SXR_BIN` → `.config/sxr-resolve.json` (searched from cwd upward) → `sxr` on `PATH` [sxr-resolve.py:resolve]
- `scaffold-check.py <project-root>`: validates root `AGENTS.md` routing, the `.agents/` workbench, justfile recipes, structured machine config, the verification surface, and hardcoded machine paths [scaffold-check.py:main]
- `validate-requirement-ledger.py <ledger.yaml> [--project-root <dir>] [--require-freeze]`: validates ledger identity, ids, required fields, surface disjointness, dependency/acceptance cross-references, and source digests [validate-requirement-ledger.py:main]
- `validate-wayfinder.py <project-root> [--ledger <path>]`: validates the `.wayfinder/answer-key.md` freeze header and artifact hashes, and cross-references ledger requirement ids when `--ledger` is given [validate-wayfinder.py:main]
- `validate-plugin.py <plugin-root> [--fixture-root <dir>]`: validates `.claude-plugin/plugin.json`, `skills/` layout and frontmatter, skill naming, SKILL.md relative links, stale activation names, and machine-path leakage [validate-plugin.py:main]

## Invariants

- `--check` requires exactly one path and a digest matching `sha256:[0-9a-f]{64}`; both violations exit 2, and a digest mismatch exits 1 [freeze-hash.py:main]
- SXR resolution fails closed: a candidate is accepted only when `os.path.isfile` and `os.access(..., os.X_OK)` both hold, and an unresolved executable produces a diagnostic plus exit 2 [sxr-resolve.py:resolve]
- `scaffold-check.py` fails when root `AGENTS.md` exceeds `LEANNESS_BUDGET` (220 lines) or does not mention `CURRENT_STATUS` and `just` [scaffold-check.py:LEANNESS_BUDGET]
- `scaffold-check.py` requires non-empty `CURRENT_STATUS.jsonl`, a `revision` and `summary` on every line, and strictly increasing integer revisions [scaffold-check.py:main]
- `scaffold-check.py` fails when the `justfile` exposes none of `test`/`check`/`verify` [scaffold-check.py:main]
- `validate-wayfinder.py` rejects a missing `freeze_id`, a `freeze_id` of exactly `candidate`, a missing `frozen_at`, and any hash entry that is not `sha256:` plus 64 hex characters [validate-wayfinder.py:main]
- `validate-wayfinder.py` rejects each hash entry whose artifact is missing under the project root or whose content digest differs, and reports both ledger ids missing from the Wayfinder and Wayfinder ids absent from the ledger [validate-wayfinder.py:main]
- `validate-requirement-ledger.py` requires `ledger_version == 1`, a non-empty `project` and `freeze_hash`, and unique requirement and acceptance ids [validate-requirement-ledger.py:main]
- `validate-requirement-ledger.py` requires `critic_predicate` in `{source-fidelity, semantic-fidelity, contradiction, evasion, verification-quality}` and `status` in `{candidate, frozen, settled}` [validate-requirement-ledger.py:CRITIC_PREDICATES]
- `validate-requirement-ledger.py` rejects overlapping `mutable_surfaces` and `frozen_surfaces`, and requires a real (non-`candidate`) `freeze_hash` for `frozen` or `settled` entries [validate-requirement-ledger.py:main]
- `validate-requirement-ledger.py` fails when a source file is missing or its sha256 does not match the recorded digest, and `--require-freeze` rejects `freeze_hash == "candidate"` [validate-requirement-ledger.py:main]
- `validate-plugin.py` requires exactly one primary skill named `project-topology-architect` across `skills/` and rejects duplicate skill names [validate-plugin.py:main]
- `validate-plugin.py` resolves every relative `.md`/`.py` link in a SKILL.md body and errors when the target does not exist [validate-plugin.py:main]
- `validate-plugin.py` errors on `icm-architect` activation names and on `/home/...`, `/mnt/c/...`, `/Users/...`, `/home/sprime01`, and `projects/sxr` references in active plugin files [validate-plugin.py:main]
- All six scripts exit non-zero on validation failure (`1` for validation errors, `2` for usage/resolution failures) so a calling recipe cannot read a defect as success [validate-requirement-ledger.py:main]

## Side Effects

- File reads only: `open(path, "rb")` chunked hashing in `freeze-hash.py` and `validate-wayfinder.py` and `validate-requirement-ledger.py`; no files are created, modified, or deleted by any script [freeze-hash.py:digest_of]
- Environment reads: `SXR_BIN` via `os.environ.get` and `PATH` via `shutil.which` [sxr-resolve.py:resolve]
- Subprocess execution: `subprocess.run([entry["executable"], *sys.argv[1:]], check=False)` runs the resolved `sxr` binary and returns its exit code [sxr-resolve.py:main]
- Filesystem traversal: `os.walk` over `.agents` and `justfile` (portable-path scan in `scaffold-check.py`) and over `.claude-plugin` and `skills` (`validate-plugin.py`) [scaffold-check.py:_check_paths]
- Stdout/stderr writes only: the `err` and `warn` helpers write `ERROR:`/`WARN:` lines to stderr [validate-plugin.py:err]
- No network access, no clock or randomness reads, and no persisted state.

## Verification

- Run: `just verify`

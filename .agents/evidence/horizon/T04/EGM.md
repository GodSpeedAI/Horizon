# T04 Settlement Evidence Package

## Overview

The retained evidence bundle for task T04: one gate recorder plus the frozen
records, logs, reviews, and criticism rounds that substantiate the settled
result. The recorder is the only executable artifact here; everything else is a
retained record. Its purpose is reproducible settlement — `gates.txt` states the
reproduction command as `bash .agents/evidence/horizon/T04/run-gates.sh` from the
repo root and records the observed exit code of every target
[gates.txt:Reproduce from the repo root]. Superseded rounds are preserved rather
than deleted, and the file names mark which records are historical.

## Interface

- `run-gates.sh`: runs the T04 gate suite from the repository root and writes one `just-<target>.log` beside the script per target [run-gates.sh:16]
- `run-gates.sh:required`: the required target list `check boundaries idm-integrity acceptance-claims witness-claims contract-modals test ledger wayfinder teeth verify gate-t04` [run-gates.sh:12]
- `run-gates.sh:expected_red`: the expected-red target list, empty as recorded [run-gates.sh:13]
- `run-gates.sh:rc`: the aggregate verdict printed as `recorder exit=$rc` and returned as the process exit code [run-gates.sh:26]
- `here`/`root`: the script resolves its own directory with `cd "$(dirname "$0")" && pwd` and the repository root as `$here/../../../..` [run-gates.sh:9]
- `gates.txt`: the recorded exit codes, toolchain note (Bun 1.4.0, DomainForge 0.21.1, `DOMAINFORGE_BIN`, uv-managed research project), and the frozen pins for `requirements/ledger.yaml`, `.wayfinder/answer-key.md`, `scripts/ledger-policy.yaml`, and `T04.prereg.yaml` [gates.txt:Frozen pins after the re-freeze]
- `REVIEW_REQUEST.md` and `REVIEW-REQUEST-INDEX.md`: the review request of record and its index; `REVIEW-attempt1.superseded.md`, `REVIEW_REQUEST.r2.superseded.md`, and `REMEDIATION.review-request.superseded.md` are retained superseded rounds [REVIEW-REQUEST-INDEX.md:There is exactly **one** current review request]
- Retained gate logs: `just-check.log`, `just-boundaries.log`, `just-idm-integrity.log`, `just-acceptance-claims.log`, `just-witness-claims.log`, `just-contract-modals.log`, `just-test.log`, `just-ledger.log`, `just-wayfinder.log`, `just-teeth.log`, `just-verify.log`, `just-gate-t04.log`, plus the historical `just-acceptance-claims-frozen.log` and `just-contract-modals-frozen.log` [gates.txt]
- Negative-path records: `teeth.log` (aggregate output of `bun run scripts/teeth.ts`, one blocked attack per line with its exit code), plus `teeth-freeze.log`, `teeth-false-world.log`, `teeth-duplicate-sea.log`, `teeth-in-memory-runtime.log`, `teeth-missing-cognate.log`, and `teeth-product-model.log` [teeth.log:bun run scripts/teeth.ts]
- Narrative records: `SUMMARY.md`, `criticism-round1.md`, `REMEDIATION.md`, `REMEDIATION.review-request.md`, `remediation-gates.md`, `ne-rerun-7b4d110.md`

## Invariants

- `set -u` is the only shell strictness flag set; there is no `-e`, so a failing target cannot abort the loop and every target is always attempted [run-gates.sh:8]
- The loop is `for t in $required $expected_red`, so a target in neither list is never run [run-gates.sh:15]
- A required target must exit 0; a non-zero status sets `rc=1` [run-gates.sh:22]
- An expected-red target must exit non-zero; an unexpected exit 0 sets `rc=1` and prints `UNEXPECTED (expected red)`, because "a diagnostic that cannot fail proves nothing" [run-gates.sh:20]
- Each target's combined stdout and stderr is redirected to `$here/just-$t.log`, so a target cannot pollute the recorder's own output [run-gates.sh:16]
- The recorder exits 0 only when every target behaves as declared; the previous recorder's exit 1 by design was corrected under verdict r2 answer 1 [run-gates.sh:6]
- `cd "$root" || exit 1` means an unresolvable repository root aborts before any target runs [run-gates.sh:11]

## Side Effects

- Filesystem writes: one `just-<target>.log` file per target, always in the script's own directory via the `here` variable, never in the repository root [run-gates.sh:16]
- Subprocess calls: one `just "$t"` invocation per target, resolved from `PATH` [run-gates.sh:16]
- Directory resolution reads cwd and the script path (`dirname "$0"`, `pwd`, `cd`) [run-gates.sh:9]
- Stdout writes: one `"$t exit=$status"` line per target plus the final `recorder exit=$rc` line [run-gates.sh:23]
- No network access, no clock or randomness reads, no environment variable reads, and no state beyond the log files it overwrites.

## Verification

- Run: `just verify`

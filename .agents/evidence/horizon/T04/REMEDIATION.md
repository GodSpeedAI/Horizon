# T04 remediation — finding → change → proof

Source: `.agents/evidence/horizon/T04/verdicts/codex-root-20261019-7b4d110.md` (reviewed commit
`7b4d110`). The verdict is treated as evidence to investigate, not as a specification. Every
reproduction below was re-run against the working tree at `a3cf648` before any change.

This file is the builder's record. It is **not** independent confirmation, and it does not
settle T04.

## Reproductions before any change (working tree at `a3cf648`)

| Attack | Command | Observed |
|---|---|---|
| Reviewer's memory-only fake (plain-text `FAKE:` store, Maps for runs/rows, events discarded) | `bun test --preload /tmp/t04-repro/fake-runtime.ts test/app.test.ts` | **exit 0**, `1 pass`, `19 expect() calls`; the store file began `FAKE` |
| In-memory storage ignored by the E2E | `HORIZON_STORE=:memory: bun test test/app.test.ts` | **exit 0** (the test supplied its own `storePath`) |
| In-memory storage at real startup | `HORIZON_STORE=:memory: bun run src/main.ts` | exit 1, `RUNTIME: local_operator forbids an in-memory runtime` |
| Missing Cognate dependency metadata | `just boundaries` (manifest copy) / E2E | boundaries exit 1; E2E exit 0 |
| Erased prohibitions | ledger lines 4824/4999/5029/5069 | `Observed ...: be misrepresented ...`, `... be treated as ...`, `... be required to adopt ...`, `... reorder owner-pinned surfaces ...` |
| Research required for startup | `research_command = ["/usr/bin/false"]`, `bun run src/main.ts` | exit 1 before runtime/HTTP existed |

## Findings and dispositions

Status legend: **fixed** (mutable code/test), **candidate** (frozen artifact: prepared, not
applied), **open** (not resolved here).

| Finding | Verdict class | Disposition | Proof |
|---|---|---|---|
| F1 fake runtime and non-database file accepted | confirmed S2 | fixed: E2E now writes→closes→reopens→reads through SQLite, asserts durable event/projection observations, and a registered attack installs a memory-only fake and requires the E2E to fail | `test/app.test.ts`, `scripts/teeth.ts` (`fake-runtime-substitution`) |
| F2 four frozen prohibitions erased | confirmed S1 | fixed generator + candidate revision T04-CR-001 for the frozen ledger/Wayfinder | `scripts/gen-requirement-ledger.py`, `scripts/check-acceptance-claims.py`, `CANDIDATE.yaml` |
| F3 three underdetermined contracts | confirmed S2 | candidate revision T04-CR-001 (evaluation bound to witnesses) + explicit open item | `test/acceptance.test.ts`, `scripts/ledger-policy.candidate.yaml` |
| F4 `0 violations` overclaim | confirmed S2 | fixed mutable summaries + narrow integrity checks; candidate revision for the prereg `verified_by` | `scripts/check-idm-integrity.py`, `scripts/teeth-idm-integrity.py`, `composed/prereg.patch` |
| F5 in-memory config masked by E2E | confirmed S2 | fixed: configuration exercised through application construction with no store override | `test/app.test.ts` |
| F6 research failure blocks startup | confirmed S2 | fixed: research is an optional, typed degraded observation; dependent operations fail closed | `src/app.ts`, `src/adapters/research.ts`, `test/app.test.ts` |
| PE-04 no typed intent / checkpoint proof | confirmed S2 | fixed within the frozen boundary: typed intent, committed record, observation run, checkpoint provenance | `src/domain/intent.ts`, `src/capabilities/navigation-intent.ts`, `test/app.test.ts` |
| AC-CONFIG-001-01 / AC-CONFIG-003-01 green without proof | answer 2 | fixed: spoofing/audit and partial-availability tests | `test/app.test.ts` |
| `verify` omits `teeth` | answer 2 | fixed: `verify` is now T04's complete gate | `justfile` |
| PE-02 history lost; envelope | answers 1, 6, 11 | new reproducibility run captured and labelled as new; envelope limit stated | `cognate-create-repro/REPRO.md`, below |
| NE-03/04 path-scan limits | answers 7 | open: recorded, not widened here (scope) | this file |

## Envelope coverage (verdict, answer 6/11)

The Wayfinder `hashes:` block lists exactly four artifacts — `requirements/ledger.yaml`,
the spec, the plan and `scripts/ledger-policy.yaml` — and `check-ledger-freeze.sh` verifies
those four plus the ledger fragment digest and row order. It does **not** hash the canonical
`.sea` sources, `scripts/gen-requirement-ledger.py`, `scripts/gen-wayfinder.py` or the T04
preregistration.

Consequences, stated so nobody over-reads the freeze:

- The `.sea` sources are pinned separately by `world_ref` and checked by `gate-t01`
  (`domainforge validate`, `world-ref.py --expect`, `check-idm-coverage.py`,
  `check-idm-integrity.py`), so drift there is caught by a different control, not by the
  hashes block.
- The acceptance/verification generators are **not** covered by any freeze hash. A change to
  either generator can change what the projection says without breaking the freeze check.
  This remediation changes `gen-requirement-ledger.py` (polarity, provenance) and adds
  `gen-ledger-variant.py`; the regenerated candidate is therefore compared against the
  frozen ledger requirement by requirement (`REVIEW.md`), not trusted because it regenerates.
- The preregistration is deliberately outside the block: it is the prospective claim, not a
  formation artifact, and its digest is not pinned anywhere; its integrity rests on the Git
  history of the reviewed commit.
- The five requested frozen-file hashes match the reviewed commit `7b4d110` (verdict, answer
  6). Nothing here is an internally regenerated hash presented as independent proof.


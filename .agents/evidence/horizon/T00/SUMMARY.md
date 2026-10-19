# T00 evidence summary

Task: T00 "Start with Project Topology Architect: inspect, bind ruler, freeze formation
constraints". Proof level P2, confirmation `builder_with_adversarial_teeth`.
Preregistration: `.agents/prereg/horizon/T00.prereg.yaml` (authored before the work).
Global gates H-BUILD/H-TEST/H-BOUNDARY/H-VERIFY are unavailable until T04, so the explicit
T00 narrow gates were used (plan `verification.gate_binding_rule`).

## Positive expectations (all met)

| ID | Expectation | Evidence |
|---|---|---|
| PE-01 | spec sha256 == plan binding AND status frozen 1.0.0 | `gate-05-ruler-freeze.log`, `gate-07-final.log` |
| PE-02 | spec parses; 98 unique REQ ids; diagram labels recorded | `ruler-inventory.log`; formation record §Ruler pin |
| PE-03 | siblings resolved by git remote; drift recorded, no fetch | formation record §Sibling checkouts |
| PE-04 | Product Actualizer Apache-2.0 at copy revision; in decision log | `product-actualizer-license.log`; DEC-T00-02 |
| PE-05 | machine-readable requirement ledger initializes roots | `gate-06-ledger.log`; `requirements/ledger.yaml` |

## Narrow gates (exact output retained)

- `gate-01-readiness.log` — spec+plan readable — exit 0
- `gate-02-spec-sha256.log` — matches plan — exit 0
- `gate-03-diff-check.log` — `git diff --check` — exit 0
- `gate-04-register.log` — product register readable — exit 0
- `gate-05-ruler-freeze.log` / `gate-07-final.log` — `scripts/check-ruler.py` OK — exit 0
- `gate-06-ledger.log` — ledger generated (98 reqs, 98 ACs); skill validator 0 errors — exit 0
- `artifact-hashes.log` — formation artifact SHA-256 pin

## Negative teeth (behaved as preregistered)

- NE-01 (`teeth-01-missing-skill.log`): the requested skill path is readable (exit 0); a
  falsified path is not (exit 1) → formation blocks rather than substituting another skill.
- NE-02a (`teeth-02-unfrozen-ruler.log`): draft-status spec → ruler gate BLOCKED (exit 1).
- NE-02b: frozen spec with a mismatched plan hash → ruler gate BLOCKED (exit 1).

## Artifacts produced

- `.agents/prereg/horizon/T00.prereg.yaml`
- `requirements/ledger.yaml` (candidate, generated; 98 reqs → tasks; frozen at T04)
- `scripts/gen-requirement-ledger.py`, `scripts/check-ruler.py`
- `.agents/reports/horizon-topology-formation.md`, `horizon-decisions.yaml`,
  `horizon-research-migration-manifest.yaml`
- `.agents/OPEN_QUESTIONS.md` (OQ-01..OQ-05)
- updates: `.agents/reports/horizon-product-integration-register.yaml` (SEA family resolved,
  T00 confirmations/drift), `.agents/DEBT.md` (D-004 resolved; D-006..D-009)

## Remaining unknowns (do not block T00)

- OQ-01 `cognate create --source` still required at pinned 0.6.1.
- OQ-03 domainforge PATH CLI 0.19.0 < required 0.21.1.
- OQ-04 `sxr` CLI absent from PATH.
- OQ-02 adapter ownership (Horizon capabilities per DEC-T00-04; upstream may still take it).
- Semantic (`.sea`) bindings in the ledger are provisional placeholders until T01.

## Confirmation

Builder demonstration with adversarial teeth complete, retained and independently
re-checkable via the logged commands. No spec defect found; no `CandidateRevision`. The
frozen spec was not modified (verified by hash). T00 does not require a P3 independent
verifier; a clean-checkout replay of the logged commands reproduces every result.

# Subsystem: Python research subsystem

A typed process contract — deliberately *not* an ML system yet.

## Purpose

Reserve the integration seam for Horizon's future developmental research capabilities
(rule learning, calibration, promotion analysis — inherited conceptually from the
`godspeed_agent` predecessor) without letting unproven ML code become a boot dependency or
a silent failure source.

## Responsibilities

- Expose a typed JSON contract `horizon.research/1` with two verbs:
  - `--health` → `{"contract", "status", "capabilities", "ml: false"}`
  - `--ping` → validate `{"kind": "ping", "echo": "<non-empty>"}` → `pong`
  (`research/src/horizon_research/contract.py`).
- Accept invocation via the configured command
  (`research_command = ["uv", "run", "--project", "research", "python", "-m",
  "horizon_research.contract"]`).
- Fail with contract errors (`ContractError`) for wrong shapes; CLI returns exit 1 with a
  JSON error document.

## Non-responsibilities

- No datasets, models, calibration, or experiment execution (`ml` is `false` and asserted
  by tests).
- Nothing about the developmental feedback loop yet — that is a later settlement task.

## Position in the system

- Started by `src/adapters/research.ts` at boot with a timeout; the result is a typed
  `ResearchHealth` or a typed degraded observation `research_unavailable`
  (`ResearchUnavailableError`).
- The degraded state never blocks startup; research-dependent operations fail closed
  (`requireResearch`).
- Independently testable: `research/tests/test_contract.py` (pytest), run by
  `just test` / `bun run test` alongside the bun suite.

## Core abstractions

| Symbol | Location | Role |
| --- | --- | --- |
| `health()` / `ping()` | `research/src/horizon_research/contract.py` | contract verbs |
| `observeResearch` | `src/adapters/research.ts:81` | subprocess probe + health envelope validation |
| `ResearchUnavailableError` | `src/adapters/research.ts:34` | typed degradation |
| `requireResearch` | `src/adapters/research.ts:129` | fail-closed guard for research-dependent ops |

## Failure modes

| Failure | Symptom |
| --- | --- |
| uv/Python missing | `research_unavailable` (degraded, non-fatal) |
| Health envelope wrong shape | typed `ResearchAdapterError` in the observation |
| Subprocess exceeds timeout | `unavailable` with elapsed evidence |
| Research-dependent operation attempted while degraded | typed refusal (fail closed) |

## Extension points

Add capabilities by extending the health envelope and the contract module — but any real
ML behavior is a governed settlement task, not a patch. The envelope validation in
`src/adapters/research.ts` is the compatibility boundary both sides must honor.

## Source trail

- `research/src/horizon_research/contract.py` — the contract (73 lines, zero runtime deps)
- `research/pyproject.toml` — uv project, Python ≥ 3.12, pytest dev group
- `src/adapters/research.ts` — probe, envelope validation, degradation
- `test/app.test.ts` — research-degraded path asserted at the application level

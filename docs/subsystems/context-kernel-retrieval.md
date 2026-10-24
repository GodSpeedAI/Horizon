# Subsystem: Context Kernel retrieval

Cited reference material beside the answer — never authority, never action.

## Purpose

Give the observer optional background references for the thing being inspected, while
guaranteeing that nothing retrieved can authorize, execute, or even influence a gate
verdict.

## Responsibilities

- Spawn and supervise the Context Kernel transport: a subprocess speaking newline-delimited
  JSON (`spawnTransport`, `src/adapters/context-kernel.ts`), with timeouts
  (`DEFAULT_TIMEOUT_MS`), top-k clamping (`DEFAULT_TOP_K`, `MAX_TOP_K`), and a strict wire
  schema (`CitationV1`, `ReferenceResultV1`).
- Expose exactly one capability: `horizon.context.query_reference`
  (`src/capabilities/context.ts`), boot-registered in the runtime's read-only policy.
- Classify every returned citation as `untrusted_reference` **in Horizon, from Horizon's
  own policy** — never by copying a trust statement from the server.
- Preserve three distinct failure observations: `denied`, `unavailable`, `no_match`
  (`CONTEXT_OUTCOMES`), plus refused-shape requests.

## Non-responsibilities

- No gate inputs. A citation never participates in affordance assessment.
- No indexing or corpus management (the kernel owns its corpus; Horizon only names it via
  the `[context_kernel]` config: command, corpus).
- No rendering trust: citations render as clearly-marked reference material in the
  workspace.

## Position in the system

- Called by: `src/app.ts` `inspectFocus` (retrieval beside debugger answers), capability
  consumers.
- Decoupled by design: `src/ui` must not import this adapter (the general boundary rule
  forbids adapter imports from `src/ui`, and the T10 mutation teeth specifically catch a
  direct Context Kernel import in surface code); the UI defines a local structural
  contract
  (`src/ui/workspace/inspect.ts` `RetrievalAnswer`).

## Core abstractions

| Symbol | Location | Role |
| --- | --- | --- |
| `createContextKernelAdapter` | `src/adapters/context-kernel.ts:267` | transport factory |
| `ContextReferenceAnswer` | `src/adapters/context-kernel.ts:83` | typed answer with citations + outcomes |
| `contextReferenceComponent` | `src/capabilities/context.ts:65` | capability wrapper with request validation |
| `REFUSED` / `NOT_OBSERVED` / `ABSENT` | `src/capabilities/context.ts` | typed absence outcomes |
| `ContextKernelConfig` | `src/config/types.ts:21` | command + corpus config |

## Internal operation

1. Capability receives a validated request (corpus, query, optional top_k, scope ref).
2. Adapter writes one JSON request line to the subprocess, reads lines until the matching
   response or timeout, parses under the strict schema, and normalizes citations.
3. Horizon assigns `untrusted_reference` to each citation itself and wraps outcomes
   (`denied` / `unavailable` / `no_match`) as first-class observations.
4. Callers may *display* the answer; they cannot feed it to gates, and the audit trail
   records retrieval as what it is — a reference read.

## State

None persistent; the subprocess lifetime is per-request (spawn → request → finish). The
kernel's own corpus state is external.

## Lifecycle / current limits

The capability, policy, registration, and scope refusals are production code, but tests
script the wire — no live CK process is spawned yet, so `integration_level` stays
`fixture` (`.agents/CURRENT_STATUS.md` limits). A live CK integration is a later
settlement task.

## Failure modes

| Failure | Observation |
| --- | --- |
| Kernel denies scope | `denied` |
| Process missing/times out | `unavailable` |
| Query matches nothing | `no_match` (distinct from empty success) |
| Malformed wire | parse failure surfaces as typed error, never as citations |

## Source trail

- `src/adapters/context-kernel.ts` — transport, schema, outcomes
- `src/capabilities/context.ts` — capability + request validation
- `src/config/types.ts` — `[context_kernel]` configuration
- `test/retrieval-debugger-teeth.test.ts` — untrusted-citation teeth (retrieval grants
  nothing; retrieved instructions do not become actions)
- `.agents/CURRENT_STATUS.md` — T10 record, scripted-wire limit

# Horizon Current Status

**Revision:** 22 · **Recorded:** 2026-10-20T23:59:30Z · **Stage:** T08 settled (P1); next ready task **T09**

**Spec:** HORIZON-001 v1.0.1, frozen; SHA-256 `14a42936fe3a17c3726ee57fbc9278fd6f6e92276f67519fd9bf0f605f3324a4`.

## T08 — Clack-style sequential renderer from the shared frame

The terminal half of the behavioral contract now consumes the T07 navigation frame. A pure
`horizon.sequential/1` controller turns one validated frame into **one** question and one answer
into one `horizon.sequential-intent/1` typed intent. The real OpenTUI renderer uses a registry copy
of `GodSpeedAI/Terminal-UI` (`Select`, `Confirm`, prompt shell; MIT) and only maps controller state
to controls.

- **One decision at a time.** Primary, optional-only, blocked and no-move frames each produce a
  single prompt. Context carried by the frame is displayed, never asked for again; only an unknown
  checkpoint becomes a question.
- **Blocked is visible, not offered.** Blocked, unknown and conflicted moves remain in the list,
  disabled, with a plain-language reason and the single next prerequisite. Submitting one is
  refused with `unavailable_choice`.
- **Review before commitment.** A consequential move must pass a review of reversibility, payment
  and provenance, expected evidence, escalation and the next prerequisite. Only then can a
  `confirm` intent exist. Confirming records intent; it neither approves nor executes.
- **Stale, historical and cancelled answers fail closed.** Stale revisions are refused with a
  refresh path. Back restores the previous frame and selection, marks it historical, and refuses
  action until resume. Cancel keeps frame, focus, history and selection and emits nothing.
- **Real source path.** `buildOperationalFrame` derives the frame from a real T06 Cognate
  projection read; `horizon frame --json|--text|--tui` exposes the same frame to scripts, agents
  and a keyboard terminal. An absent focus is a material deviation, not a fabricated repair.
- **No execution.** T08 stops at the typed intent. It does not submit, call SEA-Forge or claim an
  effect; simulation is explicit in the intent and review.

**Verified:**

| Command | Result |
| --- | --- |
| `just check-t08` | exit 0 — 19 pass / 0 fail (4 files, 188 expects) |
| `just teeth-t08` | exit 0 — 4 pass / 0 fail (20 expects) |
| `just gate-t08` | exit 0 |
| `just verify` | exit 0 |
| `bun test` | 93 pass / 0 fail (15 files, 820 expects) |
| `bun x tsc --noEmit` | exit 0 |
| Spec hash | unchanged |

**Limits:**

- GUI equivalence is not proven. T08 proves the Clack half of REQ-UI-004/REQ-GOAL-003; T09 must
  consume the same frame and emit the same typed intents.
- T08 creates intents only; governed execution and settlement remain T10/T11.
- The real Cognate read path uses fixture-produced T06 rows; `integration_level` stays `fixture`.
- Terminal accessibility is keyboard-first only; screen-reader announcement and WCAG 2.2 AA are
  T09 GUI obligations.
- The vendored terminal themes are clack, ascii and high-contrast; no light theme.
- The `createCliRenderer` mount is a thin wrapper not covered by an automated pty test; the
  component is driven through OpenTUI's real test renderer.
- Default focus is the first projected object by ref, or a synthetic absent focus.

## Settled task history

- T00–T04: formation, frozen artifacts, walking skeleton, surface grammar/projection.
- T05: `horizon.surface/2` + `horizon.gui-view/1` across GUI/CLI/MCP.
- T06: operational object layer on Cognate's public Projection API.
- T07: `horizon.navigation/2` deterministic navigation controller (P2, 12 reqs).
- T08: sequential Clack renderer over the shared frame (P1, 5 reqs).

## Open items carried

- **D-002:** upstream Cognate query gaps (no predicate query, traversal or version-aware query).
  Reported upstream; not worked around locally.
- **D-023:** latent SQLite opening-burst contention window; `busy_timeout` is supplied upstream.
- **D-024/D-025/D-030:** MCP tool-name folding, duplicated role vocabulary, and module-state
  findings in the T05 boundary check.
- **D-027:** agent attribution cap is unit-proven only; the J02 end-to-end case is not planned.
- **D-028/D-029:** a green gate can describe a tree behind `origin/main` because no gate fetches.
- Earlier: `REQ-RES-001` lexical baseline; Clack and the WebMCP browser transport remain declared
  but not bound.

**Next:** T09 — Atomic GUI projection in Cognate React (depends on T07 + T03, both settled).
Preregistration is required before implementation. T10 also becomes ready (T06 + T07).

**Evidence:** [T08 summary](evidence/horizon/T08/SUMMARY.md), [check-t08](evidence/horizon/T08/check-t08.log),
[teeth-t08](evidence/horizon/T08/teeth-t08.log), [gate-t08](evidence/horizon/T08/gate-t08.log),
[verify](evidence/horizon/T08/just-verify.log), [bun test](evidence/horizon/T08/bun-test.log),
[decisions](reports/horizon-decisions.yaml), [third-party notices](../THIRD_PARTY_NOTICES.md),
[spec](specs/horizon.agent.spec.yaml), [plan](plans/horizon.plan.yaml),
[ledger](../requirements/ledger.yaml), [wayfinder](../.wayfinder/answer-key.md), [debt](DEBT.md).

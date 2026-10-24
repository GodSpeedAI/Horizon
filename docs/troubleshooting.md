# Troubleshooting

Symptom → cause → evidence → recovery. Failure *design* (why Horizon refuses the way it
does) is in [explanation](explanation.md); the full error taxonomy is in the
[reference](reference.md).

---

## Boot failures

**Symptom: startup throws about world identity (`SemanticAdapterError`).**
The compiled `.sea` world's `semantic_closure_hash` does not match the pinned `world_ref`
in `config/horizon.toml`.
Check: `python3 scripts/world-ref.py .sea/interaction/interaction-model.sea` and compare
with the config value. Recover: restore the pinned `.sea` from git, or (governed path)
re-pin after a legitimate spec/plan revision. Never silence the assertion.

**Symptom: `just check-toolchain` fails.**
`DOMAINFORGE_BIN` missing or not exactly 0.21.1. Recover: point `DOMAINFORGE_BIN` at the
pinned binary (default `../domainforge/target/release/domainforge`).

**Symptom: `ConfigError` at boot.**
A config field failed strict validation — wrong profile, non-loopback bind, out-of-range
port, unknown key. Check the offending key against the
[configuration reference](reference.md#configuration).

**Symptom: banner says research degraded / `research_unavailable`.**
Expected typed degradation when `uv`/Python is missing or the probe times out. The app
runs; research-dependent operations refuse. Recover: `just setup` (installs the research
environment), check `research_command` in config.

**Symptom: `RuntimeBoundaryError` at boot.**
The configured `runtime_store` path violates the store boundary assertion. Keep the store
inside the configured location (default `.cognate/app.sqlite`).

---

## Frames and intents

**Symptom: `horizon act` exits 1 with a refusal.**
Read the outcome JSON: stale/unknown `frame_id`, operation not offered on the bound
surface, role not authorized, or consequential operation without authority (fail-closed
today). Every refusal also produced an audit attempt event — check the store's
`INTENT_ATTEMPT_STREAM`. Recover: re-issue a frame (`horizon frame`) and use its frame id.

**Symptom: sequential session says the frame is stale / newer exists.**
Another decision changed the situation; the controller refuses acting on the stale frame
(`isStale`) and offers refresh. Confirm, then continue on the fresh frame.

**Symptom: a consequential operation is never offered.**
Affordance gates: check the frame's gate verdicts (`available`/`blocked`/`unknown` with
reasons). Without live authority binding (T11+), consequential operations fail closed by
design.

---

## Surfaces and rendering

**Symptom: `horizon surface` prints issues JSON and exits 1.**
The composed surface failed grammar validation. `src/main.ts` treats this as failure, not
a degraded page — by design. Fix the composing agent/system output against
`horizon.surface/2` (`bun run src/main.ts schema` prints the published schema).

**Symptom: markup appears escaped in output (e.g. `<script>` shows literally).**
Working as intended: display text is grammar-checked and HTML rendering escapes. Attacks
of this shape are asserted in `test/surface-negative.test.ts`.

**Symptom: source binding shows `refused`/`blocked`.**
File-backed sources must resolve (realpath) under allowed roots and stay under the byte
cap. Move the source or adjust allowed roots in the binder configuration.

---

## Debugger and retrieval

**Symptom: debugger refuses with "missing bounds".**
Bounds are required, never defaulted. Supply explicit `maxDepth`/`maxObjects` (impact) or
selection arguments (replay).

**Symptom: "undeclared relation" refusal.**
The relation type is not declared in the semantic world. Declare it in `.sea` (governed
change) or query a declared relation.

**Symptom: retrieval returns `denied` / `unavailable` / `no_match`.**
Three distinct observations: scope denial, kernel unreachable/timeout, or genuinely no
matches. Note citations are always `untrusted_reference` — that is correct behavior, not
a defect.

**Symptom: `diff`/`timeline` mention a checkpoint I didn't expect.**
Cross-checkpoint reads name the checkpoint actually read in `scope.comparison`. The
frame's own `checkpoint_ref` is never rewritten; verify which checkpoint you asked about.

---

## Tests and gates

**Symptom: `check-tNN-prereg-coverage` fails.**
A preregistered expectation is not named by any test naming its anchors. Add/strengthen
the test or (governed) revise the preregistration.

**Symptom: `teeth-tNN-mutation` fails.**
A tooth no longer detects its broken property — your change removed the protected
behavior or the tooth's coupling. Fix the behavior; do not weaken the tooth.

**Symptom: `contract-modals` fails on a new finding.**
A contract dropped a requirement's modal (MUST/SHOULD). Only REQ-RES-001 is baselined;
restore the modal or record a governed baseline change.

**Symptom: `ledger`/`wayfinder` verification fails.**
Freeze drift between spec, ledger, and wayfinder. Regenerate via the generation scripts
and re-freeze; never hand-edit frozen artifacts (see
[how-to](how-to.md#verify-the-frozen-governance-artifacts)).

**Symptom: boundary check fails after adding an import.**
Dependency-direction rules: `src/domain` must import nothing from adapters/runtime/
capabilities, `src/ui` must not import adapters or runtime (the T10 tooth additionally
guards direct Context Kernel imports in surface code). Restructure per
[architecture §3](architecture.md#3-dependency-architecture).

---

## Data

**Symptom: projection rows look stale or missing.**
Reads are checkpoint-scoped; confirm you are reading at the current checkpoint. If the
projection is wrong but events are right, rebuild from events (the rebuild path is
exercised by tests). Known current limit: checkpoint-restore filtering is exact only
while the projection stays additive (recorded in `.agents/CURRENT_STATUS.md` and
`DEBT.md`).

**Symptom: store seems corrupted / app won't open the store.**
The SQLite file is the durable asset (it *is* the event log). Restore from backup; only
recreate from scratch if you accept losing recorded history.

---

## Where to look first (diagnostic ladder)

1. `just status` — current handoff snapshot (what was last settled and how).
2. `just check && just boundaries` — structural sanity.
3. `bun test` — behavioral contracts with precise failure output.
4. `.agents/DEBT.md` — known defects and gaps (e.g. relation declarations for bounded
   `impact`).
5. The relevant `test/*.test.ts` for the subsystem — tests double as executable
   specification.

# How-to guides

Goal-oriented procedures. Conceptual background lives in
[architecture](architecture.md) and [explanation](explanation.md); exact flags and keys in
the [reference](reference.md).

---

## Run the application

**Goal.** Boot Horizon and see the server, frames, surfaces, and MCP tools.

**Prerequisites.** Bun installed; dependencies installed (`just setup` runs
`bun install` + `uv sync --project research --all-groups`).

**Procedure.**

```sh
just setup            # once
bun run dev           # = bun run src/main.ts, no subcommand → HTTP server
# → horizon: local_operator listening on http://127.0.0.1:4319
# → horizon: world world:horizon@sha256:6c18d6a6…
```

Then explore:

```sh
bun run src/main.ts frame --json        # horizon.frame/1 document (no TTY needed)
bun run src/main.ts frame               # TTY → sequential Clack renderer
bun run src/main.ts frame --text        # plain-text prompt rendering
bun run src/main.ts surface             # closed-surface text rendering
bun run src/main.ts schema              # published surface schema JSON
bun run src/main.ts act --operation horizon.health   # commit an intent via CLI
bun run src/main.ts mcp                 # MCP tool manifest (derived from the grammar)
```

**Validation.** The server banner prints the pinned world ref and object/relation counts;
`curl http://127.0.0.1:4319/` (health/workspace routes) responds.

**Failure symptoms.** World-mismatch throw at boot → the pinned `.sea` changed or
`DOMAINFORGE_BIN` is wrong; see [troubleshooting](troubleshooting.md).

---

## Run the tests and the gates

**Goal.** Verify your change at the right scope.

**Procedure.**

```sh
just check          # type/config/structural integrity (fast)
just boundaries     # dependency-direction rules
just test           # bun test + research pytest
just verify         # full global gate (what T04 froze as "the whole gate")
just gate-t07       # example: the navigation-controller settlement gate
```

Narrow gates follow the pattern `gate-tNN` = narrow check + teeth + the global set.
For T05–T10 the narrow part is `check-tNN` (preregistration shape → coverage) and
`teeth-tNN` (adversarial + mutation). Coverage proves linkage; mutation proves strength.

**Validation.** Exit 0. `just status` shows the current handoff snapshot.

**Common failure symptoms.** A failing `check-tNN-prereg-coverage` means a registered
expectation has no test naming its anchors; a failing `teeth-tNN-mutation` means a tooth
no longer bites (you changed the property it guards — update the property or the tooth).

---

## Verify the frozen governance artifacts

**Goal.** Confirm the spec/plan/ledger/wayfinder quartet is intact.

**Procedure.**

```sh
python3 scripts/check-ruler.py                       # spec/plan integrity
bash scripts/check-ledger-freeze.sh                  # ledger ↔ wayfinder freeze agreement
python3 .agents/skills/project-topology-architect/scripts/validate-requirement-ledger.py \
  requirements/ledger.yaml --require-freeze
python3 .agents/skills/project-topology-architect/scripts/validate-wayfinder.py . \
  --ledger requirements/ledger.yaml
```

**Rule.** Never hand-edit the ledger, wayfinder, preregistrations, or the frozen `.sea`.
They are regenerated (`just ledger`, `just wayfinder`, generation scripts) under a
recorded freeze. If the *spec* must change, that is an explicit revision-and-refreeze
event (see `AGENTS.md` §1), not a file edit.

---

## Extend the system

### Add a block type to the surface grammar

1. Edit `src/ui/surface2/grammar.ts`: extend `BLOCK_TYPES` and the block's schema
   (respect `MAX_BLOCKS`/`MAX_ROWS`/… limits and provenance requirements).
2. Update `publishSurfaceSchema` output and the reducer/render paths if the block needs
   attribution or escaping behavior.
3. Add coverage in `test/surface-negative.test.ts` (invalid compositions must be refused
   with named issues) and a tooth in the surface teeth that attacks the new block's
   guarantees.
4. Run `just gate-t05` (grammar) and `just gate-t09` (GUI projection).

### Add an operation to the surface grammar

1. Extend `HORIZON_OPERATIONS` and `CONSEQUENTIAL_OPERATIONS` in
   `src/ui/surface2/grammar.ts`. MCP tools derive automatically (`main.ts` `mcp` verb,
   `mcpTools`) — never hand-list tools.
2. Provide domain semantics: candidate derivation in `src/adapters/navigation.ts` and
   gate assessment in `src/domain/navigation.ts`.
3. Add cross-transport equivalence coverage (`teeth-t05-equivalence` pattern) so the new
   operation means the same thing in GUI, CLI, and MCP.
4. Add preregistration entries if this settles a requirement (see the plan's prereg
   discipline).

### Add a capability

1. Implement the component in `src/capabilities/` following
   `navigation-intent.ts`/`context.ts` (validate requests, typed outcomes, append audit).
2. Register it in `src/runtime/create.ts` policy (`READ_ONLY_CAPABILITIES` or allowed
   actions — mutation-capable actions must be explicit).
3. Assert the boundary rules still hold: `just boundaries`.

### Add a projection

1. Domain schema in `src/domain/operational.ts` (or a sibling), handler in
   `src/projections/` following `operational-objects.ts`: tenant-prefixed keys, payload
   validation, checkpoint advance.
2. Adapter read API in `src/adapters/` with checkpointed, same-world-asserted reads.
3. Tests: happy + rebuild-from-events + negative (wrong world, stale checkpoint, denied
   scope).

### Add a debugger operation

1. Extend `DEBUGGER_OPERATIONS` + implement the pure function in
   `src/domain/debugger.ts`; add it to `debuggerCatalogue`.
2. Decide its bounds policy explicitly (bounds required — no defaults).
3. Wire `argumentsFor` in `src/ui/workspace/inspect.ts` (pass caller arguments through).
4. Add a tooth asserting the typed refusal *and* that navigation still answers; extend
   `scripts/teeth-t10-mutation.ts`.

---

## Regenerate derived artifacts

**Goal.** Refresh the requirement ledger or wayfinder after a legitimate governance
change.

**Procedure.** Follow the generation scripts' documented flow:
`scripts/gen-requirement-ledger.py` (reads spec + plan + semantic sources under
`scripts/ledger-policy.yaml`), then `scripts/gen-wayfinder.py`, then re-freeze per
`scripts/freeze-formation.sh` conventions and record the new hashes. Never regenerate
without the corresponding spec/plan revision recorded in `.agents/`.

---

## Work on the Python research contract

1. Edit `research/src/horizon_research/contract.py`; keep `ml: false` unless a settlement
   task changes that.
2. Run `just test` (includes `uv run --project research pytest -q`).
3. Update the health envelope in `src/adapters/research.ts` if capabilities change — both
   sides must honor the same contract `horizon.research/1`.

---

## Rollback notes

- Working tree damage in `src/`, `test/`, `docs/`, `config/`: ordinary git checkout.
- Corrupted local store: delete `.cognate/app.sqlite` and re-boot; projections rebuild
  from events only if the event log survived — the store *is* the event log, so treat it
  as the durable asset.
- Never "fix" a failing freeze check by editing the frozen artifact; regenerate or revert
  code instead.

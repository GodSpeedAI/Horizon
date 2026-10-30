# Horizon Settlement Gates, Teeth and Formation Generators

## Overview

`scripts/` holds Horizon's executable evidence machinery: 40 direct source files
(Bun/TypeScript checkers, Python validators and generators, Bash freeze and
re-capture drivers) plus their data inputs. Nothing here is application runtime
code. Each entry point reads frozen formation artifacts — `.agents/specs/horizon.agent.spec.yaml`,
`.agents/plans/horizon.plan.yaml`, `.agents/prereg/horizon/*.prereg.yaml`,
`requirements/ledger.yaml`, `.wayfinder/answer-key.md`, `.sea/interaction/*.sea`,
`ui-model/`, `behavioral/journeys/` — and either (a) asserts a structural claim and
exits non-zero on violation, (b) generates a derived artifact deterministically, or
(c) attacks a checker to prove the checker can fail ("teeth").

Two properties recur in the source and matter when changing anything here:

* Checkers are fail-closed. A tool that cannot reach its authority (missing
  DomainForge binary, unparseable prereg, missing prerequisite) stops with a
  non-zero exit rather than passing.
* Teeth never modify the working tree. They copy the repository or plant a
  throwaway tree (`mktemp -d`, `fs.mkdtempSync`) and assert both that the untouched
  control passes and that the deliberately broken copy fails *by assertion*, not by
  compile error or crash.

Several checkers print their own limits in the summary line ("linkage only",
"not a claim that every arbitrary violation would be detected"). Those statements
are part of the contract: a green run is P2 evidence for the specific mutations
below, never a general conformance claim.

## Interface

### Project-level checks

- `check.ts` — whole-project type/config gate. Spawns
  `<cwd>/node_modules/.bin/tsc --noEmit` (exits 1 if TypeScript is not installed),
  then parses `config/horizon.toml` with `configFromDocument` and requires
  `deployment_profile === "local_operator"` and `bind_host` in `{127.0.0.1, ::1}`.
  `[check.ts:run]` `[check.ts:configFromDocument]`
- `check-boundaries.ts` — argv `--root <dir>` (default `cwd`) and `--package <package.json>`
  (default `<root>/package.json`). Runs six rules and exits 1 listing every
  `STRUCTURAL:`/`BOUNDARY:` failure: required Cognate dependencies from
  `REQUIRED_COGNATE`, competing model/authority stores
  (`product-model`, `product_model`, `actualize-product-model`, `product-actualizer`,
  `cockpit/server/`), duplicate `.sea` authority outside the import closure of
  `.sea/interaction/interaction-model.sea`, `domain/` as a symlink to
  `.sea/interaction`, forbidden references in `src/`+`test/`, and layer direction for
  `src/domain`, `src/ui`, `src/config`. `[check-boundaries.ts:requireCognatePackages]`
  `[check-boundaries.ts:canonicalClosure]` `[check-boundaries.ts:requireCanonicalDomainLink]`
  `[check-boundaries.ts:enforceDirection]`
- `check-ruler.py` — flags `--spec` (default `.agents/specs/horizon.agent.spec.yaml`)
  and `--plan` (default `.agents/plans/horizon.plan.yaml`). Fails (exit 1) unless
  `metadata.status == "frozen"`, the spec's SHA-256 equals
  `plan.source.spec.sha256`, and the plan's `spec_id`/`spec_version` match the spec
  metadata. `[check-ruler.py:main]` `[check-ruler.py:sha256_of]`

### Runtime probes and operator entry points

- `probe-runtime.ts` — `--store <dsn>`, default `:memory:`; loads config and calls
  `assertStoreBoundary(loaded.config, store)`, printing
  `runtime-probe: accepted <store>` only when the store is admissible.
  `[probe-runtime.ts:assertStoreBoundary]`
- `probe-world.ts` — `--world-ref <ref>`, default the all-zero
  `world:horizon@sha256:000…0`; calls `loadWorld(pinned)` and prints
  `world-probe: accepted <worldRef>`. `[probe-world.ts:loadWorld]`
- `build-verifier.ts` — `--out <path>` (default `.horizon/verifiers/horizon-verify-intent`);
  creates the parent directory, runs `bun build --compile src/verifiers/intent-recorded.ts`
  (propagating its exit code) and prints `{"artifact":"verifier","path":…,"sha256":…}`.
  `[build-verifier.ts:Bun.spawnSync]` `[build-verifier.ts:createHash]`
- `rollback-guard.ts` — positional store path; exit `0` when the store holds no
  `contract_version 2` state, `2` when it does (printing `verdict.reasons`), `1` on
  usage/read error. Uses `openSqliteStore` and `rollbackVerdict`.
  `[rollback-guard.ts:rollbackVerdict]` `[rollback-guard.ts:openSqliteStore]`
- `ignite.ts` — operator launcher. Flags `--cell DIR`, `--approve-commits`,
  `--remote [PUBLIC_URL]`, `--remote-port N`, `--help`; env `SEA_FORGE_SERVER_BIN`,
  `REALITYTRACE_BIN`, `XDG_DATA_HOME`, `XDG_RUNTIME_DIR`, `HORIZON_CONFIG`. Fails with
  a `fix:` line when the platform is not Linux, no POSIX uid exists, either binary is
  missing, or `node_modules` is absent; then writes the cell (`worlds/`, `policy.yaml`,
  `server.yaml`, `sea-forge.sock`, `sea-forge.log`), spawns `sea-forge-server`, waits up
  to 30 s for the socket, and spawns `bun run src/main.ts` with
  `HORIZON_STORE`, `HORIZON_SECRET_FILE`, `COGNATE_GOVERNANCE=sea-forge`,
  `COGNATE_SEA_FORGE_SOCKET`, `COGNATE_WORLD_REF`, `COGNATE_SEA_FORGE_OPERATOR`,
  `COGNATE_REALITYTRACE_*`. `[ignite.ts:fail]` `[ignite.ts:cell]`
  `[ignite.ts:spawn]`

### T04 attack teeth (stack and boundary)

- `teeth.ts` — attacks with a control baseline each; exit 1 on any leak, printing
  `teeth: all attacks blocked` on success. Cases: `missing-cognate-dependency`,
  `in-memory-runtime` (via `probe-runtime.ts --store :memory:`),
  `competing-product-model`, `duplicate-semantic-authority`,
  `duplicate-canonical-subtree` (a copy inside `.sea/alternative/`), `false-world-ref`,
  `fake-runtime-substitution` (installs `scripts/t04-attacks/fake-runtime` as
  `node_modules/@godspeedai/cognate-runtime-bun` in an isolated tree and requires
  `test/app.test.ts` to fail), and `missing-cognate-dependency-e2e`. It deletes
  `HORIZON_STORE`, `HORIZON_CONFIG` and `HORIZON_SECRET_FILE` from the child
  environment. `[teeth.ts:check]` `[teeth.ts:checkControl]` `[teeth.ts:isolatedTree]`
  `[teeth.ts:fake-runtime-substitution]`

### T05 teeth (surface boundary, token equivalence, prereg linkage)

- `check-t05-boundaries.ts` — exported `checkT05Boundaries(root)` returning
  `{ok, failures, inspected}`; CLI entry when run as main. Single UI authority
  `src/ui/surface2`; the one permitted seam `src/ui/surface.ts`. Rejects a second
  schema literal (`horizon.surface/2`), a listed block vocabulary, a block-kind
  record/alias, a second source-expression regex, direct binder/reducer imports by
  routes, renderers outside the authority, Cognate/Bun/renderer imports and markup or
  dynamic-code sinks inside it, and competing authority stores. Also pairs
  `docs/donors.md` with root `NOTICE` and checks `NOTICE` against the `package.json`
  `license` plus a root `LICENSE`. `[check-t05-boundaries.ts:checkT05Boundaries]`
  `[check-t05-boundaries.ts:scan]` `[check-t05-boundaries.ts:checkAttributionAgreement]`
  `[check-t05-boundaries.ts:BLOCK_TYPE_NAMES]`
- `teeth-t05-boundaries.ts` — NE-B0 (real tree passes and ≥5 authority files were
  inspected), NE-B1…NE-B8 (planted violations, each matched by its expected message),
  NE-B2b/NE-B2d (acceptance teeth), NE-B9/NE-B9b (prose is not flagged, a real sink
  beside it still is), NE-B10…NE-B16 (NOTICE/donors/license drift). Exits 1 on any
  failure. `[teeth-t05-boundaries.ts:TEETH]` `[teeth-t05-boundaries.ts:ATTR_TEETH]`
- `check-t05-prereg-coverage.ts` — exported `parsePrereg(source)` and
  `checkPreregCoverage(root)`; reads `.agents/prereg/horizon/T05.prereg.yaml`, the
  tests in `test/surface-negative.test.ts` and `scripts/teeth-t05-equivalence.ts`,
  and `justfile`. Requires each parsed `PE-`/`NE-` member to be named by a test title
  that also covers the prereg's backticked anchors (with an explicit
  `TITLE_SYNONYMS` mapping), reports ids that appear only as scalar text, and verifies
  `GATE_PROVEN` bindings (`PE-07` → `gate-t05`,`verify`; `PE-08` → `check-t05`
  invoking `check-t05-boundaries.ts`). Unregistered ids can only be recovered through
  the interpretation sidecar, and only when its `of_sha256` equals the current frozen
  file hash. `[check-t05-prereg-coverage.ts:parsePrereg]`
  `[check-t05-prereg-coverage.ts:GATE_PROVEN]`
  `[check-t05-prereg-coverage.ts:recoverFromInterpretation]`
- `teeth-t05-prereg-coverage.ts` — NE-C1…NE-C8 plus acceptance NE-C0; plants the
  tree with the real prereg, interpretation sidecar and `justfile`, then edits only the
  test map or the sidecar. Includes a stale-tooth guard when a mutation changes
  nothing. `[teeth-t05-prereg-coverage.ts:plant]` `[teeth-t05-prereg-coverage.ts:TEETH]`
- `teeth-t05-mutation.ts` — three mutants of `src/ui/surface2/grammar.ts` (M1 widens
  `BLOCK_TYPES`, M2 blanks rejection messages, M3 drops `.strict()`), each run against
  `test/surface-negative.test.ts` filtered by expectation id. Root override
  `T05_MUTATION_ROOT`; `--verbose` prints failure reasons and rejects compile
  crashes. `[teeth-t05-mutation.ts:MUTANTS]` `[teeth-t05-mutation.ts:applyMutant]`
- `teeth-t05-equivalence.ts` — live cross-transport comparison: starts
  `bun run src/main.ts` per isolated store (`HORIZON_STORE` set, `HORIZON_CONFIG` and
  `HORIZON_SECRET_FILE` unset), compares GUI `text/plain` against CLI `surface`, checks
  the `horizon.surface/2` / `horizon.gui-view/1` JSON schemas and role handling, derives
  MCP tool names from `HORIZON_OPERATIONS`, and asserts refusal parity (409/409/non-zero)
  plus absence of executable markup. Six comparisons; non-zero exit on divergence.
  `[teeth-t05-equivalence.ts:startServer]` `[teeth-t05-equivalence.ts:isolatedEnv]`

### T06 teeth (prereg shape and operational-object linkage)

- `check-prereg-shape.ts` — exported `checkPreregShape(file, root, {quiet})` and
  `idsInsideScalars(source)`; CLI `bun run scripts/check-prereg-shape.ts <prereg.yaml>`
  (exit 2 without an argument). Requires a root `preregistration` mapping, rejects
  unknown top-level keys (`ROOT_KEYS`), an empty `falsifier`, non-sequence or
  swallowed sections, duplicate or malformed `PE-NN`/`NE-NN` ids, ids present only as
  text, and any `- id:` line inside a block scalar. `[check-prereg-shape.ts:ROOT_KEYS]`
  `[check-prereg-shape.ts:idsInsideScalars]` `[check-prereg-shape.ts:checkPreregShape]`
- `check-t06-prereg-coverage.ts` — exported `registeredExpectations(source)` and
  `checkPreregCoverage(root)`; reads `.agents/prereg/horizon/T06.prereg.yaml`,
  `test/operational-objects*.test.ts` and `scripts/teeth-t06-mutation.ts`. Shape runs
  first; then each id must be named by a test plus its anchors, using `TITLE_SYNONYMS`
  and an empty `GATE_PROVEN` table. Prints "linkage only" and points at the mutation
  teeth for strength. `[check-t06-prereg-coverage.ts:GATE_PROVEN]`
  `[check-t06-prereg-coverage.ts:gateProof]`
- `teeth-t06-shape.ts` — NE-S1…NE-S5 against `checkPreregShape` (folded-scalar
  absorption, string section, typo'd key, duplicate id, referenced-but-unregistered
  id) plus acceptance NE-S0; fails if a mutation changes nothing.
  `[teeth-t06-shape.ts:TEETH]`
- `teeth-t06-mutation.ts` — eight mutants of `src/adapters/operational-objects.ts`
  (denied→empty, unavailable→empty, unbounded traversal, dangling link, checkpoint
  mismatch, import edge as link, foreign world, unsorted results) against the named
  negative tests; requires a failed assertion, not a crash; `--verbose` prints
  expected/received lines. `[teeth-t06-mutation.ts:MUTANTS]`
  `[teeth-t06-mutation.ts:isAssertionFailure]`

### T07 and T10 teeth

- `check-t07-prereg-coverage.ts` — exported `checkPreregCoverage(root)`; reads
  `.agents/prereg/horizon/T07.prereg.yaml` and `test/navigation-controller.test.ts` +
  `test/navigation-negative.test.ts`. Each registered id must be named by exactly one
  test title and every id a title mentions must be registered; shape failure aborts
  first. `[check-t07-prereg-coverage.ts:checkPreregCoverage]`
- `teeth-t07-mutation.ts` — eleven mutants of `src/domain/navigation.ts` (M1…M11:
  conflict collapse, forced primary, unknown authority, missing reason, approval as
  pass, non-canonical gate keys, missing world anchor, unauthorized settlement,
  selectable blocked choice, unfrozen frame, stale revision). `[teeth-t07-mutation.ts:MUTANTS]`
- `teeth-t10-mutation.ts` — eleven mutants across `src/ui/workspace/inspect.ts`,
  `src/domain/debugger.ts` and `src/app.ts`, each run against
  `test/retrieval-debugger-teeth.test.ts -t <NE-id>`; copies `src`, `test`,
  `package.json`, `tsconfig.json`, `node_modules`, the resolved `domain` world and
  `config`. A caught mutant must fail with `error: expect(`, not a syntax or module
  error. `[teeth-t10-mutation.ts:MUTANTS]` `[teeth-t10-mutation.ts:copyTree]`
  `[teeth-t10-mutation.ts:isAssertionFailure]`

### Ledger, Wayfinder and freeze

- `gen-requirement-ledger.py` — reads the frozen spec, the plan and
  `scripts/ledger-policy.yaml`; writes `requirements/ledger.yaml` with
  `freeze_hash: candidate`. Restates each requirement into an acceptance contract
  through `restate`/`_restate_clause` (prohibitions become "never observed to",
  `MAY`/`SHOULD` keep their modal) guarded by `self_test()`, binds each requirement to a
  canonical `.sea` entity (`ENTITY_BY_PREFIX`, `INVARIANT_BY_PREFIX`,
  `sea_invariant_by_requirement`) and refuses an entity the model does not declare
  (`check_entity`). Raises `SystemExit` on duplicate ids with differing text, unknown
  policy overrides, or a missing prefix policy. `[gen-requirement-ledger.py:restate]`
  `[gen-requirement-ledger.py:self_test]` `[gen-requirement-ledger.py:check_entity]`
  `[gen-requirement-ledger.py:SEA_FILES]`
- `gen-ledger-variant.py` — flags `--policy`, `--out`, `--require-witnesses`. Loads
  `gen-requirement-ledger.py` through `importlib`, overrides its `POLICY`/`OUT`, and
  runs it, so a candidate policy never touches the frozen pins. With
  `--require-witnesses`, every override must have an `evaluated_by` entry whose file
  exists and whose test name appears in it. `[gen-ledger-variant.py:load_generator]`
  `[gen-ledger-variant.py:main]`
- `gen-wayfinder.py` — flags `--root`, `--ledger`, `--freeze-id`, `--frozen-at`,
  `--out`. Emits frontmatter (`FRONTMATTER_ORDER`) plus a requirement table whose
  obligation is the ledger statement and whose observable is the acceptance contract;
  refuses a requirement without acceptance or a contract without an observable. The
  `hashes:` block is left empty here and filled by the freeze step; `world_ref` is read
  from `config/horizon.toml`. `[gen-wayfinder.py:world_ref_from_config]`
  `[gen-wayfinder.py:main]`
- `freeze-formation.sh` — optional argument is the freeze id (default
  `frozen@<UTC date>`). Normalises the ledger's `freeze_hash` line to `candidate`,
  computes the fragment digest with
  `.agents/skills/project-topology-architect/scripts/freeze-hash.py`, writes the marker,
  regenerates the Wayfinder, fills its `hashes:` block with whole-file sha256 values for
  the ledger, spec, plan and policy, then runs `check-ledger-freeze.sh --verbose` and
  both skill validators. `[freeze-formation.sh:FH]` `[freeze-formation.sh:hashes]`
  `[freeze-formation.sh:check-ledger-freeze.sh]`
- `check-ledger-freeze.sh` — any first argument (e.g. `--verbose`) enables the success
  line. Checks: `freeze_hash` is `sha256:*` and equals the fragment digest; the ledger
  passes `validate-requirement-ledger.py --require-freeze`; the Wayfinder passes
  `validate-wayfinder.py`; the `hashes:` block covers ledger, spec, plan and policy with
  current values; the ledger's `population` text records both conventions; Wayfinder
  rows equal the ledger ids in order; and the committed Wayfinder body is byte-identical
  to a fresh `gen-wayfinder.py --out` projection. Every failure exits 1 through `fail`.
  `[check-ledger-freeze.sh:fail]` `[check-ledger-freeze.sh:body]`
- `teeth-ledger-freeze.sh` — copies the repo to `mktemp -d` (excluding `.git`,
  `node_modules`, `.tmp`) and requires a clean baseline before six corruptions:
  ledger edited after freeze, ledger reverted to `candidate`, Wayfinder body edited,
  Wayfinder unfrozen, hashed input drifted, and a ledger row removed with the freeze
  refreshed. Each case needs a non-zero exit *and* its specific message; it prints
  `BLOCKED`/`MISSED` counts and exits non-zero if any case was missed.
  `[teeth-ledger-freeze.sh:case_run]`
- `apply-candidate-revision.py` — flag `--candidate` (default
  `.agents/candidates/horizon/T04-CR-001`). Composes
  `scripts/ledger-policy.yaml` with `scripts/ledger-policy.candidate.yaml` into
  `composed/ledger-policy.yaml`, regenerates the candidate ledger via
  `gen-ledger-variant.py`, and writes `composed/prereg.patch` for
  `pin_revision.verified_by`. Refuses an override for a requirement absent from the
  frozen spec, an overlay entry whose keys differ from
  `{rule, witness_supplies, introduced}`, any non-empty `introduced`, and a frozen
  policy that already carries `evaluated_by`. `[apply-candidate-revision.py:walk]`
  `[apply-candidate-revision.py:composed_path]`

### DomainForge and IDM probes

- `world-ref.py` — env `DOMAINFORGE_BIN` (else `which domainforge`). Forms
  `<entry.sea>` or `--expect <world_ref> <entry.sea>`; runs
  `domainforge envelope <entry> --emit representation` and prints
  `world:horizon@<semantic_closure_hash>`. Exit `2` when the binary is unavailable, `1`
  on parse error or identity mismatch. `[world-ref.py:domainforge_bin]`
  `[world-ref.py:semantic_closure_hash]`
- `check-idm-coverage.py` — optional positional entry (default
  `.sea/interaction/interaction-model.sea`), env `DOMAINFORGE_BIN`. Runs
  `domainforge parse <entry> --format json` and `domainforge contract <entry>`, then
  requires journeys `J01`–`J06` with non-empty
  `JOURNEY_FIELDS`, exactly `GATE_KEYS` on `AffordanceGate`, all `CORE_ENTITIES`,
  all `REQUIRED_OPERATIONS`, exact `EXPECTED_ENUM_MEMBERS`, and at least one
  `OpenSemanticQuestion`. Exit `2` when DomainForge is unavailable, `1` on any missing
  distinction. `[check-idm-coverage.py:EXPECTED_ENUM_MEMBERS]`
  `[check-idm-coverage.py:domainforge_bin]`
- `check-idm-integrity.py` — flags `--entry`, `--root` (default `.sea/interaction`).
  Walks `.sea` sources (skipping `validation` and `__pycache__`), and for every
  `InteractionInvariant` instance requires each `requirement_ref` to exist in the
  frozen spec (unless recorded in `scripts/idm-integrity-debt.yaml`) and each
  `invariant_id` to be unique. Refuses to pass when the spec yields no requirement ids.
  `[check-idm-integrity.py:instances]` `[check-idm-integrity.py:known_debt]`
- `recapture-domainforge-output.sh` — env `DOMAINFORGE_BIN` (default
  `../domainforge/target/release/domainforge`); optional output path (default
  `.sea/interaction/validation/domainforge-output.txt`). Records `--version`,
  `validate .sea/interaction/interaction-model.sea --application --format human` and
  `contract …` verbatim, then greps `semantic_closure_hash`. `[recapture-domainforge-output.sh:DF]`
- `teeth-domainforge-gate.py` — env `BRANCH` (`null|dangling|duplicate|control`),
  `DOMAINFORGE_BIN`, `TREE`. With no `BRANCH` it re-invokes itself for all four and
  requires exit codes `{null:0, dangling:0, duplicate:0, control:1}`, proving the gate
  compiles but does not catch the two Horizon-owned defects. Each branch mutates a
  temporary copy of the whole `.sea/interaction` module.
  `[teeth-domainforge-gate.py:mutate]` `[teeth-domainforge-gate.py:main]`
- `teeth-idm-integrity.py` — env `BRANCH` (`null|dangling|duplicate`). With no branch it
  requires exits `{null:0, dangling:1, duplicate:1}`; each branch edits a temporary copy
  of the module and runs `check-idm-integrity.py --root <copy>`.
  `[teeth-idm-integrity.py:mutate]` `[teeth-idm-integrity.py:main]`

### Atomic UI traceability

- `check-ui-traceability.py` — optional positional view paths (default
  `ui-model/views/*.yaml`). Loads `ui-model/atomic-ui-contract.yaml` and requires at
  least two `renderer_mappings`; builds a phase/action index from
  `behavioral/journeys/*.yaml`; then per view requires `sources.journey` to be a known
  journey, a non-empty `accessibility.focus_order` whose targets are declared elements,
  `accessibility.non_color_status: true`, `traces_to` resolving to a journey/phase/ref,
  a declared `region`, no `FORBIDDEN_DEFAULT` local-policy key, and for `action`
  primitives a behavioral `semantic_action` plus commitment/authority/evidence/recovery
  declarations when `consequence: consequential`. `[check-ui-traceability.py:FORBIDDEN_DEFAULT]`
  `[check-ui-traceability.py:behavioral_index]` `[check-ui-traceability.py:check]`
- `teeth-ui-traceability.py` — four planted defects (untraceable metric, unknown
  approval, divergent availability, missing accessibility) written to a temp directory,
  each required to exit 1 with its message, then the real views must exit 0.
  `[teeth-ui-traceability.py:main]`

### Acceptance and witness claim checks

- `check-acceptance-claims.py` — flags `--ledger` (default `requirements/ledger.yaml`),
  `--require-candidate`, `--allow-generic`. Checks the four `POLARITY` prohibitions
  against the frozen spec text and the ledger contract text, and requires generic
  contracts (`Observed in the runtime's own terms:`) to keep the requirement's own
  subject. `[check-acceptance-claims.py:POLARITY]` `[check-acceptance-claims.py:spec_requirements]`
- `check-witness-claims.py` — flags `--ledger` (repeatable), `--ratified`,
  `--fail-on-ratified`, `--baseline` (default `scripts/witness-claims-baseline.txt`).
  Judges each contract against its requirement: negation of a `MAY`, dropped or
  strengthened `SHOULD`, added `BEHAVIOUR_TERMS`/`AUTHORITY_TERMS`/`QUANTIFIER_TERMS`,
  and any `potentially-ratified` marking, which is reported as HELD and never promoted.
  Findings already in the baseline are non-fatal debt; a new finding or a stale baseline
  entry exits 1. `[check-witness-claims.py:check_contract]`
  `[check-witness-claims.py:baseline_key]`
- `measure-contract-modals.py` — flags `--ledger` (repeatable; defaults to the active
  ledger and the candidate ledger where present) and `--baseline`. Counts `MODALS`
  (prohibition, permission, soft obligation, `only`, `exactly`) in the requirement and
  in the contract's `expected`, and fails on a modal the contract drops that the
  baseline does not already record. `_key` binds each baseline line to a digest of the
  contract text. `[measure-contract-modals.py:MODALS]` `[measure-contract-modals.py:_key]`

### Subdirectory contract

- `t04-attacks/` — attack fixtures used by the teeth suite; see
  [./t04-attacks/EGM.md](./t04-attacks/EGM.md).

### Data inputs (not source)

- `scripts/ledger-policy.yaml` — policy version, critic-predicate lists, `overrides`,
  read by `load_policy` in `gen-requirement-ledger.py` and hashed into the Wayfinder
  `hashes:` block. `[gen-requirement-ledger.py:load_policy]`
- `scripts/ledger-policy.candidate.yaml` — overlay read by
  `apply-candidate-revision.py`; never loaded by the production generator.
  `[apply-candidate-revision.py:overlay_path]`
- `scripts/idm-integrity-debt.yaml` — `dangling_requirement_refs` entries tolerated by
  `check-idm-integrity.py`. `[check-idm-integrity.py:known_debt]`
- `scripts/witness-claims-baseline.txt` — default `--baseline` for
  `check-witness-claims.py`. `[check-witness-claims.py:baseline]`

## Invariants

- Checkers exit `0` only on success; every failure path in the shell drivers goes
  through an explicit non-zero exit, and Python generators raise `SystemExit` instead of
  emitting a partial document. `[check-ledger-freeze.sh:fail]`
  `[gen-requirement-ledger.py:check_entity]`
- Missing authority is a hard stop, never a pass: exit `2` when DomainForge cannot be
  found, exit `1` when the spec declares no requirement ids or a required binary,
  socket or dependency directory is absent. `[world-ref.py:domainforge_bin]`
  `[check-idm-coverage.py:domainforge_bin]` `[check-idm-integrity.py:main]`
  `[ignite.ts:fail]`
- Teeth operate on copies only. The working tree is never mutated by
  `teeth-ledger-freeze.sh` (tar copy of `.` into `mktemp -d`), by any `teeth-t*.ts`
  (`fs.mkdtempSync` + `fs.cpSync`), or by `teeth-domainforge-gate.py` and
  `teeth-idm-integrity.py` (`shutil.copytree`). `[teeth-ledger-freeze.sh:case_run]`
  `[teeth-t10-mutation.ts:copyTree]` `[teeth-domainforge-gate.py:main]`
- A tooth only counts when the control passes and the mutated copy fails *by
  assertion*; a compile error, crash or missing test is reported as a failure of the
  tooth. `[teeth-t07-mutation.ts:isAssertionFailure]`
  `[teeth-t06-mutation.ts:isAssertionFailure]` `[teeth-t05-mutation.ts:applyMutant]`
  `[teeth-t10-mutation.ts:isAssertionFailure]`
- A mutation that changes nothing is a stale tooth and fails the run rather than
  passing vacuously. `[teeth-t05-prereg-coverage.ts:mutatesSource]`
  `[teeth-t06-shape.ts:TEETH]` `[teeth-t10-mutation.ts:applyMutant]`
- Coverage checks prove *linkage*, not strength, and say so in their own output; the
  mutation teeth are named as the separate strength evidence.
  `[check-t05-prereg-coverage.ts:checkPreregCoverage]`
  `[check-t06-prereg-coverage.ts:checkPreregCoverage]`
- A preregistration is read with a real YAML parser; an id that exists only as text
  inside a block scalar is reported, and the T05 interpretation sidecar is honoured
  only when its `of_sha256` matches the current frozen file.
  `[check-prereg-shape.ts:idsInsideScalars]`
  `[check-t05-prereg-coverage.ts:recoverFromInterpretation]`
- Unknown prereg keys are rejected, so a typo cannot read as an absent section.
  `[check-prereg-shape.ts:ROOT_KEYS]`
- Known defects are tolerated only through an explicit baseline bound to a digest of
  the contract text; an unmatched baseline entry is stale and fails, so old debt cannot
  absorb a new finding. `[check-witness-claims.py:baseline_key]`
  `[measure-contract-modals.py:_key]`
- The canonical semantic authority is the import closure of
  `.sea/interaction/interaction-model.sea`; a byte-identical copy elsewhere is a
  duplicate authority. `[check-boundaries.ts:canonicalClosure]`
- `src/ui/surface2` is a pure island: no Cognate, Bun runtime, renderer, dynamic code,
  raw markup handle or authority store, and only it may name the closed grammar.
  `[check-t05-boundaries.ts:checkT05Boundaries]` `[check-t05-boundaries.ts:SINK]`
- The ledger states a *fragment* digest (its own text with the marker normalised to
  `candidate`), while the Wayfinder `hashes:` block records whole-file digests and is
  authoritative. `[freeze-formation.sh:FH]` `[check-ledger-freeze.sh:STATED]`
- Generation is deterministic and derived: the ledger comes from spec + plan + policy,
  the Wayfinder from the ledger. Neither may invent requirement text or bind an entity
  the `.sea` model does not declare. `[gen-requirement-ledger.py:collect_requirements]`
  `[gen-wayfinder.py:main]`
- The frozen ruler must be `frozen` and hash-match the plan before anything may
  implement. `[check-ruler.py:main]`
- Python entry points resolve the repository from their own path
  (`dirname(dirname(abspath(__file__)))`); shell entry points `cd` to
  `dirname "$0"/..`, so they are invoked by path, not by `cwd`.
  `[gen-ledger-variant.py:REPO]` `[freeze-formation.sh:set -euo pipefail]`

## Side Effects

- Writes `requirements/ledger.yaml` (in place) — `[gen-requirement-ledger.py:OUT]`,
  `[freeze-formation.sh:LEDGER]`.
- Writes `.wayfinder/answer-key.md` (body, then the freeze header and `hashes:` block) —
  `[gen-wayfinder.py:dest]`, `[freeze-formation.sh:hashes]`.
- Writes `.sea/interaction/validation/domainforge-output.txt` (or the path given as
  `$1`) — `[recapture-domainforge-output.sh:OUT]`.
- Writes a compiled verifier binary and creates its parent directory —
  `[build-verifier.ts:mkdirSync]`.
- Writes `.agents/candidates/horizon/T04-CR-001/composed/ledger-policy.yaml`,
  `composed/prereg.patch` and `ledger.yaml` — `[apply-candidate-revision.py:composed_path]`.
- Creates and removes temp trees under the OS temp directory; every teeth script
  deletes them in a `finally`/`trap` — `[teeth-t05-mutation.ts:copyTree]`,
  `[teeth-ledger-freeze.sh:trap]`.
- Spawns subprocesses: `tsc`, `bun test`, `bun build --compile`, `bun run src/main.ts`,
  `python3` validators, `domainforge`, `sea-forge-server`, `realitytrace` consumers —
  `[check.ts:run]`, `[teeth-t05-equivalence.ts:startServer]`, `[ignite.ts:spawn]`.
- Network: loopback HTTP only, from `teeth-t05-equivalence.ts` against the server it
  started — `[teeth-t05-equivalence.ts:get]`.
- Creates and owns the operator cell directory `0700` with `worlds/`, `policy.yaml`
  (written once), `server.yaml`, `sea-forge.sock`, `sea-forge.log`, and the app store
  and secret paths passed to the cockpit — `[ignite.ts:mkdirSync]`,
  `[ignite.ts:policyPath]`.
- Reads environment: `DOMAINFORGE_BIN`, `BRANCH`, `TREE`, `T05_MUTATION_ROOT`,
  `HORIZON_STORE`, `HORIZON_CONFIG`, `HORIZON_SECRET_FILE`, `SEA_FORGE_SERVER_BIN`,
  `REALITYTRACE_BIN`, `XDG_DATA_HOME`, `XDG_RUNTIME_DIR` —
  `[world-ref.py:domainforge_bin]`, `[teeth-t05-mutation.ts:ROOT]`,
  `[teeth-t05-equivalence.ts:isolatedEnv]`, `[ignite.ts:server]`.

## Verification

- Run: `just verify`

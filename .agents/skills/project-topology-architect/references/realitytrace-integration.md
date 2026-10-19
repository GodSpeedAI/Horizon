# RealityTrace / SXR integration

Born-observable substrates: bind project identities (semantic snapshot, requirements,
runs, contracts, observations, evidence, settlements) to the RealityTrace **SXR CLI** —
through the CLI boundary only. Never link generated software against SXR implementation
crates. Never treat RealityTrace as ordinary logging. Never claim consequence that was
not actually observed.

This reference is grounded in the live `sxr` CLI (slice-1 surface). Re-verify with
`sxr --help` when the installed version differs; do not assume stale commands.

## 1. Portable executable resolution

Distributable substrates resolve SXR in this order, fail-closed:

1. `$SXR_BIN` — environment override (CI, local).
2. A **local, git-ignored** developer config, e.g.
   `.config/sxr-resolve.json` = `{"executable": "/abs/path/to/sxr"}`. Machine-specific
   paths live only here — never in committed files, never in the plugin.
3. `sxr` found on `PATH`.

If none yields an executable, **fail closed**: emit a diagnostic naming the three
resolution steps and exit non-zero. Do not proceed as if SXR were present.

The plugin ships `../scripts/sxr-resolve.py` implementing exactly this order. Generated
projects wrap it in a `just sxr-doctor` recipe:

```just
sxr-resolve := "python3 $$(scripts or path to sxr-resolve.py)"
sxr-doctor:
    @{{sxr-resolve}} doctor --json
```

When SXR is unavailable the recipe fails with an explicit diagnostic; every other
verification in the substrate must remain valid independent of SXR (never fake an SXR
outcome to keep a gate green).

## 2. CLI surface map

Every subcommand accepts the global `--json` flag and prints machine-readable output.

| Domain | Commands (used via `sxr <group> <sub> ...`) |
|--------|---------------------------------------------|
| Enroll / identity | `repo enroll <path>`, `repo list`, `repo identity --repo <id>` |
| Semantic config | `semantic configure --repo <id> --entry <file>`, `semantic status --repo <id>` |
| Semantic snapshot | `snapshot create --repo <id>` |
| Question | `question declare --repo <id> --file <file>` |
| Threshold | `threshold declare --repo <id> --question <q> --file <file>` |
| Run lifecycle | `run begin --repo ... --snapshot ... --question ... --threshold ...`, `run finish --run <id>` |
| Verification plan | `plan create --run <id> --verifier <v> --target <t>` + optional `--from-contract <obligation>` |
| Verification contract | `contract import --repo <id> --file <file>` |
| Execute plan | `verify run --run <id>` |
| Evidence | `evidence create --run <id> --observation <path> --derive` (derive is required in slice 1) or `--evidence-type <type>`; `evidence for-claim --run --question --claim --direction`; `evidence for-hypothesis --run --question --hypothesis --direction` |
| Claims | `claim create --run <id> --question <q> --src <s> --dst <d>` (`--kind relation` default) |
| Settlement | `settlement register --run <id> --question <q> --threshold <t> --transformation <t>` + optional `--debt <name>` |
| Verifier stream | `ingest --run <id> --verifier <v> --stdin-format <fmt>` (optional `--spool`, `--async-mode`) |
| Ledger | `ledger verify --repo`, `ledger export --repo`, `ledger history --repo` |
| Diagnostics | `doctor`; `residual compute --repo --question --snapshot`; `diagnostic enumerate/settle/propose/status`; `explain <record_id>`; `context --repo --failure <id>` |
| Projections | `projections status`, `projections rebuild --repo [--all]`, `projections export --repo [--canonical-json]` |
| Queue/spool | `spool status`, `spool drain`, `queue recover`, `await [--run|--repo --all] [--timeout-secs N]` |
| Delta | `delta --repo --question --snapshot` |

Exit codes (§15): `0` ok, `2` usage/error, `3` precondition (e.g. not enrolled, not
found, queued-for-commit), `4` CEP validation, `5` integrity, `6` verifier, `75`
spooled. Agents must check exit codes plus `--json` output; never infer success from
stdout alone.

## 3. Binding project identities

Wire generated substrate identities into SXR so a later agent can follow evidence:

- semantic model → `semantic configure` (`.sea/` entry) then `snapshot create`;
- requirement `AK-017` → `question declare` whose file encodes the requirement's
  acceptance predicate;
- run (task execution) → `run begin`/`run finish`;
- acceptance contract `AC-017-02` → `contract import` + `plan create --from-contract`;
- behavioral observation → `verify run` then `evidence create --derive` (or `ingest`);
- relations between requirements → `claim create`;
- requirement settled → `settlement register` with the observed evidence bound.

Prefer thin `just` recipes so downstream agents never reconstruct raw commands:
`just sxr-doctor`, `just sxr-snapshot`, `just sxr-enroll`, `just sxr-verify`,
`just sxr-evidence`, `just sxr-settle`, `just sxr-ledger`, `just sxr-trace <record-id>`.
Add a recipe only where it maps to a real CLI operation on the installed version.

## 4. Evidence discipline

- RealityTrace is provenance/evidence, not logging. Records must name what was observed
  (`--observation`) and derive real evidence; never register unobserved outcomes.
- A critic verdict is model judgment; it is not interchangeable with an SXR evidence
  record. Keep them separate in reports.
- Settlement requires observed evidence. `settlement register` only after the observed
  run actually passes the threshold — never to fabricate closure.
- Local structural tests establish **structural proof** and, at best, **reference
  conformance**; they do not establish **consequential validation** (real-world
  consequence). Do not let an SXR record imply real-world consequence that was not
  observed.
- `--spool`/`--async-mode`/`await` semantics: spooled requests exit `75` and must be
  drained (`spool drain`, `queue recover`, `await`) before the run is considered
  committed. Do not claim ledger commits that are still queued.

## 5. Availability behavior

Generated gate recipes reference SXR through the resolver. If SXR is absent:

- `just sxr-*` recipes fail with the resolver's explicit diagnostic (never silently),
- baseline structural verification sans SXR must still be green,
- the substrate's status card records `SXR: unavailable (fail-closed)` — no fabricated
  integration claims.

If the host developer has a local build (e.g. a machine-specific path), it belongs in
the git-ignored local config from §1 — never in committed files or in this plugin.
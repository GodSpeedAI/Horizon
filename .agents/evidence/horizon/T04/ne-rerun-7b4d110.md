# NE-01 … NE-05 re-run against the reviewed commit `7b4d110` (not the working tree)

Why this file exists: the remediation changes many mutable files, so a NE re-run on the
working tree would not show what the reviewer saw. This transcript was produced from an
isolated export (`git archive 7b4d110` → temporary directory, installed modules linked
read-only, the pinned `.sea` world, `research/.venv` copied). Nothing in this repository was
modified; the export was mutated and restored in place.

Command setup:

```
mkdir /tmp/t04-ne && git archive 7b4d110 | tar -x -C /tmp/t04-ne
ln -s <repo>/node_modules /tmp/t04-ne/node_modules    # read-only use
export DOMAINFORGE_BIN=<domainforge 0.21.1 binary>
```

## Baseline

```
$ bun test
 8 pass
 0 fail
 36 expect() calls
Ran 8 tests across 3 files.
```

## NE-01 — remove the required Cognate dependency from package metadata

```
$ <copy package.json without @godspeedai/cognate-domainforge>
$ bun run scripts/check-boundaries.ts --root <export> --package <copy>
STRUCTURAL: missing required Cognate dependency @godspeedai/cognate-domainforge; a mock runtime is not a substitute
boundaries exit=1
```

The structural E2E itself still exits 0 with installed modules present — the same
observation the reviewer recorded, and the reason the tooth now records it rather than
asserting it.

## NE-02 — in-memory store under `local_operator`

```
$ HORIZON_STORE=:memory: bun run src/main.ts
RuntimeBoundaryError: RUNTIME: local_operator forbids an in-memory runtime; a durable SQLite store is required   (exit 1)

$ HORIZON_STORE=:memory: bun test test/app.test.ts
 1 pass, 0 fail, 19 expect() calls                                                                               (exit 0)
```

The second line is the defect the verdict filed as F5: the reviewed E2E supplied its own
store path. On the remediated tree the same command now fails at construction
(`configured in-memory storage is rejected by construction, with no E2E override`), and
the working-tree run of `just test` above shows it.

## NE-03 — `product-model/` as a competing canonical store

```
$ mkdir product-model && echo 'canonical: product-actualizer' > product-model/process.yaml
$ bun run scripts/check-boundaries.ts
BOUNDARY: competing canonical model/authority store at product-model/process.yaml
boundaries exit=1
```

## NE-04 — second `.sea` authority outside the canonical source

```
$ echo 'namespace second' > second.sea
$ bun run scripts/check-boundaries.ts
BOUNDARY: duplicate semantic authority at second.sea; canonical model lives under .sea/
boundaries exit=1
```

## NE-05 — false `world_ref` and deleted canonical entry

```
$ bun run scripts/probe-world.ts --world-ref world:horizon@sha256:0000…0000
SemanticAdapterError: SEMANTIC: world identity mismatch: expected world:horizon@sha256:0000…0000,
  observed world:horizon@sha256:6c18d6a6…412309f0                                                              (exit 1)

$ mv .sea/interaction/interaction-model.sea /tmp/hold.sea
$ bun run scripts/probe-world.ts --world-ref world:horizon@sha256:6c18d6a6…412309f0
SemanticAdapterError: SEMANTIC: DomainForge rejected the world:
  {"kind":"unknown","message":"[… APP014 … entry 'interaction-model.sea' is not present in sources_json …]"}     (exit 1)

$ mv /tmp/hold.sea .sea/interaction/interaction-model.sea
sha256 1c3909e51c509b60…  (byte-identical to the reviewed commit)
```

## Result

| NE | Reviewed commit `7b4d110` | Remediated tree |
| --- | --- | --- |
| NE-01 | boundary exit 1 with the named diagnostic; E2E exit 0 | boundary exit 1; the tooth records the E2E observation |
| NE-02 | runtime exit 1; E2E exit 0 (defect F5) | runtime exit 1; E2E now exit 1 for the configured-in-memory test |
| NE-03 | exit 1 | exit 1 |
| NE-04 | exit 1 | exit 1 |
| NE-05 | exit 1 (false ref), exit 1 (deleted entry, APP014) | exit 1, exit 1 (unchanged adapter) |

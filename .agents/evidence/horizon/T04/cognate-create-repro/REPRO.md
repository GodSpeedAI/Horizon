# cognate create -- reproducibility run (NEW evidence, not the historical run)

Captured: 2026-10-19
CLI: @godspeedai/cognate-cli 0.6.1 (node_modules/.bin/cognate, from the committed vendor tarball)
Source checkout: /home/sprime01/projects/cognate at commit a477933a1ddf1a8bcd64b4e762ccbb56e5fbd7d5 (read only; not modified)
Network: unavailable in this environment (DNS and outbound TCP blocked); the run completed offline
Directory: isolated temporary directory; no repository file was replaced

Command:
```
node_modules/.bin/cognate create repro --profile harness --source /home/sprime01/projects/cognate
```

Exit: 0

stdout:
```text
created /tmp/t04-create/repro (vendored 27 package(s))
```

stderr:
```text
```

Generated tree (top level):
```text
.
./.cognate
./.cognate/vendor
./.gitignore
./README.md
./cognate.config.ts
./domain
./domain/example.sea
./package.json
./src
./src/agents
./src/capabilities
./src/components
./src/projections
./src/ui
./test
./test/app.test.ts
```

Generated dependency pins:
```json
{
  "dependencies": {
    "@godspeedai/cognate-cli": "file:./.cognate/vendor/godspeedai-cognate-cli-0.6.1.tgz",
    "@godspeedai/cognate-profile-harness": "file:./.cognate/vendor/godspeedai-cognate-profile-harness-0.6.1.tgz",
    "@godspeedai/cognate-domainforge": "file:./.cognate/vendor/godspeedai-cognate-domainforge-0.6.1.tgz",
    "@godspeedai/cognate-provider-local": "file:./.cognate/vendor/godspeedai-cognate-provider-local-0.6.1.tgz"
  },
  "devDependencies": null
}
```

Generated file digests:
```text
773811cb68636ba289c6b75e194754004a4ad4fdc238b42e51fd22ea1db9aef4  package.json
vendor tarballs: 27
```

## What this does and does not show

- **Shows:** with the pinned 0.6.1 CLI and the pinned Cognate source commit, `cognate create`
  runs offline to exit 0 and vendors 27 packages, and a starter tree with the same shape as
  Horizon's (`src/agents`, `src/capabilities`, `src/components`, `src/projections`, `src/ui`,
  `test/app.test.ts`, `domain/example.sea`) is produced reproducibly from committed inputs.
- **Does not show:** that this is the run that produced Horizon's `src/` and `test/`. The
  historical output was not retained, and Horizon's files were subsequently written by hand.
  This capture replaces an absent provenance record with a fresh, dated one; it is not
  retroactive evidence for the original scaffold. The generated `package.json`
  (sha256 `773811cb…`) is the starter template's, not Horizon's (sha256 `9c088045…`).
- **Scope limit (unchanged):** `scaffold.log` remains a reconstruction. The claim "an exact
  invocation is recorded" in T04's known confounds referred to the missing original, so this
  file records an invocation that was actually run, dated, and labelled as new.

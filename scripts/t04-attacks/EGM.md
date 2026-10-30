# t04-attacks

## Overview

`scripts/t04-attacks/` is an intermediate container, not a code package: it holds no
direct source files. It groups the adversarial dependency fixtures that the T04 attack
suite installs into an isolated tree, so a fake package is never mistaken for a
production dependency of the repository.

The only consumer found in source is `scripts/teeth.ts`, which copies
`scripts/t04-attacks/fake-runtime` over
`node_modules/@godspeedai/cognate-runtime-bun` inside a temporary copy of the tree and
requires `test/app.test.ts` to fail. `[../teeth.ts:isolatedTree]`
`[../teeth.ts:fake-runtime-substitution]`

## Subdirectories & Boundaries

- fake-runtime: [./fake-runtime/EGM.md](./fake-runtime/EGM.md) - A memory-only stand-in
  for `@godspeedai/cognate-runtime-bun` used as a deliberate failing-settlement double;
  the structural E2E must reject it.

## Verification

- Run: `just verify`

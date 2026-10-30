# vendor — vendored third-party source

## Overview

A holding directory for third-party code Horizon vendors rather than depends on at install time.
It contains no source files of its own: it exists only to keep donated trees visibly separate from
Horizon's authored modules while remaining importable by relative path.

The single child is `terminal-ui`, a self-contained copy of the `GodSpeedAI/Terminal-UI` prompt
library (MIT), which the sequential renderer uses for its Clack-style presentation. Everything
under it is donor code; no Horizon policy, availability decision or capability invocation lives
there.

## Subdirectories & Boundaries

- terminal-ui: [./terminal-ui/EGM.md](./terminal-ui/EGM.md) - Vendored prompt shell, `Select`/`Confirm`
  controls, theme layer, rail/text primitives, keyboard and width hooks, styling and cell-width
  utilities; attribution recorded in [./terminal-ui/README.md](./terminal-ui/README.md).

## Verification

- Run: `bun test`

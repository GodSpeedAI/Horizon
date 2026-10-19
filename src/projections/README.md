# src/projections

Derived, read-only Cognate projections. `navigation-context.ts` folds `run.started` into a
tenant-partitioned `horizon.navigation-context` row carrying observer, world, run and
correlation references. No projection is a source of truth.

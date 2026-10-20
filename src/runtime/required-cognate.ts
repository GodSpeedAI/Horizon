/**
 * The Cognate packages Horizon's composition requires as declared project dependencies.
 *
 * One list, read by the boundary check (`scripts/check-boundaries.ts`) and by the structural
 * E2E (`test/app.test.ts`), so removing a required package from `package.json` fails both,
 * even while an installed copy still resolves (T04 prereg falsifier; verdict r2 F1).
 */
export const REQUIRED_COGNATE = [
  "@godspeedai/cognate-cli",
  "@godspeedai/cognate-domainforge",
  "@godspeedai/cognate-runtime-bun",
  "@godspeedai/cognate-projections",
  "@godspeedai/cognate-kernel-api",
] as const;

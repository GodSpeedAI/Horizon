# D3 implementation (done)

PR: https://github.com/GodSpeedAI/Cognate-Workbench/pull/29 (t1/sdk-adoption, not merged)

Commits: f014f41 deps pin 0.9.0 (+bun.lock); 045d1f2 move seaForgeCall to test/support/sea-forge-raw.ts; 4c6323a governance adoption (+README); 8cff6dc teeth test.

Tests (bun test): baseline 1170 pass / 12 skip / 230 fail; after 1172 pass / 12 skip / 230 fail. The failing set is identical (diff of failing names empty); no new failures. Typecheck passes. J-SEA-FORGE-AUTHORITY and J-SW01 are skipped (need a real server), as at baseline.

Mutation: appended a raw Bun.connect({unix}) to governance.ts, the teeth test failed (1 pass, 1 fail); reverted.

Deviations: (1) commit order is move-before-adoption so every commit stays compilable (the tests import the helper). (2) src/ had no rule matches after adoption, so no stop was needed. (3) The resolve capability passes input fields to the SDK unvalidated; invalid_input maps to the SDK error text, other failures to "SEA-Forge refused the resolution: <error>".

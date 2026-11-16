# D4 implementation (PR #22, branch t1/sdk-adoption, from 94748dc)

Commits: 12b9a8a de-vendor; e58434d config move; 1c1f51f SDK adoption; 7228224 teeth.

Baseline (origin/main): check ok; 514 pass / 16 skip / 0 fail; boundaries ok; J02 live 12 pass / 0 fail.
After: check ok; 511 pass / 16 skip / 0 fail; boundaries ok; single-cognate ok (28 packages, one copy each); J02 live 12 pass / 0 fail (local sea-forge-server-v0.4.0, bwrap, realitytrace).
Delta -3: parseApproval cases (2) and the non-array listing case, deleted with parseApproval. The parity cases exist in cognate's packages/runtime-bun/test/sea-forge-authority.test.ts (not edited).

Mutation: a planted Bun.connect({unix}) in src/app.ts made `bun run boundaries` exit 1 (socket construction + Unix address) and teeth-inv2-mutation exit 1 (control copy fails); reverted. The script also catches 3 planted mutants (one per regex).

Deviations / notes
- bun.lock was regenerated (old lock pointed at deleted tarballs; bun install ENOENT). The bun cache was not touched.
- godspeed-identity-0.1.0-ed6c52a.tgz is unreferenced by package.json and bun.lock; the spec says delete it, but the delete (git rm) was blocked by the permission classifier, so it is still in .cognate/vendor/. Needs a follow-up `git rm`.
- buildInbox signature is (rows, excluded, options).
- Local consts named seaForge in app.ts settlement paths were renamed settlementAuthority to avoid shadowing the new client.
- remote-sessions fake `delegationClient.decide` rebuilds the request so existing assertions on actor/on_behalf_of still hold.
- The client is built when approvals are configured or governance is sea-forge with an authority.
- No legitimate src/ file matched the teeth.
- d4 diffs of events/runtime-api 0.8.0..0.9.0 are in this directory (version-line change only removed).

PINNED_WORLD_REF finding
loadWorld runs DomainForge loadSemanticWorld over domain/ and compares `semantic_closure_hash` (rewritten as world:horizon@sha256:<hash>) to the pin; mismatch is fatal. scripts/world-ref.py (domainforge 0.21.2 CLI `envelope`, same field) prints 0a10c20d...f9d2b for the current domain/, identical to the pin. So the pin is not stale; any differing number comes from reading a different field or command (e.g. a raw parse/contract hash, or the cognateWorldRef whose suffix differs from the canonical ref).

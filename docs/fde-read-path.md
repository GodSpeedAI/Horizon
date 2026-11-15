# FDE read path (WP-19)

Horizon shows an FDE episode from three read-only sources: SEA-Forge case records, the RealityTrace `observed compare` result (with the `observed derive` output it used), and the current world pin. It never writes, never calls a mutating verb and never computes a classification: every class, basis, result and tail status on screen is the source's own word.

- Adapters: `src/adapters/fde-read.ts` (case records, RealityTrace, world pin; `not_connected` / `invalid` / `ok`), `fde-schema.ts` (validator for the vendored contracts in `contracts/fde/`, byte copies by digest, `DIGESTS`), `fde-view.ts` (display table `CLASS_DISPLAY`, debugger rows), `fde-sources.ts` (paths; env `HORIZON_FDE_CASE_DIR`, `HORIZON_FDE_COMPARE`, `HORIZON_FDE_DERIVE`, `HORIZON_FDE_PIN`, or the `fdeSources` option of `createApplication`).
- Desk panel: `src/ui/desk/EpisodeEvidence.tsx`. Debugger: `why` about an episode ref answers from `DebuggerSources.fde`.
- An absent or unreadable source shows exactly `not connected`. A source that fails its schema shows `invalid source` and its violations, with no partial data. `insufficient`, an unverified ledger tail and an unresolved settlement (`U`) are marked "not decided" / "NOT verified", visibly and in text, never as a pass.
- The world pin has no JSON Schema (it is a wire response, `authority_pin`); its checks mirror `PinState`/`PinRecord` in SEA-Forge `world_pin.rs`.

## Parity gate (AT-14, NT-09)

```
scripts/fde-parity.sh            # both; or: scripts/fde-parity.sh AT-14 | NT-09   (also: bun run parity:fde)
```

Headless Chromium through Playwright renders the desk component; `test/support/fde-parity.ts` computes the expected values straight from the raw ledger and result files (no adapter code) and any difference is reported as `PARITY_MISMATCH` with the field. Exit non-zero on a mismatch, a failure, a missing browser or no matching test. NT-09 patches the adapter's classification mapping in the bundle (the file on disk is not touched) and requires `PARITY_MISMATCH`.

Fixtures and how they were generated: `test/fixtures/fde/README.md`.

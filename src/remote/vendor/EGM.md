# Remote Vendor

## Overview

One vendored third-party library, held here instead of taken from a registry: Project Nayuki's
TypeScript QR Code generator (MIT). It is upstream source kept byte-for-byte except for the `export`
keywords added to the three namespace declarations, and the file says so in its own header
`[qrcodegen.ts:@ts-nocheck]`. It is not Horizon code, it encodes no Horizon meaning, and it exists only
so the desktop pairing panel can draw a QR code without a dependency or a network call.

## Interface

- `qrcodegen.ts`: module-level `@ts-nocheck` with the vendoring note and Nayuki's MIT notice
  `[qrcodegen.ts:@ts-nocheck]`; `namespace qrcodegen` `[qrcodegen.ts:qrcodegen]`.
- Encoding surface: `QrCode.encodeText(text, ecl)` `[qrcodegen.ts:QrCode.encodeText]`,
  `QrCode.encodeBinary(data, ecl)` `[qrcodegen.ts:QrCode.encodeBinary]`, and
  `QrCode.encodeSegments(segs, ecl, minVersion, maxVersion, mask, boostEcl)`
  `[qrcodegen.ts:QrCode.encodeSegments]`.
- Symbol geometry: `QrCode.size`, `QrCode.getModule(x, y)`, `QrCode.MIN_VERSION = 1`,
  `QrCode.MAX_VERSION = 40` `[qrcodegen.ts:QrCode.MAX_VERSION]`.
- Enumerations: `QrCode.Ecc` with `LOW`/`MEDIUM`/`QUARTILE`/`HIGH`
  `[qrcodegen.ts:QrCode.Ecc]`; `QrSegment.Mode` with `NUMERIC`/`ALPHANUMERIC`/`BYTE`/`KANJI`/`ECI`
  `[qrcodegen.ts:QrSegment.Mode]`.
- Segment builders: `QrSegment.makeBytes`, `makeNumeric`, `makeAlphanumeric`, `makeSegments`,
  `makeEci`, `getTotalBits` `[qrcodegen.ts:QrSegment]`.
- Consumed by exactly one caller in this repository: `qrSvg`, which calls
  `qrcodegen.QrCode.encodeText(text, qrcodegen.QrCode.Ecc.MEDIUM)` and then walks
  `getModule(x, y)` to build an SVG path `[../panel.ts:qrSvg]`. Nothing else imports this module.
- Subdirectories: none.

## Invariants

- The vendored file is upstream-unmodified apart from the added `export` keywords; the header states
  this and its licence terms `[qrcodegen.ts:@ts-nocheck]`. Editing its algorithms here would be a fork,
  not a vendor drop.
- `@ts-nocheck` is deliberate: the file's diagnostics are upstream's and are not Horizon's type
  contract `[qrcodegen.ts:@ts-nocheck]`. Consequences for Horizon appear only through `qrSvg`'s return
  type, which is `string` `[../panel.ts:qrSvg]`.
- Self-checks are internal assertions, not caller-facing validation: `assert(cond)` throws
  `Error("Assertion error")`, and `encodeSegments` raises `RangeError("Data too long")` when the
  payload does not fit the chosen error-correction level
  `[qrcodegen.ts:QrCode.encodeSegments]`.
- The encoders are pure functions of their arguments: `encodeText` builds segments with
  `QrSegment.makeSegments` and delegates to `encodeSegments`
  `[qrcodegen.ts:QrCode.encodeText]`; no state survives between calls, so the same input text always
  yields the same module grid.
- `QrCode` instances are immutable square grids: `getModule` only reads
  `[qrcodegen.ts:QrCode.getModule]`.
- The error-correction levels are fixed singletons with `private constructor`
  `[qrcodegen.ts:QrCode.Ecc]`, so a caller cannot invent a level outside the standard's four.

## Side Effects

- None observed in source. No I/O, no network, no clock, no randomness, no environment read, no
  subprocess: the module only computes bit buffers and module grids in memory
  `[qrcodegen.ts:qrcodegen]`.

## Verification

- Run: `bun test`

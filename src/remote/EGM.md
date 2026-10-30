# Remote

## Overview

The phone remote: a second, loopback-only HTTP listener inside the cockpit process that serves two
server-rendered phone pages and a JSON + server-sent-events API, authenticated by a WebAuthn passkey.
It is an authentication and transport boundary, not an authority: every decision is executed through
the same application callbacks the cockpit uses, passed in as `RemoteDeps`, and this directory decides
nothing about what is permitted `[server.ts:RemoteDeps]`.

Trust is carried by three short-lived in-memory records rather than by a stored password: a single-use
pairing secret (five minutes), a per-request WebAuthn challenge (two minutes), and a 12-hour session
cookie bound to a device id and a pairing generation. Bumping the generation revokes every link,
credential and session at once `[pairing.ts:Pairing]` `[sessions.ts:Sessions]`.

`cbor.ts` and `webauthn.ts` verify the attestation and assertion by hand against WebCrypto;
`settings.ts` reads the two environment variables that configure the listener; `panel.ts` renders the
desktop-side panel; `phone.ts` renders the phone pages; `server.ts` routes. `vendor/` holds the
vendored QR encoder.

## Interface

- `server.ts`: `REMOTE_SCHEMA = "horizon.remote/1"` `[server.ts:REMOTE_SCHEMA]`; `RemoteDeps` — the
  reads and write paths the listener borrows from the application (`workspace`, `chrome`, `position`,
  `approvalIntent`, `resolveApproval`, `commitAction`, `settle`, `openCase`)
  `[server.ts:RemoteDeps]`; `RemoteStatus`
  (`state: "off" | "waiting" | "expired" | "connected" | "restoring"`, `generation`, `expires_at`,
  `device`, `public_url`, `reachable`) `[server.ts:RemoteStatus]`; `labelOf(userAgent)`
  `[server.ts:labelOf]`; `RemoteController` with `start`, `refresh`, `stop`, `status`, `pairingLink`,
  `pairingExpiry`, `checkReachable`, `handle`, and getters `listening`, `origin`, `rpId`
  `[server.ts:RemoteController]`.
- `pairing.ts`: `PAIRING_TTL_MS = 5 * 60_000`, `CHALLENGE_TTL_MS = 2 * 60_000`
  `[pairing.ts:PAIRING_TTL_MS]` `[pairing.ts:CHALLENGE_TTL_MS]`; `ChallengeKind = "register" | "auth"`
  `[pairing.ts:ChallengeKind]`; `RedeemResult` `[pairing.ts:RedeemResult]`; `Pairing` with
  `generation`, `isEnabled`, `start`, `refresh`, `stop`, `current`, `redeem`, `issueChallenge`,
  `takeChallenge` `[pairing.ts:Pairing]`.
- `sessions.ts`: `SESSION_TTL_MS = 12 * 3600_000` `[sessions.ts:SESSION_TTL_MS]`,
  `COOKIE_NAME = "__Host-hz_remote"` `[sessions.ts:COOKIE_NAME]`; `Session`
  `[sessions.ts:Session]`; `Sessions` with `open`, `get`, `connected`, `dropWhere`, `drop`, `clear`
  `[sessions.ts:Sessions]`; `sessionCookie`, `clearedCookie`, `cookieOf`
  `[sessions.ts:sessionCookie]` `[sessions.ts:cookieOf]`.
- `webauthn.ts`: `RP_NAME = "Horizon"`, `CHALLENGE_BYTES = 32` `[webauthn.ts:RP_NAME]`;
  `WebAuthnError` `[webauthn.ts:WebAuthnError]`; `VerifiedRegistration`
  `[webauthn.ts:VerifiedRegistration]`; `newChallenge`, `b64url`, `fromB64url`, `equalBytes`
  `[webauthn.ts:newChallenge]`; `registrationOptions`, `assertionOptions`
  `[webauthn.ts:registrationOptions]` `[webauthn.ts:assertionOptions]`; `verifyRegistration`
  `[webauthn.ts:verifyRegistration]`; `verifyAssertion`
  `[webauthn.ts:verifyAssertion]`.
- `cbor.ts`: `CborValue`, `CborError`, `decodeCborAt`, `decodeCbor`
  `[cbor.ts:CborValue]` `[cbor.ts:decodeCborAt]` `[cbor.ts:decodeCbor]`.
- `settings.ts`: `RemoteSettings` `[settings.ts:RemoteSettings]`; `REMOTE_DEFAULT_PORT = 4320`
  `[settings.ts:REMOTE_DEFAULT_PORT]`; `remoteSettings(env)` `[settings.ts:remoteSettings]`;
  `publicOriginOf(raw)` `[settings.ts:publicOriginOf]`.
- `panel.ts`: `qrSvg(text)` `[panel.ts:qrSvg]`; `PanelInput` = `{ status, link, nonce, now }`
  `[panel.ts:PanelInput]`; `remotePanelPage(input)` `[panel.ts:remotePanelPage]`.
- `phone.ts`: `phonePage(nonce)` `[phone.ts:phonePage]`; `pairPage(nonce)` `[phone.ts:pairPage]`.
- Consumed by `../app.ts`, which constructs `RemoteController` from `remoteSettings(process.env)` and
  renders `remotePanelPage` into its remote panel.
- Subdirectories: `vendor/` — see `./vendor/EGM.md`.

## Invariants

- The listener binds loopback only and rejects a Host header that is not this remote
  `[server.ts:RemoteController]` `[server.ts:allowedHosts]`; a POST must also carry an `Origin` equal to
  the controller's own origin `[server.ts:route]`. The cockpit's Host allowlist is deliberately not
  reused.
- Authentication is layered and fails closed: `pairing.isEnabled` false yields `409 remote_off`, no
  session yields `401 not_signed_in`, and only `/m/api/pair/redeem`, `/m/api/pair/finish`,
  `/m/api/auth/options`, `/m/api/auth/finish` and `/m/api/signout` are reachable before a session
  exists `[server.ts:route]` `[server.ts:authenticated]`.
- A session is honoured only in the generation that issued it and only before it expires; an expired
  or stale entry is deleted on lookup `[sessions.ts:Sessions]`. `stop`, `refresh` and a new pairing all
  bump the generation, and `stop`/`refresh` also revoke stored devices and clear sessions
  `[server.ts:stop]` `[server.ts:refresh]`.
- Only one controller exists at a time: completing a pairing revokes every live device and drops every
  session *before* the new device is written `[server.ts:route]`.
- The pairing secret is single use and single-step: `redeem` compares the SHA-256 verifier and consumes
  it in the same synchronous call, so two concurrent redemptions cannot both succeed
  `[pairing.ts:redeem]`. Only the verifier is retained for comparison; the plain secret exists so the
  desktop panel can redisplay the same link until it is redeemed, expires or is replaced
  `[pairing.ts:current]`.
- Pairing secrets must match `^[A-Za-z0-9_-]{43}$` before any comparison, and a dead secret reports
  whether it was already `used` or has `expired` rather than collapsing to `invalid`
  `[pairing.ts:redeem]`.
- A challenge ticket is removed by `takeChallenge` whether or not verification succeeds, and is only
  returned if its kind and generation match and it has not expired `[pairing.ts:takeChallenge]`;
  expired tickets are purged on every issue `[pairing.ts:issueChallenge]`.
- The generation is monotone across restarts: `start` floors it above the highest generation found in
  durable device records `[server.ts:start]` `[pairing.ts:start]`, so a device paired before a restart
  does not become valid again.
- Registration accepts attestation `"none"` only, with an empty `attStmt`, and requires both user
  presence and user verification `[webauthn.ts:verifyRegistration]`. Only ES256, EdDSA and RS256 keys
  whose CBOR map carries the matching curve and coordinate lengths are accepted
  `[webauthn.ts:algorithmOf]`.
- Client data must name the expected type, the exact base64url challenge and the controller's origin
  `[webauthn.ts:clientDataHash]`; authenticator data must hash the controller's RP ID
  `[webauthn.ts:parseAuthData]`.
- Assertion replay and cloning are refused: the sign count must rise whenever either side is non-zero
  `[webauthn.ts:verifyAssertion]`, and the asserted credential id must equal the stored device's
  `[server.ts:route]`.
- The CBOR decoder accepts a fixed subset — integers, byte and text strings, arrays, maps, `false`,
  `true`, `null` — and refuses tags, floats, indefinite lengths, duplicate map keys, integers beyond
  `Number.MAX_SAFE_INTEGER` and nesting deeper than 16 levels `[cbor.ts:decodeCborAt]`. `decodeCbor`
  additionally refuses trailing bytes `[cbor.ts:decodeCbor]`.
- Requests carry a cap: JSON bodies must be `application/json` and at most 16 KiB
  `[server.ts:bodyOf]`; commands must carry a UUID `command_id` and are deduplicated per session, so a
  retry returns the recorded payload instead of repeating a write `[server.ts:command]`.
- A commit is refused when the phone's frame does not match the live frame (`stale_surface`) or when
  the action is no longer `offered` and `available` (`not_available`); `awaiting_authority` from the
  application is answered as `waiting`, not as failure `[server.ts:command]`.
- A rejected approval fails by design: only an error starting `INTENT: governed commit refused` is
  tolerated and audited; any other error is refused to the phone `[server.ts:command]`.
- Rate limits are fixed-window per key: 10 redemptions and 10 finishes per minute, 20 auth calls per
  minute, 60 commands per device per minute `[server.ts:Limiter]` `[server.ts:command]`.
- Passkey material never reaches the phone as an error string: `handle` catches everything and answers
  `500 internal` with a fixed message `[server.ts:handle]`, and only `WebAuthnError.message` is echoed
  for refusals `[server.ts:route]`.
- Pages are served under a nonce CSP (`script-src 'nonce-…'`, `default-src 'none'`) with
  `nosniff`, `no-referrer`, `no-store` and `frame-ancestors 'none'`
  `[server.ts:html]` `[server.ts:SECURITY_HEADERS]`; the phone script builds nodes with
  `textContent` and `createElement` only, never `innerHTML` `[phone.ts:PHONE_SCRIPT]`.
- The pairing secret leaves the address bar before anything else runs, via
  `history.replaceState(null, "", "/m/pair")` `[phone.ts:PAIR_SCRIPT]`.
- Session cookies are `HttpOnly; Secure; SameSite=Strict` under the `__Host-` prefix, and signing out
  clears them with `Max-Age=0` `[sessions.ts:sessionCookie]` `[sessions.ts:clearedCookie]`. Signing
  out on the phone does not stop remote control `[phone.ts:phonePage]`.
- The change signal for the event stream is the store position *plus* a digest of the cockpit state,
  because a record write does not move the event store; the same `Last-Event-ID` is not re-sent, a
  revoked session receives `revoked` and the stream closes, and a heartbeat every 5 s keeps a quiet
  stream under Bun's idle timeout `[server.ts:events]`.
- The state snapshot filters actions to `posture === "offered" && affordance === "available"` and
  caps moves at 20, so possibility is never presented as an affordance
  `[server.ts:snapshot]`.
- Settings come from the environment only, never from `config/horizon.toml`, so cockpit configuration
  semantics stay untouched `[settings.ts:RemoteSettings]`; the public URL must be an origin — https, or
  http only on `localhost`/`127.0.0.1` — with no path, query or credentials
  `[settings.ts:publicOriginOf]`.
- The device label is a coarse, bounded derivation from the user agent and never the full string
  `[server.ts:labelOf]`.
- Reachability is a self-check of `${publicUrl}/m/health`, cached for thirty seconds and bounded to
  three seconds, and reports `not_checked` when no public URL is configured
  `[server.ts:checkReachable]` `[server.ts:status]`.

## Side Effects

- Network: binds `Bun.serve({ hostname: "127.0.0.1", port })` and closes it with
  `this.server?.stop(true)` `[server.ts:start]` `[server.ts:stop]`; `checkReachable` performs an
  outbound `fetch` to the configured public URL with `AbortSignal.timeout(3000)`
  `[server.ts:checkReachable]`.
- Durable store writes through the capabilities layer: `addDevice`, `updateDevice` (sign count,
  `last_seen`, `revoked_at`) and `auditRemote` for `pair`, `open_case`, `commit`, `approve`, `reject`
  and `settle` `[server.ts:route]` `[server.ts:command]`.
- Delegated application writes: `deps.openCase`, `deps.commitAction`, `deps.resolveApproval` and
  `deps.settle` are invoked under the operator's identity, so a phone action is the cockpit action
  `[server.ts:RemoteDeps]`.
- Timers: `Bun.serve` interval every second drives the SSE tick and heartbeat, cleared on stream cancel
  `[server.ts:events]`.
- Randomness and hashing: `randomBytes` for tokens, pairing secrets and CSP nonces; `randomUUID` for
  device ids and commit intent ids; `createHash("sha256")` for token and secret verifiers, the RP ID
  hash, client-data digests and the SSE state digest `[sessions.ts:Sessions]` `[pairing.ts:Pairing]`
  `[server.ts:route]` `[server.ts:events]`.
- Clock: the controller takes a `clock` parameter defaulting to `() => Date.now()`; there is no
  direct `Date.now()` read inside the routing logic beyond that default `[server.ts:RemoteController]`.
- Environment: `remoteSettings` reads `HORIZON_REMOTE_PORT` and `HORIZON_REMOTE_PUBLIC_URL`
  `[settings.ts:remoteSettings]`.
- Response headers: `set-cookie` on pairing, auth and signout; CSP, `nosniff`, `no-referrer`,
  `no-store` and `x-frame-options` on every response `[server.ts:SECURITY_HEADERS]`.

## Verification

- Run: `bun test`

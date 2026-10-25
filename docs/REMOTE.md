# Phone remote control

Phone remote control lets the solo stack owner keep working the governed loop from a phone: see the open case, what is waiting for their approval, recent moves with their claims, and act on them (approve or reject, commit an offered move, open a case, observe and settle). The phone shows the same canonical state as the cockpit. Nothing is decided on the phone that is not decided by SEA-Forge, exactly as at the desk.

Remote control is off until you turn it on from the cockpit. Turning it on is an action at the desk.

## Turn it on

1. Make the phone listener available, once, from the ignition terminal:

   ```sh
   bun run ignite --remote                      # this machine only, 127.0.0.1:4320
   bun run ignite --remote https://horizon.example   # your tunnel's public HTTPS origin
   bun run ignite --remote-port 4330            # a different loopback port
   ```

   Ignite starts nothing else. It does not start a tunnel and it does not contact any relay.

2. Open the cockpit's panel at `http://127.0.0.1:4319/workspace/remote` (or follow the status-rail item "Remote: off") and press **Start remote control**.

3. Scan the QR with your phone, or copy the link. The phone opens a page that asks it to create a passkey for Horizon. The link works once and expires in five minutes.

The panel shows what the phone can reach: this machine only, or the public URL you configured. With no public URL the phone can reach this machine only, which is what you want for testing on one machine (`http://localhost:4320`).

## What the panel does

| State | What you see | What you can do |
|---|---|---|
| Off | "Remote control is off." and where it will be reachable | Start remote control |
| Waiting for phone | The QR, the link with Copy link, a countdown | Refresh QR, Stop |
| Link expired | The link has expired | Refresh QR, Stop |
| Phone connected | The phone's label (for example "iPhone · Safari"), paired at, last seen | Replace phone, Stop |
| Restoring connection | The phone is paired but has no live session | Stop |

**Refresh QR** issues a new link and revokes every earlier link, every paired phone and every open session at once. **Stop** revokes all of them and closes the phone listener immediately. Closing the panel does not stop remote control.

A second phone replaces the first. Replacing the phone signs out the current one at once.

## Trust model

- **The passkey is the authenticated boundary for the phone.** Pairing needs the link once; after that, every phone session needs a fresh passkey assertion with user verification. A pairing link alone never grants control.
- **One operator, one active phone.** The phone acts as the same single operator (`caller`) as the cockpit. Approvals are resolved through the same SEA-Forge path as the desk's approval form, under that identity.
- **Loopback trust is never reused.** The phone listener does not accept the cockpit's launch secret and does not trust the cockpit's Host allowlist. Every phone request carries its own session.
- **Secrets stay out of URLs and logs.** The pairing secret travels in the URL fragment, which browsers do not send to servers, and the phone page removes it from the address bar before doing anything else. Only a SHA-256 verifier of the secret is checked by the server, and the secret is not written to the store or the audit trail.
- **Sessions and pairing state live in memory.** Restarting Horizon drops every session and every pending link. The phone then needs a fresh link from the panel after you start remote control again. Paired device records (credential id, public key, sign count, label, generation, revocation) are kept in the store, so a restart does not let an old credential back in.
- **State-changing commands are audited.** Each phone command that opens a case, commits, decides an approval or settles writes one record to the `horizon-remote-audit` collection, with the device, the action and the outcome. Commands are de-duplicated by their command id, so a retry is answered with the first outcome and does not act twice.
- **No end-to-end encryption.** The phone talks to the tunnel or proxy over HTTPS; the tunnel or proxy terminates TLS and can read the traffic. Anyone who controls that hop can see what you do from the phone. Choose a tunnel you trust.

## Exposing it with a tunnel

The phone listener binds to `127.0.0.1` only. Reaching it from another network is your explicit choice, and it is a reverse tunnel you run yourself.

**cloudflared, quick tunnel:**

```sh
cloudflared tunnel --url http://127.0.0.1:4320
```

Cloudflare gives the quick tunnel a random host name each time it starts. Passkeys are bound to the host name they were created on, so a quick tunnel needs a new pairing after every restart of the tunnel. Use it to try the feature, not to keep a phone paired.

**Stable host (named cloudflared tunnel, or tailscale funnel):** create a tunnel with a fixed host name that forwards to `http://127.0.0.1:4320`, then start Horizon with `bun run ignite --remote https://your-host.example`. Passkeys stay valid for that host, so the phone pairs once.

Whichever tunnel you use, the origin you configure must match the public address the phone opens exactly (scheme and host). The phone listener rejects any other Host header.

## Troubleshooting

- **"Remote control is off on the desktop."** The panel is in the Off state, or Horizon restarted since you started it. Press Start in the panel and scan the new QR.
- **"This link has expired."** Links last five minutes. Press Refresh QR on the desktop.
- **"This link was already used."** A link works once. Press Refresh QR and scan again.
- **"Passkeys are not available in this browser."** Open the link in the phone's default browser (Safari on iOS, Chrome on Android) over HTTPS, or over `localhost` on the same machine.
- **The panel says the public URL did not answer its health check.** The tunnel is not running, or it does not forward to `127.0.0.1:4320`. Check the tunnel, then reload the panel. The check is repeated at most every thirty seconds.
- **The phone shows "Reconnecting".** The connection to the desktop dropped. The phone retries with a back-off of one to thirty seconds and refreshes its state on reconnect.
- **A decision shows "Sent, waiting for SEA-Forge".** The decision was sent and SEA-Forge has not answered yet. Look at the desktop's workspace receipt for the reason.
- **A phone decision disappears with "Already decided on the desktop".** The approval was answered at the desk first. Nothing was recorded twice.

## What the phone cannot do

The phone cannot start or stop remote control, cannot pair a new phone, and cannot change the policy. Those stay at the desk.

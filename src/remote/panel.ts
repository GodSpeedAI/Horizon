/**
 * The desktop panel for phone remote control, on the cockpit's loopback listener. It is complete
 * without JavaScript: every action is a plain form POST. The small script only ticks the countdown
 * and reloads when the generation changes.
 */
import { qrcodegen } from "./vendor/qrcodegen.ts";
import type { RemoteStatus } from "./server.ts";

const STYLE = `
:root { --bg:#f6f6f3; --fg:#1b1d20; --muted:#4f545b; --line:#d6d8dc; --card:#ffffff; --accent:#1f5fa8; --on-accent:#ffffff; --warn:#7a4300; --focus:#1f5fa8; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#15171a; --fg:#eceef1; --muted:#b9bec6; --line:#363b42; --card:#1d2024; --accent:#8fb8ea; --on-accent:#0d1b2a; --warn:#f0c27b; --focus:#8fb8ea; } }
:root[data-theme="dark"] { --bg:#15171a; --fg:#eceef1; --muted:#b9bec6; --line:#363b42; --card:#1d2024; --accent:#8fb8ea; --on-accent:#0d1b2a; --warn:#f0c27b; --focus:#8fb8ea; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 640px; margin: 0 auto; padding: 24px 16px; }
h1 { font-size: 1.4rem; margin: 0 0 4px; }
h2 { font-size: 1.1rem; margin: 0 0 8px; }
a { color: var(--accent); }
p { margin: 0 0 12px; }
.muted { color: var(--muted); }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 16px; margin: 0 0 14px; }
.warn { color: var(--warn); }
.row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
button { min-height: 44px; min-width: 44px; padding: 10px 16px; font: inherit; color: var(--fg); background: var(--card); border: 1px solid var(--line); border-radius: 6px; cursor: pointer; }
button.primary { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
button:focus-visible, a:focus-visible, input:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.qr { width: 240px; height: 240px; background: #fff; padding: 0; border-radius: 4px; }
.qr svg { display: block; width: 240px; height: 240px; }
code { overflow-wrap: anywhere; font-size: .9rem; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 14px; margin: 0 0 12px; }
dt { color: var(--muted); }
dd { margin: 0; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

/** A quiet-zone QR as inline SVG, dark on light in both themes. */
export function qrSvg(text: string): string {
  const qr = qrcodegen.QrCode.encodeText(text, qrcodegen.QrCode.Ecc.MEDIUM);
  const border = 4;
  const size = qr.size + border * 2;
  let path = "";
  for (let y = 0; y < qr.size; y += 1) {
    for (let x = 0; x < qr.size; x += 1) {
      if (qr.getModule(x, y)) path += `M${x + border},${y + border}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR code for the pairing link" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#ffffff"/><path d="${path}" fill="#000000"/></svg>`;
}

function clock(at: string | null): string {
  if (at === null) return "never";
  return new Date(at).toLocaleString("en-GB", { hour12: false });
}

export interface PanelInput {
  readonly status: RemoteStatus;
  readonly link: string | null;
  readonly nonce: string;
  readonly now: number;
}

export function remotePanelPage(input: PanelInput): string {
  const { status, link, nonce, now } = input;
  const remaining = status.expires_at === null ? 0 : Math.max(0, Math.ceil((status.expires_at - now) / 1000));
  const minutes = Math.floor(remaining / 60);
  const seconds = String(remaining % 60).padStart(2, "0");
  let section: string;
  if (status.state === "off") {
    const reach = status.public_url === null
      ? "The phone can reach this machine only. To reach it from another network, set a tunnel URL with <code>bun run ignite --remote https://your-host</code> and start remote control again."
      : `The phone will use <code>${esc(status.public_url)}</code>. Start a tunnel to that address first.`;
    section = `<section class="card" aria-labelledby="panel-title">
<h2>Remote control is off.</h2>
<p>${reach}</p>
<form method="post" action="/workspace/remote/start" class="row"><button class="primary" type="submit">Start remote control</button></form>
</section>`;
  } else if (status.state === "waiting" && link !== null) {
    section = `<section class="card" aria-labelledby="panel-title">
<h2>Scan this with your phone</h2>
<p>Scanning opens a page that asks your phone to create a passkey for Horizon. The link works once and expires in <span id="countdown" data-expires="${status.expires_at ?? 0}">${minutes}:${seconds}</span>.</p>
<div class="qr">${qrSvg(link)}</div>
<p class="row"><code id="pair-link">${esc(link)}</code></p>
<p class="row"><button type="button" id="copy-link">Copy link</button><span id="copied" class="muted" aria-live="polite"></span></p>
<p class="muted" id="countdown-announce" aria-live="polite" aria-atomic="true"></p>
<div class="row">
<form method="post" action="/workspace/remote/refresh"><button type="submit">Refresh QR</button></form>
<form method="post" action="/workspace/remote/stop"><button type="submit">Stop</button></form>
</div>
<p class="muted">Refresh QR revokes this link and any phone that paired before. Closing this page does not stop remote control.</p>
</section>`;
  } else if (status.state === "expired" || status.state === "waiting") {
    section = `<section class="card" aria-labelledby="panel-title">
<h2>The link has expired.</h2>
<p>Refresh the QR to get a new one. Remote control is still on.</p>
<div class="row">
<form method="post" action="/workspace/remote/refresh"><button class="primary" type="submit">Refresh QR</button></form>
<form method="post" action="/workspace/remote/stop"><button type="submit">Stop</button></form>
</div>
</section>`;
  } else {
    const device = status.device;
    const label = device === null ? "Unknown phone" : esc(device.label);
    const heading = status.state === "connected" ? "Phone connected." : "Restoring connection…";
    const body = status.state === "connected"
      ? "Replacing the phone signs out the current one at once and needs a new passkey on the new phone."
      : "The phone is paired but has no live session. It re-authenticates with its passkey when it reopens the page.";
    section = `<section class="card" aria-labelledby="panel-title">
<h2>${heading}</h2>
<dl>
<dt>Phone</dt><dd>${label}</dd>
<dt>Paired at</dt><dd>${clock(device?.paired_at ?? null)}</dd>
<dt>Last seen</dt><dd>${clock(device?.last_seen ?? null)}</dd>
</dl>
<p class="muted">${body}</p>
<div class="row">
<form method="post" action="/workspace/remote/refresh"><button type="submit">Replace phone</button></form>
<form method="post" action="/workspace/remote/stop"><button type="submit">Stop</button></form>
</div>
</section>`;
  }
  const reach = status.reachable === "failed"
    ? `<p class="card warn" role="status">The public URL did not answer its health check. Check that the tunnel is running; the phone cannot reach this desktop until it is.</p>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Control from your phone</title>
<style nonce="${nonce}">${STYLE}</style>
</head>
<body>
<main>
<p><a href="/workspace">Back to the workspace</a></p>
<h1 id="panel-title" tabindex="-1">Control from your phone</h1>
<p class="muted" role="status" aria-live="polite" id="state" data-state="${status.state}">${esc(stateText(status.state))}</p>
${reach}
${section}
<p class="muted">The phone never decides anything. Approvals and moves go through SEA-Forge exactly as they do at this desk.</p>
</main>
<script type="module" nonce="${nonce}">
const countdown = document.getElementById("countdown");
if (countdown) {
  const expires = Number(countdown.dataset.expires);
  const announce = document.getElementById("countdown-announce");
  let lastMinute = -1;
  const tick = () => {
    const left = Math.max(0, Math.ceil((expires - Date.now()) / 1000));
    countdown.textContent = Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0");
    const minutes = Math.ceil(left / 60);
    if (minutes !== lastMinute && left > 0) { lastMinute = minutes; announce.textContent = (minutes === 1 ? "Less than a minute" : "About " + minutes + " minutes") + " left on the link."; }
    if (left === 0) { clearInterval(timer); }
  };
  const timer = setInterval(tick, 1000);
  tick();
}
const copy = document.getElementById("copy-link");
if (copy) copy.addEventListener("click", async () => {
  const text = document.getElementById("pair-link").textContent;
  try { await navigator.clipboard.writeText(text); document.getElementById("copied").textContent = "Copied."; }
  catch { document.getElementById("copied").textContent = "Select the link above and copy it."; }
});
const events = new EventSource("/workspace/remote/events");
let generation = ${status.generation};
events.addEventListener("status", (event) => {
  const next = JSON.parse(event.data);
  if (next.generation !== generation || next.state !== document.getElementById("state").dataset.state) location.reload();
});
</script>
</body>
</html>`;
}

function stateText(state: RemoteStatus["state"]): string {
  switch (state) {
    case "off":
      return "Off";
    case "waiting":
      return "Waiting for phone";
    case "expired":
      return "Link expired";
    case "connected":
      return "Phone connected";
    case "restoring":
      return "Restoring connection";
  }
}

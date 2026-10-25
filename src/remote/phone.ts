/**
 * The phone pages. Each is a server-rendered HTML shell with one small nonce'd module script; the
 * script builds every element with textContent, never innerHTML, and sends nothing to the server
 * that the server does not validate. No framework and no build step.
 */

const STYLE = `
:root { --bg:#f7f7f5; --fg:#1d1f22; --muted:#55595f; --line:#d9dbdf; --card:#ffffff; --accent:#1f5fa8; --on-accent:#ffffff; --warn:#8a4b00; --focus:#1f5fa8; --ok:#1d6b3a; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#15171a; --fg:#eceef1; --muted:#b3b8c0; --line:#343940; --card:#1d2024; --accent:#8fb8ea; --on-accent:#0d1b2a; --warn:#f0c27b; --focus:#8fb8ea; --ok:#8fd3a4; } }
:root[data-theme="dark"] { --bg:#15171a; --fg:#eceef1; --muted:#b3b8c0; --line:#343940; --card:#1d2024; --accent:#8fb8ea; --on-accent:#0d1b2a; --warn:#f0c27b; --focus:#8fb8ea; --ok:#8fd3a4; }
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; overflow-x: hidden; }
body { padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
main, header { max-width: 430px; margin: 0 auto; padding: 0 16px; }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 12px; padding-bottom: 8px; }
h1 { font-size: 1.25rem; margin: 0; }
h2 { font-size: 1.05rem; margin: 22px 0 8px; }
p { margin: 0 0 10px; }
.muted { color: var(--muted); }
.pill { margin: 0; font-size: .9rem; border: 1px solid var(--line); border-radius: 999px; padding: 4px 10px; color: var(--muted); }
.pill[data-state="live"] { color: var(--ok); }
.pill[data-state="reconnecting"], .pill[data-state="offline"] { color: var(--warn); }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px; margin: 0 0 10px; }
.notice { min-height: 1.4em; margin: 10px 0; color: var(--muted); }
.notice[data-kind="error"] { color: var(--warn); }
button, .button { min-height: 44px; min-width: 44px; padding: 10px 14px; font: inherit; color: var(--fg); background: var(--card); border: 1px solid var(--line); border-radius: 8px; cursor: pointer; }
button.primary { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
button.danger { color: var(--warn); }
button:focus-visible, input:focus-visible, summary:focus-visible, a:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
input[type="text"] { width: 100%; min-height: 44px; padding: 10px; font: inherit; color: var(--fg); background: var(--card); border: 1px solid var(--line); border-radius: 8px; }
.row { display: flex; flex-wrap: wrap; gap: 8px; }
details { border-top: 1px solid var(--line); padding: 10px 0; }
summary { min-height: 44px; display: flex; align-items: center; cursor: pointer; }
dl { display: grid; grid-template-columns: 1fr; gap: 8px; margin: 8px 0; }
dt { font-weight: 600; }
dd { margin: 0; color: var(--muted); overflow-wrap: anywhere; }
.jump { position: sticky; bottom: 12px; display: block; margin: 12px auto; }
[hidden] { display: none !important; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;

function shell(nonce: string, title: string, body: string, script: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="referrer" content="no-referrer">
<title>${title}</title>
<style nonce="${nonce}">${STYLE}</style>
</head>
<body>
${body}
<script type="module" nonce="${nonce}">${script}</script>
</body>
</html>`;
}

const SHARED = `
const enc = (buffer) => { let text = ""; for (const byte of new Uint8Array(buffer)) text += String.fromCharCode(byte); return btoa(text).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, ""); };
const dec = (text) => { const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4); const binary = atob(padded); const out = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i); return out; };
const credentialJSON = (credential) => { const response = {}; for (const key of ["clientDataJSON", "attestationObject", "authenticatorData", "signature", "userHandle"]) { const value = credential.response[key]; if (value instanceof ArrayBuffer) response[key] = enc(value); } return { id: credential.id, rawId: enc(credential.rawId), type: credential.type, response }; };
const post = async (path, body) => { const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" }); const data = await response.json().catch(() => ({})); return { status: response.status, data }; };
const messageFor = (data, fallback) => (data && typeof data.message === "string" ? data.message : fallback);
`;

const PHONE_SCRIPT = `
${SHARED}
const $ = (id) => document.getElementById(id);
const notice = (text, kind) => { const node = $("notice"); node.textContent = text; node.dataset.kind = kind || ""; };
const pill = (state, text) => { const node = $("pill"); node.dataset.state = state; node.textContent = text; };
const el = (tag, attrs = {}, ...children) => { const node = document.createElement(tag); for (const [key, value] of Object.entries(attrs)) { if (key === "text") node.textContent = value; else if (key === "on") node.addEventListener("click", value); else if (value !== undefined && value !== null) node.setAttribute(key, value); } for (const child of children) if (child) node.append(child); return node; };
const uuid = () => crypto.randomUUID();
let state = null;
let source = null;
let retry = 1000;
let pending = new Set();
let lastTop = null;

function showOnly(id) { for (const name of ["connect", "home", "off"]) $(name).hidden = name !== id; }

async function boot() {
  try {
    const response = await fetch("/m/api/state", { credentials: "same-origin", headers: { accept: "application/json" } });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) return connectScreen();
    if (response.status === 409 || response.status === 404) { closeStream(); showOnly("off"); $("off-text").textContent = messageFor(data, "Remote control is off on the desktop."); return; }
    if (!response.ok) throw new Error("state");
    state = data;
    render();
    showOnly("home");
    pill("live", "Live");
    openStream();
  } catch {
    pill("offline", "Offline");
    notice("Cannot reach the desktop. Retrying.", "error");
    setTimeout(boot, Math.min(retry, 30000));
    retry = Math.min(retry * 2, 30000);
  }
}

function connectScreen() {
  closeStream();
  showOnly("connect");
  pill("offline", "Not connected");
  notice("");
}

async function signIn() {
  if (!window.PublicKeyCredential) return notice("Passkeys are not available in this browser.", "error");
  notice("Use your passkey to continue.");
  const { status, data } = await post("/m/api/auth/options", {});
  if (status !== 200) return notice(messageFor(data, "Scan the QR on your desktop again."), "error");
  try {
    const options = data.options;
    const credential = await navigator.credentials.get({ publicKey: { challenge: dec(options.challenge), rpId: options.rpId, allowCredentials: options.allowCredentials.map((item) => ({ type: item.type, id: dec(item.id) })), userVerification: "required", timeout: options.timeout } });
    const finish = await post("/m/api/auth/finish", { ticket: data.ticket, credential: credentialJSON(credential) });
    if (finish.status !== 200) return notice(messageFor(finish.data, "The passkey was not accepted."), "error");
    retry = 1000;
    await boot();
  } catch {
    notice("The passkey prompt was closed. Use your passkey to continue.", "error");
  }
}

function openStream() {
  closeStream();
  source = new EventSource("/m/api/events");
  source.addEventListener("open", () => { retry = 1000; pill("live", "Live"); });
  source.addEventListener("state", () => void refresh());
  source.addEventListener("revoked", () => { closeStream(); connectScreen(); notice("Remote control was turned off, or this phone was replaced, on the desktop.", "error"); });
  source.addEventListener("error", () => {
    if (source && source.readyState === EventSource.CLOSED) return;
    pill("reconnecting", "Reconnecting");
    closeStream(true);
    setTimeout(boot, retry);
    retry = Math.min(retry * 2, 30000);
  });
}

function closeStream(keep) { if (source) source.close(); source = null; if (!keep) retry = 1000; }

async function refresh() {
  const response = await fetch("/m/api/state", { credentials: "same-origin" });
  if (response.status === 401) return connectScreen();
  if (!response.ok) return;
  const previous = state;
  state = await response.json();
  const top = state.moves[0]?.intent_id ?? null;
  const scrolled = window.scrollY > 240;
  render();
  if (previous && top !== lastTop && scrolled) $("jump").hidden = false;
  if (previous) {
    const stillThere = new Set(state.decisions.map((move) => move.approval_id));
    for (const move of previous.decisions) {
      if (!stillThere.has(move.approval_id) && !pending.has(move.approval_id)) notice("Already decided on the desktop.");
    }
    for (const approval of [...pending]) if (!stillThere.has(approval)) pending.delete(approval);
  }
  lastTop = top;
}

const DONE = {
  Case: "Case opened.",
  Commit: "Committed. SEA-Forge's ruling is in the receipt below.",
  Approved: "Approved. SEA-Forge's ruling is in the receipt below.",
  Rejected: "Rejected. The receipt below records it.",
};

async function command(body, label) {
  const sent = await post("/m/api/command", { command_id: uuid(), ...body });
  if (sent.status === 401) return connectScreen();
  const outcome = sent.data.outcome || {};
  if (outcome.state === "refused") notice(outcome.message || "Refused.", "error");
  else if (outcome.state === "waiting") notice("SEA-Forge is holding this for your approval on the desktop.");
  else notice(DONE[label] || label + ". The receipt is below.");
  await refresh();
  return sent.data;
}

function claim(title, claimValue) {
  return el("div", {}, el("dt", { text: title }), el("dd", { text: claimValue ? claimValue.text : "" }));
}

function receiptList(move) {
  return el("dl", {},
    claim("Decided", move.decided),
    claim("Recorded", move.recorded),
    claim("Observed", move.observed),
    claim("Settlement", move.settlement),
  );
}

function renderCase(open) {
  const box = $("case");
  box.replaceChildren();
  box.append(el("h2", { text: "Open case" }));
  if (open) {
    box.append(el("p", { text: open.purpose }), el("p", { class: "muted", text: "Opened " + new Date(open.opened_at).toLocaleString() }));
    return;
  }
  const input = el("input", { type: "text", maxlength: "200", "aria-label": "Purpose of the case", placeholder: "What is this case for?" });
  const button = el("button", { class: "primary", text: "Open a case", on: async () => {
    const purpose = input.value.trim();
    if (purpose === "") return notice("Write the purpose in one line.", "error");
    await command({ kind: "open_case", purpose }, "Case");
  } });
  box.append(el("div", { class: "row" }, input), el("p", {}), button);
}

function renderDecisions(items) {
  const box = $("decisions");
  box.replaceChildren(el("h2", { text: "Needs your decision" }));
  if (items.length === 0) return box.append(el("p", { class: "muted", text: "Nothing is waiting for you." }));
  for (const move of items) {
    const card = el("div", { class: "card" });
    card.append(el("p", { text: move.operation_ref }), el("p", { class: "muted", text: move.decided.text }));
    if (pending.has(move.approval_id)) {
      card.append(el("p", { class: "muted", text: "Sent, waiting for SEA-Forge." }));
    } else {
      const actions = el("div", { class: "row" });
      const approve = el("button", { class: "primary", text: "Approve", on: () => confirmAction(card, "approve", move, "Approve this commit? SEA-Forge records it and the desktop shows the receipt.") });
      const reject = el("button", { class: "danger", text: "Reject", on: () => confirmAction(card, "reject", move, "Reject this commit? It fails and nothing is committed.") });
      actions.append(approve, reject);
      card.append(actions);
    }
    box.append(card);
  }
}

function confirmAction(card, kind, move, question) {
  const row = el("div", { class: "row" }, el("p", { class: "muted", text: question }));
  row.append(
    el("button", { class: kind === "reject" ? "danger" : "primary", text: kind === "approve" ? "Confirm approve" : "Confirm reject", on: async () => {
      pending.add(move.approval_id);
      row.remove();
      card.append(el("p", { class: "muted", text: "Sent, waiting for SEA-Forge." }));
      await command({ kind, approval_id: move.approval_id }, kind === "approve" ? "Approved" : "Rejected");
      pending.delete(move.approval_id);
    } }),
    el("button", { text: "Cancel", on: () => row.remove() }),
  );
  card.append(row);
}

function renderMoves(moves) {
  const box = $("moves");
  box.replaceChildren(el("h2", { text: "Your governed moves" }));
  if (moves.length === 0) return box.append(el("p", { class: "muted", text: "No moves yet on this desktop." }));
  for (const move of moves) {
    const item = el("details");
    item.append(el("summary", { text: move.operation_ref + " · " + move.decided.text }));
    item.append(receiptList(move));
    if (move.settleable) {
      item.append(el("button", { text: "Observe and settle", on: () => command({ kind: "settle", intent_id: move.intent_id }, "Settlement") }));
    }
    box.append(item);
  }
}

function renderActions(actions, frame) {
  const box = $("actions");
  box.replaceChildren(el("h2", { text: "Move forward" }));
  if (actions.length === 0) return box.append(el("p", { class: "muted", text: "No move is available right now." }));
  for (const action of actions) {
    const card = el("div", { class: "card" }, el("p", { text: action.label }), el("p", { class: "muted", text: action.consequential ? "Consequential: SEA-Forge decides before anything is recorded." : "Reads only." }));
    card.append(el("button", { class: "primary", text: "Commit", on: () => {
      const row = el("div", { class: "row" }, el("p", { class: "muted", text: "Commit " + action.label + "? The desktop shows the outcome." }));
      row.append(
        el("button", { class: "primary", text: "Confirm commit", on: async () => {
          row.remove();
          await command({ kind: "commit", frame_id: frame.frame_id, frame_revision: frame.revision, action_id: action.action_id }, "Commit");
        } }),
        el("button", { text: "Cancel", on: () => row.remove() }),
      );
      card.append(row);
    } }));
    box.append(card);
  }
}

function render() {
  const device = state.device;
  $("status").textContent = state.status ? "World " + state.status.world + " · SEA-Forge " + (state.status.governed ? "governing" : "off") + " · RealityTrace " + (state.status.realitytrace ? "observing" : "off") : "";
  renderCase(state.open_case);
  renderDecisions(state.decisions);
  renderMoves(state.moves);
  renderActions(state.actions, state.frame);
  $("settings-device").textContent = device ? device.label : "Not known";
  $("settings-paired").textContent = device ? new Date(device.paired_at).toLocaleString() : "";
  $("settings-seen").textContent = device && device.last_seen ? new Date(device.last_seen).toLocaleString() : "";
}

$("jump").addEventListener("click", () => { window.scrollTo({ top: 0, behavior: "auto" }); $("jump").hidden = true; });
$("sign-in").addEventListener("click", signIn);
$("signout").addEventListener("click", async () => {
  await post("/m/api/signout", {});
  closeStream();
  state = null;
  connectScreen();
  notice("Signed out on this phone. Use your passkey to sign in again.");
});
$("settings-toggle").addEventListener("click", () => { const panel = $("settings"); panel.hidden = !panel.hidden; });
boot();
`;

export function phonePage(nonce: string): string {
  const body = `<header>
<h1>Horizon</h1>
<p id="pill" class="pill" role="status" aria-live="polite" data-state="offline">Connecting…</p>
</header>
<main id="app" tabindex="-1">
<p id="notice" class="notice" aria-live="polite"></p>
<section id="connect" hidden>
<h2>Connect to Horizon</h2>
<p>Use your passkey to continue.</p>
<p><button id="sign-in" class="primary" type="button">Use your passkey</button></p>
</section>
<section id="off" hidden><h2>Remote control is off</h2><p id="off-text" class="muted"></p></section>
<section id="home" hidden>
<p id="status" class="muted"></p>
<div id="case"></div>
<div id="decisions"></div>
<div id="moves"></div>
<div id="actions"></div>
<p><button id="settings-toggle" type="button">This phone</button></p>
<section id="settings" class="card" hidden>
<p>Device: <span id="settings-device"></span></p>
<p>Paired at: <span id="settings-paired"></span></p>
<p>Last seen: <span id="settings-seen"></span></p>
<p class="muted">Stop and Replace live on the desktop. Signing out here does not turn remote control off.</p>
<p><button id="signout" class="danger" type="button">Sign out on this phone</button></p>
</section>
<button id="jump" class="jump primary" type="button" hidden>Jump to latest</button>
</section>
</main>`;
  return shell(nonce, "Horizon remote", body, PHONE_SCRIPT);
}

const PAIR_SCRIPT = `
${SHARED}
const $ = (id) => document.getElementById(id);
const say = (text, kind) => { $("notice").textContent = text; $("notice").dataset.kind = kind || ""; };
let secret = null;
const fragment = new URLSearchParams(location.hash.slice(1));
secret = fragment.get("p");
// The secret leaves the address bar before anything else runs, so it never reaches history or a referrer.
history.replaceState(null, "", "/m/pair");

async function pair() {
  if (!window.PublicKeyCredential || !navigator.credentials) return say("Passkeys are not available in this browser.", "error");
  if (!secret) return say("This link is incomplete. Scan the QR on your desktop again.", "error");
  const value = secret;
  secret = null;
  say("Preparing…");
  const redeemed = await post("/m/api/pair/redeem", { secret: value });
  if (redeemed.status !== 200) return say(messageFor(redeemed.data, "This link is not valid."), "error");
  say("Use your passkey to continue.");
  await create(redeemed.data);
}

// The redeemed ticket stays valid for two minutes, so a closed or refused prompt (Safari refuses
// one that no tap started) is retried with a button instead of a new scan.
async function create(redeemed) {
  try {
    const options = redeemed.options;
    const credential = await navigator.credentials.create({ publicKey: {
      challenge: dec(options.challenge),
      rp: options.rp,
      user: { id: dec(options.user.id), name: options.user.name, displayName: options.user.displayName },
      pubKeyCredParams: options.pubKeyCredParams,
      authenticatorSelection: options.authenticatorSelection,
      attestation: "none",
      timeout: options.timeout,
    } });
    const finished = await post("/m/api/pair/finish", { ticket: redeemed.ticket, credential: credentialJSON(credential) });
    if (finished.status !== 200) return say(messageFor(finished.data, "The passkey could not be registered."), "error");
    location.replace("/m");
  } catch {
    say("The passkey prompt was closed.", "error");
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "primary";
    retry.textContent = "Create passkey";
    retry.addEventListener("click", () => { retry.remove(); say("Use your passkey to continue."); void create(redeemed); }, { once: true });
    $("app").append(retry);
    retry.focus();
  }
}

pair();
`;

export function pairPage(nonce: string): string {
  const body = `<header><h1>Horizon</h1></header>
<main id="app" tabindex="-1">
<section class="card">
<h2>Create a passkey for Horizon</h2>
<p>This phone will prove it is you with a passkey each time you open remote control. The link only lets you create that passkey once.</p>
</section>
<p id="notice" class="notice" aria-live="polite"></p>
</main>`;
  return shell(nonce, "Horizon remote: pair", body, PAIR_SCRIPT);
}

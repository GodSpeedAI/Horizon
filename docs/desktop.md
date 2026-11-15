# Horizon desktop and headless server

Horizon runs in two modes that share one server binary.

| Mode | What runs | Use |
| --- | --- | --- |
| Headless | `horizon-server serve ...` (or `bun run src/main.ts`) | Services, CI, agents, a browser on the same machine |
| Desktop | The Tauri shell, which starts `horizon-server` beside it and shows its desk in a native window | A person at a workstation |

The Rust shell (`src-tauri/`) holds no Horizon logic. It starts the server, waits for it, opens the window on it, reports if it
stops, and stops it on exit. `src-tauri/supervisor/` is that supervisor, with its own tests and no Tauri dependency.

## The server binary

`bun run build:sidecar` compiles `src/main.ts` with `bun build --compile` for this host and writes, under `.tmp/sidecar/<triple>/`:

- `horizon-server` (`.exe` on Windows)
- `horizon-resources/`: `config/`, `domain/`, `contracts/`, `dist/desk/`. The server only reads it.

It also stages `src-tauri/binaries/horizon-server-<triple>` (Tauri's `externalBin` name) and `.tmp/desktop/horizon-resources`.
Builds are native: the target must be the machine you build on.

### Headless use

```
horizon-server serve [--port N] [--resources DIR] [--data DIR] [--desktop]
```

- `--port N`: `0` picks a free port. Without it, the configured port (4319) is used. The server binds `127.0.0.1` only.
- `--resources DIR`: the resource tree. Defaults to `HORIZON_RESOURCE_ROOT`, then a `horizon-resources` folder beside the binary
  (the headless tarball layout), then the current directory (a repository checkout).
- `--data DIR`: where the store, launch secret and agent key live (`HORIZON_DATA_DIR`). Defaults to the platform data folder
  (`~/.local/share/horizon`, `~/Library/Application Support/Horizon`, `%APPDATA%\Horizon`) when a resource tree is in use.
  `HORIZON_STORE`, `HORIZON_SECRET_FILE`, `HORIZON_AGENT_KEY_FILE` and `HORIZON_CONFIG` still win if set.
- Run with no verb (`horizon-server`, or `bun run dev`) for the unchanged default server. Pairing then works as before: the code is
  shown on the controlling terminal.

The headless tarball is `horizon-server` plus `horizon-resources/`: unpack it and run `./horizon-server serve`. It is not a single
file, because the semantic world and contracts are read from disk.

### Desktop protocol and authentication

Horizon already authenticates the desk with a one-time pairing code that buys a session cookie (`src/desk/pairing.ts`). The desktop
mode reuses that model; it adds no second credential.

With `--desktop` the server:

1. listens on `127.0.0.1` on an OS-chosen port;
2. prints one stdout line, `horizon-desktop-ready {"url":"http://127.0.0.1:PORT","code":"XXXX-XXXX","pid":N}`, to the pipe only the
   shell holds, instead of showing the code on a terminal;
3. adds no route: the shell loads `/desk` in the window and, once it has loaded, makes the request a person would make by typing
   the code, `POST /desk/pair`. The single-use code buys the ordinary session cookie (HttpOnly, SameSite=Strict) and the page
   moves on to `/workspace`. If that hand-over fails, the desk's own pairing prompt is still there;
4. exits when its stdin closes, so a shell that dies for any reason cannot leave it running.

Every route except `/health` and the desk's static bundle refuses a request without that session. Host, Origin and Sec-Fetch-Site are
still checked. The webview gets no Tauri IPC permissions for the loopback page.

Limit: reserved operations that ask for confirmation "on the Horizon terminal" (`horizon confirm`) have no terminal in desktop mode and
are refused with their usual words. A settings UI is out of scope.

## Configuring integrations

The shell passes the user's environment through to the server unchanged. Set these before starting the app, or in the service
definition for headless use:

- `DOMAINFORGE_BIN`, `REALITYTRACE_BIN`, `SEA_FORGE_SERVER_BIN`, `SEA_FORGE_ROOT`, `SEA_FORGE_SOCKET`
- `HORIZON_*` (config, store, setup, economics) and `COGNATE_*`

The shell itself reads only `HORIZON_SERVER_BIN` (use another server binary), `HORIZON_RESOURCE_ROOT` and `HORIZON_DATA_DIR`
(skip passing its own `--resources` / `--data`). A GUI-launched app does not read your shell profile on macOS and Linux; set variables
where the desktop environment reads them, or start the app from a terminal.

## Building the desktop app

```
just desktop-build        # bun run build:sidecar, then tauri build
```

Needs Bun 1.4.0, a Rust toolchain (1.90 or newer) and the platform's Tauri prerequisites (on Linux, `libwebkit2gtk-4.1-dev` and the
packages listed in `.github/workflows/desktop.yml`). `just desktop-supervisor-test` runs the supervisor tests, which need none of them.

Building copies the resource tree (with its `.sea` files) under `src-tauri/target/`, which `just boundaries` rejects as a second semantic model: run `just verify` before a desktop build, or delete `src-tauri/target` first.

CI (`.github/workflows/desktop.yml`) builds, per platform: Windows x64 (NSIS, MSI), Linux x64 and arm64 (`.deb`, AppImage), macOS
arm64 and Intel (`.app`, `.dmg`), and a headless tarball per target, each with `SHA256SUMS`. Every leg smokes the built server:
start, health, open a session with the one-time code, read the desk, stop.

## What is and is not qualified

Everything this workflow produces is an **unqualified CI build**:

- not signed (macOS bundles are ad-hoc signed because Apple Silicon requires a signature to run; Windows has no signing configured);
- not installed, upgraded or uninstalled on a clean machine (WP-67), and the desktop window itself is not exercised by CI;
- not published, tagged or attached to a release;
- Jetson and other real-hardware targets are not covered.

An unqualified artifact must not be presented as a release.

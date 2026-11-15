//! Horizon desktop: a thin shell. It starts the Horizon server beside it, waits for it to be healthy, points the window at it,
//! tells the person if it stops, and stops it when the window closes. The server, its pairing and everything it shows are the
//! Bun sidecar's; nothing about Horizon lives here.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use horizon_supervisor::{Sidecar, SidecarSpec};
use tauri::webview::PageLoadEvent;
use tauri::{Manager, RunEvent, WebviewWindow};

type Shared = Arc<Mutex<Option<Sidecar>>>;
/// The desk page's address and the one-time code that pairs it, held until that page has loaded.
type Handoff = Arc<Mutex<Option<(String, String)>>>;

/// Settings the user may give through their own environment, passed to the sidecar unchanged by inheritance:
/// DOMAINFORGE_BIN, REALITYTRACE_BIN, SEA_FORGE_SERVER_BIN, SEA_FORGE_SOCKET, HORIZON_* and COGNATE_*.
/// The shell reads only these two, which locate the server itself.
const SERVER_OVERRIDE: &str = "HORIZON_SERVER_BIN";
const RESOURCE_OVERRIDE: &str = "HORIZON_RESOURCE_ROOT";
const DATA_OVERRIDE: &str = "HORIZON_DATA_DIR";

fn main() {
    let shared: Shared = Arc::new(Mutex::new(None));
    let handoff: Handoff = Arc::new(Mutex::new(None));
    let on_load = Arc::clone(&handoff);
    let app = tauri::Builder::default()
        .manage(Arc::clone(&shared))
        .manage(Arc::clone(&handoff))
        .on_page_load(move |webview, payload| {
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            let mut pending = on_load.lock().unwrap_or_else(|e| e.into_inner());
            // Pair only the desk page the sidecar served, once: the same request a person makes by typing the code.
            if pending.as_ref().is_some_and(|(page, _)| payload.url().as_str() == page) {
                if let Some((_, code)) = pending.take() {
                    let code = serde_json::to_string(&code).unwrap_or_default();
                    let _ = webview.eval(format!(
                        "fetch('/desk/pair',{{method:'POST',headers:{{'content-type':'application/json'}},body:JSON.stringify({{code:{code}}})}}).then(function(r){{if(r.ok)location.replace('/workspace');}});"
                    ));
                }
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();
            let shared = Arc::clone(app.state::<Shared>().inner());
            let handoff = Arc::clone(app.state::<Handoff>().inner());
            thread::spawn(move || boot(handle, shared, handoff));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the Horizon desktop shell");
    app.run(move |_handle, event| {
        if let RunEvent::Exit = event {
            if let Some(mut sidecar) = shared.lock().unwrap_or_else(|e| e.into_inner()).take() {
                sidecar.stop();
            }
        }
    });
}

fn boot(app: tauri::AppHandle, shared: Shared, handoff: Handoff) {
    let Some(window) = app.get_webview_window("main") else { return };
    let spec = match spec_for(&app) {
        Ok(spec) => spec,
        Err(message) => return show_error(&window, &message),
    };
    match Sidecar::start(&spec) {
        Ok(sidecar) => {
            let desk = sidecar.desk_url();
            *handoff.lock().unwrap_or_else(|e| e.into_inner()) = Some((desk.clone(), sidecar.pairing_code().to_string()));
            *shared.lock().unwrap_or_else(|e| e.into_inner()) = Some(sidecar);
            match desk.parse() {
                Ok(url) => {
                    if let Err(error) = window.navigate(url) {
                        show_error(&window, &format!("could not open the Horizon desk: {error}"));
                    }
                }
                Err(error) => show_error(&window, &format!("the Horizon server gave an address the window cannot open: {error}")),
            }
            watch(&window, &shared);
        }
        Err(error) => show_error(&window, &error.to_string()),
    }
}

/// Reports a server that stops while the window is open. The window then says so instead of going quietly dead.
fn watch(window: &WebviewWindow, shared: &Shared) {
    loop {
        thread::sleep(Duration::from_millis(500));
        let mut guard = shared.lock().unwrap_or_else(|e| e.into_inner());
        let Some(sidecar) = guard.as_mut() else { return };
        if let Some(info) = sidecar.try_exit() {
            drop(guard);
            return show_error(window, &info.to_string());
        }
    }
}

fn spec_for(app: &tauri::AppHandle) -> Result<SidecarSpec, String> {
    let program = match std::env::var_os(SERVER_OVERRIDE) {
        Some(path) => PathBuf::from(path),
        None => locate_server(app)?,
    };
    if !program.is_file() {
        return Err(format!("the Horizon server is missing: {} does not exist. Reinstall Horizon, or set {SERVER_OVERRIDE}.", program.display()));
    }
    let mut spec = SidecarSpec::new(program);
    let mut args: Vec<OsString> = vec!["serve".into(), "--desktop".into(), "--port".into(), "0".into()];
    if std::env::var_os(RESOURCE_OVERRIDE).is_none() {
        let resources = app.path().resource_dir().map_err(|e| format!("cannot locate Horizon's resources: {e}"))?.join("horizon-resources");
        args.push("--resources".into());
        args.push(plain(&resources).into());
    }
    if std::env::var_os(DATA_OVERRIDE).is_none() {
        let data = app.path().app_data_dir().map_err(|e| format!("cannot locate Horizon's data folder: {e}"))?;
        args.push("--data".into());
        args.push(plain(&data).into());
    }
    spec.args = args;
    Ok(spec)
}

/// macOS and Windows bundles put the server beside the executable (Tauri's externalBin).
#[cfg(not(target_os = "linux"))]
fn locate_server(_app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("cannot locate this application: {e}"))?;
    let name = if cfg!(windows) { "horizon-server.exe" } else { "horizon-server" };
    Ok(exe.parent().ok_or("cannot locate this application's folder")?.join(name))
}

/// Linux bundles carry the server gzipped in the resource folder: linuxdeploy (AppImage) cannot inspect a compiled Bun
/// executable, so it must not look like one inside the bundle. It is unpacked once into the app data folder.
#[cfg(target_os = "linux")]
fn locate_server(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use std::os::unix::fs::PermissionsExt;
    let packed = app.path().resource_dir().map_err(|e| format!("cannot locate Horizon's resources: {e}"))?.join("server").join("horizon-server.gz");
    let size = std::fs::metadata(&packed).map_err(|e| format!("the Horizon server is missing ({}): {e}", packed.display()))?.len();
    let dir = app.path().app_data_dir().map_err(|e| format!("cannot locate Horizon's data folder: {e}"))?.join("server");
    let out = dir.join(format!("horizon-server-{size}"));
    if out.is_file() {
        return Ok(out);
    }
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
    let part = dir.join(format!("horizon-server-{size}.part"));
    let unpack = || -> std::io::Result<()> {
        let mut decoder = flate2::read::GzDecoder::new(std::fs::File::open(&packed)?);
        let mut file = std::fs::File::create(&part)?;
        std::io::copy(&mut decoder, &mut file)?;
        std::fs::set_permissions(&part, std::fs::Permissions::from_mode(0o755))?;
        std::fs::rename(&part, &out)
    };
    unpack().map_err(|e| format!("could not unpack the Horizon server into {}: {e}", dir.display()))?;
    Ok(out)
}

/// Windows paths from the OS may carry the `\\?\` verbatim prefix, which the sidecar's runtime does not need.
fn plain(path: &Path) -> OsString {
    let text = path.as_os_str().to_string_lossy();
    match text.strip_prefix(r"\\?\") {
        Some(rest) => rest.into(),
        None => path.as_os_str().to_owned(),
    }
}

/// Replaces whatever the window shows with the message. Works on the local start page and on a page the server served.
fn show_error(window: &WebviewWindow, message: &str) {
    eprintln!("horizon-desktop: {message}");
    let text = serde_json::to_string(message).unwrap_or_else(|_| "\"Horizon could not start.\"".to_string());
    let script = format!(
        "(function(m){{var d=document;d.title='Horizon';var b=d.body||d.documentElement;b.replaceChildren();\
         var w=d.createElement('div');w.style.cssText='font:16px/1.5 system-ui,sans-serif;max-width:46rem;margin:12vh auto;padding:0 24px';\
         var h=d.createElement('h1');h.textContent='Horizon is not running';\
         var p=d.createElement('pre');p.style.cssText='white-space:pre-wrap;word-break:break-word';p.textContent=m;\
         w.appendChild(h);w.appendChild(p);b.appendChild(w);}})({text});"
    );
    let _ = window.eval(&script);
}

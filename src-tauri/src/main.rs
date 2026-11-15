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
use tauri::{Manager, RunEvent, WebviewWindow};

type Shared = Arc<Mutex<Option<Sidecar>>>;

/// Settings the user may give through their own environment, passed to the sidecar unchanged by inheritance:
/// DOMAINFORGE_BIN, REALITYTRACE_BIN, SEA_FORGE_SERVER_BIN, SEA_FORGE_SOCKET, HORIZON_* and COGNATE_*.
/// The shell reads only these two, which locate the server itself.
const SERVER_OVERRIDE: &str = "HORIZON_SERVER_BIN";
const RESOURCE_OVERRIDE: &str = "HORIZON_RESOURCE_ROOT";
const DATA_OVERRIDE: &str = "HORIZON_DATA_DIR";

fn main() {
    let shared: Shared = Arc::new(Mutex::new(None));
    let app = tauri::Builder::default()
        .manage(Arc::clone(&shared))
        .setup(|app| {
            let handle = app.handle().clone();
            let shared = Arc::clone(app.state::<Shared>().inner());
            thread::spawn(move || boot(handle, shared));
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

fn boot(app: tauri::AppHandle, shared: Shared) {
    let Some(window) = app.get_webview_window("main") else { return };
    let spec = match spec_for(&app) {
        Ok(spec) => spec,
        Err(message) => return show_error(&window, &message),
    };
    match Sidecar::start(&spec) {
        Ok(sidecar) => {
            let launch = sidecar.launch_url();
            *shared.lock().unwrap_or_else(|e| e.into_inner()) = Some(sidecar);
            match launch.parse() {
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
        None => {
            let exe = std::env::current_exe().map_err(|e| format!("cannot locate this application: {e}"))?;
            let dir = exe.parent().ok_or("cannot locate this application's folder")?;
            dir.join(if cfg!(windows) { "horizon-server.exe" } else { "horizon-server" })
        }
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

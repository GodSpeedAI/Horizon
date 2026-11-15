//! The supervisor against a stub sidecar: start and health, clean stop, crash visibility, timeouts, and no orphans.

use horizon_supervisor::{http_status, Sidecar, SidecarError, SidecarSpec};
use std::time::{Duration, Instant};

fn spec(mode: &str) -> SidecarSpec {
    let mut spec = SidecarSpec::new(env!("CARGO_BIN_EXE_stub-sidecar"));
    spec.args = vec![mode.into()];
    spec.ready_timeout = Duration::from_secs(10);
    spec.health_timeout = Duration::from_secs(5);
    spec.stop_grace = Duration::from_millis(500);
    spec
}

fn wait_for<F: FnMut() -> bool>(mut done: F, within: Duration) -> bool {
    let end = Instant::now() + within;
    while Instant::now() < end {
        if done() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    done()
}

fn number_after(log: &str, key: &str) -> u32 {
    log.lines().find_map(|l| l.strip_prefix(key)).and_then(|rest| rest.trim().parse().ok()).unwrap_or_else(|| panic!("no '{key}' line in log: {log}"))
}

#[cfg(unix)]
fn running(pid: u32) -> bool {
    // A zombie is dead; nothing waits for it only when its parent is gone and init is slow to reap.
    if let Ok(stat) = std::fs::read_to_string(format!("/proc/{pid}/stat")) {
        if let Some(state) = stat.rsplit(')').next().and_then(|rest| rest.trim().chars().next()) {
            return state != 'Z';
        }
    }
    unsafe { libc::kill(pid as libc::pid_t, 0) == 0 }
}

fn port_closed(url: &str) -> bool {
    wait_for(|| http_status(url, "/health").is_none(), Duration::from_secs(5))
}

#[test]
fn starts_waits_for_health_and_stops_cleanly() {
    let mut sidecar = Sidecar::start(&spec("ok")).expect("start");
    assert!(sidecar.url().starts_with("http://127.0.0.1:"));
    assert_eq!(sidecar.desk_url(), format!("{}/desk", sidecar.url()));
    assert_eq!(sidecar.pairing_code(), "ABCD-2345");
    assert_eq!(http_status(sidecar.url(), "/health"), Some(200));
    assert!(sidecar.try_exit().is_none(), "a healthy sidecar has not exited");
    let url = sidecar.url().to_string();
    let started = Instant::now();
    sidecar.stop();
    assert!(started.elapsed() < Duration::from_secs(5), "stdin close lets it leave without waiting out the grace");
    assert!(port_closed(&url), "the port is closed after stop");
    sidecar.stop(); // twice is safe
}

#[test]
fn the_one_time_code_is_never_in_the_log() {
    let sidecar = Sidecar::start(&spec("ok")).expect("start");
    assert!(!sidecar.recent_log().contains("ABCD-2345"));
}

#[test]
fn a_crash_after_ready_is_visible_with_its_last_words() {
    let mut sidecar = Sidecar::start(&spec("crash")).expect("start");
    let mut info = None;
    assert!(wait_for(|| { info = sidecar.try_exit(); info.is_some() }, Duration::from_secs(5)), "the crash is noticed");
    let info = info.unwrap();
    assert!(!info.success);
    assert!(info.status.contains('3'), "status names the exit code: {}", info.status);
    assert!(info.log.contains("fatal: store is locked"), "log: {}", info.log);
    assert!(info.to_string().contains("stopped unexpectedly"));
}

#[test]
fn exiting_before_ready_reports_what_it_printed() {
    match Sidecar::start(&spec("die-early")) {
        Err(SidecarError::ExitedBeforeReady { log, .. }) => assert!(log.contains("boom: config/horizon.toml is missing"), "log: {log}"),
        other => panic!("expected ExitedBeforeReady, got {:?}", other.map(|_| "a running sidecar")),
    }
}

#[test]
fn a_missing_binary_is_a_spawn_error() {
    let missing = SidecarSpec::new("/definitely/not/here/horizon-server");
    assert!(matches!(Sidecar::start(&missing), Err(SidecarError::Spawn { .. })));
}

#[test]
fn never_ready_times_out_and_the_process_is_gone() {
    let mut s = spec("hang");
    s.ready_timeout = Duration::from_millis(600);
    match Sidecar::start(&s) {
        Err(SidecarError::ReadyTimeout { log }) => {
            #[cfg(unix)]
            {
                let pid = number_after(&log, "pid ");
                assert!(wait_for(|| !running(pid), Duration::from_secs(5)), "the hung sidecar was killed");
            }
            #[cfg(not(unix))]
            let _ = log;
        }
        other => panic!("expected ReadyTimeout, got {:?}", other.map(|_| "a running sidecar")),
    }
}

#[test]
fn listening_but_unhealthy_times_out_and_the_process_is_gone() {
    let mut s = spec("unhealthy");
    s.health_timeout = Duration::from_millis(700);
    match Sidecar::start(&s) {
        Err(SidecarError::NotHealthy { log }) => {
            #[cfg(unix)]
            {
                let pid = number_after(&log, "pid ");
                assert!(wait_for(|| !running(pid), Duration::from_secs(5)), "the unhealthy sidecar was killed");
            }
            #[cfg(not(unix))]
            let _ = log;
        }
        other => panic!("expected NotHealthy, got {:?}", other.map(|_| "a running sidecar")),
    }
}

#[test]
fn a_sidecar_that_ignores_stdin_is_killed_after_the_grace() {
    let mut sidecar = Sidecar::start(&spec("ignore-stdin")).expect("start");
    let url = sidecar.url().to_string();
    let started = Instant::now();
    sidecar.stop();
    assert!(started.elapsed() >= Duration::from_millis(400), "it was given its grace first");
    assert!(sidecar.try_exit().is_some() || port_closed(&url));
    assert!(port_closed(&url));
}

#[cfg(unix)]
#[test]
fn no_orphan_survives_a_forced_stop() {
    let mut sidecar = Sidecar::start(&spec("grandchild-ignore")).expect("start");
    let grandchild = number_after(&sidecar.recent_log(), "grandchild-pid ");
    let child = sidecar.pid();
    assert!(running(grandchild) && running(child));
    sidecar.stop();
    assert!(wait_for(|| !running(grandchild), Duration::from_secs(5)), "the grandchild was killed with the group");
    assert!(wait_for(|| !running(child), Duration::from_secs(5)), "the sidecar itself is gone");
}

#[cfg(unix)]
#[test]
fn no_orphan_survives_a_graceful_stop() {
    let mut sidecar = Sidecar::start(&spec("grandchild")).expect("start");
    let grandchild = number_after(&sidecar.recent_log(), "grandchild-pid ");
    assert!(running(grandchild));
    sidecar.stop();
    assert!(wait_for(|| !running(grandchild), Duration::from_secs(5)), "the sidecar left by itself; its grandchild was still swept");
}

#[test]
fn dropping_the_supervisor_stops_the_sidecar() {
    let url = {
        let sidecar = Sidecar::start(&spec("ignore-stdin")).expect("start");
        sidecar.url().to_string()
    };
    assert!(port_closed(&url));
}

//! A thin supervisor for one sidecar process tree.
//!
//! It does four things and nothing else: spawn the sidecar, wait until it says where it listens and answers
//! `GET /health`, report if it dies, and stop it (and anything it started) when asked or dropped. What the
//! sidecar serves, who may read it and how it is paired are the sidecar's business, not this crate's.
//!
//! Protocol with the sidecar (`horizon serve --desktop`): one stdout line
//! `horizon-desktop-ready {"url":"http://127.0.0.1:PORT","code":"XXXX-XXXX","pid":N}`, then the sidecar exits
//! when its stdin closes. The shell holds the only write end of that stdin, so a shell that dies for any reason,
//! including SIGKILL, still stops the sidecar.

use std::collections::VecDeque;
use std::ffi::OsString;
use std::fmt;
use std::io::{self, BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

pub const READY_MARKER: &str = "horizon-desktop-ready";
const LOG_LINES: usize = 40;

/// How to run the sidecar and how long to wait for it.
#[derive(Clone, Debug)]
pub struct SidecarSpec {
    pub program: PathBuf,
    pub args: Vec<OsString>,
    /// Added to the inherited environment: the user's environment passes through unchanged.
    pub envs: Vec<(OsString, OsString)>,
    pub current_dir: Option<PathBuf>,
    /// From spawn to the ready line.
    pub ready_timeout: Duration,
    /// From the ready line to a `200` from `/health`.
    pub health_timeout: Duration,
    /// After stdin closes, how long the sidecar gets to exit by itself before its tree is killed.
    pub stop_grace: Duration,
}

impl SidecarSpec {
    pub fn new(program: impl Into<PathBuf>) -> Self {
        SidecarSpec {
            program: program.into(),
            args: Vec::new(),
            envs: Vec::new(),
            current_dir: None,
            ready_timeout: Duration::from_secs(60),
            health_timeout: Duration::from_secs(30),
            stop_grace: Duration::from_secs(8),
        }
    }
}

#[derive(Debug)]
pub enum SidecarError {
    Spawn { program: PathBuf, source: io::Error },
    ExitedBeforeReady { status: String, log: String },
    ReadyTimeout { log: String },
    BadReadyLine { line: String },
    NotHealthy { log: String },
}

impl fmt::Display for SidecarError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SidecarError::Spawn { program, source } => write!(f, "could not start the Horizon server ({}): {source}", program.display()),
            SidecarError::ExitedBeforeReady { status, log } => write!(f, "the Horizon server exited ({status}) before it was ready.{}", tail(log)),
            SidecarError::ReadyTimeout { log } => write!(f, "the Horizon server did not report that it was listening in time.{}", tail(log)),
            SidecarError::BadReadyLine { line } => write!(f, "the Horizon server's ready line could not be read: {line}"),
            SidecarError::NotHealthy { log } => write!(f, "the Horizon server was listening but did not answer its health check in time.{}", tail(log)),
        }
    }
}

impl std::error::Error for SidecarError {}

fn tail(log: &str) -> String {
    if log.trim().is_empty() {
        String::new()
    } else {
        format!("\n\nLast output:\n{}", log.trim_end())
    }
}

/// Why a running sidecar is no longer running.
#[derive(Clone, Debug)]
pub struct ExitInfo {
    pub status: String,
    pub success: bool,
    pub log: String,
}

impl fmt::Display for ExitInfo {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "the Horizon server stopped unexpectedly ({}).{}", self.status, tail(&self.log))
    }
}

type Log = Arc<Mutex<VecDeque<String>>>;

fn push(log: &Log, line: String) {
    let mut lines = log.lock().unwrap_or_else(|e| e.into_inner());
    if lines.len() == LOG_LINES {
        lines.pop_front();
    }
    lines.push_back(line);
}

fn text(log: &Log) -> String {
    let lines = log.lock().unwrap_or_else(|e| e.into_inner());
    lines.iter().cloned().collect::<Vec<_>>().join("\n")
}

/// A running, healthy sidecar. Dropping it stops it.
pub struct Sidecar {
    child: Child,
    stdin: Option<ChildStdin>,
    url: String,
    code: String,
    log: Log,
    stop_grace: Duration,
    exited: Option<ExitInfo>,
}

impl Sidecar {
    /// Spawns the sidecar and returns once it listens and `/health` answers 200. On any failure the sidecar's whole
    /// tree is stopped before the error is returned.
    pub fn start(spec: &SidecarSpec) -> Result<Sidecar, SidecarError> {
        let mut command = Command::new(&spec.program);
        command.args(&spec.args).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
        for (key, value) in &spec.envs {
            command.env(key, value);
        }
        if let Some(dir) = &spec.current_dir {
            command.current_dir(dir);
        }
        configure_group(&mut command);
        let mut child = command.spawn().map_err(|source| SidecarError::Spawn { program: spec.program.clone(), source })?;

        let log: Log = Arc::new(Mutex::new(VecDeque::new()));
        let (ready_tx, ready_rx) = mpsc::channel::<String>();
        if let Some(out) = child.stdout.take() {
            let log = Arc::clone(&log);
            thread::spawn(move || {
                for line in BufReader::new(out).lines().map_while(Result::ok) {
                    // The ready line carries the one-time code: it is handed over, never logged.
                    if line.starts_with(READY_MARKER) {
                        let _ = ready_tx.send(line);
                    } else {
                        eprintln!("[horizon-server] {line}");
                        push(&log, line);
                    }
                }
            });
        }
        if let Some(err) = child.stderr.take() {
            let log = Arc::clone(&log);
            thread::spawn(move || {
                for line in BufReader::new(err).lines().map_while(Result::ok) {
                    eprintln!("[horizon-server] {line}");
                    push(&log, line);
                }
            });
        }
        let stdin = child.stdin.take();
        let mut sidecar = Sidecar { child, stdin, url: String::new(), code: String::new(), log, stop_grace: spec.stop_grace, exited: None };

        match sidecar.await_ready(&ready_rx, spec) {
            Ok(()) => Ok(sidecar),
            Err(error) => {
                sidecar.stop();
                Err(error)
            }
        }
    }

    fn await_ready(&mut self, ready: &mpsc::Receiver<String>, spec: &SidecarSpec) -> Result<(), SidecarError> {
        let deadline = Instant::now() + spec.ready_timeout;
        let line = loop {
            match ready.recv_timeout(Duration::from_millis(50)) {
                Ok(line) => break line,
                Err(RecvTimeoutError::Timeout) | Err(RecvTimeoutError::Disconnected) => {}
            }
            if let Some(status) = self.child.try_wait().ok().flatten() {
                // Let the reader threads hand over what the sidecar printed as it died.
                thread::sleep(Duration::from_millis(150));
                return Err(SidecarError::ExitedBeforeReady { status: status.to_string(), log: text(&self.log) });
            }
            if Instant::now() >= deadline {
                return Err(SidecarError::ReadyTimeout { log: text(&self.log) });
            }
        };
        let (url, code) = parse_ready(&line)?;
        self.url = url;
        self.code = code;

        let deadline = Instant::now() + spec.health_timeout;
        loop {
            if http_status(&self.url, "/health") == Some(200) {
                return Ok(());
            }
            if let Some(status) = self.child.try_wait().ok().flatten() {
                thread::sleep(Duration::from_millis(150));
                return Err(SidecarError::ExitedBeforeReady { status: status.to_string(), log: text(&self.log) });
            }
            if Instant::now() >= deadline {
                return Err(SidecarError::NotHealthy { log: text(&self.log) });
            }
            thread::sleep(Duration::from_millis(100));
        }
    }

    /// `http://127.0.0.1:PORT`.
    pub fn url(&self) -> &str {
        &self.url
    }

    /// The desk page. It loads unpaired; the one-time code then pairs it through `POST /desk/pair`.
    pub fn desk_url(&self) -> String {
        format!("{}/desk", self.url)
    }

    /// The single-use pairing code the sidecar handed over. Never log it.
    pub fn pairing_code(&self) -> &str {
        &self.code
    }

    pub fn pid(&self) -> u32 {
        self.child.id()
    }

    /// The last lines the sidecar printed (the ready line excluded).
    pub fn recent_log(&self) -> String {
        text(&self.log)
    }

    /// `Some` once the sidecar has exited on its own (a crash, or something else stopped it). Never blocks.
    pub fn try_exit(&mut self) -> Option<ExitInfo> {
        if let Some(info) = &self.exited {
            return Some(info.clone());
        }
        let status = self.child.try_wait().ok().flatten()?;
        thread::sleep(Duration::from_millis(100));
        let info = ExitInfo { status: status.to_string(), success: status.success(), log: text(&self.log) };
        self.exited = Some(info.clone());
        Some(info)
    }

    /// Closes the sidecar's stdin, gives it `stop_grace` to exit, then kills its whole process tree. Safe to call twice.
    pub fn stop(&mut self) {
        drop(self.stdin.take());
        let deadline = Instant::now() + self.stop_grace;
        while self.child.try_wait().ok().flatten().is_none() && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(50));
        }
        // Whether or not the sidecar left by itself, nothing it started may outlive it.
        kill_tree(&mut self.child);
        let _ = self.child.wait();
    }
}

impl Drop for Sidecar {
    fn drop(&mut self) {
        self.stop();
    }
}

fn parse_ready(line: &str) -> Result<(String, String), SidecarError> {
    let bad = || SidecarError::BadReadyLine { line: "(withheld: it carries a one-time code)".to_string() };
    let json = line.strip_prefix(READY_MARKER).map(str::trim).ok_or_else(bad)?;
    let value: serde_json::Value = serde_json::from_str(json).map_err(|_| bad())?;
    let url = value.get("url").and_then(|v| v.as_str()).ok_or_else(bad)?;
    let code = value.get("code").and_then(|v| v.as_str()).ok_or_else(bad)?;
    // Only a loopback address is ever handed to a webview.
    let host = url.strip_prefix("http://").ok_or_else(bad)?;
    if !(host.starts_with("127.0.0.1:") || host.starts_with("localhost:") || host.starts_with("[::1]:")) {
        return Err(bad());
    }
    if !code.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(bad());
    }
    Ok((url.trim_end_matches('/').to_string(), code.to_string()))
}

/// The status code of `GET path` on a `http://host:port` URL, or None when nothing answers. Plain HTTP/1.1 over one socket.
pub fn http_status(base: &str, path: &str) -> Option<u16> {
    let authority = base.strip_prefix("http://")?.trim_end_matches('/');
    let addr: SocketAddr = authority.to_socket_addrs().ok()?.next()?;
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(500)).ok()?;
    stream.set_read_timeout(Some(Duration::from_secs(2))).ok()?;
    stream.set_write_timeout(Some(Duration::from_secs(2))).ok()?;
    write!(stream, "GET {path} HTTP/1.1\r\nHost: {authority}\r\nConnection: close\r\n\r\n").ok()?;
    let mut head = [0u8; 16];
    stream.read_exact(&mut head).ok()?;
    let line = std::str::from_utf8(&head).ok()?;
    line.get(9..12)?.parse().ok()
}

#[cfg(unix)]
fn configure_group(command: &mut Command) {
    use std::os::unix::process::CommandExt;
    // Its own process group: one signal reaches the sidecar and everything it starts.
    command.process_group(0);
}

#[cfg(windows)]
fn configure_group(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(any(unix, windows)))]
fn configure_group(_command: &mut Command) {}

#[cfg(unix)]
fn kill_tree(child: &mut Child) {
    // The group id is the child's pid. Group first (the sidecar and its children), then the pid itself in case it left the group.
    let pid = child.id() as libc::pid_t;
    unsafe {
        libc::killpg(pid, libc::SIGKILL);
        libc::kill(pid, libc::SIGKILL);
    }
}

#[cfg(windows)]
fn kill_tree(child: &mut Child) {
    // `/T` takes the sidecar's descendants with it. Windows has no process group to signal without a job object.
    let _ = Command::new("taskkill").args(["/PID", &child.id().to_string(), "/T", "/F"]).stdout(Stdio::null()).stderr(Stdio::null()).status();
    let _ = child.kill();
}

#[cfg(not(any(unix, windows)))]
fn kill_tree(child: &mut Child) {
    let _ = child.kill();
}

//! A stand-in for `horizon serve --desktop`, driven by its first argument. Test support only.
//!
//! modes: ok | unhealthy | crash | die-early | hang | ignore-stdin | grandchild | sleeper

use std::io::{Read, Write};
use std::net::TcpListener;
use std::process::{exit, Command, Stdio};
use std::thread;
use std::time::Duration;

fn main() {
    let mode = std::env::args().nth(1).unwrap_or_else(|| "ok".to_string());
    match mode.as_str() {
        "die-early" => {
            eprintln!("boom: config/horizon.toml is missing");
            exit(2);
        }
        "hang" => {
            println!("pid {}", std::process::id());
            let _ = std::io::stdout().flush();
            thread::sleep(Duration::from_secs(600));
            return;
        }
        "sleeper" => {
            thread::sleep(Duration::from_secs(600));
            return;
        }
        _ => {}
    }

    let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
    let port = listener.local_addr().unwrap().port();
    let healthy = mode != "unhealthy";
    thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let mut stream = stream;
            let mut buffer = [0u8; 512];
            let _ = stream.read(&mut buffer);
            let (status, body) = if healthy { ("200 OK", "{\"ok\":true}") } else { ("503 Service Unavailable", "{\"ok\":false}") };
            let _ = write!(stream, "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
        }
    });

    if mode == "grandchild" || mode == "grandchild-ignore" {
        let exe = std::env::current_exe().unwrap();
        let child = Command::new(exe).arg("sleeper").stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().expect("spawn grandchild");
        println!("grandchild-pid {}", child.id());
    }
    println!("pid {}", std::process::id());
    println!("horizon-desktop-ready {{\"url\":\"http://127.0.0.1:{port}\",\"code\":\"ABCD-2345\",\"pid\":{}}}", std::process::id());
    let _ = std::io::stdout().flush();

    if mode == "crash" {
        thread::sleep(Duration::from_millis(300));
        eprintln!("fatal: store is locked");
        exit(3);
    }
    if mode == "ignore-stdin" || mode == "grandchild-ignore" {
        thread::sleep(Duration::from_secs(600));
        return;
    }
    // The real sidecar's behaviour: leave when stdin closes.
    let mut sink = [0u8; 64];
    let mut stdin = std::io::stdin();
    while matches!(stdin.read(&mut sink), Ok(n) if n > 0) {}
    exit(0);
}

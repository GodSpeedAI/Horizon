#!/usr/bin/env python3
"""Install / uninstall qualification of the Horizon desktop bundles on THIS host (WP-67). Standard library only.

  python3 scripts/qualify-desktop.py --platform <id> --dist <artifact-dir> --commit <sha> --out <record.json>
                                     [--runner-image <name>]

<artifact-dir> is a downloaded `horizon-unqualified-<platform>` artifact (the bundles plus SHA256SUMS). CI runs this on a
clean hosted runner; an operator runs the same command on real hardware. It writes one JSON record: every step is PASS,
FAIL or NOT_RUN with a reason and evidence, and the platform is QUALIFIED only when every required step (see
scripts/qualification-platforms.json) PASSed. It never marks a step PASS that it did not run.

Root: the Linux .deb steps need root. This script never prompts and never calls a bare `sudo`. It runs as root, or uses
`sudo -n` (passwordless, as on hosted runners). Otherwise the .deb install is recorded NOT_RUN and the exact commands are
printed: run them yourself, or re-run this script as `sudo python3 scripts/qualify-desktop.py ...`.

The installed-smoke step runs scripts/smoke-sidecar.ts (needs `bun`) against the INSTALLED server and resources.
"""
import argparse
import datetime
import glob
import gzip
import hashlib
import json
import os
import platform as plat
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request

SCHEMA = "horizon.qualification/1"
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PLATFORMS_FILE = os.path.join(HERE, "qualification-platforms.json")
SMOKE = os.path.join(HERE, "smoke-sidecar.ts")
WIN = os.name == "nt"
SERVER = "horizon-server.exe" if WIN else "horizon-server"

steps = []  # {name, status, reason, evidence}
printed_commands = []


def record(name, status, reason="", evidence=None):
    steps.append({"name": name, "status": status, "reason": reason, "evidence": evidence or {}})
    print(f"[{status}] {name}" + (f": {reason}" if reason else ""), flush=True)
    return status == "PASS"


def tail(text, n=1200):
    return (text or "")[-n:]


def run(cmd, timeout=600, **kw):
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, errors="replace", **kw)
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except subprocess.TimeoutExpired:
        return 124, f"timeout after {timeout}s"
    except OSError as e:
        return 127, str(e)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# --- checksums ---------------------------------------------------------------------------------------------------------
def step_checksums(dist):
    sums = os.path.join(dist, "SHA256SUMS")
    if not os.path.isfile(sums):
        record("checksums", "FAIL", "SHA256SUMS is missing from the artifact")
        return []
    listed = {}
    for line in open(sums, encoding="utf-8"):
        parts = line.strip().split(None, 1)
        if len(parts) == 2:
            listed[parts[1].lstrip("*")] = parts[0].lower()
    artifacts, bad = [], []
    for name in sorted(os.listdir(dist)):
        if name == "SHA256SUMS" or not os.path.isfile(os.path.join(dist, name)):
            continue
        actual = sha256(os.path.join(dist, name))
        ok = listed.get(name) == actual
        artifacts.append({"name": name, "sha256": actual, "matches_sha256sums": ok})
        if not ok:
            bad.append(name)
    missing = [n for n in listed if not os.path.isfile(os.path.join(dist, n))]
    if bad or missing or not artifacts:
        record("checksums", "FAIL", f"mismatch={bad} missing={missing}", {"artifacts": artifacts})
    else:
        record("checksums", "PASS", evidence={"artifacts": artifacts})
    return artifacts


# --- shared helpers ----------------------------------------------------------------------------------------------------
def find_one(roots, filename):
    for root in roots:
        for dirpath, _dirs, files in os.walk(root):
            if filename in files:
                return os.path.join(dirpath, filename)
    return None


def find_dir(roots, dirname):
    for root in roots:
        for dirpath, dirs, _files in os.walk(root):
            if dirname in dirs:
                return os.path.join(dirpath, dirname)
    return None


def smoke(name, server, resources, extra=None):
    """Run scripts/smoke-sidecar.ts against an installed server + resources."""
    if not (server and os.path.isfile(server)):
        return record(name, "FAIL", "installed horizon-server not found", extra)
    if not (resources and os.path.isdir(resources)):
        return record(name, "FAIL", "installed horizon-resources not found", extra)
    if not shutil.which("bun"):
        return record(name, "NOT_RUN", "bun is not installed on this host (needed by scripts/smoke-sidecar.ts)", extra)
    code, out = run(["bun", "run", SMOKE, server, resources], timeout=300, cwd=ROOT)
    ev = dict(extra or {}, server=server, resources=resources, output_tail=tail(out))
    if code == 0 and "SMOKE PASS" in out:
        return record(name, "PASS", evidence=ev)
    return record(name, "FAIL", f"smoke exit {code}", ev)


def remains(paths):
    """Existing paths under the given list, with a bounded listing for the evidence."""
    left = []
    for p in paths:
        if p and os.path.exists(p):
            if os.path.isdir(p):
                for dirpath, _d, files in os.walk(p):
                    left.extend(os.path.join(dirpath, f) for f in files)
                    if len(left) > 50:
                        break
                if not left:
                    left.append(p + "  (empty directory)")
            else:
                left.append(p)
    return left[:50]


def user_data_dirs():
    home = os.path.expanduser("~")
    cands = [
        os.path.join(os.environ.get("APPDATA", ""), "ai.godspeed.horizon"),
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "ai.godspeed.horizon"),
        os.path.join(home, ".local", "share", "ai.godspeed.horizon"),
        os.path.join(home, ".config", "ai.godspeed.horizon"),
        os.path.join(home, ".cache", "ai.godspeed.horizon"),
        os.path.join(home, "Library", "Application Support", "ai.godspeed.horizon"),
    ]
    return [c for c in cands if c and os.path.exists(c)]


def uninstall_verdict(name, install_roots, server_name, reason_prefix=""):
    """After uninstalling: the server binary is gone and nothing remains under the install path."""
    left = remains(install_roots)
    still = [p for p in left if os.path.basename(p) in (server_name, "horizon-server.gz", "horizon-server.exe")]
    ev = {"left_under_install_path": left, "user_data_remaining": user_data_dirs()}
    if still or left:
        return record(name, "FAIL", f"{reason_prefix}files remain under the install path", ev)
    return record(name, "PASS", evidence=ev)


# --- linux -------------------------------------------------------------------------------------------------------------
def root_prefix():
    if hasattr(os, "geteuid") and os.geteuid() == 0:
        return []
    if shutil.which("sudo") and subprocess.run(["sudo", "-n", "true"], capture_output=True).returncode == 0:
        return ["sudo", "-n"]
    return None


def deb_name(deb):
    code, out = run(["dpkg-deb", "-f", deb, "Package"])
    return out.strip() if code == 0 else None


def linux_deb_steps(dist):
    debs = sorted(glob.glob(os.path.join(dist, "*.deb")))
    if not debs:
        for n in ("deb_install", "deb_installed_smoke", "deb_installed_gui", "deb_uninstall"):
            record(n, "FAIL", "no .deb in the artifact")
        return
    deb = os.path.abspath(debs[0])
    pkg = deb_name(deb) or "horizon"
    prefix = root_prefix()
    install_cmd = f"apt-get install -y {deb}"
    remove_cmd = f"apt-get remove -y {pkg}"
    if prefix is None:
        why = "needs root and this host has no passwordless sudo; this script never prompts for a password"
        print("\nRoot is needed for the .deb steps. The commands that need it are:\n"
              f"  sudo {install_cmd}\n  sudo {remove_cmd}\n"
              "To qualify the .deb, run the whole script as root yourself: sudo python3 scripts/qualify-desktop.py ... "
              "(bun must be on root's PATH, e.g. sudo env \"PATH=$PATH\" python3 ...).\n", flush=True)
        printed_commands.extend([f"sudo {install_cmd}", f"sudo {remove_cmd}"])
        for n in ("deb_install", "deb_installed_smoke", "deb_installed_gui", "deb_uninstall"):
            record(n, "NOT_RUN", why)
        return

    env = dict(os.environ, DEBIAN_FRONTEND="noninteractive")
    code, out = run(prefix + ["apt-get", "install", "-y", deb], timeout=900, env=env)
    if code != 0:
        record("deb_install", "FAIL", f"apt-get install exit {code}", {"output_tail": tail(out)})
        for n in ("deb_installed_smoke", "deb_installed_gui", "deb_uninstall"):
            record(n, "NOT_RUN", "the install failed")
        return
    code, listing = run(["dpkg", "-L", pkg])
    files = [l for l in listing.splitlines() if l.startswith("/")]
    packed = next((f for f in files if f.endswith("/horizon-server.gz")), None)
    res_dir = next((f for f in files if f.endswith("/horizon-resources") and os.path.isdir(f)), None)
    exe = next((f for f in files if f.startswith("/usr/bin/") and os.path.isfile(f)), None)
    if not (packed and res_dir and exe):
        record("deb_install", "FAIL", "package installed but the app, server archive or resources are not where expected",
               {"packed_server": packed, "resources": res_dir, "executable": exe, "files_head": files[:40]})
        installed_ok = False
    else:
        record("deb_install", "PASS", evidence={"package": pkg, "executable": exe, "packed_server": packed, "resources": res_dir, "file_count": len(files)})
        installed_ok = True

    if installed_ok:
        # The app unpacks horizon-server.gz into its data folder on first run; do the same for the smoke, from the installed file.
        scratch = tempfile.mkdtemp(prefix="horizon-qual-server-")
        server = os.path.join(scratch, "horizon-server")
        with gzip.open(packed, "rb") as src, open(server, "wb") as dst:
            shutil.copyfileobj(src, dst)
        os.chmod(server, 0o755)
        smoke("deb_installed_smoke", server, res_dir, {"server_origin": f"gunzip of installed {packed}"})
        shutil.rmtree(scratch, ignore_errors=True)
        linux_gui(exe)
    else:
        record("deb_installed_smoke", "NOT_RUN", "install did not produce the expected files")
        record("deb_installed_gui", "NOT_RUN", "install did not produce the expected files")

    code, out = run(prefix + ["apt-get", "remove", "-y", pkg], timeout=300, env=env)
    if code != 0:
        record("deb_uninstall", "FAIL", f"apt-get remove exit {code}", {"output_tail": tail(out)})
        return
    uninstall_verdict("deb_uninstall", [os.path.dirname(res_dir) if res_dir else "", exe or ""], "horizon-server")


def listening_ports(pid_names):
    """Loopback listen ports owned by processes whose command name starts with one of pid_names (via ss)."""
    code, out = run(["ss", "-ltnpH"])
    ports = []
    if code != 0:
        return None
    for line in out.splitlines():
        if any(f'("{n}' in line for n in pid_names):
            local = line.split()[3]
            ports.append(local.rsplit(":", 1)[1])
    return ports


def linux_gui(exe):
    if not shutil.which("xvfb-run"):
        return record("deb_installed_gui", "NOT_RUN", "xvfb-run is not installed (apt install xvfb)")
    if not shutil.which("ss"):
        return record("deb_installed_gui", "NOT_RUN", "ss is not available to find the supervised server's port")
    home = tempfile.mkdtemp(prefix="horizon-qual-home-")
    env = dict(os.environ, HOME=home, XDG_DATA_HOME=os.path.join(home, "data"), XDG_CONFIG_HOME=os.path.join(home, "config"),
               XDG_CACHE_HOME=os.path.join(home, "cache"), WEBKIT_DISABLE_COMPOSITING_MODE="1", WEBKIT_DISABLE_DMABUF_RENDERER="1")
    for k in ("HORIZON_SERVER_BIN", "HORIZON_RESOURCE_ROOT", "HORIZON_DATA_DIR"):
        env.pop(k, None)
    proc = subprocess.Popen(["xvfb-run", "-a", exe], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, start_new_session=True)
    health, ports = None, []
    deadline = time.time() + 90
    while time.time() < deadline and proc.poll() is None:
        found = listening_ports(["horizon-server"])
        if found:
            ports = found
            for port in found:
                try:
                    with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=5) as r:
                        health = r.status
                except Exception:  # noqa: BLE001 - keep polling until the deadline
                    health = None
                if health == 200:
                    break
            if health == 200:
                break
        time.sleep(2)
    exited_early = proc.poll() is not None
    # Stop the app the way a user closing it would: SIGTERM to the whole group, then require the server to be gone.
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except OSError:
        pass
    try:
        proc.wait(timeout=30)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGKILL)
    time.sleep(2)
    out = tail(proc.stdout.read() if proc.stdout else "")
    leftover = listening_ports(["horizon-server"]) or []
    ev = {"ports": ports, "health_status": health, "app_exited_before_health": exited_early, "log_tail": out, "server_still_listening_after_stop": leftover}
    shutil.rmtree(home, ignore_errors=True)
    if health != 200:
        return record("deb_installed_gui", "FAIL", "the installed app's supervised server did not answer /health 200", ev)
    if leftover:
        return record("deb_installed_gui", "FAIL", "the supervised server outlived the app", ev)
    return record("deb_installed_gui", "PASS", evidence=ev)


def linux_appimage_steps(dist):
    imgs = sorted(glob.glob(os.path.join(dist, "*.AppImage")))
    if not imgs:
        record("appimage_extract", "FAIL", "no AppImage in the artifact")
        record("appimage_extracted_smoke", "NOT_RUN", "no AppImage")
        return
    work = tempfile.mkdtemp(prefix="horizon-qual-appimage-")
    img = os.path.join(work, "Horizon.AppImage")
    shutil.copy(imgs[0], img)
    os.chmod(img, 0o755)
    code, out = run([img, "--appimage-extract"], timeout=300, cwd=work)
    root = os.path.join(work, "squashfs-root")
    packed = find_one([root], "horizon-server.gz") if code == 0 else None
    res = find_dir([root], "horizon-resources") if code == 0 else None
    exe = find_one([os.path.join(root, "usr", "bin")], "horizon") if code == 0 else None
    ev = {"packed_server": packed, "resources": res, "executable": exe, "output_tail": tail(out, 400)}
    if code != 0 or not (packed and res):
        record("appimage_extract", "FAIL", f"extract exit {code} or contents missing", ev)
        record("appimage_extracted_smoke", "NOT_RUN", "extraction failed")
    else:
        record("appimage_extract", "PASS", evidence=ev)
        server = os.path.join(work, "horizon-server")
        with gzip.open(packed, "rb") as src, open(server, "wb") as dst:
            shutil.copyfileobj(src, dst)
        os.chmod(server, 0o755)
        smoke("appimage_extracted_smoke", server, res, {"server_origin": "gunzip of the extracted AppImage's server archive"})
    shutil.rmtree(work, ignore_errors=True)


# --- windows -----------------------------------------------------------------------------------------------------------
def windows_steps(dist):
    pf = [os.environ.get("ProgramFiles", r"C:\Program Files")]
    local = [os.path.join(os.environ.get("LOCALAPPDATA", ""), "Horizon"), os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs")]
    msis = sorted(glob.glob(os.path.join(dist, "*.msi")))
    exes = sorted(glob.glob(os.path.join(dist, "*.exe")))
    work = tempfile.mkdtemp(prefix="horizon-qual-")

    # MSI
    if not msis:
        for n in ("msi_install", "msi_installed_smoke", "msi_uninstall"):
            record(n, "FAIL", "no .msi in the artifact")
    else:
        msi = os.path.abspath(msis[0])
        log = os.path.join(work, "msi-install.log")
        code, out = run(["msiexec", "/i", msi, "/qn", "/norestart", "/l*v", log], timeout=900)
        server = find_one([os.path.join(p, "Horizon") for p in pf], SERVER)
        res = find_dir([os.path.join(p, "Horizon") for p in pf], "horizon-resources")
        ok = code == 0 and server and res
        record("msi_install", "PASS" if ok else "FAIL", "" if ok else f"msiexec exit {code}; server={server} resources={res}",
               {"server": server, "resources": res, "msiexec_exit": code, "log_tail": tail(open(log, errors="replace").read() if os.path.exists(log) else out)})
        if ok:
            smoke("msi_installed_smoke", server, res)
        else:
            record("msi_installed_smoke", "NOT_RUN", "install failed")
        code, out = run(["msiexec", "/x", msi, "/qn", "/norestart", "/l*v", os.path.join(work, "msi-uninstall.log")], timeout=900)
        if code != 0:
            record("msi_uninstall", "FAIL", f"msiexec /x exit {code}", {"output_tail": tail(out)})
        else:
            uninstall_verdict("msi_uninstall", [os.path.join(p, "Horizon") for p in pf], SERVER)

    # NSIS (per-user install; Tauri's default)
    setups = [e for e in exes if "setup" in os.path.basename(e).lower()] or exes
    if not setups:
        for n in ("nsis_install", "nsis_installed_smoke", "nsis_uninstall"):
            record(n, "FAIL", "no NSIS setup .exe in the artifact")
    else:
        code, out = run([os.path.abspath(setups[0]), "/S"], timeout=900)
        roots = [r for r in local if r]
        server = find_one(roots, SERVER)
        res = find_dir(roots, "horizon-resources")
        ok = code == 0 and server and res
        record("nsis_install", "PASS" if ok else "FAIL", "" if ok else f"setup exit {code}; server={server} resources={res}",
               {"server": server, "resources": res, "setup_exit": code, "output_tail": tail(out)})
        if ok:
            smoke("nsis_installed_smoke", server, res)
            install_dir = os.path.dirname(server)
            unins = os.path.join(install_dir, "uninstall.exe")
            if not os.path.isfile(unins):
                record("nsis_uninstall", "FAIL", f"no uninstall.exe in {install_dir}")
            else:
                # The NSIS uninstaller copies itself to %TEMP% and returns at once, so poll for the files to go.
                run([unins, "/S"], timeout=300)
                deadline = time.time() + 120
                while time.time() < deadline and os.path.exists(os.path.join(install_dir, SERVER)):
                    time.sleep(2)
                time.sleep(3)
                uninstall_verdict("nsis_uninstall", [install_dir], SERVER)
        else:
            record("nsis_installed_smoke", "NOT_RUN", "install failed")
            record("nsis_uninstall", "NOT_RUN", "install failed")
    shutil.rmtree(work, ignore_errors=True)


# --- macOS -------------------------------------------------------------------------------------------------------------
def macos_steps(dist):
    dmgs = sorted(glob.glob(os.path.join(dist, "*.dmg")))
    work = tempfile.mkdtemp(prefix="horizon-qual-")
    apps_dir = os.path.join(work, "Applications")  # a temporary Applications folder: no root, nothing system-wide changes
    os.makedirs(apps_dir)
    if not dmgs:
        for n in ("dmg_install", "app_installed_smoke", "app_uninstall"):
            record(n, "FAIL", "no .dmg in the artifact")
        return
    mount = os.path.join(work, "mnt")
    os.makedirs(mount)
    code, out = run(["hdiutil", "attach", "-nobrowse", "-readonly", "-mountpoint", mount, os.path.abspath(dmgs[0])], timeout=300)
    app_src = next(iter(glob.glob(os.path.join(mount, "*.app"))), None) if code == 0 else None
    installed = None
    if app_src:
        installed = os.path.join(apps_dir, os.path.basename(app_src))
        code2, out2 = run(["ditto", app_src, installed])
        code = code2
        out += out2
    run(["hdiutil", "detach", mount, "-force"], timeout=120)
    server = os.path.join(installed, "Contents", "MacOS", SERVER) if installed else None
    res = os.path.join(installed, "Contents", "Resources", "horizon-resources") if installed else None
    ok = code == 0 and server and os.path.isfile(server) and os.path.isdir(res)
    sig_code, sig = run(["codesign", "--verify", "--deep", "--strict", installed]) if installed else (1, "")
    record("dmg_install", "PASS" if ok else "FAIL", "" if ok else f"mount/copy exit {code}; server={server}",
           {"installed_app": installed, "install_root": apps_dir, "codesign_verify_exit": sig_code, "codesign_note": tail(sig, 300)})
    if ok:
        smoke("app_installed_smoke", server, res)
        shutil.rmtree(installed, ignore_errors=True)
        uninstall_verdict("app_uninstall", [installed], SERVER)
    else:
        record("app_installed_smoke", "NOT_RUN", "install failed")
        record("app_uninstall", "NOT_RUN", "install failed")
    record("app_installed_gui", "NOT_RUN", "launching the GUI headlessly on a hosted macOS runner is not attempted; the sidecar smoke covers the server")
    shutil.rmtree(work, ignore_errors=True)


# --- record ------------------------------------------------------------------------------------------------------------
def verdict(platform_cfg):
    required = platform_cfg.get("required_steps", [])
    by = {s["name"]: s["status"] for s in steps}
    if any(s["status"] == "FAIL" for s in steps):
        return "NOT QUALIFIED"
    if all(by.get(r) == "PASS" for r in required):
        return "QUALIFIED"
    return "PARTIAL"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--platform", required=True)
    ap.add_argument("--dist", required=True)
    ap.add_argument("--commit", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--runner-image", default="")
    a = ap.parse_args()

    cfg = {p["id"]: p for p in json.load(open(PLATFORMS_FILE))["platforms"]}
    if a.platform not in cfg:
        sys.exit(f"unknown platform {a.platform}; known: {sorted(cfg)}")
    if a.platform.endswith("-jetson") and not os.path.exists("/etc/nv_tegra_release"):
        sys.exit("linux-arm64-jetson is accepted only on a Jetson (L4T) host: /etc/nv_tegra_release is missing")
    dist = os.path.abspath(a.dist)

    artifacts = step_checksums(dist)
    kind = cfg[a.platform]["family"]
    if kind == "linux":
        linux_deb_steps(dist)
        linux_appimage_steps(dist)
    elif kind == "windows":
        windows_steps(dist)
    else:
        macos_steps(dist)
    record("upgrade", "NOT_RUN", "no previous release exists to upgrade from")

    rec = {
        "schema": SCHEMA,
        "platform": a.platform,
        "status": verdict(cfg[a.platform]),
        "required_steps": cfg[a.platform].get("required_steps", []),
        "commit": a.commit,
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "host": {"system": plat.system(), "release": plat.release(), "machine": plat.machine(), "runner_image": a.runner_image,
                 "real_hardware": a.platform.endswith("-jetson")},
        "artifacts": artifacts,
        "steps": steps,
        "commands_needing_root": printed_commands,
    }
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(rec, f, indent=2)
    print(f"\n{a.platform}: {rec['status']}  ->  {a.out}")
    # CI gate: a FAIL is a red job. NOT_RUN steps are recorded honestly in the record and do not fail the script.
    sys.exit(1 if any(s["status"] == "FAIL" for s in steps) else 0)


if __name__ == "__main__":
    main()

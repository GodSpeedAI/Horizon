#!/usr/bin/env python3
"""Portable SXR executable resolution for generated substrates.

Resolution order (fail-closed):
  1. $SXR_BIN environment variable
  2. project-local `.config/sxr-resolve.json` (git-ignored developer override);
     searched from cwd upward to the filesystem root. File shape:
     {"executable": "/absolute/path/to/sxr"}
  3. `sxr` on PATH

Usage:
  sxr-resolve.py --report            print JSON resolution report to stdout
  sxr-resolve.py <args...>           resolve then exec sxr with <args>,
                                     passing through sxr's exit code

Never reachable: importing this script into generated software. This is CLI-only
plumbing for `just` recipes. No machine-specific path is hardcoded here.
"""

import json
import os
import shutil
import sys


def find_config():
    """Walk from cwd upward looking for .config/sxr-resolve.json."""
    cur = os.path.abspath(os.getcwd())
    while True:
        candidate = os.path.join(cur, ".config", "sxr-resolve.json")
        if os.path.isfile(candidate):
            return candidate
        parent = os.path.dirname(cur)
        if parent == cur:
            return None
        cur = parent


def resolve():
    from_env = os.environ.get("SXR_BIN")
    if from_env and os.path.isfile(from_env) and os.access(from_env, os.X_OK):
        return {"executable": from_env, "source": "env:SXR_BIN"}

    config_path = find_config()
    if config_path:
        try:
            with open(config_path, "r", encoding="utf-8") as fh:
                cfg = json.load(fh)
            exe = cfg.get("executable")
            if exe and os.path.isfile(exe) and os.access(exe, os.X_OK):
                return {"executable": exe, "source": f"config:{config_path}"}
        except (OSError, ValueError):
            pass

    on_path = shutil.which("sxr")
    if on_path:
        return {"executable": on_path, "source": "PATH"}

    return None


def report(entry):
    if entry:
        return {
            "resolved": True,
            "executable": entry["executable"],
            "source": entry["source"],
        }
    return {
        "resolved": False,
        "executable": None,
        "source": None,
        "diagnostic": (
            "sxr not found. Resolution tried, in order: "
            "$SXR_BIN; .config/sxr-resolve.json (searched from cwd upward); "
            "`sxr` on PATH. Install sxr or set SXR_BIN / local config."
        ),
    }


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--report":
        print(json.dumps(report(resolve()), indent=2))
        return 0 if resolve() else 2

    entry = resolve()
    if not entry:
        sys.stderr.write("\n".join(report(None)["diagnostic"].split("; ")) + "\n")
        return 2

    import subprocess

    proc = subprocess.run([entry["executable"], *sys.argv[1:]], check=False)
    return proc.returncode


if __name__ == "__main__":
    sys.exit(main())